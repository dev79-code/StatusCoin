import { doorEvents } from "@/lib/launches";

export function DoorLog({ seed = 7, title = "door log", rows = 24, only }: { seed?: number; title?: string; rows?: number; only?: { ticker: string; minScore: number } }) {
  const ev = doorEvents(rows, seed, only);
  const list = [...ev, ...ev];
  return (
    <div className="noise relative overflow-hidden rounded-2xl border border-line bg-surface/70">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-denied" /> {title}
        </span>
        <span className="text-dim">live · demo</span>
      </div>
      <div className="relative h-[264px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
        <ul className="animate-ticker">
          {list.map((e, i) => (
            <li key={i} className="grid grid-cols-[64px_1fr_auto] items-center gap-3 border-b border-line/50 px-4 py-2.5 text-[12px]">
              <span className={`font-semibold tracking-wider ${e.ok ? "text-accent" : "text-denied"}`}>{e.ok ? "IN" : "BOUNCED"}</span>
              <span className="truncate text-muted">
                <span className="text-text">{e.wallet}</span> <span className="text-dim">→ ${e.token}</span> · {e.reason}
              </span>
              <span className="tabular-nums text-dim">{e.score ?? "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
