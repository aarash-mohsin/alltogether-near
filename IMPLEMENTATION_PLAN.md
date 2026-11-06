# AllTogether implementation plan

5 November 2026. Planning only; PRODUCT_SPEC.md controls the product rules. No implemented features, successful tests or deployment are asserted here.

## Delivery and ownership

Build the complete local vertical flow while implementing the genuine Rust escrow in parallel. ArchivePass remains a separate project, database, contract and package; no shared business code. Freeze the interfaces below before dispatch.

| Package | Exclusive ownership | Deliverable |
|---|---|---|
| A — local authority | server/**, tests/server/** | SQLite engine, HTTP API, persistent transfers, seeds and invariant/crash tests |
| B — product interface | web/**, tests/web/** | Complete responsive React flows and HTTP adapter |
| C — NEAR escrow | contract/**, scripts/near/**, docs/NEAR.md, docs/STORAGE.md | Rust escrow/tests/WASM, test token and genuine Sputnik/token integration scripts |
| Coordinator | shared/**, package/config/lock files, other scripts/**, tests/integration/**, README.md, docs/EVIDENCE.md, docs/SECURITY.md | Bootstrap interfaces, dependencies, integration, review and evidence |

Agents must not edit root package files or shared files. Interface changes go through coordinator. Each returns actual commands/results, limitations and walkthrough. No external publication or mainnet action is included. Dedicated generated testnet keys may be used by coordinator, stored only in ignored .secrets and never printed; do not use user keys.

## Toolchain and layout

One private ESM package in alltogether. Pin packageManager pnpm@11.25.0; react/react-dom 19.3.1, vite 8.3.6, typescript 7.0.2, near-api-js 7.4.0. These registry versions and Node24.22.1 were verified. Resolve and pin compatible exact @types/node/react/react-dom at bootstrap. Use native node:sqlite/http/crypto/test and native TypeScript stripping, no ORM/Express/decimal framework. Vite transforms JSX without a React plugin. Add @hot-labs/near-connect0.12.0 only if implementing its inspected real API; export-only DAO submission is an honest baseline. Browser automation can use available Playwright after probing dependencies; do not assert automated browser coverage if unavailable.

Rust near-sdk and near-contract-standards =5.30.0; pin Cargo.lock, unit-testing feature only for dev builds. Existing Rust1.99.1 GNU, wasm32 target and cargo-near0.22.0 are available through ../scripts/with-rust.ps1. Check cargo near build help before selecting exact build syntax. Native tests and WASM build are required, not optional aspirations.

```text
shared/{types,amounts,terms,client}.ts; shared/fixtures/terms-v1.json
server/{main,http,store,schema,domain,worker,seed,export}.ts
web/index.html; web/src/{main,App,api,format}.tsx
web/src/{components,pages}/**; web/src/styles.css
contract/Cargo.toml; contract/src/{lib,model,terms,accounting,views}.rs
contract/tests/**; contract/test-token/**
scripts/{dev,seed,scenario}.mjs; scripts/near/**
tests/{server,web,integration}/**; docs/**; data/ (ignored SQLite)
```

Required scripts: dev runs a Node supervisor spawning Node --watch server/main.ts and Vite; start runs Node server/main.ts serving built web; build runs typecheck then Vite; typecheck covers server/shared and web configs; test discovers TS node:test files; seed and scenario invoke their Node scripts; test:contract and build:contract invoke workspace PowerShell Rust wrapper. No npm shim or POSIX shell assumptions. README gives direct node invocation of bundled pnpm.cjs. Vite root web, dist ../dist/web, host127.0.0.1 port5173, /api proxy127.0.0.1:8787. Server loopback port8787, ALLTOGETHER_DB defaults data/alltogether.sqlite. Production serves SPA safely excluding /api. Test DBs live in isolated temporary directories.

Use explicit .ts imports for native Node execution; no TS enums, decorators, parameter properties or transform-required syntax. Server config NodeNext ES2023/noEmit/allowImportingTsExtensions; web config Bundler resolution, react-jsx, DOM, noEmit.

## Frozen shared TypeScript contracts

Coordinator writes shared/types.ts first. Amount and timestamps are canonical unsigned decimal strings, never floating point. Amount <=u128 max; timestamps are Unix milliseconds representable in u64. IDs are authority-assigned decimal strings, legId integer0..2. Account syntax matches NEAR2..64 lowercase IDs with valid separators.

```ts
export type Amount=string;
export type Millis=string;
export type Mode='local'|'near';
export type CampaignState='AwaitingFunding'|'Open'|'Succeeded'|'Failed';
export type CreditKind='withdrawal'|'refund'|'beneficiary'|'sponsor_refund';
export type ProposalStatus='NotSubmitted'|'InProgress'|'Approved'|'Rejected'|'Expired'|'ExecutionFailed'|'Unknown';
export interface Source {mode:Mode;network:'local'|'testnet';observedAt:Millis;stale:boolean;blockHeight?:string;blockHash?:string}
export interface Evidence {kind:'local'|'near';reference:string;transactionHash?:string;receiptId?:string;explorerUrl?:string}
export interface LegInput {title:string;purpose:string;beneficiary:string;budget:Amount;declaredSponsorCap:Amount}
export interface PublishInput {title:string;summary:string;detail:string;deadlineMs:Millis;legs:LegInput[]}
export interface LegTerms extends LegInput {legId:number;sponsorAllocation:Amount;communityTarget:Amount}
export interface Terms {
 schemaVersion:1;domain:'alltogether/local/v1'|'alltogether/near-testnet/v1';
 escrowId:string;campaignId:string;organizer:string;title:string;summary:string;detail:string;
 daoId:string;tokenId:string;tokenDecimals:number;tokenSymbol:string;deadlineMs:Millis;
 participantLimit:128;matchRule:'one-to-one-capped-v1';settlementRule:'all-legs-v1';legs:LegTerms[];
}
export interface Accounting {acceptedInflows:Amount;activePrincipal:Amount;sponsorReserved:Amount;failedPrincipalReserved:Amount;availableCredits:Amount;pendingTransfers:Amount;confirmedPaid:Amount}
export interface Credit {id:string;campaignId:string;kind:CreditKind;owner:string;recipient:string;legId?:number;available:Amount;pending:Amount;paid:Amount;pendingAttemptId?:string}
export interface Attempt {id:string;campaignId:string;creditId:string;recipient:string;amount:Amount;status:'Pending'|'Succeeded'|'Failed';createdAt:Millis;resolvedAt?:Millis;errorCode?:string;evidence:Evidence;resultEvidence?:Evidence}
export interface LegFunding {legId:number;active:Amount;provisionalMatch:Amount;closingActive?:Amount}
export interface Proposal {id:string;campaignId:string;daoId:string;status:ProposalStatus;termsHash:string;observedAt:Millis;executionEvidence?:Evidence}
export interface Campaign {id:string;terms:Terms;termsHash:string;state:CampaignState;createdAt:Millis;finalizedAt?:Millis;failureReason?:'SPONSOR_NOT_FUNDED'|'INCOMPLETE_BUDGETS';legs:LegFunding[];accounting:Accounting;participantCount:number;sponsorEvidence?:Evidence;proposal?:Proposal;credits:Credit[];attempts:Attempt[];fixture:boolean}
export interface Position {campaignId:string;accountId:string;legId:number;active:Amount;acceptedTotal:Amount;refundConsumed:boolean}
export interface Account {id:string;roles:string[];registered:boolean;balance?:Amount;positions:Position[];credits:Credit[]}
export interface Activity {id:string;v:1;campaignId:string;actor:string;kind:string;at:Millis;amount?:Amount;legId?:number;creditId?:string;attemptId?:string;evidence:Evidence;detail:string;fixture:boolean}
export interface Page<T> {items:T[];nextCursor?:string}
export interface Config {
 mode:Mode;network:'local'|'testnet';serverNowMs:Millis;daoId:string;tokenId:string;escrowId:string;tokenDecimals:number;tokenSymbol:string;
 capabilities:{reads:boolean;publish:boolean;contribute:boolean;claims:boolean;demoControls:boolean;proposalExport:boolean;walletSubmission:boolean};
 integration:{sourceWritten:boolean;unitTested:boolean;wasmBuilt:boolean;sandboxVerified:boolean;deployedTestnet:boolean;liveFlowVerified:boolean;detail:string;evidencePath?:string};
 accounts:{id:string;roles:string[]}[];
}
export interface ApiError {code:string;message:string;retryable:boolean;evidence?:Evidence;details?:Record<string,unknown>}
export type Envelope<T>={ok:true;data:T;source:Source}|{ok:false;error:ApiError;source:Source};
export interface CommandResult {campaign?:Campaign;credit?:Credit;attempt?:Attempt;proposal?:Proposal;account?:Account;evidence:Evidence}
export interface Custody {accounting:Accounting;observedTokenBalance:Amount;observedAt:Millis;transferExecutedAwaitingResolution:Amount;unallocatedSurplus:Amount;bookReconciled:boolean;tokenReconciliation:'Matched'|'InFlight'|'Mismatch'}
export interface CommandContext {actor:string;idempotencyKey:string}
```

Credit ID `${campaignId}:${kind}:${owner}:${legId ?? '-'}`; recipient immutable and equal creditor. Separate beneficiary credit per leg even duplicate beneficiary. Withdrawal/refund aggregate per owner across legs. Campaign detail returns at most50 recent attempts; activity paginated. List initially uses same Campaign shape, max20 campaigns/page. UI receives no private keys. Local references always local-<sequence>, never explorer links.

shared/client.ts AllTogetherClient methods: config, campaigns, campaign, account, custody, activity, publish, proposal, decideProposal, fundSponsor, pledge, withdraw, finalize, materializeRefund, claim, registerToken, seed, exportCampaign. Each maps exactly to route below and returns Promise<Envelope<specified data>> except exportCampaign returns Blob. Mutation context is last argument and becomes headers, not a trusted body organizer. B implements in web/src/api.ts. NEAR adapter maps Rust snake_case/U128 views into these semantics, never falls back to local data.

## Exact HTTP contract

Every JSON result including errors uses Envelope. Mutations require JSON <=32KiB, X-Demo-Actor and Idempotency-Key (8..128 printable chars). Idempotency scope actor+key; fingerprint method/path/canonical body. Same request replays exact committed status/result; different body returns409 IDEMPOTENCY_CONFLICT. Commit monetary state+event+idempotency result together before acknowledgment. URL-encode account/credit IDs.

| Route | Body/query | data |
|---|---|---|
| GET /api/config | — | Config |
| GET /api/health | — | {storage:'ok'\|'error',mode:'local',schemaVersion:1} |
| GET /api/campaigns | state?,cursor?,limit1..20 | Page<Campaign> |
| GET /api/campaigns/:id | — | Campaign |
| POST /api/campaigns | PublishInput | CommandResult |
| GET /api/accounts/:id | — | Account |
| GET /api/custody | — | Custody global |
| GET /api/campaigns/:id/custody | — | Custody; label observed token balance global if not isolatable |
| GET /api/campaigns/:id/activity | cursor?,limit1..50 | Page<Activity> |
| POST /api/campaigns/:id/sponsor-proposal | {} | CommandResult |
| POST /api/demo/proposals/:id/decision | {decision:'Approved'\|'Rejected'} | CommandResult |
| POST /api/demo/campaigns/:id/fund | {amount:Amount,termsHash:string} | CommandResult |
| POST /api/campaigns/:id/pledges | {legId:number,amount:Amount,termsHash:string} | CommandResult |
| POST /api/campaigns/:id/withdrawals | {legId:number,amount:Amount} | CommandResult |
| POST /api/campaigns/:id/finalize | {} | CommandResult |
| POST /api/campaigns/:id/refunds | {} | CommandResult |
| POST /api/credits/:id/claims | {} | CommandResult with pending attempt |
| POST /api/demo/register-token | {accountId:string} | CommandResult |
| POST /api/demo/seed | {scenario:'accounts'\|'walkthrough'} | {campaignIds:string[],seeded:boolean} |
| GET /api/campaigns/:id/export | format=json\|csv | downloadable attachment |

Publish201, claim202, other successful commands200. Invalid input400, wrong actor403, missing404, state/balance/deadline/idempotency conflicts409, unavailable503. Stable error codes VALIDATION_ERROR, NOT_FOUND, WRONG_ACTOR, IDEMPOTENCY_CONFLICT, DEADLINE_REACHED, DEADLINE_NOT_REACHED, NOT_FUNDED, INVALID_STATE, LEG_FULL, INSUFFICIENT_BALANCE, NOT_CREDIT_OWNER, TRANSFER_PENDING, NO_AVAILABLE_CREDIT, TOKEN_NOT_REGISTERED, PARTICIPANT_LIMIT, HASH_MISMATCH, RPC_UNAVAILABLE, STORAGE_NOT_FUNDED. LEG_FULL details.remaining is atomic string.

Local proposal creation organizer-only; decision/funding DAO actor only. Local fund requires approved proposal, exact reserve, DAO actual balance, hash, before deadline. Approval alone does nothing to custody. Actual escrow authenticates DAO token sender and does not trust offchain approval. Token registration selected actor-only, or explicit DAO demo control registering fixed beneficiaries. Callback resolution has no public HTTP success flag. Reject foreign Origin mutations and non-loopback Hosts; allow configured loopback UI origin and scripts omitting Origin. Loopback demo headers intentionally simulate actors, not production auth.

## Money, canonical terms and clock

shared/amounts.ts exports parseDisplayAmount(text,decimals), formatAmount, deriveLeg, checkedAdd/Sub and U128_MAX. Reject signs/exponents/commas/excess precision; preserve amount input strings. Derive S=min(K,floor(B/2)), C=B-S; B>=2, 0<K<=B. Sponsor reserve=sum S, not cap. No floating point or SQLite numeric SUM for amounts.

Terms canonicalization is UTF8 JSON.stringify of this fixed ARRAY with no whitespace/newline, SHA256 lowercase hex:

```text
["alltogether-terms-v1",schemaVersion,domain,escrowId,campaignId,organizer,
title,summary,detail,daoId,tokenId,tokenDecimals,tokenSymbol,deadlineMs,
participantLimit,matchRule,settlementRule,
legs.map(l=>[l.legId,l.title,l.purpose,l.beneficiary,l.budget,
l.declaredSponsorCap,l.sponsorAllocation,l.communityTarget])]
```

Store/hash exact validated strings. JS authoring normalizes NFC before publication; Rust hashes supplied stored strings without independent normalization. Server/contract assign domain/config/ID/organizer and derived fields. Coordinator supplies shared fixture exact terms, canonical string and digest, including Unicode and odd101/cap60 amounts. JS and Rust verify same vector. Deadline <=365days future, strictly future, u64 milliseconds. Production local Date.now and chain block_timestamp_ms are authoritative; injectable test clock exists only in tests. Boundary contribution/removal now<D, finalize now>=D. Short90/180-second live demos use real server time, no hidden clock.

## SQLite and asynchronous transfer persistence

DatabaseSync PRAGMA WAL, synchronous=FULL, foreign_keys=ON, busy_timeout5000. Versioned transactional migrations; reject newer schema. Single synchronous BEGIN IMMEDIATE write transactions, no await inside. Store amounts TEXT and calculate BigInt checked u128. Parameterized SQL. Core schema:

* meta(key PK,value): schema_version, seed markers, sequence metadata.
* accounts(id PK,roles_json,registered,balance TEXT): external demo wallets.
* campaigns(id PK,terms_json,terms_hash UNIQUE,state,created_ms,finalized_ms nullable,failure_reason nullable,fixture,sponsor_receipt nullable,accounting_json,participant_count).
* legs(campaign_id,leg_id composite PK,title,beneficiary,budget,declared_cap,sponsor_allocation,community_target,active,closing_active nullable).
* admissions(campaign_id,account_id composite PK): never delete on withdrawal.
* positions(campaign_id,account_id,leg_id composite PK,active,accepted_total,refund_consumed).
* credits(id PK,campaign_id,kind,owner,recipient,leg_id nullable,available,pending,paid,pending_attempt_id nullable).
* attempts(id INTEGER PK AUTOINCREMENT,campaign_id,credit_id,recipient,amount,status,created_ms,resolved_ms nullable,error_code nullable,evidence_json,result_evidence_json nullable).
* transfer_results(attempt_id PK,success,error_code nullable,executed_ms,evidence_json): immutable actual wallet movement result.
* proposals(id INTEGER PK AUTOINCREMENT,campaign_id,dao_id,status,terms_hash,observed_ms,execution_evidence_json nullable).
* events(id INTEGER PK AUTOINCREMENT,campaign_id nullable,actor,kind,at_ms,payload_json,evidence_json,fixture): indexed campaign,id.
* idempotency(actor,key composite PK,fingerprint,status,response_json).
* custody(id PK fixed1,balance,fixture_issued): actual token custody, issuance audit.

Foreign keys for campaign/credit relations, registration booleans and enum checks, indexes for pending attempts/credits/account positions. Monetary rows validated as canonical TEXT in application. Restart never reseeds/reset balances.

Pledge/sponsor transactions debit actual external wallet, credit custody and acceptedInflows, update exact funding categories. Withdrawal only converts active principal to credit. Finalize visits <=3 legs, never contributors: success creates all B beneficiary credits, failure creates DAO reserve credit and failedPrincipalReserved aggregate. Positions become historical by terminal campaign state; do not loop-clear them. Failed owner materializes <=3 positions once, marks consumed and reduces aggregate. Repeated terminal finalize/materialize returns unchanged state.

Worker (~300ms/startup sweep) has three durable boundaries:

1. Claim transaction reserves entire available into pending, persists unique Pending attempt, returns202. New withdrawal accrual can increase available meanwhile.
2. Execution transaction checks transfer_results first. If absent, registration/custody check determines result; success debits custody and credits fixed wallet and inserts success result atomically; failure inserts result with no movement. Exactly once even after crash.
3. Resolution transaction checks attempt still pending, consumes stored result, clears pending and adds paid/confirmedPaid or restores exact amount to available, marks terminal/event. Repeated processing no-op. Never restore positions. Restart repeats missing steps safely.

Independent checker recomputes categories from underlying positions/state/credits/attempts, not just saved aggregate. Verify acceptedInflows-confirmedPaid = active+sponsor+failed+available+pending; supply issuance=sum wallets+actual custody; pending credit equals its one pending attempt; terminal beneficiary entitlement only on success; admission <=128. Observed custody may temporarily differ from book after execution before resolution; expose InFlight and executed-awaiting-resolution amount. At quiescence observed custody equals live liabilities plus explicitly unallocated surplus. CSV escape all fields and prefix dangerous formula characters =,+,-,@,tab,CR. Exports include mode/domain/time/token/hash/closing totals/claims/attempts/real evidence.

## Seeds and complete UI

Defaults local escrow escrow.alltogether.testnet, DAO community.alltogether.testnet, token testusd.alltogether.testnet, six decimals testUSD. Actors organizer/alice/bob/venue/equipment/access under alltogether.testnet plus DAO. DAO10000 testUSD, Alice/Bob5000 each, others0; equipment unregistered to demonstrate recovery. Accounts seed once with fixture issuance events. These IDs are not deployed claims.

Walkthrough seed may include historical successful/failed fixture campaigns with true past deadlines and clearly marked fixture-origin records; use an invariant-checked fixture constructor, never pretend these were live transactions. Also publish one AwaitingFunding plan with actual serverNow+180sec deadline. Do not renew expired fixture deadlines silently. Ordinary authoring defaults tomorrow; separate short-deadline preset is labeled.

B implements Plans filters/create; authoring1..3budgets with derived reserve/community preview and immutable review; plan Overview/Activity/Custody; each A/C card, provisional match, actual reserve; DAO proposal/approval/fund; pledge confirmation; remove then separate claim; manual finalize after cutoff; My funds grouped active/withdrawal/refund/beneficiary/sponsor; registration+retry; JSON/CSV download. Actor preference only may use localStorage. Commands show pending/error/success, refresh authoritative data, poll2sec for pending/open. Full early budgets remain reversible. No beneficiary claim until entitlement exists, explain disabled state.

Warm background #f5f2eb, ink #172c2b, teal #157b70, amber #a56516; system typography. Desktop three-card dependency board, 360px stack. Semantic labels, error summary, visible focus, aria-live results, dialog focus return, reduced motion, status text besides color. Show UTC+local absolute date/countdown. Global banner exact local demo/no blockchain wording, Demo account selector and connection. No dollar signs/redemption claims. Unconfigured NEAR is visibly disconnected and cannot show local plans under chain banner. Chain signing unsupported => explicit export-only capability, no dead wallet buttons.

## Rust implementation and integration

State uses near_sdk store collections, bounded <=3legs, lifetime128 admissions, per-account campaign positions, deterministic credits and bounded current/last attempt per credit plus nonce. Historical attempts emit versioned NEP297-style events, not an ever-growing contract vector. Campaign indices support <=50 pagination. Checked u128 all monetary operations, predecessor auth except known token supplied sender. No owner sweep/edit/manual callback.

Methods/args (Rust JSON snake_case, U128 amounts/U64 timestamp strings; adapter converts shared camelCase):

* new(config): once, fixed DAO/token/metadata/rules/limits.
* quote_campaign_storage(leg_count:u8): required_yocto/reserved_bytes/limit128, based on measured worst-case serialization including128*3positions, owner withdrawal/refund credits, beneficiary/DAO credits and bounded attempts. Document margin and runtime storage_byte_cost.
* payable create_campaign(input): organizer predecessor, assigns ID/derived terms/hash, requires quote native deposit. Native storage/operating provision separate from testUSD. Excess retained with explicit disclosure, no promised refund. Validate all immutable strings/amounts/deadline.
* ft_on_transfer(sender_id,amount,msg): known token predecessor; msg<=2048bytes strict v1 schema; sponsor exact DAO/hash/reserve/awaiting/before deadline; pledge open/hash/leg/capacity/storage/admission. Reject logical invalid transfers by full unused amount, no mutation; accepted returns0. Unknown predecessor panics. Validate everything before writes.
* remove_pledge(campaign_id,leg_id,amount): predecessor owner, before cutoff, credit conversion only.
* finalize(campaign_id): permissionless, deadline and terminal idempotence, <=3legs, no participant iteration.
* materialize_refund(campaign_id): predecessor's <=3positions, consume once.
* payable claim_credit(credit_key): fixed recipient, owner-only contributor credits, permissionless beneficiary/DAO credits; reserve full available and unique nonce before promise. Check native operating gas/deposit provision. ft_transfer requires1yocto. Start FT25Tgas/callback20Tgas, measure/adjust with actual receipts.
* private on_transfer_result(credit_key,nonce): env promise result only, pending nonce validation, success paid or failure additive restore; duplicate/stale no-op; never funding changes.
* get_config/get_campaign/list_campaigns/get_account_campaign/get_credit/get_attempt/get_accounting: bounded views, numeric strings, source state. get_attempt takes credit key and returns current/last bounded attempt; full history comes from events/index.

Messages exactly {v:1,action:'sponsor',campaign_id,terms_hash} or pledge with leg_id. No claimed DAO name in JSON is authorization. Lifetime admission persists after withdrawal. Prepaid storage measurement must prove free retries cannot grow permanent storage; bounded last attempt plus nonce. No timeout-based pending retry or balance sweep.

C builds a genuine NEP141/145 test FT using near-contract-standards, six decimals; test issuance explicitly local/sandbox/testnet. Unit receiver context tests are not full integration. Integration scripts inspect actual token metadata/storage bounds, DAO get_policy/get_config/version/proposal bond, deployed escrow config/codehash. Registration uses queried storage bounds. Exact Sputnik FunctionCall proposal: receiver token, method ft_transfer_call, base64 UTF8 args {receiver_id:escrow,amount:reserve,memo, msg:JSON sponsor message}, deposit1yocto, measured gas; add_proposal bond is observed policy value. Description campaign/hash/budgets/beneficiaries/deadline. Unsupported deployed DAO schema => stop with explanation, never assumed compatible.

NEAR_NETWORK=testnet, RPC/TOKEN/DAO/ESCROW IDs explicit environment config. Preflight credentials/funding/accounts; sample IDs never treated as deployed. Coordinator may generate dedicated ignored demo keys if faucet permits, never user keys/stdout secrets. Real proof follows transfer_call receiver/resolver receipts and before/after ft_balance_of, not just top-level hash. Attempt actual testnet deployment and DAO funding if prerequisites accessible. Sandbox is separately identified if available; dependency failures do not waive native tests/WASM. Keep source/unit/WASM/sandbox/deployed/live status separate. Record artifact SHA256, deployed codehash, compiler/SDK/config, upgrade-key authority and receipt IDs. Mainnet disabled. Stuck callback incident guide inspects chain state/receipts; no unsafe pending reset.

## Verification and milestones

M0 coordinator writes frozen shared types/amounts/hash fixture, package scripts/config/lock; installs dependencies and probes actual CLI syntax. Typecheck boundary consumers, dispatch A/B/C.

M1 A tests isolated DB+test clock: D-1/D/D+1, odd101/cap60, excess precision/u128 overflow, wrong sponsor/hash/token, partial/excess reserve, insufficient balance, last-slot concurrent HTTP pledges,128 lifetime cap, two campaigns. Canonical failure400/125/50 => contributor575+DAO400 no beneficiary; success400/125/75 =>600/250/150 simultaneous credits. Withdrawal20 late failed callback never revives funding; new credit while pending preserved. Idempotency replay/conflict, repeat finalize/refund/callback, unauthorized claim, restart at each of three transfer commits. Assert independent invariants after every operation.

M2 B+coordinator completes live UI flow one/two/three legs, exact sponsor debit, selected-leg contribution, withdrawal+claim, deadline/manual finalize, refunds, failed equipment registration/retry, custody/export. Actual180sec walkthrough waits real time; automated tests use injected clock only. Verify keyboard and360px/desktop, no dead actions; restart server and reload exact balances. Capture screenshots only if actually observed.

M3 C cargo tests for all transitions, receiver rejections/unused return, private callback/stale nonce, withdrawals across finalization,128participants and bounded finalize. Deterministic generated operation sequences across two campaigns assert conservation/immutability/no double entitlement. Same golden hash vector, storage measurement, actual WASM build/artifact hash. Source alone fails this gate.

M4 coordinator+C attempt real testnet token+Sputnik funding, rejected overfill/late resolver returns, successful and failed campaign, actual refunds and beneficiary failure/retry. Reconcile downstream receipts/balances. State any sandbox-only proven branch precisely. Blocked external prerequisites remain visible capabilities false; local software still fully works.

M5 coordinator build/typecheck/test, cleanDB documented start, seed twice no double issuance, live walkthrough+pending restart. Review arithmetic/auth/immutability/origin/path/SQL/CSV/storage/gas boundaries. Fix and rerun affected tests. docs/EVIDENCE records actual commands/time/environment/results/artifacts/receipts, no invented checks. README includes commands/reset/trust limits/upgrade authority and independently names ArchivePass. Reset is separate confirmed local destructive flow, never startup behavior. All L1-L14 spec acceptance gates required; report every NEAR level honestly.

## Immediate dispatch

Coordinator bootstraps shared/config once, then A/B/C work concurrently in exclusive paths above. B can use labeled development fixtures while A builds but shipping local mode must call the real server. Integrate A+B immediately when routes work; C supplies view mapping and real chain scripts, coordinator integrates verified adapter capabilities. Complete first-product review/evidence before ArchivePass planning. Routine dependency/API adjustments are coordinator decisions, not reasons to stop the authorized implementation.
