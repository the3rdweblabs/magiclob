// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Minimal little-endian Borsh reader/writer.
 *
 * magiCLOB's account layouts are all fixed-width scalars, `Pubkey`s, unit enums
 * and one `Vec<OrderArgs>`, so a hand-rolled codec covers the whole surface in
 * a hundred lines. Doing it here rather than through an Anchor `BorshCoder`
 * keeps the SDK dependency-light (`@solana/web3.js` only), browser-safe, and
 * immune to field-name casing changes between Anchor releases.
 *
 * Borsh emits no padding, so every offset below is just the running sum of the
 * preceding field widths - matching the `SIZE` consts in the Rust `state` module.
 */
import { PublicKey } from "@solana/web3.js";

/** Sequential little-endian reader over an account's data buffer. */
export class BorshReader {
  private offset: number;

  constructor(private readonly buf: Buffer, offset = 0) {
    this.offset = offset;
  }

  /** Bytes consumed so far. */
  get position(): number {
    return this.offset;
  }

  private take(n: number): Buffer {
    const end = this.offset + n;
    if (end > this.buf.length) {
      throw new RangeError(
        `borsh: read of ${n} bytes at offset ${this.offset} exceeds buffer length ${this.buf.length}`
      );
    }
    const slice = this.buf.subarray(this.offset, end);
    this.offset = end;
    return slice;
  }

  u8(): number {
    return this.take(1).readUInt8(0);
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  u16(): number {
    return this.take(2).readUInt16LE(0);
  }

  u32(): number {
    return this.take(4).readUInt32LE(0);
  }

  u64(): bigint {
    return this.take(8).readBigUInt64LE(0);
  }

  pubkey(): PublicKey {
    return new PublicKey(this.take(32));
  }

  /** Skip `n` bytes (reserved/padding fields). */
  skip(n: number): void {
    this.take(n);
  }

  /** Read a fixed-length array of `n` items. */
  array<T>(n: number, read: (r: BorshReader) => T): T[] {
    const out: T[] = new Array(n);
    for (let i = 0; i < n; i++) out[i] = read(this);
    return out;
  }
}

/** Growable little-endian writer for instruction data. */
export class BorshWriter {
  private readonly chunks: Buffer[] = [];

  u8(v: number): this {
    const b = Buffer.alloc(1);
    b.writeUInt8(v & 0xff, 0);
    this.chunks.push(b);
    return this;
  }

  bool(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }

  u16(v: number): this {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v & 0xffff, 0);
    this.chunks.push(b);
    return this;
  }

  u32(v: number): this {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0, 0);
    this.chunks.push(b);
    return this;
  }

  u64(v: bigint | number): this {
    const big = typeof v === "bigint" ? v : BigInt(v);
    if (big < 0n || big > 0xffffffffffffffffn) {
      throw new RangeError(`borsh: ${big} is out of range for u64`);
    }
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(big, 0);
    this.chunks.push(b);
    return this;
  }

  pubkey(v: PublicKey): this {
    this.chunks.push(Buffer.from(v.toBytes()));
    return this;
  }

  bytes(v: Buffer | Uint8Array | number[]): this {
    this.chunks.push(Buffer.from(v as Uint8Array));
    return this;
  }

  /** Borsh `Vec<T>`: a `u32` length prefix followed by each element. */
  vec<T>(items: T[], write: (w: BorshWriter, item: T) => void): this {
    this.u32(items.length);
    for (const item of items) write(this, item);
    return this;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

/**
 * Assert an account buffer carries the expected 8-byte Anchor discriminator and
 * return a reader positioned just past it.
 *
 * Catching this here turns "decoded garbage" into a clear error when the wrong
 * account is passed for a type.
 */
export function readerAfterDiscriminator(
  data: Buffer,
  expected: readonly number[],
  accountName: string
): BorshReader {
  if (data.length < 8) {
    throw new Error(
      `${accountName}: account data is ${data.length} bytes, too short to hold a discriminator`
    );
  }
  for (let i = 0; i < 8; i++) {
    if (data[i] !== expected[i]) {
      const got = Array.from(data.subarray(0, 8)).join(",");
      throw new Error(
        `${accountName}: discriminator mismatch (expected [${expected.join(",")}], got [${got}]) - is this the right account?`
      );
    }
  }
  return new BorshReader(data, 8);
}
