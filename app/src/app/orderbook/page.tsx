// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { OrderBookApp } from "@/components/orderbook/OrderBookApp";
import { AppProvider } from "@/hooks/useApp";
import { ToastProvider } from "@/hooks/useToast";

export const dynamic = "force-dynamic";

export default function OrderbookPage() {
  return (
    <div className="min-h-screen bg-[#070b14] text-slate-200">
      <ToastProvider>
        <AppProvider>
          <OrderBookApp />
        </AppProvider>
      </ToastProvider>
    </div>
  );
}