// The AI roast. Uses Claude when ANTHROPIC_API_KEY + ROAST_MODEL are set,
// otherwise a deterministic template roast so the product works with zero keys.
import type { Features, Tier } from "./types";

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function templateRoast(f: Features, score: number | null, tier: Tier, flagged: boolean, seed: number) {
  if (score === null) {
    return {
      verdict: "Who are you?",
      roast: pick([
        "No history, no receipts, no entry. Probation pass only — prove yourself.",
        "A wallet this empty is either brand new or hiding something. Bouncer's watching.",
        "Ghost wallet detected. You can browse, but keep it light.",
      ], seed),
    };
  }
  if (flagged || f.botLike) {
    return {
      verdict: "Bot behaviour",
      roast: pick([
        `${Math.round(f.tradesPerDay)} trades a day? Either you're a bot or you need to go outside. Either way: door's closed.`,
        "Sub-minute round trips, machine-perfect timing. Beep boop, you're blocked.",
      ], seed),
    };
  }
  if (tier === "ELITE") {
    return {
      verdict: "Diamond hands",
      roast: pick([
        `Held ${pct(f.diamondRate)} of positions past a day. Rare. Annoyingly patient. Welcome to the VIP room.`,
        "You actually hold things. In this economy? Every door's open for you.",
        `Median hold of ${Math.round(f.medianHoldMin / 60)}h. The bots fear you.`,
      ], seed),
    };
  }
  if (tier === "VERIFIED") {
    return {
      verdict: "Clean trader",
      roast: pick([
        `Mostly respectable. That ${pct(f.flipRate)} flip rate says you panic sometimes — we all do.`,
        "You hold, mostly. You dump, occasionally. Verified, with notes.",
      ], seed),
    };
  }
  if (tier === "OPEN") {
    return {
      verdict: "Paper-ish hands",
      roast: pick([
        `${pct(f.quickExitRate)} of your positions were gone within the hour. You're not investing, you're speed-dating.`,
        "You're in the building, but security's keeping an eye on you.",
      ], seed),
    };
  }
  return {
    verdict: "Serial dumper",
    roast: pick([
      `Flipped ${pct(f.flipRate)} of everything inside five minutes. Devs see your wallet and pray.`,
      "Your wallet history reads like a list of crimes against holders. Denied.",
      `Median hold: ${Math.max(1, Math.round(f.medianHoldMin))} minutes. Shorter than this roast.`,
    ], seed),
  };
}

export async function aiRoast(f: Features, score: number | null, tier: Tier): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ROAST_MODEL;
  if (!key || !model) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 120,
        system:
          "You are the bouncer at Status, an exclusive Solana launchpad. Write ONE savage-but-playful roast (max 30 words) of a trader based on their stats. No slurs, nothing about real people, no financial advice. Output only the roast.",
        messages: [{ role: "user", content: JSON.stringify({ score, tier, ...f }) }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { content?: { type: string; text: string }[] };
    return j.content?.find((c) => c.type === "text")?.text.trim() || null;
  } catch {
    return null;
  }
}
