// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Client factory + layer routing for the app.
 *
 * The SDK signs internally with `Signer[]` keypairs, which is perfect for the
 * local demo (an auto-created dev keypair) and for CLI scripts. Browser wallets
 * cannot reveal a private key, so trades from a real wallet go through the
 * instruction builders + `wallet.sendTransaction` path in `lib/trades.ts`.
 *
 * Layer routing rule: while a session is NOT open the
 * order book lives on the base layer; once delegated, reads and trading move to
 * the Ephemeral Rollup. Custody calls (deposit/withdraw/delegate) always stay
 * on base.
 */
import { MagiCLOBClient, MagiCLOBSDK, type Layer } from "@magiclob/sdk";
import type { NetworkConfig } from "@/config/networks";

/**
 * Browser-reachable absolute RPC URL. web3.js rejects relative endpoints, but
 * `local` configures browsers through the same-origin `/api/rpc` proxy.
 */
export function clientRpcUrl(rpcUrl: string): string {
  if (rpcUrl.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${rpcUrl}`;
  }
  return rpcUrl;
}

export function createSDK(cfg: NetworkConfig): MagiCLOBSDK {
  const client = new MagiCLOBClient({
    connection: clientRpcUrl(cfg.rpcUrl),
    ephemeralConnection: cfg.routerUrl ?? undefined,
    programId: cfg.programId,
  });
  return new MagiCLOBSDK(client);
}

/** Which layer an order-book read/trade should target. */
export function tradeLayer(delegated: boolean, sdk: MagiCLOBSDK): Layer {
  return delegated && sdk.client.hasEphemeral ? "ephemeral" : "base";
}