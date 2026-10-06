import { Wordmark } from "./Wordmark";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-[12px] text-dim sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Wordmark className="text-muted" />
        <p>Scores are opinions computed from public on-chain data. Not financial advice. Sells are never blocked.</p>
      </div>
    </footer>
  );
}
