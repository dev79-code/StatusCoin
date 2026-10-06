"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

const links = [
  { href: "/launches", label: "Launches" },
  { href: "/launch", label: "Launch" },
  { href: "/#how", label: "How it works" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Status home"><Wordmark /></Link>
        <nav className="hidden items-center gap-7 text-[12px] uppercase tracking-[0.14em] text-muted md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`transition-colors hover:text-text ${path === l.href ? "text-text" : ""}`}>
              {l.label}
            </Link>
          ))}
        </nav>
        <WalletMultiButton />
      </div>
    </header>
  );
}
