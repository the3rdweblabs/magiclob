# magiCLOB Documentation

Deep-dive documentation for the magiCLOB program, its SDK, and the Security
review material. The top-level [README](../README.md) is the entry point; these
docs hold the detail.

## Index

| Document                                                       | Covers                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                          | System overview, account model, custody, ER session lifecycle, routing |
| [MATCHING_ENGINE.md](./MATCHING_ENGINE.md)                    | Slot-pool book, priority ordering, execution algorithm, fees, settlement |
| [SDK.md](./SDK.md)                                            | `@magiclob/sdk` reference: exports, routing, instructions, decoders, errors |
| [SECURITY_MODEL.md](./SECURITY_MODEL.md)                      | Authorization, custody, lifecycle, privacy, known release blockers   |
| [THREAT_MODEL.md](./THREAT_MODEL.md)                          | MVP threat catalogue with mitigations and accepted residual risks    |
| [INVARIANTS.md](./INVARIANTS.md)                              | Balance, settlement, and order-book invariants the tests enforce     |
| [AUDIT_SCOPE.md](./AUDIT_SCOPE.md)                            | What an external review should cover                                 |

## Reading order

1. `ARCHITECTURE.md` - how the layers split and what lives where.
2. `MATCHING_ENGINE.md` - the core ordering and matching logic.
3. `SDK.md` - how to call it all from TypeScript.
4. `SECURITY_MODEL.md` + `THREAT_MODEL.md` - trust boundaries and threats.
5. `INVARIANTS.md` + `AUDIT_SCOPE.md` - what must stay true and what to audit.

## Maintenance

- Claims here are expected to track the source of truth (the Anchor program in
  `contracts/`, the SDK in `sdk/`, and the Magicblock platform references in
  `../MAGICBLOCK.md`).
- Program id, fee numbers, and deployment facts are reconciled against the
  live devnet deployment:
  [`DSMktdhdDAGgittEg88wqrh2AJmNq6oj2YDnNnmeKeQe`](https://explorer.solana.com/address/DSMktdhdDAGgittEg88wqrh2AJmNq6oj2YDnNnmeKeQe?cluster=devnet).
- Update the affected doc, not just the README, whenever the program changes.