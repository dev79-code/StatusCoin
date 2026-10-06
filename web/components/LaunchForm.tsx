"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { buildLaunchTx, fetchRegistry } from "@status/core/sdk";
import { GATE_TIERS, TIER_STYLE, gateName } from "@/lib/tiers";
import { GateBadge } from "./GateBadge";
import { TokenAvatar } from "./TokenAvatar";

const DECIMALS = 6;
type Phase = { s: "idle" } | { s: "busy"; msg: string } | { s: "done"; mint: string; sig: string } | { s: "error"; msg: string };

export function LaunchForm() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible } = useWalletModal();

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [tagline, setTagline] = useState("");
  const [uri, setUri] = useState("");
  const [minScore, setMinScore] = useState(65);
  const [probation, setProbation] = useState(true);
  const [probationCap, setProbationCap] = useState(1_000_000);
  const [openHours, setOpenHours] = useState(0);
  const [exempt, setExempt] = useState("");
  const [phase, setPhase] = useState<Phase>({ s: "idle" });

  const hue = useMemo(() => [...(ticker || "S")].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360, [ticker]);
  const tier = TIER_STYLE[gateName(minScore)];
  const valid = name.trim().length > 1 && /^[A-Z0-9]{2,10}$/.test(ticker);

  async function launch() {
    if (!wallet.publicKey || !wallet.sendTransaction) return setVisible(true);
    try {
      let exemptKeys: PublicKey[] = [];
      if (exempt.trim()) exemptKeys = exempt.split(/[\s,]+/).filter(Boolean).map((k) => new PublicKey(k));
      setPhase({ s: "busy", msg: "Checking Status program…" });
      const reg = await fetchRegistry(connection);
      if (!reg) throw new Error("The Status program isn't deployed on this cluster yet (registry not found). Deploy it and run scripts/setup-registry.ts.");

      setPhase({ s: "busy", msg: "Building transaction…" });
      const { tx, mintKp, mint } = await buildLaunchTx(connection, {
        creator: wallet.publicKey,
        name: name.trim(),
        symbol: ticker,
        uri: uri.trim(),
        decimals: DECIMALS,
        gate: {
          minScore,
          probationCap: probation ? BigInt(probationCap) * 10n ** BigInt(DECIMALS) : 0n,
          openAfter: openHours > 0 ? BigInt(Math.floor(Date.now() / 1000) + openHours * 3600) : 0n,
          exempt: exemptKeys,
        },
      });
      setPhase({ s: "busy", msg: "Approve in your wallet…" });
      const sig = await wallet.sendTransaction(tx, connection, { signers: [mintKp] });
      setPhase({ s: "busy", msg: "Confirming on-chain…" });
      await connection.confirmTransaction(sig, "confirmed");
      setPhase({ s: "done", mint: mint.toBase58(), sig });
    } catch (e) {
      setPhase({ s: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  }

  const label = "text-[11px] uppercase tracking-[0.16em] text-muted";
  const input = "mt-2 w-full rounded-xl border border-line-2 bg-surface-2 px-4 py-3 text-[14px] text-text placeholder:text-dim focus:border-accent/60 focus:outline-none";

  return (
    <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_400px]">
      <form onSubmit={(e) => { e.preventDefault(); launch(); }} className="space-y-10">
        <fieldset className="grid gap-5 sm:grid-cols-[1fr_180px]">
          <label className="block"><span className={label}>Name</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Velvet Rope" maxLength={32} /></label>
          <label className="block"><span className={label}>Ticker</span>
            <input className={input} value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ROPE" maxLength={10} /></label>
          <label className="block sm:col-span-2"><span className={label}>One-liner</span>
            <input className={input} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Diamond hands or nothing." maxLength={80} /></label>
          <label className="block sm:col-span-2"><span className={label}>Metadata URI <span className="normal-case tracking-normal text-dim">(optional · JSON with image)</span></span>
            <input className={input} value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…/token.json" /></label>
        </fieldset>

        <fieldset>
          <legend className={label}>Who gets in</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {GATE_TIERS.map((g) => {
              const t = TIER_STYLE[g.key];
              const active = gateName(minScore) === g.key;
              return (
                <button type="button" key={g.key} onClick={() => setMinScore(g.min)}
                  className="rounded-2xl border p-5 text-left transition"
                  style={{ borderColor: active ? t.color : "var(--line-2)", background: active ? `color-mix(in srgb, ${t.color} 8%, var(--surface))` : "var(--surface)" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-[26px] italic" style={{ color: t.color }}>{g.name}</span>
                    <span className="text-[12px] text-muted">{g.min}+</span>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">{g.desc}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center gap-5">
            <input type="range" min={0} max={100} value={minScore} onChange={(e) => setMinScore(+e.target.value)} className="flex-1" style={{ accentColor: tier.color }} aria-label="Minimum score" />
            <span className="w-14 text-right font-serif text-[32px] leading-none" style={{ color: tier.color }}>{minScore}</span>
          </div>
        </fieldset>

        <fieldset className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-line-2 bg-surface p-5">
            <label className="flex items-center justify-between">
              <span className={label}>Probation for newcomers</span>
              <input type="checkbox" checked={probation} onChange={(e) => setProbation(e.target.checked)} className="h-4 w-4" style={{ accentColor: "var(--accent)" }} />
            </label>
            <p className="mt-2 text-[12px] text-dim">Unscored wallets can hold up to this many tokens.</p>
            <input type="number" disabled={!probation} className={`${input} disabled:opacity-40`} value={probationCap} onChange={(e) => setProbationCap(Math.max(0, +e.target.value))} />
          </div>
          <div className="rounded-2xl border border-line-2 bg-surface p-5">
            <span className={label}>Open to everyone after</span>
            <p className="mt-2 text-[12px] text-dim">0 = gated forever. Can only be brought earlier later.</p>
            <div className="mt-2 flex items-center gap-3">
              <input type="number" min={0} className={input} value={openHours} onChange={(e) => setOpenHours(Math.max(0, +e.target.value))} />
              <span className="mt-2 text-[12px] text-muted">hours</span>
            </div>
          </div>
          <label className="block sm:col-span-2"><span className={label}>Exempt pool / curve vault owners <span className="normal-case tracking-normal text-dim">(advanced · where sells go)</span></span>
            <input className={input} value={exempt} onChange={(e) => setExempt(e.target.value)} placeholder="pool authority pubkey(s), comma separated — you can add these later" /></label>
        </fieldset>
      </form>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="text-[11px] uppercase tracking-[0.16em] text-dim">Preview</div>
        <div className="mt-3 rounded-2xl border border-line bg-surface/80 p-6">
          <div className="flex items-center gap-4">
            <TokenAvatar hue={hue} ticker={ticker || "?"} size={56} />
            <div className="min-w-0">
              <div className="truncate font-serif text-[30px] leading-none">{name || "Your token"}</div>
              <div className="mt-2 text-[12px] text-dim">${ticker || "TICKER"}</div>
            </div>
          </div>
          <p className="mt-5 text-[13px] text-muted">{tagline || "Your one-liner goes here."}</p>
          <div className="mt-5"><GateBadge min={minScore} /></div>
          <ul className="mt-6 space-y-2 border-t border-line pt-5 text-[12px] text-muted">
            <li>Token-2022 · transfer hook · on-chain metadata</li>
            <li>Bots & bundlers: <span className="text-denied">blocked</span></li>
            <li>Unscored: {probation ? <span className="text-unranked">≤ {probationCap.toLocaleString()} tokens</span> : <span className="text-denied">blocked</span>}</li>
            <li>Opens to all: <span className="text-text">{openHours ? `in ${openHours}h` : "never"}</span></li>
            <li>Sells: <span className="text-accent">always allowed</span></li>
          </ul>
        </div>

        <button
          onClick={launch}
          disabled={!valid || phase.s === "busy"}
          className="mt-5 w-full rounded-full bg-accent py-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110 disabled:bg-surface-2 disabled:text-dim"
        >
          {!wallet.publicKey ? "Connect wallet to launch" : phase.s === "busy" ? phase.msg : "Launch on Status"}
        </button>
        {!valid && <p className="mt-3 text-center text-[11px] text-dim">Name + 2–10 character ticker required.</p>}

        {phase.s === "error" && <p className="mt-4 rounded-xl border border-denied/40 bg-denied/5 p-4 text-[12px] leading-relaxed text-denied">{phase.msg}</p>}
        {phase.s === "done" && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-4 text-[12px] leading-relaxed">
            <div className="text-accent">Launched. The door is live.</div>
            <Link href={`/token/${phase.mint}`} className="mt-2 block break-all text-text underline underline-offset-4">{phase.mint}</Link>
          </div>
        )}
      </aside>
    </div>
  );
}
