// End-to-end test of the Status hook against a local validator.
//   solana-test-validator --reset --bpf-program <PROGRAM_ID> target/deploy/status_hook.so
//   npx tsx scripts/e2e.ts
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction, createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  FLAG_BLOCKED, bookLookup, buildInitBookTx, buildLaunchTx, fetchGate, ixInitRegistry, registryPda, STATUS_PROGRAM_ID, ixLoosenGate, ixSetScores,
} from "@status/core/sdk";

const conn = new Connection(process.env.RPC_URL || "http://127.0.0.1:8899", "confirmed");
const DEC = 6;
const T = (n: number) => BigInt(n) * 10n ** BigInt(DEC);
let pass = 0, fail = 0;

async function fund(...kps: Keypair[]) {
  for (const k of kps) {
    const sig = await conn.requestAirdrop(k.publicKey, 5 * LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  }
}
const ata = (owner: PublicKey, mint: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID);

async function send(tx: Transaction, signers: Keypair[]) {
  return sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" });
}

async function transfer(mint: PublicKey, from: Keypair, to: PublicKey, amount: bigint) {
  const ix = await createTransferCheckedWithTransferHookInstruction(
    conn, ata(from.publicKey, mint), mint, ata(to, mint), from.publicKey, amount, DEC, [], "confirmed", TOKEN_2022_PROGRAM_ID,
  );
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(from.publicKey, ata(to, mint), to, mint, TOKEN_2022_PROGRAM_ID),
    ix,
  );
  return send(tx, [from]);
}

async function expect(name: string, shouldPass: boolean, fn: () => Promise<unknown>, errMatch?: string) {
  try {
    await fn();
    if (shouldPass) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name} — expected failure but succeeded`); }
  } catch (e: unknown) {
    const logs = ((e as { logs?: string[] }).logs || []).join("\n") + String(e);
    if (!shouldPass && (!errMatch || logs.includes(errMatch))) { pass++; console.log(`  ✓ ${name} (rejected: ${errMatch ?? "error"})`); }
    else { fail++; console.log(`  ✗ ${name}\n${logs.slice(0, 1500)}`); }
  }
}

async function main() {
  const admin = Keypair.generate();     // also the scorer authority here
  const creator = Keypair.generate();
  const pool = Keypair.generate();      // stands in for a curve / AMM vault owner
  const elite = Keypair.generate();     // score 92
  const low = Keypair.generate();       // score 31
  const bot = Keypair.generate();       // score 95 but flagged
  const fresh = Keypair.generate();     // unscored
  await fund(admin, creator, pool, elite, low, bot, fresh);

  console.log("setup");
  if (await conn.getAccountInfo(registryPda())) {
    console.error("Registry already exists — run against a fresh validator (solana-test-validator --reset).");
    process.exit(1);
  }
  await send(new Transaction().add(ixInitRegistry(admin.publicKey, admin.publicKey)), [admin]);
  const { tx: bookTx, bookKp } = await buildInitBookTx(conn, admin.publicKey, 2_000);
  await send(bookTx, [admin, bookKp]);
  await send(new Transaction().add(ixSetScores(admin.publicKey, bookKp.publicKey, [
    { wallet: elite.publicKey, score: 92 },
    { wallet: low.publicKey, score: 31 },
    { wallet: bot.publicKey, score: 95, flags: FLAG_BLOCKED },
  ])), [admin]);
  // bulk: fill a full batch of random wallets to exercise batching + probing
  const filler = Array.from({ length: 24 }, (_, i) => ({ wallet: Keypair.generate().publicKey, score: i * 4 }));
  await expect("scorer publishes a full 24-wallet batch", true,
    () => send(new Transaction().add(ixSetScores(admin.publicKey, bookKp.publicKey, filler)), [admin]));
  await expect("non-authority cannot write scores", false,
    () => send(new Transaction().add(ixSetScores(low.publicKey, bookKp.publicKey, [{ wallet: low.publicKey, score: 100 }])), [low]));
  const bookData = (await conn.getAccountInfo(bookKp.publicKey))!.data;
  const seen = bookLookup(bookData, elite.publicKey);
  await expect("client-side book lookup matches chain (elite=92)", true, async () => { if (seen?.score !== 92) throw new Error(JSON.stringify(seen)); });

  const { tx, mintKp, mint } = await buildLaunchTx(conn, {
    creator: creator.publicKey, name: "Elite Test", symbol: "ELITE", uri: "https://status.example/elite.json",
    decimals: DEC,
    gate: { minScore: 70, probationCap: T(1_000), openAfter: 0n, exempt: [pool.publicKey] },
  });
  await send(tx, [creator, mintKp]);
  const gate = await fetchGate(conn, mint);
  console.log(`  launched ${mint.toBase58()} gate=${gate?.minScore} exempt=${gate?.exempt.length}`);

  // Supply goes to the "pool" (mintTo does not trigger hooks).
  await send(new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(creator.publicKey, ata(pool.publicKey, mint), pool.publicKey, mint, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint, ata(pool.publicKey, mint), creator.publicKey, T(1_000_000), [], TOKEN_2022_PROGRAM_ID),
  ), [creator]);

  console.log("buys (pool -> wallet)");
  await expect("elite wallet (92) can buy", true, async () => {
    const sig = await transfer(mint, pool, elite.publicKey, T(5_000));
    const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const line = tx?.meta?.logMessages?.find((l) => l.includes(STATUS_PROGRAM_ID.toBase58()) && l.includes("consumed"));
    console.log(`    hook cost: ${line?.match(/consumed (\d+)/)?.[1]} compute units`);
  });
  await expect("low wallet (31) is blocked", false, () => transfer(mint, pool, low.publicKey, T(10)), "ScoreTooLow");
  await expect("flagged bot (95) is blocked", false, () => transfer(mint, pool, bot.publicKey, T(10)), "Flagged");
  await expect("unscored wallet within probation cap", true, () => transfer(mint, pool, fresh.publicKey, T(900)));
  await expect("unscored wallet over probation cap", false, () => transfer(mint, pool, fresh.publicKey, T(200)), "NotOnTheList");

  console.log("sells & sends");
  await expect("elite can always sell back to pool", true, () => transfer(mint, elite, pool.publicKey, T(1_000)));
  await expect("unscored can sell too", true, () => transfer(mint, fresh, pool.publicKey, T(900)));
  await expect("elite cannot pass tokens to low wallet", false, () => transfer(mint, elite, low.publicKey, T(1)), "ScoreTooLow");

  console.log("creator powers");
  await expect("creator cannot tighten gate (70 -> 80)", false,
    () => send(new Transaction().add(ixLoosenGate(creator.publicKey, mint, { minScore: 80 })), [creator]), "CanOnlyLoosen");
  await expect("stranger cannot touch gate", false,
    () => send(new Transaction().add(ixLoosenGate(low.publicKey, mint, { minScore: 0 })), [low]));
  await expect("creator loosens gate to 30", true,
    () => send(new Transaction().add(ixLoosenGate(creator.publicKey, mint, { minScore: 30 })), [creator]));
  await expect("low wallet (31) can now buy", true, () => transfer(mint, pool, low.publicKey, T(10)));
  await expect("flagged bot still blocked", false, () => transfer(mint, pool, bot.publicKey, T(10)), "Flagged");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
