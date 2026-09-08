// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `bulk_batch_orders` - submit up to `MAX_BATCH_SIZE` orders atomically.
 *
 * Every element runs through the same matching path as a single order, and the
 * whole batch reverts if any element fails. An element with `price === 0n` is
 * treated as a market order by the program.
 */
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID, MAX_BATCH_SIZE, NO_EXPIRY } from "../constants";
import {
  SelfMatchingOption,
  TimeInForce,
  type BulkBatchOrdersParams,
  type OrderArgs,
} from "../types";
import {
  DISCRIMINATORS,
  buildIx,
  ixData,
  makerAccounts,
  tradeAccounts,
} from "./shared";

/** Build a `bulk_batch_orders` instruction. */
export function createBulkBatchOrdersInstruction(
  params: BulkBatchOrdersParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { market, owner, orders, makers } = params;

  if (orders.length === 0) {
    throw new Error("bulkBatchOrders: `orders` must not be empty");
  }
  if (orders.length > MAX_BATCH_SIZE) {
    throw new Error(
      `bulkBatchOrders: ${orders.length} orders exceeds MAX_BATCH_SIZE (${MAX_BATCH_SIZE}); the program reverts with BatchTooLarge`
    );
  }

  const data = ixData(DISCRIMINATORS.bulk_batch_orders)
    .vec(orders, (w, o: OrderArgs) => {
      w.bool(o.isBid)
        .u64(o.price)
        .u64(o.qty)
        .u64(o.clientOrderId)
        .u8(o.timeInForce ?? TimeInForce.GoodTillCancelled)
        .u8(o.selfMatchingOption ?? SelfMatchingOption.Allowed)
        .u64(o.expireTimestamp ?? NO_EXPIRY);
    })
    .toBuffer();

  return buildIx(
    [
      ...tradeAccounts(market, owner, programId),
      ...makerAccounts(market, owner, makers, programId),
    ],
    data,
    programId
  );
}
