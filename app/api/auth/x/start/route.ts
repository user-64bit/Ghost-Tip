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

const TWITTER_AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_OAUTH_SCOPES = "tweet.read users.read";

/**
 * Start an X OAuth 2.0 PKCE flow.
 *
 * The `token` query param is the raw claim token from the URL — we bind
 * state→token in Redis (10-min TTL) so the callback knows which claim is
 * being verified. Real Twitter OAuth is the only supported path; there is
 * no bypass. If `TWITTER_CLIENT_ID` isn't set, the request fails loudly.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(token))
    return fail("CLAIM_TOKEN_INVALID", undefined, 400);

  const clientId = process.env.TWITTER_CLIENT_ID;
  if (!clientId) {
    console.error(
      "[x-oauth] TWITTER_CLIENT_ID missing — claim verification will always fail"
    );
    return fail(
      "OAUTH_FAILED",
      "X OAuth isn't configured on the server. Set TWITTER_CLIENT_ID (and TWITTER_CLIENT_SECRET for confidential clients).",
      500
    );
  }

  const claim = await prisma.claimLink.findUnique({
    where: { secretTokenHash: hashClaimToken(token) },
  });
  if (!claim) return fail("CLAIM_TOKEN_INVALID", undefined, 404);
  if (claim.revokedAt)
    return fail("CLAIM_TOKEN_INVALID", "This link was revoked", 410);
  if (claim.claimedAt)
    return fail("TIP_ALREADY_CLAIMED", undefined, 410);

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

  const authorize = new URL(TWITTER_AUTHORIZE_URL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("scope", TWITTER_OAUTH_SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authorize.toString());
}
