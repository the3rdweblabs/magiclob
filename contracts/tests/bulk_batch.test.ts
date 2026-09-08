// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// bulk_batch_orders - atomic multi-order sequence with all-or-nothing semantics.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  fetchOrderBook,
  activeOrders,
  bn,
  expectRevertWith,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

const GTC = { goodTillCancelled: {} };
const ALLOWED = { allowed: {} };
const NEVER = 18446744073709551615n;

type OrderArgs = {
  isBid: boolean;
  price: number | bigint;
  qty: number | bigint;
  clientOrderId: number | bigint;
  timeInForce?: Record<string, Record<string, never>>;
  selfMatchingOption?: Record<string, Record<string, never>>;
  expireTimestamp?: bigint;
};

function arg(o: OrderArgs) {
  return {
    isBid: o.isBid,
    price: bn(o.price),
    qty: bn(o.qty),
    clientOrderId: bn(o.clientOrderId),
    timeInForce: o.timeInForce ?? GTC,
    selfMatchingOption: o.selfMatchingOption ?? ALLOWED,
    expireTimestamp: bn(o.expireTimestamp ?? NEVER),
  };
}

describe("bulk_batch_orders", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let t: TraderFixture;

  before(async () => {
    ctx = await bootMagiclob();
    f = await initMarket();
    t = await registerTrader(f, {
      baseEndowment: 1_000_000,
      quoteEndowment: 1_000_000,
    });
  });

  async function bulk(o: TraderFixture, orders: OrderArgs[]) {
    await ctx.program.methods
      .bulkBatchOrders(orders.map(arg))
      .accountsPartial({
        market: f.market,
        orderBook: f.orderBook,
        trader: o.trader,
        owner: o.keypair.publicKey,
      })
      .signers([o.keypair])
      .rpc();
  }

  it("applies an atomic sequence of resting orders", async () => {
    await bulk(t, [
      { isBid: false, price: 100, qty: 5, clientOrderId: 1 },
      { isBid: true, price: 90, qty: 5, clientOrderId: 2 },
    ]);
    const book = await fetchOrderBook(f.orderBook);
    const ask = activeOrders(book, "asks").find(
      (a: any) => a.clientOrderId === 1
    );
    const bid = activeOrders(book, "bids").find(
      (b: any) => b.clientOrderId === 2
    );
    expect(ask).to.include({ price: 100, qty: 5 });
    expect(bid).to.include({ price: 90, qty: 5 });
  });

  it("lets later elements cross earlier ones in the same batch", async () => {
    const fresh = await initMarket({ tickSize: 1, lotSize: 1, minSize: 1 });
    const maker = await registerTrader(fresh, {
      baseEndowment: 1_000_000,
      quoteEndowment: 1_000_000,
    });
    await ctx.program.methods
      .bulkBatchOrders([
        arg({ isBid: false, price: 100, qty: 5, clientOrderId: 10 }),
        arg({ isBid: true, price: 100, qty: 5, clientOrderId: 11 }),
      ])
      .accountsPartial({
        market: fresh.market,
        orderBook: fresh.orderBook,
        trader: maker.trader,
        owner: maker.keypair.publicKey,
      })
      .signers([maker.keypair])
      .rpc();
    const book = await fetchOrderBook(fresh.orderBook);
    expect(activeOrders(book, "asks")).to.have.length(0);
    expect(activeOrders(book, "bids")).to.have.length(0);
  });

  it("reverts the entire batch when one element fails", async () => {
    const m = await initMarket({ tickSize: 5, lotSize: 5, minSize: 10 });
    const b = await registerTrader(m, {
      baseEndowment: 1_000_000,
      quoteEndowment: 1_000_000,
    });

    await expectRevertWith(
      ctx.program.methods
        .bulkBatchOrders([
          arg({ isBid: false, price: 100, qty: 10, clientOrderId: 20 }),
          arg({ isBid: false, price: 100, qty: 12, clientOrderId: 21 }),
        ])
        .accountsPartial({
          market: m.market,
          orderBook: m.orderBook,
          trader: b.trader,
          owner: b.keypair.publicKey,
        })
        .signers([b.keypair])
        .rpc(),
      "multiple of lot size"
    );

    const book = await fetchOrderBook(m.orderBook);
    expect(activeOrders(book, "asks")).to.have.length(0);
  });

  it("rejects a batch larger than MAX_BATCH_SIZE", async () => {
    const orders = Array.from({ length: 17 }, (_, i) => ({
      isBid: true,
      price: 100 + i,
      qty: 1,
      clientOrderId: 1000 + i,
    }));
    await expectRevertWith(
      bulk(t, orders),
      "Batch size exceeds the maximum supported length"
    );
  });

  it("interleaves a market-shaped element (price 0)", async () => {
    const m = await initMarket({ tickSize: 1, lotSize: 1, minSize: 1 });
    const maker = await registerTrader(m, {
      baseEndowment: 100,
      quoteEndowment: 1_000_000,
    });
    await ctx.program.methods
      .bulkBatchOrders([
        arg({ isBid: false, price: 100, qty: 5, clientOrderId: 30 }),
        arg({ isBid: true, price: 0, qty: 5, clientOrderId: 31 }),
      ])
      .accountsPartial({
        market: m.market,
        orderBook: m.orderBook,
        trader: maker.trader,
        owner: maker.keypair.publicKey,
      })
      .signers([maker.keypair])
      .rpc();

    // The market bid crossed the batch's own ask (self-fill) -> book empty.
    const book = await fetchOrderBook(m.orderBook);
    expect(activeOrders(book, "asks")).to.have.length(0);
    expect(activeOrders(book, "bids")).to.have.length(0);
  });
});