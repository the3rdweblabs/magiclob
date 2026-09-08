#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
# Starts solana-test-validator with the magiclob program loaded on the base
# layer. The local demo is base-layer only (no router/ER), which is enough for
# setup-demo-market, seed-history, indexer and the /orderbook UI.
#
# The validator fee-pays from ~/.config/solana/id.json and funds it at genesis.
#
# Env is taken from app/.env (falling back to app/.env.example), keyed exactly
# like the TS side: PROGRAM_ID_LOCAL / RPC_URL_LOCAL / WS_URL_LOCAL, selected
# by SOLANA_NETWORK. This script only ever boots the LOCAL validator.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ENV="${ROOT}/app/.env"
APP_ENV_EXAMPLE="${ROOT}/app/.env.example"

# Read a key from the first of the two env files that carries it (later file
# wins across both; .env overrides .env.example).
get_env() {
  local key="$1" val=""
  for f in "${APP_ENV}" "${APP_ENV_EXAMPLE}"; do
    [[ -f "$f" ]] || continue
    val="$(sed -nE "s/^[[:space:]]*${key}=([^#]*).*/\1/p" "$f" | tail -1)"
    [[ -n "$val" ]] && break
  done
  printf '%s' "${val}" | tr -d '"' | tr -d "'"
}

NET="${SOLANA_NETWORK:-$(get_env SOLANA_NETWORK)}"
NET="${NET:-local}"
if [[ "${NET}" != "local" ]]; then
  echo "error: setup-local-validator only boots the LOCAL validator (SOLANA_NETWORK=${NET})" >&2
  echo "       set SOLANA_NETWORK=local in app/.env (or export it) to boot local; use deploy.sh for network deploys." >&2
  exit 2
fi

PROGRAM_ID="$(get_env PROGRAM_ID_LOCAL)"
PROGRAM_ID="${PROGRAM_ID:-DSMktdhdDAGgittEg88wqrh2AJmNq6oj2YDnNnmeKeQe}"

# Local validator endpoints (localhost only — never read from RPC_URL_{NET}).
RPC_URL_LOCAL="$(get_env RPC_URL_LOCAL)"
RPC_URL_LOCAL="${RPC_URL_LOCAL:-http://127.0.0.1:8899}"
PORT="$(printf '%s' "${RPC_URL_LOCAL}" | sed -nE 's#^[a-z]+://[^:/]+:([0-9]+)/?.*$#\1#p')"
PORT="${PORT:-8899}"

if ! command -v solana-test-validator >/dev/null 2>&1; then
  echo "error: 'solana-test-validator' not found (install the Solana CLI, e.g. agave-install init)." >&2
  exit 1
fi

SO="${ROOT}/contracts/target/deploy/magiclob.so"
LEDGER="${ROOT}/test-ledger"

if [[ ! -f "${SO}" ]]; then
  echo "error: magiclob.so not found (${SO})" >&2
  exit 1
fi

if curl -fsS "http://127.0.0.1:${PORT}" -o /dev/null 2>/dev/null; then
  echo "a validator already answers on 127.0.0.1:${PORT} — nothing to do"
  exit 0
fi

mkdir -p "${LEDGER}"

echo "[local-validator] booting solana-test-validator on 127.0.0.1:${PORT}..."
solana-test-validator \
  --ledger "${LEDGER}" \
  --reset \
  --bpf-program "${PROGRAM_ID}" "${SO}" \
  --rpc-port "${PORT}" \
  --quiet \
  >"${LEDGER}/validator.log" 2>&1 &

VALIDATOR_PID=$!
echo "[local-validator] pid ${VALIDATOR_PID}, logs → ${LEDGER}/validator.log"

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" 2>/dev/null | grep -q ok; then
    echo "[local-validator] ready."
    echo "  program:  ${PROGRAM_ID}"
    echo "  keypair:  ~/.config/solana/id.json (funded at genesis)"
    echo "  next:     cd app && npm run setup:market && npm run indexer & npm run seed:history"
    exit 0
  fi
  sleep 1
done

echo "[local-validator] timed out waiting for health; last log lines:" >&2
tail -20 "${LEDGER}/validator.log" >&2 || true
exit 1