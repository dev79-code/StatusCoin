import type { Tier } from "@status/core/score/types";

export const TIER_STYLE: Record<Tier, { color: string; label: string; glyph: string; line: string }> = {
  ELITE: { color: "var(--elite)", label: "Elite", glyph: "◆", line: "Every door is open." },
  VERIFIED: { color: "var(--verified)", label: "Verified", glyph: "◈", line: "Most doors are open." },
  OPEN: { color: "var(--open)", label: "Open", glyph: "◇", line: "You're in the building." },
  DENIED: { color: "var(--denied)", label: "Denied", glyph: "✕", line: "Not tonight." },
  UNRANKED: { color: "var(--unranked)", label: "Probation", glyph: "○", line: "Small buys only until you're scored." },
};

export const GATE_TIERS = [
  { key: "OPEN", min: 40, name: "Open", desc: "Blocks bots, bundlers and the worst dumpers." },
  { key: "VERIFIED", min: 65, name: "Verified", desc: "Clean traders only. The default." },
  { key: "ELITE", min: 85, name: "Elite", desc: "Proven diamond hands. An event." },
] as const;

export function gateName(min: number) {
  if (min >= 85) return "ELITE";
  if (min >= 65) return "VERIFIED";
  return "OPEN";
}
