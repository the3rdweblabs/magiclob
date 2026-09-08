# Magicblock Canonical Developer Guide

> A canonical, in-context reference for building on **Magicblock** (Ephemeral Rollups, Private
> Ephemeral Rollups, Ephemeral SPL Tokens, Magic Actions, Cranks, Solana VRF, Price Oracles, Session
> Keys). Everything here is distilled verbatim from the official docs at
> **[https://docs.magicblock.gg](https://docs.magicblock.gg)** so it can be used as the single source of truth while implementing
> `magiclob`.
>
> - Full docs index: [https://docs.magicblock.gg/llms.txt](https://docs.magicblock.gg/llms.txt)
> - Example programs (Anchor + native Rust + Pinocchio): [https://github.com/magicblock-labs/magicblock-engine-examples](https://github.com/magicblock-labs/magicblock-engine-examples)
> - AI dev skill (install for coding agents): `npx skills add https://github.com/magicblock-labs/magicblock-dev-skill`

---

## Table of Contents

1. [Key Addresses & Identifiers](#1-key-addresses--identifiers)
2. [RPC Endpoints & Validator Identities](#2-rpc-endpoints--validator-identities)
3. [Toolchain Versions](#3-toolchain-versions)
4. [What is an Ephemeral Rollup?](#4-what-is-an-ephemeral-rollup)
5. [The Programming Model](#5-the-programming-model)
6. [Delegation, Commit, Undelegation Lifecycle](#6-delegation-commit-undelegation-lifecycle)
7. [Ephemeral Accounts](#7-ephemeral-accounts)
8. [Runtime Limits](#8-runtime-limits)
9. [Fees, Commits & Refunds](#9-fees-commits--refunds)
10. [Quickstart - Anchor Counter](#10-quickstart--anchor-counter)
11. [Local Development](#11-local-development)
12. [Magic Router & Router API](#12-magic-router--router-api)
13. [Magic Actions](#13-magic-actions)
14. [Cranks (Scheduled Tasks)](#14-cranks-scheduled-tasks)
15. [Solana VRF](#15-solana-vrf)
16. [Price Oracle (Pyth Lazer)](#16-price-oracle-pyth-lazer)
17. [Ephemeral SPL Tokens](#17-ephemeral-spl-tokens)
18. [Private Payments](#18-private-payments)
19. [Private Ephemeral Rollup (PER) & Access Control](#19-private-ephemeral-rollup-per--access-control)
20. [Session Keys](#20-session-keys)
21. [Native Rust / Pinocchio Programs](#21-native-rust--pinocchio-programs)
22. [Testing on Magicblock](#22-testing-on-magicblock)
23. [Architecture Playbooks & Templates](#23-architecture-playbooks--templates)
24. [Security & Audits](#24-security--audits)
25. [Troubleshooting](#25-troubleshooting)
26. [FAQ](#26-faq)
27. [Related Files](#27-related-files)

---

## 1. Key Addresses & Identifiers

| Entity | Address | Notes |
| ------ | ------- | ----- |
| **MagicBlock Delegation Program** | [`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`](https://explorer.solana.com/address/DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh) | Delegates data accounts to the ER/TEE validator on the base layer. Audited by **Halborn**. Repo: [magicblock-labs/delegation-program](https://github.com/magicblock-labs/delegation-program). |
| **MagicBlock Permission Program** (ER `EphemeralPermission` flow) | [`ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1`](https://explorer.solana.com/address/ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1) | Creates/updates/closes `EphemeralPermission` accounts on the ER (PDA-signed by the delegated data account). This is the **current** access-control model (PER quickstart / access-control docs). |
| **Permission Program** (legacy base-layer group abstraction) | [`BTWAqWNBmF2TboMh3fxMJfgR16xGHYD7Kgr2dPwbRPBi`](https://explorer.solana.com/address/BTWAqWNBmF2TboMh3fxMJfgR16xGHYD7Kgr2dPwbRPBi) | Older on-chain permission program (L1, group-based). Audit TBC. Listed in `security-and-audits.md`. |
| **Ephemeral SPL Token program** | [`SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2`](https://explorer.solana.com/address/SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2) | Implements [MIMD 0013](https://github.com/magicblock-labs/magicblock-validator/discussions/550). On-chain program + hosted REST API. Repo: [magicblock-labs/ephemeral-spl-token](https://github.com/magicblock-labs/ephemeral-spl-token). |
| **Solana VRF program** | [`Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`](https://explorer.solana.com/address/Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz) | Provably fair randomness. Audited by **Zenith**. Repo: [magicblock-labs/solana-vrf](https://github.com/magicblock-labs/solana-vrf). |
| **VRF callback signer PDA** (identity) | [`9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw`](https://explorer.solana.com/address/9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw) | Pin with `#[account(address = ...)]` inside callback contexts. |
| **VRF oracle queue - base layer (mainnet/devnet)** | [`Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh`](https://explorer.solana.com/address/Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh) | SDK constant `vrf::consts::DEFAULT_QUEUE`. |
| **VRF oracle queue - ER (mainnet/devnet)** | [`5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc`](https://explorer.solana.com/address/5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc) | SDK constant `vrf::consts::DEFAULT_EPHEMERAL_QUEUE`. |
| **VRF oracle queue - base layer (localnet)** | [`GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb`](https://explorer.solana.com/address/GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb) | SDK constant `vrf::consts::DEFAULT_TEST_QUEUE`. |
| **VRF oracle queue - ER (localnet)** | [`Sc9MJUngNbQXSXGP3F67KvKwVnhaYn6kcioxXNVowYT`](https://explorer.solana.com/address/Sc9MJUngNbQXSXGP3F67KvKwVnhaYn6kcioxXNVowYT) | SDK constant `vrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE`. |
| **Session Keys program** (Gum) | [`KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5`](https://explorer.solana.com/address/KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5) | `session-keys` Rust crate v3.1.1; `@magicblock-labs/gum-react-sdk` for clients. |
| **Pyth Lazer price feed program** | [`PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd`](https://explorer.solana.com/address/PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd) | Used as the PDA program id to derive price feed accounts. |
| **AI Dev Skill repo** | [https://github.com/magicblock-labs/magicblock-dev-skill](https://github.com/magicblock-labs/magicblock-dev-skill) | `npx skills add https://github.com/magicblock-labs/magicblock-dev-skill` |
| **Examples repo** | [https://github.com/magicblock-labs/magicblock-engine-examples](https://github.com/magicblock-labs/magicblock-engine-examples) | Anchor / native-rust / pinocchio examples for every feature. |

> Magic-block SDK constants used in Rust: `ephemeral_rollups_sdk::id()`,
> `ephemeral_rollups_sdk::vrf::consts::VRF_PROGRAM_ID`, `VRF_PROGRAM_IDENTITY`,
> `DEFAULT_QUEUE`, `DEFAULT_EPHEMERAL_QUEUE`, `DEFAULT_TEST_QUEUE`,
> `DEFAULT_EPHEMERAL_TEST_QUEUE`. TypeScript equivalents live in
> `@magicblock-labs/ephemeral-rollups-sdk`: `MAGIC_PROGRAM_ID`, `PERMISSION_PROGRAM_ID`,
> `EPHEMERAL_VAULT_ID`, etc.

---

## 2. RPC Endpoints & Validator Identities

### 2.1 Magic Router

| Environment | URL |
| ----------- | --- |
| Mainnet | [https://router.magicblock.app](https://router.magicblock.app) |
| Devnet | [https://devnet-router.magicblock.app](https://devnet-router.magicblock.app) (+ [wss://devnet-router.magicblock.app](wss://devnet-router.magicblock.app)) |

### 2.2 ER validators (public, free for development)

Use these as your devnet/mainnet deployment targets. **Always add the specific ER validator
identity in your delegation instruction.** Identical pubkeys on mainnet and devnet.

| Zone | Endpoint | Validator identity pubkey |
| ---- | -------- | ------------------------- |
| Asia | `as.magicblock.app` / `devnet-as.magicblock.app` | [`MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`](https://explorer.solana.com/address/MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57) |
| EU | `eu.magicblock.app` / `devnet-eu.magicblock.app` | [`MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e`](https://explorer.solana.com/address/MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e) |
| US | `us.magicblock.app` / `devnet-us.magicblock.app` | [`MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd`](https://explorer.solana.com/address/MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd) |
| TEE (PER) | `mainnet-tee.magicblock.app` / `devnet-tee.magicblock.app` | [`MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo`](https://explorer.solana.com/address/MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo) |
| Localnet | `localhost:7799` | [`mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev`](https://explorer.solana.com/address/mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev) |

General devnet ER endpoint (used in examples): [https://devnet.magicblock.app](https://devnet.magicblock.app).
For the **mainnet** ER endpoint, request access from the MagicBlock team.

### 2.3 Full endpoint cheat-sheet

| Endpoint | Purpose |
| -------- | ------- |
| [https://api.devnet.solana.com](https://api.devnet.solana.com) | Solana devnet base layer |
| [https://devnet-router.magicblock.app](https://devnet-router.magicblock.app) (+ [wss://...](wss://)) | Magic Router devnet |
| [https://devnet-as.magicblock.app](https://devnet-as.magicblock.app) (+ [wss://devnet-as.magicblock.app](wss://devnet-as.magicblock.app)) | ER devnet Asia |
| [https://devnet-eu.magicblock.app](https://devnet-eu.magicblock.app) | ER devnet EU |
| [https://devnet-us.magicblock.app](https://devnet-us.magicblock.app) | ER devnet US |
| [https://devnet-tee.magicblock.app?token={authToken}](https://devnet-tee.magicblock.app?token={authToken}) (+ [wss://devnet-tee.magicblock.app](wss://devnet-tee.magicblock.app)) | PER devnet TEE RPC - token-gated |
| [https://devnet.magicblock.app](https://devnet.magicblock.app) | ER devnet (generic) |
| [https://pccs.phala.network/tdx/certification/v4](https://pccs.phala.network/tdx/certification/v4) | TEE RPC integrity/attestation check |
| [http://localhost:8899](http://localhost:8899) / [ws://localhost:8900](ws://localhost:8900) | Local base layer (`mb-test-validator`) |
| [http://localhost:7799](http://localhost:7799) / [ws://localhost:7800](ws://localhost:7800) | Local ER (`ephemeral-validator`) |
| [http://localhost:6699](http://localhost:6699) / [ws://localhost:6700](ws://localhost:6700) | Local QFS (PER ingress emulation) |
| [https://router.magicblock.app](https://router.magicblock.app) | Magic Router mainnet |
| [https://payments.magicblock.app/reference](https://payments.magicblock.app/reference) | Ephemeral SPL Token API canonical reference |

Devnet local-only setup with a remote base layer: `RUST_LOG=info ephemeral-validator
--lifecycle ephemeral --remote-url "https://rpc.magicblock.app/devnet" --rpc-port 7799`.

---

## 3. Toolchain Versions

Versions pinned by the official docs (dev/test matrix). Other versions may work, but match these for
reproducible builds.

| Software | Version | Install |
| -------- | ------- | ------- |
| Solana CLI | **3.1.9** | [https://docs.anza.xyz/cli/install](https://docs.anza.xyz/cli/install) |
| Rust | **1.89.0** | [https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install) |
| Anchor | **1.0.2** | [https://www.anchor-lang.com/docs/installation](https://www.anchor-lang.com/docs/installation) |
| Node | **24.10.0** | [https://nodejs.org/en/download/current](https://nodejs.org/en/download/current) |

### SDK packages

- **Anchor / native Rust (on-chain)**: `ephemeral-rollups-sdk` (crate). Add with
  `cargo add ephemeral-rollups-sdk --features anchor` (VRF programs add `,vrf`:
  `cargo add ephemeral-rollups-sdk --features anchor,vrf`).
- **Pinocchio**: `ephemeral-rollups-pinocchio` (crate).
- **web3.js client**: `@magicblock-labs/ephemeral-rollups-sdk` (e.g. `0.14.3`).
- **`@solana/kit` client**: `@magicblock-labs/ephemeral-rollups-kit`.
- **Local node tooling**: `@magicblock-labs/ephemeral-validator` (ships `mb-test-validator`,
  `ephemeral-validator`, `query-filtering-service`, `mb-stack`).
- **Session keys**: `session-keys` crate (v3.1.1, `features = ["no-entrypoint"]`),
  `@magicblock-labs/gum-react-sdk`, `@session-keys/anchor` (test helpers).

Install patterns:

```bash
yarn add @magicblock-labs/ephemeral-rollups-sdk@0.14.3
npm install -g @magicblock-labs/ephemeral-validator@latest
cargo add ephemeral-rollups-sdk --features anchor
cargo add ephemeral-rollups-sdk --features anchor,vrf
cargo add session-keys --features no-entrypoint
```

> **SPL token SDK note:** the `spl-tokens` quickstart targets `ephemeral-rollups-sdk` **v0.14.3**
> with the legacy-vault path; the idempotent-shuttle path targets **v0.15.3**. Keep the same idempotent
> setting across `delegateSpl` / `undelegateIx` / `withdrawSpl` within one lifecycle. The PER
> `EphemeralPermission` flow (`Create/Update/CloseEphemeralPermissionCpi`) requires **v0.14+**.

---

## 4. What is an Ephemeral Rollup?

MagicBlock's Ephemeral Rollup (ER) **leverages the Solana Virtual Machine (SVM)'s account-based
structure and parallel execution**. State is organized into **clusters**: users **lock one or more
accounts** and temporarily shift state execution to a dedicated auxiliary layer - the Ephemeral
Rollup. A dynamic fraud-proof mechanism (decentralized Security Committee) enables fast state
finalization. See the whitepaper: *"Ephemeral Rollups Are All You Need"* (Gabriele Picco, Andrea
Fortugno), [https://arxiv.org/abs/2311.02650](https://arxiv.org/abs/2311.02650)

### What it gives you

- **10 ms state transitions** (vs ~400 ms Solana slot time) - slot times are not guaranteed.
- **Gasless transactions** - normal ER transactions cost `0` in the current release.
- **Horizontal scaling** - multiple ERs, auto-sharded by account.
- **State integrity without fragmentation** - collateral stays in Solana PDAs; funds never leave the
  base layer.
- **Full compatibility** - the ER runs the SVM; existing Solana programs work down to bytecode.

### Why Ephemeral Rollups (vs. the alternatives)

The ASI of low-latency on-chain execution is the Ephemeral Rollup, which solves:

- **Latency** - transaction speeds too slow for real-time apps.
- **Cost** - even "low-fee" chains are expensive at scale.
- **Scalability** - current architectures struggle with high throughput.
- **Privacy** - chains are public by default (solved by the Private ER on Intel TDX).

### Product family

| Product | Description |
| ------- | ----------- |
| **Ephemeral Rollup (ER)** | Real-time, zero-fee transactions on Solana |
| **Private Ephemeral Rollup (PER)** | Confidential execution on Intel TDX TEEs with compliance; built on ERs |
| **Ephemeral SPL Token** | Move SPL tokens at rollup speed, public or private, with swaps + private payments |
| **Prediction Markets & Trading** | Real-time execution, session keys, token custody, price feeds, cranks, settlement |
| **Solana VRF** | Provably fair on-chain randomness |
| **Pricing Oracle** | Low-latency on-chain price feeds (Pyth Lazer) |

---

## 5. The Programming Model

### 5.1 Anchor macros (`ephemeral_rollups_sdk::anchor`)

| Macro | Where | What it does |
| ----- | ----- | ------------ |
| `#[ephemeral]` | `#[program]` mod | Makes the module ER-aware; injects the undelegation instruction, callback discriminator `[196, 28, 41, 206, 48, 37, 51, 167]`, and its processor into your program. Without it, undelegation cannot revert account ownership on the base layer. |
| `#[delegate]` | Accounts struct | Provides the delegation CPI machinery (`delegate_pda(...)`); supports `#[account(mut, del)]` marker on the field to delegate. |
| `#[commit]` | Accounts struct | Supplies `magic_context` and `magic_program` accounts for `MagicIntentBundleBuilder`. |
| `#[ephemeral_accounts]` | Accounts struct | Enables ER-only accounts: `sponsor` (rent payer) and `eph` (ER-only) markers + generated methods. |
| `#[action]` | Accounts struct | Marks the instruction handler as callable from a post-commit **Magic Action** on the base layer. |
| `#[vrf]` | Accounts struct | Request context for VRF: provides `invoke_signed_vrf(...)`. |
| `#[vrf_callback]` | Accounts struct | Callback context; enforces only the VRF program (via CPI) can invoke the callback. |

### 5.2 DelegateConfig

```rust
use ephemeral_rollups_sdk::cpi::DelegateConfig;

DelegateConfig {
    validator: Some(v) | None,   // set the specific ER validator
    ..Default::default()
}
```

Set `validator` from `ctx.remaining_accounts.first().map(|acc| acc.key())` to pick the target ER.

### 5.3 MagicIntentBundleBuilder

The single API for commit / undelegate / post-commit actions. Built from
`(payer, magic_context, magic_program)`.

```rust
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

// Commit only (stay delegated)
MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
    .commit(&[account_a, account_b])
    .add_post_commit_actions([...])      // optional Magic Actions
    .build_and_invoke()?;                // or .build_and_invoke_signed(&[seeds])?

// Commit + undelegate atomically
MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
    .commit_and_undelegate(&[account_a])
    .build_and_invoke()?;

// Committing with a live fee payer + validator fee vault
MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
    .magic_fee_vault(magic_fee_vault.to_account_info())
    .commit(&[state_pda.to_account_info()])
    .add_post_commit_actions([action])
    .build_and_invoke_signed(&[payer_seeds])?;
```

> When mutating an Anchor account and committing in the same instruction, serialize first:
> `counter.exit(&crate::ID)?;` before the CPI sees the account.

---

## 6. Delegation, Commit, Undelegation Lifecycle

> Delegating an on-curve/normal system account is different from a PDA - see "On-curve accounts".

### 6.1 The lifecycle

1. **Delegate account (base layer).** State accounts must be delegated to a specific ER validator
   first, by changing the account owner to the **Delegation Program**
   [`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`](https://explorer.solana.com/address/DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh) and specifying parameters like ER validator,
   account lifetime, and synchronization frequency.
2. **Execute in real time.** Delegated state accounts are updated in real-time with transactions on
   the ER directly, or via Magic Router.
3. **Clone to the rollup.** The initial ER transaction on a delegated account clones it from the base
   layer to the ephemeral rollup.
4. **Commit state.** The operator commits the ephemeral state to the base layer periodically or
   on-demand, including new state and relevant pointers. State finalizes via the fraud-proof
   mechanism. The account stays **locked** on the base layer while delegated/committed.
5. **Undelegate account.** State commits through the ER validator back to the base layer and owner
   reverts from the Delegation Program to the original owner program.

Terminology:

- **Delegation** = transferring ownership of program PDAs to the Delegation Program so ephemeral
  validators can transact them in the SVM runtime.
- **Commit** = updating PDA state from the ER to the base layer. After finalization the PDAs remain
  locked on base.
- **Undelegation** = transferring ownership of the PDAs back to your program. State is committed and
  the finalization process triggers; once validated the PDAs unlock and behave normally.

### 6.2 What can and cannot be delegated

- **Program accounts are never delegated.** Only state accounts. Programs are *cloned* when a
  transaction is submitted on the ER, and subscribed for updates thereafter.
- **Delegated accounts can't be created on the ER** - they must exist on Solana first; they are
  cloned after being requested on the ER or included in an ER transaction.
- **Composability:** every Solana account is readable on the ER; only delegated accounts can be
  *changed* within an atomic ER transaction.
- **Executing on the ER with other programs** composes freely - delegated accounts can interact with
  all Solana programs.

### 6.3 On-curve account delegation

Delegating an **on-curve** (non-PDA) account requires the account itself to sign, and uses two
instructions:

1. **Assign** the system account to the Delegation Program (its current owner): `SystemProgram.assign({ accountPubkey, programId: DELEGATION_PROGRAM_ID })`.
2. **Delegate** to the Delegation Program: `createDelegateInstruction({ payer, delegatedAccount, ownerProgram, validator })`.

Signers: (1) the on-curve account to be delegated, (2) the fee payer. After delegation the on-curve
account **can no longer sign** - the fee payer must sign the combined transaction. Direct commit /
undelegate on the ER uses `createCommitAndUndelegateInstruction(address, [address])` sent through the
ephemeral connection (see example `oncurve-delegation`).

### 6.4 Delegation validators

Reference identities are in [§2.2](#2-rpc-endpoints--validator-identities). Use the localnet identity
[`mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev`](https://explorer.solana.com/address/mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev) for fully local tests so commits and undelegations
settle correctly.

---

## 7. Ephemeral Accounts

Accounts that exist **only on the ER** - born, live, and die there. A **sponsor** account (already
delegated) pays rent for them at **32 lamports/byte - about 109× cheaper** than Solana base rent.

- Owned by the calling program (inferred from the CPI context).
- Funded by a sponsor account's lamports.
- Created, resized, and closed entirely on the ER.

### 7.1 `#[ephemeral_accounts]` markers

| Marker | Purpose |
| ------ | ------- |
| `sponsor` | The account (delegated) that pays rent for the ephemeral accounts. |
| `eph` | Marks an account as ephemeral / ER-only. |

**Validation rules:**

- At least one `sponsor` is required if any `eph` field exists.
- Only **one** `sponsor` allowed per struct.
- `eph` cannot be combined with `init` or `init_if_needed` (use the generated methods).
- If the sponsor is a PDA (not a `Signer`) it must carry `seeds` for PDA signing.

**Generated methods** for a field named `conversation`:

| Method | Signature | Description |
| ------ | --------- | ----------- |
| `create_ephemeral_conversation` | `(data_len: u32) -> Result<()>` | Creates the ephemeral account |
| `init_if_needed_ephemeral_conversation` | `(data_len: u32) -> Result<()>` | Creates only if `data_len == 0` |
| `resize_ephemeral_conversation` | `(new_data_len: u32) -> Result<()>` | Grows or shrinks |
| `close_ephemeral_conversation` | `() -> Result<()>` | Closes, refunds rent to sponsor |

**Signing requirements:** sponsor must sign all ops; the ephemeral account must sign **only on
create** (prevents pubkey squatting). PDAs get seeds auto-derived via `find_program_address`.

**Rent model:**

```rust
pub const EPHEMERAL_RENT_PER_BYTE: u64 = 32;
const ACCOUNT_OVERHEAD: u32 = 60;
// rent = (data_len + 60) * 32
```

Growing: sponsor pays additional rent to the vault. Shrinking: vault refunds excess to the sponsor.
Closing: all rent refunded. Storage balance example: 0 bytes → `1,920` lamports; 1,000 bytes →
`33,920` lamports.

**Create example:**

```rust
use ephemeral_rollups_sdk::anchor::ephemeral_accounts;

pub fn create_conversation(ctx: Context<CreateConversation>) -> Result<()> {
    ctx.accounts
        .create_ephemeral_conversation((8 + Conversation::space_for_message_count(0)) as u32)?;

    let conversation = Conversation {
        handle_owner: ctx.accounts.profile_owner.handle.clone(),
        handle_other: ctx.accounts.profile_other.handle.clone(),
        bump: ctx.bumps.conversation,
        messages: Vec::new(),
    };
    let mut data = ctx.accounts.conversation.try_borrow_mut_data()?;
    conversation.try_serialize(&mut &mut data[..])?;
    Ok(())
}

#[ephemeral_accounts]
#[derive(Accounts)]
pub struct CreateConversation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, sponsor, seeds = [b"profile", profile_owner.handle.as_bytes()], bump, has_one = authority)]
    pub profile_owner: Account<'info, Profile>,

    #[account(seeds = [b"profile", profile_other.handle.as_bytes()], bump)]
    pub profile_other: Account<'info, Profile>,

    /// CHECK: Ephemeral conversation PDA sponsored by the profile.
    #[account(mut, eph, seeds = [b"conversation", profile_owner.handle.as_bytes(), profile_other.handle.as_bytes()], bump)]
    pub conversation: AccountInfo<'info>,
    // vault and magic_program are auto-injected by the macro
}
```

**Gotchas:**

- `eph` fields must use `AccountInfo<'info>`, **not** `Account<'info, T>` (the account doesn't exist
  at validation time).
- **Manual serialization is required after create** - the macro allocates space but writes no data.
- Cannot combine `eph` with `init` / `init_if_needed`.
- **The sponsor must be delegated first**, and should be top-up-funded *before* delegation so it has
  lamports to sponsor ephemeral accounts.
- `vault` and `magic_program` are auto-injected; they appear in the IDL and must be passed from the
  client.
- All ephemeral account operations are sent to the **ER connection**, not the base layer.

Full demo: [magicblock-engine-examples/tree/main/ephemeral-account-chats](https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/ephemeral-account-chats).

---

## 8. Runtime Limits

The ER runs the SVM, so the same runtime rules as the base layer apply - with one raised limit:

| Limit | Solana Base Layer | Ephemeral Rollup |
| :---- | :---------------- | :--------------- |
| Compute per instruction (default) | 200,000 CU | 200,000 CU |
| Compute per transaction (max, `SetComputeUnitLimit`) | 1,400,000 CU | 1,400,000 CU |
| Serialized transaction size | 1,232 bytes | **64 KB** |
| Account size | 10 MiB | 10 MiB |
| Slot time | ~400 ms | ~10 ms |

Request more compute by prepending:

```typescript
import { ComputeBudgetProgram, Transaction } from "@solana/web3.js";

const tx = new Transaction().add(
  ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
  yourProgramInstruction
);
```

> **Warning**: the 64 KB limit only applies to transactions executed on the ER - i.e. **all writable
> accounts are delegated**. Transactions routed to base (delegation, undelegation) remain at the
> 1,232-byte Solana limit.
>
> **Slot times are not guaranteed.** Do not write logic that depends on a specific slot duration.

---

## 9. Fees, Commits & Refunds

Two separate fee systems:

1. **A deposit on Solana** funded at delegation. At undelegation, MagicBlock takes the session and
   commit charges from it and refunds the rest to the recorded `rent_payer`.
2. **A live commit limit inside the ER.** Without a delegated fee payer, an account can commit 10
   times; commit 11 fails with custom error `0xA0000000`. For longer sessions, add a delegated fee
   payer + `magic_fee_vault` (removes the 10-commit stop; live fees start at commit 26).

### 9.1 Price list (checked 2026-08-20)

| What | Price | When |
| :--- | ----: | :--- |
| Normal ER transaction | `0` (current release) | - |
| One delegation session | `300,000` lamports (`0.0003 SOL`) | Taken from the Solana deposit at undelegation |
| Commits after the first | `100,000` lamports (`0.0001 SOL`) each | Taken from the deposit at undelegation |
| Live commits starting with commit 26 | `100,000` lamports per account | Taken immediately from the delegated fee payer |
| Base Actions | Based on requested compute units | Taken immediately from the delegated fee payer |
| Adding a callback | `5,000` lamports | Taken immediately from the delegated fee payer |
| Temporary Ephemeral Account storage | `(bytes + 60) * 32` lamports, refundable | Reserved on create/grow |

### 9.2 Deposit settlement at undelegation

```text
session charge  = 300,000 lamports
commit charge   = 100,000 lamports for each commit after commit 1
total charge    = session charge + commit charge
amount taken    = min(deposit balance, total charge)     # no debt is created
refund          = deposit balance - amount taken
```

- A no-commit session can still cost up to `300,000` lamports.
- Commits 2, 3, 4, … each add `100,000` lamports.
- Any leftover is refunded to the wallet recorded as `rent_payer` at delegation.

### 9.3 The 10-commit limit vs. the fee-payer path

| Mode | Behavior |
| ---- | -------- |
| **No fee payer** | Commits 1-10 accepted. Commit 11 → error `0xA0000000`. A final `commit_and_undelegate` still works so the account is never trapped. Accepted commits are still charged at undelegation. |
| **With delegated fee payer + `magic_fee_vault`** | No hard stop. Commits 1-25 have no live fee; **commit 26 and every later commit cost `100,000` lamports per committed account**, taken immediately. Deposit charges are still calculated at undelegation (app may pay both). |

- One bundle committing several accounts is charged per account (e.g. 2 accounts on commit 26 →
  `200,000` lamports).
- If the fee payer can't cover the full charge → `InsufficientFunds`; no partial payment.
- The committed account and the fee payer need not be the same. If your app sponsors users, set
  spending/rate limits so one user can't drain a shared payer.

### 9.4 Keeping a delegated fee payer funded (top-up)

Submit on the **base layer** (not the ER). The Ephemeral SPL Token program creates a single-use
lamports PDA, funds it from the payer, and lets the ER credit the destination's delegated balance.

```typescript
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { lamportsDelegatedTransferIx, deriveLamportsPda } from "@magicblock-labs/ephemeral-rollups-sdk";

async function topUpDelegatedAccount(
  connection: Connection,        // base-layer connection
  payer: Keypair,
  destination: PublicKey,        // delegated account to top up
  amountLamports: bigint,
) {
  const salt = crypto.getRandomValues(new Uint8Array(32)); // fresh per top-up!
  const [lamportsPda] = deriveLamportsPda(payer.publicKey, destination, salt);
  const ix = await lamportsDelegatedTransferIx(payer.publicKey, destination, amountLamports, salt);
  const tx = new Transaction().add(ix);
  tx.feePayer = payer.publicKey;
  // CRITICAL: send to the base-layer RPC, not the ER.
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
    skipPreflight: true,
  });
  return { sig, lamportsPda };
}
```

Budget for: the lamports transferred + the top-up helper's current `300,000`-lamport setup charge +
the Solana transaction fee. The destination must already be delegated. **Re-using a salt collides
with an existing lamports PDA.**

### 9.5 Base Actions and callbacks pricing

```text
Base Action price = round up(requested compute units * 50,000 / 1,000,000) lamports
```

- One action requesting `200,000` CU → `10,000` lamports; two such actions → `20,000`.
- A callback costs `5,000` lamports extra (its CU are not included in the action calc).

### 9.6 Worked examples

```text
# One commit, then undelegate
calculated deposit charge = 300,000 lamports
amount taken = min(D, 300,000); refund = D - amount taken; live fees = 0

# Ten simple commits, then undelegate
session = 300,000; commits 2..10 = 9 * 100,000
calculated deposit charge = 1,200,000 lamports

# Twenty-six commits with a delegated fee payer
calculated deposit charge at undelegation = 300,000 + 25 * 100,000 = 2,800,000
live fee on commit 26 = 100,000 lamports
```

### 9.7 Where fees go

At deposit settlement ~10% goes to the protocol fee vault, ~90% to the validator fee vault.
Validators auto-withdraw only when their accumulated balance exceeds `100,000,000` lamports
(batching, not an app fee).

### 9.8 Common fee errors

| Condition | Result |
| --------- | ------ |
| Normal 11th commit without fee-payer path | Custom error `0xA0000000` |
| Commit number not found | Custom error `0xA0000001` |
| `magic_fee_vault` missing/incorrect | `MissingAccount` |
| Fee vault not writable and delegated | `IllegalOwner` |
| Delegated fee payer can't cover charge | `InsufficientFunds` |
| Ephemeral Account sponsor can't fund storage | `InsufficientFunds` |

---

## 10. Quickstart - Anchor Counter

Full example: [magicblock-engine-examples/tree/main/counter/anchor](https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/counter/anchor) (+ live demo
[https://counter-example.magicblock.app/](https://counter-example.magicblock.app/)).

### Step 1 - Write the program

```bash
cargo add ephemeral-rollups-sdk --features anchor
```

```rust
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

declare_id!("YOUR_PROGRAM_ID");

pub const COUNTER_SEED: &[u8] = b"counter";

#[ephemeral]
#[program]
pub mod public_counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.counter.count = 0;
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        ctx.accounts.counter.count += 1;
        Ok(())
    }

    pub fn delegate(ctx: Context<DelegateInput>) -> Result<()> {
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[COUNTER_SEED],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    pub fn increment_and_commit(ctx: Context<IncrementAndCommit>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count += 1;
        counter.exit(&crate::ID)?; // serialize before the CPI sees the account
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.counter.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }

    pub fn undelegate(ctx: Context<IncrementAndCommit>) -> Result<()> {
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.counter.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init_if_needed, payer = user, space = 8 + 8, seeds = [COUNTER_SEED], bump)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut, seeds = [COUNTER_SEED], bump)]
    pub counter: Account<'info, Counter>,
}

/// Add delegate function to the context
#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    pub payer: Signer<'info>,
    /// CHECK: The pda to delegate
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct IncrementAndCommit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [COUNTER_SEED], bump)]
    pub counter: Account<'info, Counter>,
}

#[account]
pub struct Counter {
    pub count: u64,
}
```

> The `#[ephemeral]` macro injects the undelegation callback discriminator
> `[196, 28, 41, 206, 48, 37, 51, 167]` and processor - required for undelegation to revert account
> ownership on the base layer.

### Step 2 - Deploy

```bash
# Devnet: airdrop SOL to your configured keypair before deploying
solana airdrop 2 --url https://api.devnet.solana.com
anchor build && anchor deploy
```

### Step 3 - Test

```bash
anchor test --skip-build --skip-deploy --skip-local-validator
```

Set the endpoint env vars to the devnet ER (or localhost for local):

```typescript
const provider = new anchor.AnchorProvider(
  new anchor.web3.Connection(
    process.env.PROVIDER_ENDPOINT || "https://api.devnet.solana.com",
    { wsEndpoint: process.env.PROVIDER_WS_ENDPOINT || undefined, commitment: "confirmed" },
  ),
  anchor.Wallet.local(),
);
anchor.setProvider(provider);

const providerEphemeralRollup = new anchor.AnchorProvider(
  new anchor.web3.Connection(
    process.env.EPHEMERAL_PROVIDER_ENDPOINT || "https://devnet-as.magicblock.app/",
    { wsEndpoint: process.env.EPHEMERAL_WS_ENDPOINT || "wss://devnet-as.magicblock.app/", commitment: "confirmed" },
  ),
  anchor.Wallet.local(),
);

const program = anchor.workspace.PublicCounter as Program<PublicCounter>;
const [counterPDA] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("counter")], program.programId);

// 1) initialize on base
// 2) delegate on base
// 3) increment (or increment_and_commit) on the ER
// 4) undelegate on the ER - then confirm the base-layer commit
```

---

## 11. Local Development

Three supported setups. All install the node stack once:

```bash
npm install -g @magicblock-labs/ephemeral-validator@latest
```

Which provides: `mb-test-validator` (base), `ephemeral-validator` (ER), `query-filtering-service`
(QFS/PER), `vrf-oracle`, and `mb-stack`.

### 11.1 Option A - Fully local stack

```bash
mb-test-validator --reset                                   # base layer @ 8899/8900
# deploy your program against localhost:
cargo build-sbf && solana config set --url localhost && solana program deploy YOUR_PROGRAM_PATH
# or Anchor:
# anchor build && anchor deploy --provider.cluster localnet

ephemeral-validator --remotes "http://localhost:8899" --remotes "ws://localhost:8900" -l "7799" --lifecycle ephemeral
```

Run tests (Anchor):

```bash
EPHEMERAL_PROVIDER_ENDPOINT="http://localhost:7799" \
EPHEMERAL_WS_ENDPOINT="ws://localhost:7800" \
anchor test --provider.cluster localnet --skip-local-validator --skip-build --skip-deploy
```

Or (native Rust): `EPHEMERAL_PROVIDER_ENDPOINT=http://localhost:7799
EPHEMERAL_WS_ENDPOINT=ws://localhost:7800 PROVIDER_ENDPOINT=http://localhost:8899
WS_ENDPOINT=ws://localhost:8900 yarn test`

### 11.2 Option B - Surfpool

```bash
curl -sL https://run.surfpool.run/ | bash      # install Surfpool
surfpool start --rpc-url https://api.devnet.solana.com
ephemeral-validator --remotes "http://localhost:8899" --remotes "ws://localhost:8900" -l "7799" --lifecycle ephemeral
# smoke test:
solana transfer <your address> 0 -u "http://localhost:7799"
```

### 11.3 Option C - Local ER + public devnet base

```bash
anchor build && anchor deploy --provider.cluster devnet   # or cargo build-sbf + solana program deploy devnet
RUST_LOG=info ephemeral-validator \
  --lifecycle ephemeral \
  --remote-url "https://rpc.magicblock.app/devnet" \
  --rpc-port 7799
```

### 11.4 Endpoint env vars (canonical)

```bash
export PROVIDER_ENDPOINT=http://localhost:8899            # base layer
export WS_ENDPOINT=ws://localhost:8900
export EPHEMERAL_PROVIDER_ENDPOINT=http://localhost:7799  # ER direct
export EPHEMERAL_WS_ENDPOINT=ws://localhost:7800
export QFS_ENDPOINT=http://localhost:6699                 # QFS (PER ingress emulation)
export QFS_WS_ENDPOINT=ws://localhost:6700
export TEE_PROVIDER_ENDPOINT=$QFS_ENDPOINT                # private tests read this
export TEE_WS_ENDPOINT=$QFS_WS_ENDPOINT
export VALIDATOR=mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev
```

### 11.5 Run the VRF oracle locally

```bash
mb-test-validator --reset
ephemeral-validator --remote-url "http://localhost:8899" --rpc-port 7799 --lifecycle ephemeral
# one oracle against base, one against the ER:
VRF_ORACLE_SKIP_PREFLIGHT=true RPC_URL=http://localhost:8899  WEBSOCKET_URL=ws://localhost:8900 RUST_LOG=info vrf-oracle &
VRF_ORACLE_SKIP_PREFLIGHT=true RPC_URL=http://localhost:7799  WEBSOCKET_URL=ws://localhost:7800 RUST_LOG=info vrf-oracle &
```

---

## 12. Magic Router & Router API

### 12.1 Magic Router (transaction routing)

A dynamic routing engine that inspects each transaction's metadata (writable accounts, owners,
signers) and routes it to the **Ephemeral Rollup** (fast, low-latency, zero-cost) or **Solana**
(persistent) automatically - one RPC endpoint, no manual routing.

Flow: dApp submits to the Router RPC → Router inspects writable-account owners → Router routes to
ER or Solana.

**Devnet:** [https://devnet-router.magicblock.app](https://devnet-router.magicblock.app). **Mainnet:** [https://router.magicblock.app](https://router.magicblock.app).

```typescript
// Kit
import { Connection } from "@magicblock-labs/ephemeral-rollups-kit";
const connection = await Connection.create("https://devnet-router.magicblock.app", "wss://devnet-router.magicblock.app");
const txHash = await connection.sendAndConfirmTransaction(transactionMessage, [userKeypair], { commitment: "confirmed", skipPreflight: true });

// web3.js
import { sendAndConfirmTransaction } from "@solana/web3.js";
import { ConnectionMagicRouter } from "@magicblock-labs/ephemeral-rollups-sdk";
const connection = new ConnectionMagicRouter("https://devnet-router.magicblock.app/", { wsEndpoint: "wss://devnet-router.magicblock.app/" });
const txHash = await sendAndConfirmTransaction(connection, tx, [payer], { skipPreflight: true, commitment: "confirmed" });
```

### 12.2 Router API (JSON-RPC 2.0)

Implements almost all standard Solana RPC methods plus router-specific ones behind a single
endpoint.

- **Mainnet URL:** [https://router.magicblock.app](https://router.magicblock.app)
- **Devnet URL:** [https://devnet-router.magicblock.app](https://devnet-router.magicblock.app)
- **API Version:** 2.0

Methods:

| Area | Method |
| ---- | ------ |
| Network | `getRoutes` - query available routing info |
| Network | `getIdentity` - identity info |
| Account | `getAccountInfo` - account info/balances |
| Account | `getBlockhashForAccounts` - a blockhash from the appropriate node based on the provided accounts and their delegation status |
| Status | `getSignatureStatuses` - transaction signature statuses |
| Delegation | `getDelegationStatus` - query delegation relationships |

> Include the delegated **fee payer** in every `getBlockhashForAccounts` request so the returned
> blockhash comes from the node the payer can actually sign against.

---

## 13. Magic Actions

Attach one or more call instructions that run automatically on the **Solana base layer** immediately
after an **ER commit** - using freshly committed state as inputs. Example repo:
[magicblock-engine-examples/tree/main/magic-actions/anchor](https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/magic-actions/anchor).

### 13.1 How it works

1. Delegate accounts to an ER.
2. Execute low-latency transactions on the ER.
3. Commit to base **with attached instruction actions** while staying delegated.
4. Handlers execute automatically using the freshly committed state.

### 13.2 The `#[action]` caveat (read before building)

> `#[action]` makes the instruction **callable from** a post-commit action - it does **not** make it
> callable **only** that way. The handler is an ordinary base-layer instruction, so anyone can invoke
> it directly with a wallet. `Address`, `seeds`, and `owner` constraints only pin *which* accounts
> are passed; they do **not** authenticate *who* called it. Any handler that moves value or changes
> authoritative state **must verify the injected `escrow` signer**.

The delegation program pays the action's transaction fee from an **ephemeral balance escrow** - a
SOL-holding PDA derived from `[b"balance", escrow_auth, escrow_index]` - and injects two accounts
into the `#[action]` context: `escrow_auth` (the payer identity) and `escrow` (the PDA itself,
signed via `invoke_signed`). `ActionArgs::new` defaults `escrow_index` to **`255`**.

**Authenticate the caller** in every handler that moves value:

```rust
pub const ACTION_ESCROW_INDEX: u8 = 255; // ActionArgs::new default

// In the #[action] accounts context:
/// CHECK: payer identity the action was scheduled with. When the handler acts
/// with a program-owned PDA, bind this to that PDA.
#[account(address = vault_authority.key())]
pub escrow_auth: UncheckedAccount<'info>,

/// CHECK: only the delegation program can sign for this PDA, so `signer`
/// proves the call arrived through the real post-commit path.
#[account(
    signer,
    address = ephemeral_rollups_sdk::pda::ephemeral_balance_pda_from_payer(
        &escrow_auth.key(),
        ACTION_ESCROW_INDEX,
    ),
)]
pub escrow: UncheckedAccount<'info>,
```

If the same logic also needs a normal user-called entrypoint, the default pattern is **two thin
instructions over one shared internal function** (an `#[action]` entrypoint with the escrow checks +
a `Signer`-authorized entrypoint).

### 13.3 Build the commit instruction with the action

```rust
use ephemeral_rollups_sdk::ephem::{CallHandler, MagicIntentBundleBuilder};
use ephemeral_rollups_sdk::{ActionArgs, ShortAccountMeta};

// ER-side commit instruction - schedules the action on magic_context.
let instruction_data = anchor_lang::InstructionData::data(&crate::instruction::UpdateLeaderboard {});
let action_args = ActionArgs::new(instruction_data);
let action_accounts = vec![
    ShortAccountMeta { pubkey: ctx.accounts.leaderboard.key(), is_writable: true },
    ShortAccountMeta { pubkey: ctx.accounts.counter.key(), is_writable: false },
];
let action = CallHandler {
    destination_program: crate::ID,
    accounts: action_accounts,
    args: action_args,
    escrow_authority: ctx.accounts.payer.to_account_info(), // pays fees from its escrow PDA
    compute_units: 200_000,
};

MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
    .commit(&[ctx.accounts.counter.to_account_info()])
    .add_post_commit_actions([action])
    .build_and_invoke()?;
```

- Multiple actions execute **sequentially** in the order passed to `add_post_commit_actions`.
- Undelegate + actions atomically: `.commit_and_undelegate(&[...]).add_post_commit_actions([action])`.
- **Limitations:** handlers run on the base layer (base-layer fees and Solana limits apply);
  **any action failure reverts the commit**; the **first two action accounts are injected**
  (`escrow`, `escrow_auth`).

### 13.4 Action handler

```rust
#[action]
#[derive(Accounts)]
pub struct UpdateLeaderboard<'info> {
    #[account(mut, seeds = [LEADERBOARD_SEED], bump)]
    pub leaderboard: Account<'info, Leaderboard>,
    /// CHECK: PDA owner depends on: 1) Delegated: Delegation Program; 2) Undelegated: Your program ID
    pub counter: UncheckedAccount<'info>,
    // + the two injected accounts (escrow_auth, escrow) when authenticating
}

pub fn update_leaderboard(ctx: Context<UpdateLeaderboard>) -> Result<()> {
    let leaderboard = &mut ctx.accounts.leaderboard;
    let counter_info = &mut ctx.accounts.counter.to_account_info();
    let mut data: &[u8] = &counter_info.try_borrow_data()?;
    let counter = Counter::try_deserialize(&mut data)?;
    if counter.count > leaderboard.high_score {
        leaderboard.high_score = counter.count;
    }
    msg!("Leaderboard updated! High score: {}", leaderboard.high_score);
    Ok(())
}
```

---

## 14. Cranks (Scheduled Tasks)

Automated, time-based execution of on-chain instructions without user intervention, scheduled
through an ER transaction. Reference repo:
[magicblock-engine-examples/tree/main/crank-counter/anchor](https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/crank-counter/anchor).

### 14.1 Execution flow

1. `initialize()` on the base layer → creates a counter PDA.
2. `delegate()` on the base layer → moves the account to the ER.
3. `schedule_increment()` on the ER → CPI to the MagicBlock program scheduling a task with
   `task_id`, `execution_interval_millis`, `iterations`, and one or more instructions.
4. The MagicBlock program executes `increment()` automatically at the interval.
5. `undelegate()` commits and returns the account to the base layer.

### 14.2 Scheduling CPI

```rust
pub fn schedule_increment(ctx: Context<ScheduleIncrement>, args: ScheduleIncrementArgs) -> Result<()> {
    let increment_ix = Instruction {
        program_id: crate::ID,
        accounts: vec![AccountMeta::new(ctx.accounts.counter.key(), false)],
        data: anchor_lang::InstructionData::data(&crate::instruction::Increment {}),
    };

    let ix_data = bincode::serialize(&MagicBlockInstruction::ScheduleTask(
        ScheduleTaskArgs {
            task_id: args.task_id,
            execution_interval_millis: args.execution_interval_millis,
            iterations: args.iterations,
            instructions: vec![increment_ix],
        },
    ))
    .map_err(|err| {
        msg!("ERROR: failed to serialize args {:?}", err);
        ProgramError::InvalidArgument
    })?;

    let schedule_ix = Instruction::new_with_bytes(
        MAGIC_PROGRAM_ID,
        &ix_data,
        vec![
            AccountMeta::new(ctx.accounts.payer.key(), true),
            AccountMeta::new(ctx.accounts.counter.key(), false),
        ],
    );

    invoke_signed(&schedule_ix, &[
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.counter.to_account_info(),
    ], &[])?;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ScheduleIncrementArgs {
    pub task_id: u64,                    // unique task id
    pub execution_interval_millis: u64,  // ms between executions
    pub iterations: u64,                 // how many times to execute
}

#[derive(Accounts)]
pub struct ScheduleIncrement<'info> {
    /// CHECK: used for CPI
    #[account()]
    pub magic_program: AccountInfo<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Passed to CPI - use AccountInfo to avoid Anchor re-serializing stale data after CPI
    #[account(mut, seeds = [COUNTER_SEED], bump)]
    pub counter: AccountInfo<'info>,
    /// CHECK: used for CPI
    pub program: AccountInfo<'info>,
}
```

> **Use `AccountInfo` instead of `Account<Counter>`** in the scheduling context to avoid Anchor
> re-serializing stale data after the CPI call.

---

## 15. Solana VRF

Provably fair randomness for games, raffles, matchmaking, and loot. Available on **both Solana
mainnet and MagicBlock Ephemeral Rollups**. Reference: [magicblock-engine-examples/tree/main/roll-dice/anchor](https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/roll-dice/anchor) (+ live apps: [https://roll-dice.magicblock.app/](https://roll-dice.magicblock.app/) and `/delegated`).

### 15.1 How it works

1. Your program submits a randomness request with a `caller_seed`, callback discriminator, and
   callback accounts.
2. The request is added to an oracle queue for fulfillment.
3. A verified oracle computes the random value and proof.
4. The MagicBlock VRF program verifies the proof on-chain.
5. Your callback receives the random bytes and applies game/app logic.

### 15.2 Request & consume

```bash
cargo add ephemeral-rollups-sdk --features anchor,vrf
```

```rust
use ephemeral_rollups_sdk::{
    anchor::{vrf, vrf_callback},
    vrf::{
        self,
        instructions::{create_request_scoped_randomness_ix, RequestRandomnessParams},
        types::SerializableAccountMeta,
    },
};

pub fn roll_dice(ctx: Context<DoRollDiceCtx>, client_seed: u8) -> Result<()> {
    msg!("Requesting randomness...");
    let ix = create_request_scoped_randomness_ix(RequestRandomnessParams {
        payer: ctx.accounts.payer.key(),
        oracle_queue: ctx.accounts.oracle_queue.key(),
        callback_program_id: ID,
        callback_discriminator: instruction::CallbackRollDice::DISCRIMINATOR.to_vec(),
        caller_seed: [client_seed; 32],
        accounts_metas: Some(vec![SerializableAccountMeta {
            pubkey: ctx.accounts.player.key(),
            is_signer: false,
            is_writable: true,
        }]),
        callback_args: Some(vec![client_seed]),
        ..Default::default()
    });
    ctx.accounts.invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
    Ok(())
}

pub fn callback_roll_dice(
    ctx: Context<CallbackRollDiceCtx>,
    randomness: [u8; 32],
    client_seed: u8,
) -> Result<()> {
    msg!("client_seed={}", client_seed);
    let rnd_u8 = vrf::rnd::random_u8_with_range(&randomness, 1, 6);
    msg!("Consuming random number: {:?}", rnd_u8);
    ctx.accounts.player.last_result = rnd_u8;
    Ok(())
}

#[vrf]
#[derive(Accounts)]
pub struct DoRollDiceCtx<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [PLAYER, payer.key().to_bytes().as_slice()], bump)]
    pub player: Account<'info, Player>,
    /// CHECK: The oracle queue
    #[account(
        mut,
        constraint =
            oracle_queue.key() == vrf::consts::DEFAULT_QUEUE ||                // Devnet
            oracle_queue.key() == vrf::consts::DEFAULT_TEST_QUEUE ||           // Local
            oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_QUEUE ||      // ER Devnet
            oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE    // ER Local
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

// `#[vrf_callback]` enforces that only the VRF program (via CPI) can invoke the
// callback - omitting it leaves the callback spoofable by any caller.
#[vrf_callback]
#[derive(Accounts)]
pub struct CallbackRollDiceCtx<'info> {
    #[account(mut)]
    pub player: Account<'info, Player>,
}
```

Key facts:

- `RequestRandomnessParams` fields: `payer`, `oracle_queue`, `callback_program_id` (your `ID`),
  `callback_discriminator` (your callback instruction's discriminator), `caller_seed`
  (`[u8; 32]`), `accounts_metas` (`Option<Vec<SerializableAccountMeta>>`), `callback_args`
  (`Option<Vec<u8>>`).
- `invoke_signed_vrf(payer, &ix)` is provided by the `#[vrf]` context.
- Callback signature: `callback_roll_dice(ctx, randomness: [u8; 32], ...)`.
- Convert randomness with helpers like `vrf::rnd::random_u8_with_range(&randomness, 1, 6)`.
- Pin the callback signer account with `#[account(address =
  ephemeral_rollups_sdk::vrf::consts::VRF_PROGRAM_IDENTITY)]` in security-sensitive contexts.
- Queue constants (see [§1](#1-key-addresses--identifiers)): pass the queue matching where your
  transaction runs (mainnet/devnet share addresses; localnet uses the test queues).

### 15.3 VRF pricing

Charged per fulfilled randomness request (covers proof generation + posting the verified result):

| VRF type | Amount | Notes |
| -------- | -----: | ----- |
| **ER (< 50 ms)** | **Free** | per request |
| **Solana (< 500 ms)** | **0.0008 SOL** | per request |
| **Solana (1-2 s)** | **0.0005 SOL** | per request |

At default 5 requests/min over 30 days (~2.16M requests), MagicBlock VRF is ~**4× cheaper** than a
0.002 SOL/tx competitor.

### 15.4 VRF security notes

- The VRF program checks for `InvalidProof` / `Unauthorized` before your game logic runs.
- Do **not** use block hashes: validators/operators can influence blockhash-based outcomes and
  users can't verify off-chain generation.
- Prefer ER VRF for latency; the er queue/callback path keeps randomness near real-time.
- Open source and audited (Zenith) - treat the audit as source of truth before going live.

---

## 16. Price Oracle (Pyth Lazer)

Low-latency on-chain price feeds. MagicBlock ingests **Pyth Lazer** and updates ER accounts every
**50-200 ms** (asset-dependent) vs ~400 ms Solana slots. Reference:
[https://github.com/magicblock-labs/real-time-pricing-oracle](https://github.com/magicblock-labs/real-time-pricing-oracle), live demo
[https://pyth-template.magicblock.app/](https://pyth-template.magicblock.app/), supported feeds `pyth_lazer_list.json`.

- **Data source:** upstream truth. MagicBlock can ingest arbitrary on/off-chain feeds (including
  assets Pyth doesn't cover) into ERs.
- **Chain pusher:** processes the source feed and writes updates on-chain (will be open-sourced).
- **Flow:** receive Pyth Lazer updates at 50 ms or 200 ms by asset → push to predefined on-chain
  accounts → programs read the account directly (no external API at execution time).

### 16.1 Deriving the price feed account

PDA seeds: `["price_feed", "pyth-lazer", feed_id_as_string]` under program id
[`PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd`](https://explorer.solana.com/address/PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd):

```typescript
function deriveFeedAddress(feedId: string) {
  const [addr] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from('price_feed'), Buffer.from('pyth-lazer'), Buffer.from(feedId)],
    PROGRAM_ID, // PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd
  );
  return addr;
}
```

### 16.2 Decoding the price

```typescript
const addr = deriveFeedAddress(feed.id);
const PRICE_OFFSET = 73; // price field begins 73 bytes from the start of account data
const dv = new DataView(ai.data.buffer, ai.data.byteOffset, ai.data.byteLength);
const raw = dv.getBigUint64(PRICE_OFFSET, true);
const price = Number(raw) * Math.pow(10, feed.exponent);
```

- `PRICE_OFFSET = 73`, little-endian `u64`.
- Apply the feed's exponent: `price = raw * 10^exponent`.

> On-chain programs read the feed account directly inside each price-sensitive instruction - check
> **freshness**, validate the feed account address, and apply slippage protection.

---

## 17. Ephemeral SPL Tokens

Hold and move SPL tokens inside an ER at rollup speed, then settle back to Solana. Powering
**private payments**, but the primitive is general: a transfer can be **public or private**.

Program: [`SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2`](https://explorer.solana.com/address/SPLxh1LVZzEkX99H6rqYizhytLWPZVV296zyYDPagv2).

### 17.1 The model

- **Ephemeral ATA (eATA)** - a program-owned PDA derived from **`[owner, mint]`** holding a single
  `u64` balance. Not a real SPL token account - a lightweight balance record (an ER-side
  "daiper-equivalent") that can be delegated and mutated at speed.
- **Global Vault** - a PDA derived from **`[mint]`** that owns the SPL token account backing
  **every** eATA of that mint. One vault backs all eATAs for a mint.

### 17.2 Lifecycle

1. **Deposit & delegate** - real tokens move into the mint's Global Vault, your eATA is credited and
   delegated to a MagicBlock validator.
2. **Transact on the ER** - transfer between eATAs at low latency, public or private.
3. **Undelegate & commit** - the eATA is committed and undelegated back to base.
4. **Withdraw** - tokens move out of the Global Vault to a base-layer SPL account.

### 17.3 Client lifecycle (SDK)

First delegation for a mint creates the shared Global Vault (`initVaultIfMissing: true`); later ones
reuse it (`false`).

```typescript
import { delegateSpl, transferSpl, undelegateIx, withdrawSpl,
         GetCommitmentSignature, waitForErTokenAccount } from "@magicblock-labs/ephemeral-rollups-sdk";

// 1) Delegate (BASE LAYER) - fund the rent sponsor (deriveRentPda()) first.
const ixs = await delegateSpl(owner.publicKey, mint.publicKey, amount, {
  validator, idempotent: false as const, payer: admin.publicKey,
  initVaultIfMissing: true, // true for the first owner of this mint, false after
});
await provider.sendAndConfirm(new anchor.web3.Transaction().add(...ixs), [owner, admin], {
  commitment: "confirmed", skipPreflight: true,
});

// 2) Transfer (EPHEMERAL) - poll the ER view before transferring.
await waitForErTokenAccount(ata, expectedAmount);
const transferIxs = await transferSpl(recipientA.publicKey, recipientB.publicKey, mint.publicKey, 2n,
  { visibility: "public", fromBalance: "ephemeral", toBalance: "ephemeral" }); // or visibility: "private"
await providerEphemeralRollup.sendAndConfirm(new anchor.web3.Transaction().add(...transferIxs), [recipientA], {
  commitment: "confirmed", skipPreflight: true,
});

// 3) Undelegate (EPHEMERAL) - one per owner per tx; wait for the base-layer commit before withdrawing.
const sgn = await providerEphemeralRollup.sendAndConfirm(
  new anchor.web3.Transaction().add(undelegateIx(owner.publicKey, mint.publicKey)), [owner],
  { commitment: "confirmed", skipPreflight: true },
);
const commit = await GetCommitmentSignature(sgn, providerEphemeralRollup.connection);
await connection.confirmTransaction(commit, "confirmed");

// 4) Withdraw (BASE)
const withdrawIxs = await withdrawSpl(owner.publicKey, mint.publicKey, amount, { idempotent: false });
await provider.sendAndConfirm(new anchor.web3.Transaction().add(...withdrawIxs), [owner], { commitment: "confirmed" });
```

> **Under the hood:** transfers route through your program by adding `#[ephemeral]` - the
> instruction is a plain SPL Token CPI (`token::transfer` with `from`/`to`/`authority`).

### 17.4 Smart-contract custody (two models)

| Model | You delegate… | Tokens move… | Use when |
| ----- | ------------- | ------------ | -------- |
| **eATA custody** | a program-owned **eATA** owned by your custody PDA | on the ER, PDA-signed | you settle or pay out inside the rollup (e.g. a market fill) |
| **State PDA + post-commit payout** | only a **state PDA**; real ATAs stay on base | on the base layer, as a post-commit action | funds stay on L1 and settle on commit |

**eATA custody steps:**

```rust
// 1) ER-aware program
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

#[ephemeral]
#[program]
pub mod your_program { /* ... */ }

// 2) eATA = PDA from [owner, mint] under the Ephemeral SPL Token program
let (eata, _bump) = Pubkey::find_program_address(
    &[owner.as_ref(), mint.as_ref()],
    &EPHEMERAL_SPL_TOKEN_PROGRAM_ID,
);
// At initialize: InitializeEphemeralAta + InitializeGlobalVault, then fund it.

// 3) Delegate the eATA (DelegateEphemeralAta, discriminator `4`) via CPI:
let mut data = vec![4]; // DelegateEphemeralAta
if let Some(validator) = validator {
    data.extend_from_slice(validator.as_ref());
}
let instruction = Instruction {
    program_id: EPHEMERAL_SPL_TOKEN_PROGRAM_ID,
    accounts: vec![
        AccountMeta::new(payer.key(), true),
        AccountMeta::new(ephemeral_ata.key(), false),
        AccountMeta::new_readonly(EPHEMERAL_SPL_TOKEN_PROGRAM_ID, false),
        AccountMeta::new(buffer.key(), false),
        AccountMeta::new(record.key(), false),
        AccountMeta::new(metadata.key(), false),
        AccountMeta::new_readonly(delegation_program.key(), false),
        AccountMeta::new_readonly(system_program.key(), false),
    ],
    data,
};
invoke(&instruction, &account_infos)?;

// 4) PDA-signed transfer inside the rollup (seeds = [POOL_SEED, bump]):
let bump_seed = [pool_bump];
let signer_seeds: &[&[&[u8]]] = &[&[POOL_SEED, &bump_seed]];
let cpi_accounts = SplTransfer { from, to, authority: pool };
let cpi_ctx = CpiContext::new_with_signer(token_program.to_account_info(), cpi_accounts, signer_seeds);
token::transfer(cpi_ctx, amount)?;

// 5) Commit & undelegate:
MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
    .commit_and_undelegate(&[ctx.accounts.pool.to_account_info()])
    .build_and_invoke()?;
```

> **Warning:** delegating a plain PDA-owned ATA directly to the ER is **not supported** - custody on
> the ER goes through an eATA. To delegate program *state* (not tokens), use the `#[delegate]` macro.

**Post-commit payout** (tokens stay on base):

```rust
MagicIntentBundleBuilder::new(
    payer_pda.to_account_info(),
    magic_context.to_account_info(),
    magic_program.to_account_info(),
)
    .magic_fee_vault(magic_fee_vault.to_account_info())
    .commit(&[state_pda.to_account_info()])
    .add_post_commit_actions([action])
    .build_and_invoke_signed(&[payer_seeds])?;
```

> **Security:** the post-commit handler is a normal base-layer instruction anyone can call. Because
> it signs transfers with your PDA, it **must authenticate the caller** - require the injected
> `escrow` account as a `signer` pinned to `ephemeral_balance_pda_from_payer(escrow_auth, 255)`, and
> bind `escrow_auth` to your paying PDA.

Reference examples: `binary-prediction` (eATA custody end-to-end), `rewards-delegated-vrf`
(base-layer post-commit payouts), `spl-tokens` (non-custody transfers).

---

## 18. Private Payments

Private use-case on top of Ephemeral SPL tokens: same deposit/transfer/withdraw primitive with
**private visibility**, shielding amount, destination, and timing.

### 18.1 Privacy model

- **Private visibility** - transfers execute inside the ER and are not broadcast publicly.
- **Stealth handles** - send to a human-readable name (`alice@magicblock.id`) that resolves to one
  or more destination keys via a **stealth pool**, breaking the sender → recipient link.
- **Queued settlement** - private transfers can settle through a transfer queue.

> Privacy reduces **linkability**, not total observability. Amounts and timing may still be
> inferable at the network level - threat-model your assumptions.

### 18.2 Auth (challenge/login)

1. `GET /v1/spl/challenge` → a message to sign.
2. `POST /v1/spl/login` with `{ pubkey, challenge, signature }` → bearer `token`.
3. `Authorization: Bearer <token>` on `GET /v1/spl/private-balance` and `POST /v1/spl/stealth-pool`.

### 18.3 Transfers

- `POST /v1/spl/transfer` with `visibility: "private"`.
- **Direct** destination: recipient public key, `visibility: "private"`.
- **Stealth handle** destination: an initialized handle string, `visibility: "private"`,
  `fromBalance: "base"`, `toBalance: "base"`.

Initialize a handle: `POST /v1/spl/stealth-pool` maps a handle (≤255 UTF-8 bytes, **not normalized**,
so `Alice@…` ≠ `alice@…`) to 1-10 destination keys, optionally splitting payments.
`GET /v1/spl/stealth-pool?handle=…` returns **only whether the pool exists - never the keys**.

### 18.4 Fees & gasless

`visibility` (routing) and `gasless` (who pays gas) are independent fields. Every private
base → base transfer pays a **0.1% (10 bps) privacy fee**, charged **in the transferred token**.

| | Self-paid | Gasless (`gasless: true`) |
| --- | --- | --- |
| SOL tx fee | sender pays (needs SOL) | sponsor pays (sender needs no SOL) |
| Relay fee | none | flat 0.2 USDC/USDT to the sponsor |
| 0.1% privacy fee | yes, in tokens | yes, in tokens |
| Minimum amount | none | 0.5 USDC/USDT |
| Supported mints | any | mainnet USDC/USDT, devnet USDC |

- The sponsor becomes the fee payer and co-signs; the API prepends a token-transfer instruction
  reimbursing the sponsor.
- Below-minimum or unsupported-mint gasless requests → `400` (`INVALID_GASLESS_TRANSFER_AMOUNT` /
  `INVALID_GASLESS_TRANSFER_MINT`). The API never changes the requested `visibility`.
- `gasless` is ignored when `from` is an off-curve PDA owner.
- A first private transfer may include a one-time ~`0.00204 SOL` rent to set up the eATA. Token fees
  → `fees.tokens`; SOL costs → `fees.lamports`.

### 18.5 Hosted REST API (route catalog)

Builder endpoints return an **unsigned transaction** payload plus a `sendTo` (`base`/`ephemeral`).
Sign it and submit via `POST /v1/transaction/send` or your own RPC.

```json
{
  "kind": "deposit",
  "version": "legacy",
  "transactionBase64": "base64-encoded-transaction",
  "sendTo": "base",
  "recentBlockhash": "blockhash",
  "lastValidBlockHeight": 284512337,
  "instructionCount": 3,
  "requiredSigners": ["3rXKwQ1kpjBd5tdcco32qsvqUh1BnZjcYnS5kYrP7AYE"]
}
```

| Route | Purpose | Auth |
| ----- | ------- | ---- |
| `GET /v1/spl/challenge` | challenge string for the wallet to sign | - |
| `POST /v1/spl/login` | signed challenge → bearer token | - |
| `POST /v1/transaction/send` | submit a signed transaction | - |
| `POST /v1/spl/deposit` | unsigned deposit (`private: true` to keep the balance private) | - |
| `POST /v1/spl/transfer` | unsigned public/private transfer | optional (PER) |
| `POST /v1/spl/withdraw` | unsigned withdrawal | - |
| `POST /v1/spl/undelegate-ephemeral-ata` | undelegate a wallet's eATA for a mint | - |
| `POST /v1/spl/initialize-mint` | init a validator-scoped transfer queue for a mint | - |
| `POST /v1/spl/transfer-queue-ensure-crank` | verify the transfer queue + force one crank | - |
| `GET /v1/spl/balance` | base-chain SPL balance | - |
| `GET /v1/spl/private-balance` | ephemeral-rollup SPL balance | **required** |
| `GET /v1/spl/is-mint-initialized` | has a validator-scoped transfer queue on the ER RPC | - |
| `POST /v1/spl/stealth-pool` | handle → 1-10 destination keys | **required** |
| `GET /v1/spl/stealth-pool` | handle pool existence check | - |
| `GET /v1/spl/quote` | swap quote between two mints | - |
| `POST /v1/spl/swap` | unsigned swap (public pass-through or private) | - |
| MCP | stateless Streamable HTTP MCP endpoint | - |

Canonical reference: `payments.magicblock.app/reference`.

---

## 19. Private Ephemeral Rollup (PER) & Access Control

High-performance, general-purpose **TEEs** on Solana using Intel **TDX** combined with ER
technology. Apps become simultaneously **Confidential, Scalable, Composable, and Compliant**.
Unlocks confidential transfers, sealed-bid auctions, and secure identity flows.

### 19.1 TEE model

- Every account is public by default (like Solana); programs explicitly define access rules.
- The TEE protects ER state from interference even by the machine running it.
- TEE is *practical confidentiality*: near-native performance vs FHE (extremely slow), ZK (heavy
  proving), MPC (latency/coordination).

### 19.2 Access Control (`EphemeralPermission`)

`EphemeralPermission` accounts **live entirely on the ER**, paid for by the delegated PDA - **no
base-layer permission account to create, delegate, or commit-and-undelegate**. Three CPI ops cover
the lifecycle - **Create**, **Update**, **Close** - all PDA-signed by the data account on the ER via
the Permission Program [`ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1`](https://explorer.solana.com/address/ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1). Only the data account is
delegated (base layer, via Delegation Program [`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`](https://explorer.solana.com/address/DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh)).

**Member flags** (combine with bitwise OR):

| Flag | Allows |
| ---- | ------ |
| `AUTHORITY_FLAG` | update/delegate permission settings, add/remove members, update flags |
| `TX_LOGS_FLAG` | view transaction execution logs |
| `TX_BALANCES_FLAG` | view account balance changes |
| `TX_MESSAGE_FLAG` | view transaction message data |
| `ACCOUNT_SIGNATURES_FLAG` | view account signatures |

```rust
use ephemeral_rollups_sdk::access_control::structs::{
    Member, AUTHORITY_FLAG, TX_LOGS_FLAG, TX_BALANCES_FLAG, TX_MESSAGE_FLAG, ACCOUNT_SIGNATURES_FLAG,
};

let flags = AUTHORITY_FLAG | TX_LOGS_FLAG;
let mut member = Member { flags, pubkey: user_pubkey };
let is_authority = (member.flags & AUTHORITY_FLAG) != 0;
member.set_flags(TX_BALANCES_FLAG);  // add
member.remove_flags(TX_LOGS_FLAG);   // remove
```

Pinocchio variants use `ephemeral_rollups_pinocchio::types::{Member, MemberFlags}`.
TS variants use the same flag constants in `@magicblock-labs/ephemeral-rollups-sdk` (+ kit helpers
`isAuthority`, `canSeeTxLogs`, `canSeeTxBalances`, `canSeeTxMessages`, `canSeeAccountSignatures`).

**Lifecycle (on the ER, all PDA-signed by the delegated data account):**

1. **Create** - `CreateEphemeralPermissionCpi` with `EphemeralMembersArgs { is_private, members }`.
   Idempotent: `if ctx.accounts.permission.lamports() > 0 { return Ok(()); }`.
2. **Update** - `UpdateEphemeralPermissionCpi` toggles `is_private` and rewrites the member list
   (rebuild the full list every call, including the authority, so the PDA can never lock itself out).
3. **Close** - `CloseEphemeralPermissionCpi` refunds rent to the data PDA.

```rust
use ephemeral_rollups_sdk::access_control::{
    instructions::{CreateEphemeralPermissionCpi, UpdateEphemeralPermissionCpi, CloseEphemeralPermissionCpi},
    structs::{EphemeralMembersArgs, Member, TX_LOGS_FLAG, TX_MESSAGE_FLAG, TX_BALANCES_FLAG},
};

// PDAs sign via seeds:
let signers = [COUNTER_SEED, ctx.accounts.counter.authority.as_ref(), &[ctx.bumps.counter]];

// Create (start public; flip later)
CreateEphemeralPermissionCpi {
    payer: ctx.accounts.counter.to_account_info(),
    permissioned_account: ctx.accounts.counter.to_account_info(),
    permission: ctx.accounts.permission.to_account_info(),
    vault: ctx.accounts.ephemeral_vault.to_account_info(),
    magic_program: ctx.accounts.magic_program.to_account_info(),
    permission_program: ctx.accounts.permission_program.to_account_info(),
    args: EphemeralMembersArgs { is_private: false, members: vec![] },
}.invoke_signed(&[&signers])?;

// Update (private: only the authority can read via TEE)
let members = if is_private {
    vec![Member { flags: TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG, pubkey: ctx.accounts.counter.authority }]
} else { vec![] };
UpdateEphemeralPermissionCpi {
    payer: ctx.accounts.counter.to_account_info(),
    permissioned_account: ctx.accounts.counter.to_account_info(),
    permission: ctx.accounts.permission.to_account_info(),
    vault: ctx.accounts.ephemeral_vault.to_account_info(),
    magic_program: ctx.accounts.magic_program.to_account_info(),
    permission_program: ctx.accounts.permission_program.to_account_info(),
    authority: ctx.accounts.counter.to_account_info(),
    authority_is_signer: false, // PDA signs via the seeds above
    args: EphemeralMembersArgs { is_private, members },
}.invoke_signed(&[&signers])?;

// Close (refund rent to the data PDA)
CloseEphemeralPermissionCpi {
    payer: ctx.accounts.counter.to_account_info(),
    permissioned_account: ctx.accounts.counter.to_account_info(),
    permission: ctx.accounts.permission.to_account_info(),
    vault: ctx.accounts.ephemeral_vault.to_account_info(),
    magic_program: ctx.accounts.magic_program.to_account_info(),
    permission_program: ctx.accounts.permission_program.to_account_info(),
    authority: ctx.accounts.counter.to_account_info(),
    authority_is_signer: false,
}.invoke_signed(&[&signers])?;
```

**Security rules:**

- Only members with `AUTHORITY_FLAG` (or the program owning the permissioned account) can authorize
  changes.
- Setting members to `None` makes the account publicly visible.
- By default the owner of the permissioned account is added as an authority.
- An **empty member list** + private ⇒ the account is fully restricted; only the owner can modify it.
- Rent formula for pre-funding: `rent = ~32 lamports/byte × (size + 60)`; use
  `EphemeralPermission::size_of(N)` for the exact byte count.
- Reference implementations: `private-counter/anchor`, `private-counter/pinocchio`.
- Requires SDK **v0.14+**. Older SDKs → `00-LEGACY_EXAMPLES` in the examples repo.

### 19.3 PER quickstart flow

1. **Write your program** as normal (`#[ephemeral]`).
2. **Delegate + create permission** - `delegate` on base; `init_permission` on the ER (delegated PDA
   signs and pays its own ephemeral rent, pre-funded at initialize); `set_privacy` toggles;
   `close_permission` refunds; `undelegate` via `MagicIntentBundleBuilder`.
3. **Deploy** on Solana (`anchor build && anchor deploy`).
4. **Authorize** - verify TEE integrity via [https://pccs.phala.network/tdx/certification/v4](https://pccs.phala.network/tdx/certification/v4), then
   `getAuthToken`.
5. **Execute & test privacy** - send requests to [https://devnet-tee.magicblock.app?token={token}](https://devnet-tee.magicblock.app?token={token}).

```typescript
import { verifyTeeRpcIntegrity, getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";

const isVerified = await verifyTeeRpcIntegrity(EPHEMERAL_RPC_URL);
const token = await getAuthToken(EPHEMERAL_RPC_URL, wallet.publicKey,
  (message: Uint8Array) => Promise.resolve(nacl.sign.detached(message, wallet.secretKey)));

const erProvider = new anchor.AnchorProvider(
  new anchor.web3.Connection(`https://devnet-tee.magicblock.app?token=${token.token}`, {
    wsEndpoint: `wss://devnet-tee.magicblock.app?token=${token.token}`,
    commitment: "confirmed",
  }),
  anchor.Wallet.local(),
);
```

> `verifyTeeRpcIntegrity` checks a real TDX attestation - **skip it when running fully local**
> (the QFS has no hardware attestation).

### 19.4 Compliance framework

Private ERs are **not open anonymity rails** - enforced boundaries:

- **Jurisdiction & network access** - node-level IP geofencing; OFAC-sanctioned/restricted
  jurisdictions blocked at ingress before any tx is accepted or executed.
- **Real-time AML & sanctions screening** - continuous screening via **Range** (sanctions lists,
  exposure/counterparty risk, behavioral signals); failing txs are rejected/halted pre-execution.
- **EULA & licensed deployments** - instances run under MagicBlock Labs licensing; different
  licenses can forbid illicit use cases.

### 19.5 PER local development (QFS)

In production the ER runs in a TDX TEE; clients reach it through a **token-gated TEE endpoint** that
enforces privacy + compliance at ingress. Locally, that ingress is emulated by the **Query Filtering
Service (QFS)** in front of a normal local ephemeral validator - the only structural difference.

Topology (four processes):

```
User <--> QFS (6699/6700) <--> ER (7799/7800) <--> Base Solana (8899/8900)
```

| Process | RPC/WS | Role |
| ------- | ------ | ---- |
| `mb-test-validator` | 8899/8900 | Base layer (pre-clones delegation + permission programs) |
| `ephemeral-validator` | 7799/7800 | The ER |
| `query-filtering-service` | 6699/6700 | **PER-specific** TEE ingress emulation |
| `vrf-oracle` (optional) | - | only if the program uses VRF |

```bash
npm install -g @magicblock-labs/ephemeral-validator@latest
mb-stack --reset            # starts all three services on the default ports
anchor build && anchor deploy --provider.cluster localnet

# Per-service (equivalent):
mb-test-validator --reset
ephemeral-validator --lifecycle ephemeral --remotes http://127.0.0.1:8899 --remotes ws://127.0.0.1:8900 --listen 127.0.0.1:7799 --reset
RUST_LOG=info query-filtering-service \
  --listen-addr 127.0.0.1:6699 --listen-addr-ws 127.0.0.1:6700 \
  --ephemeral-url http://127.0.0.1:7799 --ephemeral-url-ws ws://127.0.0.1:7800 \
  --token-expiry-days 180 --add-cors-headers   # --add-cors-headers required for browser apps
```

- Point clients at the **QFS (6699)** to test privacy; at the **ER (7799)** directly when you don't
  need the privacy layer.
- Client: `TEE_PROVIDER_ENDPOINT = http://localhost:6699`, same auth flow (sign challenge → token →
  `?token=...`). When a PDA is private, the QFS blocks any wallet not in the member list.
- Delegate to the **localnet identity** [`mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev`](https://explorer.solana.com/address/mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev).
- Env vars: see [§11.4](#114-endpoint-env-vars-canonical).

---

## 20. Session Keys

Scoped, expiring secondary signers for frequent interactions - **not burner wallets**. Eliminate
repeated wallet popups. Program: [`KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5`](https://explorer.solana.com/address/KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5) (originally by Gum).

### 20.1 Two components

1. **Ephemeral keypair** - stored client-side (encrypted, browser IndexedDB), the secondary signer.
2. **Session token** - a PDA with **expiry and scope** on-chain.

Lifecycle: generate keypair → encrypt/store → create session token PDA (authority, scope, expiry) →
every tx presents the ephemeral signer + session token → target program validates authority/expiry/
scope → on expiry, regenerate; on revocation, the PDA is closed and lamports returned.

### 20.2 Security model

- Analogy: **JWT tokens adapted to web3** - expiry + scope + revocation.
- Worst-case exposure is limited to the ephemeral keypair and its topped-up funds (~0.01 SOL).
- Paired with a gasless relay (e.g. Octane) and `topUp: false`, the 0.01 SOL risk can be eliminated.
- Browser is adversarial (XSS, extensions); use the same scoping/revocation discipline as web2 JWTs.

### 20.3 Program integration

```toml
[dependencies]
session-keys = { version = "3.1.1", features = ["no-entrypoint"] }
```

```rust
use session_keys::{SessionError, SessionToken, session_auth_or, Session};
```

- Context fields: `#[account(seeds = [SIGNED_MSG_SEED, session_token.key().as_ref()], bump)] signer:
  Signer<'info>`, `session_token: Account<'info, SessionToken>` (or `has_one = authority`), and a
  `session_account`.
- Use `session_auth_or!(ctx, id, session_authority)` to authorize the session signer.
- Client SDK: `@magicblock-labs/gum-react-sdk` (`useSessionKeyManager`, `SessionWalletProvider`,
  `useSessionWallet`), React `<SessionProvider>` (must be a **child** of the wallet-adapter context).
- Test helper: `@session-keys/anchor` (`createSessionToken`).

Local testing with the Session Keys program:

```bash
solana program dump KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5 ./session-keys.so
solana-test-validator -ud --clone KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5 -r --bpf-program KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5 ./session-keys.so
```

---

## 21. Native Rust / Pinocchio Programs

Native Rust programs skip Anchor and use the SDK's CPI functions directly. Example:
[magicblock-engine-examples/tree/main/counter/native-rust](https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/counter/native-rust).

```rust
use solana_program::entrypoint;
use ephemeral_rollups_sdk::cpi::{delegate_account, DelegateAccounts, DelegateConfig, undelegate_account};
use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

// Delegate:
let delegate_accounts = DelegateAccounts {
    payer: &payer,
    pda: &pda,
    owner_program: &owner_program,
    buffer: &buffer_pda,
    delegation_record: &delegation_record_pda,
    delegation_metadata: &delegation_metadata_pda,
    delegation_program: &delegation_program,
    system_program: &system_program,
};
delegate_account(delegate_accounts, &[COUNTER_SEED], DelegateConfig::default(), &[])?;

// Commit (foldable build then invoke):
let bundle = MagicIntentBundleBuilder::new(payer, magic_context, magic_program);
bundle.commit(&[pda.to_account_info()]).build_and_invoke()?;

// Undelegate:
undelegate_account(delegate_accounts, &[COUNTER_SEED], &[])?;
```

Pinocchio programs use `ephemeral_rollups_pinocchio` (`cpi::DelegateAccounts` etc.). Build & deploy:

```bash
cargo build-sbf
solana config set --url localhost
solana program deploy YOUR_PROGRAM_PATH
```

Also available natively: **delegation actions** (post-delegation instructions the ER validator runs
automatically inside the rollup). Build standard `Instruction`s, convert with `.cleartext()`
(public) - encrypted actions are built off-chain by a client holding the validator key - and CPI with
`delegate_account_with_actions` (the `#[delegate]` macro still provides buffer/record/metadata).

---

## 22. Testing on Magicblock

`anchor test --skip-build --skip-deploy --skip-local-validator` runs against the endpoints in env
vars, or the defaults below:

| Var | Default |
| --- | ------- |
| `PROVIDER_ENDPOINT` | [https://api.devnet.solana.com](https://api.devnet.solana.com) |
| `EPHEMERAL_PROVIDER_ENDPOINT` | [https://devnet-as.magicblock.app/](https://devnet-as.magicblock.app/) |
| `EPHEMERAL_WS_ENDPOINT` | [wss://devnet-as.magicblock.app/](wss://devnet-as.magicblock.app/) |

### Test suite conventions

- **Delegation confirms on base before the ER clones an account** - poll the ER view
  (`waitForErTokenAccount`, or check the account owner is the Delegation Program) before sending ER
  transactions.
- **After an ER `undelegate`, wait for `GetCommitmentSignature` + `confirmTransaction`** before any
  base-layer action that depends on the committed state (withdraw, payout).
- One **undelegate per transaction** per owner (SPL); other accounts can be batched.
- Keep **delegation/undelegation/dispatch txs on the correct layer**: delegation on **base**,
  ER-side instructions on the **ER/Router** connection, actions/handlers on **base**.
- Local only: skip `verifyTeeRpcIntegrity` (no hardware attestation in the QFS).
- Test vector style - precompute expected account states (order books, balances, fees, sequence
  numbers) and assert exact post-state after each instruction.

---

## 23. Architecture Playbooks & Templates

Reference templates in the examples repo: `oracle-priced-purchase`, `onchain-dice`,
`binary-prediction`, `sealed-bid-auction`.

### 23.1 Prediction markets & trading - component mapping

| Protocol requirement | MagicBlock feature |
| -------------------- | ------------------ |
| Frequent orders/bets/position updates | **Ephemeral Rollups** |
| Restricted position/strategy visibility | **Private Ephemeral Rollups** |
| Repeated actions without wallet prompts | **Session Keys** |
| Collateral, custody, pool liquidity, payouts | **Ephemeral SPL Token** |
| Prices and liquidation inputs | **Pricing Oracle** |
| Expiry, liquidation, settlement checks | **Cranks** |
| Base-layer payout after ER commit | **Magic Actions** |

### 23.2 Reference architecture (6 steps)

1. **Initialize durable market state** on Solana - market config, authorities, collateral mint,
   base-layer custody accounts. Administrative controls and settlement records stay on L1.
2. **Delegate latency-sensitive state** - position/order/bet accounts to the ER; use a PER
   (TEE) when contents or participants must be restricted.
3. **Authorize repeated user actions** - scope a session key to protocol instructions/duration/
   limits. SPL Token doesn't understand session tokens, so token movement may need a one-time
   approval to a constrained program authority.
4. **Fund custody and execute** - deposit collateral into the Global Vault; use program-controlled
   eATAs when funds must move at ER speed; read the oracle inside each price-sensitive instruction.
5. **Automate time-sensitive checks** - crank expiry/liquidation/settlement; make every scheduled
   instruction safe to retry and validate state before changing it.
6. **Commit and settle** - commit while staying delegated, or commit-and-undelegate at market close;
   use a **Magic Action** when the commit must trigger a base-layer payout.

### 23.3 Custody models

| Model | Best for | Trade-off |
| ----- | -------- | --------- |
| **Program-controlled eATA custody** | Stakes/collateral/payouts moving repeatedly on the ER | Requires the eATA lifecycle + explicit withdrawal handling |
| **Base-layer custody + post-commit payout** | Funds that should stay in normal ATAs until settlement | Token movement waits for commit; base custody stays authoritative |

### 23.4 Production checklist

Oracle freshness/confidence/failure behavior · collateral/exposure/liquidation rules · max
position/exposure/utilization limits · liquidity + payout reserves under worst-case moves · fees,
rounding, and integer-overflow boundaries · crank failure, retry, and manual-recovery paths · commit
frequency + authoritative state during settlement · emergency pause/close-only/controlled unwind ·
PER only when restricted visibility is a protocol requirement - **privacy does not replace solvency,
oracle validation, or authorization checks**.

### 23.5 Finance use case

Real-time settlement, full transparency, seamless composability. Example:
[https://github.com/magicblock-labs/real-time-pricing-oracle](https://github.com/magicblock-labs/real-time-pricing-oracle) (live: [https://pyth-template.magicblock.app/](https://pyth-template.magicblock.app/)).

---

## 24. Security & Audits

| Program | ID | Auditor | Report |
| ------- | -- | ------- | ------ |
| Delegation Program | [`DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`](https://explorer.solana.com/address/DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh) | **Halborn** | [github.com/magicblock-labs/delegation-program/tree/429f86fd56f5e8956cf132da0063b971346f6c67/security_audits](https://github.com/magicblock-labs/delegation-program/tree/429f86fd56f5e8956cf132da0063b971346f6c67/security_audits) |
| Solana VRF | [`Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`](https://explorer.solana.com/address/Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz) | **Zenith** | [github.com/magicblock-labs/solana-vrf/blob/main/security_audits/2025-08-06 VRF Program Audit Report by Zenith.pdf](https://github.com/magicblock-labs/solana-vrf/blob/main/security_audits/2025-08-06 VRF Program Audit Report by Zenith.pdf) |
| Permission Program (base-layer) | [`BTWAqWNBmF2TboMh3fxMJfgR16xGHYD7Kgr2dPwbRPBi`](https://explorer.solana.com/address/BTWAqWNBmF2TboMh3fxMJfgR16xGHYD7Kgr2dPwbRPBi) | TBC | - |

Security best practices recap:

- **Magic Actions / post-commit handlers** must authenticate via the injected `escrow` signer
  (see [§13.2](#132-the-action-caveat-read-before-building)).
- **VRF callbacks** must use `#[vrf_callback]` and pin `VRF_PROGRAM_IDENTITY`.
- **Custody**: never delegate a plain PDA-owned ATA; use eATAs; PDA-sign transfers with your seeds;
  gate all PDA-signed value movement behind caller authentication.
- **Permissions**: keep `AUTHORITY_FLAG` on at least one member; grant least privilege; update lists
  atomically; close/undelegate unused accounts to free SOL.
- **Shared fee payers** need spending + rate limits.
- Fresh top-up salt per top-up (hash collision on reuse).

---

## 25. Troubleshooting

### Deployment / setup

| Symptom | Fix |
| ------- | --- |
| `Address lookup table` / tx too large | Route on the ER (64 KB), or shrink/ALT on base (1,232 B). |
| Missing validator in delegation | Always pass the specific ER validator identity (see §2.2). |
| Undelegation never finalizes | Program account must be built with `#[ephemeral]` so the callback discriminator `[196, 28, 41, 206, 48, 37, 51, 167]` + processor exist. |
| Commit 11 fails | `0xA0000000` - add a delegated fee payer + `magic_fee_vault`. |
| `InsufficientFunds` on commit | Fee payer can't cover the charge; top up (base layer, fresh salt). |

### Magic Actions

| Symptom | Fix |
| ------- | --- |
| Handler not executing | Verify the instruction discriminator; allocate sufficient `compute_units` in `CallHandler`. |
| Deserialization errors | Use `UncheckedAccount` for committed accounts in the action context; `try_deserialize` manually. |
| Transaction failures | List all action accounts in `ShortAccountMeta`; match `is_writable`; raise compute budget. |
| Handler drains funds when called directly | Add the `escrow` signer + `escrow_auth` pin (see §13.2). |

### SPL tokens

| Symptom | Fix |
| ------- | --- |
| `InvalidAccountOwner` on withdraw | Withdraw before the commit lands races the commit - wait for `GetCommitmentSignature` first. |
| Vault was created twice / wrong path | Keep `idempotent` consistent across `delegateSpl`/`undelegateIx`/`withdrawSpl` in one lifecycle. |
| `INVALID_GASLESS_TRANSFER_AMOUNT/MINT` (400) | Transfer below 0.5 USDC/USDT or an unsupported mint with `gasless: true` - lower amount or drop `gasless`. |
| Gasless silently not applied | `from` is an off-curve PDA - gasless requires a wallet sender. |

### Cranks / VRF

| Symptom | Fix |
| ------- | --- |
| Stale account data after scheduling CPI | Use `AccountInfo` (not `Account<T>`) in the scheduling context. |
| VRF callback never fires | Pass the correct queue constant for your environment (`DEFAULT_*_QUEUE`); run a local `vrf-oracle` on both base + ER for local tests. |
| Callback spoofable | Mark the context `#[vrf_callback]` and pin `VRF_PROGRAM_IDENTITY` with `#[account(address = ...)]`. |

### Local / QFS

| Symptom | Fix |
| ------- | --- |
| QFS connection refused | Wait for port `6699` to accept a connection before firing requests. |
| CORS errors in browser | Start QFS with `--add-cors-headers`. |
| `verifyTeeRpcIntegrity` fails locally | Expected - no hardware attestation; skip the check when running fully local. |
| Commits don't settle locally | Delegate to the localnet identity [`mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev`](https://explorer.solana.com/address/mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev). |

---

## 26. FAQ

**Can delegated accounts be created on the ER?** No. They must exist on Solana first; they are
cloned after being requested or used in an ER transaction.

**Can programs be delegated?** No. Program accounts are never delegated - they are cloned when a
transaction is submitted on an ER and subscribed for updates thereafter. Only state accounts.

**Can delegated accounts compose with all Solana programs?** Yes. Every account on Solana is
readable on the ER; only delegated accounts can be changed on the ER within an atomic transaction.

**Are compute/account limits the same on the ER?** Mostly yes - 200k CU/instruction, 1.4M
CU/transaction (via `SetComputeUnitLimit`), 10 MiB accounts. The exception: transaction size is
**64 KB on the ER** vs 1,232 bytes on base.

**Should developers rely on slot time?** No. ~400 ms (base) vs ~10 ms (ER) as of 2026-08, but slot
times are **not guaranteed** and may change. Avoid logic depending on slot duration.

**Do delegates have to pay gas?** No - normal ER transactions are free in the current release.
Delegation sessions and commits are charged from a refundable base-layer deposit at undelegation.

**Can I run TDX locally?** No - the QFS emulates the TEE ingress (token auth + permission
filtering) without hardware attestation.

**Is privacy total?** No - it reduces linkability; amount/timing may still be inferable
network-level.

---

## 27. Related Files

- `README.md` - magiCLOB product spec + architecture (repo root).
- `docs/ARCHITECTURE.md`, `docs/SDK.md`, `docs/MATCHING_ENGINE.md` - magiCLOB design docs.
- `magiclob-scalp/anchor/programs/magiclob/` - the Anchor program to be built per this guide.
- `magiclob-scalp/sdk/` - `@magiclob/sdk` TypeScript client.

---

*Compiled from the official MagicBlock docs (docs.magicblock.gg) - all addresses, seeds, constants,
snippets, and commands reproduced verbatim from the source. Index: [https://docs.magicblock.gg/llms.txt](https://docs.magicblock.gg/llms.txt)*