# MagiCLOB MVP Audit Scope

## In scope

- `contracts/programs/magiclob/src/lib.rs`
- `contracts/programs/magiclob/src/errors.rs`
- `contracts/programs/magiclob/src/engine/`
- `contracts/programs/magiclob/src/instructions/`
- `contracts/programs/magiclob/src/state/`
- `magiclob/Anchor.toml`
- `magiclob/Cargo.toml`
- MagicBlock delegation, commit, and undelegation integration.

## MVP functionality

- Market initialization and registration.
- SPL deposit and withdrawal.
- Limit and market orders.
- Partial fills and price-time priority.
- Cancel and reduction-only modify.
- Post-only, IOC, FOK, expiration, and self-match modes.
- Maker, taker, and integrator fee accounting.
- Delegated ER execution and settlement.

## Out of scope for this audit

- `app/` frontend.
- `sdk/` client package until generated IDL and routing are stable.
- Indexing and websocket infrastructure.
- Governance, staking rebates, flash loans, batch orders, session keys, oracle integrations, cranks, and PER privacy unless explicitly added to the release candidate.
- External Solana, SPL Token, MagicBlock, and RPC implementations.

## Build and test environment

- Rust `1.89.0`.
- Anchor CLI `1.1.2` installed locally.
- `ephemeral-rollups-sdk` `0.17.0` with Anchor and VRF features.
- Solana/SBF toolchain matching the installed Solana CLI.
- Commands:

```bash
cargo test --manifest-path magiclob/Cargo.toml --lib
cargo build --manifest-path magiclob/Cargo.toml
cd magiclob && anchor build
```

## Audit deliverables

- Findings classified by severity and runtime: base, public ER, or PER.
- Reproduction tests for every high or critical finding.
- Explicit treatment of delegation lifecycle, commit finality, and custody recovery.
- Re-review of all remediation commits before deployment.
