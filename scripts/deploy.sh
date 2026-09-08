#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)
# anchor build && anchor deploy against a real cluster, network-parameterized
# from app/.env. Deploys on first run (creates the account) and upgrades on
# later runs, signed by ~/.config/solana/id.json (the program's upgrade
# authority).
#
#   SOLANA_NETWORK=(devnet|mainnet)  ./scripts/deploy.sh
#
# Local development does NOT go through this script - the local validator loads
# magiclob.so directly (immutable, no upgrade authority). Use
# scripts/setup-local-validator.sh for local instead.
#
# Env comes from app/.env (falling back to app/.env.example), keyed like the
# TS side: PROGRAM_ID_DEVNET / PROGRAM_ID_MAINNET. The program id is baked
# into the build, so deployment just targets the cluster that matches
# SOLANA_NETWORK.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ENV="${ROOT}/app/.env"
APP_ENV_EXAMPLE="${ROOT}/app/.env.example"

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
NET="${NET:-devnet}"

case "${NET}" in
  local)
    echo "error: deploy.sh targets real clusters only. For local, use scripts/setup-local-validator.sh" >&2
    echo "       (it loads contracts/target/deploy/magiclob.so into solana-test-validator — no anchor deploy)." >&2
    exit 2
    ;;
  devnet)  CLUSTER="devnet" ;;
  mainnet) CLUSTER="mainnet" ;;
  *) echo "error: unknown SOLANA_NETWORK='${NET}' (expected: devnet|mainnet)" >&2; exit 1 ;;
esac

if [[ "${NET}" == "mainnet" && "${DEPLOY_CONFIRM:-}" != "1" ]]; then
  echo "error: mainnet deployment is destructive. Confirm with DEPLOY_CONFIRM=1" >&2
  echo "       e.g. DEPLOY_CONFIRM=1 SOLANA_NETWORK=mainnet ./scripts/deploy.sh" >&2
  exit 1
fi

KEY="PROGRAM_ID_${NET^^}"
PROGRAM_ID="$(get_env "${KEY}")"
if [[ -z "${PROGRAM_ID}" ]]; then
  echo "error: ${KEY} missing from app/.env (or app/.env.example)" >&2
  exit 1
fi

echo "[deploy] network=${NET} cluster=${CLUSTER} program_id=${PROGRAM_ID}"
echo "[deploy] note: deploy RPC is anchor's default for ${NET}; if rate-limited (429) for api.devnet.solana.com,"
echo "        you can pin a private RPC via ~/.config/solana/cli/config.yml or edit contracts/Anchor.toml"

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "[deploy] DRY_RUN=1 — nothing built or deployed."
  echo "[deploy] would run:"
  echo "  cd ${ROOT}/contracts"
  echo "  anchor build"
  echo "  anchor deploy --provider.cluster ${CLUSTER}"
  exit 0
fi

cd "${ROOT}/contracts"

anchor build
anchor deploy --provider.cluster "${CLUSTER}"

echo "[deploy] done. verify: https://explorer.solana.com/address/${PROGRAM_ID}?cluster=${NET}"