// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Single network config resolver for MagicBook.
 *
 * THE rule of the repo: every network-dependent value is `VAR_{NETWORK}` in the
 * environment (see `.env.example`) and NOTHING hardcodes a URL/address anywhere
 * else. This module is the only place that touches `process.env`; the browser
 * receives a sanitised snapshot through `GET /api/config`, and every CLI script
 * imports it directly.
 *
 * Ship defaults for all three networks so the app and scripts work out of the
 * box; environment variables only override.
 */
import {
  DELEGATION_PROGRAM_ID,
  ENDPOINTS,
  MAGICLOB_PROGRAM_ID,
} from "@magiclob/sdk";
import { PublicKey } from "@solana/web3.js";

export type Network = "local" | "devnet" | "mainnet";

/** One configured pair. `market` is null until setup-demo-market has run. */
export interface NetworkPair {
  symbol: string;
  base: string;
  quote: string;
  market: string | null;
}

export interface NetworkConfig {
  network: Network;
  rpcUrl: string;
  wsUrl: string;
  programId: PublicKey;
  delegationProgramId: PublicKey;
  /** Ephemeral Rollup / Magic Router URL, or null for local. */
  routerUrl: string | null;
  pairs: NetworkPair[];
}

type Env = Record<string, string | undefined>;

const DEFAULTS: Record<Network, Omit<NetworkConfig, "network" | "pairs">> = {
  local: {
    rpcUrl: "http://127.0.0.1:8899",
    wsUrl: "ws://127.0.0.1:8900",
    programId: MAGICLOB_PROGRAM_ID,
    delegationProgramId: DELEGATION_PROGRAM_ID,
    routerUrl: null,
  },
  devnet: {
    rpcUrl: ENDPOINTS.devnetBase,
    wsUrl: ENDPOINTS.devnetWs,
    programId: MAGICLOB_PROGRAM_ID,
    delegationProgramId: DELEGATION_PROGRAM_ID,
    routerUrl: ENDPOINTS.devnetRouter,
  },
  mainnet: {
    rpcUrl: ENDPOINTS.mainnetBase,
    wsUrl: ENDPOINTS.mainnetWs,
    programId: MAGICLOB_PROGRAM_ID,
    delegationProgramId: DELEGATION_PROGRAM_ID,
    routerUrl: ENDPOINTS.mainnetRouter,
  },
};

/** Default pair list per network (markets come from `MARKETS_{NET}`). */
const PAIR_DEFAULTS: Record<Network, Array<Pick<NetworkPair, "symbol" | "base" | "quote">>> = {
  local: [
    { symbol: "SOL/USDC", base: "SOL", quote: "USDC" },
    { symbol: "MAGIC/USDC", base: "MAGIC", quote: "USDC" },
  ],
  devnet: [
    { symbol: "SOL/USDC", base: "SOL", quote: "USDC" },
    { symbol: "MAGIC/USDC", base: "MAGIC", quote: "USDC" },
  ],
  mainnet: [
    { symbol: "SOL/USDC", base: "SOL", quote: "USDC" },
    { symbol: "MAGIC/USDC", base: "MAGIC", quote: "USDC" },
  ],
};

export const NETWORKS: Network[] = ["local", "devnet", "mainnet"];

export function isNetwork(value: string): value is Network {
  return (NETWORKS as string[]).includes(value);
}

/** Active network from `SOLANA_NETWORK`, defaulting to `local`. */
export function getNetwork(env: Env = process.env): Network {
  const raw = env.SOLANA_NETWORK ?? "local";
  return isNetwork(raw) ? raw : "local";
}

function isMarketAddress(value: string): boolean {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function parseMarkets(network: Network, env: Env): Record<string, string> {
  const raw = env[`MARKETS_${network.toUpperCase()}`];
  if (!raw || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    const out: Record<string, string> = {};
    for (const [symbol, market] of Object.entries(parsed)) {
      if (typeof market === "string" && isMarketAddress(market)) {
        out[symbol] = market;
      }
    }
    return out;
  } catch {
    // Preferred form is JSON; tolerate a fallback "SYM:pubkey,SYM:pubkey" list.
    const out: Record<string, string> = {};
    for (const part of raw.split(",")) {
      const [symbol, market] = part.split(":").map((s) => s.trim());
      if (symbol && market && isMarketAddress(market)) out[symbol] = market;
    }
    return out;
  }
}

/**
 * Resolve the full configuration for the active network.
 * `env` is injectable for testability; defaults to `process.env`.
 */
export function resolveNetworkConfig(
  network: Network = getNetwork(),
  env: Env = process.env
): NetworkConfig {
  const key = network.toUpperCase();
  const defaults = DEFAULTS[network];
  const markets = parseMarkets(network, env);

  const pairs: NetworkPair[] = PAIR_DEFAULTS[network].map((p) => ({
    ...p,
    market: markets[p.symbol] ?? null,
  }));

  return {
    network,
    rpcUrl: env[`RPC_URL_${key}`] ?? defaults.rpcUrl,
    wsUrl: env[`WS_URL_${key}`] ?? defaults.wsUrl,
    programId: new PublicKey(env[`PROGRAM_ID_${key}`] ?? defaults.programId.toBase58()),
    delegationProgramId: defaults.delegationProgramId,
    routerUrl:
      env[`ROUTER_URL_${key}`] ?? defaults.routerUrl ?? null,
    pairs,
  };
}

/** Short label helper (`local`, `devnet`, `mainnet`). */
export function networkLabel(network: Network): string {
  return network;
}