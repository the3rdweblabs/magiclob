// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Keypair loading for CLI scripts. Never touches the browser's keypair.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Keypair } from "@solana/web3.js";

export function readKeypair(path: string): Keypair {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`keypair file not found: ${resolved}`);
  const raw = readFileSync(resolved, "utf8").trim();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`keypair file is not valid JSON: ${resolved}`);
  }
  const arr = Array.isArray(value)
    ? value
    : (value as { secretKey?: unknown }).secretKey;
  if (!Array.isArray(arr)) {
    throw new Error(`keypair file has no secretKey array: ${resolved}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
}

/**
 * The on-chain fee payer / authority. Resolution order:
 * `PAYER_KEYPAIR_PATH` → `SOLANA_KEYPAIR` → `~/.config/solana/DEV.json`
 * → `~/.config/solana/id.json`.
 */
export function payerKeypair(): Keypair {
  const candidates = [
    process.env.PAYER_KEYPAIR_PATH,
    process.env.SOLANA_KEYPAIR,
    join(homedir(), ".config", "solana", "DEV.json"),
    join(homedir(), ".config", "solana", "id.json"),
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate))) return readKeypair(candidate);
  }
  throw new Error(
    "no payer keypair found. Set PAYER_KEYPAIR_PATH or SOLANA_KEYPAIR " +
      "(e.g. PAYER_KEYPAIR_PATH=~/.config/solana/DEV.json) and run again."
  );
}