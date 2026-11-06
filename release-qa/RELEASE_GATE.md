# Post-Astra release gate

Scope: reproducible hackathon/local and valueless NEAR testnet release candidates. No mainnet, public hosting or competition submission has been performed. Tests below do not establish absence of every possible defect or an independent security audit.

## Completed checks

| Gate | AllTogether | ArchivePass |
|---|---|---|
| Independent high-effort Astra product/source review | Initial review + final review; receipt-replay P1 fixed and independently reproduced as rejected | Initial review + final review; two final worker restart P1s fixed and independently verified |
| Full application regression suite | 63 passed, 0 failed/skipped | 75 passed, 0 failed/skipped after final startup fixes |
| Native contract workspace | 17 escrow + 5 token passed | 21 passed; receiver crate included |
| Strict TypeScript and production build | Passed | Passed |
| Frozen fresh installation and shipped process startup | Passed | Passed, including both keeper processes |
| Actual stopped backup/restore and persisted hashes | Passed | Passed, including both restored file downloads and regenerated operator credential |
| Production JS advisory audit | 0 reported | 0 reported |
| Rust advisory scope | Host/test/build advisories retained, absent normal deployed WASM graph; unmaintained allocator removed | Same; see DEPENDENCIES.md |
| Changed contract/deployment evidence | Fresh release escrow/token and real Sputnik flows; 51-transaction release scenario | Fresh keyless 50T callback deployment; signed automatic-worker scenario |
| Additional actual controller/worker QA | 22 FINAL transactions; all 17 signed controller operations reverified against final height/timestamp/hash guards | Two real signed worker processes, restart reconciliation, handover, automatic proof/payment, outage, unpaid miss |
| Principal reconciliation | Global accepted 2,145 = paid 2,145 testUSD; custody, rights, pending all zero | Worker asset: .02 = .003 paid + .017 available; pending/residual zero |
| Built browser fault recovery | Lost committed response, reload, same-request recovery without duplicate debit; stale/account isolation | Lost committed upkeep response, reload, same-request recovery; stale controls, readiness 0→1→2, both full-file hashes, transfer/preview invalidation, authoring |
| Responsive layout | Actual 360px frame: inner 345/345, no page overflow | Actual 360px frame: inner 345/345, no page overflow |

## Decision

All required checks within the scoped hackathon/testnet review are complete. Both independent final Astra reviews report no remaining confirmed P0/P1 in their bounded inspected paths. AllTogether passes 63 application tests and 22 native tests; ArchivePass passes 75 application tests and 21 native tests, with zero failures or skips. Final fresh-copy builds, stopped restores and shipped entry-point checks passed again after the last fixes. Source/artifact identities are recorded in FINAL_SOURCE_MANIFEST.json.

ArchivePass's final restart fixes have 18 independently rerun regressions. Actual child-process startup/download with the original source offline and fixed-credit settlement use an explicitly mocked chain transport; the earlier real signed worker receipts retain their historical source hashes. No new live-chain execution is claimed for the final host recovery patches.

## Explicit validation boundaries

**User-approved exclusion:** the user chose to leave ArchivePass's final-artifact 256-record/depth-14 capacity retest unverified after declining further QA-balance consolidation. Earlier 25T baseline reached 256 and exposed callback headroom; final 50T partial run reached 16, was interrupted by RPC limits and fully refunded. No consolidation or final capacity deployment followed that decision. The older artifact's success is not a final-artifact pass. This boundary must remain in release claims.

AllTogether's external wallet selector opened/cancelled in the browser; external wallet account login and approval were not exercised. Actual signing was tested through the same controller with a dedicated SDK wallet adapter. ArchivePass browser chain mutations remain intentionally outside its scope; operators use the signed owner CLI and automatic workers. Both keeper processes run on one computer. Sampled proofs do not establish continuous availability, independent replicas, delivery of physical services or permanent storage. AllTogether retains disclosed prototype contract keys; ArchivePass final asset was observed keyless. Finite testnet assets and their policy windows expire; old receipt evidence is not a replay command.

Evidence: per-project `docs/RELEASE_*.md`, `docs/ASTRA_FINAL_GATE.md`, [reproducibility](REPRODUCIBILITY.md), [browser log](BROWSER_RELEASE_QA.md), [dependency scope](DEPENDENCIES.md). This is a completed bounded engineering release gate, with the explicit exclusions above. It is not a mainnet or formal security approval.
