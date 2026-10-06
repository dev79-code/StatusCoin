import Link from "next/link";
import { ScoreForm } from "@/components/ScoreForm";
import { DoorLog } from "@/components/DoorLog";
import { LaunchCard } from "@/components/LaunchCard";
import { StatusCard } from "@/components/StatusCard";
import { LAUNCHES } from "@/lib/launches";
import { GATE_TIERS, TIER_STYLE } from "@/lib/tiers";

const STEPS = [
  { n: "01", t: "The AI reads your wallet", d: "Hold times, flip rate, wallet age, bundle clusters, rug links. Every wallet gets a Status score from 0 to 100." },
  { n: "02", t: "Your score goes on-chain", d: "Scores are published to one shared score book on Solana. Public, verifiable, updated as you trade." },
  { n: "03", t: "The hook checks the door", d: "Every Status token carries a Token-2022 transfer hook. On every buy, it checks the receiver's score. Too low? The transaction fails." },
];

const PROMISES = [
  { t: "Sells are never blocked", d: "The hook only checks wallets receiving tokens. Selling into a pool always works. No honeypots — ever." },
  { t: "Creators can only loosen", d: "A gate can be lowered, opened or widened — never tightened after launch. Enforced by the program." },
  { t: "Trade where you trade", d: "Axiom, Photon, Jupiter, your wallet. The hook runs inside the token itself, wherever the swap comes from." },
  { t: "Newcomers aren't shut out", d: "Unscored wallets get a probation pass — small buys allowed until the AI has seen enough history." },
];

export default function Home() {
  return (
    <>
      {/* HERO */}
      <section className="mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-16 sm:px-6 md:pt-24 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <div className="rise">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-line-2 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> AI-gated launchpad · Solana
          </div>
          <h1 className="font-serif text-[64px] leading-[0.92] tracking-[-0.01em] sm:text-[88px] lg:text-[104px]">
            Not everyone<br /><span className="italic text-accent">gets in.</span>
          </h1>
          <p className="mt-7 max-w-lg text-[14.5px] leading-relaxed text-muted">
            Status is the launchpad with an AI at the door. Every wallet gets a score. Every token sets a bar.
            Bots, snipers and serial dumpers bounce — enforced on-chain, on every single buy.
          </p>
          <div className="mt-9"><ScoreForm /></div>
        </div>
        <div className="relative rise [animation-delay:.15s]">
          <div className="absolute -inset-10 -z-10 rounded-full bg-elite/10 blur-3xl" />
          <div className="rotate-[-4deg] transition hover:rotate-0">
            <StatusCard r={{ wallet: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", score: 94, tier: "ELITE", verdict: "Diamond hands" }} />
          </div>
          <div className="ml-auto mt-[-70px] w-[78%] rotate-[3deg] opacity-80 transition hover:rotate-0 hover:opacity-100">
            <StatusCard r={{ wallet: "3Kd8fPq1vM8sTzN2uW4pYbLrX6cE5aG7hJ9kQ2mV1nB", score: 22, tier: "DENIED", verdict: "Serial dumper" }} />
          </div>
        </div>
      </section>

      {/* LIVE */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
          <DoorLog />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {[
              ["24,511", "wallets bounced", "text-denied"],
              ["0", "honeypots possible", "text-accent"],
              ["1 tx", "to launch a gated token", "text-text"],
              ["≤12k", "compute units per door check", "text-text"],
            ].map(([n, l, c]) => (
              <div key={l} className="flex flex-col justify-end bg-surface/90 p-6">
                <div className={`font-serif text-[46px] leading-none ${c}`}>{n}</div>
                <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-dim">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-dim">Door log and bounce count are demo data until mainnet. Compute cost measured on a local validator.</p>
      </section>

      {/* HOW */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
        <SectionHead kicker="How the door works" title={<>An AI decides. <span className="italic text-muted">The chain enforces.</span></>} />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-surface/90 p-7">
              <div className="text-[11px] tracking-[0.2em] text-accent">{s.n}</div>
              <h3 className="mt-5 font-serif text-[28px] leading-tight">{s.t}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{s.d}</p>
            </div>
          ))}
        </div>
        <HookDiagram />
      </section>

      {/* TIERS */}
      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <SectionHead kicker="The list" title={<>Three doors. <span className="italic text-muted">Pick your crowd.</span></>} />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {[...GATE_TIERS].reverse().map((g) => {
            const t = TIER_STYLE[g.key];
            return (
              <div key={g.key} className="relative overflow-hidden rounded-2xl border bg-surface/80 p-7" style={{ borderColor: `color-mix(in srgb, ${t.color} 25%, var(--line))` }}>
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ background: `color-mix(in srgb, ${t.color} 18%, transparent)` }} />
                <div className="text-[28px]" style={{ color: t.color }}>{t.glyph}</div>
                <div className="mt-6 flex items-baseline justify-between">
                  <h3 className="font-serif text-[40px] italic leading-none" style={{ color: t.color }}>{g.name}</h3>
                  <span className="text-[13px] text-muted">score {g.min}+</span>
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-muted">{g.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* LAUNCHES */}
      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <div className="flex items-end justify-between gap-6">
          <SectionHead kicker="Tonight" title={<>On the list <span className="italic text-muted">right now.</span></>} />
          <Link href="/launches" className="hidden shrink-0 text-[12px] uppercase tracking-[0.14em] text-muted hover:text-accent sm:block">All launches →</Link>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LAUNCHES.slice(0, 3).map((l) => <LaunchCard key={l.id} l={l} />)}
        </div>
      </section>

      {/* PROMISES */}
      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <SectionHead kicker="House rules" title={<>Strict at the door. <span className="italic text-muted">Fair inside.</span></>} />
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {PROMISES.map((p) => (
            <div key={p.t} className="flex gap-5 rounded-2xl border border-line bg-surface/70 p-6">
              <span className="mt-1 text-accent">✓</span>
              <div>
                <h3 className="text-[15px] text-text">{p.t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{p.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
        <div className="noise relative overflow-hidden rounded-3xl border border-line-2 bg-surface px-6 py-16 text-center sm:px-12">
          <div className="absolute inset-x-0 -top-40 mx-auto h-80 w-[60%] rounded-full bg-accent/10 blur-3xl" />
          <h2 className="relative font-serif text-[48px] leading-none sm:text-[72px]">What&apos;s your <span className="italic text-accent">Status?</span></h2>
          <p className="relative mx-auto mt-5 max-w-md text-[13.5px] text-muted">Paste any wallet. Get the score, the tier, and an AI roast you&apos;ll want to screenshot.</p>
          <div className="relative mt-9 flex justify-center"><ScoreForm /></div>
        </div>
      </section>
    </>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.22em] text-accent">{kicker}</div>
      <h2 className="mt-4 max-w-2xl font-serif text-[44px] leading-[1] sm:text-[60px]">{title}</h2>
    </div>
  );
}

function HookDiagram() {
  const box = "rounded-xl border border-line-2 bg-surface-2 px-4 py-3 text-center text-[12px]";
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface/60 p-6">
      <div className="flex min-w-[720px] items-center gap-3 text-muted">
        <div className={box}><div className="text-text">Buyer</div><div className="text-dim">Axiom · Jupiter · wallet</div></div>
        <Arrow label="swap" />
        <div className={box}><div className="text-text">Token-2022</div><div className="text-dim">transfer_checked</div></div>
        <Arrow label="calls" />
        <div className={`${box} border-accent/40`}><div className="text-accent">Status hook</div><div className="text-dim">score ≥ gate?</div></div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2"><Arrow label="" short /><span className="rounded-full border border-accent/40 px-3 py-1 text-[11px] text-accent">IN · transfer settles</span></div>
          <div className="flex items-center gap-2"><Arrow label="" short /><span className="rounded-full border border-denied/40 px-3 py-1 text-[11px] text-denied">BOUNCED · tx fails</span></div>
        </div>
      </div>
    </div>
  );
}

function Arrow({ label, short = false }: { label: string; short?: boolean }) {
  return (
    <div className={`flex flex-col items-center ${short ? "w-8" : "flex-1"}`}>
      <span className="mb-1 text-[10px] uppercase tracking-[0.14em] text-dim">{label}</span>
      <div className="relative h-px w-full bg-line-2"><span className="absolute -right-0.5 -top-[3px] h-[7px] w-[7px] rotate-45 border-r border-t border-line-2" /></div>
    </div>
  );
}
