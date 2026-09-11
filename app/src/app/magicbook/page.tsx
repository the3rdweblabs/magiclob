// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import type { Metadata } from "next";
import { site } from "@/config/site";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";

export const metadata: Metadata = {
  title: "MagicBook - magiCLOB reference interface",
  description:
    "MagicBook is the reference trading interface for magiCLOB: a live order book, trade tape, and candlesticks against the on-chain CLOB, on local, devnet, or mainnet.",
};

const CAPABILITIES = [
  {
    title: "Live order book",
    body: "Depth for every listed pair, priced against the on-chain book with a hard 13-level engine per side.",
  },
  {
    title: "Trade tape and candles",
    body: "Every fill is indexed on-chain and rendered as a live tape and candlestick history. First-party market data.",
  },
  {
    title: "Open orders and vaults",
    body: "Manage your resting orders and delegate vault state to an ephemeral rollup for low-latency execution.",
  },
  {
    title: "Wallet or keypair",
    body: "Trade with a local demo keypair, or connect your own wallet when running against devnet or mainnet.",
  },
];

export default function MagicBookPage() {
  return (
    <main id="main" className="relative min-h-screen overflow-hidden bg-[#070b14] text-slate-200">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-cyan-600/15 blur-[140px]" />
      <div className="pointer-events-none absolute left-0 top-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-200px] top-1/2 h-[500px] w-[500px] rounded-full bg-cyan-500/10 blur-[150px]" />

      <SiteNav />

      <section className="relative mx-auto max-w-4xl px-5 pb-16 pt-20 sm:pt-24 lg:pt-28">
        <span className="animate-fade-in-up rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3.5 py-1 font-mono text-xs font-semibold text-cyan-400">
          {site.name} · reference interface
        </span>
        <h1 className="animate-fade-in-up mt-5 max-w-[16ch] bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-3xl font-black leading-[1.04] tracking-tight text-transparent sm:text-4xl md:text-5xl lg:text-[4.9rem]">
          {site.demo.name}
        </h1>
        <p className="animate-fade-in-up mt-5 max-w-2xl text-lg leading-7 text-slate-400">
          {site.demo.name} is the reference web interface for {site.name}: a browser-based trading venue that reads
          depth and fills from the on-chain CLOB and posts orders through the same program. It is the fastest way to
          see the engine in production.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={site.demo.app}
            className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-slate-200"
          >
            Open orderbook
          </a>
          <a
            href="/build"
            className="rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            Build with {site.name}
          </a>
        </div>

        <div
          className="mx-auto mt-16 h-px w-full max-w-3xl bg-gradient-to-r from-transparent via-white/25 to-transparent"
          aria-hidden="true"
        />
      </section>

      <section className="relative mx-auto max-w-4xl px-5 py-12">
        <h2 className="text-2xl font-bold text-slate-50">What you can do</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 transition-colors hover:border-cyan-500/30 hover:bg-white/[0.04]">
              <h3 className="text-base font-semibold text-slate-100">{c.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}