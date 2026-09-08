# MagiCLOB Core Invariants

These invariants define the MVP contract boundary. Any instruction that changes market, book, trader, or vault state must preserve them.

## Identity and authorization

- Every trader PDA is derived from `trader`, market, and owner.
- Every order-book PDA is derived from `order_book` and market.
- A trader owner must sign delegation, trading, modification, cancellation, deposit, and withdrawal operations.
- Delegation does not grant application authority; normal signer, PDA, and owner checks still apply.
- Every maker account supplied for settlement must be the exact trader PDA for the maker and market.

## Order-book invariants

- Every active order belongs to exactly one market and one side.
- Every active order appears exactly once in the corresponding linked pool.
- Sequence numbers are unique within a market and increase monotonically.
- Orders at a better price precede worse prices.
- Orders at the same price preserve ascending sequence order.
- A filled or cancelled order is not active and cannot match again.
- A modification cannot increase quantity or change price without explicit cancel-and-replace semantics.
- A market-order remainder never rests on the book.

## Balance and settlement invariants

- A trader's base and quote balances never become negative.
- Maker and taker deltas conserve traded base and quote value, except for explicitly accounted fees.
- Maker settlement consumes exactly one account for every non-taker maker delta.
- Unexpected, duplicate, or missing maker settlement accounts reject the entire instruction.
- Withdrawals cannot exceed the trader's settled/deposited entitlement and vault custody.
- Failed settlement reverts the complete match.

## Validation invariants

- Quantity is nonzero, above minimum size, and aligned to lot size.
- Limit prices are nonzero and aligned to tick size.
- Integrator fees do not exceed the market cap.
- Expiration timestamps use Unix seconds consistently.
- Fee arithmetic and balance arithmetic use checked operations.
