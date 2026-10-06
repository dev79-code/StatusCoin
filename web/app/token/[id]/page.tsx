import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint, getTokenMetadata } from "@solana/spl-token";
import { getLaunch } from "@/lib/launches";
import { fetchGate } from "@status/core/sdk";
import { DoorCheck } from "@/components/DoorCheck";
import { DoorLog } from "@/components/DoorLog";
import { GateBadge } from "@/components/GateBadge";
import { TokenAvatar } from "@/components/TokenAvatar";
import { fmtNum, short } from "@/lib/format";

interface View {
  id: string; name: string; ticker: string; minScore: number; tagline: string; hue: number; demo: boolean;
  holders?: number; avgScore?: number; bounced?: number; mcap?: number; probationCap?: string; openAfter?: number; exempt?: number;
}

async function load(id: string): Promise<View | null> {
  const demo = getLaunch(id);
  if (demo) return { ...demo, demo: true };
  let mint: PublicKey;
  try { mint = new PublicKey(id); } catch { return null; }
  const conn = new Connection(process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com", "confirmed");
  const [gate, meta, mintInfo] = await Promise.all([
    fetchGate(conn, mint).catch(() => null),
    getTokenMetadata(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID).catch(() => null),
    getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID).catch(() => null),
  ]);
  if (!gate) return null;
  return {
    id, demo: false, name: meta?.name || short(id), ticker: meta?.symbol || "???", minScore: gate.minScore,
    tagline: "A Status-gated token.", hue: parseInt(id.slice(0, 2), 36) * 7 % 360,
    probationCap: fmtNum(Number(gate.probationCap / 10n ** BigInt(mintInfo?.decimals ?? 0))), openAfter: Number(gate.openAfter), exempt: gate.exempt.length,
  };
}

export async function generateMetadata(props: PageProps<"/token/[id]">): Promise<Metadata> {
  const v = await load((await props.params).id);
  return v ? { title: `${v.name} ($${v.ticker})` } : {};
}

export default async function TokenPage(props: PageProps<"/token/[id]">) {
  const { id } = await props.params;
  const v = await load(id);
  if (!v) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-muted">
        <Link href="/launches" className="hover:text-text">Launches</Link><span className="text-dim">/</span>
        <span className="text-text">${v.ticker}</span>
        {v.demo && <span className="rounded-full border border-unranked/40 px-2 py-0.5 text-[10px] text-unranked">demo launch</span>}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="flex items-center gap-5">
            <TokenAvatar hue={v.hue} ticker={v.ticker} size={76} />
            <div>
              <h1 className="font-serif text-[52px] leading-none sm:text-[68px]">{v.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-dim">
                <span>${v.ticker}</span><span>·</span><GateBadge min={v.minScore} />
              </div>
            </div>
          </div>
          <p className="mt-7 max-w-xl text-[14px] leading-relaxed text-muted">{v.tagline}</p>

          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
            {(v.demo
              ? [["Market cap", `$${fmtNum(v.mcap!)}`], ["Holders", fmtNum(v.holders!)], ["Avg holder score", String(v.avgScore)], ["Bounced", fmtNum(v.bounced!)]]
              : [["Gate", `${v.minScore}+`], ["Probation cap", v.probationCap === "0" ? "none" : v.probationCap!], ["Opens to all", v.openAfter ? new Date(v.openAfter * 1000).toUTCString().slice(5, 22) : "never"], ["Exempt vaults", String(v.exempt)]]
            ).map(([k, val]) => (
              <div key={k} className="bg-surface/90 p-5">
                <div className="text-[10.5px] uppercase tracking-[0.16em] text-dim">{k}</div>
                <div className="mt-2 font-serif text-[30px] leading-none">{val}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-line bg-surface/60 p-6">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">The rules on this token</div>
            <ul className="mt-5 space-y-3 text-[13px] text-muted">
              <li><span className="text-accent">→</span> Buyers need a Status score of <span className="text-text">{v.minScore}+</span>. Enforced by the transfer hook on every transfer.</li>
              <li><span className="text-accent">→</span> Flagged bots and bundlers are blocked regardless of score.</li>
              <li><span className="text-accent">→</span> Unscored wallets may hold a small probation amount.</li>
              <li><span className="text-accent">→</span> <span className="text-text">Selling is never blocked.</span> The creator can only loosen these rules, never tighten them.</li>
            </ul>
          </div>
        </div>

        <aside className="space-y-6">
          <DoorCheck minScore={v.minScore} ticker={v.ticker} />
          {v.demo ? (
            <p className="rounded-full border border-line-2 py-3 text-center text-[11px] uppercase tracking-[0.14em] text-dim">Demo launch · not tradable</p>
          ) : (
          <div className="grid grid-cols-2 gap-3">
            <a href={`https://axiom.trade/meme/${v.id}`} target="_blank" rel="noreferrer" className="rounded-full border border-line-2 py-3 text-center text-[11px] uppercase tracking-[0.14em] hover:border-accent hover:text-accent">Axiom ↗</a>
            <a href={`https://jup.ag/swap/SOL-${v.id}`} target="_blank" rel="noreferrer" className="rounded-full border border-line-2 py-3 text-center text-[11px] uppercase tracking-[0.14em] hover:border-accent hover:text-accent">Jupiter ↗</a>
          </div>
          )}
          {v.demo && <DoorLog seed={v.ticker.charCodeAt(0)} title={`door · $${v.ticker}`} rows={14} only={{ ticker: v.ticker, minScore: v.minScore }} />}
        </aside>
      </div>
    </div>
  );
}
