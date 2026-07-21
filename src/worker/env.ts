// Worker runtime bindings.
//
// MUNS_ACCESS_TOKEN is a Cloudflare SECRET set via:
//   wrangler secret put MUNS_ACCESS_TOKEN
// It is NEVER committed and NEVER exposed to the browser.
export interface Env {
  /** Static Assets binding (serves the built SPA from ./dist/client). */
  ASSETS: Fetcher;
  /** Bearer token for the upstream Munshot stock API (secret, optional at runtime). */
  MUNS_ACCESS_TOKEN?: string;
}
