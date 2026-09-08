// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * `initialize_vault_accounts` - create the vault's SPL token accounts for a market.
 *
 * Usually called right after `initialize_market` as part of the setup sequence.
 * Base layer only.
 */
import { PublicKey, SYSVAR_RENT_PUBKEY, TransactionInstruction } from "@solana/web3.js";
import { MAGICLOB_PROGRAM_ID, TOKEN_PROGRAM_ID } from "../constants";
import { vaultBaseTokenPda, vaultQuoteTokenPda } from "../pda";
import type { VaultInitParams } from "../types";
import {
  DISCRIMINATORS,
  SYSTEM_PROGRAM_ID,
  buildIx,
  ixData,
  mut,
  mutSigner,
  ro,
} from "./shared";

/** Build an `initialize_vault_accounts` instruction. */
export function createInitializeVaultAccountsInstruction(
  params: VaultInitParams,
  programId: PublicKey = MAGICLOB_PROGRAM_ID
): TransactionInstruction {
  const { rentPayer, market, baseMint, quoteMint } = params;

  return buildIx(
    [
      mutSigner(rentPayer),
      mut(market),
      ro(baseMint),
      ro(quoteMint),
      mut(vaultBaseTokenPda(market, programId).address),
      mut(vaultQuoteTokenPda(market, programId).address),
      ro(SYSTEM_PROGRAM_ID),
      ro(TOKEN_PROGRAM_ID),
      ro(SYSVAR_RENT_PUBKEY),
    ],
    ixData(DISCRIMINATORS.initialize_vault_accounts).toBuffer(),
    programId
  );
}
