// Registers SDK lifecycle + capture handlers exactly once on mount.
//  - dashboard.capture.snapshot -> LIVE { context, selection, data } reflecting
//    whatever is currently loaded (failed/empty sections omitted).
//  - dashboard.capture.visual   -> a native Blob of Zone 2 via html-to-image.
import { useEffect, useRef } from "react";
import { toBlob } from "html-to-image";
import { sdk } from "@/lib/sdk";
import { useSelectedCompany } from "@/state/selected-company";
import { useDashboardData } from "@/state/dashboard-data";

export function CaptureHandlers() {
  const { company } = useSelectedCompany();
  const data = useDashboardData();

  // Keep a live ref the (once-registered) handler closure can read.
  const snapshotRef = useRef<() => unknown>(() => ({}));
  snapshotRef.current = () => {
    const pattern = data.patternState.status === "done" ? data.patternState.pattern : undefined;
    const holders = data.holdersState.status === "done" ? data.holdersState.holders : undefined;
    const insider = data.insiderState.status === "done" ? data.insiderState.insider : undefined;

    return {
      context: {
        ticker: company?.ticker ?? null,
        companyName:
          company?.name ?? pattern?.companyName ?? holders?.companyName ?? insider?.companyName ?? null,
        scripCode: pattern?.scripCode ?? holders?.scripCode ?? insider?.scripCode ?? null,
        quarter: pattern?.latest.qtrLabel ?? holders?.qtrLabel ?? null,
        window: insider ? { from: insider.windowFrom, to: insider.windowTo } : null,
        lastRefreshed: data.lastRefreshed,
      },
      selection: {
        holdersTab: data.holdersTab,
        insiderSort: data.insiderSort,
      },
      // Omit sections that failed or never loaded.
      data: {
        ...(pattern ? { pattern } : {}),
        ...(holders ? { holders } : {}),
        ...(insider ? { insider } : {}),
      },
    };
  };

  useEffect(() => {
    // Signal readiness and request the initial host context.
    sdk.ready();
    sdk.requestContext();

    // Live data snapshot.
    sdk.onRequest("dashboard.capture.snapshot", () => snapshotRef.current());

    // Visual snapshot of Zone 2 as a native Blob.
    sdk.onRequest("dashboard.capture.visual", async () => {
      const target =
        document.querySelector("#dashboard-main") ??
        document.querySelector("[data-dashboard-capture-root='true']") ??
        document.querySelector("main");

      if (!target) {
        throw new Error("Main content container not found for visual snapshot");
      }

      const imageBlob = await toBlob(target as HTMLElement, { pixelRatio: 2 });
      if (!imageBlob) {
        throw new Error("Visual snapshot capture returned an empty Blob");
      }

      return { visualSnapshot: imageBlob, capturedAt: new Date().toISOString() };
    });
    // Register once; latest state is read via snapshotRef.
  }, []);

  return null;
}
