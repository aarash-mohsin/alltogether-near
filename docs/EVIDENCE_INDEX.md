# Evidence index

What each file in `docs/` shows. Every transaction listed in these files is on NEAR testnet and can be looked up on [testnet.nearblocks.io](https://testnet.nearblocks.io). Several of the files are also read or written by the app and the scripts, so they stay at these paths.

There were two deployments, both on 5 November 2026:

- **Release deployment (current).** `escrow.at-rel-owner-mw3qu2g0.testnet` and `testusd.at-rel-owner-mw3qu2g0.testnet`. The app and the README point here.
- **First deployment (historical).** `escrow.at-mw3kqf0k.testnet`. Replaced after the review fixes, because the new token could not be upgraded over the old token's state. Its records are kept unchanged.

Both use the same Sputnik DAO, `alltogether-mw3kfemk.sputnikv2.testnet`, which has a dedicated single-member test council.

## Start here

| File | What it shows |
|---|---|
| [RELEASE_TESTNET.md](RELEASE_TESTNET.md) | The release deployment and its 51-transaction run: DAO sponsorship, one failed and one successful plan, refunds, payouts and a recovered failed payout |
| [RELEASE_WALLET_QA.md](RELEASE_WALLET_QA.md) | The browser wallet controller signing real testnet transactions through an SDK wallet adapter, and checks that an old receipt can't confirm a new request |
| [SECURITY.md](SECURITY.md) | Trust boundaries and what the prototype does not protect against |
| [NEAR.md](NEAR.md) | Contract interface, token and DAO integration, and the testnet scripts |

## Release deployment (machine records)

| File | What it shows |
|---|---|
| `testnet-config.json` | Release binding: account IDs, expected code hashes, artifact SHA-256 values. Read by the server |
| `qa-release-testnet-config.json` | The same binding as used by the release run; lists key-file slot names only, never key values |
| `qa-release-testnet-setup.json` | Account creation, atomic deploy and initialization, token metadata and storage quote |
| `qa-release-testnet.json` | Every one of the 51 finalized transactions with full outcomes, checks and final balances |
| `qa-release-testnet-progress.json` | Progress log written after each action, so an interrupted run can be resumed without double-sending |
| `qa-release-testnet-review.json` | Independent read-only recheck of the DAO proposals, all six paid credits and the artifact hashes |
| `qa-release-testnet-faucet-bank.json`, `qa-release-testnet-faucet-owner.json` | Testnet faucet responses that funded the run |

## Wallet controller (machine records)

| File | What it shows |
|---|---|
| `qa-wallet-controller.json` | First controller run (12 transactions). It stopped partway when the public RPC became unavailable and was then resumed from its saved state |
| `qa-wallet-controller-success.json` | Completed controller run (10 transactions) |
| `qa-wallet-controller-journal.json`, `qa-wallet-controller-success-journal.json` | The browser's saved operation journals from those runs |
| `qa-wallet-controller-reverification.json` | Replay check: an older matching receipt is rejected for a newer request |
| `qa-wallet-controller-operation-reverification.json` | All 17 signed operations re-checked against the final timestamp and hash rules |
| `qa-wallet-controller-final-audit.json` | Final read-only audit: balances, counts and zero outstanding liabilities |
| `qa-wallet-controller-final-audit-pre-timestamp-guard.json` | The same audit before the timestamp rule was added, kept for comparison |

## First deployment (historical)

| File | What it shows |
|---|---|
| `deployment-escrow.json`, `deployment-token.json` | Deploy and initialization of the first escrow and token. Read by the server |
| `testnet-create-*.json` | Account creation for the escrow, token and three beneficiaries |
| `testnet-dao.json` | The Sputnik DAO's code hash, policy and council |
| `testnet-dao-creation.json` | DAO creation call; the receipt itself was not captured, see the note inside |
| `testnet-native-topup.json` | A native NEAR top-up transfer |
| `testnet-scenario.json`, `testnet-scenario-progress.json` | The first end-to-end scenario on the first deployment |
| `releases/original-20261105/` | Copies of the first deployment's config and scenario, taken before the release binding replaced them |
| [EVIDENCE.md](EVIDENCE.md) | Narrative of that first cycle |

## Design and review notes

| File | What it covers |
|---|---|
| [STORAGE.md](STORAGE.md) | How storage is priced and bounded |
| [RELEASE_CORE.md](RELEASE_CORE.md), [RELEASE_UI.md](RELEASE_UI.md), [RELEASE_OPERATIONS.md](RELEASE_OPERATIONS.md) | Changes made after review: accounting core, the two workspaces, backup and restore |
| [ASTRA_RELEASE_REVIEW.md](ASTRA_RELEASE_REVIEW.md), [ASTRA_FINAL_GATE.md](ASTRA_FINAL_GATE.md) | The two review passes, their findings and how each was fixed |
| `integration-status.json` | Which integration levels were reached (source, tests, WASM, testnet). Read by the server |

Fresh-install, restore, dependency and browser checks are in [`../release-qa/`](../release-qa/).
