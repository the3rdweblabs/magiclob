// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useEffect, useState } from "react";

type Network = "local" | "devnet" | "mainnet";

const LABELS: Record<string, string> = {
  local: "live on local",
  devnet: "live on devnet",
  mainnet: "live on mainnet",
};

/** Static indicator for the network the app is running against. */
export default function NetworkStatus() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: { network?: Network } | null) => {
        if (!cancelled && cfg?.network) setLabel(LABELS[cfg.network] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const text = label ?? "connectivity check";
  const dot = label ? "bg-emerald-400" : "bg-slate-600";

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-xs tracking-wide text-slate-300"
      role="status"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}