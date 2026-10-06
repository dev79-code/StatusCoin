export type Tier = "ELITE" | "VERIFIED" | "OPEN" | "DENIED" | "UNRANKED";

export interface Features {
  swaps: number;
  positions: number;
  ageDays: number;
  ageIsLowerBound: boolean;
  medianHoldMin: number;
  flipRate: number; // share of positions fully exited < 5 min
  quickExitRate: number; // < 1 hour
  diamondRate: number; // held > 24h (closed or still open)
  tradesPerDay: number;
  botLike: boolean;
}

export interface Factor {
  key: string;
  label: string;
  value: string;
  impact: number; // signed points
}

export interface StatusResult {
  wallet: string;
  score: number | null; // null = unranked (probation)
  tier: Tier;
  flagged: boolean;
  features: Features;
  factors: Factor[];
  roast: string;
  verdict: string;
  source: "helius" | "demo";
  scoredAt: number;
}

export const TIERS: { tier: Exclude<Tier, "UNRANKED" | "DENIED">; min: number; blurb: string }[] = [
  { tier: "ELITE", min: 85, blurb: "Proven diamond hands. Every Status launch is open to you." },
  { tier: "VERIFIED", min: 65, blurb: "Clean trader. Most launches let you in." },
  { tier: "OPEN", min: 40, blurb: "You're in the building. Not the VIP room." },
];

export function tierFor(score: number | null): Tier {
  if (score === null) return "UNRANKED";
  for (const t of TIERS) if (score >= t.min) return t.tier;
  return "DENIED";
}
