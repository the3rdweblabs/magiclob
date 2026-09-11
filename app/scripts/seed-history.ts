// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Standalone market-maker CLI - mostly for local-validator or manual runs.
 *
 * The Next app bootstraps the same market maker inside its own process at
 * startup (`src/server/market-maker.ts` + `instrumentation.ts`), so on devnet
 * the app trades itself; this script is a thin entry for manual control.
 *
 * Modes:
 *   local   - real execution against the local validator.
 *   devnet  - real execution by default HERE (the in-app maker is the live path);
 *             set SEED_DRY_RUN=1 to only print the plan.
 *   mainnet - DRY RUN unless MARKET_MAKER=1 is set.
 *
 * Usage:  npm run seed:history   (env: SOLANA_NETWORK, PAYER_KEYPAIR_PATH)
 */
import { getNetwork } from "../src/config/networks";
import { startMarketMaker } from "../src/server/market-maker";
import { loadEnvFile } from "./lib/loadEnv";

const DRY_RUN: Record<string, boolean> = { local: false, devnet: false, mainnet: true };

async function main(): Promise<void> {
  loadEnvFile();
  const network = getNetwork();
  const forcedDry = process.env.SEED_DRY_RUN === "1";
  const dryRun = forcedDry || DRY_RUN[network];
  await startMarketMaker({ network, dryRun });
  if (dryRun) process.exit(0);
}

main().catch((err) => {
  console.error("[seed:history] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));