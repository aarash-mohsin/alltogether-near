# AllTogether independent final release gate

> Parent integration addendum after the independent review: campaign 4 finalized successfully and paid its fixed beneficiary exactly 100 testUSD. The completed read-only audit verified 22 FINAL transactions and reclassified all 17 signed controller operations with the final default reader, original intent times and actual block timestamps; the smallest positive margin was 316,243,111 ns. Global accepted 2,145 = paid 2,145 testUSD with custody/rights/pending zero. See [RELEASE_WALLET_QA.md](RELEASE_WALLET_QA.md) and `qa-wallet-controller-operation-reverification.json`. This closes the integration rows described as pending at review time; it does not add external wallet approval coverage.

**Independent follow-up verification:** the reviewer inspected the completed JSON evidence, verified all nine recorded source/binding/evidence SHA-256 values against the current files, and reran the current production classifier over all 17 saved actual signed-operation outcomes. All matched their recorded final classifications; one pledge was Returned. The 22 saved transaction outcomes were FINAL, campaign 3 was Failed and campaign 4 Succeeded, and the recorded final custody/accounting reconciled to zero outstanding rights. Minimum execution-after-intent margin independently recomputed as 316,243,111 ns. This was an offline evidence check with zero RPC calls or chain mutations. The previously pending integration row is now closed.

Reviewed 6 November 2026. Scope is the reproducible local hackathon application and dedicated, valueless NEAR testnet integration. This is a bounded source/evidence review, not a security audit, mainnet approval, public hosting approval, or evidence of external wallet approval UI execution.

## Decision

**The inspected source now passes this bounded final correctness gate, with the material scope exceptions below.** The previous contract publication and local uncertain-write P1 defects are addressed. This review identified and reproduced one additional P1 in recovery of identical testnet transactions; the parent fixed it, and this reviewer independently inspected the correction and reran the affected tests. Actual existing-receipt timestamp reverification and campaign 4's successful completion are now supported by completed integration evidence and the independent offline follow-up above.

Apart from that finding, no additional P0/P1 was established in the inspected release paths. This statement does not close unexecuted browser, maximum-gas, or operational matrix cases. A scoped hackathon release can honestly present a working local application, live verified testnet workspace, and actual SDK-backed controller/contract execution, while retaining the scope exceptions below.

## FG-01 — P1: an older receipt can resolve a newer identical intent sharing a cached review block

At review start, `server/near.ts` cached a snapshot for ten seconds. `web/src/near-controller.ts` accepted a finalized matching transaction when its execution height exceeded `operation.reviewedAtBlock`; it neither compared execution time with the new operation's creation time nor reserved a transaction hash to one journal operation.

An earlier pledge can finalize after snapshot block 77 at block 78. A second identical pledge prepared against that still-cached snapshot also records block 77. If its wallet response is lost, pasting the earlier pledge hash passes the signer, receiver, arguments, gas, deposit, resolver amount, and height checks. The newer operation is incorrectly marked Succeeded and stops blocking another signature even though its actual outcome remains unknown. This can produce false acknowledgement and allow further unintended contributions. The contract's amount/capacity rules do not establish which browser intent a receipt belongs to.

This reviewer executed a deterministic, in-memory reproduction against the actual exported `classifyOutcome`, with distinct IDs and creation times but the same reviewed request/block and old receipt. Result:

```json
{"first":"Succeeded","newerUnknownUsingSameReceipt":"Succeeded","reviewBlock":"77","executionBlock":"78"}
```

Implemented correction: preserve the original operation identity/time; reject a transaction hash already assigned to another journal operation at both wallet-return and manual reconciliation; validate the execution block's actual timestamp and require it to be at or after this operation's creation time, as well as after the reviewed block. There is no clock-skew tolerance that admits a receipt predating the recorded intent. Missing/invalid timing or an execution time before the local recorded intent remains Unknown, with no automatic resign or force-clear. This intentionally prefers an inspectable unresolved operation over false success. This time comparison assumes a usable local clock; it is not a cryptographic timestamp of user intent. A stronger future wallet integration could persist a signed transaction identity before broadcast; a contract ABI change is unnecessary here.

**Disposition: addressed in source and independently verified.** The reviewer reran the same-cached-block reproduction with actual timestamp comparison: the first intent remained Succeeded and the newer intent was rejected. Separate direct checks rejected missing, malformed and negative timestamps. New regressions cover duplicate-hash wallet return and manual recovery, preservation of the original record, finalized-hash immutability, and an untracked earlier timestamp despite a later-than-snapshot execution block. Existing reload/reconciliation tests still pass. The integration owner subsequently re-fetched all 17 actual signed-operation receipts with the final default reader. This reviewer independently verified the resulting source/evidence hashes and reclassified those saved outcomes; this distinguishes the new read-only verification from the earlier signed execution.

## Original review dispositions

| Finding | Final source/evidence disposition |
|---|---|
| AT-01 escrow beneficiary trap | Addressed in contract validation before allocation, local publication and browser preparation. Fresh deployment evidence records actual rejection without consuming campaign ID/storage and later normal flows. Native duplicate-recipient regression remains valid. |
| AT-02 local uncertain retry | Addressed by durable actor/path/body/key journal, request reuse and in-flight suppression. Reviewer reran helper regressions; built-browser evidence separately records committed-response loss, timeout, reload and one debit. |
| AT-03 browser chain adapter | Implemented: separate testnet workspace, same-final-block reads, approved code/config, wallet account checks, exact request review and transaction controller. Actual generated-account SDK controller transactions are recorded; FG-01 source/regression gate is closed. External wallet application login/sign/redirect lifecycle is not exercised. |
| AT-04 workspace commands | Addressed: direct Node cargo launcher, `test --workspace --locked`, sequential explicit escrow/token builds, fail-fast exits and checked artifact hashes. Fresh JS install/build/start is separately recorded; this does not claim a second independent bit-identical Rust build. |
| AT-05 polling/history | Generation checks, non-overlapping polling and retained/deduplicated history are implemented. Reviewer reran deterministic race tests; browser evidence includes held Alice read followed by Bob selection. Full multi-page rendered coverage is not inferred. |
| AT-06 error/recovery states | Timeouts, stale signing guards, local uncertain-request panel, explicit route/errors, live amount revalidation and fixed-credit failure guidance are implemented. Hashless/unverifiable external wallet outcomes deliberately remain unresolved. |
| AT-07 operations | Versioned initial migration, worker health, stopped backup and new-directory restore are implemented. Root reproducibility evidence records isolated actual build/start/backup/restore comparisons. No original user database was restored or mutated by this reviewer. |
| AT-08 rendered verification | Partially covered, explicitly scoped: built-browser monetary response-loss/outage/account-race observations and measured narrow view exist. The complete keyboard/all-view/cross-browser matrix and external wallet signing were not demonstrated by this review. Helper test counts are not DOM tests. |

## Remaining P2 corrections and material scope exceptions

- **Release navigation correction verified.** README originally named the old deployment and described an exclusively local browser. The parent corrected it to the fresh escrow/token, live workspace, current release pointers and explicit external-wallet exclusion; this reviewer verified those changes. Historical `EVIDENCE.md` now carries a current-release preface. The follow-up also verified `RELEASE_CORE.md` now names the explicit Intear/FastNear allowlist and `RELEASE_UI.md` describes the timestamp/hash-ownership guards. Original receipts remain distinguished from the new deployment/source.
- **Observation age is not chain-block age.** `server/near.ts` stamps `source.observedAt` after the serialized snapshot completes, although the source block was chosen before those reads. Under retries/queue delay a newly returned snapshot may describe a materially earlier final block. Contract state/deadline/capacity checks remain authoritative and prevent those races from accepting invalid pledges; the UI must not promise a maximum 30-second chain-block age merely because its observation is fresh. Expose or document the actual block timestamp, or reject over-age source blocks before signing in a later refinement.
- **Uncertain wallet recovery is deliberately conservative.** A provider exception with no retrievable hash can block further intents for that signer/deployment. No safe proof of non-submission is manufactured. Invalid journals, cleared browser storage, cross-device history and concurrent independent browser sessions are not a durable global transaction index. Preserve/export evidence and inspect actual wallet history; do not advise deleting the journal to retry a payment.
- **External wallet boundary remains open.** Picker open/Escape dismissal and SDK signing are useful but do not demonstrate real wallet login, popup/redirect return, account switching during approval, or hardware-wallet behavior. Describe the tested layers precisely. No blanket “all browser workflows passed” or unrestricted public-testnet usability claim is justified.
- **Bounded testnet assumptions remain.** Prototype upgrade keys are retained; actual source/code verification is a point-in-time observation, not immutable deployment. The public faucet is finite and not Sybil-resistant. RPC availability, worst-case maximum-size callback gas/storage, full accessibility/cross-browser coverage and production monitoring have not been established by this gate. Native callback tests are not maximum-gas receipt proofs.
- **Dependency audit is scoped.** Root dependency evidence reports zero production JavaScript advisories at its recorded registry check, but retained Rust native tooling advisories remain. Their absence from the normal deployed WASM graph is a scoped exposure assessment, not a clean whole-workspace audit.

## Evidence inspected and reviewer execution

Inspected the original Astra review; release core/UI/operations/testnet/controller documents; root `release-qa/REPRODUCIBILITY.md`, `DEPENDENCIES.md`, `BROWSER_RELEASE_QA.md`; and the release acceptance plan. Critical source inspection covered shared RPC/preparation, server final-block reader, controller and workspace, local operation journal/API, escrow publication/settlement/claims/callbacks, bounded token faucet, HTTP/local boundary and contract launcher.

Fresh reviewer execution before FG-01 correction:

```text
node --test tests/near/rpc.test.ts tests/near/reader.test.ts tests/web/near-controller.test.ts tests/web/release.test.ts
21 passed, 0 failed, 0 skipped
```

These tests passed while the new FG-01 reproduction still failed its intended safety property, demonstrating why passing existing counts alone did not close the gate. Full 61-test application/native/build/testnet/backup/browser evidence was inspected as prior parent/agent execution, not rerun or relabeled as this reviewer's work. The initial actual controller document recorded campaign 3 fully recovered and campaign 4 settlement still in progress. The completed evidence subsequently verified campaign 4 Succeeded, 100 testUSD accepted and paid, and global accepted/paid 2,145 testUSD with zero custody/liabilities at final block 276401260. The final parent application count is 63 tests; this reviewer's targeted count remains the 23 below.

After the correction, the same four-file command passed **23 tests, zero failures and zero skips**, including the two new regression tests. The independent direct replay reproduction now reports:

```json
{"first":"Succeeded","newerUnknownUsingSameReceipt":"Rejected"}
```

No source or contract artifact changed in this reviewer's work. The parent owns the controller patch, final production rebuild, full-suite release counts and any updates to older release summaries.

This reviewer submitted no chain transactions, accessed no private keys, and opened no working application database. Only this review document was authored by this reviewer.
