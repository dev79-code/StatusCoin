import type { StatusResult } from "@status/core/score/types";
import { TIER_STYLE } from "@/lib/tiers";
import { short } from "@/lib/format";

export function StatusCard({ r }: { r: Pick<StatusResult, "wallet" | "score" | "tier" | "verdict"> }) {
  const t = TIER_STYLE[r.tier];
  const no = ([...r.wallet].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) % 9000) + 1000;
  return (
    <div
      className="sheen noise relative aspect-[1.586] w-full max-w-[460px] rounded-[22px] border p-6 sm:p-7"
      style={{
        borderColor: `color-mix(in srgb, ${t.color} 40%, transparent)`,
        background: `radial-gradient(120% 90% at 100% 0%, color-mix(in srgb, ${t.color} 22%, transparent), transparent 55%),
                     radial-gradient(80% 80% at 0% 100%, color-mix(in srgb, ${t.color} 10%, transparent), transparent 60%),
                     linear-gradient(160deg, #15151b, #08080a)`,
        boxShadow: `0 30px 80px -30px color-mix(in srgb, ${t.color} 45%, transparent), inset 0 1px 0 rgba(255,255,255,.06)`,
      }}
    >
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <span className="text-[11px] font-semibold tracking-[0.34em] text-text/90">STATUS</span>
          <span className="text-[11px] tracking-[0.2em]" style={{ color: t.color }}>{t.glyph} N° {no}</span>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted">{r.verdict}</div>
          <div className="mt-1 flex items-end justify-between gap-4">
            <span className="font-serif text-[46px] italic leading-none sm:text-[56px]" style={{ color: t.color }}>{t.label}</span>
            <span className="font-serif text-[46px] leading-none text-text sm:text-[56px]">{r.score ?? "—"}</span>
          </div>
        </div>
        <div className="flex items-end justify-between text-[11px] tracking-[0.16em] text-muted">
          <span>{short(r.wallet, 6)}</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => <span key={i} className="h-3 w-5 rounded-sm border border-white/15 bg-white/5" />)}
          </span>
        </div>
      </div>
    </div>
  );
}
