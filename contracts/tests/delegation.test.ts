// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

// delegation - delegate_trader_session / settle_and_undelegate.
//
// GATED: these instructions hand the trader + book to an Ephemeral Rollup
// (ER). The surfpool harness has no ER validator or companion delegator
// program, so these are skipped by default. Set MAGICBLOCK=1 to attempt them.

describe("delegation (ephemeral rollup)", () => {
  const enabled = process.env.MAGICBLOCK === "1";
  const itOrSkip = enabled ? it : it.skip;

  itOrSkip(
    "delegates a trader session to the ER and undelegates on settlement",
    async () => {
      // Requires: a running ER validator, the delegator program built into the
      // environment, and a live surfpool/ER pair exposing the delegation CPIs.
      throw new Error(
        "MAGICBLOCK=1 set but the delegation environment is not configured yet"
      );
    }
  );
});