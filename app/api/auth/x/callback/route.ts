import { NextRequest, NextResponse } from "next/server";
import { redis } from "../../../../lib/server/redis";
import { prisma } from "../../../../lib/server/prisma";
import {
  hashClaimToken,
  randomSessionToken,
} from "../../../../lib/server/crypto";
import { emitAuditEvent } from "../../../../lib/server/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const TWITTER_ME_URL = "https://api.twitter.com/2/users/me";
const CLAIM_SESSION_TTL_SEC = 60 * 30; // 30 min, per spec §16

interface OAuthStateEntry {
  token: string;
  verifier: string;
  intendedHandle: string;
  intendedType: string;
}

/**
 * X OAuth 2.0 PKCE callback.
 *
 * 1. Validate state parameter (Redis, single-use).
 * 2. Exchange authorization code for an access token (confidential client
 *    when TWITTER_CLIENT_SECRET is set, public client otherwise).
 * 3. Call /users/me to get the authenticated username.
 * 4. Compare to the claim's intendedHandle (case-insensitive).
 * 5. On match, mint a short-lived claim session in Redis.
 *
 * Errors always redirect back to /claim/{token}?error=CODE — the
 * ClaimFlow UI surfaces the code as a user-facing toast.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const twitterError = url.searchParams.get("error");
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    console.log("[x-oauth:callback] incoming", {
      hasState: !!state,
      hasCode: !!code,
      twitterError,
      twitterErrorDescription: url.searchParams.get("error_description"),
    });
  }

  // Twitter sometimes redirects back with ?error=access_denied when the user
  // hits "Cancel" on the consent screen. Surface that instead of the opaque
  // OAUTH_STATE_INVALID we'd otherwise emit.
  if (twitterError) {
    console.warn("[x-oauth:callback] Twitter returned error:", twitterError);
  }

  const stateRaw = await redis.get(`oauth_state:${state}`);
  if (!stateRaw) {
    console.warn("[x-oauth:callback] state not found in redis", {
      state: state ? state.slice(0, 8) + "…" : "(empty)",
    });
    return redirectWithError(req, "", "OAUTH_STATE_INVALID");
  }
  let stateEntry: OAuthStateEntry;
  try {
    stateEntry = JSON.parse(stateRaw) as OAuthStateEntry;
  } catch {
    return redirectWithError(req, "", "OAUTH_STATE_INVALID");
  }
  // Single-use: burn state immediately so replay is impossible.
  await redis.del(`oauth_state:${state}`);

  const { token, intendedHandle, verifier } = stateEntry;

  const claim = await prisma.claimLink.findUnique({
    where: { secretTokenHash: hashClaimToken(token) },
  });
  if (!claim) return redirectWithError(req, token, "CLAIM_TOKEN_INVALID");
  if (claim.claimedAt)
    return redirectWithError(req, token, "TIP_ALREADY_CLAIMED");
  if (claim.revokedAt)
    return redirectWithError(req, token, "CLAIM_TOKEN_INVALID");

  if (!code) return redirectWithError(req, token, "OAUTH_FAILED");

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId) {
    console.error("[x-oauth] TWITTER_CLIENT_ID missing at callback");
    return redirectWithError(req, token, "OAUTH_FAILED");
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? url.origin;
  const redirectUri = `${appUrl}/api/auth/x/callback`;

  let verifiedHandle: string;
  try {
    const tokenRes = await fetch(TWITTER_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Twitter's confidential-client flow uses HTTP Basic. Public
        // clients (PKCE only, no secret) send client_id in the body.
        ...(clientSecret
          ? {
              Authorization: `Basic ${Buffer.from(
                `${clientId}:${clientSecret}`
              ).toString("base64")}`,
            }
          : {}),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }).toString(),
    });
    if (!tokenRes.ok) {
      console.error(
        "[x-oauth] token exchange failed",
        tokenRes.status,
        await tokenRes.text()
      );
      return redirectWithError(req, token, "OAUTH_FAILED");
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      console.error("[x-oauth] token response missing access_token");
      return redirectWithError(req, token, "OAUTH_FAILED");
    }

    const meRes = await fetch(TWITTER_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      console.error(
        "[x-oauth] /users/me failed",
        meRes.status,
        await meRes.text()
      );
      return redirectWithError(req, token, "OAUTH_FAILED");
    }
    const meJson = (await meRes.json()) as { data?: { username?: string } };
    verifiedHandle = (meJson.data?.username ?? "").toLowerCase();
    // NOTE: access_token is deliberately discarded here — we only need it
    // for the one /users/me call. Never persisted, never returned to client.
    if (isDev) {
      console.log("[x-oauth:callback] /users/me resolved handle:", {
        verifiedHandle,
        intendedHandle: intendedHandle.toLowerCase(),
        match: verifiedHandle === intendedHandle.toLowerCase(),
      });
    }
  } catch (err) {
    console.error("[x-oauth] unexpected error during code exchange", err);
    return redirectWithError(req, token, "OAUTH_FAILED");
  }

  if (verifiedHandle !== intendedHandle.toLowerCase()) {
    await emitAuditEvent({
      actor: `x:${verifiedHandle}`,
      eventType: "oauth_failed",
      metadata: { verified: verifiedHandle, intended: intendedHandle },
    });
    return redirectWithError(req, token, "OAUTH_MISMATCH");
  }

  const session = randomSessionToken();
  await redis.setex(
    `claim_session:${session}`,
    CLAIM_SESSION_TTL_SEC,
    JSON.stringify({
      token,
      verifiedHandle,
      verifiedAt: new Date().toISOString(),
    })
  );

  await emitAuditEvent({
    actor: `x:${verifiedHandle}`,
    eventType: "oauth_verified",
    metadata: { verifiedHandle },
  });

  if (isDev) {
    console.log("[x-oauth:callback] success — redirecting back to claim page", {
      sessionPrefix: session.slice(0, 8) + "…",
      tokenPrefix: token.slice(0, 8) + "…",
    });
  }

  const back = new URL(`${appUrl}/claim/${token}`);
  back.searchParams.set("session", session);
  return NextResponse.redirect(back.toString());
}

function redirectWithError(
  req: NextRequest,
  token: string,
  code: string
): NextResponse {
  const url = new URL(req.url);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? url.origin;
  const back = token
    ? new URL(`${appUrl}/claim/${token}`)
    : new URL(`${appUrl}/`);
  back.searchParams.set("error", code);
  return NextResponse.redirect(back.toString());
}
