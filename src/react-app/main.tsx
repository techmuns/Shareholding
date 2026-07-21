import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// GUARANTEE MOUNT: render unconditionally and first. Nothing here awaits the SDK,
// host context, or `host:init` — the UI always paints; the SDK is a best-effort
// side channel (see lib/sdk.ts). An error boundary keeps a child throw from
// yielding a blank page, and a last-resort catch handles a catastrophic failure.
const rootEl = document.getElementById("root");

if (rootEl) {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (err) {
    // React render itself failed synchronously — show a minimal recoverable UI.
    console.error("Fatal render error:", err);
    rootEl.textContent = "";
    const box = document.createElement("div");
    box.style.cssText =
      "font-family:system-ui,-apple-system,sans-serif;padding:40px;text-align:center;color:#111827;";
    box.innerHTML =
      '<h2 style="font-size:16px;margin:0 0 8px">Shareholding</h2>' +
      '<p style="font-size:13px;color:#6b7280;margin:0 0 16px">The dashboard failed to start.</p>';
    const btn = document.createElement("button");
    btn.textContent = "Reload";
    btn.style.cssText =
      "cursor:pointer;font-size:13px;font-weight:600;color:#fff;background:#4f46e5;border:1px solid #4f46e5;border-radius:8px;padding:8px 16px;";
    btn.onclick = () => window.location.reload();
    box.appendChild(btn);
    rootEl.appendChild(box);
  }
}
