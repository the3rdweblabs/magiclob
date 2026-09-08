# MagiCLOB SDK Reference

`@magiclob/sdk` - TypeScript client for magiCLOB (`sdk/`). This reference
documents the public surface exactly as shipped.

## Package exports

`@magiclob/sdk` re-exports everything from `client`, `sdk`, `accounts`,
`instructions`, `codec`, `errors`, `pda`, `types`, and `constants`.

```ts
import MagiCLOBSDK, { MagiCLOBClient } from "@magiclob/sdk";
```

## Quick start

```ts
import MagiCLOBSDK from "@magiclob/sdk";

const sdk = MagiCLOBSDK.devnet(); // base + Magicblock devnet router
const market = sdk.market(BASE_MINT, QUOTE_MINT);
const { bestBid, bestAsk, spread } = await sdk.getTopOfBook(market);

await sdk.initializeMarket({ ... }, [payer]);       // creates market/book/vault
await sdk.registerTrader({ ... }, [owner]);          // creates TraderState
await sdk.deposit({ ... }, [owner]);                 // custody -> vault
await sdk.delegateSession({ market, owner }, [owner, payer]); // opens ER session
await sdk.placeLimitOrder({ market, owner, price, qty, clientOrderId, isBid, makers }, [owner]);
await sdk.settleAndUndelegate({ market, owner }, [owner, payer]); // commit + undelegate
```

`MagiCLOBSDK.mainnet()` uses mainnet-beta + `router.magicblock.app`.

## Clients and options

| Constructor | Options |
| ----------- | ------- |
| `new MagiCLOBSDK(options \| MagiCLOBClient)` | `MagiCLOBSDKOptions = MagiCLOBClientOptions` |
| `MagiCLOBSDK.devnet(options)` | `{ connection?, ephemeralConnection?, programId?, commitment? }` |
| `MagiCLOBSDK.mainnet(options)` | same |
| `new MagiCLOBClient(options)` | `MagiCLOBClientOptions` |

Defaults: connection `api.devnet.solana.com` / `api.mainnet-beta.solana.com`,
ephemeral connection `devnet-router.magicblock.app` / `router.magicblock.app`,
commitment `confirmed`.

`MagiCLOBClient` keeps the base and ephemeral connections side by side:

- `connection` / `ephemeralConnection` / `programId` / `commitment`.
- `hasEphemeral` - true when an ER endpoint is configured.
- `connectionFor(layer)` - throws with a clear message if the ER is unconfigured.
- `send(ixs, signers, layer, feePayer?)` - signs, sends, confirms; rethrows
  program errors as `MagiCLOBError`.
- `sendOnBase` / `sendOnEphemeral`, `simulate(ixs, payer, layer?)`,
  `getAccountInfo(address, layer?)`, `onAccountChange(address, cb, layer?)`.

## Layer routing

`Layer = "base" | "ephemeral"`.

- **Base layer:** `initializeMarket`, `registerTrader`, `initializeVaultAccounts`,
  `deposit`, `withdraw`, `delegateSession`; `getMarket`, `getTrader`, `getVault`,
  `isDelegated`.
- **ER (default when configured):** `placeLimitOrder`, `placeMarketOrder`,
  `cancelOrder`, `modifyOrder`, `bulkBatchOrders`, `settleAndUndelegate`; plus
  `getOrderBook`, `getDepth`, `getTopOfBook`, `getOpenOrders`, `watchOrderBook`,
  `resolveMakers`.

Explicit layer overrides are available on every trading write and read. The
book defaults to the ER during a session because base-layer copy is stale.

## Address helpers (SDK)

| Method | Returns |
| ------ | ------- |
| `addresses(baseMint, quoteMint)` | `{ market, orderBook, vault, vaultBaseToken, vaultQuoteToken }` |
| `market(baseMint, quoteMint)` | `MarketState` PDA |
| `orderBook(market)` | `OrderBookState` PDA |
| `trader(market, owner)` | `TraderState` PDA |
| `vault(market)` | `VaultState` PDA |

Low-level PDA builders live in `pda.ts`: `marketPda`, `orderBookPda`,
`traderPda`, `vaultPda`, `vaultBaseTokenPda`, `vaultQuoteTokenPda`, `stakePda`,
`delegationBufferPda` (owned by magiCLOB), `delegationRecordPda`,
`delegationMetadataPda` (owned by the Delegation Program), and
`delegationAccountsFor(account)` which bundles all three.

## Reads

| Method | Description |
| ------ | ----------- |
| `getMarket(market, layer?)` | Decoded `MarketState` or `null`. Default base. |
| `getOrderBook(market, layer?)` | Decoded `OrderBookState` (raw slot pools) or `null`. Default ER if configured. |
| `getTrader(market, owner, layer?)` | Decoded `TraderState` or `null`. Default base. |
| `getVault(market, layer?)` | Decoded `VaultState` or `null`. Default base. |
| `getDepth(market, layer?)` | `{ bids: PriceLevel[], asks: PriceLevel[] }`, best-first. |
| `getTopOfBook(market, layer?)` | `{ bestBid, bestAsk, bidQty, askQty, spread }`. |
| `getOpenOrders(market, owner, layer?)` | Every live `OrderNode` owned by `owner`. |
| `isDelegated(market, owner)` | `trader.status === Delegated` on the base layer. |
| `resolveMakers(market, isBid, qty, limitPrice?, layer?)` | `PublicKey[]` of makers an order would cross - pass as `makers`; a **snapshot** (reverts with `UnexpectedMakerAccount` if the book moved). |
| `watchOrderBook(market, cb, layer?)` | Returns an unsubscribe function; decodes snapshots on change. |

Note the `OrderBookState` aggregated view comes from
`accounts.depth(book)`, `topOfBook(book)`, `ordersByOwner(book, owner)`, and
`makersForOrder(book, isBid, qty, limitPrice)` in `accounts/`.

## Writes

All writes return `TransactionSignature` and take `(params, signers[])`;
`feePayer` defaults to `signers[0]`.

| Method | Params | Layer | Notes |
| ------ | ------ | ----- | ----- |
| `initializeMarket` | `InitializeMarketParams` | base | Creates market, book, vault. |
| `registerTrader` | `RegisterTraderParams` | base | `payer` may differ from `owner`; optional `baseEndowment` / `quoteEndowment`. |
| `initializeVaultAccounts` | `InitializeVaultAccountsParams` | base | Idempotent; creates the VaultState-PDA-owned vault base/quote token accounts. |
| `deposit` | `VaultTransferParams` | base | `baseAmount`/`quoteAmount`; both default `0n`. |
| `withdraw` | `VaultTransferParams` | base | Requires sufficient `deposited_*` entitlement. |
| `delegateSession` | `DelegateSessionParams` | base | Delegates trader **and** shared book; optional `payer` (sponsor) and `validator` pin. |
| `settleAndUndelegate` | `SettleAndUndelegateParams` | ER | Commit + release delegation lock. |
| `placeLimitOrder` | `PlaceLimitOrderParams` | ER/base | See order params below. |
| `placeMarketOrder` | `PlaceMarketOrderParams` | ER/base | IOC; remainder never rests. |
| `cancelOrder` | `CancelOrderParams` | ER/base | By `(market, owner, isBid, clientOrderId)`. |
| `modifyOrder` | `ModifyOrderParams` | ER/base | Reduce only; `newPrice` must be `0n` (keep) or equal. |
| `bulkBatchOrders` | `BulkBatchOrdersParams` | ER/base | Atomic; `orders.length <= MAX_BATCH_SIZE` (16). |

### Order params

- `placeLimitOrder`: `{ market, owner, price, qty, clientOrderId, isBid,
  integratorFeeBps?, timeInForce?, selfMatchingOption?, expireTimestamp?,
  makers? }`.
- `makers` is required for anything that can cross resting liquidity: passing
  `resolveMakers(...)` output makes the transaction atomic. Too few -> 
  `MakerAccountMissing`; too many -> `UnexpectedMakerAccount`.
- `expireTimestamp` is **Unix seconds**; the SDK defaults it to `NO_EXPIRY`
  (`u64::MAX`). Passing `0n` means "already expired" - never use it for "no
  expiry".
- Enums: `TimeInForce` (GTC 0, IOC 1, FOK 2, PostOnly 3), `SelfMatchingOption`
  (Allowed 0, CancelTaker 1, CancelMaker 2), `OrderSide` (Bid 0, Ask 1),
  `MarketStatus`, `TraderStatus`.

### Value types

Prices are quote-units-per-base-unit, quantities are base units, all `bigint`
(raw on-chain units) - never `number`, to avoid precision loss above 2^53.

## Instruction builders (`instructions/`)

`createInitializeMarketInstruction`, `createRegisterTraderInstruction`,
`createInitializeVaultAccountsInstruction`, `createDepositInstruction`,
`createWithdrawInstruction`,
`createDelegateSessionInstruction`, `createPlaceLimitOrderInstruction`,
`createPlaceMarketOrderInstruction`, `createCancelOrderInstruction`,
`createModifyOrderInstruction`, `createBulkBatchOrdersInstruction`,
`createSettleAndUndelegateInstruction`. Each builds a `TransactionInstruction`
from `(params, programId?)`. Discriminators and account order match the IDL
verbatim (`shared.ts`).

## Errors

- `MagiCLOBErrorCode` enum - every custom error from `errors.rs`, numbered
  6000..6052 (Anchor base).
- `MagiCLOBError` - `{ code, name, logs, cause }`, `toString()` renders
  `code name: message`.
- `parseMagiCLOBError(err)` -> `MagiCLOBError | null` (handles parsed Anchor
  errors, raw `InstructionError.Custom`, and hex log tags).
- `rethrowMagiCLOBError(err)` - throws typed error for magiCLOB failures,
  rethrows everything else untouched.

Example: `catch (e) { if (e instanceof MagiCLOBError) { e.is(MagiCLOBErrorCode.UnexpectedMakerAccount) } }`.

## Constants

`MAGICLOB_PROGRAM_ID`, `DELEGATION_PROGRAM_ID`,
`MAGIC_PROGRAM_ID` (`Magic1111...`), `MAGIC_CONTEXT_ID`,
`TOKEN_PROGRAM_ID`, `SEEDS`, `DELEGATION_SEEDS`, `ENDPOINTS`,
`NO_EXPIRY` (`2^64 - 1`), `MAX_BATCH_SIZE` (16).

## Coverage gaps vs the on-chain program

The SDK wraps 11 of the program's instruction groups. Not yet exposed:

- `stake`, `unstake`, `claim_rebates`
- `submit_proposal`, `vote`, `execute_proposal`
- `borrow_flashloan_base` / `borrow_flashloan_quote`
- `return_flashloan_base` / `return_flashloan_quote`

Raw builders can reach them via the IDL account lists if needed, but the typed
params/types do not exist yet.

## Known discrepancies to resolve

- `MAX_ORDERS_PER_SIDE` is `64` in `sdk/src/constants.ts` but `13` in the
  program (`engine/order_types.rs`). Treat `13` as authoritative; the SDK
  constant should be updated to match.
- The IDL on disk (`sdk/src/idl/magiclob.json`) is the generated snapshot; if
  the program ABI changes, regenerate it before treating SDK types as current.