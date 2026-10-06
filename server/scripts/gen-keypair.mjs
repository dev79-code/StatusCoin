// Generate a Solana keypair file with zero dependencies.
//   node gen-keypair.mjs out.json   -> writes [64 bytes] and prints the base58 address
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";

const out = process.argv[2] || "scorer.json";
if (existsSync(out)) { console.error(`${out} already exists — not overwriting`); process.exit(1); }
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const d = Buffer.from(privateKey.export({ format: "jwk" }).d, "base64url");
const x = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
writeFileSync(out, JSON.stringify([...d, ...x]), { mode: 0o600 });

const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
let n = BigInt("0x" + x.toString("hex")), s = "";
while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
for (const b of x) { if (b === 0) s = "1" + s; else break; }
console.log(s);
