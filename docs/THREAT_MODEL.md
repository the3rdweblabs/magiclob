# MagiCLOB MVP Threat Model

## Trust boundaries

- **Base Solana:** durable account creation, token custody, delegation initiation, and final recovery boundary.
- **Public Ephemeral Rollup:** low-latency execution for delegated public state.
- **Private Ephemeral Rollup:** optional confidentiality boundary; privacy requires PER/TEE configuration and authenticated routing, not only `#[ephemeral]`.
- **Client/SDK:** untrusted input and transaction construction layer.
- **Router/RPC:** routing and observation infrastructure, not an application authorization layer.

## Actors

- Trader and trader owner.
- Maker and taker.
- Market authority.
- Integrator receiving configured fees.
- Session payer or sponsor.
- Malicious client supplying remaining accounts.
- Malicious or stale RPC/router endpoint.
- Faulty, delayed, or unavailable ER/commit service.

## Primary threats

1. Unauthorized delegation or trading using another trader's PDA.
2. Wrong market, mint, vault, or trader account passed into an instruction.
3. Missing, duplicate, or unexpected maker accounts during settlement.
4. Negative balances or unbacked internal balances.
5. Arithmetic overflow in notional, fees, or cumulative statistics.
6. Price-time priority violation through unsafe modification.
7. Infinite or oversized matching loops and transaction account exhaustion.
8. Replaying client order IDs or acting on inactive orders. *(Accepted residual
   risk: `client_order_id` uniqueness is not enforced at placement - a trader
   can rest multiple orders with the same id, and cancel/modify only target the
   first matching entry. The trader can only affect their own orders.)*
9. Base/ER state divergence during delegation, commit, or undelegation.
10. False privacy assumptions when using a public ER instead of PER/TEE.
11. Stale or incorrect validator/ER endpoint selection.
12. Token custody mismatch between SPL accounts and internal ledgers.
13. Commit-cap exhaustion: a session exceeding the 10-commit limit with no
    delegated fee payer reverts trading commits (`0xA0000000`) mid-session.
    The final `commit_and_undelegate` always works, so this is degraded
    availability, not trapped state - but prolonged sessions must configure the
    fee-payer path in advance.
14. Shared-book session lock: the market-wide `OrderBookState` is delegatable
    by any trader; while a session is open the base-layer book is unwritable.
    A stalled or never-undelegated session is a market-wide availability risk.
    *(Accepted residual risk: no settlement cadence or timeout is enforced
    on-chain - only the trader owner/agent can unsettle, and the final
    `commit_and_undelegate` always works, so the failure mode is degraded
    availability, not trapped funds.)*
15. Improperly created vault token accounts: a wrong-mint or wrong-owner
    custody account would strand deposits or route funds into an account the
    program cannot transfer out of. `initialize_vault_accounts` mitigates this
    by deriving the two custody PDAs from `[b"vault", market, base|quote]`,
    binding each mint to the market's stored `base_mint`/`quote_mint`, setting
    each token account's owner to the `VaultState` PDA `[b"vault", market]`
    (matching the `deposit`/`withdraw` constraints), and treating any
    pre-existing account as a no-op only after verifying its token program,
    mint, and owner.

## Security assumptions

- The Solana token program and MagicBlock delegation programs are external dependencies.
- MagicBlock delegation changes lifecycle/ownership routing; it does not replace application authorization.
- PER confidentiality is an integration property that requires permission setup, endpoint authentication, and attestation policy.
- The contract cannot make a client-side RPC private or correct.

## Required evidence before release

- Anchor and SBF builds pass.
- Unit, account-level, rollback, and integration tests pass.
- Every threat above has a test or documented accepted residual risk.
- External audit receives this file, `INVARIANTS.md`, pinned source, and deployment configuration.
