// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { ChevronDown } from "lucide-react";
import { OrderSide } from "@magiclob/sdk";
import { useState } from "react";
import { useApp } from "@/hooks/useApp";
import { useOpenOrders } from "@/hooks/useData";
import { useToast } from "@/hooks/useToast";
import type { MarketMeta } from "@/hooks/useData";
import { formatPrice, formatQty } from "@/lib/format";

export function OpenOrders({ meta, onMinimize }: { meta: MarketMeta; onMinimize?: () => void }) {
  const app = useApp();
  const { sdk, market, auth, layer, nonce, bump, tradeClient, pair } = app;
  const { push } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const orders = useOpenOrders(sdk, market, auth.publicKey, layer, nonce);

const act = async (
    id: string,
    fn: () => Promise<string>
  ) => {
    setBusyId(id);
    try {
      const sig = await fn();
      push("success", "Order updated", sig);
      bump();
    } catch (err) {
      push("error", "Update failed", String((err as { message?: string })?.message ?? err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-[#1b2335] px-3 py-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Open orders
        </h2>
        <span className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          {orders.length}
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              title="Minimize open orders"
              className="flex items-center gap-1 rounded border border-slate-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
            >
              Minimize
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-[3rem_5rem_7rem_7rem_5rem_4.5rem_9rem] gap-2 border-b border-[#141c2e] px-3 py-1 text-right font-mono text-[11px] uppercase tracking-wider text-slate-400">
        <span className="text-left">Side</span>
        <span>ID</span>
        <span>Price</span>
        <span>Remaining</span>
        <span>Filled</span>
        <span>TIF</span>
        <span />
      </div>
      <div className="max-h-56 min-h-0 flex-1 overflow-y-auto">
        {!auth.publicKey ? (
          <EmptyHint text="Connect a wallet to manage your orders." />
        ) : orders.length === 0 ? (
          <EmptyHint text="No open orders. Place one above." />
        ) : (
          orders.map((o) => {
          const key = `${o.side}-${o.clientOrderId.toString()}`;
          const isBid = o.side === OrderSide.Bid;
          const lot = meta.state.lotSize;
          const nextQty = o.qtyRemaining - lot;
          return (
            <div
              key={key}
              className="grid grid-cols-[3rem_5rem_7rem_7rem_5rem_4.5rem_9rem] gap-2 border-b border-[#0f1626] px-3 py-1.5 text-right font-mono text-[11px]"
            >
              <span className={`text-left text-[11px] font-semibold uppercase ${isBid ? "text-emerald-300" : "text-rose-300"}`}>
                {isBid ? "Buy" : "Sell"}
              </span>
              <span className="text-slate-400">{o.clientOrderId.toString()}</span>
              <span className="lcd text-slate-200">
                {formatPrice(o.price, meta.tickSize, meta.decimals.quote)}
              </span>
              <span className="lcd text-slate-300">
                {formatQty(o.qtyRemaining, meta.decimals.base)}/{formatQty(o.qtyRemaining + o.filledQuantity, meta.decimals.base)}
              </span>
              <span className="text-slate-400">{formatQty(o.filledQuantity, meta.decimals.base)}</span>
              <span className="text-slate-400">{tifLabel(o.timeInForce)}</span>
              <span className="flex justify-end gap-1.5">
                <button
                  disabled={busyId === key}
                  onClick={() =>
                    void act(key, () =>
                      tradeClient!.cancel({
                        market: meta.market,
                        owner: auth.publicKey!,
                        isBid,
                        clientOrderId: o.clientOrderId,
                      })
                    )
                  }
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  disabled={busyId === key || nextQty <= 0n}
                  onClick={() =>
                    void act(`${key}-mod`, () =>
                      tradeClient!.modify({
                        market: meta.market,
                        owner: auth.publicKey!,
                        isBid,
                        clientOrderId: o.clientOrderId,
                        newQuantity: nextQty,
                      })
                    )
                  }
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:border-violet-500/50 hover:text-violet-300 disabled:opacity-60"
                >
                  Shrink
                </button>
              </span>
            </div>
          );
          })
        )}
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col overflow-hidden">{children}</div>;
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-6 font-mono text-[11px] text-slate-400">
      {text}
    </div>
  );
}

function tifLabel(tif: number): string {
  switch (tif) {
    case 0: return "GTC";
    case 1: return "IOC";
    case 2: return "FOK";
    case 3: return "PO";
    default: return "?";
  }
}

export { OrderSide };