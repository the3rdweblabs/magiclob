// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Deterministic local-demo keypair.
 *
 * On `local` the app signs with a fixed-dev keypair instead of generating a
 * random one, so `setup-demo-market` can mint it base/quote tokens and the
 * local validator airdrops it SOL. The UI holds the real secret in the
 * browser; scripts only ever use the derived PUBLIC key (`localDemoAddress`).
 *
 * Do not add funds to this address on devnet/mainnet - it is public.
 */
import { Keypair, PublicKey } from "@solana/web3.js";

/** Exactly 32 bytes: the phrase `demo:magicbook-local-keypair-fix`. */
const SEED = new Uint8Array([
  0x64, 0x65, 0x6d, 0x6f, 0x3a, 0x6d, 0x61, 0x67, // demo:m
  0x69, 0x63, 0x62, 0x6f, 0x6f, 0x6b, 0x2d, 0x6c, // icbook-l
  0x6f, 0x63, 0x61, 0x6c, 0x2d, 0x6b, 0x65, 0x79, // ocal-key
  0x70, 0x61, 0x69, 0x72, 0x2d, 0x66, 0x69, 0x78, // pair-fix
]);

let cached: Keypair | null = null;

/** The local demo keypair (callers needing the secret must be in the browser). */
export function localDemoKeypair(): Keypair {
  if (!cached) cached = Keypair.fromSeed(SEED);
  return cached;
}

/** Public address of the local demo keypair. Safe to share with scripts. */
export function localDemoAddress(): PublicKey {
  return localDemoKeypair().publicKey;
}