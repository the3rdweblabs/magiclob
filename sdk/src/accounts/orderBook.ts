// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `OrderBookState` fetch, decode and traversal.
 *
 * The on-chain book is two fixed-capacity slot pools (`bids` / `asks`, 64 slots
 * each) wired into per-side doubly linked lists:
 *
 * ```text
 * bids: head = best (highest) price, then FIFO by sequence
 * asks: head = best (lowest)  price, then FIFO by sequence
 * ```
 *
 * `levels()` reproduces `engine/price_level.rs` exactly - it walks from the head
 * and collapses *consecutive* equal-priced nodes into one level, stopping at the
 * first inactive or wrong-side node. Matching that behaviour matters: a client
 * that aggregated differently would show depth the matching engine will not
 * actually trade against.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshReader, readerAfterDiscriminator } from "../codec";
import { MAX_ORDERS_PER_SIDE, NONE_IDX } from "../constants";
import {
  OrderSide,
  SelfMatchingOption,
  TimeInForce,
  type OrderBookDepth,
  type OrderBookState,
  type OrderNode,
  type PriceLevel,
  type TopOfBook,
} from "../types";

/** Anchor account discriminator for `OrderBookState`. */
export const ORDER_BOOK_STATE_DISCRIMINATOR = [
  217, 149, 164, 121, 67, 33, 135, 238,
] as const;

/** Serialized width of one `OrderNode`, per `engine/order_types.rs` borsh_size(). */
export const ORDER_NODE_SIZE = 122;

function readOrderNode(r: BorshReader): OrderNode {
  return {
    active: r.bool(),
    side: r.u8() as OrderSide,
    price: r.u64(),
    qtyRemaining: r.u64(),
    owner: r.pubkey(),
    integrator: r.pubkey(),
    integratorFeeBps: r.u16(),
    clientOrderId: r.u64(),
    sequence: r.u64(),
    prev: r.u16(),
    next: r.u16(),
    expireTimestamp: r.u64(),
    filledQuantity: r.u64(),
    timeInForce: r.u8() as TimeInForce,
    selfMatchingOption: r.u8() as SelfMatchingOption,
  };
}

/** Decode a raw `OrderBookState` account buffer. */
export function decodeOrderBookState(data: Buffer): OrderBookState {
  const r = readerAfterDiscriminator(
    data,
    ORDER_BOOK_STATE_DISCRIMINATOR,
    "OrderBookState"
  );
  return {
    market: r.pubkey(),
    authority: r.pubkey(),
    orderSequence: r.u64(),
    bidHead: r.u16(),
    askHead: r.u16(),
    bidFree: r.u16(),
    askFree: r.u16(),
    bidCount: r.u16(),
    askCount: r.u16(),
    bids: r.array(MAX_ORDERS_PER_SIDE, readOrderNode),
    asks: r.array(MAX_ORDERS_PER_SIDE, readOrderNode),
  };
}

/** Fetch and decode an `OrderBookState`, or `null` when it does not exist. */
export async function fetchOrderBookState(
  connection: Connection,
  orderBook: PublicKey
): Promise<OrderBookState | null> {
  const info = await connection.getAccountInfo(orderBook);
  if (info === null) return null;
  return decodeOrderBookState(info.data);
}

/** Head slot and slot pool for one side. */
function sideView(book: OrderBookState, side: OrderSide) {
  return side === OrderSide.Bid
    ? { head: book.bidHead, pool: book.bids }
    : { head: book.askHead, pool: book.asks };
}

/**
 * Walk one side head-first and return the live resting orders in priority order
 * (best price first, then FIFO by sequence).
 *
 * The walk is bounded by `MAX_ORDERS_PER_SIDE` so a corrupt or cyclic `next`
 * chain can never hang a caller's UI thread.
 */
export function ordersForSide(
  book: OrderBookState,
  side: OrderSide
): OrderNode[] {
  const { head, pool } = sideView(book, side);
  const out: OrderNode[] = [];
  let slot = head;
  for (let guard = 0; guard < MAX_ORDERS_PER_SIDE && slot !== NONE_IDX; guard++) {
    const node = pool[slot];
    if (node === undefined || !node.active || node.side !== side) break;
    out.push(node);
    slot = node.next;
  }
  return out;
}

/**
 * Aggregate one side into price levels, best-first.
 *
 * Mirrors `price_level::levels` - consecutive equal prices collapse into a
 * single level, and the walk stops at the first inactive/wrong-side node.
 */
export function levels(book: OrderBookState, side: OrderSide): PriceLevel[] {
  const out: PriceLevel[] = [];
  for (const node of ordersForSide(book, side)) {
    const last = out[out.length - 1];
    if (last !== undefined && last.price === node.price) {
      last.totalQty += node.qtyRemaining;
      last.orderCount += 1;
    } else {
      out.push({
        price: node.price,
        totalQty: node.qtyRemaining,
        orderCount: 1,
      });
    }
  }
  return out;
}

/** Best price on a side, or `null` when the side is empty. */
export function bestPrice(
  book: OrderBookState,
  side: OrderSide
): bigint | null {
  const { head, pool } = sideView(book, side);
  if (head === NONE_IDX) return null;
  const node = pool[head];
  if (node === undefined || !node.active) return null;
  return node.price;
}

/** Both sides aggregated into levels, best-first. */
export function depth(book: OrderBookState): OrderBookDepth {
  return {
    bids: levels(book, OrderSide.Bid),
    asks: levels(book, OrderSide.Ask),
  };
}

/** Best bid/ask, their sizes, and the spread. */
export function topOfBook(book: OrderBookState): TopOfBook {
  const bids = levels(book, OrderSide.Bid);
  const asks = levels(book, OrderSide.Ask);
  const bestBid = bids.length > 0 ? bids[0].price : null;
  const bestAsk = asks.length > 0 ? asks[0].price : null;
  return {
    bestBid,
    bestAsk,
    bidQty: bids.length > 0 ? bids[0].totalQty : 0n,
    askQty: asks.length > 0 ? asks[0].totalQty : 0n,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
  };
}

/** Every live resting order owned by `owner`, across both sides. */
export function ordersByOwner(
  book: OrderBookState,
  owner: PublicKey
): OrderNode[] {
  return [
    ...ordersForSide(book, OrderSide.Bid),
    ...ordersForSide(book, OrderSide.Ask),
  ].filter((node) => node.owner.equals(owner));
}

/**
 * Distinct `TraderState`-owner pubkeys an aggressive order would cross.
 *
 * The program settles every maker it fills from `remaining_accounts` and aborts
 * with `MakerAccountMissing` if one is absent, so callers must pass these along
 * with any order that can trade. Walking the resting side and taking owners
 * until `qty` is exhausted reproduces the engine's sweep order.
 *
 * @param book  Current book state.
 * @param isBid True when the *incoming* order is a bid (it sweeps the asks).
 * @param qty   Base quantity of the incoming order.
 * @param limitPrice Limit price, or `null`/`undefined` for a market order.
 */
export function makersForOrder(
  book: OrderBookState,
  isBid: boolean,
  qty: bigint,
  limitPrice?: bigint | null
): PublicKey[] {
  const restingSide = isBid ? OrderSide.Ask : OrderSide.Bid;
  const owners: PublicKey[] = [];
  const seen = new Set<string>();
  let remaining = qty;

  for (const node of ordersForSide(book, restingSide)) {
    if (remaining <= 0n) break;
    if (limitPrice !== undefined && limitPrice !== null && limitPrice > 0n) {
      const crosses = isBid ? node.price <= limitPrice : node.price >= limitPrice;
      if (!crosses) break;
    }
    const key = node.owner.toBase58();
    if (!seen.has(key)) {
      seen.add(key);
      owners.push(node.owner);
    }
    remaining -= node.qtyRemaining < remaining ? node.qtyRemaining : remaining;
  }

  return owners;
}
