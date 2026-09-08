// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// modify_order - quantity bounds vs filled/original, price immutability, and
// behavior after partial fills.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  placeLimitOrder,
  modifyOrder,
  fetchOrderBook,
  activeOrders,
  num,
  expectRevertWith,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

describe("modify_order", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let s: TraderFixture;

  before(async () => {
    ctx = await bootMagiclob();
    f = await initMarket();
    s = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
  });

  it("reduces quantity within the open bounds", async () => {
    await placeLimitOrder(f, s, { price: 100, qty: 100, clientOrderId: 1, isBid: true });
    await modifyOrder(f, s, 1, true, 60, 0);

    const book = await fetchOrderBook(f.orderBook);
    const bid = activeOrders(book, "bids").find((b: any) => b.clientOrderId === 1);
    expect(bid).to.include({ price: 100, qty: 60 });
  });

  it("rejects new quantity equal to the original", async () => {
    await expectRevertWith(
      modifyOrder(f, s, 1, true, 100, 0),
      "New quantity must be less than original quantity"
    );
  });

  it("rejects new quantity at or below the filled quantity", async () => {
    await expectRevertWith(
      modifyOrder(f, s, 1, true, 0, 0),
      "New quantity must be greater than filled quantity"
    );
  });

  it("rejects changing the price without losing priority", async () => {
    const m = await initMarket();
    const tr = await registerTrader(m, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
    await placeLimitOrder(m, tr, { price: 100, qty: 100, clientOrderId: 1, isBid: true });
    await expectRevertWith(
      modifyOrder(m, tr, 1, true, 60, 101),
      "Order price cannot be changed without losing queue priority"
    );
  });

  it("rejects unknown orders", async () => {
    await expectRevertWith(modifyOrder(f, s, 9999, true, 10, 0), "Order was not found");
  });

  it("rejects quantities below minSize or off lotSize", async () => {
    const f2 = await initMarket({ tickSize: 5, lotSize: 5, minSize: 10 });
    const s2 = await registerTrader(f2, { baseEndowment: 100, quoteEndowment: 100 });
    await placeLimitOrder(f2, s2, { price: 100, qty: 100, clientOrderId: 7, isBid: true });

    await expectRevertWith(
      modifyOrder(f2, s2, 7, true, 9, 0),
      "Order quantity is below minimum size"
    );
    await expectRevertWith(
      modifyOrder(f2, s2, 7, true, 12, 0),
      "Order quantity must be a multiple of lot size"
    );
    await expectRevertWith(
      modifyOrder(f2, s2, 7, true, 10, 101),
      "Order price cannot be changed without losing queue priority"
    );
  });

  it("applies after a partial fill as original-to-filled residual", async () => {
    const market = await initMarket();
    const maker = await registerTrader(market, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    const taker = await registerTrader(market, { quoteEndowment: 1_000_000 });
    await placeLimitOrder(market, maker, { price: 100, qty: 100, clientOrderId: 5, isBid: false });

    const makerMeta = { pubkey: maker.trader, isSigner: false, isWritable: true };
    await placeLimitOrder(market, taker, { price: 100, qty: 30, clientOrderId: 501, isBid: true }, [makerMeta]);

    // filled 30, original 100, remaining 70 -> modify to 60 leaves 30.
    await modifyOrder(market, maker, 5, false, 60, 0);
    const book = await fetchOrderBook(market.orderBook);
    const ask = activeOrders(book, "asks").find((a: any) => a.clientOrderId === 5);
    expect(ask).to.include({ qty: 30 });
  });

  it("cannot modify an order that has been fully consumed", async () => {
    const market = await initMarket();
    const maker = await registerTrader(market, { baseEndowment: 100, quoteEndowment: 1_000_000 });
    const taker = await registerTrader(market, { quoteEndowment: 1_000_000 });
    await placeLimitOrder(market, maker, { price: 100, qty: 100, clientOrderId: 6, isBid: false });
    const makerMeta = { pubkey: maker.trader, isSigner: false, isWritable: true };
    await placeLimitOrder(market, taker, { price: 100, qty: 100, clientOrderId: 601, isBid: true }, [makerMeta]);
    await expectRevertWith(modifyOrder(market, maker, 6, false, 10, 0), "Order was not found");
  });
});