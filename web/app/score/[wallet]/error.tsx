"use client";
export default function ScoreError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-32 text-center">
      <div className="text-[11px] uppercase tracking-[0.2em] text-denied">The door is jammed</div>
      <h1 className="mt-4 font-serif text-[48px] leading-none">Couldn&apos;t reach the bouncer.</h1>
      <p className="mt-4 text-[13px] text-muted">The scoring service didn&apos;t answer. Try again in a moment.</p>
      <button onClick={reset} className="mt-8 rounded-full bg-accent px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-black">Retry</button>
    </div>
  );
}
