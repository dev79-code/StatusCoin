// Score a list of wallets with the Status AI scorer and publish them on-chain.
//   RPC_URL=... SCORER_KEYPAIR=./scorer.json HELIUS_API_KEY=... \
//   npx tsx scripts/publish-scores.ts wallets.txt        (one address per line)
import { Connection, Keypair, Transaction, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { getStatus, isWallet } from "@status/core/score";
import { FLAG_BLOCKED, MAX_BATCH, fetchRegistry, ixSetScores, type ScoreEntry } from "@status/core/sdk";

const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.replace("~", homedir()), "utf8"))));

(async () => {
  const conn = new Connection(process.env.RPC_URL || "https://api.devnet.solana.com", "confirmed");
  const scorer = load(process.env.SCORER_KEYPAIR || "~/.config/solana/id.json");
  const reg = await fetchRegistry(conn);
  if (!reg) throw new Error("registry not found — run setup-registry first");

  const wallets = readFileSync(process.argv[2], "utf8").split(/\s+/).filter(isWallet);
  const entries: ScoreEntry[] = [];
  for (const w of wallets) {
    const r = await getStatus(w);
    if (r.score === null) { console.log(`${w}  unranked (left on probation)`); continue; }
    entries.push({ wallet: new PublicKey(w), score: r.score, flags: r.flagged ? FLAG_BLOCKED : 0 });
    console.log(`${w}  ${r.score} ${r.tier}${r.flagged ? " FLAGGED" : ""}`);
  }
  // ~2 batches fit comfortably per tx under the 1232-byte limit? Keep 1 batch (24) per tx to be safe.
  for (let i = 0; i < entries.length; i += MAX_BATCH) {
    const tx = new Transaction().add(ixSetScores(scorer.publicKey, reg.book, entries.slice(i, i + MAX_BATCH)));
    const sig = await sendAndConfirmTransaction(conn, tx, [scorer]);
    console.log(`published ${Math.min(i + MAX_BATCH, entries.length)}/${entries.length}  ${sig}`);
  }
})();
