// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Minimal borsh decoder for the magiCLOB Anchor events the indexer consumes.
 *
 * Deliberately no `anchor` dependency: the indexer is a standalone Node script
 * and the four trade events' layout is tiny. Discriminators are the first 8
 * bytes of `sha256("event:<Name>")` - verify against
 * `sdk/src/idl/magiclob.json` events if the program changes them.
 */
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";

export interface FillLite {
  price: bigint;
  qty: bigint;
  makerOrderId: bigint;
  maker: string;
  makerFee: bigint;
}

export interface MatchReportLite {
  takerOrderId: bigint;
  isBid: boolean;
  totalBaseFilled: bigint;
  totalQuoteFilled: bigint;
  avgFillPrice: bigint;
  remainingBase: bigint;
  fills: FillLite[];
  takerFeeTotal: bigint;
  makerFeeTotal: bigint;
  integratorFeeTotal: bigint;
  selfTrade: boolean;
  orderExpired: boolean;
}

export type DecodedTradeEvent =
  | {
      kind: "OrderPlaced";
      market: string;
      orderId: bigint;
      side: 0 | 1;
      price: bigint;
      qty: bigint;
      owner: string;
    }
  | {
      kind: "OrderFilled";
      market: string;
      report: MatchReportLite;
    }
  | {
      kind: "OrderCancelled";
      market: string;
      clientOrderId: bigint;
      side: 0 | 1;
      price: bigint;
      qtyRemaining: bigint;
      owner: string;
    }
  | {
      kind: "OrderModified";
      market: string;
      orderId: bigint;
      clientOrderId: bigint;
      side: 0 | 1;
      price: bigint;
      previousQuantity: bigint;
      newQuantity: bigint;
      owner: string;
    };

function discriminator(name: string): Buffer {
  return createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);
}

const D = {
  placed: discriminator("OrderPlaced"),
  filled: discriminator("OrderFilled"),
  cancelled: discriminator("OrderCancelled"),
  modified: discriminator("OrderModified"),
};

class Reader {
  private pos = 0;
  constructor(private readonly buf: Buffer) {}

  u8(): number {
    return this.buf[this.pos++];
  }
  bool(): boolean {
    return this.u8() !== 0;
  }
  u64(): bigint {
    const v = this.buf.readBigUInt64LE(this.pos);
    this.pos += 8;
    return v;
  }
  pubkey(): PublicKey {
    const pk = new PublicKey(this.buf.subarray(this.pos, this.pos + 32));
    this.pos += 32;
    return pk;
  }
  vec<T>(read: () => T): T[] {
    const count = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    const out: T[] = [];
    for (let i = 0; i < count; i++) out.push(read());
    return out;
  }
  remaining(): number {
    return this.buf.length - this.pos;
  }
}

function readFill(r: Reader): FillLite {
  return {
    price: r.u64(),
    qty: r.u64(),
    makerOrderId: r.u64(),
    maker: r.pubkey().toBase58(),
    makerFee: r.u64(),
  };
}

function readMatchReport(r: Reader): MatchReportLite {
  return {
    takerOrderId: r.u64(),
    isBid: r.bool(),
    totalBaseFilled: r.u64(),
    totalQuoteFilled: r.u64(),
    avgFillPrice: r.u64(),
    remainingBase: r.u64(),
    fills: r.vec(() => readFill(r)),
    takerFeeTotal: r.u64(),
    makerFeeTotal: r.u64(),
    integratorFeeTotal: r.u64(),
    selfTrade: r.bool(),
    orderExpired: r.bool(),
  };
}

/**
 * Decode the full event payload (8-byte discriminator + fields).
 * Returns `null` for anything that is not one of the four trade events.
 */
export function decodeTradeEvent(payload: Buffer): DecodedTradeEvent | null {
  if (payload.length < 8) return null;
  const head = payload.subarray(0, 8);
  const r = new Reader(payload);
  r.u8(); r.u8(); r.u8(); r.u8(); r.u8(); r.u8(); r.u8(); r.u8(); // discriminator

  if (head.equals(D.placed)) {
    return {
      kind: "OrderPlaced",
      market: r.pubkey().toBase58(),
      orderId: r.u64(),
      side: r.u8() as 0 | 1,
      price: r.u64(),
      qty: r.u64(),
      owner: r.pubkey().toBase58(),
    };
  }
  if (head.equals(D.filled)) {
    return {
      kind: "OrderFilled",
      market: r.pubkey().toBase58(),
      report: readMatchReport(r),
    };
  }
  if (head.equals(D.cancelled)) {
    return {
      kind: "OrderCancelled",
      market: r.pubkey().toBase58(),
      clientOrderId: r.u64(),
      side: r.u8() as 0 | 1,
      price: r.u64(),
      qtyRemaining: r.u64(),
      owner: r.pubkey().toBase58(),
    };
  }
  if (head.equals(D.modified)) {
    return {
      kind: "OrderModified",
      market: r.pubkey().toBase58(),
      orderId: r.u64(),
      clientOrderId: r.u64(),
      side: r.u8() as 0 | 1,
      price: r.u64(),
      previousQuantity: r.u64(),
      newQuantity: r.u64(),
      owner: r.pubkey().toBase58(),
    };
  }
  return null;
}

/**
 * Pull the base64 event payload out of an `onLogs` log line.
 * Anchor emits both "Program data: <b64>" (v0.31+) and "ProgramData: <b64>".
 */
export function eventPayloadFromLog(line: string): string | null {
  const m =
    /^Program\s+data:\s+([A-Za-z0-9+/=]+)/.exec(line) ??
    /^ProgramData:\s+([A-Za-z0-9+/=]+)/.exec(line);
  return m ? m[1] : null;
}