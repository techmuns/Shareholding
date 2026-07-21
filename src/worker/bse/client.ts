// Shared BSE fetch helper for the Worker routes.
//
// BSE's public JSON APIs (https://api.bseindia.com/BseIndiaAPI/api/...) return
// 403/302 to server requests unless browser-like headers are sent on EVERY call.
// We fetch server-side (avoids CORS, lets us set these headers), with a per-call
// timeout via AbortController that also forwards the client's abort signal.
//
// SECURITY: never log the upstream URL bodies/responses.

export const BSE_API_BASE = "https://api.bseindia.com/BseIndiaAPI/api";

/** Browser-like headers BSE requires on every request. */
const BSE_HEADERS: Record<string, string> = {
  Referer: "https://www.bseindia.com/",
  Origin: "https://www.bseindia.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

const BSE_TIMEOUT_MS = 10_000;

/** Failure codes shared by BSE calls (subset of `BseErrorCode`). */
export type BseFetchErrorCode = "timeout" | "upstream_error" | "provider_error";

export type BseFetchResult =
  | { ok: true; text: string }
  | { ok: false; code: BseFetchErrorCode };

/**
 * GET a BSE endpoint with the required headers and a 10s timeout. Returns the
 * raw response text on success; a safe-failure code otherwise. Never throws.
 */
export async function bseFetch(
  url: string,
  clientSignal?: AbortSignal | null,
): Promise<BseFetchResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, BSE_TIMEOUT_MS);

  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: BSE_HEADERS,
      redirect: "manual", // a 302 means a bad/blocked endpoint, not a real payload
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, code: "upstream_error" };
    }
    const text = await res.text();
    return { ok: true, text };
  } catch {
    return { ok: false, code: timedOut ? "timeout" : "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON without throwing (returns null on failure). */
export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Read the client's abort signal off the incoming request, if any. */
export function clientSignalOf(raw: Request): AbortSignal | null {
  return (raw as Request & { signal?: AbortSignal }).signal ?? null;
}

/** Coerce an unknown request-body field to a trimmed string. */
export function bodyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
