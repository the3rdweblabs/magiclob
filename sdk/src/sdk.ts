// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `MagiCLOBSDK` - the high-level entry point.
 *
 * Wraps `MagiCLOBClient` with PDA resolution, account decoding and one method
 * per instruction, so an integrator writes `sdk.placeLimitOrder({...})` instead
 * of assembling account metas by hand.
 *
 * Layer routing is handled for you: trading calls go to the Ephemeral Rollup
 * when one is configured and the trader is in a session, custody calls always
 * go to the base layer. Pass an explicit `layer` to override.
 */
import {
  Connection,
  PublicKey,
  Signer,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import {
  decodeMarketState,
  decodeOrderBookState,
  decodeTraderState,
  decodeVaultState,
  depth,
  makersForOrder,
  ordersByOwner,
  topOfBook,
} from "./accounts";
import { MagiCLOBClient, type Layer, type MagiCLOBClientOptions } from "./client";
import { MAGICLOB_PROGRAM_ID } from "./constants";
import {
  createBulkBatchOrdersInstruction,
  createCancelOrderInstruction,
  createDelegateSessionInstruction,
  createDepositInstruction,
  createInitializeMarketInstruction,
  createModifyOrderInstruction,
  createPlaceLimitOrderInstruction,
  createPlaceMarketOrderInstruction,
  createRegisterTraderInstruction,
  createSettleAndUndelegateInstruction,
  createWithdrawInstruction,
  createStakeInstruction,
  createBorrowFlashLoanBaseInstruction,
  createBorrowFlashLoanQuoteInstruction,
  createReturnFlashLoanBaseInstruction,
  createReturnFlashLoanQuoteInstruction,
  createSubmitProposalInstruction,
  createVoteInstruction,
  createExecuteProposalInstruction,
  createInitializeVaultAccountsInstruction,
} from "./instructions";
import {
  marketAddresses,
  marketPda,
  orderBookPda,
  traderPda,
  vaultPda,
  stakePda,
  proposalPda,
  type MarketAddresses,
} from "./pda";
import {
  TraderStatus,
  type BulkBatchOrdersParams,
  type CancelOrderParams,
  type DelegateSessionParams,
  type InitializeMarketParams,
  type MarketState,
  type ModifyOrderParams,
  type OrderBookDepth,
  type OrderBookState,
  type OrderNode,
  type PlaceLimitOrderParams,
  type PlaceMarketOrderParams,
  type RegisterTraderParams,
  type SettleAndUndelegateParams,
  type TopOfBook,
  type TraderState,
  type VaultState,
  type VaultTransferParams,
  type StakeParams,
  type FlashLoanParams,
  type SubmitProposalParams,
  type VoteParams,
  type ExecuteProposalParams,
  type VaultInitParams,
} from "./types";

/** Options accepted by the `MagiCLOBSDK` constructor. */
export interface MagiCLOBSDKOptions extends MagiCLOBClientOptions {}

/** High-level magiCLOB client. */
export class MagiCLOBSDK {
  readonly client: MagiCLOBClient;
  readonly programId: PublicKey;

  constructor(options: MagiCLOBSDKOptions | MagiCLOBClient) {
    this.client =
      options instanceof MagiCLOBClient ? options : new MagiCLOBClient(options);
    this.programId = this.client.programId;
  }

  /** Devnet + Magicblock devnet router. */
  static devnet(options: Partial<MagiCLOBClientOptions> = {}): MagiCLOBSDK {
    return new MagiCLOBSDK(MagiCLOBClient.devnet(options));
  }

  /** Mainnet-beta + Magicblock router. */
  static mainnet(options: Partial<MagiCLOBClientOptions> = {}): MagiCLOBSDK {
    return new MagiCLOBSDK(MagiCLOBClient.mainnet(options));
  }

  // Addresses

  /** Every PDA for a base/quote pair. */
  addresses(baseMint: PublicKey, quoteMint: PublicKey): MarketAddresses {
    return marketAddresses(baseMint, quoteMint, this.programId);
  }

  /** `MarketState` address for a pair. */
  market(baseMint: PublicKey, quoteMint: PublicKey): PublicKey {
    return marketPda(baseMint, quoteMint, this.programId).address;
  }

  /** `OrderBookState` address for a market. */
  orderBook(market: PublicKey): PublicKey {
    return orderBookPda(market, this.programId).address;
  }

  /** `TraderState` address for `(market, owner)`. */
  trader(market: PublicKey, owner: PublicKey): PublicKey {
    return traderPda(market, owner, this.programId).address;
  }

  /** `VaultState` address for a market. */
  vault(market: PublicKey): PublicKey {
    return vaultPda(market, this.programId).address;
  }

  // Reads

  private conn(layer: Layer): Connection {
    return this.client.connectionFor(layer);
  }

  /** Fetch and decode a `MarketState`. */
  async getMarket(
    market: PublicKey,
    layer: Layer = "base"
  ): Promise<MarketState | null> {
    const info = await this.conn(layer).getAccountInfo(market);
    return info === null ? null : decodeMarketState(info.data);
  }

  /**
   * Fetch and decode an `OrderBookState`.
   *
   * Defaults to the ER when one is configured: while a session is open the base
   * layer holds a stale snapshot, so reading there would show an outdated book.
   */
  async getOrderBook(
    market: PublicKey,
    layer: Layer = this.client.hasEphemeral ? "ephemeral" : "base"
  ): Promise<OrderBookState | null> {
    const info = await this.conn(layer).getAccountInfo(this.orderBook(market));
    return info === null ? null : decodeOrderBookState(info.data);
  }

  /** Fetch and decode a `TraderState`. */
  async getTrader(
    market: PublicKey,
    owner: PublicKey,
    layer: Layer = "base"
  ): Promise<TraderState | null> {
    const info = await this.conn(layer).getAccountInfo(
      this.trader(market, owner)
    );
    return info === null ? null : decodeTraderState(info.data);
  }

  /** Fetch and decode a `VaultState`. */
  async getVault(
    market: PublicKey,
    layer: Layer = "base"
  ): Promise<VaultState | null> {
    const info = await this.conn(layer).getAccountInfo(this.vault(market));
    return info === null ? null : decodeVaultState(info.data);
  }

  /** Aggregated bids/asks, best-first. */
  async getDepth(market: PublicKey, layer?: Layer): Promise<OrderBookDepth> {
    const book = await this.getOrderBook(market, layer);
    return book === null ? { bids: [], asks: [] } : depth(book);
  }

  /** Best bid/ask, sizes and spread. */
  async getTopOfBook(market: PublicKey, layer?: Layer): Promise<TopOfBook> {
    const book = await this.getOrderBook(market, layer);
    return book === null
      ? { bestBid: null, bestAsk: null, bidQty: 0n, askQty: 0n, spread: null }
      : topOfBook(book);
  }

  /** Every live resting order belonging to `owner`. */
  async getOpenOrders(
    market: PublicKey,
    owner: PublicKey,
    layer?: Layer
  ): Promise<OrderNode[]> {
    const book = await this.getOrderBook(market, layer);
    return book === null ? [] : ordersByOwner(book, owner);
  }

  /** True when the trader is currently inside an ER session. */
  async isDelegated(market: PublicKey, owner: PublicKey): Promise<boolean> {
    const trader = await this.getTrader(market, owner, "base");
    return trader?.status === TraderStatus.Delegated;
  }

  /**
   * Resolve the maker set an order would cross, ready to pass as `makers`.
   *
   * The program demands an exact match, so this reads the current book and
   * replays the engine's sweep. It is a *snapshot*: if the book moves between
   * this call and the send, the maker set can change and the transaction will
   * revert with `UnexpectedMakerAccount`. For contested markets, simulate first
   * or retry on that error.
   */
  async resolveMakers(
    market: PublicKey,
    isBid: boolean,
    qty: bigint,
    limitPrice?: bigint | null,
    layer?: Layer
  ): Promise<PublicKey[]> {
    const book = await this.getOrderBook(market, layer);
    return book === null ? [] : makersForOrder(book, isBid, qty, limitPrice);
  }

  /**
   * Stream decoded order-book snapshots as the book changes.
   *
   * @returns an unsubscribe function.
   */
  watchOrderBook(
    market: PublicKey,
    callback: (book: OrderBookState) => void,
    layer: Layer = this.client.hasEphemeral ? "ephemeral" : "base"
  ): () => void {
    return this.client.onAccountChange(
      this.orderBook(market),
      (data) => callback(decodeOrderBookState(data)),
      layer
    );
  }

  // Writes

  private send(
    ix: TransactionInstruction,
    signers: Signer[],
    layer: Layer,
    feePayer?: PublicKey
  ): Promise<TransactionSignature> {
    return this.client.send([ix], signers, layer, feePayer);
  }

  /** Create the market, book and vault PDAs for a pair. Base layer. */
  initializeMarket(
    params: InitializeMarketParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createInitializeMarketInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Create a `TraderState`. Base layer. */
  registerTrader(
    params: RegisterTraderParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createRegisterTraderInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Move tokens into the pool vault. Base layer. */
  deposit(
    params: VaultTransferParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createDepositInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Move tokens out of the pool vault. Base layer. */
  withdraw(
    params: VaultTransferParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createWithdrawInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Open an ER session for the trader and market book. Base layer. */
  delegateSession(
    params: DelegateSessionParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createDelegateSessionInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Commit ER state and release the delegation lock. Ephemeral Rollup. */
  settleAndUndelegate(
    params: SettleAndUndelegateParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createSettleAndUndelegateInstruction(params, this.programId),
      signers,
      "ephemeral"
    );
  }

  /** Place a limit order. Routes to the ER when one is configured. */
  placeLimitOrder(
    params: PlaceLimitOrderParams,
    signers: Signer[],
    layer: Layer = this.defaultTradeLayer()
  ): Promise<TransactionSignature> {
    return this.send(
      createPlaceLimitOrderInstruction(params, this.programId),
      signers,
      layer
    );
  }

  /** Place a market order. Routes to the ER when one is configured. */
  placeMarketOrder(
    params: PlaceMarketOrderParams,
    signers: Signer[],
    layer: Layer = this.defaultTradeLayer()
  ): Promise<TransactionSignature> {
    return this.send(
      createPlaceMarketOrderInstruction(params, this.programId),
      signers,
      layer
    );
  }

  /** Cancel a resting order. Routes to the ER when one is configured. */
  cancelOrder(
    params: CancelOrderParams,
    signers: Signer[],
    layer: Layer = this.defaultTradeLayer()
  ): Promise<TransactionSignature> {
    return this.send(
      createCancelOrderInstruction(params, this.programId),
      signers,
      layer
    );
  }

  /** Shrink a resting order. Routes to the ER when one is configured. */
  modifyOrder(
    params: ModifyOrderParams,
    signers: Signer[],
    layer: Layer = this.defaultTradeLayer()
  ): Promise<TransactionSignature> {
    return this.send(
      createModifyOrderInstruction(params, this.programId),
      signers,
      layer
    );
  }

  /** Create the vault's SPL token accounts. Base layer. */
  initializeVaultAccounts(
    params: VaultInitParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createInitializeVaultAccountsInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  // Staking

  /** Lock tokens to earn maker-fee rebates and governance voting power. Base layer. */
  stake(
    params: StakeParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createStakeInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  // Flash loans

  /** Borrow base tokens from the vault atomically. Base layer. */
  borrowFlashLoanBase(
    params: FlashLoanParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createBorrowFlashLoanBaseInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Borrow quote tokens from the vault atomically. Base layer. */
  borrowFlashLoanQuote(
    params: FlashLoanParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createBorrowFlashLoanQuoteInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Return base tokens (plus fee) to the vault. Base layer. */
  returnFlashLoanBase(
    params: FlashLoanParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createReturnFlashLoanBaseInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Return quote tokens (plus fee) to the vault. Base layer. */
  returnFlashLoanQuote(
    params: FlashLoanParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createReturnFlashLoanQuoteInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  // Governance

  /** Submit a fee-change proposal. Base layer. */
  submitProposal(
    params: SubmitProposalParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createSubmitProposalInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Vote on an active proposal. Base layer. */
  vote(
    params: VoteParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createVoteInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Execute a passed proposal to apply fee changes. Base layer. */
  executeProposal(
    params: ExecuteProposalParams,
    signers: Signer[]
  ): Promise<TransactionSignature> {
    return this.send(
      createExecuteProposalInstruction(params, this.programId),
      signers,
      "base"
    );
  }

  /** Submit an atomic batch of orders. Routes to the ER when configured. */
  bulkBatchOrders(
    params: BulkBatchOrdersParams,
    signers: Signer[],
    layer: Layer = this.defaultTradeLayer()
  ): Promise<TransactionSignature> {
    return this.send(
      createBulkBatchOrdersInstruction(params, this.programId),
      signers,
      layer
    );
  }

  /** ER when configured, base layer otherwise. */
  private defaultTradeLayer(): Layer {
    return this.client.hasEphemeral ? "ephemeral" : "base";
  }
}

export { MAGICLOB_PROGRAM_ID };
