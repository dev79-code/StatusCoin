// Background jobs:
//  * publish: push new / changed scores into the on-chain score book in batches
//  * rescore: refresh scores of published wallets older than RESCORE_AFTER_HOURS
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { MAX_BATCH, fetchRegistry, ixSetScores } from "@status/core/sdk";
import type { FastifyBaseLogger } from "fastify";
import { config } from "./config.js";
import type { Db } from "./db.js";
import { scoreWallet } from "./scoring.js";

export interface PublisherState {
  enabled: boolean;
  reason?: string;
  authority?: string;
  book?: string;
  lastRunAt?: number;
  lastError?: string;
  publishedTotal: number;
}

export function startJobs(db: Db, log: FastifyBaseLogger) {
  const conn = new Connection(config.rpcUrl, "confirmed");
  const state: PublisherState = { enabled: false, publishedTotal: 0 };
  let book: PublicKey | null = null;
  let running = false;

  async function resolveBook() {
    if (!config.autoPublish) return void (state.reason = "AUTO_PUBLISH=false");
    if (!config.scorer) return void (state.reason = "no SCORER_KEYPAIR configured");
    const reg = await fetchRegistry(conn).catch(() => null);
    if (!reg) return void (state.reason = "registry not found on this cluster (run setup-registry)");
    if (reg.book.equals(PublicKey.default)) return void (state.reason = "score book not initialised");
    if (!reg.authority.equals(config.scorer.publicKey)) {
      return void (state.reason = `scorer key ${config.scorer.publicKey.toBase58()} is not the registry authority`);
    }
    book = reg.book;
    Object.assign(state, { enabled: true, reason: undefined, authority: reg.authority.toBase58(), book: book.toBase58() });
  }

  async function publish() {
    if (running) return;
    running = true;
    try {
      if (!book) await resolveBook();
      if (!book || !config.scorer) return;
      // up to 4 transactions (96 wallets) per tick
      for (let i = 0; i < 4; i++) {
        const rows = db.dirty(MAX_BATCH);
        if (!rows.length) break;
        const tx = new Transaction().add(
          ixSetScores(config.scorer.publicKey, book, rows.map((r) => ({ wallet: new PublicKey(r.wallet), score: r.score!, flags: r.flags }))),
        );
        const sig = await sendAndConfirmTransaction(conn, tx, [config.scorer], { commitment: "confirmed" });
        const now = Math.floor(Date.now() / 1000);
        for (const r of rows) db.markPublished(r.wallet, r.score!, r.flags, now);
        state.publishedTotal += rows.length;
        log.info({ sig, count: rows.length }, "published scores");
      }
      state.lastError = undefined;
    } catch (e) {
      state.lastError = e instanceof Error ? e.message : String(e);
      log.error({ err: state.lastError }, "publish failed");
      book = null; // re-resolve next tick (registry may have changed)
    } finally {
      state.lastRunAt = Date.now();
      running = false;
    }
  }

  async function rescore() {
    const cutoff = Math.floor(Date.now() / 1000) - config.rescoreAfterHours * 3600;
    for (const w of db.stale(cutoff, 50)) {
      try {
        await scoreWallet(db, w, { force: true });
      } catch (e) {
        log.warn({ wallet: w, err: String(e) }, "rescore failed");
      }
    }
  }

  void resolveBook().then(() => log.info({ publisher: state }, "publisher ready"));
  const t1 = setInterval(publish, config.publishIntervalSec * 1000);
  const t2 = setInterval(rescore, 15 * 60 * 1000);
  return { state, publish, stop: () => { clearInterval(t1); clearInterval(t2); } };
}
