// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Standalone indexer CLI - mainly for local-validator development.
 *
 * The Next app bootstraps the same indexer inside its own process at startup
 * (`src/server/indexer.ts` + `instrumentation.ts`), so on devnet/mainnet you
 * normally do NOT run this separately. It is kept as a thin entry for running
 * against the local validator or any manual setup.
 *
 * Usage:  npm run indexer  (env: SOLANA_NETWORK)
 */
import { getNetwork } from "../src/config/networks";
import { startIndexer } from "../src/server/indexer";
import { loadEnvFile } from "./lib/loadEnv";

async function main(): Promise<void> {
  loadEnvFile();
  const network = getNetwork();
  await startIndexer(network);
}

main().catch((err) => {
  console.error("[indexer] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));