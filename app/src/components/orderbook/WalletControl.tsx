// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useState } from "react";
import { useApp } from "@/hooks/useApp";
import { useToast } from "@/hooks/useToast";
import { shortPubkey } from "@/lib/format";

export function WalletControl() {
  const { cfg, auth } = useApp();
  const { push } = useToast();
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);

  if (auth.status === "loading") {
    return (
      <span className="h-8 w-28 rounded-md border border-[#1b2335] bg-white/[0.03]" />
    );
  }

  if (auth.mode === "keypair") {
    const pub = auth.publicKey!.toBase58();
    return (
      <div className="flex items-center gap-2">
        <span
          className="cursor-pointer rounded-md border border-[#1b2335] bg-[#0b1220] px-2.5 py-1.5 font-mono text-[11px] text-slate-300"
          title={pub}
          onClick={() => {
            void navigator.clipboard?.writeText(pub);
            setCopy(true);
            window.setTimeout(() => setCopy(false), 1200);
          }}
        >
          {copy ? "copied" : shortPubkey(pub)}
        </span>
        <span className="hidden text-[11px] uppercase tracking-wider text-slate-400 sm:inline">
          local keypair
        </span>
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void auth.airdrop().then((sig) => {
              setBusy(false);
              if (sig) push("success", "Airdropped 10 SOL");
            });
          }}
          className="rounded-md border border-[#1b2335] px-2 py-1.5 font-mono text-[11px] text-slate-200 transition-colors hover:border-violet-400/40 hover:text-slate-100 disabled:opacity-60"
        >
          {busy ? "…" : "airdrop"}
        </button>
      </div>
    );
  }

  if (auth.status === "disconnected") {
    return (
      <button
        onClick={() => void auth.connect().catch((e) => push("error", "Wallet connect failed", String(e)))}
        className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/20"
      >
        Connect wallet
      </button>
    );
  }

  const pub = auth.publicKey!.toBase58();
  return (
    <div className="flex items-center gap-2">
      <span
        className="cursor-pointer rounded-md border border-[#1b2335] bg-[#0b1220] px-2.5 py-1.5 font-mono text-[11px] text-slate-300"
        title={pub}
        onClick={() => {
          void navigator.clipboard?.writeText(pub);
          setCopy(true);
          window.setTimeout(() => setCopy(false), 1200);
        }}
      >
        {copy ? "copied" : shortPubkey(pub)}
      </span>
      {cfg.network === "devnet" && (
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void auth.airdrop().then((sig) => {
              setBusy(false);
              if (sig) push("success", "Airdropped 2 devnet SOL");
            });
          }}
          className="rounded-md border border-[#1b2335] px-2 py-1.5 font-mono text-[11px] text-slate-300 transition-colors hover:border-emerald-400/40 hover:text-emerald-200 disabled:opacity-60"
          title="Get devnet SOL for trading fees and delegation rent"
        >
          {busy ? "…" : "airdrop"}
        </button>
      )}
      <button
        onClick={() => void auth.disconnect()}
        className="rounded-md border border-[#1b2335] px-2 py-1.5 font-mono text-[11px] text-slate-400 hover:text-slate-300"
      >
        disconnect
      </button>
    </div>
  );
}