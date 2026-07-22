// Pure analytics computed on top of the raw shareholding data — the "insight
// layer" that turns Screener-style tables into the changes a user is scanning
// for. Everything here is deterministic and NEVER throws.
//
// Sources (each analytic uses the same feed the matching card already uses, so
// the headline never disagrees with the detail below it):
//   - category changes  <- BSE pattern trend   (Promoter / FII / DII / Public)
//   - promoter pledge    <- BSE promoter holders (latest quarter)
//   - holder movers      <- Munshot multi-quarter named-holder history

import type {
  IndividualHolder,
  ShareholdingCategoryBreakdown,
  ShareholdingHistory,
  ShareholdingQuarter,
} from "./types";
import { stackRemainderPct } from "./bseShareholding";

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.01; // pts below this are treated as "no change" (rounding noise)

// ---------------------------------------------------------------------------
// Category-level change (Promoter / FII / DII / Public)
// ---------------------------------------------------------------------------

export type CategoryKey = "promoter" | "fii" | "dii" | "public";

export interface CategoryChange {
  key: CategoryKey;
  label: string;
  color: string;
  latest: number; // latest quarter %
  qoq: number | null; // latest − previous quarter (pts)
  yoy: number | null; // latest − 4 quarters ago (pts)
  /** Signed run of consecutive same-direction QoQ moves (+3 = up 3 quarters). */
  streak: number;
  /** QoQ deltas across the window, oldest→newest (for a change sparkline). */
  deltas: number[];
  isHigh: boolean; // latest is the window maximum
  isLow: boolean; // latest is the window minimum
}

const CATS: {
  key: CategoryKey;
  label: string;
  color: string;
  pick: (b: ShareholdingCategoryBreakdown) => number;
}[] = [
  { key: "promoter", label: "Promoter", color: "#4f46e5", pick: (b) => b.promoterPct },
  { key: "fii", label: "FII / FPI", color: "#0d9488", pick: (b) => b.fiiPct },
  { key: "dii", label: "DII", color: "#d97706", pick: (b) => b.diiPct },
  { key: "public", label: "Public", color: "#9ca3af", pick: stackRemainderPct },
];

/** Compute per-category change metrics from the quarter trend (oldest→newest). */
export function computeCategoryChanges(trend: ShareholdingQuarter[]): CategoryChange[] {
  const n = trend.length;
  return CATS.map(({ key, label, color, pick }) => {
    const series = trend.map((q) => round2(pick(q.breakdown)));
    const latest = series[n - 1] ?? 0;
    const prev = n >= 2 ? series[n - 2] : undefined;
    const yearAgo = n >= 5 ? series[n - 5] : undefined; // 4 quarters back

    const deltas: number[] = [];
    for (let i = 1; i < n; i++) deltas.push(round2(series[i] - series[i - 1]));

    // Streak: walk deltas from the end while direction holds.
    let streak = 0;
    for (let i = deltas.length - 1; i >= 0; i--) {
      const d = deltas[i];
      if (Math.abs(d) < EPS) break;
      const dir = d > 0 ? 1 : -1;
      if (streak === 0) streak = dir;
      else if (Math.sign(streak) === dir) streak += dir;
      else break;
    }

    const max = series.length ? Math.max(...series) : 0;
    const min = series.length ? Math.min(...series) : 0;

    return {
      key,
      label,
      color,
      latest,
      qoq: prev === undefined ? null : round2(latest - prev),
      yoy: yearAgo === undefined ? null : round2(latest - yearAgo),
      streak,
      deltas,
      isHigh: n >= 4 && latest >= max - 1e-9,
      isLow: n >= 4 && latest <= min + 1e-9,
    };
  });
}

/** Sum of the last `n` QoQ deltas (the net move over a streak). */
export function netOverLast(change: CategoryChange, n: number): number {
  const d = change.deltas;
  return round2(d.slice(Math.max(0, d.length - n)).reduce((a, b) => a + b, 0));
}

// ---------------------------------------------------------------------------
// Promoter pledge (latest quarter, share-weighted)
// ---------------------------------------------------------------------------

export interface PledgeSummary {
  pledgePct: number; // % of the promoter block that is pledged/encumbered
  hasData: boolean; // false when BSE disclosed no pledge figures
}

export function computePromoterPledge(promoters: IndividualHolder[]): PledgeSummary {
  let pledgedShares = 0;
  let totalShares = 0;
  let any = false;
  for (const h of promoters) {
    totalShares += h.sharesHeld;
    if (h.pledgedPct !== undefined) {
      any = true;
      pledgedShares += h.sharesHeld * (h.pledgedPct / 100);
    }
  }
  if (!any || totalShares <= 0) return { pledgePct: 0, hasData: false };
  return { pledgePct: round2((pledgedShares / totalShares) * 100), hasData: true };
}

// ---------------------------------------------------------------------------
// Named-holder movers (from the Munshot multi-quarter history)
// ---------------------------------------------------------------------------

export type MoveKind = "up" | "down" | "new" | "exit";

export interface HolderMove {
  name: string;
  category: string; // Promoters / FIIs / DIIs / Government / Public
  delta: number; // pts change (latest − previous); signed
  latest: number | null;
  prev: number | null;
  kind: MoveKind;
}

function parseCell(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.replace(/%/g, "").replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** A truncated label (ends with … / ...) can't be reliably matched across quarters. */
function isTruncated(label: string): boolean {
  return /(\.\.\.|…)\s*$/.test(label.trim());
}

/**
 * Rank the biggest named-holder moves between the two most recent quarters.
 * `up`/`down` require the holder to be present in both quarters (exact-label
 * match); `new`/`exit` are only flagged for non-truncated names, since the feed
 * truncates long names inconsistently and would otherwise show false entries.
 */
export function computeTopMovers(history: ShareholdingHistory | undefined, limit = 4): HolderMove[] {
  if (!history || history.quarters.length < 2) return [];
  const li = history.quarters.length - 1;
  const pi = li - 1;

  const moves: HolderMove[] = [];
  for (const g of history.groups) {
    for (const h of g.holders) {
      const latest = parseCell(h.cells[li]);
      const prev = parseCell(h.cells[pi]);
      if (latest === null && prev === null) continue;

      const latestVal = latest ?? 0;
      const prevVal = prev ?? 0;
      let kind: MoveKind;
      let delta: number;

      if (prev === null || prevVal === 0) {
        if (latestVal <= 0 || isTruncated(h.label)) continue; // new entrant
        kind = "new";
        delta = round2(latestVal);
      } else if (latest === null || latestVal === 0) {
        if (isTruncated(h.label)) continue; // exit — skip if name is truncated
        kind = "exit";
        delta = round2(-prevVal);
      } else {
        delta = round2(latestVal - prevVal);
        if (Math.abs(delta) < 0.02) continue; // ignore rounding-level noise
        kind = delta > 0 ? "up" : "down";
      }

      moves.push({ name: h.label.trim(), category: g.category, delta, latest, prev, kind });
    }
  }

  moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return moves.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Plain-English insights (rule-based, explainable — no guessing)
// ---------------------------------------------------------------------------

const signPts = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(2)}`;

/**
 * Generate ranked, deterministic insight sentences from the computed changes.
 * The caller typically shows the first two.
 */
export function buildInsights(
  changes: CategoryChange[],
  pledge: PledgeSummary,
): string[] {
  const out: string[] = [];
  const by = (k: CategoryKey) => changes.find((c) => c.key === k);
  const promoter = by("promoter");
  const fii = by("fii");
  const dii = by("dii");

  // Promoter trajectory (the headline signal).
  if (promoter) {
    if (Math.abs(promoter.streak) >= 2) {
      const dir = promoter.streak > 0 ? "increased" : "reduced";
      const q = Math.abs(promoter.streak);
      out.push(
        `Promoters have ${dir} their stake for ${q} straight quarters (${signPts(netOverLast(promoter, q))} pts) — now ${promoter.latest.toFixed(2)}%.`,
      );
    } else if (promoter.qoq !== null && Math.abs(promoter.qoq) >= EPS) {
      out.push(
        `Promoter holding ${promoter.qoq > 0 ? "rose" : "fell"} ${Math.abs(promoter.qoq).toFixed(2)} pts this quarter to ${promoter.latest.toFixed(2)}%.`,
      );
    }
  }

  // FII ↔ DII rotation.
  if (fii && dii && fii.qoq !== null && dii.qoq !== null) {
    if (fii.qoq < -0.05 && dii.qoq > 0.05) {
      out.push(
        `FIIs trimmed (${signPts(fii.qoq)}) while DIIs added (${signPts(dii.qoq)}) — domestic institutions absorbing foreign selling.`,
      );
    } else if (fii.qoq > 0.05 && dii.qoq < -0.05) {
      out.push(`FIIs added (${signPts(fii.qoq)}) as DIIs trimmed (${signPts(dii.qoq)}).`);
    }
  }

  // Institutional extreme.
  if (fii && dii) {
    const instLatest = round2(fii.latest + dii.latest);
    if ((fii.isHigh || dii.isHigh) && (fii.qoq ?? 0) + (dii.qoq ?? 0) > 0) {
      out.push(`Institutional holding (FII + DII) is near a multi-quarter high at ${instLatest.toFixed(2)}%.`);
    }
  }

  // Pledge.
  if (pledge.hasData) {
    if (pledge.pledgePct <= 0) {
      out.push("No promoter shares are pledged.");
    } else {
      out.push(
        `${pledge.pledgePct.toFixed(2)}% of the promoter holding is pledged${pledge.pledgePct >= 25 ? " — worth watching" : ""}.`,
      );
    }
  }

  return out;
}
