import { TIER_STYLE } from "@/lib/tiers";
import { gateName } from "@/lib/tiers";

export function GateBadge({ min, className = "" }: { min: number; className?: string }) {
  const t = TIER_STYLE[gateName(min)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] ${className}`}
      style={{ color: t.color, borderColor: `color-mix(in srgb, ${t.color} 35%, transparent)`, background: `color-mix(in srgb, ${t.color} 8%, transparent)` }}
    >
      {t.glyph} {t.label} · {min}+
    </span>
  );
}
