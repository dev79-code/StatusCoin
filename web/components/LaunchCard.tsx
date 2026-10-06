import Link from "next/link";
import type { Launch } from "@/lib/launches";
import { fmtNum } from "@/lib/format";
import { GateBadge } from "./GateBadge";
import { TokenAvatar } from "./TokenAvatar";

const age = (m: number) => (m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`);

export function LaunchCard({ l }: { l: Launch }) {
  const bounceRate = Math.round((l.bounced / (l.bounced + l.holders)) * 100);
  return (
    <Link
      href={`/token/${l.id}`}
      className="group relative flex flex-col gap-5 rounded-2xl border border-line bg-surface/70 p-5 transition hover:-translate-y-0.5 hover:border-line-2 hover:bg-surface-2"
    >
      <div className="flex items-start gap-3">
        <TokenAvatar hue={l.hue} ticker={l.ticker} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-serif text-[22px] leading-none">{l.name}</h3>
            <span className={`text-[12px] tabular-nums ${l.change24h >= 0 ? "text-accent" : "text-denied"}`}>
              {l.change24h >= 0 ? "+" : ""}{l.change24h.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-dim">
            <span>${l.ticker}</span><span>·</span><span>{age(l.ageMin)} ago</span>
          </div>
        </div>
      </div>
      <p className="text-[12.5px] leading-relaxed text-muted">{l.tagline}</p>
      <div className="flex items-center justify-between">
        <GateBadge min={l.minScore} />
        <span className="text-[11px] text-dim">mcap <span className="text-text">${fmtNum(l.mcap)}</span></span>
      </div>
      <div className="grid grid-cols-3 border-t border-line pt-4 text-[11px]">
        <div><div className="text-dim">holders</div><div className="mt-1 tabular-nums text-text">{fmtNum(l.holders)}</div></div>
        <div><div className="text-dim">avg score</div><div className="mt-1 tabular-nums text-text">{l.avgScore}</div></div>
        <div><div className="text-dim">bounced</div><div className="mt-1 tabular-nums text-denied">{bounceRate}%</div></div>
      </div>
    </Link>
  );
}
