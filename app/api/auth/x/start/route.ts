import { NextRequest, NextResponse } from "next/server";
import { fail } from "../../../../lib/server/api";
import { redis } from "../../../../lib/server/redis";
import { prisma } from "../../../../lib/server/prisma";
import { hashClaimToken } from "../../../../lib/server/crypto";
import {
  generatePkceVerifier,
  pkceChallengeFromVerifier,
  randomOAuthState,
} from "../../../../lib/server/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start an X OAuth 2.0 PKCE flow. The `token` query param is the raw claim
 * token from the URL — we bind state→token in Redis so the callback knows
 * which claim is being verified.
 *
 * If NEXT_PUBLIC_OAUTH_BYPASS=true (dev only), this redirects straight to the
 * callback with a dev bypass cookie so judges can demo without X creds.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(token))
    return fail("CLAIM_TOKEN_INVALID", undefined, 400);

  const hash = hashClaimToken(token);
  const claim = await prisma.claimLink.findUnique({
    where: { secretTokenHash: hash },
  });
  if (!claim) return fail("CLAIM_TOKEN_INVALID", undefined, 404);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? url.origin;
  const callback = `${appUrl}/api/auth/x/callback`;

  const state = randomOAuthState();
  const verifier = generatePkceVerifier();
  const challenge = pkceChallengeFromVerifier(verifier);

  await redis.setex(
    `oauth_state:${state}`,
    60 * 10,
    JSON.stringify({
      token,
      verifier,
      intendedHandle: claim.intendedHandleValue,
      intendedType: claim.intendedHandleType,
    })
  );

  // Dev bypass — skip X entirely.
  if (process.env.NEXT_PUBLIC_OAUTH_BYPASS === "true") {
    const bypass = new URL(`${appUrl}/api/auth/x/callback`);
    bypass.searchParams.set("state", state);
    bypass.searchParams.set("bypass", "1");
    return NextResponse.redirect(bypass.toString());
  }

  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) {
    return fail(
      "OAUTH_FAILED",
      "Twitter OAuth is not configured. Set TWITTER_CLIENT_ID or enable NEXT_PUBLIC_OAUTH_BYPASS.",
      500
    );
  }

  const authorize = new URL("https://twitter.com/i/oauth2/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("scope", "tweet.read users.read");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authorize.toString());
}
