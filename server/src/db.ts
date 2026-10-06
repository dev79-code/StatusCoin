// Tiny persistence layer on Node's built-in SQLite (no native deps to compile).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { StatusResult } from "@status/core/score/types";

export interface WalletRow {
  wallet: string;
  score: number | null;
  tier: string;
  flags: number;
  result: string;
  scored_at: number;
  published_score: number | null;
  published_flags: number | null;
  published_at: number | null;
}

export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS wallets (
      wallet          TEXT PRIMARY KEY,
      score           INTEGER,
      tier            TEXT NOT NULL,
      flags           INTEGER NOT NULL DEFAULT 0,
      result          TEXT NOT NULL,
      scored_at       INTEGER NOT NULL,
      published_score INTEGER,
      published_flags INTEGER,
      published_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_scored_at ON wallets(scored_at);
  `);

  const get = db.prepare("SELECT * FROM wallets WHERE wallet = ?");
  const upsert = db.prepare(`
    INSERT INTO wallets (wallet, score, tier, flags, result, scored_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(wallet) DO UPDATE SET score=excluded.score, tier=excluded.tier, flags=excluded.flags,
      result=excluded.result, scored_at=excluded.scored_at`);
  // "dirty" = has a score and the on-chain copy differs
  const dirty = db.prepare(`
    SELECT * FROM wallets
    WHERE score IS NOT NULL
      AND (published_score IS NULL OR published_score != score OR published_flags != flags)
    ORDER BY scored_at ASC LIMIT ?`);
  const markPublished = db.prepare("UPDATE wallets SET published_score = ?, published_flags = ?, published_at = ? WHERE wallet = ?");
  const stale = db.prepare("SELECT wallet FROM wallets WHERE published_at IS NOT NULL AND scored_at < ? ORDER BY scored_at ASC LIMIT ?");
  const stats = db.prepare(`
    SELECT COUNT(*) AS scored,
           SUM(published_at IS NOT NULL) AS published,
           SUM(tier = 'ELITE') AS elite, SUM(tier = 'VERIFIED') AS verified,
           SUM(tier = 'OPEN') AS open, SUM(tier = 'DENIED') AS denied,
           SUM(tier = 'UNRANKED') AS unranked, SUM(flags & 1) AS flagged
    FROM wallets`);

  return {
    raw: db,
    get: (w: string) => get.get(w) as WalletRow | undefined,
    save(r: StatusResult) {
      upsert.run(r.wallet, r.score, r.tier, r.flagged ? 1 : 0, JSON.stringify(r), Math.floor(r.scoredAt / 1000));
    },
    dirty: (limit: number) => dirty.all(limit) as unknown as WalletRow[],
    markPublished: (w: string, score: number, flags: number, at: number) => markPublished.run(score, flags, at, w),
    stale: (olderThan: number, limit: number) => (stale.all(olderThan, limit) as { wallet: string }[]).map((r) => r.wallet),
    stats: () => stats.get() as Record<string, number | null>,
  };
}

export type Db = ReturnType<typeof openDb>;
