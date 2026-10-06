"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

export function ScoreForm({ size = "lg" }: { size?: "lg" | "sm" }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { publicKey } = useWallet();

  const go = (addr: string) => {
    try {
      new PublicKey(addr.trim());
    } catch {
      setErr("That's not a Solana address.");
      return;
    }
    setBusy(true);
    router.push(`/score/${addr.trim()}`);
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); go(v); }}
      className={`w-full ${size === "lg" ? "max-w-xl" : "max-w-md"}`}
    >
      <div className="group flex items-center gap-2 rounded-full border border-line-2 bg-surface/80 p-1.5 pl-5 shadow-[0_0_0_1px_rgba(0,0,0,.4)] transition focus-within:border-accent/60 focus-within:shadow-[0_0_40px_-12px_var(--accent)]">
        <span className="text-dim select-none">$</span>
        <input
          value={v}
          onChange={(e) => { setV(e.target.value); setErr(""); }}
          placeholder="paste a wallet address"
          spellCheck={false}
          aria-label="Wallet address"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-[14px] text-text placeholder:text-dim focus:outline-none"
        />
        <button
          disabled={busy || !v}
          className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-black transition hover:brightness-110 disabled:bg-surface-2 disabled:text-dim"
        >
          {busy ? "Checking…" : "Check status"}
        </button>
      </div>
      <div className="mt-3 flex h-5 items-center justify-between px-5 text-[12px]">
        <span className="text-denied">{err}</span>
        {publicKey && (
          <button type="button" onClick={() => go(publicKey.toBase58())} className="text-muted underline-offset-4 hover:text-accent hover:underline">
            use connected wallet →
          </button>
        )}
      </div>
    </form>
  );
}
