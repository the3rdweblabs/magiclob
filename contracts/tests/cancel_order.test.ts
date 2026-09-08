// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// cancel_order - removal by (owner, side, client order id) and not-found cases.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  placeLimitOrder,
  cancelOrder,
  fetchOrderBook,
  activeOrders,
  expectRevertWith,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

describe("cancel_order", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let a: TraderFixture;
  let b: TraderFixture;

  before(async () => {
    ctx = await bootMagiclob();
    f = await initMarket();
    a = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
    b = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
  });

  it("cancels the resting order it finds", async () => {
    await placeLimitOrder(f, a, { price: 100, qty: 10, clientOrderId: 1, isBid: true });
    await cancelOrder(f, a, true, 1);

    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "bids").find((o: any) => o.clientOrderId === 1)).to.be.undefined;
  });

  it("rejects cancelling an unknown order", async () => {
    await expectRevertWith(cancelOrder(f, a, true, 9999), "Order was not found");
  });

  it("rejects cancelling on the wrong side", async () => {
    await placeLimitOrder(f, a, { price: 100, qty: 10, clientOrderId: 2, isBid: false });
    await expectRevertWith(cancelOrder(f, a, true, 2), "Order was not found");
    await cancelOrder(f, a, false, 2);
  });

  it("rejects cancelling another trader's order", async () => {
    await placeLimitOrder(f, b, { price: 101, qty: 10, clientOrderId: 3, isBid: true });
    await expectRevertWith(cancelOrder(f, a, true, 3), "Order was not found");
  });

  it("does nothing when cancelling a fill span leaves other orders intact", async () => {
    await placeLimitOrder(f, a, { price: 99, qty: 10, clientOrderId: 4, isBid: true });
    await cancelOrder(f, a, true, 4);
    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "bids").find((o: any) => o.clientOrderId === 3)).to.include({ price: 101, qty: 10 });
  });
});