# AllTogether independent release review

Reviewed 5 November 2026. Scope: existing local application, shared types/accounting, Rust escrow and test token, deployment/proposal/scenario scripts, recorded evidence, specification and implementation plan. This review does not authorize publication, mainnet, or use of personal wallets.

## Release decision

**A useful, honestly labeled local prototype and separately exercised testnet contract exist. A usable public testnet browser product is not yet complete.** The dependent-budget rule is implemented coherently: exact prefunding, per-budget capacity, deadline settlement, separate withdrawal credits, bounded refunds, and callback reservation are visible in actual code. Existing successful scenarios are meaningful evidence, but do not cover every configuration or failure boundary.

No P0 exploit was established in this review. There is one concrete P1 contract configuration trap that can make an entitlement permanently unpayable, one P1 browser retry defect, and several release gaps below. Do not expose the local role simulator as an authenticated public financial application. Its loopback restriction and explicit labels are appropriate existing safeguards, not defects to remove for hosting.

Two release claims must remain separate:

- **Local/hackathon demonstration:** can ship after the concrete correctness and reproducibility fixes, with documented local startup and separately linked chain evidence. Wallet signing is not required to describe this honestly.
- **Usable public testnet application:** additionally requires genuine chain reads and signed operations, verified configuration, clear native/token costs, transaction recovery, a deployable frontend, and an independent-user onboarding path. Proposal export is an acceptable sponsorship boundary under PRODUCT_SPEC.md:297; rebuilding DAO voting is unnecessary.

Mainnet, formal audit, economic security, delivery guarantees, immutable deployment, and production operation remain outside this release. Retained testnet full-access keys are a disclosed trust root.

## Review evidence and limits

Read PRODUCT_SPEC.md, IMPLEMENTATION_PLAN.md, README.md, docs/EVIDENCE.md, docs/SECURITY.md, docs/STORAGE.md, docs/NEAR.md, integration-status.json and root EXECUTION_STATUS.md; independently inspected server/domain.ts, HTTP/store/worker/schema/export, shared amount/client/terms/types, browser App/API/format/styles, contract lib/model/terms/tests, and build/NEAR/testnet scripts.

Fresh review execution: `node --test tests/server/domain.test.ts tests/web/api.test.ts tests/web/payments.test.ts tests/integration/shared.test.ts` passed **20 tests, zero failures**. The existing HTTP test and Rust/public-testnet scenarios were inspected, not rerun by this reviewer. Recorded 21 application tests and 15 escrow + 1 token test remain prior evidence, not a new review execution claim. No mutating testnet script was run. No credentials were opened or printed.

A disposable in-memory domain reproduction confirmed:

```json
{"duplicateRetryDebited":"2000000","sameKeyReplayAdditionalDebit":"0","selfBeneficiaryAccepted":true}
```

The first number is two identical 1 testUSD pledge operations with different UI-style keys; replaying the second key did not debit again. The self-beneficiary result confirms local publication accepts its escrow identity. The Rust trap below is established by source path plus the pinned token implementation, not a newly executed onchain loss experiment.

Source line references are for the reviewed snapshot and will move during fixes. This is a bounded engineering review, not a formal security audit.

## Prioritized findings

### AT-01 — P1: reject the escrow as a beneficiary before publishing immutable terms

**Evidence:** `contract/src/lib.rs:65-76` accepts validated input; `contract/src/terms.rs:29-44` checks lengths and amounts but never rejects `leg.beneficiary == env::current_account_id()`. On successful settlement, `contract/src/lib.rs:117-119` creates that beneficiary credit; `:181-183` sends `ft_transfer` to it. The pinned `near-contract-standards-5.30.0/src/fungible_token/core_impl.rs:101` requires sender and receiver to differ. `server/domain.ts:534-546` also accepts the local escrow identity as a synthetic beneficiary wallet.

**Reproduction:** create a one-budget plan whose beneficiary is the escrow contract account, receive the correct reserve and community principal, finalize successfully, claim. The real token rejects escrow-to-itself transfers; the callback restores the credit. Every retry has the same fixed recipient and fails again. There is intentionally no redirection or sweep recovery. The local model can misleadingly succeed by crediting a separate synthetic wallet with that identity.

**Impact:** donor and sponsor tokens become stuck behind an impossible success entitlement, without violating book conservation. This requires an organizer/DAO to approve bad terms; it is not an arbitrary attacker stealing another plan's funds. It is nevertheless preventable at publication and blocks broad public authoring.

**Implement now:** reject the configured escrow beneficiary in contract publication, local publication, and inline browser validation. Preserve ordinary duplicate beneficiaries across legs. Preflight recipient existence/registration in the chain UI as useful guidance, but do not misrepresent a current registration check as a permanent payout guarantee. Do not add an admin redirect to repair invalid terms.

**Acceptance:** contract and HTTP rejection leave campaign IDs/storage/balances unchanged; UI names the offending budget; valid duplicate recipients still create distinct earmarked credits; normal retry-after-registration still works. Rebuild changed WASM and update source/deployment evidence separately—do not label the old deployed hash as containing the fix.

### AT-02 — P1: uncertain browser writes lose their idempotency identity

**Evidence:** `web/src/App.tsx:32` creates a new UUID on every invocation. The handlers at `:137-139`, `:173`, `:178`, and `:193` call it afresh. `run()` at `:114-124` catches a transport failure and clears busy state without preserving the operation. The server correctly deduplicates only `(actor,key)` at `server/domain.ts:372-430`.

**Reproduction:** submit a small pledge with ample remaining capacity; allow the POST to commit but drop its response. Retry the same visible amount. A new key causes another debit. The same problem can duplicate publication or remove another installment of a pledge. Existing server idempotency tests do not exercise this UI failure.

**Implement now:** create one durable operation identity at user confirmation, persisting actor, mode, campaign/credit, route, canonical body and key until an authoritative outcome is known. Provide an explicit resume/check-result action after timeout/reload. Replaying the same operation must reuse its key. A deliberate new operation needs a fresh confirmation/key. Clear or retire resolved failures without trapping users behind a cached insufficient-balance result. Use a synchronous in-flight guard in addition to rendered busy state.

**Acceptance:** drop a committed response, refresh/reopen, retry; exactly one debit/publication/removal and one receipt result. Double-click/Enter cannot enqueue duplicate operations. Switching account cannot replay an unresolved command as another actor. A changed body with the old key produces a conflict. Ordinary intentional second pledges work.

### AT-03 — P1 public-testnet gate: the browser has no NEAR adapter or signing path

**Evidence:** `web/src/api.ts:10-44` exclusively calls the local `/api`; mutations use `X-Demo-Actor`. `server/http.ts:106-110` rejects non-local mode; `server/domain.ts:317-332` reports local capabilities and `walletSubmission:false`. `web/src/App.tsx:192` renders historical booleans as verification status, without live chain data. `shared/client.ts` has one interface but no implemented NEAR adapter. Actual testnet scripts are a separate operator flow.

**Scope:** this is an explicit current limitation, not a deceptive claim. The spec requires a NEAR adapter at PRODUCT_SPEC.md:89 and :365, but allows export-only DAO proposal submission at :297. Fully signed browser creation/contribution/withdrawal/claim is an additional release gate when claiming public testnet usability.

**Implement now:** a separate testnet mode with public configuration, live final-block reads, transaction preparation/confirmation and wallet-backed execution. Keep local role switching only in local mode. No server-held signer, fake auth header, or fallback to seeded state. Gate transactions on network, escrow configuration, token metadata and approved deployment hash checks. Show source block/time and stale state. Link verified actual receipts and disclose upgrade authority.

The present ABI supports this without a contract redesign:

| Browser operation | Contract mapping / required handling |
| --- | --- |
| Discover plans | `list_campaigns({from_index,limit})`, `get_campaign({campaign_id})`; normalize snake_case outer fields and camelCase terms |
| View account | `get_account_campaign({campaign_id,account_id})`, FT balance/registration; positions are returned in leg order and need leg/campaign IDs attached by adapter |
| Publish | `quote_campaign_storage` then `create_campaign({input})`; freeze reviewed input, attach exact quoted native deposit, show retained-storage policy |
| Sponsor | Read actual DAO policy/bond; prepare exact `add_proposal` payload/description/hash; export and vote via existing DAO governance; only accepted reserve opens contributions |
| Contribute | Token `ft_transfer_call` with exact escrow, one yocto, strict message, terms hash, leg and integer amount; verify receiver/resolver result and refreshed principal |
| Remove / settle | `remove_pledge`, permissionless `finalize`; separate removal from subsequent claim |
| Refund / claim | `materialize_refund`; `claim_credit` with one yocto and adequate gas; fixed recipient and pending nonce must remain authoritative |
| History / custody | Contract accounting plus FT balance at one block where possible; bounded current attempts; historical event/index/receipt cache must be labeled and rebuildable |

Account discovery needs care: the contract has no global per-account campaign index. For this small testnet release, paginated campaign discovery plus bounded/cached account reads is sufficient; do not promise an unbounded production index. Do not fabricate historical activity from current state. Current onchain `funds_accepted` log (`lib.rs:291`) lacks `leg_id`; decode actual receipt arguments or improve future event schemas if complete per-leg historical activity is required.

**Acceptance:** an independent dedicated testnet account can inspect and complete a pledge/withdraw/claim through the built UI; wallet cancellation leaves no success state; wrong network/config and RPC outage block signing with an explanation; approval without received reserve stays closed; rejected overfill resolves to returned tokens, not false success; account change/reload resumes the correct transaction; no secrets in browser bundle/server responses/logs. Existing DAO council credentials need not be exposed to evaluators.

### AT-04 — P1 reproducibility gate: package contract commands omit the token workspace member

**Evidence:** `scripts/contract.mjs:5-10` runs `cargo test` or a single root `cargo near build` inside the root escrow package. `contract/Cargo.toml` is both a root package and a workspace with member `test-token`. Root default package selection is not `--workspace`; the one WASM build does not invoke the member manifest. `README.md` presents `pnpm test:contract` and `pnpm build:contract` as verification commands for the project.

**Impact:** a clean checkout can omit the token test and lack the token artifact expected by `scripts/near/deploy.mjs`. Historical manual execution of both manifests does not make the advertised commands complete.

**Additional parent-observed reproduction:** the same command launches `powershell.exe -NoProfile -File` on Windows. The parent reports that Windows PowerShell's Restricted execution policy rejects this wrapper on the current workstation, although invoking the wrapper from the active PowerShell environment works. This is separately reported parent evidence, not a command rerun by this reviewer. Prefer a Node launcher that sets the known workspace-local Rust/toolchain environment and spawns cargo directly, with standard installed-cargo fallback; do not weaken system execution policy to make a package script work.

**Implement now:** workspace native tests, explicit escrow and token WASM builds, fail-fast exit codes, clear artifact locations and hashes. Make the Windows wrapper's parent-workspace dependency explicit or provide a standard cargo fallback when the wrapper is absent. Pin/document build prerequisites; an AllTogether-only folder copy is not currently a standalone Windows build package.

**Acceptance:** starting without either artifact, the one documented command creates both; the test command runs both crates; intentionally failing either crate fails the command. Fresh dependency install/build/start must work without `.secrets`, existing data, or prior compiled output. Record the actual artifact hashes.

### AT-05 — P2: polling can overwrite the current account/route and discards paginated history

**Evidence:** `web/src/App.tsx:86-112` starts polling without aborting or versioning old refreshes. `:102` can install a response for a previous actor after selection changes. `:106` resets activity to the first 50 rows every three seconds. `:178` appends an activity page, which the next refresh discards. API activity is ascending at `server/domain.ts:364`, while the button at `App.tsx:264` says “Load earlier activity.” Loaded plan pages beyond the first are preserved but not refreshed (`:99`).

**Reproduction:** delay Alice's account response, select Bob and let Bob finish, then release Alice's response; Bob's selector may display Alice's positions/credits. For a >50-event plan, load another page and wait for polling; the extra rows vanish. For >20 plans, open later pages and change a later plan elsewhere; its card can remain stale indefinitely.

**Implement now:** request generation/AbortController keyed by mode, account, route and tab; ignore late results; serial/non-overlapping refresh with timeout/backoff. Maintain a deduplicated activity cursor or explicitly refresh all loaded pages without losing them. Align the label and chronology. Clear account-bound money dialogs on account change or deliberately re-confirm ownership.

**Acceptance:** deterministic deferred-response tests for account/route swaps; multiple pages survive repeated polls and new events; no duplicate event IDs; later plan cards update; outage does not accumulate unlimited requests or erase the last-known source time.

### AT-06 — P2: route and failure states leave users stuck or misdirected

**Evidence:** missing campaign fetches set `connectionError` in `App.tsx:104-110`, while `:179` continues “Loading plan…” forever. The browser request helper has no timeout (`web/src/api.ts:10-18`); a stalled mutation can keep busy state indefinitely. Activity load-more uses `void more()` without catch/busy handling at `App.tsx:264`. `Funds` renders CreditRow without `latestError` or per-credit retry guidance at `:258`, even though detail views carry it. Dialog maximum uses its captured campaign snapshot (`:193`, `:273-278`), not refreshed detail data.

**Implement now:** explicit loading/not-found/disconnected/stale/error states; meaningful return navigation; bounded fetch timeouts; preserve uncertain-write identity per AT-02; handle pagination errors inline; put current failed-attempt reason and fixed-recipient registration guidance directly in My funds; refresh/revalidate monetary review at confirmation. A timeout must never mean the server or chain did not execute.

**Acceptance:** unknown/malformed routes, offline initial load, dropped connection during confirmation, full capacity changed in another session, missing registration, failed retry and recovered service all have a clear next action. No endless spinner, unhandled rejection, invented success, or retry of a still-pending payout.

### AT-07 — P2 release operations: recovery is tested, but backup/restore and schema change procedures are absent

**Evidence:** `server/store.ts:12-25` enables WAL/FULL durability, rejects future schema versions, then runs current `CREATE TABLE IF NOT EXISTS` SQL and stamps version 1. There is no numbered migration runner or backup/restore command/runbook in scripts/docs. Crash recovery is well tested; it does not protect against deletion, disk failure, corruption, or an incompatible future schema edit.

**Implement now:** consistent SQLite backup using a supported backup API or controlled stopped/checkpointed procedure; restore into a separate path, verify integrity/foreign keys, schema version, canonical terms and independent balances/claims before switching. Document that copying a live main SQLite file alone can omit WAL transactions. Add an explicit versioned migration mechanism before any schema change; keep backups and use a rollback-safe migration transaction. Do not invent a migration for unchanged v1 merely to increase test count.

Health currently tests only `SELECT 1` (`server/http.ts` `/api/health`). Add worker heartbeat/last error and pending age/count as operational observability; a database that answers reads can still have a stalled payout worker. Keep observation distinct from repair authority.

**Acceptance:** backup with pending reserved/executed/resolved states, restore to a new database, start worker and reconcile without duplicate payment. Reject future schema without rewriting it. Inject backup failure/disk-full safely. No automatic destructive reset or seed on startup. Document exact stop/start and who can access local data.

### AT-08 — P2 release verification: the frontend tests do not exercise a rendered application

**Evidence:** `tests/web/api.test.ts` mocks fetch and inspects the adapter; `tests/web/payments.test.ts` tests pure formatting/refund discovery. `scripts/test.mjs` runs Node test files, not a browser suite. `docs/EVIDENCE.md` records valuable manual Vite and 360px iframe exercises but no repeatable browser command, production-server walkthrough, full keyboard run, or fault-injected rendered tests.

**Implement now:** a small deterministic browser release suite against the built server, isolated database and controlled time/network. Cover complete success/failure/refund/retry journeys, AT-02/05/06 regressions, keyboard dialogs/form errors, and 360px layout. Keep actual short-deadline public-testnet verification separate from clock-controlled local tests. Add a single documented release check that builds and invokes the relevant suites; do not replace assertions with screenshots alone.

**Acceptance:** run from fresh state on port-configurable built output, with no Vite dependency; test at desktop and actual narrow viewport; fail on horizontal overflow, console errors, inaccessible controls, missing receipt, stale account data, duplicate debit, or reconciliation mismatch. Preserve readable failure artifacts and exact commands.

## Additional hardening and product polish

These are improvements or bounded risks, not newly established P0/P1 exploits:

- **Native and token costs:** the measured three-budget quote is 2.92408 test NEAR, separately from testUSD (docs/STORAGE.md). Surface storage, one-yocto calls, gas, token registration and DAO bond as distinct costs before signing; never call the quote a refundable deposit. The current native tests use 300 Tgas callbacks and ample balance (`contract/src/tests.rs:6-18`), so they do not establish worst-case 20-Tgas callback sufficiency. Add maximum-size terms/account IDs and all liabilities/attempt fields to an appropriate VM/receipt gas test. Actual ordinary testnet callbacks already passed; do not portray this as a confirmed gas failure.
- **DAO review quality:** show declared cap versus effective allocation whenever different, exact beneficiaries and full account IDs, common UTC/local deadline, aggregate reserve and source hash. Show the minimum remaining amount for every blocking budget. A successful DAO proposal alone must not become “funded.” The current script already prepares real FunctionCall payloads and reads proposal bond; extend that proven path.
- **Immutable recipient errors:** syntax validation cannot establish ownership or future registration. Show receiver account existence and registration observations before publication, warn on duplicate recipients without banning them, and explicitly explain that published beneficiary typos cannot be redirected.
- **Validation parity:** Rust currently counts Unicode characters but does not trim/normalize/reject controls like local `Domain.text` does (`contract/src/terms.rs:29`, `server/domain.ts:459`). Contract hashing is authoritative, so this is not a demonstrated hash exploit. Decide a documented canonical input policy and test whitespace, NFC/NFD, newline/control and maximum-length strings across both paths.
- **Bounded UI data:** account views and global invariant checks scan growing local history (`server/domain.ts:280-297`, `:1284` onward); acceptable for the local demo, not evidence of a scalable hosted service. Load-test realistic usage before promising that. Preserve exhaustive invariants in tests even if runtime checks become incremental.
- **History quality:** campaign attempts are capped at the latest 50 globally (`server/domain.ts:162-165`); a specific credit's old failure may disappear from derived `latestAttemptError`. Return a per-credit latest outcome or direct authoritative credit-attempt association for reliable recovery guidance.
- **Accessibility:** native dialog, semantic buttons/labels, skip link, tab keyboard handling and status regions are good foundations. Verify focus restoration after modal unmount, errors linked by `aria-describedby`, field-specific names for repeated budgets, screen-reader announcements that do not repeat on every poll, reduced motion, contrast, 200% zoom, long IDs and maximum atomic amounts. Do not claim complete accessibility from no-overflow evidence.
- **Development upgrades:** no production immutability is claimed. For a future immutable deployment, prove the final artifact and operational invariants before removing keys; never remove current development authority as part of this review. A fixed deployment must have a credible stuck-callback incident policy without unsafe credit resets.

## Ranked feature and polish opportunities

Effort: S = compact UI/test change; M = several coordinated modules; L = integration/release subsystem. These rankings favor making the existing differentiation understandable and usable.

| Rank | Improvement | Impact / effort | Scope recommendation |
| --- | --- | --- | --- |
| 1 | Testnet mode with wallet-backed pledge, removal and claims plus live custody | Very high / L | Required for public testnet use; avoid an unrelated DAO factory or multisig |
| 2 | “What still blocks this plan?” panel with each missing amount and direct budget action | High / S | Implement now; demonstrates the product's actual coordination value |
| 3 | Recovery inbox showing refundable principal, available credit, pending attempt, last failure and receipt | High / M | Implement now with AT-06; one place to find money owed |
| 4 | Reviewable sponsor packet/export: readable terms, exact payload, cost, hash and observed governance/receipt states | High / M | Implement now; existing scripts provide a concrete base |
| 5 | Safe share link / read-only plan permalink with clear local versus testnet destination | High / S-M | Testnet release; a localhost hash is not a public share link |
| 6 | Guided first-run three-step demonstration using fresh short-deadline fixtures | Medium-high / S | Local release; fixed expired sample deadlines should not strand an evaluator |
| 7 | Local draft autosave and restore with validation/versioning | Medium / S-M | Useful authoring polish; never mutate published terms |
| 8 | “All payments complete” derived badge and settlement summary | Medium / S | Implement after payment correctness; terminal success remains separate |
| 9 | Recipient duplicate/existence/registration review | Medium-high / M | Public signing gate, especially for immutable terms |
| 10 | Reusable community event templates | Medium / S | Stretch; preserve one-to-three budget rule |
| 11 | Reminders/follow-up notifications | Medium / M | Stretch; no new messaging authorization inferred |
| 12 | Multi-DAO/currency, delivery attestations, arbitrary dependencies | Uncertain / L+ | Exclude now; changes core trust and accounting scope |

The defensible differentiation remains **earmarked essential budgets that all acquire entitlements together**, with physically prefunded matching. Explain this using the 400/125/50 versus 400/125/75 comparison, not “first crowdfunding” claims. The existing specification's competitor research is a dated snapshot and includes unavailable repositories; this review did not independently refresh competitors and makes no new feature-absence or originality claim.

## Risk-based release QA matrix

E = existing relevant evidence; N = new/repeated evidence needed for the release changes. Each row needs an actual pass/fail record, mode, source commit/artifact, environment, and any limitation. Do not silently turn N into passed because an adjacent happy path passed.

| Area | Scenarios and negative cases | Required oracle / gate | Evidence |
| --- | --- | --- | --- |
| Clean local install | Frozen lock, Node requirement, no data/secrets/dist, portable paths | Documented install/build/start works | E partial; N clean built-server |
| Contract commands | Both crates tested, both WASMs built, member failure propagated | Counts and hashes match both outputs | N AT-04 |
| Static production serving | `/`, deep link, JS/CSS MIME, refresh, missing assets, path traversal, HEAD | Built UI usable without Vite; no outside-root read | N |
| Local security boundary | Wrong Host/Origin, cross-site JSON/form, unknown actor, malformed method | Rejected without mutation; loopback retained | E HTTP partial; N regression |
| Input parsing | Null/array/missing/unknown fields, huge body, malformed percent path, invalid JSON | Stable useful errors; no partial publication | E partial; N |
| Authoring | 1/2/3 legs, 0/4 rejection, empty/control/Unicode/max strings | Immutable canonical terms and deterministic hash | E partial; N parity |
| Recipient safety | Escrow self-beneficiary, duplicate ordinary recipient, bad ID, absent/unregistered account | Self rejected; duplicate valid; guidance accurate | N AT-01 |
| Amount precision | One atom, odd 101/cap60, u128 limit/sum overflow, excess decimal/exponent/comma | Exact integer arithmetic and safe errors | E; N rendered boundary |
| Deadline boundaries | D-1/D/D+1 pledge/removal/finalize; early full target still reversible | Server/chain authoritative cutoff; no early entitlement | E; N browser display |
| Sponsor source | Wrong token predecessor, wrong DAO sender, partial/excess/zero/late reserve | Entire rejected amount returned; no open state | E native/live partial |
| Sponsor terms | Wrong hash, extra message fields, invalid leg/action/version, replay funding | No accepted inflow or duplicated reserve | E partial; N expanded |
| DAO governance | Rejected/expired/approved-not-executed/execution-failed/accepted reserve | Distinct governance/funding states; actual policy/bond | E live happy; N failures/UI |
| Concurrent pledge | Last room same/different actors, overfill, insufficient token balance | Exactly accepted capacity; full excess return | E HTTP/native/live |
| Participant admission | 128 lifetime, 129th rejection, withdrawal does not recycle, existing account other leg | Bound persists; rejected transfer fully returned | E native/local |
| Withdrawal | Partial/full, wrong actor, no position, after deadline, repeated request | Active reduces once; fixed withdrawal credit only | E; N UI uncertain retry |
| Successful settlement | All three at target, duplicate finalization, duplicated beneficiaries | Every correct credit once, exact totals, no contributor refund | E |
| Failed settlement | One/multiple missing legs, sponsor never funded, repeat finalize | Zero beneficiary credits; exact contributor/DAO obligations | E |
| Refund materialization | Multiple legs, consumed twice, no position, pending withdrawal | Consume once; no withdrawn principal returned twice | E |
| Claim authority | Foreign contributor credit, permissionless beneficiary/DAO, arbitrary recipient attempts | Fixed recipient; unauthorized credit stays intact | E native/local |
| Claim preconditions | Wrong yocto, insufficient prepaid gas, zero available, already pending | No transfer reservation on rejection | E partial; N explicit negative |
| Transfer failure/retry | Unregistered recipient then registration, repeated failure, larger returned bytes | Exact credit restored once or paid once | E native/live |
| Callback security | External caller, unknown credit, stale/duplicate nonce, wrong result count | No forged payout or restoration | E partial; N complete |
| Interleavings | New credit while old pending, finalize during withdrawal, two campaigns | Independent books and conservation after each step | E generated/native/local |
| Worst-case gas/storage | 128 accounts ×3 legs; withdrawal+refund credits/latest attempts; max text/IDs | Measured storage <= quote; receipt callback/finalize gas within budget | E partial; N max population/gas |
| Custody reconciliation | Pending downstream success before callback, quiescent match, unsolicited surplus | Distinguish observed balance/book liabilities; no sweep/reallocation | E local/live; N chain UI |
| UI uncertain write | Drop response after commit, reload, double click, actor switch, changed body | One durable identity; exactly one monetary effect | N AT-02 |
| Fetch races | Slow prior actor/route, overlapping polls, outage/recovery | No cross-account display or stale overwrite | N AT-05 |
| Pagination | >20 plans, >50 events/attempts, repeated load/poll, newest events | No lost/duplicated rows; current statuses; complete export | E export; N rendered |
| Invalid routes/errors | Missing plan, malformed ID, initial offline, stalled fetch, server 500 | Terminal usable error state, timeout, safe retry path | N AT-06 |
| My funds recovery | Failed principal, withdrawal, pending, paid, registration failure, old failure >50 attempts | Every debt discoverable; reason and next action correct | E partial; N comprehensive |
| Backup/restore | Pending at each commit boundary, live WAL backup, alternate restore path | Integrity + balances/credits/idempotency survive; no double pay | E restart; N backup |
| Schema versions | Existing v1, future version, interrupted migration, failed validation | No silent stamp/data loss; atomic rollback | N when migration introduced |
| Worker health | Paused/failing worker, old pending, restart, malformed local state | Observable degraded state; no unsafe manual reset | E restart; N diagnostics |
| Export security | All records, decimal strings, CSV formula prefixes, Unicode, escaping | JSON/CSV equal authoritative state, no keys or misleading chain IDs | E; N new chain mode |
| Testnet config | Wrong chain, token metadata/escrow DAO mismatch, changed code hash, RPC timeout | Signing disabled; source and reason visible | N browser |
| Wallet lifecycle | Reject connect/sign, wrong network, switch/logout, expired access, reload return | No local fallback; actor follows verified wallet | N browser |
| Chain transaction lifecycle | Submitted/unknown/final failure/success, downstream FT reject, delayed callback | Receipts plus refreshed state; never infer outcome from hash alone | E CLI; N browser |
| Public evaluator onboarding | Independent dedicated account, gas/test token/registration availability | Can complete documented testnet journey without operator secrets | N |
| Keyboard/screen reader | All primary flows, focus trap/return, Escape, tablist arrows, error focus | Logical focus and named controls; no mouse-only monetary action | E inspection; N end-to-end |
| Mobile/zoom | Actual 360px, desktop, 200% zoom, long IDs/titles, max amounts, modal keyboard | No document overflow or hidden submit/claim; readable terms | E narrow publish; N full flows |
| Release evidence | Fresh build, deployed hash/config, verified receipts, source mode, retained keys | Claims precisely match artifacts actually exercised | E dated; N final refresh |

## Recommended implementation order and handoff

1. Fix AT-01 and AT-02 first; add adversarial tests that reproduce their actual failure modes.
2. Complete contract workspace commands and built-server release checks. Preserve existing production/local separation.
3. Implement bounded live testnet adapter/signing and sponsor export for the agreed release target. Use existing accounts/contracts only after source/hash/config review; no personal wallet or mainnet actions.
4. Fix race/history/error/recovery UX, with real rendered fault-injection tests. Add blocking-budget and recovery-inbox polish while touching these views.
5. Add backup/restore and health/runbook support, then execute the matrix appropriate to changed code. Rebuild and verify contract evidence if contract source changes.
6. Final evidence must say which browser actions were actually signed on testnet, which were only simulated, and which gas/storage/incident branches remain unverified. No public hosting or key deletion is implied by a green local test run.

No need to expand to multi-DAO deployment factories, delivery verification, token economics, or notification infrastructure in this release. A trustworthy end-to-end path through the existing distinctive mechanic is the highest-impact improvement.
