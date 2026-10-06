import { Keypair } from "@solana/web3.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const env = process.env;
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : /^(1|true|yes)$/i.test(v));

function loadKeypair(): Keypair | null {
  if (env.SCORER_SECRET_KEY) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.SCORER_SECRET_KEY)));
  }
  const p = env.SCORER_KEYPAIR?.replace(/^~/, homedir());
  if (p && existsSync(p)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
  return null;
}

export const config = {
  port: Number(env.PORT || 8080),
  host: env.HOST || "0.0.0.0",
  corsOrigins: (env.CORS_ORIGINS || "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean),
  rpcUrl: env.RPC_URL || "https://api.devnet.solana.com",
  dbPath: env.DB_PATH || "./status.db",
  scorer: loadKeypair(),
  autoPublish: bool(env.AUTO_PUBLISH, true),
  publishIntervalSec: Number(env.PUBLISH_INTERVAL_SEC || 30),
  rescoreAfterHours: Number(env.RESCORE_AFTER_HOURS || 24),
  scoreTtlSec: Number(env.SCORE_TTL_SEC || 600),
  rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN || 60),
  heliusConfigured: Boolean(env.HELIUS_API_KEY),
  internalKey: env.INTERNAL_API_KEY || "",
};
