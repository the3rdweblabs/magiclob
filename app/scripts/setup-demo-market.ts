// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Create the demo markets for the active network.
 *
 * Works on local, devnet and mainnet (devnet/mainnet need the program deployed
 * and the payer funded). For each configured pair it:
 *   1. creates SPL base/quote mints (authority = payer),
 *   2. mints supply to the payer and to the local demo address,
 *   3. initialises the market + vault PDAs through the SDK,
 *   4. records the market addresses into `.env` (`MARKETS_{NET}`),
 * re-running is idempotent (existing markets are skipped, funding re-applied).
 *
 * Usage:  npm run setup:market   (env: SOLANA_NETWORK, PAYER_KEYPAIR_PATH)
 */
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { MagiCLOBSDK, MagiCLOBClient } from "@magiclob/sdk";
import { localDemoAddress } from "../src/config/demo";
import { getNetwork, resolveNetworkConfig, type Network, type NetworkPair } from "../src/config/networks";
import { loadEnvFile } from "./lib/loadEnv";
import { payerKeypair } from "./lib/keys";

const PRESETS: Record<
  string,
  { tick: bigint; lot: bigint; min: bigint; baseDecimals: number; quoteDecimals: number; baseSupply: bigint; quoteSupply: bigint }
> = {
  "SOL/USDC": {
    tick: 10_000n,          // 0.01 USDC (6 decimals)
    lot: 100_000_000n,      // 0.1 SOL (9 decimals)
    min: 100_000_000n,
    baseDecimals: 9,
    quoteDecimals: 6,
    baseSupply: 20_000_000_000_000n, // 20_000 SOL
    quoteSupply: 2_000_000_000_000n,  // 2_000_000 USDC
  },
  "MAGIC/USDC": {
    tick: 100_000n,         // 0.1 USDC
    lot: 10_000_000n,       // 0.01 MAGIC
    min: 10_000_000n,
    baseDecimals: 9,
    quoteDecimals: 6,
    baseSupply: 100_000_000_000_000n, // 100_000 MAGIC
    quoteSupply: 2_000_000_000_000n,  // 2_000_000 USDC
  },
};

const DEFAULT_PRESET = PRESETS["SOL/USDC"];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Throttle between RPC bursts: the public devnet endpoint 429s per-method limits. */
async function slow(): Promise<void> {
  await sleep(350);
}

async function fundedPayer(conn: import("@solana/web3.js").Connection, payer: import("@solana/web3.js").Keypair): Promise<void> {
  const balance = await conn.getBalance(payer.publicKey);
  if (balance < 5_000_000_000) {
    throw new Error(
      `payer ${payer.publicKey.toBase58()} has ${balance} lamports - fund it first ` +
        `(airdrop for devnet: solana airdrop 5 ${payer.publicKey.toBase58()} --url devnet)`
    );
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const network = getNetwork();
  const cfg = resolveNetworkConfig(network);
  const payer = payerKeypair();
  const demo = localDemoAddress();

  console.log(`[setup:market] network=${network}`);
  console.log(`[setup:market] payer=${payer.publicKey.toBase58()}`);
  console.log(`[setup:market] local demo address=${demo.toBase58()}`);
  if (network === "mainnet") {
    console.warn("[setup:market] mainnet: this CREATES a real on-chain market and spends real tokens.");
  }

  const client = new MagiCLOBClient({
    connection: cfg.rpcUrl,
    ephemeralConnection: cfg.routerUrl ?? undefined,
    programId: cfg.programId,
  });
  const sdk = new MagiCLOBSDK(client);

  await fundedPayer(client.connection, payer);

  const found: Array<{ pair: NetworkPair; market: string }> = [];

  for (const pair of cfg.pairs) {
    const preset = PRESETS[pair.symbol] ?? DEFAULT_PRESET;
    console.log(`\n[setup:market] ${pair.symbol}…`);

    // Reuse an existing market when the book account is already live.
    if (pair.market) {
      try {
        const existing = new PublicKey(pair.market);
        const state = await sdk.getMarket(existing, "base");
        if (state) {
          console.log(`[setup:market]   market exists: ${pair.market}`);
          found.push({ pair, market: pair.market });
          continue;
        }
      } catch {
        /* fall through and create */
      }
    }

    const baseMint = await createMint(
      client.connection,
      payer,
      payer.publicKey,
      null,
      preset.baseDecimals
    );
    const quoteMint = await createMint(
      client.connection,
      payer,
      payer.publicKey,
      null,
      preset.quoteDecimals
    );
    console.log(`[setup:market]   mints: base=${baseMint.toBase58()} quote=${quoteMint.toBase58()}`);
    await slow();

    const basePayer = (await getOrCreateAssociatedTokenAccount(client.connection, payer, baseMint, payer.publicKey)).address;
    const quotePayer = (await getOrCreateAssociatedTokenAccount(client.connection, payer, quoteMint, payer.publicKey)).address;
    const baseDemo = (await getOrCreateAssociatedTokenAccount(client.connection, payer, baseMint, demo)).address;
    const quoteDemo = (await getOrCreateAssociatedTokenAccount(client.connection, payer, quoteMint, demo)).address;
    await slow();

    const halfBase = preset.baseSupply / 2n;
    const halfQuote = preset.quoteSupply / 2n;
    await mintTo(client.connection, payer, baseMint, basePayer, payer.publicKey, halfBase, []);
    await mintTo(client.connection, payer, quoteMint, quotePayer, payer.publicKey, halfQuote, []);
    await mintTo(client.connection, payer, baseMint, baseDemo, payer.publicKey, halfBase, []);
    await mintTo(client.connection, payer, quoteMint, quoteDemo, payer.publicKey, halfQuote, []);
    console.log(`[setup:market]   minted supply (payer + demo)`);
    await slow();

    const market = sdk.market(baseMint, quoteMint);
    const marketSig = await sdk.initializeMarket(
      {
        authority: payer.publicKey,
        baseMint,
        quoteMint,
        takerFeeBps: 8,
        makerFeeBps: 2,
        integratorFeeBpsCap: 100,
        tickSize: preset.tick,
        lotSize: preset.lot,
        minSize: preset.min,
        stakeRequired: 0n,
      },
      [payer]
    );
    console.log(`[setup:market]   market ${market.toBase58()} created: ${marketSig}`);
    await slow();

    const vaultSig = await sdk.initializeVaultAccounts(
      { rentPayer: payer.publicKey, market, baseMint, quoteMint },
      [payer]
    );
    console.log(`[setup:market]   vault accounts: ${vaultSig}`);
    await slow();

    found.push({ pair, market: market.toBase58() });

    // Persist immediately after each pair completes so a later failure never
    // forces the next run to recreate markets (and re-mint) from scratch.
    const markets: Record<string, string> = {};
    for (const f of found) markets[f.pair.symbol] = f.market;
    const envPath = upsertMarketsEnv(network, markets);
    console.log(`[setup:market]   recorded ${pair.symbol} in ${envPath}`);
  }

  if (found.length === 0) {
    console.log("\n[setup:market] nothing to create.");
    return;
  }

  const markets: Record<string, string> = {};
  for (const f of found) markets[f.pair.symbol] = f.market;
  console.log("\n[setup:market] market addresses in .env:");
  for (const f of found) console.log(`[setup:market]   ${f.pair.symbol} ${f.market}`);
  console.log(`\nNext: npm run seed:history   (funds the vault and starts market-making)`);
}

function upsertMarketsEnv(network: Network, markets: Record<string, string>): string {
  const envPath = resolve(process.cwd(), ".env");
  const key = `MARKETS_${network.toUpperCase()}`;
  let lines: string[] = [];
  if (existsSync(envPath)) lines = readFileSync(envPath, "utf8").split("\n");
  const idx = lines.findIndex((l) => new RegExp(`^${key}=`).test(l));
  const existing = new RegExp(`^${key}=\\s*"(.*)"`).exec(idx >= 0 ? lines[idx] : "");
  const merged = { ...(existing ? safeParse(existing[1]) : {}), ...markets };
  const rendered = `${key}="${JSON.stringify(merged)}"`;
  if (idx >= 0) lines[idx] = rendered;
  else lines.push(rendered);
  writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "") + "\n");
  return envPath;
}

function safeParse(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s.replace(/\\"/g, '"'));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

main().catch((err) => {
  const logs = (err as { logs?: string[] })?.logs;
  console.error(
    "[setup:market] failed:",
    err instanceof Error
      ? `${err.message}${logs?.length ? "\n  on-chain logs:\n    " + logs.join("\n    ") : ""}`
      : err
  );
  process.exit(1);
});