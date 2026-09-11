// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

/**
 * Load `app/.env` into `process.env`.
 *
 * Every script calls this first. Real shell environment always wins, the file
 * is a fallback - and unlike `process.loadEnvFile` (which truncates quoted,
 * nested-JSON values) this is a proper little dotenv parser.
 *
 * The env file is resolved relative to the app package (`app/.env`), not the
 * caller's cwd, so the scripts work from repo root too; `cwd/.env` is used as
 * a last-resort fallback.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appEnv = resolve(here, "..", "..", ".env");
const cwdEnv = resolve(process.cwd(), ".env");

export function loadEnvFile(): void {
  const envPath = existsSync(appEnv) ? appEnv : cwdEnv;
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}