// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

import { resolveNetworkConfig } from "@/config/networks";

export const dynamic = "force-dynamic";

/** Sanitised public snapshot of the active network config. No keys, ever. */
export async function GET() {
  const cfg = resolveNetworkConfig();
  const local = cfg.network === "local";
  return Response.json({
    network: cfg.network,
    // `local` browsers reach the validator through our same-origin proxy.
    rpcUrl: local ? "/api/rpc" : cfg.rpcUrl,
    wsUrl: local ? null : cfg.wsUrl,
    routerUrl: cfg.routerUrl,
    hasEphemeral: cfg.routerUrl !== null,
    programId: cfg.programId.toBase58(),
    pairs: cfg.pairs,
  });
}