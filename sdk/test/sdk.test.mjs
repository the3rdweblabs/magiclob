// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * SDK verification suite.
 *
 * Runs against the compiled `dist/` output with node's built-in test runner, so
 * it needs no extra dependencies. Coverage is deliberately aimed at the parts
 * that would fail silently in production: the binary layout of the order book,
 * instruction discriminators/arg encoding, and PDA derivation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

import {
  decodeOrderBookState,
  levels,
  topOfBook,
  makersForOrder,
  ordersForSide,
  ORDER_NODE_SIZE,
  ORDER_BOOK_STATE_DISCRIMINATOR,
  MAX_ORDERS_PER_SIDE,
  NONE_IDX,
  NO_EXPIRY,
  OrderSide,
  TimeInForce,
  SelfMatchingOption,
  createPlaceLimitOrderInstruction,
  createCancelOrderInstruction,
  createBulkBatchOrdersInstruction,
  createDelegateSessionInstruction,
  DISCRIMINATORS,
  marketPda,
  orderBookPda,
  traderPda,
  vaultBaseTokenPda,
  delegationRecordPda,
  MAGICLOB_PROGRAM_ID,
  parseMagiCLOBError,
  MagiCLOBErrorCode,
} from "../dist/index.js";

const IDL = JSON.parse(
  readFileSync(new URL("../src/idl/magiclob.json", import.meta.url), "utf8")
);

const KEY_A = new PublicKey("11111111111111111111111111111112");
const KEY_B = new PublicKey("So11111111111111111111111111111111111111112");
const OWNER = new PublicKey("SysvarC1ock11111111111111111111111111111111");

// Order book binary layout

/**
 * Build a synthetic OrderBookState buffer with the given bid/ask nodes.
 * Layout matches order_types.rs borsh_size() = 122 bytes per node:
 *   active:1 + side:1 + price:8 + qty:8 + owner:32 + integrator:32 +
 *   integratorFeeBps:2 + clientOrderId:8 + sequence:8 + prev:2 + next:2 +
 *   expireTimestamp:8 + filledQuantity:8 + timeInForce:1 + selfMatchingOption:1
 */
function buildBook({ bids = [], asks = [] }) {
  const header = Buffer.alloc(8 + 84);
  Buffer.from(ORDER_BOOK_STATE_DISCRIMINATOR).copy(header, 0);
  KEY_A.toBuffer().copy(header, 8); // market
  KEY_B.toBuffer().copy(header, 40); // authority
  header.writeBigUInt64LE(7n, 72); // order_sequence
  header.writeUInt16LE(bids.length > 0 ? 0 : NONE_IDX, 80); // bid_head
  header.writeUInt16LE(asks.length > 0 ? 0 : NONE_IDX, 82); // ask_head
  header.writeUInt16LE(NONE_IDX, 84); // bid_free
  header.writeUInt16LE(NONE_IDX, 86); // ask_free
  header.writeUInt16LE(bids.length, 88); // bid_count
  header.writeUInt16LE(asks.length, 90); // ask_count

  const pool = (nodes, side) => {
    const buf = Buffer.alloc(MAX_ORDERS_PER_SIDE * ORDER_NODE_SIZE);
    nodes.forEach((n, i) => {
      const o = i * ORDER_NODE_SIZE;
      buf.writeUInt8(1, o); // active
      buf.writeUInt8(side, o + 1); // side
      buf.writeBigUInt64LE(n.price, o + 2); // price
      buf.writeBigUInt64LE(n.qty, o + 10); // qty_remaining
      (n.owner ?? OWNER).toBuffer().copy(buf, o + 18); // owner
      (n.owner ?? OWNER).toBuffer().copy(buf, o + 50); // integrator
      buf.writeUInt16LE(0, o + 82); // integrator_fee_bps
      buf.writeBigUInt64LE(BigInt(i), o + 84); // client_order_id
      buf.writeBigUInt64LE(BigInt(i), o + 92); // sequence
      buf.writeUInt16LE(i === 0 ? NONE_IDX : i - 1, o + 100); // prev
      buf.writeUInt16LE(i === nodes.length - 1 ? NONE_IDX : i + 1, o + 102); // next
      buf.writeBigUInt64LE(NO_EXPIRY, o + 104); // expire_timestamp
      buf.writeBigUInt64LE(0n, o + 112); // filled_quantity
      buf.writeUInt8(TimeInForce.GoodTillCancelled, o + 120);
      buf.writeUInt8(SelfMatchingOption.Allowed, o + 121);
    });
    return buf;
  };

  return Buffer.concat([
    header,
    pool(bids, OrderSide.Bid),
    pool(asks, OrderSide.Ask),
  ]);
}

test("OrderNode stride matches the on-chain borsh layout (122 bytes)", () => {
  assert.equal(ORDER_NODE_SIZE, 122);
});

test("decodes a synthetic book and reads its header", () => {
  const book = decodeOrderBookState(buildBook({ bids: [{ price: 100n, qty: 5n }] }));
  assert.equal(book.market.toBase58(), KEY_A.toBase58());
  assert.equal(book.authority.toBase58(), KEY_B.toBase58());
  assert.equal(book.orderSequence, 7n);
  assert.equal(book.bids.length, MAX_ORDERS_PER_SIDE);
  assert.equal(book.asks.length, MAX_ORDERS_PER_SIDE);
  assert.equal(book.bids[0].price, 100n);
  assert.equal(book.bids[0].qtyRemaining, 5n);
  assert.equal(book.bids[0].active, true);
});

test("levels() collapses consecutive equal prices, like price_level.rs", () => {
  const book = decodeOrderBookState(
    buildBook({
      bids: [
        { price: 100n, qty: 5n },
        { price: 100n, qty: 7n },
        { price: 99n, qty: 2n },
      ],
    })
  );
  const lv = levels(book, OrderSide.Bid);
  assert.equal(lv.length, 2);
  assert.equal(lv[0].price, 100n);
  assert.equal(lv[0].totalQty, 12n);
  assert.equal(lv[0].orderCount, 2);
  assert.equal(lv[1].price, 99n);
  assert.equal(lv[1].totalQty, 2n);
});

test("topOfBook() reports best prices and spread", () => {
  const book = decodeOrderBookState(
    buildBook({ bids: [{ price: 100n, qty: 5n }], asks: [{ price: 103n, qty: 4n }] })
  );
  const top = topOfBook(book);
  assert.equal(top.bestBid, 100n);
  assert.equal(top.bestAsk, 103n);
  assert.equal(top.bidQty, 5n);
  assert.equal(top.askQty, 4n);
  assert.equal(top.spread, 3n);
});

test("empty book yields null top of book, not a throw", () => {
  const top = topOfBook(decodeOrderBookState(buildBook({})));
  assert.equal(top.bestBid, null);
  assert.equal(top.bestAsk, null);
  assert.equal(top.spread, null);
});

test("traversal stops at the sentinel and cannot loop forever", () => {
  const book = decodeOrderBookState(
    buildBook({ bids: [{ price: 100n, qty: 5n }, { price: 99n, qty: 5n }] })
  );
  assert.equal(ordersForSide(book, OrderSide.Bid).length, 2);
  // Force a self-referential cycle; the guard must still terminate.
  book.bids[0].next = 0;
  assert.ok(ordersForSide(book, OrderSide.Bid).length <= MAX_ORDERS_PER_SIDE);
});

test("decoding rejects a buffer with the wrong discriminator", () => {
  const bad = buildBook({});
  bad.writeUInt8(0xff, 0);
  assert.throws(() => decodeOrderBookState(bad), /discriminator mismatch/);
});

// Maker resolution

test("makersForOrder() collects distinct owners a bid would sweep", () => {
  const m1 = new PublicKey("SysvarRent111111111111111111111111111111111");
  const m2 = new PublicKey("SysvarS1otHashes111111111111111111111111111");
  const book = decodeOrderBookState(
    buildBook({
      asks: [
        { price: 100n, qty: 5n, owner: m1 },
        { price: 101n, qty: 5n, owner: m2 },
      ],
    })
  );
  // Only crosses the first level.
  assert.deepEqual(
    makersForOrder(book, true, 5n, 100n).map((k) => k.toBase58()),
    [m1.toBase58()]
  );
  // Crosses both.
  assert.deepEqual(
    makersForOrder(book, true, 10n, 101n).map((k) => k.toBase58()),
    [m1.toBase58(), m2.toBase58()]
  );
  // Limit price below the book crosses nothing.
  assert.deepEqual(makersForOrder(book, true, 10n, 99n), []);
});

test("makersForOrder() de-duplicates a maker resting at several levels", () => {
  const m1 = new PublicKey("SysvarRent111111111111111111111111111111111");
  const book = decodeOrderBookState(
    buildBook({
      asks: [
        { price: 100n, qty: 5n, owner: m1 },
        { price: 101n, qty: 5n, owner: m1 },
      ],
    })
  );
  assert.equal(makersForOrder(book, true, 10n, 101n).length, 1);
});

// Instruction encoding

const idlIx = (name) => IDL.instructions.find((i) => i.name === name);

test("every discriminator matches the generated IDL", () => {
  for (const [name, disc] of Object.entries(DISCRIMINATORS)) {
    assert.deepEqual(disc, idlIx(name).discriminator, `discriminator drift: ${name}`);
  }
});

test("place_limit_order encodes discriminator and args in IDL order", () => {
  const ix = createPlaceLimitOrderInstruction({
    market: KEY_A,
    owner: OWNER,
    price: 1000n,
    qty: 25n,
    clientOrderId: 42n,
    isBid: true,
    integratorFeeBps: 7,
    timeInForce: TimeInForce.PostOnly,
    selfMatchingOption: SelfMatchingOption.CancelTaker,
    expireTimestamp: 1234n,
  });

  assert.deepEqual([...ix.data.subarray(0, 8)], DISCRIMINATORS.place_limit_order);
  let o = 8;
  assert.equal(ix.data.readBigUInt64LE(o), 1000n); o += 8;   // price
  assert.equal(ix.data.readBigUInt64LE(o), 25n); o += 8;     // qty
  assert.equal(ix.data.readBigUInt64LE(o), 42n); o += 8;     // client_order_id
  assert.equal(ix.data.readUInt8(o), 1); o += 1;             // is_bid
  assert.equal(ix.data.readUInt16LE(o), 7); o += 2;          // integrator_fee_bps
  assert.equal(ix.data.readUInt8(o), TimeInForce.PostOnly); o += 1;
  assert.equal(ix.data.readUInt8(o), SelfMatchingOption.CancelTaker); o += 1;
  assert.equal(ix.data.readBigUInt64LE(o), 1234n); o += 8;   // expire_timestamp
  assert.equal(ix.data.length, o, "no trailing bytes");

  // Account order must match the IDL positionally.
  assert.deepEqual(
    ix.keys.map((k) => k.pubkey.toBase58()),
    [
      KEY_A.toBase58(),
      orderBookPda(KEY_A).address.toBase58(),
      traderPda(KEY_A, OWNER).address.toBase58(),
      OWNER.toBase58(),
    ]
  );
  assert.equal(ix.keys[3].isSigner, true);
  assert.equal(ix.programId.toBase58(), MAGICLOB_PROGRAM_ID.toBase58());
});

test("expireTimestamp defaults to NO_EXPIRY, never 0 (0 means already expired)", () => {
  const ix = createPlaceLimitOrderInstruction({
    market: KEY_A, owner: OWNER, price: 100n, qty: 1n, clientOrderId: 1n, isBid: true,
  });
  assert.equal(ix.data.readBigUInt64LE(ix.data.length - 8), NO_EXPIRY);
});

test("maker accounts append after the fixed accounts, excluding the taker", () => {
  const m1 = new PublicKey("SysvarRent111111111111111111111111111111111");
  const ix = createPlaceLimitOrderInstruction({
    market: KEY_A, owner: OWNER, price: 100n, qty: 1n, clientOrderId: 1n, isBid: true,
    makers: [m1, m1, OWNER], // duplicate + the taker itself must both be dropped
  });
  assert.equal(ix.keys.length, 5);
  assert.equal(ix.keys[4].pubkey.toBase58(), traderPda(KEY_A, m1).address.toBase58());
  assert.equal(ix.keys[4].isWritable, true);
});

test("cancel_order encodes bool then u64", () => {
  const ix = createCancelOrderInstruction({
    market: KEY_A, owner: OWNER, isBid: false, clientOrderId: 9n,
  });
  assert.deepEqual([...ix.data.subarray(0, 8)], DISCRIMINATORS.cancel_order);
  assert.equal(ix.data.readUInt8(8), 0);
  assert.equal(ix.data.readBigUInt64LE(9), 9n);
  assert.equal(ix.data.length, 17);
});

test("bulk_batch_orders writes a u32 length prefix then each element", () => {
  const ix = createBulkBatchOrdersInstruction({
    market: KEY_A,
    owner: OWNER,
    orders: [
      { isBid: true, price: 100n, qty: 2n, clientOrderId: 1n,
        timeInForce: TimeInForce.GoodTillCancelled,
        selfMatchingOption: SelfMatchingOption.Allowed, expireTimestamp: NO_EXPIRY },
      { isBid: false, price: 0n, qty: 3n, clientOrderId: 2n,
        timeInForce: TimeInForce.ImmediateOrCancel,
        selfMatchingOption: SelfMatchingOption.Allowed, expireTimestamp: NO_EXPIRY },
    ],
  });
  assert.equal(ix.data.readUInt32LE(8), 2);
  // 8 disc + 4 len + 2 * (1+8+8+8+1+1+8 = 35)
  assert.equal(ix.data.length, 8 + 4 + 70);
});

test("bulk_batch_orders rejects oversized and empty batches client-side", () => {
  const one = { isBid: true, price: 100n, qty: 1n, clientOrderId: 1n,
    timeInForce: TimeInForce.GoodTillCancelled,
    selfMatchingOption: SelfMatchingOption.Allowed, expireTimestamp: NO_EXPIRY };
  assert.throws(
    () => createBulkBatchOrdersInstruction({ market: KEY_A, owner: OWNER, orders: [] }),
    /must not be empty/
  );
  assert.throws(
    () => createBulkBatchOrdersInstruction({
      market: KEY_A, owner: OWNER, orders: Array(17).fill(one),
    }),
    /MAX_BATCH_SIZE/
  );
});

test("delegate_trader_session matches the IDL account list exactly", () => {
  const ix = createDelegateSessionInstruction({ market: KEY_A, owner: OWNER });
  const expected = idlIx("delegate_trader_session").accounts.map((a) => a.name);
  assert.equal(ix.keys.length, expected.length);

  const trader = traderPda(KEY_A, OWNER).address;
  const book = orderBookPda(KEY_A).address;
  assert.equal(ix.keys[5].pubkey.toBase58(), trader.toBase58());
  assert.equal(ix.keys[9].pubkey.toBase58(), book.toBase58());
  assert.equal(
    ix.keys[3].pubkey.toBase58(),
    delegationRecordPda(trader).address.toBase58()
  );
  assert.equal(ix.data.length, 8, "delegation takes no args");
});

// PDAs

test("PDA derivations are deterministic and distinct", () => {
  const market = marketPda(KEY_A, KEY_B).address;
  assert.equal(market.toBase58(), marketPda(KEY_A, KEY_B).address.toBase58());
  const set = new Set([
    market.toBase58(),
    orderBookPda(market).address.toBase58(),
    traderPda(market, OWNER).address.toBase58(),
    vaultBaseTokenPda(market).address.toBase58(),
  ]);
  assert.equal(set.size, 4);
});

test("market PDA is ordered: (base, quote) differs from (quote, base)", () => {
  assert.notEqual(
    marketPda(KEY_A, KEY_B).address.toBase58(),
    marketPda(KEY_B, KEY_A).address.toBase58()
  );
});

// Errors

test("parseMagiCLOBError recovers codes from all three error shapes", () => {
  const fromAnchor = parseMagiCLOBError({ error: { errorCode: { number: 6016 } } });
  assert.equal(fromAnchor.code, MagiCLOBErrorCode.InvalidMinSize);
  assert.equal(fromAnchor.name, "InvalidMinSize");

  const fromIx = parseMagiCLOBError({ InstructionError: [0, { Custom: 6006 }] });
  assert.equal(fromIx.code, MagiCLOBErrorCode.BookCapacityReached);

  // 6010 == 0x177a
  const fromLogs = parseMagiCLOBError({ logs: ["Custom program error: 0x177a"] });
  assert.equal(fromLogs.code, MagiCLOBErrorCode.MakerAccountMissing);
});

test("parseMagiCLOBError ignores non-program errors", () => {
  assert.equal(parseMagiCLOBError(new Error("socket hang up")), null);
  assert.equal(parseMagiCLOBError({ InstructionError: [0, { Custom: 1 }] }), null);
  assert.equal(parseMagiCLOBError(null), null);
});

test("error table covers every code in the IDL", () => {
  for (const e of IDL.errors) {
    assert.equal(MagiCLOBErrorCode[e.name], e.code, `error drift: ${e.name}`);
  }
});
