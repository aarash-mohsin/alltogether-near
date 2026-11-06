# AllTogether verification evidence

> Historical first-cycle evidence below. Post-Astra release fixes, new deployments and current QA are recorded in the `RELEASE_*.md` documents in this folder and [workspace reproducibility QA](../release-qa/REPRODUCIBILITY.md). Earlier receipt/account/hash claims apply to their original artifacts.

Verification date: 5 November 2026. This record distinguishes local software, native unit tests, compiled source and public testnet execution.

## Commands actually completed

- `node scripts/test.mjs`: **21 passed, 0 failed** after the refund-discovery, complete-export and Unicode-boundary fixes.
- `node scripts/build.mjs`: both TypeScript configurations passed; Vite production build passed. Assets were emitted under `dist/web/`.
- Native Rust contract suite: **15 escrow tests plus 1 token test passed**. The contract agent also reran its tightened independent accounting reconstruction test suite successfully. Details are in NEAR.md and STORAGE.md.
- `cargo near build non-reproducible-wasm --no-abi`: both genuine WASM artifacts built. Escrow 241,056 bytes, SHA-256 `432c27a2904d56101455b97f4b727fa4c1f7fa12c387845e74d602704a3731e6`; token 149,895 bytes, SHA-256 `0029d87fc2c33ab53d61800a8c45cd60503a2cf5c55d173cdcd90c4b39d8b66f`.
- `node scripts/scenario.mjs`: actual local API execution passed incomplete-plan exact refunds, successful-plan payouts, token-registration failure/retry and custody reconciliation.
- Server stopped through its owned execution session and restarted against the same SQLite file. The saved mobile-authored plan, Alice's recovered balance and reconciled custody were re-read successfully.

## Public NEAR testnet

Actual dedicated faucet accounts were generated for this exercise; no existing user wallet was accessed. A factory-created Sputnik DAO was verified through its code hash, configuration and actual policy. Its deployed factory required a 5.39679 NEAR minimum creation deposit; a rejected 4 NEAR attempt was corrected to 6 NEAR. Creation's decoded empty return was initially saved without a full transaction receipt; it is not presented as creation-transaction evidence. The DAO's subsequent genuine proposal and execution receipts are recorded in the scenario evidence.

- [DAO configuration and policy](testnet-dao.json).
- [Escrow deployment and initialization](deployment-escrow.json).
- [Test token deployment and initialization](deployment-token.json).
- [Complete testnet scenario](testnet-scenario.json), including actual transaction hashes, receipt outcomes, approved proposals, closing campaign state and accounting.

`node scripts/testnet-scenario.mjs` passed on the public testnet:

1. A 400 testUSD reserve was funded through an actual Sputnik proposal and council approval.
2. Canonical incomplete contributions 400/125/50 caused zero beneficiary entitlements; exactly 575 testUSD contributor principal and 400 testUSD sponsor reserve were returned.
3. Canonical complete contributions 400/125/75 produced 600/250/150 beneficiary credits and successful payments.
4. Overfill and late contributions were rejected and returned through the actual NEP-141 token resolver, confirmed by before/after token balances.
5. An unregistered equipment recipient caused a real outgoing-token failure; the contract restored its credit, registration was completed and retry paid exactly once.
6. Outstanding book liabilities reconciled with observed token custody after each quiescent scenario.

The deployments retain dedicated full-access testnet keys for development and are not audited or immutable. No mainnet or sandbox-node execution is claimed. The browser UI is local; CLI testnet evidence is separately identified.

## Browser verification actually observed

The in-app browser loaded the live Vite/SQLite application. Organizer sponsorship request, DAO approval, exact reserve funding, Alice's 400 testUSD venue pledge and deadline finalization were exercised through real controls. The missing remaining budgets yielded failure. After fixing refund discovery, My funds exposed the 400 principal, materialized its credit and paid it, restoring Alice's balance from 2,825 to 3,225 testUSD.

The browser's viewport override did not change the native surface size, so no mobile claim relies on it. A development-only 360px iframe harness at `tests/integration/responsive.html` supplied a real narrow layout viewport. Its document client and scroll widths both measured 345px (the 360px frame includes its vertical scrollbar), proving no horizontal overflow. A one-budget plan was authored, reviewed, published and observed in this frame. Desktop views, account selector, dialogs, custody and refund controls were also visually inspected.

## Review and corrections

Independent source inspection found no blocking fund-loss, authorization, immutable-recipient or callback defect in the inspected paths; this is not a professional security audit. Review found complete-export truncation at 50 attempts and local/Rust validation drift; both were corrected and regression-tested. Browser QA found failed-principal discovery missing from My funds; it was corrected and the actual refund path verified.
