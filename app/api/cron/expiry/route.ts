import { NextRequest } from "next/server";
import { fail, ok } from "../../../lib/server/api";
import { runExpiryJob } from "../../../../jobs/expiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron-compatible endpoint. Secure by checking the secret header or
 * Vercel's built-in `x-vercel-cron` signal.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? "";
  const viaVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (!viaVercelCron) {
    const expected = process.env.CRON_SECRET;
    if (!expected || secret !== expected)
      return fail("UNAUTHORIZED", undefined, 401);
  }

  const result = await runExpiryJob();
  return ok(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
