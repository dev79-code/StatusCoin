import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchStatus, isWallet, type ScoreResponse } from "@/lib/api";
import { StatusCard } from "@/components/StatusCard";
import { ScoreRing } from "@/components/ScoreRing";
import { ShareBar } from "@/components/ShareBar";
import { ScoreForm } from "@/components/ScoreForm";
import { GateBadge } from "@/components/GateBadge";
import { TokenAvatar } from "@/components/TokenAvatar";
import { TIER_STYLE } from "@/lib/tiers";
import { LAUNCHES } from "@/lib/launches";
import { short } from "@/lib/format";

export async function generateMetadata(props: PageProps<"/score/[wallet]">): Promise<Metadata> {
  const { wallet } = await props.params;
  if (!isWallet(wallet)) return {};
  const r = await fetchStatus(wallet);
  return {
    title: `${short(wallet)} — ${TIER_STYLE[r.tier].label} ${r.score ?? ""}`,
    description: r.roast,
  };
}

export default async function ScorePage(props: PageProps<"/score/[wallet]">) {
  const { wallet } = await props.params;
  if (!isWallet(wallet)) notFound();
  const r = await fetchStatus(wallet);
  const t = TIER_STYLE[r.tier];
  const maxImpact = Math.max(10, ...r.factors.map((f) => Math.abs(f.impact)));
  const shareText =
    r.score === null
      ? `The Status AI doesn't know who I am yet. Probation pass only.`
      : `My Status: ${r.score}/100 — ${t.label}. "${r.roast}"`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 md:pt-16">
      <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted">
        <Link href="/" className="hover:text-text">Status</Link><span className="text-dim">/</span>
        <span className="text-text">{short(wallet, 6)}</span>
        {r.source === "demo" && (
          <span className="rounded-full border border-unranked/40 px-2 py-0.5 text-[10px] text-unranked">demo data · add HELIUS_API_KEY for live</span>
        )}
      </div>

      <section className="mt-10 grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div className="rise">
          <div className="text-[11px] uppercase tracking-[0.22em]" style={{ color: t.color }}>{t.glyph} {t.line}</div>
          <h1 className="mt-4 font-serif text-[64px] leading-[0.95] sm:text-[84px]">
            <span className="italic" style={{ color: t.color }}>{t.label}</span>
            {r.flagged && <span className="ml-3 align-middle text-[14px] font-mono not-italic tracking-[0.2em] text-denied">FLAGGED</span>}
          </h1>
          <blockquote className="mt-7 max-w-lg border-l-2 pl-5 font-serif text-[24px] italic leading-snug text-text/90" style={{ borderColor: t.color }}>
            “{r.roast}”
          </blockquote>
          <div className="mt-2 pl-5 text-[11px] uppercase tracking-[0.16em] text-dim">— the bouncer</div>
          <div className="mt-9"><ShareBar text={shareText} path={`/score/${wallet}`} /></div>
          <OnchainLine r={r} />
        </div>
        <div className="flex justify-center rise [animation-delay:.1s] lg:justify-end">
          <StatusCard r={r} />
        </div>
      </section>

      <section className="mt-20 grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface/70 p-8">
          <ScoreRing score={r.score} color={t.color} />
          <div className="mt-4 text-[11px] uppercase tracking-[0.18em] text-dim">status score</div>
        </div>
        <div className="rounded-2xl border border-line bg-surface/70 p-6 sm:p-8">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted">
            <span>Why</span><span className="text-dim">base 38 · ± signals</span>
          </div>
          {r.factors.length === 0 ? (
            <p className="mt-6 text-[13px] text-muted">Not enough swap history to score this wallet yet. It trades on a probation pass — small buys only.</p>
          ) : (
            <ul className="mt-6 space-y-4">
              {r.factors.map((f) => (
                <li key={f.key} className="grid grid-cols-[130px_1fr_52px] items-center gap-4 text-[12.5px] sm:grid-cols-[160px_1fr_60px]">
                  <div><div className="text-text">{f.label}</div><div className="text-dim">{f.value}</div></div>
                  <div className="relative h-2 rounded-full bg-line">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-line-2" />
                    <div
                      className="absolute inset-y-0 rounded-full"
                      style={{
                        background: f.impact >= 0 ? "var(--accent)" : "var(--denied)",
                        left: f.impact >= 0 ? "50%" : `${50 - (Math.abs(f.impact) / maxImpact) * 50}%`,
                        width: `${(Math.abs(f.impact) / maxImpact) * 50}%`,
                      }}
                    />
                  </div>
                  <div className={`text-right tabular-nums ${f.impact >= 0 ? "text-accent" : "text-denied"}`}>{f.impact > 0 ? "+" : ""}{f.impact}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-line bg-surface/70 p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Doors tonight</div>
        <ul className="mt-5 divide-y divide-line">
          {LAUNCHES.map((l) => {
            const ok = !r.flagged && r.score !== null && r.score >= l.minScore;
            const probation = r.score === null && !r.flagged;
            return (
              <li key={l.id}>
                <Link href={`/token/${l.id}`} className="flex items-center gap-4 py-3.5 hover:bg-surface-2/50">
                  <TokenAvatar hue={l.hue} ticker={l.ticker} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-serif text-[19px] leading-none">{l.name}</div>
                    <div className="mt-1 text-[11px] text-dim">${l.ticker}</div>
                  </div>
                  <GateBadge min={l.minScore} className="hidden sm:inline-flex" />
                  <span className={`w-24 text-right text-[11px] font-semibold uppercase tracking-[0.14em] ${ok ? "text-accent" : probation ? "text-unranked" : "text-denied"}`}>
                    {ok ? "You're in" : probation ? "Probation" : "Bounced"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-20 flex flex-col items-center gap-6 text-center">
        <h2 className="font-serif text-[40px] leading-none">Check <span className="italic text-muted">another</span> wallet</h2>
        <ScoreForm size="sm" />
      </section>
    </div>
  );
}

function OnchainLine({ r }: { r: ScoreResponse }) {
  const o = r.onchain;
  let text: string, color: string;
  if (r.score === null) { text = "Unscored wallets aren't written on-chain — probation rules apply."; color = "var(--unranked)"; }
  else if (o.score !== null && !o.pending) { text = `On the list · score ${o.score} is live on-chain`; color = "var(--accent)"; }
  else if (o.pending) { text = "Queued · your score goes on-chain in the next batch (≈1 min)"; color = "var(--elite)"; }
  else { text = "Not on-chain yet"; color = "var(--muted)"; }
  return (
    <div className="mt-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em]" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} /> {text}
    </div>
  );
}
