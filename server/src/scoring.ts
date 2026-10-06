import { getStatus } from "@status/core/score";
import type { StatusResult } from "@status/core/score/types";
import { config } from "./config.js";
import type { Db, WalletRow } from "./db.js";

const inflight = new Map<string, Promise<StatusResult>>();

/** Returns a cached score if fresh, otherwise scores the wallet and stores it. */
export async function scoreWallet(db: Db, wallet: string, opts: { force?: boolean } = {}): Promise<StatusResult> {
  const row = db.get(wallet);
  const fresh = row && Date.now() / 1000 - row.scored_at < config.scoreTtlSec;
  if (row && fresh && !opts.force) return JSON.parse(row.result);

  // de-duplicate concurrent requests for the same wallet
  const existing = inflight.get(wallet);
  if (existing) return existing;
  const p = getStatus(wallet, { bypassCache: true })
    .then((r) => { db.save(r); return r; })
    .finally(() => inflight.delete(wallet));
  inflight.set(wallet, p);
  return p;
}

export function onchainState(row: WalletRow | undefined) {
  if (!row) return { score: null, flags: 0, publishedAt: null, pending: false };
  const pending = row.score !== null && (row.published_score === null || row.published_score !== row.score || row.published_flags !== row.flags);
  return { score: row.published_score, flags: row.published_flags ?? 0, publishedAt: row.published_at, pending };
}
