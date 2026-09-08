// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `VaultState` fetch + decode. Field order mirrors `state/vault.rs`.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { readerAfterDiscriminator } from "../codec";
import type { VaultState } from "../types";

/** Anchor account discriminator for `VaultState`. */
export const VAULT_STATE_DISCRIMINATOR = [228, 196, 82, 165, 98, 210, 235, 152] as const;

/** Decode a raw `VaultState` account buffer. */
export function decodeVaultState(data: Buffer): VaultState {
  const r = readerAfterDiscriminator(data, VAULT_STATE_DISCRIMINATOR, "VaultState");
  return {
    market: r.pubkey(),
    vaultBaseBalance: r.u64(),
    vaultQuoteBalance: r.u64(),
    settledBase: r.u64(),
    settledQuote: r.u64(),
    owedBase: r.u64(),
    owedQuote: r.u64(),
    bump: r.u8(),
  };
}

/** Fetch and decode a `VaultState`, or `null` when it does not exist. */
export async function fetchVaultState(
  connection: Connection,
  vault: PublicKey
): Promise<VaultState | null> {
  const info = await connection.getAccountInfo(vault);
  if (info === null) return null;
  return decodeVaultState(info.data);
}
