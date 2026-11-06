# Release gate

Final checks before publishing, completed 6 November 2026. Scope: the local app and the valueless NEAR testnet deployment. This is not a mainnet approval or a formal security audit.

## Completed checks

| Check | Result |
|---|---|
| Review passes (see `docs/ASTRA_*.md`) | Initial and final review. One P1 found in the final review (an older receipt could confirm a newer identical request); fixed, and the fix was checked by reproducing the original case |
| Application test suite | 63 passed, 0 failed or skipped |
| Rust contract tests | 17 escrow + 5 token passed |
| Strict TypeScript and production build | Passed |
| Fresh frozen install and production start | Passed |
| Backup and restore with stopped services, hashes checked | Passed |
| Production JavaScript advisory audit | 0 advisories |
| Rust advisory scope | Two advisories remain in host, test and build tooling only, not in the deployed WASM; unmaintained allocator removed. See [DEPENDENCIES.md](DEPENDENCIES.md) |
| Contract deployment | Fresh release escrow and token, real Sputnik DAO flows, 51-transaction release scenario |
| Keyless redeploy (6 Nov) | Same WASM redeployed to new accounts with no access keys, with a new DAO; the full release scenario passed again (52 transactions, 1,975 testUSD accepted = 1,975 paid) and the 63 app tests pass against the new binding. See `docs/RELEASE_TESTNET.md` |
| Wallet controller on testnet (previous deployment) | 22 finalized transactions; all 17 signed operations re-checked against the final height, timestamp and hash rules |
| On-chain books (previous deployment) | 2,145 testUSD accepted = 2,145 paid; custody, credits and pending all zero |
| Browser fault recovery | A lost response after a committed pledge, then a reload, resumed the same request with no double debit; stale data and account switching handled |
| Narrow screens | Real 360px frame: no horizontal page overflow |

Source and artifact SHA-256 values for the checked release are in [FINAL_SOURCE_MANIFEST.json](FINAL_SOURCE_MANIFEST.json). It was recorded before the project was put under Git. Files changed since then: the README and documentation, the testnet binding files for the redeploy, and `scripts/qa-release-testnet.mjs` (the testnet setup script, changed to create keyless contracts and a new DAO). The app, contract sources and WASMs are unchanged. Fresh-install and restore details are in [REPRODUCIBILITY.md](REPRODUCIBILITY.md); browser checks are in [BROWSER_RELEASE_QA.md](BROWSER_RELEASE_QA.md).

## Not covered

- **External wallet login and approval.** The wallet picker was opened and dismissed in the browser, but no real wallet was connected or used to approve a transaction. Signing was tested with the same controller through a dedicated SDK wallet adapter.
- Testnet records are history, not something to replay. Re-running the scenario needs a new dedicated testnet setup.
