import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { isWallet } from "@status/core/score";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { startJobs } from "./publisher.js";
import { onchainState, scoreWallet } from "./scoring.js";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" }, trustProxy: true });
const db = openDb(config.dbPath);

await app.register(cors, {
  origin: (origin, cb) => {
    // allow server-to-server (no Origin) + configured origins + Vercel preview deployments if enabled
    if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
    if (process.env.CORS_ALLOW_VERCEL_PREVIEWS === "true" && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
    cb(null, false); // no CORS headers -> browser blocks it; server-to-server still fine
  },
});
await app.register(rateLimit, {
  max: config.rateLimitPerMin,
  timeWindow: "1 minute",
  // the Vercel frontend renders pages server-side from shared IPs: let it through with a shared secret
  allowList: (req) => Boolean(config.internalKey) && req.headers["x-status-key"] === config.internalKey,
});

const jobs = startJobs(db, app.log);

app.get("/health", { config: { rateLimit: false } }, async () => ({
  ok: true,
  mode: config.heliusConfigured ? "helius" : "demo",
  publisher: jobs.state,
}));

app.get<{ Params: { wallet: string } }>("/v1/score/:wallet", async (req, reply) => {
  const { wallet } = req.params;
  if (!isWallet(wallet)) return reply.code(400).send({ error: "invalid wallet" });
  try {
    const r = await scoreWallet(db, wallet);
    reply.header("cache-control", "public, max-age=60");
    return { ...r, onchain: onchainState(db.get(wallet)) };
  } catch (e) {
    req.log.error(e);
    return reply.code(502).send({ error: "scoring failed" });
  }
});

app.get("/v1/stats", async () => {
  const s = db.stats();
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? 0]));
});

const close = async () => {
  jobs.stop();
  await app.close();
  db.raw.close();
  process.exit(0);
};
process.on("SIGTERM", close);
process.on("SIGINT", close);

await app.listen({ port: config.port, host: config.host });
