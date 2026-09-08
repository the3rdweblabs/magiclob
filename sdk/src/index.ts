// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `@magiclob/sdk` - TypeScript client for magiCLOB, a price-time priority CLOB
 * on Solana with Magicblock Ephemeral Rollup execution.
 *
 * ```ts
 * import { MagiCLOBSDK, TimeInForce } from "@magiclob/sdk";
 *
 * const sdk = MagiCLOBSDK.devnet();
 * const market = sdk.market(BASE_MINT, QUOTE_MINT);
 * const { bestBid, bestAsk } = await sdk.getTopOfBook(market);
 * ```
 *
 * See `README.md` for the full order lifecycle and `docs/` for the API
 * reference, the ER session model and error handling.
 */
export * from "./accounts";
export * from "./client";
export * from "./codec";
export * from "./constants";
export * from "./errors";
export * from "./instructions";
export * from "./pda";
export * from "./sdk";
export * from "./types";

export { MagiCLOBSDK as default } from "./sdk";
