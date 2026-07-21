// Munshot Dashboard SDK client — a BEST-EFFORT side channel that can never block
// or crash the app.
//
// Hard rules:
//  - The real host client is attached ONLY when actually embedded (in an iframe
//    or popup). Standalone (opened at top level) always gets the no-op client and
//    the SDK factory is never invoked.
//  - The factory call AND every method are wrapped in try/catch, and calls are
//    bound to the client (`.apply`) so a throwing/broken host degrades to no-op —
//    it never propagates into React render/effects.
//  - A global window "error" guard swallows ASYNC throws from the vendored SDK's
//    own message handler so they can't blank the UI.
//  - Nothing here awaits host init or `host:init`; `ready()`/`requestContext()`
//    are called by the app AFTER first paint (in a mounted effect), not here.
//
// The host owns auth. We only ever READ the token.

/** The normalized client surface the rest of the app depends on. */
export interface DashboardClientSdk {
  getContext(): unknown;
  onMessage(cb: (message?: unknown) => void): () => void;
  onTopic(topic: string, cb: (payload?: unknown) => void): () => void;
  ready(): void;
  requestContext(): void;
  publish(topic: string, payload?: unknown): void;
  request(topic: string, payload?: unknown): Promise<unknown>;
  onRequest(
    topic: string,
    handler: (payload?: unknown) => unknown | Promise<unknown>,
  ): void;
  sendError(error: unknown): void;
  destroy(): void;
}

const DASHBOARD_META = {
  dashboardId: "shareholding",
  dashboardName: "Shareholding",
} as const;

type SdkNamespace = {
  createDashboardClientSdk?: (meta: typeof DASHBOARD_META) => unknown;
  createClient?: (meta: typeof DASHBOARD_META) => unknown;
};

const noop = (): void => {};
const noopUnsub = (): void => {};

function warn(context: string, err: unknown): void {
  try {
    console.warn(`[sdk] ${context} degraded to no-op:`, err);
  } catch {
    /* console unavailable — ignore */
  }
}

/** Are we running inside a host frame (iframe/popup)? Never throws. */
function isEmbedded(): boolean {
  try {
    return (typeof window !== "undefined" && window.parent !== window) || !!window.opener;
  } catch {
    // Cross-origin access threw — that itself means we're framed.
    return true;
  }
}

/** Faithful no-op client (standalone dev, absent/broken SDK). */
function createNoopClient(): DashboardClientSdk {
  const listeners = new Set<(message?: unknown) => void>();
  return {
    getContext: () => null,
    onMessage: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onTopic: () => noopUnsub,
    ready: noop,
    requestContext: noop,
    publish: noop,
    request: async () => null,
    onRequest: noop,
    sendError: noop,
    destroy: () => listeners.clear(),
  };
}

/**
 * Adapt the real SDK client into our normalized surface. Every call is bound to
 * the client (so `this` is preserved) and wrapped in try/catch, so a host method
 * that throws (e.g. reading `latestContext`/`sendMessage` before the handshake)
 * silently degrades instead of crashing React.
 */
function adaptRealClient(client: Record<string, unknown>): DashboardClientSdk {
  const safeCall = (name: string, ...args: unknown[]): unknown => {
    try {
      const fn = client[name];
      if (typeof fn !== "function") return undefined;
      return (fn as (...a: unknown[]) => unknown).apply(client, args);
    } catch (err) {
      warn(name, err);
      return undefined;
    }
  };

  const toUnsub = (value: unknown): (() => void) => {
    if (typeof value !== "function") return noopUnsub;
    return () => {
      try {
        (value as () => void)();
      } catch (err) {
        warn("unsubscribe", err);
      }
    };
  };

  const subscribe = (candidates: string[], ...args: unknown[]): (() => void) => {
    for (const name of candidates) {
      if (typeof client[name] === "function") {
        return toUnsub(safeCall(name, ...args));
      }
    }
    return noopUnsub;
  };

  return {
    getContext: () => safeCall("getContext") ?? null,
    onMessage: (cb) => {
      if (typeof client.onMessage === "function") return toUnsub(safeCall("onMessage", cb));
      if (typeof client.onContext === "function") return toUnsub(safeCall("onContext", cb));
      if (typeof client.on === "function") return toUnsub(safeCall("on", "message", cb));
      return noopUnsub;
    },
    onTopic: (topic, cb) => subscribe(["onTopic", "subscribe"], topic, cb),
    ready: () => void safeCall("ready"),
    requestContext: () => void safeCall("requestContext"),
    publish: (topic, payload) => void safeCall("publish", topic, payload),
    request: async (topic, payload) => {
      const result = safeCall("request", topic, payload);
      if (result instanceof Promise) return result.catch(() => null);
      return result ?? null;
    },
    onRequest: (topic, handler) => void safeCall("onRequest", topic, handler),
    sendError: (error) => void safeCall("sendError", error),
    destroy: () => void safeCall("destroy"),
  };
}

/**
 * Swallow ASYNC errors thrown by the vendored SDK's own message-event handler so
 * an uncaught throw from it can never blank the app. Scoped to the SDK script by
 * filename, so real app errors are left untouched.
 */
function installSdkErrorGuard(): void {
  try {
    if (typeof window === "undefined" || !window.addEventListener) return;
    window.addEventListener(
      "error",
      (event: ErrorEvent) => {
        const src = typeof event?.filename === "string" ? event.filename : "";
        const msg = typeof event?.message === "string" ? event.message : "";
        if (src.includes("munshot-dashboard-sdk") || /latestContext|sendMessage/.test(msg)) {
          event.preventDefault();
          warn("async host handler", event.message);
        }
      },
      true,
    );
  } catch (err) {
    warn("error guard", err);
  }
}

function createSdkClient(): DashboardClientSdk {
  try {
    installSdkErrorGuard();

    // Standalone (top-level) — never touch the real factory.
    if (!isEmbedded()) return createNoopClient();

    const lib = (globalThis as { MunshotDashboardSDK?: SdkNamespace }).MunshotDashboardSDK;
    const factory = lib?.createDashboardClientSdk ?? lib?.createClient;
    if (typeof factory !== "function") return createNoopClient();

    const client = factory(DASHBOARD_META);
    if (client && typeof client === "object") {
      return adaptRealClient(client as Record<string, unknown>);
    }
  } catch (err) {
    warn("init", err);
  }
  return createNoopClient();
}

/** The single, module-scoped SDK client. Its construction can never throw. */
export const sdk: DashboardClientSdk = createSdkClient();
