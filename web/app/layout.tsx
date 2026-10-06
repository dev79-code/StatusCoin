import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const serif = localFont({
  variable: "--font-serif",
  src: [
    { path: "./fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Status — not everyone gets in", template: "%s · Status" },
  description:
    "The Solana launchpad with an AI at the door. Bots, snipers and serial dumpers bounce — enforced on-chain by a transfer hook.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stage">
        <Providers>
          <Nav />
          <main className="flex-1 overflow-x-clip">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
