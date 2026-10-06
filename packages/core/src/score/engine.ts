// Turns trade history into features, and features into a Status score.
import type { History } from "./helius";
import { tierFor, type Factor, type Features } from "./types";

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function extractFeatures(h: History, now = Date.now() / 1000): Features {
  const byMint = new Map<string, { ts: number; delta: number }[]>();
  for (const e of h.events) {
    if (!byMint.has(e.mint)) byMint.set(e.mint, []);
    byMint.get(e.mint)!.push(e);
  }

  // A "position" opens on the first buy and closes when the balance is (nearly) fully sold.
  const holds: number[] = []; // minutes
  let flips = 0, quick = 0, diamond = 0;
  for (const evs of byMint.values()) {
    let bal = 0, peak = 0, open: number | null = null;
    for (const e of evs) {
      if (e.delta > 0 && open === null) { open = e.ts; peak = 0; }
      bal = Math.max(0, bal + e.delta);
      peak = Math.max(peak, bal);
      if (open !== null && peak > 0 && bal <= peak * 0.02) {
        const mins = (e.ts - open) / 60;
        holds.push(mins);
        if (mins < 5) flips++;
        if (mins < 60) quick++;
        if (mins > 24 * 60) diamond++;
        open = null; bal = 0;
      }
    }
    if (open !== null) {
      const mins = (now - open) / 60;
      holds.push(mins);
      if (mins > 24 * 60) diamond++;
    }
  }

  const positions = holds.length;
  const ageDays = h.oldestTs ? Math.max(0, (now - h.oldestTs) / 86400) : 0;
  const spanDays = Math.max(ageDays, 1);
  const tradesPerDay = h.swapCount / spanDays;

  // Bot heuristics: extreme frequency, or a big share of sub-30s round trips.
  const subMinute = holds.filter((m) => m < 0.5).length;
  const botLike = tradesPerDay > 150 || (positions >= 10 && subMinute / positions > 0.5);

  return {
    swaps: h.swapCount,
    positions,
    ageDays,
    ageIsLowerBound: !h.exhausted,
    medianHoldMin: median(holds),
    flipRate: positions ? flips / positions : 0,
    quickExitRate: positions ? quick / positions : 0,
    diamondRate: positions ? diamond / positions : 0,
    tradesPerDay,
    botLike,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmtHold = (m: number) =>
  m < 1 ? `${Math.round(m * 60)}s` : m < 60 ? `${Math.round(m)}m` : m < 48 * 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m / 1440)}d`;

export function scoreFeatures(f: Features) {
  if (f.swaps < 3 || f.positions < 1) {
    return { score: null as number | null, tier: tierFor(null), flagged: false, factors: [] as Factor[] };
  }
  const factors: Factor[] = [
    { key: "age", label: "Wallet age", value: `${f.ageIsLowerBound ? "≥" : ""}${Math.round(f.ageDays)}d`, impact: Math.round(Math.min(f.ageDays / 180, 1) * 12) },
    { key: "diamond", label: "Held > 24h", value: pct(f.diamondRate), impact: Math.round(f.diamondRate * 30) },
    { key: "patience", label: "Median hold", value: fmtHold(f.medianHoldMin), impact: Math.round((1 - f.quickExitRate) * 10) },
    { key: "flips", label: "Flipped < 5 min", value: pct(f.flipRate), impact: -Math.round(f.flipRate * 40) },
    { key: "activity", label: "Positions", value: String(f.positions), impact: f.positions >= 5 ? 5 : 0 },
  ];
  if (f.botLike) factors.push({ key: "bot", label: "Bot pattern", value: `${Math.round(f.tradesPerDay)}/day`, impact: -35 });

  const raw = 38 + factors.reduce((s, x) => s + x.impact, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const flagged = f.botLike && f.flipRate > 0.6;
  return { score, tier: tierFor(score), flagged, factors };
}
