// Munshot Dashboard SDK client.
//
// ONE module-scoped client is created at import time so its message listener is
// live before the host's `host:init` arrives.
//
// `window.MunshotDashboardSDK` is a NAMESPACE, not the client. We initialize via
// `createDashboardClientSdk ?? createClient`. When the SDK global is absent
// (local standalone dev), we fall back to a faithful NO-OP client with the same
// method signatures so the app behaves identically.
//
// The host owns auth. We only ever READ the token; we never create a login page,
// store credentials, or embed secrets in the client.

/** The normalized client surface the rest of the app depends on. */
export interface DashboardClientSdk {
  getContext(): unknown;
  onMessage(cb: (message?: unknown) => void): () => void;
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

/** Faithful no-op client for local standalone dev (SDK global absent). */
function createNoopClient(): DashboardClientSdk {
  const listeners = new Set<(message?: unknown) => void>();
  return {
    getContext: () => null,
    onMessage: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    ready: noop,
    requestContext: noop,
    publish: noop,
    request: async () => null,
    onRequest: noop,
    sendError: noop,
    destroy: () => listeners.clear(),
  };
}

/** Adapt the real SDK client into our normalized surface, guarding each method. */
function adaptRealClient(client: Record<string, unknown>): DashboardClientSdk {
  const call = (name: string, ...args: unknown[]): unknown => {
    const fn = client[name];
    return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown)(...args) : undefined;
  };

  return {
    getContext: () => call("getContext") ?? null,
    onMessage: (cb) => {
      const unsub =
        typeof client.onMessage === "function"
          ? call("onMessage", cb)
          : typeof client.on === "function"
            ? call("on", "message", cb)
            : undefined;
      return typeof unsub === "function" ? (unsub as () => void) : noop;
    },
    ready: () => void call("ready"),
    requestContext: () => void call("requestContext"),
    publish: (topic, payload) => void call("publish", topic, payload),
    request: async (topic, payload) => {
      const result = call("request", topic, payload);
      return result instanceof Promise ? result : (result ?? null);
    },
    onRequest: (topic, handler) => void call("onRequest", topic, handler),
    sendError: (error) => void call("sendError", error),
    destroy: () => void call("destroy"),
  };
}

function createSdkClient(): DashboardClientSdk {
  const lib = (globalThis as { MunshotDashboardSDK?: SdkNamespace }).MunshotDashboardSDK;
  const factory = lib?.createDashboardClientSdk ?? lib?.createClient;
  if (typeof factory !== "function") {
    return createNoopClient();
  }
  try {
    const client = factory(DASHBOARD_META);
    if (client && typeof client === "object") {
      return adaptRealClient(client as Record<string, unknown>);
    }
  } catch {
    // Fall through to the no-op client on any initialization failure.
  }
  return createNoopClient();
}

/** The single, module-scoped SDK client for the whole app. */
export const sdk: DashboardClientSdk = createSdkClient();
