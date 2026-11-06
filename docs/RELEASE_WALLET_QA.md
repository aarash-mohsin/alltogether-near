# Actual wallet-controller testnet QA

**Passed:** 22 actual finalized transactions and 19 controller operation records. Fresh verification through the final production timestamp/hash guards passed for all 17 current signed controller operations, including the real `Returned` pledge and successful beneficiary payment. Final pinned-block audit: **276401260**, **2026-11-05 22:13:21 UTC**.

The integration uses the exported `NearTransactionController`, its default finalized-transaction reader, actual `createNearReader` snapshots, and a near-api-js 7.4 SDK signing adapter for generated faucet accounts. It does **not** exercise an external wallet application's approval interface.

## Persisted evidence

- `qa-wallet-controller.json`: full actual transactions, requests, controller operations, checkpoints and interruption/recovery evidence for campaign 3.
- `qa-wallet-controller-journal.json`: persisted controller local-storage contents, including the response-loss operation.
- `qa-wallet-controller-success.json`: 10 actual transactions and 6 operation records; campaign 4 resolver return and successful settlement, status `passed`.
- `qa-wallet-controller-success-journal.json`: separate followup controller operation journal.
- `qa-wallet-controller-operation-reverification.json`: full freshly fetched actual receipts and final-guard classification for all 17 signed controller operations, retaining each original `createdAt`; status `passed`.
- `qa-wallet-controller-reverification.json`: original pledge revalidation, older-receipt rejection and replay guards.
- `qa-wallet-controller-final-audit.json`: final balances/custody at one actual final block, all transaction finality, evidence and tested source/binding SHA-256 hashes; status `passed`.
- `qa-wallet-controller-final-audit-pre-timestamp-guard.json`: preserved earlier ledger audit before all-operation timestamp revalidation.

The deployment IDs/code pins match `qa-release-testnet-config.json`; the current public binding is `docs/testnet-config.json`, using the explicitly approved official Intear testnet RPC. Only generated project faucet credentials were loaded. No private credential is written to evidence.

## Verified behavior

1. Wallet error 4001 before dispatch produces `Cancelled`, zero signed sends, and no registration.
2. Actual token registration and once-per-account public faucet mint 1,000 testUSD through the controller.
3. Controller publishes immutable campaign 3 and creates Sputnik proposal 4. The exact returned proposal ID, proposer and FunctionCall payload were compared before the dedicated council approved it.
4. Actual 20 testUSD pledge finalized, then the SDK adapter deliberately threw before returning the receipt. The controller persisted `Unknown` across a new instance, blocked a second intent, and reconciled the captured actual transaction hash to `Succeeded` without another signed send or token debit.
5. Controller removal of 5 testUSD created a fixed withdrawal credit, subsequently paid through the controller.
6. The fixed public FastNEAR endpoint returned HTTP 429 during snapshot bursts. Signing safely stopped. Campaign 3 reached its real deadline underfunded and was finalized `Failed`; this is retained as a real failure, never rewritten as successful execution.
7. After the production reader gained a paced/retrying transport and the fixed default changed to the explicitly approved Intear testnet endpoint, the actual controller materialized and claimed the remaining contributor refund of 15 testUSD and sponsor refund of 50 testUSD. Campaign 3 accepted 70 and paid 70 testUSD, with every principal/credit/pending field zero. The full escrow then reconciled accepted 2,045 = paid 2,045 testUSD and observed custody zero; the tester was restored to 1,000 testUSD. This first evidence file contains 12 actual transactions and 13 controller operation records.

8. Campaign 4 published through the controller with a fresh real 600-second deadline. A further exact returned proposal/action was reviewed before council approval. After the controller accepted 15 testUSD, a fresh reviewed snapshot showed 35 remaining. Bob's real 35 testUSD pledge filled the leg, then the tester's reviewed 35 attempt finalized with token resolver zero. The controller classified this as `Returned`, and the tester's token balance remained 985 testUSD.
9. Waited the genuine campaign 4 deadline without clock changes. Controller finalization was `Succeeded`; the fixed venue beneficiary then received exactly 100 testUSD through the controller. Accepted 100 = paid 100, with every principal/credit/pending field zero.
10. A fresh process imported the final production controller and default reader, fetched all 17 actual signed-operation receipts again, and classified them against their original requests and `createdAt`. Every verified execution timestamp was at or after the original intent, with no clock-skew tolerance; the smallest margin was **316,243,111 ns**. Each execution block was later than its reviewed snapshot block, each saved transaction hash belonged to one current operation, and the original cancelled operation had no transaction hash. No chain writes were performed during this revalidation.

## Exact final ledgers

All token quantities below are testUSD, with six decimals on chain.

| Scope | Accepted | Confirmed paid | Principal, credits and pending transfers |
|---|---:|---:|---:|
| Campaign 3, failed | 70 | 70 | 0 |
| Campaign 4, succeeded | 100 | 100 | 0 |
| Whole escrow, including prior canonical QA | 2,145 | 2,145 | 0 |

Observed escrow custody, book residual and cash liabilities were all **zero**. Tester balance was **985**, Bob **765**, DAO **350**. Generated Bob retained **0.282147027206396499999988 testnet NEAR**, above the authorized 0.05 minimum. Both campaign ledgers and these balances were independently read at one actual final block.

Actual returned pledge: `FogANRJ7KEZTNyND3usUtideuMVxcQQ2piZp4vfsAzvU`. Successful finalization: `FJHXMLExEiYeWbjL4AwTESvdsjc2Au4smxAEnqr3xrUR`. Beneficiary payout: `9EqCpNxkmT5H4TBu3szcDVNhp2x7n1tBoA96upkMiBJT`. Full real receipt bodies remain in the evidence.

Only generated project testnet funds were used. Owner storage/bond preparation required 2.262075830676708600000006 testnet NEAR in total: 1.9499553634875 from the existing dedicated bank and 0.312120467189208600000006 from generated Bob. Both full transfer receipts are persisted; the Bob remainder was explicitly authorized and bounded below 0.35, and combined funding below 3. One additional generated faucet-bank request returned HTTP 429, with an eight-hour limit; no repeated faucet request, cooldown bypass, or additional account creation was attempted.

The updated production default reader independently reverified the original response-loss pledge using Intear: reviewed block 276366044, execution block 276366052, exact accepted amount 20 testUSD. The actual matching receipt was rejected when checked against a newer reviewed intent. Existing-evidence replay guards for both initial and followup modes were exercised locally and preserved evidence byte-for-byte. See `qa-wallet-controller-reverification.json`.

The final default reader validates testnet chain identity, finalized execution, actual signer/receiver/method/arguments/gas/deposit, execution height after the reviewed block, and actual verified execution timestamp at or after the original intent. All 17 current signed operations passed that final reader/classifier in a fresh process. Recovery and successful campaign execution used the default production snapshot and transaction readers with no injected transport. Full snapshots took roughly 30–36 seconds in this environment.

## Commands and replay safety

Run from the AllTogether directory with Node 24:

```powershell
node --check scripts/qa-wallet-controller.mjs
node scripts/qa-wallet-controller.mjs --audit-completed
```

The audit signs nothing, preserves transaction evidence, re-fetches/classifies the 17 current signed operations and then checks exact balances/custody at one actual final block. It expects this recorded fixture to remain unchanged. The initial and followup mutation paths refuse existing result files; checkpoint recovery requires the exact saved state. Do not delete evidence and blindly replay against already-used faucet accounts. A new mutation run requires fresh dedicated actors/binding and a separately preserved evidence destination. The first file's `partial-recovered` status preserves that run's genuine interruption; the combined final audit is `passed`.

This passes actual controller/SDK/contract integration. External wallet UI approval, hosting and mainnet deployment remain separate checks and are not claimed by this report. No personal wallet or mainnet asset was accessed.
