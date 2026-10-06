import type { Metadata } from "next";
import { LaunchCard } from "@/components/LaunchCard";
import { LAUNCHES } from "@/lib/launches";

export const metadata: Metadata = { title: "Launches" };

export default function Launches() {
  const groups = [
    { name: "Elite", min: 85 },
    { name: "Verified", min: 65 },
    { name: "Open", min: 40 },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
      <div className="text-[11px] uppercase tracking-[0.22em] text-accent">All launches · demo</div>
      <h1 className="mt-4 font-serif text-[56px] leading-none sm:text-[80px]">Who&apos;s <span className="italic text-muted">on the list.</span></h1>
      {groups.map((g) => {
        const ls = LAUNCHES.filter((l) => (g.min === 40 ? l.minScore < 65 : g.min === 65 ? l.minScore >= 65 && l.minScore < 85 : l.minScore >= 85));
        if (!ls.length) return null;
        return (
          <section key={g.name} className="mt-14">
            <div className="mb-5 flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-muted">
              <span>{g.name} doors</span><span className="h-px flex-1 bg-line" /><span className="text-dim">{ls.length}</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{ls.map((l) => <LaunchCard key={l.id} l={l} />)}</div>
          </section>
        );
      })}
    </div>
  );
}
