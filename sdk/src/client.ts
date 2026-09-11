// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Magicblock router wrapper: one connection to the Solana base layer, one to the
 * Ephemeral Rollup.
 *
 * Routing rule, and the thing most integrations get wrong: an account that has
 * been delegated is *owned by the Delegation Program on the base layer* and its
 * live state only exists on the ER. So while a session is open, reads and order
 * traffic must go to the ER endpoint; custody operations (deposit, withdraw,
 * delegate itself) stay on the base layer. `MagiCLOBClient` keeps both
 * connections side by side and exposes which one to use per operation rather
 * than hiding it, because picking wrong fails in confusing ways.
 */
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import { ENDPOINTS, MAGICLOB_PROGRAM_ID, RPC_FAILOVERS } from "./constants";
import { rethrowMagiCLOBError } from "./errors";

/** Which layer a transaction or read should be routed to. */
export type Layer = "base" | "ephemeral";

/** Options for constructing a `MagiCLOBClient`. */
export interface MagiCLOBClientOptions {
  /** Base-layer RPC. Accepts a URL or a live `Connection`. */
  connection: Connection | string;
  /**
   * Ephemeral Rollup / Magic Router RPC. Optional - without it the client is
   * base-layer only and every ER-routed call throws a clear error.
   */
  ephemeralConnection?: Connection | string;
  /** Override the program id (useful on localnet with a re-keyed deploy). */
  programId?: PublicKey;
  /** Commitment applied to connections the client creates itself. */
  commitment?: Commitment;
}

/**
 * Wrap one or more RPC endpoint URLs in a single `Connection` that rotates to
 * the next endpoint when the active one rate-limits (HTTP 429) or fails at the
 * network layer. WebSocket/pubsub subscriptions stay pinned to the first
 * endpoint so long-lived subscriptions survive a rotation. All endpoints are
 * public and keyless (see `RPC_FAILOVERS`).
 */
export function failoverConnection(
  endpoints: readonly string[],
  commitment: Commitment
): Connection {
  if (endpoints.length === 0) {
    throw new Error("magiCLOB: no RPC endpoints to failover");
  }
  const conns = endpoints.map((endpoint) => new Connection(endpoint, commitment));
  let index = 0;
  const isRetryable = (err: unknown): boolean =>
    /429|503|502|rate.?limit|fetch failed|ECONN|ETIMEDOUT|socket hang up/i.test(
      err instanceof Error ? err.message : String(err)
    );
  const invoke = (
    prop: PropertyKey,
    args: unknown[],
    attempts: number
  ): unknown => {
    for (let i = 0; i < conns.length; i += 1) {
      const conn = conns[index];
      const fn = Reflect.get(conn, prop, conn) as (...a: unknown[]) => unknown;
      try {
        const result = Reflect.apply(fn, conn, args);
        if (result && typeof (result as Promise<unknown>).then === "function") {
          return (result as Promise<unknown>).then(
            (value) => value,
            (err: unknown) => {
              if (!isRetryable(err) || attempts <= 1) throw err;
              index = (index + 1) % conns.length;
              return invoke(prop, args, attempts - 1);
            }
          );
        }
        return result;
      } catch (err) {
        if (!isRetryable(err)) throw err;
        index = (index + 1) % conns.length;
      }
    }
    throw new Error(
      `magiCLOB: all ${conns.length} RPC endpoints failed for ${String(prop)}`
    );
  };
  return new Proxy(conns[0], {
    get(target, prop, receiver) {
      if (prop === "then") return undefined;
      const conn = conns[index];
      const value = Reflect.get(conn, prop, conn);
      if (typeof value === "function") {
        return (...args: unknown[]) => invoke(prop, args, conns.length);
      }
      return value;
    },
  });
}

/** Known networks whose default RPC carries a failover list. */
function failoverEndpointsFor(value: string): string[] {
  if (value === ENDPOINTS.devnetBase) return [value, ...RPC_FAILOVERS.devnet];
  if (value === ENDPOINTS.mainnetBase) return [value, ...RPC_FAILOVERS.mainnet];
  return [value];
}

function toConnection(
  value: Connection | string,
  commitment: Commitment
): Connection {
  if (typeof value !== "string") return value;
  const endpoints = failoverEndpointsFor(value);
  if (endpoints.length === 1) return new Connection(value, commitment);
  return failoverConnection(endpoints, commitment);
}

/**
 * Reused `latestBlockhash` per endpoint so a burst of sends (market maker
 * cycles, API-driven orders) does not hammer `getLatestBlockhash` on every
 * transaction. A Solana blockhash stays valid for ~150 slots (≈60s on devnet),
 * so a 10s cache is safe.
 */
const BLOCKHASH_TTL_MS = 10_000;
const blockhashCache = new Map<string, { blockhash: string; at: number }>();

async function cachedBlockhash(connection: Connection): Promise<string> {
  const key = String(
    (connection as unknown as { _rpcEndpoint?: string })._rpcEndpoint ??
      "connection"
  );
  const cached = blockhashCache.get(key);
  if (cached && Date.now() - cached.at < BLOCKHASH_TTL_MS) {
    return cached.blockhash;
  }
  const latest = await connection.getLatestBlockhash();
  const blockhash = latest.blockhash;
  blockhashCache.set(key, { blockhash, at: Date.now() });
  return blockhash;
}

/**
 * Holds the base-layer and ephemeral connections and provides send/confirm
 * helpers that translate program errors into `MagiCLOBError`.
 */
export class MagiCLOBClient {
  /** Solana base-layer connection - custody, delegation, settlement finality. */
  readonly connection: Connection;

  /** Ephemeral Rollup connection, when configured. */
  readonly ephemeralConnection: Connection | null;

  /** Program id all builders default to. */
  readonly programId: PublicKey;

  readonly commitment: Commitment;

  constructor(options: MagiCLOBClientOptions) {
    const commitment = options.commitment ?? "confirmed";
    this.commitment = commitment;
    this.connection = toConnection(options.connection, commitment);
    this.ephemeralConnection =
      options.ephemeralConnection === undefined
        ? null
        : toConnection(options.ephemeralConnection, commitment);
    this.programId = options.programId ?? MAGICLOB_PROGRAM_ID;
  }

  /** Convenience constructor for Solana devnet + the Magicblock devnet router. */
  static devnet(options: Partial<MagiCLOBClientOptions> = {}): MagiCLOBClient {
    return new MagiCLOBClient({
      connection: options.connection ?? ENDPOINTS.devnetBase,
      ephemeralConnection:
        options.ephemeralConnection ?? ENDPOINTS.devnetRouter,
      programId: options.programId,
      commitment: options.commitment,
    });
  }

  /** Convenience constructor for mainnet-beta + the Magicblock router. */
  static mainnet(options: Partial<MagiCLOBClientOptions> = {}): MagiCLOBClient {
    return new MagiCLOBClient({
      connection: options.connection ?? ENDPOINTS.mainnetBase,
      ephemeralConnection:
        options.ephemeralConnection ?? ENDPOINTS.mainnetRouter,
      programId: options.programId,
      commitment: options.commitment,
    });
  }

  /** True when an ER endpoint is configured. */
  get hasEphemeral(): boolean {
    return this.ephemeralConnection !== null;
  }

  /** The connection for `layer`, throwing a clear error if ER is unconfigured. */
  connectionFor(layer: Layer): Connection {
    if (layer === "base") return this.connection;
    if (this.ephemeralConnection === null) {
      throw new Error(
        "magiCLOB: no ephemeral connection configured - pass `ephemeralConnection` to the client (e.g. MagiCLOBClient.devnet()) before routing to the Ephemeral Rollup"
      );
    }
    return this.ephemeralConnection;
  }

  /**
   * Sign, send and confirm `instructions` on `layer`.
   *
   * Program errors are rethrown as `MagiCLOBError` so callers can branch on
   * `err.code` instead of string-matching logs.
   */
  async send(
    instructions: TransactionInstruction[],
    signers: Signer[],
    layer: Layer = "base",
    feePayer?: PublicKey
  ): Promise<TransactionSignature> {
    if (signers.length === 0) {
      throw new Error("magiCLOB: at least one signer is required");
    }
    const connection = this.connectionFor(layer);
    const tx = new Transaction().add(...instructions);
    tx.feePayer = feePayer ?? signers[0].publicKey;
    tx.recentBlockhash = await cachedBlockhash(connection);

    try {
      tx.sign(...signers);
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        preflightCommitment: this.commitment,
      });
      await connection.confirmTransaction(signature, this.commitment);
      return signature;
    } catch (err) {
      rethrowMagiCLOBError(err);
    }
  }

  /** Send on the base layer. */
  sendOnBase(
    instructions: TransactionInstruction[],
    signers: Signer[],
    feePayer?: PublicKey
  ): Promise<TransactionSignature> {
    return this.send(instructions, signers, "base", feePayer);
  }

  /** Send on the Ephemeral Rollup. */
  sendOnEphemeral(
    instructions: TransactionInstruction[],
    signers: Signer[],
    feePayer?: PublicKey
  ): Promise<TransactionSignature> {
    return this.send(instructions, signers, "ephemeral", feePayer);
  }

  /**
   * Simulate `instructions` without sending. Cheap way to discover the exact
   * maker set the engine will touch before committing to a maker list.
   */
  async simulate(
    instructions: TransactionInstruction[],
    payer: PublicKey,
    layer: Layer = "base"
  ) {
    const connection = this.connectionFor(layer);
    const tx = new Transaction().add(...instructions);
    tx.feePayer = payer;
    const { blockhash } = await connection.getLatestBlockhash(this.commitment);
    tx.recentBlockhash = blockhash;
    return connection.simulateTransaction(tx);
  }

  /** Raw account fetch routed to `layer`. */
  getAccountInfo(address: PublicKey, layer: Layer = "base") {
    return this.connectionFor(layer).getAccountInfo(address, this.commitment);
  }

  /**
   * Subscribe to an account on `layer`.
   *
   * On the ER this is the low-latency order-book feed: the book account updates
   * every time a match executes, so a decode-on-change subscription is the
   * cheapest live depth stream available without an indexer.
   *
   * @returns an unsubscribe function.
   */
  onAccountChange(
    address: PublicKey,
    callback: (data: Buffer) => void,
    layer: Layer = "base"
  ): () => void {
    const connection = this.connectionFor(layer);
    const id = connection.onAccountChange(
      address,
      (info) => callback(info.data),
      this.commitment
    );
    return () => {
      void connection.removeAccountChangeListener(id);
    };
  }
}

/** Re-exported for callers that build their own signers. */
export { Keypair };
