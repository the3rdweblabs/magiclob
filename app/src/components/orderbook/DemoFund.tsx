// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { useState } from "react";
import { useApp } from "@/hooks/useApp";
import type { MarketMeta } from "@/hooks/useData";
import { useToast } from "@/hooks/useToast";
import { scaleAmount } from "@/lib/format";

/** Budgets deposited by the "Fund demo vault" button (raw units). */
export const DEMO_BASE_BUDGET = 5_000_000_000n; // 5 base tokens
export const DEMO_QUOTE_BUDGET = 2_500_000_000n; // 2500 quote tokens

/**
 * `local` only: one click registers the demo trader (if needed) and deposits a
 * small budget so browser-placed orders actually settle. On devnet/mainnet you
 * deposit from your own wallet instead, so this never renders.
 */
export function DemoFund({ meta }: { meta: MarketMeta }) {
  const { sdk, cfg, bump } = useApp();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  if (cfg.network !== "local") return null;
  const { auth } = useApp();
  const kp = auth.signMode?.kind === "keypair" ? auth.signMode.keypair : null;
  if (!kp) return null;

  const onFund = async () => {
    setBusy(true);
    try {
      const conn = sdk.client.connection;
      const [baseAta, quoteAta] = await Promise.all([
        getOrCreateAssociatedTokenAccount(conn, kp, meta.state.baseMint, kp.publicKey),
        getOrCreateAssociatedTokenAccount(conn, kp, meta.state.quoteMint, kp.publicKey),
      ]);
      const trader = await sdk.getTrader(meta.market, kp.publicKey, "base");
      if (!trader) {
        await sdk.registerTrader({ market: meta.market, owner: kp.publicKey }, [kp]);
      }
      await sdk.deposit(
        {
          market: meta.market,
          authority: kp.publicKey,
          baseMint: meta.state.baseMint,
          quoteMint: meta.state.quoteMint,
          baseTokenAccount: baseAta.address,
          quoteTokenAccount: quoteAta.address,
          baseAmount: DEMO_BASE_BUDGET,
          quoteAmount: DEMO_QUOTE_BUDGET,
        },
        [kp]
      );
      push(
        "success",
        "Vault funded",
        `${scaleAmount(DEMO_BASE_BUDGET, meta.decimals.base)} base + ${scaleAmount(
          DEMO_QUOTE_BUDGET,
          meta.decimals.quote
        )} quote deposited`
      );
      bump();
    } catch (err) {
      push(
        "error",
        "Funding failed",
        String((err as { message?: string })?.message ?? err)
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Demo funds
        </span>
        <span className="font-mono text-[11px] text-slate-400">local keypair</span>
      </div>
      <p className="mt-1.5 font-mono text-xs leading-5 text-slate-400">
        Registers the demo trader and deposits{" "}
        <span className="text-slate-300">{scaleAmount(DEMO_BASE_BUDGET, meta.decimals.base)}</span>{" "}
        base +{" "}
        <span className="text-slate-300">{scaleAmount(DEMO_QUOTE_BUDGET, meta.decimals.quote)}</span>{" "}
        quote into the vault so orders below can fill.
      </p>
      <button
        disabled={busy}
        onClick={() => void onFund()}
        className="mt-2.5 w-full rounded-md border border-[#1b2335] py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-violet-400/40 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Funding…" : "Fund demo vault"}
      </button>
    </div>
  );
}