// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { site } from "@/config/site";
import SiteFooter from "@/components/site/SiteFooter";
import SiteNav from "@/components/site/SiteNav";
import NetworkStatus from "@/components/site/NetworkStatus";
import { RotatingWord } from "@/components/site/RotatingWord";
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Code2,
  GitFork,
  Globe,
  Layers,
  Package,
  Rocket,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: Layers,
    title: "On-chain matching",
    body: "Ticks, lots, and order minimums are validated on-chain, and a hard 13-level engine matches each side of the book. A real central limit order book, not an order queue.",
  },
  {
    icon: Zap,
    title: "Ephemeral-rollup execution",
    body: "Vault state can be delegated to a Magicblock ephemeral rollup for low-latency trading, then settled back to the Solana base layer on your schedule.",
  },
  {
    icon: Code2,
    title: "Type-safe SDK",
    body: "@magiclob/sdk is a lightweight client for the deployed program, giving any application first-class access to matching, vaults, and settlement.",
  },
  {
    icon: BarChart3,
    title: "First-party market data",
    body: "The engine's own indexer turns every fill into depth, candles, and a trade tape. No oracle, no third-party feed.",
  },
  {
    icon: Globe,
    title: "One book, every network",
    body: "The same program runs on local, devnet, and mainnet. Develop against a live book in seconds with the demo keypair, then point your app at a deployed market on devnet or mainnet - one SDK, no code changes.",
  },
  {
    icon: GitFork,
    title: "Open infrastructure",
    body: "GPL-3.0 source you can read and audit. Trade against the deployed program, or fork and redeploy the venue under your own keypair - the code is yours either way.",
  },
];

const STEPS = [
  {
    icon: Package,
    n: "01",
    title: "Install",
    body: "One dependency, typed end to end. @magiclob/sdk resolves markets, signs transactions, and reads the book.",
  },
  {
    icon: BookOpenCheck,
    n: "02",
    title: "Read",
    body: "Depth, the trade tape, and candles straight from the live program. First-party market data, no oracle.",
  },
  {
    icon: ArrowLeftRight,
    n: "03",
    title: "Trade",
    body: "Place, cancel, and replace limit and market orders in a transaction, from any app.",
  },
  {
    icon: Rocket,
    n: "04",
    title: "Ship",
    body: "The venue is already deployed on devnet and mainnet - your app points the SDK at it and starts trading. No venue to run.",
  },
];

export default function HomePage() {
  return (
    <main id="main" className="relative min-h-screen overflow-hidden bg-[#070b14] text-slate-200">
      {/* high-tech glowing backgrounds */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[140px]" />
      <div className="pointer-events-none absolute left-0 top-1/3 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-200px] top-1/2 h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-[150px]" />

      <SiteNav />

      {/* hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-20 sm:pt-24 lg:pt-28">
        <div className="mb-6 flex justify-start animate-fade-in-up">
          <NetworkStatus />
        </div>
        <h1 className="max-w-[16ch] text-left text-3xl font-black leading-[1.04] tracking-tight text-slate-50 [-webkit-text-stroke:1px_#f8fafc] sm:text-4xl md:text-5xl lg:text-[4.9rem]">
          Where Solana Liquidity <RotatingWord />.
        </h1>
        <p className="ml-auto mt-8 w-full bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-right text-sm leading-relaxed font-medium text-transparent sm:w-3/5 lg:text-base">
          {site.description}
        </p>

        {/* CTAs down below */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="/build"
            className="group inline-flex items-center justify-center rounded-lg bg-white px-8 py-4 text-sm font-bold text-slate-950 transition-colors hover:bg-slate-200"
          >
            Start building
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href={site.demo.url}
            className="rounded-lg border border-white/10 bg-white/5 px-8 py-4 text-sm font-semibold text-slate-200 transition-colors hover:border-white/20 hover:bg-white/10"
          >
            Start trading
          </a>
        </div>
      </section>

      {/* real product preview */}
      <section aria-label="Live venue preview" className="relative mx-auto max-w-6xl px-5 pb-8">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-panel/50">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div className="flex items-center gap-2 font-mono text-xs tracking-wide text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
              live · {site.demo.name}
            </div>
            <a
              href={site.demo.app}
              className="text-xs font-semibold text-violet-300 transition-colors hover:text-violet-200"
            >
              Open full venue →
            </a>
          </div>
          <div className="pointer-events-none select-none">
            <iframe
              src={site.demo.app}
              title={`${site.demo.name} live preview`}
              className="h-[380px] w-full border-0 sm:h-[460px]"
            />
          </div>
        </div>
      </section>

      {/* built with */}
      <section aria-label="Built with" className="relative mx-auto max-w-6xl px-5 py-12 text-center">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
          Built with
        </p>
        <div
          className="mx-auto mt-4 h-px w-full max-w-md bg-gradient-to-r from-transparent via-white/25 to-transparent"
          aria-hidden="true"
        />
        <div className="mt-8 flex flex-wrap items-center justify-center gap-12 sm:gap-16">
          <a
            href="https://solana.com"
            target="_blank"
            rel="noreferrer noopener"
            title="Solana"
            className="transition-transform duration-300 hover:-translate-y-1 hover:drop-shadow-[0_0_18px_rgba(153,69,255,0.45)]"
          >
            <img src="/assets/solanaLogo.png" alt="Solana" className="h-9 w-auto sm:h-10" />
          </a>
          <a
            href="https://magicblock.app"
            target="_blank"
            rel="noreferrer noopener"
            title="MagicBlock"
            className="transition-transform duration-300 hover:-translate-y-1 hover:drop-shadow-[0_0_18px_rgba(249,115,22,0.45)]"
          >
            <img src="/assets/MagicBlockWhite.png" alt="MagicBlock" className="h-8 w-auto sm:h-9" />
          </a>
        </div>
        <p className="mx-auto mt-8 max-w-xl font-mono text-[11px] leading-5 text-slate-500">
          On-chain matching and vaults on Solana, execution delegated to a keyless MagicBlock ephemeral rollup.
        </p>
      </section>

      <section id="features" className="relative mx-auto max-w-6xl px-5 py-24 border-t border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">The Financial Stack</h2>
          <p className="mt-4 max-w-2xl mx-auto text-base text-slate-400">
            Every capability a real exchange needs, exposed as open infrastructure powered by the {site.name} engine.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 transition-colors hover:border-violet-500/30 hover:bg-white/[0.04]"
            >
              <div>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5">
                  <f.icon className="h-5 w-5 text-violet-300" strokeWidth={1.75} />
                </div>
                <h3 className="text-lg font-bold text-slate-100">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* build it */}
      <section id="how-it-works" className="relative mx-auto max-w-6xl px-5 py-24 border-t border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">The shortest path to a Solana order book</h2>
          <p className="mt-4 max-w-2xl mx-auto text-base text-slate-400">
            Four steps from installing the SDK to placing orders against the live program.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-colors hover:bg-white/[0.04]">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 rounded-md bg-violet-400/10 px-2 py-1 font-mono text-sm font-medium text-violet-300">
                  <s.icon className="h-4 w-4" strokeWidth={1.75} />
                  {s.n}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}