"use client";
import { useState } from "react";

export function ShareBar({ text, path }: { text: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <div className="flex flex-wrap gap-3">
      <a href={x} target="_blank" rel="noreferrer" className="rounded-full bg-accent px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-black hover:brightness-110">
        Share on X
      </a>
      <button
        onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="rounded-full border border-line-2 px-5 py-2.5 text-[12px] uppercase tracking-[0.12em] text-text hover:border-accent hover:text-accent"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
