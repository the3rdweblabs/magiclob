// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// place_market_order - sweep behavior, empty-book no-op, and all-or-nothing
// balance failures.

import {
  bootMagiclob,
  initMarket,
  registerTrader,
  placeLimitOrder,
  placeMarketOrder,
  fetchOrderBook,
  fetchTrader,
  activeOrders,
  num,
  expectRevertWith,
  type MarketFixture,
  type TraderFixture,
} from "./helpers";
import { expect } from "chai";

const META = (k: TraderFixture) => ({ pubkey: k.trader, isSigner: false, isWritable: true });

describe("place_market_order", () => {
  let ctx: Awaited<ReturnType<typeof bootMagiclob>>;
  let f: MarketFixture;
  let maker: TraderFixture;
  let taker: TraderFixture;

  before(async () => {
    ctx = await bootMagiclob();
    f = await initMarket();
    maker = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
    taker = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
  });

  it("is a successful no-op against an empty book", async () => {
    await placeMarketOrder(f, taker, { qty: 10, clientOrderId: 100, isBid: true });
    const st = await fetchTrader(taker.trader);
    expect(num(st.baseBalance)).to.equal(1_000_000);
    expect(num(st.quoteBalance)).to.equal(1_000_000);
    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "bids")).to.have.length(0);
  });

  it("sweeps price levels until filled", async () => {
    await placeLimitOrder(f, maker, { price: 100, qty: 5, clientOrderId: 1, isBid: false });
    await placeLimitOrder(f, maker, { price: 101, qty: 5, clientOrderId: 2, isBid: false });
    await placeMarketOrder(f, taker, { qty: 8, clientOrderId: 200, isBid: true }, [META(maker)]);

    const book = await fetchOrderBook(f.orderBook);
    const asks = activeOrders(book, "asks");
    expect(asks.find((a: any) => a.clientOrderId === 1)).to.be.undefined;
    expect(asks.find((a: any) => a.clientOrderId === 2)).to.include({ price: 101, qty: 2 });

    const t = await fetchTrader(taker.trader);
    // 5@100 + 3@101 = 803, taker fee 0
    expect(num(t.baseBalance)).to.equal(1_000_000 + 8);
    expect(num(t.quoteBalance)).to.equal(1_000_000 - 803);
    const m = await fetchTrader(maker.trader);
    expect(num(m.baseBalance)).to.equal(1_000_000 - 8);
    expect(num(m.quoteBalance)).to.equal(1_000_000 + 803);
  });

  it("never rests leftover quantity", async () => {
    await placeLimitOrder(f, maker, { price: 103, qty: 5, clientOrderId: 3, isBid: false });
    await placeLimitOrder(f, maker, { price: 104, qty: 5, clientOrderId: 4, isBid: false });
    // market bid larger than the whole side
    await placeMarketOrder(f, taker, { qty: 12, clientOrderId: 300, isBid: true }, [META(maker)]);

    const book = await fetchOrderBook(f.orderBook);
    expect(activeOrders(book, "bids")).to.have.length(0);
    expect(activeOrders(book, "asks")).to.have.length(0);
  });

  it("sweeps a market sell against resting bids", async () => {
    const seller = await registerTrader(f, { baseEndowment: 1_000_000, quoteEndowment: 1_000_000 });
    const bidA = await registerTrader(f, { quoteEndowment: 1_000_000 });
    const bidB = await registerTrader(f, { quoteEndowment: 1_000_000 });
    await placeLimitOrder(f, bidA, { price: 100, qty: 5, clientOrderId: 50, isBid: true });
    await placeLimitOrder(f, bidB, { price: 99, qty: 5, clientOrderId: 51, isBid: true });

    await placeMarketOrder(f, seller, { qty: 8, clientOrderId: 500, isBid: false }, [
      META(bidA),
      META(bidB),
    ]);

    const book = await fetchOrderBook(f.orderBook);
    const bids = activeOrders(book, "bids");
    expect(bids.find((b: any) => b.clientOrderId === 50)).to.be.undefined;
    expect(bids.find((b: any) => b.clientOrderId === 51)).to.include({ price: 99, qty: 2 });

    const st = await fetchTrader(seller.trader);
    expect(num(st.baseBalance)).to.equal(1_000_000 - 8);
    expect(num(st.quoteBalance)).to.equal(1_000_000 + 797);
  });

  it("reverts the whole tx when the taker cannot pay (book restored)", async () => {
    const poor = await registerTrader(f, { quoteEndowment: 50 });
    const before = await activeOrders(await fetchOrderBook(f.orderBook), "asks");

    await placeLimitOrder(f, maker, { price: 100, qty: 5, clientOrderId: 6, isBid: false });
    const after = await activeOrders(await fetchOrderBook(f.orderBook), "asks");
    expect(after.length).to.equal(before.length + 1);

    await expectRevertWith(
      placeMarketOrder(f, poor, { qty: 5, clientOrderId: 600, isBid: true }, [META(maker)]),
      "Insufficient balance for the requested fill"
    );

    // The maker's ask survived (all-or-nothing).
    const restored = await activeOrders(await fetchOrderBook(f.orderBook), "asks");
    expect(restored.find((a: any) => a.clientOrderId === 6)).to.include({ price: 100, qty: 5 });
  });

  it("rejects an invalid self-matching option", async () => {
    await expectRevertWith(
      placeMarketOrder(f, taker, { qty: 5, clientOrderId: 700, isBid: true, selfMatchingOption: 9 }),
      "Order price must be greater than zero"
    );
  });

  it("rejects a quantity below minSize", async () => {
    await expectRevertWith(
      placeMarketOrder(f, taker, { qty: 0, clientOrderId: 800, isBid: true }),
      "Order quantity is below minimum size"
    );
  });
});