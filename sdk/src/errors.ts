// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Typed error wrappers mirroring the on-chain `MagiCLOBError` codes.
 *
 * GENERATED from `target/idl/magiclob.json` - do not hand-edit the code table.
 * Anchor custom errors start at 6000 and surface in transaction logs as
 * `Custom program error: 0x<hex>`; `parseMagiCLOBError` recovers the name and
 * message from either a structured Anchor error or a raw log dump.
 */

/** Every custom error the magiCLOB program can return. */
export enum MagiCLOBErrorCode {
  /** Only the market authority may perform this action */
  InvalidAuthority = 6000,
  /** The market is not active */
  MarketNotActive = 6001,
  /** Order price must be greater than zero */
  InvalidPrice = 6002,
  /** Order quantity must be greater than zero */
  InvalidQuantity = 6003,
  /** Insufficient balance for the requested fill */
  InsufficientBalance = 6004,
  /** Order was not found on the specified side */
  OrderNotFound = 6005,
  /** The order book has reached its capacity */
  BookCapacityReached = 6006,
  /** Order owner does not match the trader account */
  TraderAuthMismatch = 6007,
  /** Fee basis points must be within 0..=10000 */
  InvalidFeeBps = 6008,
  /** Arithmetic overflow while settling the match */
  ArithmeticOverflow = 6009,
  /** A maker trader account was not provided in remaining_accounts */
  MakerAccountMissing = 6010,
  /** An unexpected maker account was provided in remaining_accounts */
  UnexpectedMakerAccount = 6011,
  /** A maker trader account was provided more than once */
  DuplicateMakerAccount = 6012,
  /** Batch size exceeds the maximum supported length */
  BatchTooLarge = 6013,
  /** The trader account is already delegated */
  AlreadyDelegated = 6014,
  /** Order quantity must be a multiple of lot size */
  InvalidLotSize = 6015,
  /** Order quantity is below minimum size */
  InvalidMinSize = 6016,
  /** Order price must be a multiple of tick size */
  InvalidTickSize = 6017,
  /** Post-only order would cross the book */
  PostOnlyWouldCross = 6018,
  /** Fill-or-kill order cannot be fully filled */
  FillOrKillNotFilled = 6019,
  /** Post-only order would cross the book */
  PostOnlyCrossesBook = 6020,
  /** Fill-or-kill order cannot be fully filled */
  FOKOrderCannotBeFullyFilled = 6021,
  /** Self-trade prevention cancelled the taker */
  SelfTradeCancelTaker = 6022,
  /** Self-trade prevention cancelled the maker */
  SelfTradeCancelMaker = 6023,
  /** Order has expired */
  OrderExpired = 6024,
  /** New quantity must be less than original quantity */
  InvalidModifyQuantity = 6025,
  /** New quantity must be greater than filled quantity */
  InvalidModifyFilled = 6026,
  /** Order price cannot be changed without losing queue priority */
  InvalidModifyPrice = 6027,
  /** Flash loan was not repaid */
  FlashLoanNotRepaid = 6028,
  /** Invalid flash loan asset type */
  InvalidFlashLoanAsset = 6029,
  /** Flash loan borrower mismatch */
  FlashLoanInvalidBorrower = 6030,
  /** Insufficient vault balance for withdrawal */
  InsufficientVaultBalance = 6031,
  /** Invalid token account owner */
  InvalidTokenAccountOwner = 6032,
  /** Mint mismatch between market and token account */
  MintMismatch = 6033,
  /** Governance proposal not active */
  ProposalNotActive = 6034,
  /** Governance proposal already ended */
  ProposalEnded = 6035,
  /** Insufficient stake for governance action */
  InsufficientStake = 6036,
  /** Session key is not approved */
  InvalidSessionKey = 6037,
  /** Crank authority mismatch */
  CrankAuthorityMismatch = 6038,
  /** Pool already exists */
  PoolAlreadyExists = 6039,
  /** Permission denied for this group */
  PermissionDenied = 6040,
  /** Trader has no active stake */
  NoStake = 6041,
  /** Stake epoch lockup has not yet passed */
  StakeLockupNotPassed = 6042,
  /** Trader is already staked */
  AlreadyStaked = 6043,
  /** Stake amount is below the minimum */
  StakeBelowMinimum = 6044,
  /** Stake amount exceeds available balance */
  StakeExceedsBalance = 6045,
  /** Proposal status does not allow this action */
  InvalidProposalStatus = 6046,
  /** Voter has already voted on this proposal */
  AlreadyVoted = 6047,
  /** Vote weight is zero */
  ZeroVoteWeight = 6048,
  /** Proposal has not reached its end epoch */
  ProposalNotEnded = 6049,
  /** Proposal did not pass */
  ProposalNotPassed = 6050,
  /** Proposal quorum not reached */
  QuorumNotReached = 6051,
  /** No rebates available to claim */
  NoRebatesAvailable = 6052,
}

/** Human-readable message for each error code. */
export const MAGICLOB_ERROR_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  6000: "Only the market authority may perform this action",
  6001: "The market is not active",
  6002: "Order price must be greater than zero",
  6003: "Order quantity must be greater than zero",
  6004: "Insufficient balance for the requested fill",
  6005: "Order was not found on the specified side",
  6006: "The order book has reached its capacity",
  6007: "Order owner does not match the trader account",
  6008: "Fee basis points must be within 0..=10000",
  6009: "Arithmetic overflow while settling the match",
  6010: "A maker trader account was not provided in remaining_accounts",
  6011: "An unexpected maker account was provided in remaining_accounts",
  6012: "A maker trader account was provided more than once",
  6013: "Batch size exceeds the maximum supported length",
  6014: "The trader account is already delegated",
  6015: "Order quantity must be a multiple of lot size",
  6016: "Order quantity is below minimum size",
  6017: "Order price must be a multiple of tick size",
  6018: "Post-only order would cross the book",
  6019: "Fill-or-kill order cannot be fully filled",
  6020: "Post-only order would cross the book",
  6021: "Fill-or-kill order cannot be fully filled",
  6022: "Self-trade prevention cancelled the taker",
  6023: "Self-trade prevention cancelled the maker",
  6024: "Order has expired",
  6025: "New quantity must be less than original quantity",
  6026: "New quantity must be greater than filled quantity",
  6027: "Order price cannot be changed without losing queue priority",
  6028: "Flash loan was not repaid",
  6029: "Invalid flash loan asset type",
  6030: "Flash loan borrower mismatch",
  6031: "Insufficient vault balance for withdrawal",
  6032: "Invalid token account owner",
  6033: "Mint mismatch between market and token account",
  6034: "Governance proposal not active",
  6035: "Governance proposal already ended",
  6036: "Insufficient stake for governance action",
  6037: "Session key is not approved",
  6038: "Crank authority mismatch",
  6039: "Pool already exists",
  6040: "Permission denied for this group",
  6041: "Trader has no active stake",
  6042: "Stake epoch lockup has not yet passed",
  6043: "Trader is already staked",
  6044: "Stake amount is below the minimum",
  6045: "Stake amount exceeds available balance",
  6046: "Proposal status does not allow this action",
  6047: "Voter has already voted on this proposal",
  6048: "Vote weight is zero",
  6049: "Proposal has not reached its end epoch",
  6050: "Proposal did not pass",
  6051: "Proposal quorum not reached",
  6052: "No rebates available to claim",
});

/** Reverse lookup from numeric code to enum name. */
export const MAGICLOB_ERROR_NAMES: Readonly<Record<number, string>> = Object.freeze({
  6000: "InvalidAuthority",
  6001: "MarketNotActive",
  6002: "InvalidPrice",
  6003: "InvalidQuantity",
  6004: "InsufficientBalance",
  6005: "OrderNotFound",
  6006: "BookCapacityReached",
  6007: "TraderAuthMismatch",
  6008: "InvalidFeeBps",
  6009: "ArithmeticOverflow",
  6010: "MakerAccountMissing",
  6011: "UnexpectedMakerAccount",
  6012: "DuplicateMakerAccount",
  6013: "BatchTooLarge",
  6014: "AlreadyDelegated",
  6015: "InvalidLotSize",
  6016: "InvalidMinSize",
  6017: "InvalidTickSize",
  6018: "PostOnlyWouldCross",
  6019: "FillOrKillNotFilled",
  6020: "PostOnlyCrossesBook",
  6021: "FOKOrderCannotBeFullyFilled",
  6022: "SelfTradeCancelTaker",
  6023: "SelfTradeCancelMaker",
  6024: "OrderExpired",
  6025: "InvalidModifyQuantity",
  6026: "InvalidModifyFilled",
  6027: "InvalidModifyPrice",
  6028: "FlashLoanNotRepaid",
  6029: "InvalidFlashLoanAsset",
  6030: "FlashLoanInvalidBorrower",
  6031: "InsufficientVaultBalance",
  6032: "InvalidTokenAccountOwner",
  6033: "MintMismatch",
  6034: "ProposalNotActive",
  6035: "ProposalEnded",
  6036: "InsufficientStake",
  6037: "InvalidSessionKey",
  6038: "CrankAuthorityMismatch",
  6039: "PoolAlreadyExists",
  6040: "PermissionDenied",
  6041: "NoStake",
  6042: "StakeLockupNotPassed",
  6043: "AlreadyStaked",
  6044: "StakeBelowMinimum",
  6045: "StakeExceedsBalance",
  6046: "InvalidProposalStatus",
  6047: "AlreadyVoted",
  6048: "ZeroVoteWeight",
  6049: "ProposalNotEnded",
  6050: "ProposalNotPassed",
  6051: "QuorumNotReached",
  6052: "NoRebatesAvailable",
});

/** Lowest Anchor custom-error code; anything below this is not ours. */
export const ANCHOR_ERROR_BASE = 6000;

/**
 * A magiCLOB program error, normalised into something catchable.
 *
 * `code` is the numeric Anchor error code, `name` the `MagiCLOBError` variant.
 * The original error is kept on `cause` so callers can still reach the raw logs.
 */
export class MagiCLOBError extends Error {
  readonly code: number;
  override readonly name: string;
  readonly logs: string[];

  constructor(code: number, message: string, logs: string[] = [], cause?: unknown) {
    super(message);
    this.code = code;
    this.name = MAGICLOB_ERROR_NAMES[code] ?? "UnknownMagiCLOBError";
    this.logs = logs;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }

  /** True when this error is the given code. */
  is(code: MagiCLOBErrorCode): boolean {
    return this.code === code;
  }

  override toString(): string {
    return `MagiCLOBError[${this.code} ${this.name}]: ${this.message}`;
  }
}

/**
 * Extract a `MagiCLOBError` from a thrown transaction error.
 *
 * Handles the three shapes Anchor/web3.js produce in practice:
 *   1. `err.error.errorCode.number` - a parsed AnchorError
 *   2. `err.InstructionError[1].Custom` - a raw simulated tx error
 *   3. a `Custom program error: 0x1770` line inside `err.logs` / `err.message`
 *
 * Returns `null` when the error is not a magiCLOB program error, so callers can
 * rethrow network/signature failures untouched.
 */
export function parseMagiCLOBError(err: unknown): MagiCLOBError | null {
  if (err instanceof MagiCLOBError) return err;
  if (err === null || typeof err !== "object") return null;

  const anyErr = err as Record<string, any>;
  const logs: string[] = Array.isArray(anyErr.logs) ? anyErr.logs : [];

  const code = extractCode(anyErr, logs);
  if (code === null || code < ANCHOR_ERROR_BASE) return null;

  const message =
    MAGICLOB_ERROR_MESSAGES[code] ?? `Unknown magiCLOB error code ${code}`;
  return new MagiCLOBError(code, message, logs, err);
}

function extractCode(err: Record<string, any>, logs: string[]): number | null {
  // 1. Parsed AnchorError.
  const anchorCode = err?.error?.errorCode?.number;
  if (typeof anchorCode === "number") return anchorCode;

  // 2. Raw InstructionError tuple from a simulation result.
  const ixErr = err?.InstructionError ?? err?.err?.InstructionError;
  if (Array.isArray(ixErr) && ixErr.length > 1) {
    const custom = (ixErr[1] as Record<string, any>)?.Custom;
    if (typeof custom === "number") return custom;
  }

  // 3. Fall back to scanning logs and the message for the hex tag.
  const haystack = [...logs, String(err?.message ?? "")].join("\n");
  const match = /Custom program error: 0x([0-9a-fA-F]+)/.exec(haystack);
  if (match) return parseInt(match[1], 16);

  return null;
}

/**
 * Rethrow `err` as a `MagiCLOBError` when it is one, otherwise rethrow as-is.
 * Used by every SDK send path so callers get typed errors for free.
 */
export function rethrowMagiCLOBError(err: unknown): never {
  const parsed = parseMagiCLOBError(err);
  throw parsed ?? err;
}
