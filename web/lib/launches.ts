// Demo launches so the UI is alive before mainnet. Clearly marked as demo in the UI.
export interface Launch {
  id: string; // demo slug or real mint
  name: string;
  ticker: string;
  minScore: number;
  holders: number;
  avgScore: number;
  bounced: number;
  mcap: number;
  change24h: number;
  ageMin: number;
  hue: number;
  tagline: string;
  demo: true;
}

export const LAUNCHES: Launch[] = [
  { id: "velvet", name: "Velvet Rope", ticker: "ROPE", minScore: 85, holders: 412, avgScore: 91, bounced: 2318, mcap: 1_840_000, change24h: 38.2, ageMin: 54, hue: 42, tagline: "The first Elite-only launch. Diamond hands or nothing.", demo: true },
  { id: "afterhours", name: "After Hours", ticker: "LATE", minScore: 65, holders: 1290, avgScore: 78, bounced: 5120, mcap: 3_210_000, change24h: 12.7, ageMin: 260, hue: 190, tagline: "Verified traders only. No snipers at the bar.", demo: true },
  { id: "guestlist", name: "Guestlist", ticker: "LIST", minScore: 40, holders: 3820, avgScore: 61, bounced: 9480, mcap: 6_900_000, change24h: -4.1, ageMin: 1440, hue: 280, tagline: "Open doors, zero bots. The people's launch.", demo: true },
  { id: "coatcheck", name: "Coat Check", ticker: "COAT", minScore: 65, holders: 640, avgScore: 74, bounced: 1890, mcap: 920_000, change24h: 21.9, ageMin: 95, hue: 150, tagline: "Leave your bags with us. Literally.", demo: true },
  { id: "blacklabel", name: "Black Label", ticker: "BLK", minScore: 85, holders: 188, avgScore: 93, bounced: 4011, mcap: 2_450_000, change24h: 64.5, ageMin: 18, hue: 0, tagline: "88% of wallets bounced in the first hour.", demo: true },
  { id: "lastcall", name: "Last Call", ticker: "CALL", minScore: 40, holders: 2210, avgScore: 57, bounced: 3302, mcap: 1_120_000, change24h: -9.8, ageMin: 3100, hue: 320, tagline: "Gate opens to everyone at midnight UTC.", demo: true },
];

export const getLaunch = (id: string) => LAUNCHES.find((l) => l.id === id);

const pick = (s: string[], i: number) => s[i % s.length];
const ADDR = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function fakeAddr(seed: number) {
  let s = seed * 2654435761 >>> 0, out = "";
  for (let i = 0; i < 8; i++) { s = (s * 1103515245 + 12345) >>> 0; out += ADDR[s % ADDR.length]; }
  return out;
}

export interface DoorEvent { wallet: string; ok: boolean; score: number | null; reason: string; token: string }

export function doorEvents(n = 24, seed = 7, only?: { ticker: string; minScore: number }): DoorEvent[] {
  const reasons = {
    deny: ["flipped 84% < 5m", "bundle cluster ×14", "funded 3m ago", "sniper pattern", "312 trades/day", "linked to 2 rugs", "dumped 9 of last 10"],
    ok: ["held 71% > 24h", "wallet age 2y", "diamond hands", "clean history", "median hold 3.4d"],
  };
  return Array.from({ length: n }, (_, i) => {
    const r = (seed * 97 + i * 131) % 100;
    const ok = r > 58;
    const l = only ?? LAUNCHES[(i * 5 + seed) % LAUNCHES.length];
    const score = ok ? l.minScore + (r % (101 - l.minScore)) : r < 8 ? null : Math.max(3, l.minScore - 5 - (r % 40));
    return {
      wallet: `${fakeAddr(i + seed * 13).slice(0, 4)}…${fakeAddr(i * 7 + 1).slice(0, 4)}`,
      ok,
      score,
      reason: score === null && !ok ? "unscored · over probation" : pick(ok ? reasons.ok : reasons.deny, i * 3 + seed),
      token: l.ticker,
    };
  });
}
