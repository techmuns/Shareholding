// Worker runtime bindings.
//
// MUNS_ACCESS_TOKEN is a Cloudflare SECRET set via:
//   wrangler secret put MUNS_ACCESS_TOKEN
// It is NEVER committed and NEVER exposed to the browser.
export interface Env {
  /** Static Assets binding (serves the built SPA from ./dist/client). */
  ASSETS: Fetcher;
  /** Bearer token for the upstream Munshot APIs (secret, optional at runtime). */
  MUNS_ACCESS_TOKEN?: string;
  /** Alternate name for the same Munshot bearer token (either may be set). */
  MUNS_TOKEN?: string;
  /**
   * Shared KV store for the "recently viewed companies" list (7-day TTL).
   * Global across all visitors. Optional: if unbound, the feature no-ops.
   */
  RECENT_KV?: KVNamespace;
}
