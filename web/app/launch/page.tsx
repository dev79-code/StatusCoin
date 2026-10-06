import type { Metadata } from "next";
import { LaunchForm } from "@/components/LaunchForm";

export const metadata: Metadata = { title: "Launch" };

export default function LaunchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6 md:pt-20">
      <div className="text-[11px] uppercase tracking-[0.22em] text-accent">New launch</div>
      <h1 className="mt-4 font-serif text-[56px] leading-none sm:text-[80px]">Set the <span className="italic text-muted">bar.</span></h1>
      <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-muted">
        One transaction creates your Token-2022 mint with the Status hook and metadata, and writes your gate on-chain.
        You can lower the bar later. You can never raise it.
      </p>
      <LaunchForm />
    </div>
  );
}
