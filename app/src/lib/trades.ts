// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Unified write path for the order book.
 *
 * Two signing modes share ONE façade:
 *   - keypair mode  -> the SDK's own `client.send` (signs with a `Keypair`).
 *                      Used by the local demo (auto-created dev keypair) and by
 *                      CLI scripts, which hand `Signer[]` straight to the SDK.
 *   - wallet mode   -> instructions built with the SDK's builders, signed and
 *                      sent through `wallet.sendTransaction` (browser wallet).
 *
 * Maker-set handling: the program demands an exact maker list for any order
 * that crosses the book (`MakerAccountMissing` / `UnexpectedMakerAccount`).
 * We optimistically send without makers; if the engine rejects the order for a
 * missing/unexpected maker we re-resolve the maker set from the current book
 * and retry once. A still-contested book surfaces the typed SDK error.
 */
import {
  MagiCLOBError,
  MagiCLOBErrorCode,
  MagiCLOBSDK,
  createCancelOrderInstruction,
  createDelegateSessionInstruction,
  createModifyOrderInstruction,
  createPlaceLimitOrderInstruction,
  createPlaceMarketOrderInstruction,
  createRegisterTraderInstruction,
  createSettleAndUndelegateInstruction,
  rethrowMagiCLOBError,
  type CancelOrderParams,
  type DelegateSessionParams,
  type Layer,
  type ModifyOrderParams,
  type PlaceLimitOrderParams,
  type PlaceMarketOrderParams,
  type SettleAndUndelegateParams,
} from "@magiclob/sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import { tradeLayer } from "./sdk";

export type SendMode =
  | { kind: "keypair"; keypair: Keypair; feePayer?: PublicKey }
  | {
      kind: "wallet";
      feePayer: PublicKey;
      sendTransaction: (
        transaction: Transaction,
        connection: Connection,
        options?: { skipPreflight?: boolean }
      ) => Promise<TransactionSignature>;
    };

export class TradeClient {
  private delegated = false;
  private ensureTraderPromise: Promise<boolean> | null = null;

  constructor(
    private readonly sdk: MagiCLOBSDK,
    private readonly mode: SendMode,
    private readonly market: PublicKey
  ) {}

  /**
   * Every write (orders, delegation) requires the `TraderState` PDA for
   * `(market, owner)`. Connected wallets arrive without one, so register it on
   * first use. Keypair mode (CLI/demo) registers explicitly and skips here.
   * Errors are swallowed: the real write surfaces the failure downstream.
   */
  ensureTrader(): Promise<boolean> {
    const mode = this.mode;
    if (mode.kind !== "wallet") return Promise.resolve(false);
    const owner = mode.feePayer;
    if (!this.ensureTraderPromise) {
      this.ensureTraderPromise = (async () => {
        try {
          const trader = await this.sdk.getTrader(this.market, owner, "base");
          if (trader) return true;
          await this.direct(
            [
              createRegisterTraderInstruction(
                { market: this.market, owner },
                this.sdk.programId
              ),
            ],
            "base"
          );
          return true;
        } catch {
          return false;
        }
      })();
    }
    return this.ensureTraderPromise;
  }

  /** Update delegation state; flips reads/trades between layers. */
  setDelegated(value: boolean): void {
    this.delegated = value;
  }

  layer(): Layer {
    return tradeLayer(this.delegated, this.sdk);
  }

  async placeLimit(
    p: Omit<PlaceLimitOrderParams, "makers">,
    layer?: Layer
  ): Promise<TransactionSignature> {
    await this.ensureTrader();
    const l = layer ?? this.layer();
    return this.withMakerRetry(
      { isBid: p.isBid, qty: p.qty, limitPrice: p.price, l },
      (makers) =>
        this.direct(
          [createPlaceLimitOrderInstruction({ ...p, makers }, this.sdk.programId)],
          l
        )
    );
  }

  async placeMarket(
    p: Omit<PlaceMarketOrderParams, "makers">,
    layer?: Layer
  ): Promise<TransactionSignature> {
    await this.ensureTrader();
    const l = layer ?? this.layer();
    return this.withMakerRetry(
      { isBid: p.isBid, qty: p.qty, limitPrice: null, l },
      (makers) =>
        this.direct(
          [createPlaceMarketOrderInstruction({ ...p, makers }, this.sdk.programId)],
          l
        )
    );
  }

  cancel(p: CancelOrderParams, layer?: Layer): Promise<TransactionSignature> {
    const l = layer ?? this.layer();
    return this.direct(
      [createCancelOrderInstruction(p, this.sdk.programId)],
      l
    );
  }

  modify(p: ModifyOrderParams, layer?: Layer): Promise<TransactionSignature> {
    const l = layer ?? this.layer();
    return this.direct(
      [createModifyOrderInstruction(p, this.sdk.programId)],
      l
    );
  }

  /** Open an ER session for this trader + the market book. Base layer. */
  delegate(p: DelegateSessionParams): Promise<TransactionSignature> {
    return this.ensureTrader().then(() => {
      return this.direct(
        [createDelegateSessionInstruction(p, this.sdk.programId)],
        "base"
      );
    });
  }

  /** Commit ER state and release the delegation lock. Ephemeral Rollup. */
  settle(p: SettleAndUndelegateParams): Promise<TransactionSignature> {
    return this.direct(
      [createSettleAndUndelegateInstruction(p, this.sdk.programId)],
      "ephemeral"
    );
  }

  /** Maker-mismatch retry, once, then surface the typed error. */
  private async withMakerRetry(
    opts: { isBid: boolean; qty: bigint; limitPrice: bigint | null; l: Layer },
    send: (makers: PublicKey[] | undefined) => Promise<TransactionSignature>
  ): Promise<TransactionSignature> {
    try {
      return await send(undefined);
    } catch (err) {
      const parsed = err instanceof MagiCLOBError ? err : undefined;
      if (
        parsed?.code === MagiCLOBErrorCode.MakerAccountMissing ||
        parsed?.code === MagiCLOBErrorCode.UnexpectedMakerAccount
      ) {
        const makers = await this.sdk.resolveMakers(
          this.market,
          opts.isBid,
          opts.qty,
          opts.limitPrice,
          opts.l
        );
        return await send(makers);
      }
      throw parsed ?? err;
    }
  }

  private async direct(
    instructions: TransactionInstruction[],
    layer: Layer
  ): Promise<TransactionSignature> {
    if (this.mode.kind === "keypair") {
      return this.sdk.client.send(
        instructions,
        [this.mode.keypair],
        layer,
        this.mode.feePayer
      );
    }
    const conn = this.sdk.client.connectionFor(layer);
    const tx = new Transaction({ feePayer: this.mode.feePayer });
    tx.add(...instructions);
    const { blockhash } = await conn.getLatestBlockhash(this.sdk.client.commitment);
    tx.recentBlockhash = blockhash;
    let sig: TransactionSignature;
    try {
      sig = await this.mode.sendTransaction(tx, conn);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err) + (typeof err === "object" && err ? JSON.stringify(err) : "");
      // Wallet preflight simulation can trip on a lagging RPC node or a stale
      // blockhash even when the instruction is valid on-chain. Retry once with
      // a fresh blockhash before surfacing the (real) error.
      if (/simulat|preflight|failed to send/i.test(message)) {
        const retry = await conn.getLatestBlockhash(this.sdk.client.commitment);
        tx.recentBlockhash = retry.blockhash;
        await new Promise((resolve) => setTimeout(resolve, 800));
        sig = await this.mode.sendTransaction(tx, conn);
      } else {
        rethrowMagiCLOBError(err);
      }
    }
    await conn.confirmTransaction(sig, this.sdk.client.commitment).catch(() => {});
    return sig;
  }
}