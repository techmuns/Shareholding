// Best-effort NSE fetch with a manual cookie handshake.
//
// NSE returns 401/403 to servers without a cookie handshake, and Cloudflare
// `fetch` does not manage cookies automatically. So we: (1) GET a bootstrap page
// to collect `set-cookie`, then (2) call the API forwarding those cookies plus a
// realistic desktop User-Agent / Referer.
//
// NSE also frequently blocks datacenter / Cloudflare egress IPs entirely (Akamai
// bot manager). Any failure here is a SOFT MISS — callers fall through to BSE.
//
// SECURITY: never log cookies or upstream bodies.

const NSE_ORIGIN = "https://www.nseindia.com";
const NSE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const NSE_TIMEOUT_MS = 10_000;

export type NseFetchResult = { ok: true; text: string } | { ok: false };

/** Build a `Cookie` header value from a response's set-cookie headers. */
function collectCookies(headers: Headers): string {
  const jar: string[] = [];
  // Workers exposes getSetCookie(); fall back to the combined header otherwise.
  const list =
    typeof (headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (headers as { getSetCookie: () => string[] }).getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];
  for (const raw of list) {
    const pair = raw.split(";", 1)[0]?.trim();
    if (pair && pair.includes("=")) jar.push(pair);
  }
  return jar.join("; ");
}

/**
 * Fetch NSE's corporate-insider-trading feed for a symbol. Returns the raw JSON
 * text on success, or `{ ok: false }` on any failure (blocked, timeout, non-JSON
 * bot page, etc.) so the caller can fall through to BSE.
 */
export async function fetchNseInsider(
  symbol: string,
  clientSignal?: AbortSignal | null,
): Promise<NseFetchResult> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return { ok: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NSE_TIMEOUT_MS);
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const bootstrapUrl = `${NSE_ORIGIN}/get-quotes/equity?symbol=${encodeURIComponent(sym)}`;
  try {
    // Step 1 — bootstrap page to obtain cookies.
    const boot = await fetch(bootstrapUrl, {
      method: "GET",
      headers: {
        "User-Agent": NSE_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const cookies = collectCookies(boot.headers);

    // Step 2 — the API call with cookies forwarded.
    const api = await fetch(
      `${NSE_ORIGIN}/api/corporate-insider-trading?index=equities&symbol=${encodeURIComponent(sym)}`,
      {
        method: "GET",
        headers: {
          "User-Agent": NSE_UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: bootstrapUrl,
          ...(cookies ? { Cookie: cookies } : {}),
        },
        signal: controller.signal,
      },
    );
    if (!api.ok) return { ok: false };

    const text = await api.text();
    // Guard against Akamai's HTML bot-block page masquerading as a 200.
    if (text.trimStart().startsWith("<")) return { ok: false };
    return { ok: true, text };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
