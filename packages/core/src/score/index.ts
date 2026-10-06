import { PublicKey } from "@solana/web3.js";
import { extractFeatures, scoreFeatures } from "./engine";
import { fetchHistory, type History } from "./helius";
import { aiRoast, templateRoast } from "./roast";
import type { StatusResult } from "./types";

export * from "./types";

const cache = new Map<string, { at: number; v: StatusResult }>();
const TTL = 10 * 60 * 1000;

export function isWallet(s: string) {
  try {
    return PublicKey.isOnCurve(new PublicKey(s).toBytes());
  } catch {
    return false;
  }
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic, realistic-looking history so the app works without an API key. */
export function demoHistory(wallet: string, now = Math.floor(Date.now() / 1000)): History {
  let s = hash(wallet);
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296;
  const persona = Math.pow(rnd(), 1.5); // 0..1: dumper -> diamond hands (skewed: most traders flip)
  const n = 6 + Math.floor(rnd() * 30);
  const age = 20 + rnd() * 600;
  const events = [];
  for (let i = 0; i < n; i++) {
    const mint = `demo${i}`;
    const open = now - Math.floor(rnd() * age * 86400);
    const r = rnd();
    const holdMin =
      persona < 0.25 ? (r < 0.75 ? r * 4 : 30 + r * 300)
      : persona < 0.55 ? (r < 0.35 ? r * 10 : 60 + r * 2000)
      : persona < 0.85 ? (r < 0.15 ? 3 : 300 + r * 6000)
      : (r < 0.05 ? 10 : 2000 + r * 20000);
    events.push({ mint, ts: open, delta: 1000 });
    const close = open + holdMin * 60;
    if (close < now && rnd() > persona * 0.6) events.push({ mint, ts: Math.floor(close), delta: -1000 });
  }
  events.sort((a, b) => a.ts - b.ts);
  return { events, swapCount: events.length + Math.floor(rnd() * 20), oldestTs: events[0]?.ts ?? null, exhausted: true };
}

export async function getStatus(wallet: string, opts: { bypassCache?: boolean } = {}): Promise<StatusResult> {
  const hit = cache.get(wallet);
  if (!opts.bypassCache && hit && Date.now() - hit.at < TTL) return hit.v;

  const key = process.env.HELIUS_API_KEY;
  const source = key ? "helius" : "demo";
  const history = key ? await fetchHistory(wallet, key) : demoHistory(wallet);

  const features = extractFeatures(history);
  const { score, tier, flagged, factors } = scoreFeatures(features);
  const t = templateRoast(features, score, tier, flagged, hash(wallet));
  const roast = (await aiRoast(features, score, tier)) ?? t.roast;

  const v: StatusResult = {
    wallet, score, tier, flagged, features, factors, roast, verdict: t.verdict, source, scoredAt: Date.now(),
  };
  cache.set(wallet, { at: Date.now(), v });
  return v;
}
