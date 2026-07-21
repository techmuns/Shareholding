// Registers SDK lifecycle + capture handlers exactly once on mount.
//  - dashboard.capture.snapshot -> { context, selection, data } (data stub for now)
//  - dashboard.capture.visual   -> a native Blob of Zone 2 via html-to-image
import { useEffect, useRef } from "react";
import { toBlob } from "html-to-image";
import { sdk } from "@/lib/sdk";
import { useSelectedCompany } from "@/state/selected-company";
import type { SelectedCompany } from "@shared/types";

export function CaptureHandlers() {
  const { company } = useSelectedCompany();
  const companyRef = useRef<SelectedCompany | null>(company);
  companyRef.current = company;

  useEffect(() => {
    // Signal readiness and request the initial host context.
    sdk.ready();
    sdk.requestContext();

    // Data snapshot: reflects current selection + host context.
    sdk.onRequest("dashboard.capture.snapshot", () => ({
      context: sdk.getContext(),
      selection: companyRef.current,
      data: null,
    }));

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
    // Register once; latest selection is read via companyRef.
  }, []);

  return null;
}
