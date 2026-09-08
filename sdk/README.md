# @magiclob/sdk

TypeScript client for **magiCLOB**, a price-time priority CLOB running on Solana
with Magicblock Ephemeral Rollup execution.

Dependency-light (only `@solana/web3.js`), browser-safe, no Anchor runtime.

```ts
import MagiCLOBSDK from "@magiclob/sdk";
import { Connection } from "@solana/web3.js";

// Base-layer client - every call lands on the base validator (see status note
// below about the Ephemeral Rollup path, which is not yet operational).
const sdk = new MagiCLOBSDK({ connection: new Connection("https://api.devnet.solana.com") });
const addresses = sdk.addresses(baseMint, quoteMint);

await sdk.initializeMarket(
  { authority, baseMint, quoteMint, takerFeeBps: 25, makerFeeBps: 5, integratorFeeBpsCap: 10, tickSize: 1n, lotSize: 1n, minSize: 1n },
  [authorityKeypair]
);

await sdk.placeLimitOrder(
  { market: addresses.market, owner, price: 100000n, qty: 100n, clientOrderId: 1n, isBid: true },
  [traderKeypair]
);

const { bestBid, bestAsk, spread } = await sdk.getTopOfBook(addresses.market);
```

## Installation

```sh
npm install @magiclob/sdk
```

## Layer routing

- **Base layer** - custody (deposit/withdraw), delegation, settlement, governance, staking.
- **Ephemeral Rollup (ER)** - order entry (limit/market/cancel/modify/batch) and the live order book, routed to the ER whenever an ephemeral connection is configured (`MagiCLOBSDK.devnet()` / `.mainnet()` bundle the Magicblock router as the ephemeral endpoint). Provide only a base `Connection` to keep every call on the base layer.

Trigger an explicit `layer` override to force a route. `settleAndUndelegate` is hard-wired to the ER.

> **Status: live on Solana devnet.** The program is deployed and upgraded at
> `DSMktdhdDAGgittEg88wqrh2AJmNq6oj2YDnNnmeKeQe`, with devnet markets
> (SOL/USDC, MAGIC/USDC) and real base-layer custody + trading fills confirmed.
> Order entry, `delegateSession`, `settleAndUndelegate` and the ER router are
> implemented in the SDK and compiled into the program. The contract takes the
> target ER validator from the delegation instruction's `remaining_accounts`,
> so routing works against MagicBlock's public devnet ER
> (`devnet-router.magicblock.app`, `devnet-as/eu/us.magicblock.app`). Base-layer
> flows are verified live; an end-to-end ER session (delegate → ER fills →
> `commit_and_undelegate`) is wired but not yet exercised on devnet - regard
> it as unproven until exercised, and verify ER behavior on the Surfpool sim
> (`npm run test:integration`).

## SDK surface

### High-level `MagiCLOBSDK`

- Addresses: `addresses`, `market`, `orderBook`, `trader`, `vault`
- Reads: `getMarket`, `getOrderBook`, `getTrader`, `getVault`, `getDepth`, `getTopOfBook`, `getOpenOrders`, `isDelegated`, `resolveMakers`, `watchOrderBook`
- Custody (base): `initializeMarket`, `initializeVaultAccounts`, `registerTrader`, `deposit`, `withdraw`, `delegateSession`, `settleAndUndelegate`
- Trading (ER when configured): `placeLimitOrder`, `placeMarketOrder`, `cancelOrder`, `modifyOrder`, `bulkBatchOrders`
- Staking: `stake`
- Flash loans: `borrowFlashLoanBase`, `borrowFlashLoanQuote`, `returnFlashLoanBase`, `returnFlashLoanQuote`
- Governance: `submitProposal`, `vote`, `executeProposal`

### Low-level

`create*Instruction` builders (one per instruction), PDA derivation
(`marketPda`, `orderBookPda`, ...), account decoders (`decodeMarketState`,
`decodeOrderBookState`, ...) and typed error helpers (`parseMagiCLOBError`,
`MagiCLOBError`, `MagiCLOBErrorCode`).

## Development

```sh
npm run build         # tsc -> dist/
npm test              # offline unit tests (encoding, PDAs, decoders)
npm run test:integration  # boots Surfpool, deploys the program, full lifecycle
```

## License

[GPL-v3](../LICENSE). Full text at the repository root.