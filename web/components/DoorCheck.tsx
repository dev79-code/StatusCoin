"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { API_URL, type ScoreResponse } from "@/lib/api";
import { TIER_STYLE } from "@/lib/tiers";

export function DoorCheck({ minScore, ticker }: { minScore: number; ticker: string }) {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [data, setData] = useState<ScoreResponse | null>(null);
  const key = publicKey?.toBase58();

  useEffect(() => {
    if (!key) return;
    let live = true;
    fetch(`${API_URL}/v1/score/${key}`).then((x) => x.json()).then((j) => { if (live) setData(j); });
    return () => { live = false; };
  }, [key]);

  const r = data && data.wallet === key ? data : null;

  if (!publicKey) {
    return (
      <div className="rounded-2xl border border-line bg-surface/80 p-6">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Door check</div>
        <p className="mt-4 font-serif text-[28px] leading-tight">Will you get in?</p>
        <button onClick={() => setVisible(true)} className="mt-6 w-full rounded-full bg-accent py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-black hover:brightness-110">
          Connect wallet
        </button>
      </div>
    );
  }
  if (!r) {
    return <div className="h-[220px] animate-pulse rounded-2xl border border-line bg-surface/80" />;
  }
  const t = TIER_STYLE[r.tier];
  const ok = !r.flagged && r.score !== null && r.score >= minScore;
  const probation = r.score === null && !r.flagged;
  const state = ok ? { label: "You're in", c: "var(--accent)", d: `Your ${r.score} clears the ${minScore} bar. Buy $${ticker} anywhere — Axiom, Jupiter, your wallet.` }
    : probation ? { label: "Probation", c: "var(--unranked)", d: `You're unscored. Small buys only until the AI has seen more of your history.` }
    : { label: "Bounced", c: "var(--denied)", d: r.flagged ? "Your wallet is flagged for bot behaviour. Every buy will fail." : `You need ${minScore}. You have ${r.score}. Buys of $${ticker} will fail — selling always works.` };

  return (
    <div className="rounded-2xl border bg-surface/80 p-6" style={{ borderColor: `color-mix(in srgb, ${state.c} 40%, var(--line))` }}>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted">
        <span>Door check</span>
        <span style={{ color: t.color }}>{t.glyph} {t.label} {r.score ?? ""}</span>
      </div>
      <p className="mt-4 font-serif text-[40px] italic leading-none" style={{ color: state.c }}>{state.label}</p>
      <p className="mt-4 text-[13px] leading-relaxed text-muted">{state.d}</p>
      <Link href={`/score/${r.wallet}`} className="mt-5 inline-block text-[12px] text-muted underline-offset-4 hover:text-accent hover:underline">See full score →</Link>
    </div>
  );
}
