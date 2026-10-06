// One-time: create the Status registry + score book on a cluster.
//   RPC_URL=https://api.devnet.solana.com ADMIN_KEYPAIR=~/.config/solana/id.json \
//   SCORER_PUBKEY=<authority> BOOK_CAPACITY=30000 npx tsx scripts/setup-registry.ts
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { buildInitBookTx, bookSize, fetchRegistry, ixInitRegistry } from "@status/core/sdk";

const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p.replace("~", homedir()), "utf8"))));

(async () => {
  const conn = new Connection(process.env.RPC_URL || "https://api.devnet.solana.com", "confirmed");
  const admin = load(process.env.ADMIN_KEYPAIR || "~/.config/solana/id.json");
  const scorer = new PublicKey(process.env.SCORER_PUBKEY || admin.publicKey);
  const capacity = Number(process.env.BOOK_CAPACITY || 30_000);

  if (!(await fetchRegistry(conn))) {
    await sendAndConfirmTransaction(conn, new Transaction().add(ixInitRegistry(admin.publicKey, scorer)), [admin]);
    console.log("registry created, scorer =", scorer.toBase58());
  }
  const reg = await fetchRegistry(conn);
  if (reg && reg.book.equals(PublicKey.default)) {
    const rent = await conn.getMinimumBalanceForRentExemption(bookSize(capacity));
    console.log(`creating book: ${capacity} wallets, ${(bookSize(capacity) / 1e6).toFixed(2)} MB, rent ${(rent / 1e9).toFixed(3)} SOL`);
    const { tx, bookKp } = await buildInitBookTx(conn, admin.publicKey, capacity);
    await sendAndConfirmTransaction(conn, tx, [admin, bookKp]);
    console.log("book:", bookKp.publicKey.toBase58());
  } else console.log("book already set:", reg?.book.toBase58());
})();
