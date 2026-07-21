// Cloudflare Worker entrypoint — Hono API for /api/* plus SPA fallback.
import { Hono } from "hono";
import type { Env } from "./env";
import { stockSearchRoute } from "./stock/searchRoute";

const app = new Hono<{ Bindings: Env }>();

// Health check.
app.get("/api/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// Stock/company search proxy (keeps the upstream token server-side).
app.post("/api/stock/search", stockSearchRoute);

// Anything not matched above:
//  - /api/* -> JSON 404
//  - everything else -> serve the SPA via Static Assets (single-page-application)
app.notFound((c) => {
  const { pathname } = new URL(c.req.url);
  if (pathname.startsWith("/api/")) {
    return c.json({ ok: false, code: "not_found", message: "Not found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
