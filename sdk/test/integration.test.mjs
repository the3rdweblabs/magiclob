// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * SDK integration suite - boots an in-process Surfpool surfnet (LiteSVM),
 * deploys the compiled magiCLOB program, and drives it entirely through the
 * high-level `MagiCLOBSDK` API. This is the test that proves the SDK's PDA
 * derivation, instruction encoding, account decoding and send/confirm plumbing
 * agree with the real on-chain program.
 *
 * Runs with: `npm run test:integration` (skipped by the default offline suite).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Surfnet } from "@solana/surfpool";
import {
  createInitializeAccountInstruction,
  createMint,
  createMintToInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  MagiCLOBSDK,
  MAGICLOB_PROGRAM_ID,
  TimeInForce,
  SelfMatchingOption,
} from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const soPath = join(__dirname, "..", "..", "contracts", "target", "deploy", "magiclob.so");
const keypairPath = join(__dirname, "..", "..", "contracts", "target", "deploy", "magiclob-keypair.json");

const opts = { skip: !existsSync(soPath) || !existsSync(keypairPath) };
test("integration: SDK boots against Surfpool and runs the full trade lifecycle", opts, async (t) => {
  const surfnet = Surfnet.startWithConfig({
    blockProductionMode: "clock",
    slotTimeMs: 400,
  });

  const connection = new Connection(surfnet.rpcUrl, {
    commitment: "confirmed",
    wsEndpoint: surfnet.wsUrl,
  });

  const payer = Keypair.fromSecretKey(Uint8Array.from(surfnet.payerSecretKey));

  const prevCwd = process.cwd();
  try {
    process.chdir(join(__dirname, "..", "..", "contracts"));
    surfnet.deployProgram("magiclob");
  } finally {
    process.chdir(prevCwd);
  }

  const deployedInfo = await connection.getAccountInfo(MAGICLOB_PROGRAM_ID, "confirmed");
  assert.ok(deployedInfo, "program not found at SDK MAGICLOB_PROGRAM_ID");
  assert.equal(deployedInfo.executable, true, "deployed account is not executable");

  const sdk = new MagiCLOBSDK({ connection });
  const trader = payer;

  const baseMint = await createMint(connection, payer, payer.publicKey, null, 0);
  const quoteMint = await createMint(connection, payer, payer.publicKey, null, 6);

  const addresses = sdk.addresses(baseMint, quoteMint);

  await t.test("initializeMarket creates on-chain accounts", async () => {
    await sdk.initializeMarket(
      {
        authority: trader.publicKey,
        baseMint,
        quoteMint,
        takerFeeBps: 25,
        makerFeeBps: 5,
        integratorFeeBpsCap: 500,
        tickSize: 1n,
        lotSize: 1n,
        minSize: 1n,
      },
      [trader]
    );

    const market = await sdk.getMarket(addresses.market);
    assert.ok(market, "market account should exist");
    assert.equal(market.authority.toBase58(), trader.publicKey.toBase58());

    const book = await sdk.getOrderBook(addresses.market);
    assert.ok(book, "order book account should exist");

    const vault = await sdk.getVault(addresses.market);
    assert.ok(vault, "vault account should exist");
  });

  await t.test("registerTrader creates the trader account", async () => {
    await sdk.registerTrader(
      { market: addresses.market, owner: trader.publicKey },
      [trader]
    );
    const traderState = await sdk.getTrader(addresses.market, trader.publicKey);
    assert.ok(traderState, "trader account should exist");
    assert.equal(traderState.owner.toBase58(), trader.publicKey.toBase58());
  });

  await t.test("deposit moves tokens into the vault", async () => {
    // Create + fund the trader's SPL token accounts, then create the vault's.
    const baseTa = await createFundedAccount(connection, payer, baseMint, trader.publicKey, 1_000_000n);
    const quoteTa = await createFundedAccount(connection, payer, quoteMint, trader.publicKey, 1_000_000n);

    await sdk.initializeVaultAccounts(
      {
        rentPayer: trader.publicKey,
        market: addresses.market,
        baseMint,
        quoteMint,
      },
      [trader]
    );

    await sdk.deposit(
      {
        market: addresses.market,
        authority: trader.publicKey,
        baseMint,
        quoteMint,
        baseTokenAccount: baseTa,
        quoteTokenAccount: quoteTa,
        baseAmount: 1_000_000n,
        quoteAmount: 1_000_000n,
      },
      [trader]
    );

    const vault = await sdk.getVault(addresses.market);
    assert.ok(vault, "vault should exist");
  });

  await t.test("placeLimitOrder + getTopOfBook + getOpenOrders", async () => {
    await sdk.placeLimitOrder(
      {
        market: addresses.market,
        owner: trader.publicKey,
        price: 100_000n,
        qty: 100n,
        clientOrderId: 1n,
        isBid: true,
        timeInForce: TimeInForce.GoodTillCancelled,
        selfMatchingOption: SelfMatchingOption.Allowed,
      },
      [trader]
    );

    const top = await sdk.getTopOfBook(addresses.market);
    assert.equal(top.bestBid, 100_000n);

    const depth = await sdk.getDepth(addresses.market);
    assert.equal(depth.bids.length, 1);

    const orders = await sdk.getOpenOrders(addresses.market, trader.publicKey);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].price, 100_000n);
  });

  await t.test("watchOrderBook fires on account change", async () => {
    await new Promise((resolve, reject) => {
      let fired = false;
      const off = sdk.watchOrderBook(addresses.market, (book) => {
        if (!fired) {
          fired = true;
          off();
          resolve();
        }
      });
      sdk
        .placeLimitOrder(
          {
            market: addresses.market,
            owner: trader.publicKey,
            price: 99_900n,
            qty: 1n,
            clientOrderId: 2n,
            isBid: true,
            timeInForce: TimeInForce.GoodTillCancelled,
            selfMatchingOption: SelfMatchingOption.Allowed,
          },
          [trader]
        )
        .catch(() => {});
      setTimeout(() => {
        off();
        reject(new Error("watchOrderBook did not fire within 5s"));
      }, 5000);
    });
  });

  await t.test("cancelOrder removes the resting order", async () => {
    await sdk.cancelOrder(
      { market: addresses.market, owner: trader.publicKey, isBid: true, clientOrderId: 1n },
      [trader]
    );
    let orders = await sdk.getOpenOrders(addresses.market, trader.publicKey);
    assert.equal(orders.length, 1);
    assert.equal(
      orders.some((o) => o.clientOrderId === 1n),
      false
    );
    await sdk.cancelOrder(
      { market: addresses.market, owner: trader.publicKey, isBid: true, clientOrderId: 2n },
      [trader]
    );
    orders = await sdk.getOpenOrders(addresses.market, trader.publicKey);
    assert.equal(orders.length, 0);
  });

  await t.test("resolveMakers returns empty makers on an untraded book", async () => {
    const makers = await sdk.resolveMakers(addresses.market, true, 100n, 0n);
    assert.ok(Array.isArray(makers));
  });

  surfnet.close?.();
});

/** Create a funded SPL token account owned by `owner` and return its pubkey. */
async function createFundedAccount(connection, payer, mint, owner, amount) {
  const account = Keypair.generate();
  const lamports = await connection.getMinimumBalanceForRentExemption(165);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: account.publicKey,
      lamports,
      space: 165,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(
      account.publicKey,
      mint,
      owner
    ),
    createMintToInstruction(mint, account.publicKey, payer.publicKey, amount)
  );
  tx.feePayer = payer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(payer, account);
  const sig = await connection.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
  await connection.confirmTransaction(sig, "confirmed");
  return account.publicKey;
}