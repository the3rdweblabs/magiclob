# MagiCLOB Security Model

## Authorization

Trader actions require the trader owner signer and PDA constraints. Market authority is separate from trader ownership. A session payer may sponsor delegation but cannot replace the trader owner authorization.

`initialize_vault_accounts` is a permissionless utility: it only ever creates the canonical `[b"vault", market, b"base"]`/`[b"vault", market, b"quote"]` token-account PDAs, binds each mint to `MarketState.base_mint`/`quote_mint`, sets each token account's owner to the `VaultState` PDA `[b"vault", market]` (not the program ID), and treats an existing account as a no-op only after verifying its mint, owner, and token program. It grants no authority and cannot redirect custody.

## State lifecycle

1. Create market, book, vault, and trader accounts on Solana.
2. Create the VaultState-PDA-owned vault token accounts (idempotent
   `initialize_vault_accounts`), then deposit tokens and establish internal
   entitlements on Solana.
3. Delegate only the accounts required for the trading session.
4. Resolve the actual ER endpoint through Magic Router.
5. Execute bounded matching and settlement on the ER.
6. Commit checkpoints or commit-and-undelegate through the MagicBlock intent builder.
7. Confirm final base-layer state before treating settlement as final.

## Account boundaries

- `MarketState` contains configuration, status, fees, and epoch state.
- `OrderBookState` contains the current order book and is currently bounded; replacing it with segmented pages is a release-blocking scalability task.
- `TraderState` contains the internal ledger and deposit entitlements for one market and owner.
- `VaultState` tracks market custody obligations; SPL vault accounts hold the
  actual tokens (created by the idempotent `initialize_vault_accounts`, with
  `owner == VaultState` PDA `[b"vault", market]` and canonical
  `[b"vault", market, base|quote]` token-account PDAs).

## Settlement

Matching computes deltas first. Settlement validates the taker and exact maker account set before writing balances. A failure must revert the complete instruction.

Because only delegated accounts can be written on the ER, a maker's `TraderState` must belong to the session to receive a fill. Maker settlement from ER execution is blocked until either sessions are extended into groups or a base-layer settlement queue is added.

## Resting-order continuity

- Resting GTC orders live in the market-wide `OrderBookState` and survive commit/undelegation; the committed book is the source for the next session.
- Order identity `(owner, client_order_id)` and expiry (Unix-second wall clock) make cancels/modifies deterministic across sessions; expired orders are popped lazily and never resurrect.
- A validator change must follow a commit, or mutations made in the source session are lost.

## Commit economics and session lifetime

- Without a delegated fee payer a session may commit at most 10 times; commit 11 reverts with `0xA0000000` while the final `commit_and_undelegate` is always accepted, so an account can never be trapped in a session.
- Long-lived sessions must delegate a fee payer and pass a `magic_fee_vault` (`MagicIntentBundleBuilder::magic_fee_vault`), after which live fees apply from commit 26.
- Magic Actions callbacks add atomic post-commit effects at a per-action lamport price.

## Privacy

The current public ER path provides execution speed and hides the live book from public searchers while a session is open; it is **not** confidential. The ER operator and the routing client can observe order flow.

Confidentiality requires PER/TEE: an Intel TDX deployment with token-gated ingress, `EphemeralPermission` access flags, and explicit attestation verification. Even in a TEE, the enclave operator can read execution; PER privacy reduces linkability rather than proving it. "MEV-proof" claims therefore only hold relative to public searchers on a PER deployment, and never against the enclave operator.

## Known release blockers

- Segmented order-book storage and SBF stack validation.
- Full SPL custody/ledger solvency tests: a real deposit/withdraw/settlement
  and flash-loan TS suite exists (`contracts/tests/`) but runs offline on the
  Surfpool simulator with crafted token accounts, not a live-solvency suite.
- Anchor integration tests with local base + ER.
- External review of delegation, settlement, and account validation.
