// Status on-chain SDK — hand-rolled client for the `status-hook` Anchor program.
// Works in the browser (launch flow) and in Node (scripts / e2e tests).

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  getMintLen,
  LENGTH_SIZE,
  TYPE_SIZE,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";

export const STATUS_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_STATUS_PROGRAM_ID || process.env.STATUS_PROGRAM_ID || "FhCxrWkkKHptVi5zdrT8iHSZTRRjP9E11q9mrTUqNiHR",
);

export const FLAG_BLOCKED = 1;
export const MAX_EXEMPT = 6;

const DISC = {
  initRegistry: [131, 22, 4, 103, 24, 94, 163, 239],
  setAuthority: [133, 250, 37, 21, 110, 163, 26, 121],
  initBook: [96, 122, 49, 43, 63, 61, 118, 152],
  setScores: [251, 226, 79, 234, 175, 27, 245, 149],
  acctRegistry: [47, 174, 110, 246, 184, 182, 252, 218],
  createGate: [32, 40, 167, 136, 81, 13, 199, 238],
  loosenGate: [104, 99, 100, 72, 235, 0, 114, 119],
  acctGateConfig: [161, 200, 10, 61, 185, 120, 92, 21],
};

// ------------------------------------------------------------------ PDAs
const enc = (s: string) => new TextEncoder().encode(s);

export const registryPda = (pid = STATUS_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc("registry")], pid)[0];
export const gatePda = (mint: PublicKey, pid = STATUS_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc("gate"), mint.toBuffer()], pid)[0];
export const metaListPda = (mint: PublicKey, pid = STATUS_PROGRAM_ID) =>
  PublicKey.findProgramAddressSync([enc("extra-account-metas"), mint.toBuffer()], pid)[0];

// ------------------------------------------------------------------ tiny borsh writer
class W {
  private parts: number[] = [];
  bytes(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.parts.push(b[i]); return this; }
  u8(n: number) { this.parts.push(n & 0xff); return this; }
  u32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return this.bytes(b); }
  u64(n: bigint) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return this.bytes(b); }
  i64(n: bigint) { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, n, true); return this.bytes(b); }
  pk(p: PublicKey) { return this.bytes(p.toBytes()); }
  opt<T>(v: T | undefined | null, f: (v: T) => void) { if (v === undefined || v === null) this.u8(0); else { this.u8(1); f(v); } return this; }
  done() { return Buffer.from(this.parts); }
}

// ------------------------------------------------------------------ instructions
export function ixInitRegistry(admin: PublicKey, authority: PublicKey, pid = STATUS_PROGRAM_ID) {
  return new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: registryPda(pid), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: new W().bytes(DISC.initRegistry).pk(authority).done(),
  });
}

// ---- score book: one big program-owned hash table (wallet -> score, flags)
export const BOOK_HEADER = 16;
export const BOOK_ENTRY = 34;
export const MAX_BATCH = 24;
export const bookSize = (capacity: number) => BOOK_HEADER + capacity * BOOK_ENTRY;

/** Allocate + format the score book (admin only, once). Max ~300k wallets per 10 MB. */
export async function buildInitBookTx(conn: Connection, admin: PublicKey, capacity: number, pid = STATUS_PROGRAM_ID) {
  const bookKp = Keypair.generate();
  const space = bookSize(capacity);
  const lamports = await conn.getMinimumBalanceForRentExemption(space);
  const tx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: admin, newAccountPubkey: bookKp.publicKey, space, lamports, programId: pid }),
    new TransactionInstruction({
      programId: pid,
      keys: [
        { pubkey: admin, isSigner: true, isWritable: false },
        { pubkey: registryPda(pid), isSigner: false, isWritable: true },
        { pubkey: bookKp.publicKey, isSigner: false, isWritable: true },
      ],
      data: new W().bytes(DISC.initBook).u32(capacity).done(),
    }),
  );
  return { tx, bookKp };
}

export interface ScoreEntry { wallet: PublicKey; score: number; flags?: number }

export function ixSetScores(authority: PublicKey, book: PublicKey, entries: ScoreEntry[], pid = STATUS_PROGRAM_ID) {
  if (entries.length > MAX_BATCH) throw new Error(`max ${MAX_BATCH} scores per ix`);
  const w = new W().bytes(DISC.setScores).u32(entries.length);
  entries.forEach((e) => w.pk(e.wallet).u8(e.score).u8(e.flags ?? 0));
  return new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: registryPda(pid), isSigner: false, isWritable: false },
      { pubkey: book, isSigner: false, isWritable: true },
    ],
    data: w.done(),
  });
}

/** Mirror of the on-chain lookup, for reading the book client-side. */
export function bookLookup(data: Uint8Array, wallet: PublicKey): { score: number; flags: number } | null {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const cap = v.getUint32(8, true);
  const key = wallet.toBytes();
  let i = Number(new DataView(key.buffer, key.byteOffset, 8).getBigUint64(0, true) % BigInt(cap));
  for (let n = 0; n < cap; n++) {
    const o = BOOK_HEADER + i * BOOK_ENTRY;
    let match = true, empty = true;
    for (let j = 0; j < 32; j++) { const b = data[o + j]; if (b !== key[j]) match = false; if (b !== 0) empty = false; }
    if (match) return { score: data[o + 32], flags: data[o + 33] };
    if (empty) return null;
    i = (i + 1) % cap;
  }
  return null;
}

export interface GateParams {
  minScore: number;
  probationCap: bigint; // raw token units (incl. decimals)
  openAfter: bigint; // unix seconds, 0n = never
  exempt: PublicKey[]; // pool / curve vault OWNERS
}

export function ixCreateGate(creator: PublicKey, mint: PublicKey, p: GateParams, pid = STATUS_PROGRAM_ID) {
  if (p.exempt.length > MAX_EXEMPT) throw new Error("too many exempt vaults");
  const w = new W().bytes(DISC.createGate).u8(p.minScore).u64(p.probationCap).i64(p.openAfter).u32(p.exempt.length);
  p.exempt.forEach((k) => w.pk(k));
  return new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: registryPda(pid), isSigner: false, isWritable: false },
      { pubkey: gatePda(mint, pid), isSigner: false, isWritable: true },
      { pubkey: metaListPda(mint, pid), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: w.done(),
  });
}

export function ixLoosenGate(
  creator: PublicKey,
  mint: PublicKey,
  o: { minScore?: number; probationCap?: bigint; addExempt?: PublicKey; openAfter?: bigint },
  pid = STATUS_PROGRAM_ID,
) {
  const w = new W().bytes(DISC.loosenGate);
  w.opt(o.minScore, (v) => w.u8(v));
  w.opt(o.probationCap, (v) => w.u64(v));
  w.opt(o.addExempt, (v) => w.pk(v));
  w.opt(o.openAfter, (v) => w.i64(v));
  return new TransactionInstruction({
    programId: pid,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: false },
      { pubkey: gatePda(mint, pid), isSigner: false, isWritable: true },
    ],
    data: w.done(),
  });
}

// ------------------------------------------------------------------ launch (one transaction)
export interface LaunchInput {
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals?: number;
  gate: GateParams;
}

/** Builds mint (Token-2022 + TransferHook + Metadata) and the Status gate in a single tx. */
export async function buildLaunchTx(conn: Connection, input: LaunchInput, pid = STATUS_PROGRAM_ID) {
  const mintKp = Keypair.generate();
  const mint = mintKp.publicKey;
  const decimals = input.decimals ?? 6;

  const metadata: TokenMetadata = {
    mint,
    name: input.name,
    symbol: input.symbol,
    uri: input.uri,
    additionalMetadata: [["status_gate", String(input.gate.minScore)]],
  };
  const mintLen = getMintLen([ExtensionType.TransferHook, ExtensionType.MetadataPointer]);
  const metaLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + metaLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: input.creator,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferHookInstruction(mint, input.creator, pid, TOKEN_2022_PROGRAM_ID),
    createInitializeMetadataPointerInstruction(mint, input.creator, mint, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint, decimals, input.creator, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint,
      updateAuthority: input.creator,
      mint,
      mintAuthority: input.creator,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
    }),
    ixCreateGate(input.creator, mint, input.gate, pid),
  );
  return { tx, mintKp, mint };
}

// ------------------------------------------------------------------ decoders
const dv = (d: Uint8Array) => new DataView(d.buffer, d.byteOffset, d.byteLength);
const eqDisc = (d: Uint8Array, disc: number[]) => disc.every((b, i) => d[i] === b);

export interface RegistryAccount { admin: PublicKey; authority: PublicKey; book: PublicKey }
export function decodeRegistry(d: Uint8Array): RegistryAccount {
  if (!eqDisc(d, DISC.acctRegistry)) throw new Error("not a Registry");
  return {
    admin: new PublicKey(d.subarray(8, 40)),
    authority: new PublicKey(d.subarray(40, 72)),
    book: new PublicKey(d.subarray(72, 104)),
  };
}

export interface GateConfigAccount {
  mint: PublicKey; creator: PublicKey; book: PublicKey; minScore: number; probationCap: bigint; openAfter: bigint; exempt: PublicKey[];
}
export function decodeGateConfig(d: Uint8Array): GateConfigAccount {
  if (!eqDisc(d, DISC.acctGateConfig)) throw new Error("not a GateConfig");
  const v = dv(d);
  let o = 8;
  const mint = new PublicKey(d.subarray(o, (o += 32)));
  const creator = new PublicKey(d.subarray(o, (o += 32)));
  const book = new PublicKey(d.subarray(o, (o += 32)));
  const minScore = d[o++];
  const probationCap = v.getBigUint64(o, true); o += 8;
  const openAfter = v.getBigInt64(o, true); o += 8;
  const slots: PublicKey[] = [];
  for (let i = 0; i < MAX_EXEMPT; i++) slots.push(new PublicKey(d.subarray(o + i * 32, o + (i + 1) * 32)));
  o += MAX_EXEMPT * 32;
  const len = d[o];
  return { mint, creator, book, minScore, probationCap, openAfter, exempt: slots.slice(0, len) };
}

export async function fetchGate(conn: Connection, mint: PublicKey, pid = STATUS_PROGRAM_ID) {
  const info = await conn.getAccountInfo(gatePda(mint, pid));
  return info ? decodeGateConfig(info.data) : null;
}

export async function fetchRegistry(conn: Connection, pid = STATUS_PROGRAM_ID) {
  const info = await conn.getAccountInfo(registryPda(pid));
  return info ? decodeRegistry(info.data) : null;
}

/** Reads a wallet's on-chain Status score from the book (null = unscored / not deployed). */
export async function fetchOnchainScore(conn: Connection, wallet: PublicKey, pid = STATUS_PROGRAM_ID) {
  const reg = await fetchRegistry(conn, pid);
  if (!reg || reg.book.equals(PublicKey.default)) return null;
  const info = await conn.getAccountInfo(reg.book);
  return info ? bookLookup(info.data, wallet) : null;
}
