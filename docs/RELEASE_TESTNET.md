# Keyless testnet deployment and release run

Run on 6 November 2026, 03:35–03:44 UTC, on NEAR testnet with valueless test assets only. Everything was created fresh for this run. The previous release deployment and its records are kept in [`releases/release-20261105/`](releases/release-20261105/).

## Deployment

| Role | Account |
|---|---|
| Escrow | `escrow.at-rel-owner-mw4f9xmq.testnet` |
| Test token (testUSD) | `testusd.at-rel-owner-mw4f9xmq.testnet` |
| Sputnik DAO | `alltogether-mw4f9nmo.sputnikv2.testnet` |
| DAO council (single member) | `at-rel-council-mw4f9nmo.testnet` |
| Creator, token initial supply | `at-rel-owner-mw4f9xmq.testnet` |
| Contributors | `alice.at-rel-owner-mw4f9xmq.testnet`, `bob.at-rel-owner-mw4f9xmq.testnet` |
| Beneficiaries | `venue.…`, `equipment.…`, `access.at-rel-owner-mw4f9xmq.testnet` |

**The escrow and the token have no access keys.** Each was created, funded, deployed and initialized in one transaction with no AddKey action ([escrow](https://testnet.nearblocks.io/txns/2aawQQojN5pQfPr42jtDXZTfYMgadyH18uTREy55Gd2a), [token](https://testnet.nearblocks.io/txns/97yDkmrvh9amNGeD8L9Z66P8i2sW3j6EnkhLKAgzetEx)). Nobody can change their code, and the escrow has no owner or admin methods. The setup script checks that both access-key lists are empty.

| Artifact | Bytes | SHA-256 | Code hash |
|---|---:|---|---|
| Escrow | 247,749 | `b6adf23a9f3bcc080787943147108d428cb0a4f16eb232a8db01d5fdb5b7c5e7` | `DJ73KDw8fE818kYrR9CVMztonGUnv8nn4475fpdV21pS` |
| Test token | 174,930 | `7d6caab3eeac77685b2b6e385e265b9c6daed02edc2af120698a5a929da3d514` | `9Sc4vjKHWKwB7BYVPRzsfzkiHS9NhebDCM459Yz4fgqy` |

These are the same WASM files as the previous deployment, so the code hashes are unchanged. The new DAO was [created through the `sputnikv2.testnet` factory](https://testnet.nearblocks.io/txns/87FmePFU9nx3d8p19fzpDxmUV8p1PbTAFMXa2FLZ7GKE) with the council as its only member.

## What the run did

52 finalized transactions, all recorded in [`qa-release-testnet.json`](qa-release-testnet.json), failures included.

- **Contributors got tokens on their own.** Alice and Bob each tried the public faucet before registering (rejected), registered, claimed exactly 1,000 testUSD, and were rejected on a second claim.
- **The DAO was funded** with 800 testUSD from the token's initial supply.
- **Bad input was rejected on chain.** A plan naming the escrow as its own beneficiary failed with `ESCROW_BENEFICIARY_FORBIDDEN` and left no state behind.
- **Each plan was sponsored through a real DAO vote.** The council created a `FunctionCall` proposal (IDs 0 and 1) and approved it, which transferred the 400 testUSD matching reserve into the escrow. Approval alone did not open the plan; the transfer did.
- **Overfilled and late pledges were returned** by the token's resolver, with nothing used.
- **A failed payout was recovered.** The equipment beneficiary was left unregistered on purpose. Its payout failed, the callback restored the 250 testUSD credit, and after registration a new attempt paid exactly once.

| Plan | Pledges per budget | Result |
|---|---|---|
| 1, incomplete | 400 / 125 / 50 testUSD | Failed. No beneficiary paid; Alice refunded 525 and Bob 50; the DAO's 400 returned |
| 2, complete | 400 / 125 / 75 testUSD | Succeeded. Beneficiaries paid 600 / 250 / 150 together, including the recovered payout |

At the end, 1,975 testUSD had been accepted and 1,975 paid. Custody, credits and pending transfers were all zero, and the app's Live testnet reader reported the books as `Matched`.

## Records

| File | Contents |
|---|---|
| `qa-release-testnet-setup.json` | Faucet accounts, DAO creation, keyless contract deployment, metadata and checks |
| `qa-release-testnet-config.json`, `testnet-config.json` | Public binding: account IDs, expected code hashes, artifact hashes. Key files are referenced by slot name only |
| `qa-release-testnet.json` | All 52 transactions with full outcomes, the two scenarios and the final accounting |
| `qa-release-testnet-progress.json` | Progress log written after every action |
| `qa-release-testnet-review.json` | Independent read-only recheck of the DAO proposals, the paid credits and the artifact hashes |
| `testnet-dao.json` | The new DAO's code hash, policy and config |
| `qa-release-testnet-faucet-*.json` | Faucet responses for the council, owner and bank accounts |

To run the same flow on another fresh setup, use a checkout with no `docs/qa-release-testnet-progress.json` and an empty `.secrets/`:

```sh
node scripts/qa-release-testnet.mjs setup
node scripts/qa-release-testnet.mjs flow
node scripts/qa-release-testnet-review.mjs
```

The scripts refuse to replay a completed run or to repeat an unresolved submission. Generated keys go to the ignored `.secrets/` folder and never appear in the records.
