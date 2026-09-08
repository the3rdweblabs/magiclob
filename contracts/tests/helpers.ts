// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// Test harness: boots an in-process Surfpool surfnet (LiteSVM), deploys the
// Magiclob program, and exposes anchor/web3 handlers, cheatcode helpers, PDA
// derivations and account fixtures shared by every suite.

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Surfnet } from "@solana/surfpool";
import {
  createInitializeAccountInstruction,
  createMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey as Web3PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { expect } from "chai";

// Re-export the shared program/account ids so suites only import the harness.
export { TOKEN_PROGRAM_ID };
export { SystemProgram, LAMPORTS_PER_SOL, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY };

// Constants

const IDL_CACHE = loadIdl();
export const PROGRAM_ID = new Web3PublicKey(IDL_CACHE.address);
export const BPF_UPGRADEABLE_LOADER = new Web3PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

export const MARKET_SEED = Buffer.from("market");
export const ORDER_BOOK_SEED = Buffer.from("order_book");
export const VAULT_SEED = Buffer.from("vault");
export const TRADER_SEED = Buffer.from("trader");
export const STAKE_SEED = Buffer.from("stake");
export const PROPOSAL_SEED = Buffer.from("proposal");
export const FLASH_LOAN_SEED = Buffer.from("flash_loan");

export const QUOTE_DECIMALS = 8; // quote decimals used for fixtures

export const bn = (n: number | string | bigint) => new BN(n.toString());

/**
 * Assert a promise rejects with a specific anchor custom-program error.
 * anchor 0.31 surfaces these in tx logs as both the AnchorError number and a
 * `Custom program error: 0x…` line; we match on the 0x hex tag.
 */
export async function expectCustomError(promise: Promise<unknown>, code: number) {
  let err: any;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  const hex = `0x${code.toString(16).padStart(6, "0")}`;
  expect(err, `expected custom error ${hex}, but the call succeeded`).to.be.ok;
  const logs = Array.isArray(err?.logs) ? err.logs.join("\n") : "";
  const text = logs + "\n" + String(err?.message ?? "");
  expect(text, `expected logs to contain ${hex}`).to.include(hex);
  return err;
}

export async function expectRevertWith(p: Promise<unknown>, msg: string) {
  let err: any;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, `expected tx to fail with "${msg}"`).to.be.ok;
  const logs = Array.isArray(err?.logs) ? err.logs.join("\n") : "";
  const text = logs + "\n" + String(err?.message ?? "");
  expect(text, `expected error to contain "${msg}"`).to.include(msg);
  return err;
}

/** Assert a tx fails for any reason and return the error. */
export async function expectRejected(p: Promise<unknown>) {
  let err: any;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, "expected tx to revert").to.be.ok;
  return err;
}

const TOKEN_ACCOUNT_LEN = 165;
export async function tokenAccountBytes(
  mint: Web3PublicKey,
  owner: Web3PublicKey,
  amount = 0n
): Promise<Buffer> {
  const buf = Buffer.alloc(TOKEN_ACCOUNT_LEN);
  mint.toBuffer().copy(buf, 0); // mint   @ 0
  owner.toBuffer().copy(buf, 32); // owner @ 32
  buf.writeBigUInt64LE(amount, 64); // amount @ 64
  // 72..76 delegateOption = None (already zeroed)
  // 76..108 delegate (zeroed)
  buf.writeUInt8(1, 108); // AccountState::Initialized @ 108
  // 109..113 isNativeOption = None, 113..121 isNative = 0
  // 121..129 delegatedAmount = 0, 129..133 closeAuthorityOption = None
  // 133..165 closeAuthority (zeroed)
  return buf;
}

// Boot + deployment

/**
 * Mode of the currently-bound test harness. Offline suites bind a fresh
 * in-process Surfpool surfnet (LiteSVM); the ER lifecycle suite binds an
 * already-running local MagicBlock stack via `connectMagiclobStack`.
 */
export type TransportMode = "surfpool" | "stack";

let surfnet: Surfnet | null = null;
let mode: TransportMode = "surfpool";
let connection: Connection;
let provider: anchor.AnchorProvider;
let program: any;
let payer: Keypair;

function loadIdl() {
  const idlPath = join(__dirname, "..", "target", "idl", "magiclob.json");
  if (!existsSync(idlPath)) {
    throw new Error(
      "target/idl/magiclob.json not found — regenerate with `anchor build` first"
    );
  }
  return JSON.parse(readFileSync(idlPath, "utf8"));
}

/** Deploy the compiled program into the given runtime. `deploy` is a
 *  runtime-specific plumber: `surfnet.deploy` for the offline sim, a real BPF
 *  upgradeable-loader deploy for a live stack. */
function deployProgram(runtimeDeploy: (so: Buffer) => Promise<void> | void) {
  const soPath = join(__dirname, "..", "target", "deploy", "magiclob.so");
  if (!existsSync(soPath)) throw new Error(`${soPath} not found`);
  return runtimeDeploy(readFileSync(soPath));
}

/** Build the shared anchor stack (program, provider, payer) around a live
 *  `Connection`. Used by both the surfpool boot and the stack connect. */
function buildAnchorStack(conn: Connection, walletKeypair: Keypair) {
  connection = conn;
  payer = walletKeypair;
  const wallet = new anchor.Wallet(payer);
  provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
  anchor.setProvider(provider);
  program = new anchor.Program(loadIdl(), provider);
}

/** Boot the shared surfnet (offline by default), deploy the program, and
 *  build the anchor stack around the surfnet's own pre-funded payer. */
export async function bootMagiclob() {
  if (program) return { surfnet, connection, provider, program, payer, mode };

  surfnet = Surfnet.startWithConfig({
    blockProductionMode: "clock",
    slotTimeMs: 400,
  });

  // Surfpool serves RPC and WS on separate dynamic ports, so pass the WS
  // endpoint explicitly instead of letting web3.js derive it from the RPC URL.
  connection = new Connection(surfnet.rpcUrl, {
    commitment: "confirmed",
    wsEndpoint: surfnet.wsUrl,
  });

  // Reuse surfnet's pre-funded payer (10 SOL) instead of minting a fresh one.
  payer = Keypair.fromSecretKey(Uint8Array.from(surfnet.payerSecretKey));

  // Deploy from the anchor artifacts for this program so surfpool registers
  // the program at the keypair's pubkey with the executable flag set, using
  // surfnet's pre-funded payer. Bytes-mode deploy leaves the account
  // non-executable for the send path.
  const prevCwd = process.cwd();
  try {
    process.chdir(join(__dirname, ".."));
    surfnet!.deployProgram("magiclob");
  } finally {
    process.chdir(prevCwd);
  }

  buildAnchorStack(connection, payer);

  return { surfnet, connection, provider, program, payer, mode };
}

/**
 * Bind the harness to an **already-running** local MagicBlock stack instead of
 * spawning a surfnet. The stack must expose its RPC/WS endpoints (base default
 * 8899, public/query-filtering ER default 6699) and already have the program
 * deployed under `PROGRAM_ID`. Returns a handle to use `readonly`/`fetch` on
 * the ER without the offline cheatcodes (which are surfpool-only).
 */
export async function connectMagiclobStack(opts: {
  baseRpc: string;
  baseWs?: string;
  erRpc?: string;
  erWs?: string;
  payer?: Keypair;
  deploy?: (so: Buffer) => Promise<void> | void;
}): Promise<{
  surfnet: null;
  connection: Connection;
  provider: anchor.AnchorProvider;
  program: any;
  payer: Keypair;
  mode: TransportMode;
}> {
  if (program) throw new Error("harness already bound — call one boot path");

  mode = "stack";
  const conn = new Connection(opts.baseRpc, {
    commitment: "confirmed",
    wsEndpoint: opts.baseWs,
  });
  const p = opts.payer ?? Keypair.fromSecretKey(Uint8Array.from(Keypair.generate().secretKey));

  if (opts.deploy) await deployProgram(opts.deploy);

  buildAnchorStack(conn, p);

  return { surfnet: null, connection, provider, program, payer, mode };
}

// Cheatcode helpers

/** Throw when an offline-only cheatcode is used against a real MagicBlock
 *  stack. Live stacks do not expose put-like account/data/travel primitives. */
function requireSurfpool(fn: string) {
  if (mode !== "surfpool") {
    throw new Error(`${fn} is a Surfpool-only cheatcode (current mode: ${mode})`);
  }
}

export async function fundSol(account: Web3PublicKey, lamports: number) {
  requireSurfpool("fundSol");
  surfnet!.fundSol(account.toBase58(), Math.floor(lamports));
}

/**
 * Move surfnet's clock to an absolute Unix timestamp.
 * `opts.absoluteTimestamp` is in SECONDS (surfpool uses milliseconds).
 */
export async function timeTravel(opts: Record<string, number | bigint>) {
  requireSurfpool("timeTravel");
  const abs = opts.absoluteTimestamp;
  if (abs === undefined) throw new Error("timeTravel requires absoluteTimestamp");
  surfnet!.timeTravelToTimestamp(Number(abs) * 1000);
}

/** Set arbitrary account data at `key`, preserving lamports if the account
 *  already exists (otherwise rent-exempt minimum). `owner` defaults to the
 *  existing owner (or the magiclob program for fresh accounts). */
export async function setAccountData(
  key: Web3PublicKey,
  data: Buffer | number[],
  owner?: Web3PublicKey
) {
  const buffer = Array.from(Buffer.isBuffer(data) ? data : data);
  const existing = await connection.getAccountInfo(key);
  const lamports =
    existing?.lamports ??
    (await connection.getMinimumBalanceForRentExemption(buffer.length));
  const resolvedOwner = owner ?? existing?.owner ?? PROGRAM_ID;
  requireSurfpool("setAccountData");
  surfnet!.setAccount(
    key.toBase58(),
    lamports,
    Uint8Array.from(buffer),
    resolvedOwner.toBase58()
  );
}

/** Fund a specific (non-ATA) token account by overwriting its data. */
export async function fundTokenAccount(
  account: Web3PublicKey,
  owner: Web3PublicKey,
  mint: Web3PublicKey,
  amount: number | bigint
) {
  const bytes = await tokenAccountBytes(mint, owner, BigInt(amount));
  await setAccountData(account, bytes, TOKEN_PROGRAM_ID);
}

// PDA derivation

export function marketPda(baseMint: Web3PublicKey, quoteMint: Web3PublicKey) {
  return Web3PublicKey.findProgramAddressSync(
    [MARKET_SEED, baseMint.toBuffer(), quoteMint.toBuffer()],
    PROGRAM_ID
  );
}
export function orderBookPda(market: Web3PublicKey) {
  return Web3PublicKey.findProgramAddressSync(
    [ORDER_BOOK_SEED, market.toBuffer()],
    PROGRAM_ID
  );
}
export function vaultPda(market: Web3PublicKey) {
  return Web3PublicKey.findProgramAddressSync([VAULT_SEED, market.toBuffer()], PROGRAM_ID);
}
export function vaultTokenPda(market: Web3PublicKey, side: "base" | "quote") {
  return Web3PublicKey.findProgramAddressSync(
    [VAULT_SEED, market.toBuffer(), Buffer.from(side === "base" ? "base" : "quote")],
    PROGRAM_ID
  );
}
export function traderPda(market: Web3PublicKey, owner: Web3PublicKey) {
  return Web3PublicKey.findProgramAddressSync(
    [TRADER_SEED, market.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  );
}
export function stakePda(market: Web3PublicKey, owner: Web3PublicKey) {
  return Web3PublicKey.findProgramAddressSync(
    [STAKE_SEED, market.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  );
}
export function proposalPda(market: Web3PublicKey, id: number | bigint) {
  const idBuf = Buffer.from(new BN(id).toArray("le", 8));
  return Web3PublicKey.findProgramAddressSync(
    [PROPOSAL_SEED, market.toBuffer(), idBuf],
    PROGRAM_ID
  );
}
export function flashLoanPda(
  market: Web3PublicKey,
  borrower: Web3PublicKey,
  asset: 0 | 1
) {
  return Web3PublicKey.findProgramAddressSync(
    [FLASH_LOAN_SEED, market.toBuffer(), borrower.toBuffer(), Buffer.from([asset])],
    PROGRAM_ID
  );
}

// On-chain fixtures

export async function createMintAccount(decimals = QUOTE_DECIMALS): Promise<Web3PublicKey> {
  const mintKeypair = Keypair.generate();
  return createMint(
    connection,
    payer,
    mintKeypair.publicKey, // mint authority set to itself (irrelevant for cheatcode-funded tests)
    null, // no freeze authority
    decimals,
    mintKeypair
  );
}

/** Create a token account owned by a non-program authority (a real keypair). */
export async function createOwnedTokenAccount(
  mint: Web3PublicKey,
  owner: Web3PublicKey
): Promise<Web3PublicKey> {
  const account = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_LEN);
  const tx = new anchor.web3.Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: account.publicKey,
      lamports: rent,
      space: TOKEN_ACCOUNT_LEN,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(account.publicKey, mint, owner)
  );
  await anchor.web3.sendAndConfirmTransaction(connection, tx, [payer, account]);
  return account.publicKey;
}

/**
 * Create the vault base/quote token accounts at their PDAs via the real,
 * idempotent `initializeVaultAccounts` program instruction. This is the same
 * call a real client makes and works on both the offline surfpool sim and a
 * live stack. On a live stack the program-deployed `initializeVaultAccounts`
 * creates the vault-PDA-owned token accounts (owner is the
 * `[b"vault", market]` VaultState PDA, not the program ID) by CPI.
 */
export async function createVaultTokenAccounts(
  market: Web3PublicKey,
  baseMint: Web3PublicKey,
  quoteMint: Web3PublicKey
) {
  const [vaultBase] = vaultTokenPda(market, "base");
  const [vaultQuote] = vaultTokenPda(market, "quote");
  await program.methods
    .initializeVaultAccounts()
    .accountsPartial({
      rentPayer: payer.publicKey,
      market,
      baseMint,
      quoteMint,
      baseVaultAccount: vaultBase,
      quoteVaultAccount: vaultQuote,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
}

export interface MarketFixture {
  baseMint: Web3PublicKey;
  quoteMint: Web3PublicKey;
  market: Web3PublicKey;
  orderBook: Web3PublicKey;
  vault: Web3PublicKey;
  vaultBase: Web3PublicKey;
  vaultQuote: Web3PublicKey;
}

/** Create mints, initialize a market with the given params, and prep vault ATAs. */
export async function initMarket(opts?: {
  takerFeeBps?: number;
  makerFeeBps?: number;
  integratorFeeBpsCap?: number;
  tickSize?: number;
  lotSize?: number;
  minSize?: number;
  stakeRequired?: number;
}): Promise<MarketFixture> {
  const {
    takerFeeBps = 5,
    makerFeeBps = 0,
    integratorFeeBpsCap = 100,
    tickSize = 1,
    lotSize = 1,
    minSize = 1,
    stakeRequired = 0,
  } = opts ?? {};

  const baseMint = await createMintAccount();
  const quoteMint = await createMintAccount();
  const [market] = marketPda(baseMint, quoteMint);
  const [orderBook] = orderBookPda(market);
  const [vault] = vaultPda(market);

  await program.methods
    .initializeMarket(
      bn(takerFeeBps),
      bn(makerFeeBps),
      bn(integratorFeeBpsCap),
      bn(tickSize),
      bn(lotSize),
      bn(minSize),
      bn(stakeRequired)
    )
    .accountsPartial({
      authority: payer.publicKey,
      market,
      orderBook,
      vault,
      baseMint,
      quoteMint,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  await createVaultTokenAccounts(market, baseMint, quoteMint);
  const [vaultBase] = vaultTokenPda(market, "base");
  const [vaultQuote] = vaultTokenPda(market, "quote");

  return { baseMint, quoteMint, market, orderBook, vault, vaultBase, vaultQuote };
}

export interface TraderFixture {
  keypair: Keypair;
  trader: Web3PublicKey;
  baseAta: Web3PublicKey;
  quoteAta: Web3PublicKey;
}

/** Register a trader with internal endowments and fund their real ATAs. */
export async function registerTrader(
  fixture: MarketFixture,
  opts?: {
    baseEndowment?: number | bigint;
    quoteEndowment?: number | bigint;
    baseTokens?: number | bigint;
    quoteTokens?: number | bigint;
  }
): Promise<TraderFixture> {
  const { baseEndowment = 1_000_000, quoteEndowment = 1_000_000 } = opts ?? {};
  const keypair = Keypair.generate();
  await fundSol(keypair.publicKey, LAMPORTS_PER_SOL * 0.1);
  const [trader] = traderPda(fixture.market, keypair.publicKey);
  const baseAta = await createOwnedTokenAccount(fixture.baseMint, keypair.publicKey);
  const quoteAta = await createOwnedTokenAccount(fixture.quoteMint, keypair.publicKey);

  await program.methods
    .registerTrader(bn(baseEndowment), bn(quoteEndowment))
    .accountsPartial({
      payer: payer.publicKey,
      market: fixture.market,
      trader,
      owner: keypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([keypair])
    .rpc();

  if (opts?.baseTokens !== undefined)
    await fundTokenAccount(baseAta, keypair.publicKey, fixture.baseMint, opts.baseTokens);
  if (opts?.quoteTokens !== undefined)
    await fundTokenAccount(quoteAta, keypair.publicKey, fixture.quoteMint, opts.quoteTokens);

  return { keypair, trader, baseAta, quoteAta };
}

/** Deposit real tokens from a trader ATA into the vault. */
export async function deposit(
  fixture: MarketFixture,
  trader: TraderFixture,
  baseAmount: number | bigint,
  quoteAmount: number | bigint
) {
  await program.methods
    .deposit(bn(baseAmount), bn(quoteAmount))
    .accountsPartial({
      authority: trader.keypair.publicKey,
      market: fixture.market,
      vault: fixture.vault,
      trader: trader.trader,
      baseMint: fixture.baseMint,
      quoteMint: fixture.quoteMint,
      baseTokenAccount: trader.baseAta,
      quoteTokenAccount: trader.quoteAta,
      baseVaultAccount: fixture.vaultBase,
      quoteVaultAccount: fixture.vaultQuote,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([trader.keypair])
    .rpc();
}

/** Withdraw real tokens from the vault to the trader's ATA. */
export async function withdraw(
  fixture: MarketFixture,
  trader: TraderFixture,
  baseAmount: number | bigint,
  quoteAmount: number | bigint
) {
  await program.methods
    .withdraw(bn(baseAmount), bn(quoteAmount))
    .accountsPartial({
      authority: trader.keypair.publicKey,
      market: fixture.market,
      vault: fixture.vault,
      trader: trader.trader,
      destinationBaseAccount: trader.baseAta,
      destinationQuoteAccount: trader.quoteAta,
      baseVaultAccount: fixture.vaultBase,
      quoteVaultAccount: fixture.vaultQuote,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([trader.keypair])
    .rpc();
}

/** Place a limit order with exhaustively-specified args. */
export async function placeLimitOrder(
  fixture: MarketFixture,
  trader: TraderFixture,
  args: {
    price: number | bigint;
    qty: number | bigint;
    clientOrderId: number | bigint;
    isBid: boolean;
    integratorFeeBps?: number | bigint;
    timeInForce?: number; // 0 GTC, 1 IOC, 2 FOK, 3 PostOnly
    selfMatchingOption?: number; // 0 Allowed, 1 CancelTaker, 2 CancelMaker
    expireTimestamp?: bigint;
  },
  remainingAccounts: { pubkey: Web3PublicKey; isSigner: boolean; isWritable: boolean }[] = []
) {
  const { price, qty, clientOrderId, isBid } = args;
  const integratorFeeBps = args.integratorFeeBps ?? 0;
  const timeInForce = args.timeInForce ?? 0;
  const selfMatchingOption = args.selfMatchingOption ?? 0;
  const expireTimestamp = args.expireTimestamp ?? EXPIRY_MAX;
  await program.methods
    .placeLimitOrder(
      bn(price),
      bn(qty),
      bn(clientOrderId),
      isBid,
      bn(integratorFeeBps),
      timeInForce,
      selfMatchingOption,
      bn(expireTimestamp)
    )
    .accountsPartial({
      market: fixture.market,
      orderBook: fixture.orderBook,
      trader: trader.trader,
      owner: trader.keypair.publicKey,
    })
    .remainingAccounts(remainingAccounts)
    .signers([trader.keypair])
    .rpc();
}

export const EXPIRY_MAX = 18446744073709551615n;

/** Modify a resting order's quantity/price. */
export async function modifyOrder(
  fixture: MarketFixture,
  trader: TraderFixture,
  clientOrderId: number | bigint,
  isBid: boolean,
  newQuantity: number | bigint,
  newPrice: number | bigint = 0
) {
  await program.methods
    .modifyOrder(bn(clientOrderId), isBid, bn(newQuantity), bn(newPrice))
    .accountsPartial({
      market: fixture.market,
      orderBook: fixture.orderBook,
      trader: trader.trader,
      owner: trader.keypair.publicKey,
    })
    .signers([trader.keypair])
    .rpc();
}

/** Cancel a resting order by owner + client order id. */
export async function cancelOrder(
  fixture: MarketFixture,
  trader: TraderFixture,
  isBid: boolean,
  clientOrderId: number | bigint
) {
  await program.methods
    .cancelOrder(isBid, bn(clientOrderId))
    .accountsPartial({
      market: fixture.market,
      orderBook: fixture.orderBook,
      trader: trader.trader,
      owner: trader.keypair.publicKey,
    })
    .signers([trader.keypair])
    .rpc();
}

/** Place a market order. */
export async function placeMarketOrder(
  fixture: MarketFixture,
  trader: TraderFixture,
  args: {
    qty: number | bigint;
    clientOrderId: number | bigint;
    isBid: boolean;
    integratorFeeBps?: number | bigint;
    selfMatchingOption?: number;
  },
  remainingAccounts: { pubkey: Web3PublicKey; isSigner: boolean; isWritable: boolean }[] = []
) {
  const { qty, clientOrderId, isBid } = args;
  await program.methods
    .placeMarketOrder(
      bn(qty),
      bn(clientOrderId),
      isBid,
      bn(args.integratorFeeBps ?? 0),
      args.selfMatchingOption ?? 0
    )
    .accountsPartial({
      market: fixture.market,
      orderBook: fixture.orderBook,
      trader: trader.trader,
      owner: trader.keypair.publicKey,
    })
    .remainingAccounts(remainingAccounts)
    .signers([trader.keypair])
    .rpc();
}

// State fetch/assert helpers

export async function fetchMarket(market: Web3PublicKey) {
  return program.account.marketState.fetch(market);
}
export async function fetchOrderBook(orderBook: Web3PublicKey) {
  return program.account.orderBookState.fetch(orderBook);
}
export async function fetchTrader(trader: Web3PublicKey) {
  return program.account.traderState.fetch(trader);
}
export async function fetchVault(vault: Web3PublicKey) {
  return program.account.vaultState.fetch(vault);
}
export async function fetchStakeInfo(stake: Web3PublicKey) {
  return program.account.stakeInfo.fetch(stake);
}
export async function fetchProposal(proposal: Web3PublicKey) {
  return program.account.proposal.fetch(proposal);
}
export async function fetchFlashLoan(flashLoan: Web3PublicKey) {
  return program.account.flashLoan.fetch(flashLoan);
}

/** Live orders on one side of a fetched OrderBookState, cheapest to read. */
export function activeOrders(book: any, side: "bids" | "asks") {
  return book[side]
    .filter((n: any) => n.active && num(n.qtyRemaining) > 0)
    .map((n: any) => ({
      price: num(n.price),
      qty: num(n.qtyRemaining),
      clientOrderId: num(n.clientOrderId),
      owner: String(n.owner),
    }));
}

export const toBn = (v: any) => new BN(v.toString());
export const num = (v: any) => (v instanceof BN ? v.toNumber() : Number(v));

export async function tokenBalanceOf(account: Web3PublicKey): Promise<bigint> {
  const info = await connection.getAccountInfo(account);
  if (!info || info.data.length !== TOKEN_ACCOUNT_LEN) return 0n;
  return info.data.readBigUInt64LE(64);
}

/** Overwrite a little-endian u64 inside an account (used to simulate state
 *  the program never writes, e.g. market.epoch or vault balances). */
export async function patchAccountU64(key: Web3PublicKey, offset: number, value: number | bigint) {
  const buf = Buffer.from((await connection.getAccountInfo(key))!.data);
  buf.writeBigUInt64LE(BigInt(value), offset);
  await setAccountData(key, buf);
}

// Borsh field offsets (account discriminator 8 bytes + preceding fields).
export const MARKET_EPOCH_OFFSET = 152; // 8 disc + 32*3 + 2*3 fees + 1 status + 8*2 + 1 bump + 8*3 = 152
export const VAULT_BASE_BALANCE_OFFSET = 40; // 8 + 32
export const VAULT_QUOTE_BALANCE_OFFSET = 48; // 8 + 32 + 8

/** Give the vault's token account at `market`/`side` a real SPL balance by
 *  overwriting the crafted token-account data (the program's PDAs cannot sign
 *  user CPIs, so we mirror what deposits/withdraws would have produced). */
export async function fundVaultToken(fixture: MarketFixture, side: "base" | "quote", amount: number | bigint) {
  const pda = side === "base" ? fixture.vaultBase : fixture.vaultQuote;
  const mint = side === "base" ? fixture.baseMint : fixture.quoteMint;
  const [vault] = vaultPda(fixture.market);
  const bytes = await tokenAccountBytes(mint, vault, BigInt(amount));
  await setAccountData(pda, bytes, TOKEN_PROGRAM_ID);
}

export {
  surfnet,
  connection,
  provider,
  payer,
  program,
  expect,
};
export { mode };