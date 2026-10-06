export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-[13px] font-semibold tracking-[0.32em] ${className}`}>
      <span className="relative inline-flex h-2.5 w-2.5">
        <span className="absolute inset-0 rounded-full bg-accent opacity-60 blur-[3px]" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
      STATUS
    </span>
  );
}
