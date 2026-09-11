// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import type { Metadata } from "next";
import { site } from "@/config/site";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import { ArrowUpRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Build on magiCLOB",
  description:
    "magiCLOB's architecture at a glance: an on-chain CLOB, ephemeral-rollup execution, a typed SDK, and open-source infrastructure you can redeploy and own.",
};

const LAYERS = [
  {
    title: "On-chain matching",
    body: "The magiCLOB Anchor program validates tick size, lot size, and order minimums, then matches both sides of the book with a hard 13-level engine. Orders are only ever applied to the book through program logic.",
  },
  {
    title: "Ephemeral-rollup execution",
    body: "To keep latency low, vault state can be delegated to a Magicblock ephemeral rollup, where trading happens off the base layer, and settled back to Solana whenever you choose. The app configures the Magic Router automatically from a single environment variable.",
  },
  {
    title: "Settlement and data",
    body: "Every fill settles on the base layer and feeds the program's own indexer, which writes depth, candles, and a trade tape into the app's store. Market data is first-party: no oracle, no third-party feed.",
  },
];

const SDK_FEATURES = [
  "Create and bootstrap markets on any network",
  "Place, cancel, and replace limit and market orders",
  "Delegate vault state to an ephemeral rollup and settle back",
  "Read the book, depth, and trade tape from one typed client",
];

const PROGRAM_ID = "DSMktdhdDAGgittEg88wqrh2AJmNq6oj2YDnNnmeKeQe";

export default function BuildPage() {
  return (
    <main id="main" className="relative min-h-screen overflow-hidden bg-[#070b14] text-slate-200">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[140px]" />

      <SiteNav />

      <section className="relative mx-auto max-w-4xl px-5 pb-16 pt-40">
        <span className="rounded-full border border-white/10 bg-violet-600/10 px-3.5 py-1.5 font-mono text-xs font-semibold text-violet-400">
          {site.name} · open infrastructure
        </span>
        <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-50 sm:text-5xl">
          Build on {site.name}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-400 font-medium">
          {site.name} is a Central Limit Order Book you can call: a shared,
          programmatically accessible matching backend that any DEX, algorithmic trader, or mobile app can integrate.
          It runs as a single Anchor program - already deployed on devnet and mainnet - and trades on the base
          layer, with optional bursts through Magicblock Ephemeral Rollups.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={site.links.github}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center justify-center rounded-lg bg-violet-600 px-8 py-3.5 text-sm font-bold text-white transition-colors hover:bg-violet-500"
          >
            View on GitHub
            <ArrowUpRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2} />
          </a>
          <a
            href={site.links.sdk}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/10 bg-white/5 px-8 py-3.5 text-sm font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            @magiclob/sdk
          </a>
        </div>

        <p className="mt-10 inline-block rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 font-mono text-xs text-slate-400">
          Program (devnet):{" "}
          <a
            href={`https://solscan.io/account/${PROGRAM_ID}?cluster=devnet`}
            className="text-violet-400 transition-colors hover:text-violet-300 ml-1"
            target="_blank"
            rel="noreferrer"
          >
            {PROGRAM_ID}
          </a>
        </p>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 py-12">
        <h2 className="text-3xl font-bold tracking-tight text-slate-50">How it works</h2>
        <div className="mt-8 space-y-4">
          {LAYERS.map((l, i) => (
            <div key={l.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 transition-colors hover:border-violet-500/30 hover:bg-white/[0.04]">
              <div className="flex items-start gap-4">
                <span className="mt-1 flex-shrink-0 rounded-md bg-violet-400/10 px-2 py-1 font-mono text-sm font-bold text-violet-400">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">
                    {l.title}
                  </h3>
                  <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-slate-400">{l.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 py-12 mb-12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 transition-colors hover:border-violet-500/30 hover:bg-white/[0.04]">
          <h2 className="text-3xl font-bold tracking-tight text-slate-50">The SDK</h2>
          <p className="mt-4 max-w-[65ch] text-base leading-relaxed text-slate-400">
            <code className="rounded-md bg-white/[0.06] border border-white/10 px-1.5 py-0.5 font-mono text-sm text-slate-200">@magiclob/sdk</code>{" "}
            is the typed client for the program: a single dependency that resolves markets, builds and signs
            transactions, and reads the book and trade tape on local, devnet, or mainnet.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#04060a] p-5 font-mono text-sm text-slate-300 shadow-inner">
            {`npm install @magiclob/sdk`}
          </pre>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {SDK_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-slate-300 font-medium">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 mt-0.5">
                  <span className="font-mono text-xs text-emerald-400" aria-hidden="true">✓</span>
                </span>
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <a
              href={site.links.sdk}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-lg bg-white px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-slate-200"
            >
              Explore the SDK on GitHub
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}