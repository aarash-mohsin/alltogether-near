# Built application release QA

Observed 2026-11-05/06 in the in-app browser against isolated built applications, not Vite. Harness: `serve-qa.mjs`; runtime and generated credentials are ignored. These results supplement automated tests; they do not establish exhaustive correctness or a mainnet audit.

## AllTogether — localhost 9091, isolated campaign 4

- A response dropped after a real pledge commit triggered a browser transport retry using the same operation identity: exactly one 1-testUSD debit.
- A second pledge of 2 testUSD committed while its response was held. After the UI timeout and actual page reload, the unfinished-request panel retained actor, endpoint and identity. Resuming confirmed the original request. Venue active principal stayed 3 and Alice balance stayed 3822; no second debit.
- Controlled API outage showed stale/connection guidance and disabled pledge and removal controls. Restoring the API recovered the view.
- A held Alice account read followed by a switch to Bob did not expose Alice's own-position controls after release of the old response. Bob remained selected and had zero removal controls.
- Updated built production authoring rejected the configured escrow as budget 1's beneficiary before showing a publish review, naming the offending budget and asking for the actual service recipient. No invalid plan was published.

## ArchivePass — localhost 9092, isolated asset 4e0137ce-d490-412b-8c77-ebca64c5dfd7

- Initial zero upkeep displayed Awaiting upkeep. Both keeper processes were HTTP reachable while readiness correctly remained 0 of 2, Not imported.
- Held the response after a real 0.1-NEAR local-ledger upkeep commit. Reload retained one unconfirmed request. Resume original request confirmed event 2 and cleared the journal; available upkeep remained exactly 0.1.
- Controlled API outage showed an explicit stale authoritative-view warning, retained last verified data, and disabled funding/import/poll changes. Background refresh recovered after restoring the API.
- Imported keeper A through the UI: readiness became 1 of 2, A Ready, B Not imported. Imported B: 2 of 2 Ready. This is local-file verification, not a claim of independent infrastructure or continuous availability.
- Browser whole-file download from A and then B independently matched 2,937 bytes and SHA-256 `613d3d09c8774dd2af511845c984555d9c6017cc470243ea181bce76818023f4`; each result named its actual source host and observation time.
- Ordinary transfer preview showed the 0.1 upkeep and fixed refund destination. Checking confirmation and then changing the recipient removed the old preview and confirmation controls. Re-previewed Bob, saved a real JSON handover download, and confirmed the ordinary local transfer: Bob became owner at epoch 1, Alice lost the preview action, and the refund destination stayed fixed. Packet retained under the ignored QA runtime directory.
- Created a new archive through actual browser file selection, hashing/upload, rule validation, review and creation. Browser/server hashes agreed. Elapsed first-slot input was explicitly rejected; future inputs produced archive `ce5e585c-83ad-4968-961c-97f99f19f699` with the exact reviewed policy and Awaiting upkeep/0 of 2 readiness.

## Responsive and live wallet boundary

- Both built detail pages rendered inside actual 360-pixel iframes. Each inner document measured clientWidth 345 and scrollWidth 345 (15-pixel scrollbar); screenshots showed readable narrow layouts with no horizontal page overflow.
- Updated AllTogether production server at localhost 8787 displayed actual verified final-block binding, retained access-key counts, faucet capacity, live campaign states, Matched custody and zero book residual. Wallet picker opened and Escape dismissed it without connecting or signing. External wallet account login/approval was not exercised; actual SDK-backed controller execution is recorded separately.
- ArchivePass production testnet screen displayed final asset `archive.apw-mw3re9ta.testnet`, exact 50T code hash, zero access keys, Bob epoch 3, .003 paid/.017 available and zero conservation residual, with final-worker evidence and operator-runbook labels. Its skip link focused `main` while preserving the `#/testnet` route.

## Outstanding checks

Remaining release matrix coverage, downloads, new authoring, transfer review invalidation, responsive/keyboard checks, actual backup/restore and fresh install/build/start are tracked in `../RELEASE_QA_PLAN.md`. Do not interpret this partial log as final release approval.
