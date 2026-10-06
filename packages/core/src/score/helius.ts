// Pulls a wallet's swap history from Helius' Enhanced Transactions API and turns it
// into simple buy/sell events per token.

const SKIP_MINTS = new Set([
  "So11111111111111111111111111111111111111112", // wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

export interface TradeEvent {
  mint: string;
  ts: number; // unix seconds
  delta: number; // + bought, - sold (UI amount)
}

export interface History {
  events: TradeEvent[];
  swapCount: number;
  oldestTs: number | null;
  exhausted: boolean; // true if we reached the start of the wallet's swap history
}

interface HeliusTx {
  signature: string;
  timestamp: number;
  type: string;
  tokenTransfers?: { fromUserAccount: string; toUserAccount: string; mint: string; tokenAmount: number }[];
}

const BASE = process.env.HELIUS_API_BASE || "https://api-mainnet.helius-rpc.com";

export async function fetchHistory(wallet: string, apiKey: string, maxPages = 5): Promise<History> {
  const events: TradeEvent[] = [];
  let before: string | undefined;
  let swapCount = 0;
  let oldestTs: number | null = null;
  let exhausted = false;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${BASE}/v0/addresses/${wallet}/transactions`);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("type", "SWAP");
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Helius ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const txs = (await res.json()) as HeliusTx[];
    if (!txs.length) { exhausted = true; break; }

    for (const tx of txs) {
      swapCount++;
      oldestTs = tx.timestamp;
      const net = new Map<string, number>();
      for (const t of tx.tokenTransfers ?? []) {
        if (SKIP_MINTS.has(t.mint)) continue;
        if (t.toUserAccount === wallet) net.set(t.mint, (net.get(t.mint) ?? 0) + t.tokenAmount);
        if (t.fromUserAccount === wallet) net.set(t.mint, (net.get(t.mint) ?? 0) - t.tokenAmount);
      }
      for (const [mint, delta] of net) if (delta !== 0) events.push({ mint, ts: tx.timestamp, delta });
    }
    before = txs[txs.length - 1].signature;
    if (txs.length < 100) { exhausted = true; break; }
  }
  events.sort((a, b) => a.ts - b.ts);
  return { events, swapCount, oldestTs, exhausted };
}
