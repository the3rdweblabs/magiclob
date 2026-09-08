// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

declare module "@solana/spl-token" {
  import type { Connection, PublicKey, Signer, TransactionInstruction } from "@solana/web3.js";

  export const TOKEN_PROGRAM_ID: PublicKey;

  export function createInitializeAccountInstruction(
    account: PublicKey,
    mint: PublicKey,
    owner: PublicKey,
    programId?: PublicKey
  ): TransactionInstruction;

  export function createMint(
    connection: Connection,
    payer: Signer,
    mintAuthority: PublicKey | null,
    freezeAuthority: PublicKey | null,
    decimals: number,
    keypair?: Signer,
    confirmOptions?: unknown,
    programId?: PublicKey
  ): Promise<PublicKey>;
}