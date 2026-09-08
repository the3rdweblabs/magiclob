// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Shared types for magiCLOB.
 *
 * Enum values are the exact `u8` discriminants the program matches on (see the
 * `match` arms in `place_limit_order.rs` / `place_market_order.rs`), so they can
 * be passed straight through to instruction args.
 *
 * All token amounts and prices are `bigint` in raw on-chain units (base units
 * for quantities, quote-units-per-base-unit for prices). `bigint` avoids the
 * silent precision loss `number` would cause above 2^53.
 */
import type { PublicKey } from "@solana/web3.js";

/** Side of the book. */
export enum OrderSide {
  Bid = 0,
  Ask = 1,
}

/** Time-in-force. Only `GoodTillCancelled` orders rest on the book. */
export enum TimeInForce {
  GoodTillCancelled = 0,
  ImmediateOrCancel = 1,
  FillOrKill = 2,
  PostOnly = 3,
}

/** Self-trade prevention mode. */
export enum SelfMatchingOption {
  Allowed = 0,
  CancelTaker = 1,
  CancelMaker = 2,
}

/** Market lifecycle status. */
export enum MarketStatus {
  Active = 0,
  Paused = 1,
  Delisted = 2,
}

/** Trader lifecycle status. */
export enum TraderStatus {
  Active = 0,
  Delegated = 1,
  Banned = 2,
}

/** Decoded `MarketState` account. */
export interface MarketState {
  authority: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  takerFeeBps: number;
  makerFeeBps: number;
  integratorFeeBpsCap: number;
  status: MarketStatus;
  accumulatedFees: bigint;
  accumulatedIntegratorFees: bigint;
  bump: number;
  tickSize: bigint;
  lotSize: bigint;
  minSize: bigint;
  epoch: bigint;
  epochStartTimestamp: bigint;
  epochDuration: bigint;
  currentTakerFeeBps: number;
  currentMakerFeeBps: number;
  nextTakerFeeBps: number;
  nextMakerFeeBps: number;
  stakeRequired: bigint;
  minOrderSize: bigint;
  makerRebateBps: number;
  baseDecimals: number;
  quoteDecimals: number;
}

/** Decoded `TraderState` account. */
export interface TraderState {
  owner: PublicKey;
  baseBalance: bigint;
  quoteBalance: bigint;
  status: TraderStatus;
  bump: number;
  depositedBase: bigint;
  depositedQuote: bigint;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  stakedAmount: bigint;
  stakeEpoch: bigint;
  epochMakerFeesPaid: bigint;
}

/** Decoded `VaultState` account. */
export interface VaultState {
  market: PublicKey;
  vaultBaseBalance: bigint;
  vaultQuoteBalance: bigint;
  settledBase: bigint;
  settledQuote: bigint;
  owedBase: bigint;
  owedQuote: bigint;
  bump: number;
}

/** One resting order slot inside `OrderBookState`. */
export interface OrderNode {
  active: boolean;
  side: OrderSide;
  price: bigint;
  qtyRemaining: bigint;
  owner: PublicKey;
  integrator: PublicKey;
  integratorFeeBps: number;
  clientOrderId: bigint;
  sequence: bigint;
  prev: number;
  next: number;
  expireTimestamp: bigint;
  filledQuantity: bigint;
  timeInForce: TimeInForce;
  selfMatchingOption: SelfMatchingOption;
}

/** Decoded `OrderBookState` account (raw slot pools, unwalked). */
export interface OrderBookState {
  market: PublicKey;
  authority: PublicKey;
  orderSequence: bigint;
  bidHead: number;
  askHead: number;
  bidFree: number;
  askFree: number;
  bidCount: number;
  askCount: number;
  bids: OrderNode[];
  asks: OrderNode[];
}

/** Aggregated price level, mirroring `engine/price_level.rs`. */
export interface PriceLevel {
  price: bigint;
  totalQty: bigint;
  orderCount: number;
}

/** Best bid/ask summary. */
export interface TopOfBook {
  bestBid: bigint | null;
  bestAsk: bigint | null;
  bidQty: bigint;
  askQty: bigint;
  /** `bestAsk - bestBid`, or `null` when either side is empty. */
  spread: bigint | null;
}

/** Walked, best-first view of both sides of the book. */
export interface OrderBookDepth {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

/** Arguments for one element of a `bulkBatchOrders` call. */
export interface OrderArgs {
  isBid: boolean;
  /** Limit price. `0n` is treated as a market order by the program. */
  price: bigint;
  qty: bigint;
  clientOrderId: bigint;
  timeInForce: TimeInForce;
  selfMatchingOption: SelfMatchingOption;
  expireTimestamp: bigint;
}

/** Parameters for `placeLimitOrder`. */
export interface PlaceLimitOrderParams {
  market: PublicKey;
  owner: PublicKey;
  price: bigint;
  qty: bigint;
  clientOrderId: bigint;
  isBid: boolean;
  /** Must be <= the market's `integratorFeeBpsCap`. Defaults to `0`. */
  integratorFeeBps?: number;
  timeInForce?: TimeInForce;
  selfMatchingOption?: SelfMatchingOption;
  /**
   * Unix seconds after which the order is dead. Defaults to `NO_EXPIRY`
   * (`u64::MAX`). Do not pass `0n` - the engine treats that as already expired.
   */
  expireTimestamp?: bigint;
  /**
   * Owner wallets of every maker this order will cross (the SDK derives their
   * `TraderState` PDAs). The program requires an **exact** match: too few
   * reverts with `MakerAccountMissing`, too many with `UnexpectedMakerAccount`.
   * Derive with `makersForOrder()`.
   */
  makers?: PublicKey[];
}

/** Parameters for `placeMarketOrder`. */
export interface PlaceMarketOrderParams {
  market: PublicKey;
  owner: PublicKey;
  qty: bigint;
  clientOrderId: bigint;
  isBid: boolean;
  integratorFeeBps?: number;
  selfMatchingOption?: SelfMatchingOption;
  /** Owner wallets of every maker this order will cross. See `makersForOrder()`. */
  makers?: PublicKey[];
}

/** Parameters for `cancelOrder`. */
export interface CancelOrderParams {
  market: PublicKey;
  owner: PublicKey;
  isBid: boolean;
  clientOrderId: bigint;
}

/** Parameters for `modifyOrder`. Price may not change (queue priority is kept). */
export interface ModifyOrderParams {
  market: PublicKey;
  owner: PublicKey;
  clientOrderId: bigint;
  isBid: boolean;
  newQuantity: bigint;
  /** Pass `0n` to keep the existing price - the program rejects any other value. */
  newPrice?: bigint;
}

/** Parameters for `bulkBatchOrders`. */
export interface BulkBatchOrdersParams {
  market: PublicKey;
  owner: PublicKey;
  orders: OrderArgs[];
  /** Owner wallets of every maker the batch will cross. See `makersForOrder()`. */
  makers?: PublicKey[];
}

/** Parameters for `delegateSession`. */
export interface DelegateSessionParams {
  market: PublicKey;
  owner: PublicKey;
  /** Session fee payer. Defaults to `owner`, letting a sponsor pay instead. */
  payer?: PublicKey;
  /** Pin the session to a specific ER validator identity. */
  validator?: PublicKey;
}

/** Parameters for `settleAndUndelegate`. */
export interface SettleAndUndelegateParams {
  market: PublicKey;
  owner: PublicKey;
  payer?: PublicKey;
}

/** Parameters for `registerTrader`. */
export interface RegisterTraderParams {
  market: PublicKey;
  owner: PublicKey;
  payer?: PublicKey;
  /** Opening internal ledger balances. Both default to `0n`. */
  baseEndowment?: bigint;
  quoteEndowment?: bigint;
}

/** Parameters for `deposit` / `withdraw`. */
export interface VaultTransferParams {
  market: PublicKey;
  authority: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  /** The authority's own SPL token accounts. */
  baseTokenAccount: PublicKey;
  quoteTokenAccount: PublicKey;
  baseAmount?: bigint;
  quoteAmount?: bigint;
}

/** Parameters for `initializeMarket`. */
export interface InitializeMarketParams {
  authority: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  takerFeeBps: number;
  makerFeeBps: number;
  integratorFeeBpsCap: number;
  tickSize: bigint;
  lotSize: bigint;
  minSize: bigint;
  stakeRequired?: bigint;
}

/** Parameters for `stake`. */
export interface StakeParams {
  market: PublicKey;
  owner: PublicKey;
  amount: bigint;
  /** The owner's SPL token account for the staking asset. */
  tokenAccount: PublicKey;
  /** The vault's SPL token account to receive staked tokens. */
  vaultAccount: PublicKey;
  /** Mint of the token being staked. */
  mint: PublicKey;
}

/** Parameters for flash loan borrow/return instructions. */
export interface FlashLoanParams {
  market: PublicKey;
  owner: PublicKey;
  amount: bigint;
  /** Source account (for returns) or destination account (for borrows). */
  sourceAccount: PublicKey;
  /** Destination account (for borrows) or source account (for returns). */
  destinationAccount: PublicKey;
}

/** Parameters for `submit_proposal`. */
export interface SubmitProposalParams {
  market: PublicKey;
  proposer: PublicKey;
  proposalId: bigint;
  takerFeeBps: number;
  makerFeeBps: number;
  startEpoch: bigint;
  endEpoch: bigint;
}

/** Parameters for `vote`. */
export interface VoteParams {
  market: PublicKey;
  voter: PublicKey;
  proposalId: bigint;
  voteFor: boolean;
}

/** Parameters for `execute_proposal`. */
export interface ExecuteProposalParams {
  market: PublicKey;
  authority: PublicKey;
  proposalId: bigint;
}

/** Parameters for `initialize_vault_accounts`. */
export interface VaultInitParams {
  rentPayer: PublicKey;
  market: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
}
