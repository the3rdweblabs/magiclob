// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useState } from "react";
import { useApp } from "@/hooks/useApp";
import { useToast } from "@/hooks/useToast";

/** Delegated-state / ephemeral-rollup control panel (ER networks only). */
export function VaultDelegate() {
  const app = useApp();
  const { cfg, market, auth, tradeClient, delegated, bump } = app;
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (!cfg.routerUrl) {
    return (
      <div className="p-3">
        <div className="text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-slate-400">
            MagicBlock
          </span>
          <p className="mt-1 font-mono text-xs leading-5 text-slate-400">
            Trading is settled on the base layer for{" "}
            <span className="text-violet-300">{cfg.network}</span>. Set a{" "}
            <span className="font-mono">ROUTER_URL_{cfg.network.toUpperCase()}</span> to enable
            the delegated-state / ephemeral rollup path.
          </p>
        </div>
      </div>
    );
  }

  const owner = auth.publicKey;
  const canAct = owner && market && tradeClient && !busy;

  const act = async (kind: "delegate" | "settle") => {
    if (!canAct || !owner) return;
    setBusy(kind);
    try {
      const sig =
        kind === "delegate"
          ? await tradeClient.delegate({ market: market!, owner })
          : await tradeClient.settle({ market: market!, owner });
      bump();
      push("success", kind === "delegate" ? "Delegated vault state" : "Settled to base layer", sig);
    } catch (err) {
      push("error", `${kind} failed`, String((err as { message?: string })?.message ?? err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Delegated state
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${
            delegated ? "bg-violet-500/20 text-violet-300" : "bg-white/5 text-slate-400"
          }`}
        >
          {delegated ? "on ER" : "base layer"}
        </span>
      </div>
      <p className="mt-1.5 font-mono text-xs leading-5 text-slate-400">
        Routed via <span className="text-violet-300">{new URL(cfg.routerUrl).host}</span>.
        {delegated
          ? " Your vault is delegated - keep it synced before shipping order updates."
          : " Delegate your vault to trade through the ephemeral rollup."}
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          disabled={!canAct || delegated}
          onClick={() => void act("delegate")}
          className="rounded-md border border-violet-500/40 bg-violet-500/10 py-1.5 text-xs font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "delegate" ? "Delegating…" : delegated ? "Delegated" : "Delegate vault"}
        </button>
        <button
          disabled={!canAct || !delegated}
          onClick={() => void act("settle")}
          className="rounded-md border border-slate-600 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "settle" ? "Settling…" : "Settle"}
        </button>
      </div>
    </div>
  );
}