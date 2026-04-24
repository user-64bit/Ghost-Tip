import { NextRequest, NextResponse } from "next/server";
// fail() is not used here — OAuth errors always redirect back to the claim page
// with an ?error=CODE query string, handled by the ClaimFlow UI.
import { redis } from "../../../../lib/server/redis";
import { prisma } from "../../../../lib/server/prisma";
import {
  hashClaimToken,
  randomSessionToken,
} from "../../../../lib/server/crypto";
import { emitAuditEvent } from "../../../../lib/server/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OAuthStateEntry {
  token: string;
  verifier: string;
  intendedHandle: string;
  intendedType: string;
}

/**
 * X OAuth callback. On success, verifies the returned username matches the
 * claim's intended handle, writes a short-lived claim session to Redis, and
 * redirects back to the claim page with a session token.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const bypass = url.searchParams.get("bypass") === "1";

  const stateRaw = await redis.get(`oauth_state:${state}`);
  if (!stateRaw) {
    return redirectWithError(req, "", "OAUTH_STATE_INVALID");
  }
  let stateEntry: OAuthStateEntry;
  try {
    stateEntry = JSON.parse(stateRaw) as OAuthStateEntry;
  } catch {
    return redirectWithError(req, "", "OAUTH_STATE_INVALID");
  }
  await redis.del(`oauth_state:${state}`);

  const { token, intendedHandle, verifier } = stateEntry;

  // Verify the claim still exists & isn't already claimed.
  const hash = hashClaimToken(token);
  const claim = await prisma.claimLink.findUnique({
    where: { secretTokenHash: hash },
  });
  if (!claim) return redirectWithError(req, token, "CLAIM_TOKEN_INVALID");
  if (claim.claimedAt)
    return redirectWithError(req, token, "TIP_ALREADY_CLAIMED");
  if (claim.revokedAt)
    return redirectWithError(req, token, "CLAIM_TOKEN_INVALID");

  let verifiedHandle: string;

  if (bypass && process.env.NEXT_PUBLIC_OAUTH_BYPASS === "true") {
    // Dev bypass: trust the claim's intended handle. This is ONLY for demos
    // where Twitter API creds aren't wired up.
    verifiedHandle = intendedHandle;
    await emitAuditEvent({
      actor: `oauth_bypass`,
      eventType: "oauth_verified",
      metadata: { bypass: true, intendedHandle },
    });
  } else {
    if (!code) return redirectWithError(req, token, "OAUTH_FAILED");

    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    if (!clientId) return redirectWithError(req, token, "OAUTH_FAILED");

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? url.origin;
    const redirectUri = `${appUrl}/api/auth/x/callback`;

    try {
      const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
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
        console.error("x oauth token exchange failed", await tokenRes.text());
        return redirectWithError(req, token, "OAUTH_FAILED");
      }
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      const accessToken = tokenJson.access_token;
      if (!accessToken) return redirectWithError(req, token, "OAUTH_FAILED");

      const meRes = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!meRes.ok) {
        console.error("x oauth me failed", await meRes.text());
        return redirectWithError(req, token, "OAUTH_FAILED");
      }
      const meJson = (await meRes.json()) as {
        data?: { username?: string };
      };
      verifiedHandle = (meJson.data?.username ?? "").toLowerCase();
    } catch (err) {
      console.error("x oauth error", err);
      return redirectWithError(req, token, "OAUTH_FAILED");
    }
  }

  if (verifiedHandle.toLowerCase() !== intendedHandle.toLowerCase()) {
    await emitAuditEvent({
      actor: `x:${verifiedHandle}`,
      eventType: "oauth_failed",
      metadata: { verified: verifiedHandle, intended: intendedHandle },
    });
    return redirectWithError(req, token, "OAUTH_MISMATCH");
  }

  // Mint a claim session — 30 min TTL per spec §16.
  const session = randomSessionToken();
  await redis.setex(
    `claim_session:${session}`,
    60 * 30,
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

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? url.origin;
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
