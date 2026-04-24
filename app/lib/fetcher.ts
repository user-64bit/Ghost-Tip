import type { ApiResponse, ErrorCode } from "../types/tip";

/**
 * Shared SWR fetcher that tolerates non-JSON error responses.
 *
 * Without this, an empty-body HTTP 500 (which happens when a route throws
 * before getting to return a JSON envelope — e.g. a Prisma connection
 * failure) crashes the UI with "Unexpected end of JSON input" because
 * `Response.json()` rejects on empty bodies.
 */

export class ApiCallError extends Error {
  code: ErrorCode | "HTTP_ERROR" | "INVALID_JSON";
  status: number;
  constructor(
    code: ApiCallError["code"],
    message: string,
    status: number
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function fetchJson<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();

  if (!text) {
    throw new ApiCallError(
      "HTTP_ERROR",
      res.ok
        ? "Server returned an empty response."
        : `Server error (HTTP ${res.status}). Check server logs — the request didn't emit a JSON body.`,
      res.status
    );
  }

  let json: ApiResponse<T>;
  try {
    json = JSON.parse(text) as ApiResponse<T>;
  } catch {
    // Probably an HTML error page or raw stack trace. Surface the status.
    throw new ApiCallError(
      "INVALID_JSON",
      `HTTP ${res.status} — ${text.slice(0, 160)}`,
      res.status
    );
  }

  if (!("success" in json)) {
    throw new ApiCallError(
      "INVALID_JSON",
      `HTTP ${res.status} — response didn't match API envelope.`,
      res.status
    );
  }

  if (!json.success) {
    throw new ApiCallError(
      json.error.code as ErrorCode,
      json.error.message,
      res.status
    );
  }

  return json.data;
}
