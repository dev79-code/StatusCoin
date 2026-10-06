import { PublicKey } from "@solana/web3.js";
import type { StatusResult } from "@status/core/score/types";

/** Base URL of the Status backend (DigitalOcean droplet). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

export interface OnchainState {
  score: number | null; // score currently in the on-chain book (null = not published yet)
  flags: number;
  publishedAt: number | null;
  pending: boolean; // queued for the next publish batch
}
export interface ScoreResponse extends StatusResult {
  onchain: OnchainState;
}

export function isWallet(s: string) {
  try {
    return PublicKey.isOnCurve(new PublicKey(s).toBytes());
  } catch {
    return false;
  }
}

export async function fetchStatus(wallet: string, init?: RequestInit & { next?: { revalidate?: number } }): Promise<ScoreResponse> {
  const headers: Record<string, string> = {};
  // server-side only: lets Vercel's shared IPs bypass the backend rate limit
  if (typeof window === "undefined" && process.env.STATUS_API_KEY) headers["x-status-key"] = process.env.STATUS_API_KEY;
  const res = await fetch(`${API_URL}/v1/score/${wallet}`, { cache: "no-store", ...init, headers });
  if (!res.ok) throw new Error(`Status API ${res.status}`);
  return res.json();
}
