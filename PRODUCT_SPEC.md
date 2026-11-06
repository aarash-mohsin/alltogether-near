# AllTogether — Product specification

Version: 1.0 · Specification date: 5 November 2026 · Track: Social Money

Project root: `C:\CryptoProject\alltogether`

Status: approved concept translated into an implementation contract; this document does not assert that software, a deployment, funded accounts, or wallet credentials already exist. The next deliverable is an implementation plan, followed by implementation and verification.

## 1. Product promise

**Fund the whole community plan, or nobody gets stranded.**

AllTogether helps a community with an existing Sputnik DAO fund a plan with one to three essential, separately earmarked budgets. The DAO commits a fixed matching reserve in advance. Contributors choose a budget. At one common deadline, either every budget reaches its required community contribution and all beneficiaries acquire their agreed entitlements, or the entire plan fails and contributors and the DAO can reclaim their respective funds.

The product prevents an organizer from spending the venue budget while accessibility or equipment remains unfunded. It does not guarantee that a beneficiary will deliver the promised real-world service after successful funding.

The distinctive mechanic is **dependent, earmarked budgets with all-or-none entitlement allocation**, not crowdfunding or matching by themselves. A single pooled fundraising target would hide a missing essential budget; separate campaigns would allow some obligations to fund while others fail.

### 1.1 Canonical example

An accessible community maker day needs all three obligations:

| Budget | Beneficiary example | Total budget | Required community principal | DAO match cap |
|---|---|---:|---:|---:|
| Venue | `venue.example.testnet` | 600 testUSD | 400 testUSD | 200 testUSD |
| Equipment | `equipment.example.testnet` | 250 testUSD | 125 testUSD | 125 testUSD |
| Accessibility | `access.example.testnet` | 150 testUSD | 75 testUSD | 75 testUSD |
| Total | Three fixed beneficiaries | 1,000 testUSD | 600 testUSD | 400 testUSD |

These account IDs are illustrative, not verified deployed accounts. `testUSD` is a test token, never represented as real USDC or redeemable dollars.

Matching is 1:1 up to the budget's cap. Thus 100 testUSD of venue contributions provisionally unlocks 100 testUSD of match; 400 unlocks its complete 200 cap. A provisional match is neither spendable nor a beneficiary entitlement. All matching reserve is physically funded before public contributions open.

### 1.2 Outcome and success measures

The first release succeeds when an unfamiliar evaluator can run the local app, create and fund a plan, contribute and withdraw, observe a deadline, finalize both success and failure cases, recover from a failed payout, and reconcile every test token after restarting the app.

NEAR integration succeeds separately when the same essential flow runs against an actual deployed contract and known NEP-141 token, with receipts and balances that can be independently verified. A local prototype is a valid software milestone but is not described as an onchain deployment.

Measure scenario completion, time to identify the blocking budget, time to find a refund, successful recovery after payout failure, and invariant violations. Target zero invariant violations and completion of each documented walkthrough without editing source code.

## 2. Context, originality, and competition

The Social Money track asks builders to add community coordination on existing Sputnik DAO or Trezu infrastructure, rather than create a replacement multisig. AllTogether uses the DAO's existing policy and voting process to approve a specific tranche. Only that tranche and the community's contributions enter the purpose-built escrow; the DAO retains its main treasury and governance. The starter bounty example's treasury-custody requirement is specific to that example, not evidence of a universal prohibition on escrow. This interpretation should be presented clearly, not as an organizer endorsement. [Social Money track](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/12-social.md)

| Project or approach | Relevant overlap | AllTogether's intended distinction | Evidence status |
|---|---|---|---|
| [Petty Cash](https://github.com/kasbsquall/petty-cash) | Sputnik community budgets | Rule-based individual spending versus multiple essential budgets that acquire entitlements together | Repository README inspected 5 Nov 2026 |
| [Patch Fund](https://github.com/emilhuseyn/patch-fund) | Existing Sputnik governance and named accounts | Verified security-fix bounties and earned trust versus funding dependency across fixed obligations | Repository README inspected 5 Nov 2026 |
| [ChaiPot](https://github.com/farahkhan199232-dot/new/tree/near-pot) | Group payments | Prior concept review describes shared bills and AI; AllTogether addresses whether an entire plan is fundable | Lead from preceding research; repository fetch unavailable during this specification pass; do not assert feature absence |
| [Proof of Ship](https://github.com/hey-research-lab/proof-of-ship-near) | Pooled escrow and refunds | Prior concept review describes shipment-attested settlement; AllTogether settles funding sufficiency without a delivery oracle | Lead from preceding research; repository fetch unavailable during this pass |
| [Rascals](https://github.com/therascalsdotfun/therascals) | Community coordination | Prior concept review describes a contributor DAO; AllTogether adds a narrowly scoped funding primitive to an existing DAO | Lead from preceding research; fetch unavailable during this pass |
| Ordinary all-or-nothing crowdfunding | Deadline and refunds | Every earmarked budget must independently qualify; excess in one cannot compensate for another | Established conceptual baseline, not an originality claim |
| Matching campaigns | Sponsor subsidy | Campaign-specific prefunding combined with dependent budget settlement | Established conceptual baseline |

The product must not claim to be the first matching pool, first escrow, or an atomic cross-account payout system. The UI and demo should prove its specific coordination benefit.

## 3. People and jobs

| Persona | Job | Required evidence or action |
|---|---|---|
| Community organizer | Assemble a viable plan without committing one supplier prematurely | Fixed obligations, beneficiaries, deadline, sponsorship request, shareable plan |
| Contributor | Support one obligation while knowing the entire plan must work | Chosen budget, remaining target, withdrawal cutoff, refund route, receipts |
| DAO reviewer | Approve a bounded subsidy with understandable conditions | Terms hash, complete reserve amount, beneficiaries, governance status, actual reserve receipt |
| Beneficiary | Know when payment is earned and recover a failed transfer | Fixed entitlement, available/pending/paid amounts, registration guidance, retry |
| Public observer | Verify that money has not been redirected | Immutable terms, custody accounting, activity, source-specific receipts, settlement export |

Named NEAR accounts identify accounts, not unique people. One person may control several accounts, including a beneficiary. Matching is value based, so splitting a contribution across accounts yields no extra match. Beneficiary self-funding can still capture a DAO subsidy; reviewer diligence is an explicit trust assumption.

## 4. Scope and release boundaries

### 4.1 Required vertical prototype

1. Create and validate a draft with one to three fixed budgets, a fixed beneficiary per budget, one deadline, and a single configured DAO and token.
2. Freeze a published proposal's terms and show a readable version plus deterministic terms hash.
3. Prepare and inspect the sponsorship request; distinguish requested, approved, executed, and actually received funding.
4. Accept one exact, fully funded sponsor tranche before opening contributions.
5. Contribute to a chosen budget with exact integer accounting and no overfill.
6. Remove any amount of one's active contribution before the deadline and reclaim it through a separate withdrawal credit.
7. Finalize after the deadline without iterating through contributors.
8. On success, create every beneficiary entitlement together; transfer each independently.
9. On failure, provide contributor pull refunds and return the sponsor reserve to the DAO.
10. Track available, in-flight, failed, and confirmed payments; restore the precise claim on failure.
11. Provide a public activity and custody ledger, account-specific claims, export, and honest integration status.
12. Persist the entire local flow across page reload and server restart, including pending transfer recovery.

### 4.2 Target NEAR release

Rust contract source, passing contract tests, a built WASM artifact, token/DAO integration scripts, configuration and deployment documentation, and a NEAR adapter are required project deliverables. Rust native compilation and the WASM target are now available in the workspace. Actual deployment and wallet operations require available credentials, accounts, network access, and funds; their absence must remain a visible limitation rather than trigger a fake fallback.

The implementation report must say which of these levels was achieved: source written; unit tested; WASM built; sandbox integration tested; deployed on testnet; live flow verified. Do not collapse them into “NEAR ready.”

### 4.3 Stretch only after acceptance

Reusable plan templates, multiple DAOs, reminders, and a later SeatRelay event-attendance phase. None may delay a reliable refund or callback implementation.

### 4.4 Explicit exclusions

Arbitrary dependency graphs, more than three budgets, multiple currencies, automatic exchange, cross-chain assets, yield, new governance tokens, reputation scoring, AI-generated financial decisions, attendance, physical-delivery verification, disputes/arbitration, beneficiary changes, deadline extensions, reallocations, early successful settlement, and a replacement multisig.

No mainnet release is authorized by this specification. No platform fee is deducted in the MVP. Native gas, DAO proposal bonds, and storage deposits are separate from testUSD principal.

## 5. Vocabulary and immutable terms

A **plan** is the user-facing name for a campaign. A **budget** is the user-facing name for an onchain leg. A **pledge** is accepted token principal, not an offchain promise. A **reserve** is received sponsor principal. A **credit** is an available obligation to a fixed recipient. A **transfer attempt** is an asynchronous attempt to discharge that credit. “Funded” never means merely approved by the DAO.

The immutable campaign terms contain:

- Schema version, network/mode domain, escrow identity, campaign ID, organizer account.
- Title (1–80 characters), summary (1–500), optional plain-text detail (maximum 2,000); no HTML execution.
- DAO account, token contract, expected token decimals, token display name.
- One to three ordered legs: stable leg ID, title (1–60), short purpose (maximum 240), fixed beneficiary, total budget, declared sponsor cap, and derived effective sponsor allocation.
- Common deadline in UTC, storage/participant limit, match rule version, and settlement rule version.

Each leg has total budget `B_i >= 2` atomic units and declared sponsor cap `0 < K_i <= B_i`. Derive the effective sponsor allocation `S_i = min(K_i, floor(B_i / 2))` and required community principal `C_i = B_i - S_i`. Reserve only `S_i`, not the declared maximum `K_i`; the DAO transfers exactly the sum of effective allocations. Display both when they differ, and include both in immutable terms. This guarantees that completing a leg earns its full 1:1 capped reserve without overfunding an odd atomic-unit target. For example, a budget of 101 units with declared cap 60 reserves 50 and requires 51 community units; its beneficiary receives exactly 101, never 102. No excess sponsor-return credit is needed because excess is never accepted. Beneficiary duplication across legs is allowed, visible, and does not merge earmarked budgets. All arithmetic uses atomic token units.

Use one known testUSD contract with verified metadata; the initial development token should use six decimals. A different decimal precision must come from configuration and validated metadata, never a UI assumption. Store onchain amounts as checked `u128`; transport them as decimal strings; use `bigint` in JavaScript domain calculations. Never use floating point for balances or compare formatted display values.

Hash a documented canonical serialization with SHA-256, including fixed field order, UTF-8 encoding, decimal-string amounts and timestamps, ordered legs, and domain identifiers. Publish a golden-vector test that TypeScript and Rust can both verify. Do not hash arbitrary object serialization or locale-formatted text. Contract-generated terms and hash are authoritative on NEAR.

Local drafts are mutable. Publication/contract creation freezes all terms, stronger than merely freezing at opening. Editing a published plan means making a new campaign with a new hash. An unfunded plan may be archived in the UI, but its terms and history remain inspectable.

## 6. Formal lifecycle and authority

### 6.1 Campaign state

`Draft` is a local authoring state only. The persisted escrow states are:

```text
Draft --publish--> AwaitingFunding --exact sponsor receipt before D--> Open
                         |                                           |
                         | now >= D                                  | now >= D
                         v                                           v
                       Failed                         all A_i == C_i ? Succeeded : Failed
```

`Succeeded` and `Failed` are terminal campaign outcomes. Claims and transfer attempts continue after terminal settlement; the campaign must not be relabeled “Paid” just because one transfer succeeds. A display-only “All payments complete” badge is derived from zero outstanding claims and no pending attempts.

| Operation | Guard | Result |
|---|---|---|
| Publish | Valid immutable terms, future deadline, storage provisioned | `AwaitingFunding`, reserve zero |
| Fund sponsor | Known token predecessor; sender is configured DAO; exact `sum S_i`; `now < D`; state `AwaitingFunding` | Accept entire tranche, allocate per-leg reserve, set `Open` |
| Pledge | Known token; `Open`; `now < D`; valid leg; positive amount at most remaining; funded storage/slot | Add to account-leg principal and `A_i` |
| Remove pledge | Caller owns position; `Open`; `now < D`; amount positive and at most active position | Deduct position and `A_i`, create/increase withdrawal credit |
| Finalize | Any caller; `now >= D`; not terminal | Bounded check of up to three legs, set terminal outcome and obligations |
| Finalize again | Already terminal | Return existing result without duplicating credits |
| Materialize refund | Failed campaign; owner's unconsumed position | Convert that position into refund credit once |
| Claim credit | Authorized trigger; positive available amount; no conflicting attempt | Move exact amount from available to pending and schedule transfer |
| Resolve transfer | Private contract callback for known attempt and result | Complete payment or restore same credit once |

The contribution/withdrawal boundary is strictly `now < D`; finalization is `now >= D`. Chain time is `env::block_timestamp`; local authority is the server's UTC clock. The browser countdown is guidance, never authorization. A transfer initiated before the deadline but received by the escrow after it is rejected and returned through the token resolver.

Full funding early does not finalize or lock withdrawal. The UI says “All budgets reached their targets. Funding remains reversible until [deadline].” A withdrawal may make a previously full budget incomplete.

An unfunded plan expires to `Failed` with reason `SPONSOR_NOT_FUNDED`; it has no contribution or sponsor refund obligation. The MVP accepts no partial sponsor funding, so no stranded partial reserve exists. Sponsor funding that arrives after expiry is returned in full.

### 6.2 Governance is a separate state machine

Proposal status is observational metadata: `NotSubmitted`, `InProgress`, `Approved`, `Rejected`, `Expired`, `ExecutionFailed`, or `Unknown`, normalized from actual supported DAO responses. Never let a local status toggle open an onchain campaign.

Approval can precede execution or token acceptance. Even an approved proposal with a successful-looking upstream transaction does not establish receipt. Only authenticated `ft_on_transfer` acceptance funds the escrow. Show proposal and funding states side by side. Multiple unsuccessful proposal attempts may reference one immutable campaign; only its one exact sponsor tranche can be accepted.

### 6.3 Role and permission rules

- Organizer: create drafts and publish terms; no power to redirect funds, extend deadlines, finalize early, or reclaim someone else's principal.
- DAO: only accepted source of sponsor reserve, through its actual account as token sender. Existing DAO policy governs proposal creation and voting.
- Contributor: add own principal, remove own active principal before the cutoff, and materialize/claim own refunds or withdrawal credits. No arbitrary recipient argument.
- Anyone: inspect, finalize, and trigger fixed-recipient beneficiary payments or return the failed sponsor reserve. Permissionless triggering cannot change recipient or amount and avoids requiring a DAO governance round simply to receive its refund.
- Beneficiary: inspect and receive its fixed entitlement, and trigger/retry it like any caller.
- Contract callbacks: private, attempt-specific, idempotent. No external caller may manufacture a result.

Use immediate predecessor identity for authorization, except the authenticated token receiver path where the known token supplies `sender_id`. Never authorize ordinary state changes through `signer_account_id` alone.

## 7. Accounting model

### 7.1 Per-leg funding

For each leg `i`:

```text
S_i = min(K_i, floor(B_i / 2))          effective sponsor allocation
C_i = B_i - S_i                         required community principal
0 <= A_i <= C_i                         current active community principal
M_i = min(A_i, S_i)                     provisional earned match
R_i = S_i while Open                    campaign-specific prefunded reserve
success = every leg has A_i == C_i      evaluated once at deadline settlement
```

Show `A_i / C_i` as the primary progress. Show `M_i / S_i` as provisional match and `S_i` as physically reserved. Do not portray `A_i + S_i` as spendable funding. Aggregate progress is secondary and must never hide a missing leg.

MVP overfill policy is **reject the entire incoming transfer and return the entire amount**, not partial acceptance. Re-read remaining capacity for the confirmation UI, but enforce it on the contract/server even under concurrent submissions. A rejected transfer creates no pledge or accepted-inflow ledger record; record a rejection event where feasible. The token's refund resolution may itself be asynchronous.

### 7.2 Liability categories

Maintain disjoint accounting categories, per campaign and in global totals:

- `active_principal`: eligible contributions while Open.
- `sponsor_reserved`: received DAO reserve before settlement.
- `failed_principal_reserved`: failed-campaign principal whose owner has not yet materialized a refund.
- `available_credits`: withdrawal, contributor refund, beneficiary, and sponsor-refund credits, each with a fixed creditor.
- `pending_transfers`: amount moved out of an available credit into a specific unresolved attempt.
- `confirmed_paid`: cumulative successfully discharged credits, not an outstanding liability.

The conservation invariant in the contract's confirmed accounting is:

```text
accepted_inflows - confirmed_paid
  = active_principal + sponsor_reserved + failed_principal_reserved
    + available_credits + pending_transfers
```

Every unit belongs to exactly one live liability category. An attempt in flight is no longer available to claim, but remains reserved. Campaigns cannot use each other's reserves. Native NEAR operating balance, storage staking, refundable native deposits, and yoctoNEAR attached to token transfers require separate accounting and do not appear as testUSD.

The equation is a **book accounting** invariant. During an asynchronous token transfer, actual token balance may already have fallen before its callback records `confirmed_paid`. Do not equate a separately queried token balance to the book balance at arbitrary receipt boundaries. Display observed token balance with observation block/time, book liabilities, in-flight amount, and reconciliation state. At quiescence, in the absence of unsolicited direct transfers, actual token custody equals outstanding liabilities. Unexpected direct `ft_transfer` deposits are unallocated surplus, never silently assigned as match or pledges; the MVP has no unrestricted sweep that could endanger obligations.

### 7.3 Withdrawals cannot revive funding

`remove_pledge(campaign, leg, amount)` first and permanently converts active principal into a withdrawal credit. It does not depend on a transfer succeeding. Starting the token payout is a separate operation; the UI may guide the user through both operations, but must explain the second wallet action.

If the transfer fails after the deadline or after successful finalization, restore the withdrawal credit, **not the contribution position or active total**. The removed amount remains outside the plan forever unless the owner makes a new valid pledge before the deadline. This rule eliminates callback races that could change the settlement result.

### 7.4 Success settlement

In one local contract state transition:

1. Verify every `A_i == C_i` using at most three records.
2. Mark `Succeeded` and snapshot closing funding totals.
3. Move active principal and sponsor reserve out of their categories.
4. Create one beneficiary credit of `B_i = C_i + S_i` for each leg.

No transfer is required for finalization to succeed. No beneficiary can claim before this transition. Existing withdrawal credits and pending withdrawal attempts remain unchanged. Individual contribution records remain historical; they no longer represent a refundable entitlement after success. No contributor loop is performed.

### 7.5 Failure settlement and lazy refunds

In one bounded transition, mark `Failed`, snapshot closing totals, move `sum A_i` into `failed_principal_reserved`, and convert the complete sponsor reserve to one fixed DAO refund credit. Create no beneficiary credit.

Each contributor later materializes its own refund by reading at most three positions. Mark those positions consumed and reduce `failed_principal_reserved` by the exact amount while increasing that contributor's available refund credit. A second request cannot recreate the amount. A failed payout restores the available refund credit, not the consumed positions. This design permits bounded finalization even at the participant cap.

### 7.6 Transfer attempts and retries

Each attempt has a unique monotonically assigned ID, campaign, credit key, creditor, amount, status, creation time, and outcome references. Use `Pending -> Succeeded | Failed`; repeated callbacks are no-ops or safely rejected after the recorded terminal result. Allow at most one pending attempt per credit key. An unrelated new withdrawal can accumulate into the available portion while an older portion is pending; callback restoration adds the failed amount without overwriting newer credit.

Before scheduling `ft_transfer`, move the selected available amount to pending. Success removes pending and adds to `confirmed_paid`. Failure removes pending and restores the same available credit. Receiver registration failures must be retryable without changing campaign outcome or recipient. Retrying creates a new attempt ID.

Do not refund or retry a pending onchain attempt merely because a UI timeout expires: it may already have transferred. Show “Awaiting chain confirmation” and reconcile receipt/contract state. Reserve enough gas for the private callback; document a stuck-callback incident procedure. An unsafe manual state override is out of scope.

### 7.7 Worked examples

**Failure:** Venue reaches 400, equipment 125, accessibility 50. Community principal is 575; sponsor reserve is 400. Total accounted custody is 975. Although two budgets are full, the plan fails because accessibility is 25 short. Contributors can reclaim 575 total, the DAO can reclaim 400, beneficiaries receive zero. No venue payout exists.

**Success:** Community principal is 400 + 125 + 75 = 600. With 400 sponsor reserve, settlement creates beneficiary credits of 600, 250, and 150 in the same state transition. If the venue pays successfully and equipment fails for missing token registration, 600 is paid and 400 remains owed across the other credits. Equipment failure does not undo venue payment or the successful outcome.

**Withdrawal race:** Venue has 400, of which Alice owns 50. Alice removes 20 just before the deadline. Venue immediately becomes 380; a 20 withdrawal credit exists. Even if its payout callback arrives after finalization and fails, venue stays 380 and Alice's credit becomes available again. The plan fails unless a new valid contribution fills the 20 gap before the deadline.

**Residual withdrawal plus success:** Alice's 20 withdrawal remains pending, Bob replaces the 20 before the deadline, and all budgets fill. Settlement creates the usual 1,000 beneficiary credits; Alice's extra 20 pending withdrawal is backed by the earlier accepted inflow. The escrow owes 1,020 in book accounting before any payouts, without double counting Alice in active principal.

## 8. User experience and exact flows

### 8.1 Navigation and visual direction

Use a calm, credible community-finance interface: warm neutral background, clear typography, deep ink text, restrained teal for healthy progress, amber for incomplete dependencies, and red only for errors or terminal failure. The three-budget board is the visual center, not a token price chart. Avoid decorative wallet jargon and investment imagery.

Primary navigation: **Plans**, **My funds**, **DAO review**. A plan detail has **Overview**, **Activity**, and **Custody** sections or tabs. Keep mode, current identity, and connection status visible globally.

Local mode banner: **“Local demo · test balances stored on this computer · no blockchain transactions.”**

Configured testnet banner: **“NEAR testnet · testUSD has no monetary value.”**

Unconfigured NEAR view: **“NEAR integration is not configured. Read the deployment guide to connect a contract.”** Mutating chain buttons stay unavailable; do not route them to the local engine.

### 8.2 Plan list

Cards show title, common deadline, state, each leg's short progress, sponsor received amount, and a blocking-budget summary. Filters: Open, Awaiting funding, Succeeded, Failed. Empty state offers “Create a plan” and a separate “Load local walkthrough” action in local mode.

Example card copy: **“Two budgets ready. Accessibility still needs 25 testUSD. Every budget must be ready by the deadline.”** Do not rank plans by speculative returns or promise beneficiaries will deliver.

### 8.3 Organizer authoring

1. Enter plan title and purpose.
2. Add one to three budgets, each with beneficiary, total budget, and sponsor cap. Show derived required community amount and an inline 1:1 cap explanation.
3. Choose one deadline. Show UTC and local timezone together and a review summary before publish.
4. Review all accounts, token identity, totals, rule text, and storage charge. Highlight that published terms cannot change.
5. Publish. Present immutable terms hash and “Prepare DAO sponsorship request.”

Validation is inline and repeated server/contract side. Reject malformed accounts, unknown token, zero or negative values, budgets below two atomic units, excessive precision, total overflow, more than three legs, declared cap above the total budget, past deadlines, and unbounded text. When a declared cap exceeds half the budget, show the derived effective allocation and exact community requirement before publication. Do not rely on HTML `number` fields to parse token amounts.

Local walkthroughs may offer deadlines 90–180 seconds in the future using the real server clock. Normal authoring should default to a reasonable future day. Any shorter minimum for demonstrations is labeled; onchain validation must use the actual declared deadline, never a fake timer.

### 8.4 DAO review

Show the immutable plan, beneficiaries, community requirements, sponsor amount, token/escrow identities, terms hash, current DAO proposal policy/bond if available, proposal status, and reserve status.

Primary copy while approved but not funded: **“DAO approval recorded. Contributions open only after 400 testUSD reaches this escrow.”**

In local mode, explicitly labeled demo council controls may approve/reject and execute a funding transfer from the persistent demo DAO balance. Approval alone does not debit its balance or open the plan. If the DAO balance is insufficient, execution fails without opening it.

In NEAR mode, create the actual supported Sputnik proposal via a wallet or provide a precise exportable proposal payload and verified execution instructions if wallet submission is not implemented. Vote in the DAO's supported interface; do not build a new council implementation. Report export-only integration as such.

### 8.5 Contributor flow

1. Inspect each budget and the shared outcome rule.
2. Choose a budget; enter token amount; show remaining room, wallet/demo balance, provisional match effect, beneficiary, deadline, and refund behavior.
3. Confirm a real transfer request to the configured escrow. Handle registration as a separate explained step when needed.
4. Display submitted/pending state; only authoritative receipt acceptance changes the displayed confirmed principal.
5. Show a receipt in the activity ledger and the user's position in My funds.

Confirmation copy: **“You are contributing 25 testUSD to Accessibility. This plan pays beneficiaries only if every budget reaches its target by [date]. You can remove your contribution before that deadline.”**

Overfill error: **“This budget has room for 15 testUSD. Your 20 testUSD transfer was not accepted.”** If chain resolution is pending, append “Token return is awaiting confirmation”; never say returned until observed.

Removal flow: explain **“Remove this amount from the plan, then transfer your available withdrawal credit to your wallet.”** Once removed, show the funding drop immediately, even if payout is pending or failed. Account view separates active contributions, available withdrawals, failure refunds, and paid amounts.

### 8.6 Finalization and beneficiary flow

At the deadline, show **“Funding closed. Anyone can finalize the result.”** A contributor cannot send more or remove a pledge while waiting for finalization. A local background convenience worker may invoke the same public finalize command, but a visible manual control remains available and server time is authoritative.

Succeeded copy: **“Every budget reached its target. Beneficiary credits are now available.”** Each row shows entitlement, available, pending, and paid. Do not show “all paid” until every actual transfer has confirmed.

Failed copy: **“The plan did not fully fund. No beneficiary credit was created. Contributors can claim their principal, and the DAO can reclaim its reserve.”** Highlight the exact failed leg(s), not only a total percentage.

Beneficiary failure copy: **“Transfer failed. Your 250 testUSD credit is still available. Register this account with the token, then retry.”** Detected errors may vary; when cause is unknown say so and show the raw receipt detail behind a disclosure.

### 8.7 Custody and activity

Display mode/network, token, escrow, immutable hash, accepted inflows, each liability category, confirmed paid, and reconciliation status. Show campaign and global values where useful, clearly scoped. Paginate activity; include actor, action, atomic and display amount, timestamp, leg, campaign outcome, and receipt reference.

Local receipts use a visible `local-...` prefix and are labeled local ledger receipts. Do not provide explorer links for them. Real NEAR references include network-specific transaction/receipt links only for observed identifiers. A wallet transaction hash alone is not sufficient evidence that every downstream receipt succeeded.

Export JSON and CSV with mode, network, token contract, decimals, terms hash, generation time, closing totals, claims, attempts, and receipt references. Guard CSV cells that begin with spreadsheet formula characters. Exports are records, not a financial audit certificate.

### 8.8 Accessibility and responsive behavior

Meet practical WCAG 2.2 AA expectations: semantic headings and controls, keyboard access, visible focus, error summaries associated with inputs, text labels for statuses, sufficient contrast, and reduced-motion support. No color-only distinction between full and incomplete legs. Amount inputs use suitable mobile input modes and retain exact typed strings until validated.

At 360 px width, stack budget cards and keep primary actions reachable without horizontal scrolling. At desktop widths, show all three dependencies together. Tables may scroll inside labeled regions; primary account/claim actions must not require precision scrolling. Preserve focus after modals, announce transaction outcomes politely, and offer absolute dates alongside countdowns.

## 9. Technical architecture

### 9.1 Separation of concerns

Prefer React and TypeScript for the browser when dependencies are accessible. Keep monetary domain logic independent of UI framework. Use a Node-based local service with a durable transactional store and a separate Rust NEAR contract. Pin versions actually verified in the environment rather than inventing compatible versions in this specification.

Environment facts verified by the coordinating engineer during specification: Node 24.22.1 with working built-in `node:sqlite`; bundled pnpm 11.25; Rust 1.99.1 GNU native compilation; installed `wasm32-unknown-unknown` target; and cargo-near 0.22.0. `C:\CryptoProject\scripts\with-rust.ps1` activates the workspace-local Rust toolchain without changing system PATH. Dependency-registry access requires the environment's reviewed escalation path. Use SQLite transactions for local persistence; a storage fallback is unnecessary unless an actual later incompatibility is demonstrated. Contract build and tests are therefore required, not optional tooling aspirations. Testnet account credentials and funding are still unconfirmed.

Recommended boundaries inside this project only:

```text
alltogether/
  PRODUCT_SPEC.md
  IMPLEMENTATION_PLAN.md
  README.md
  web/                 UI and mode-specific adapters
  shared/              DTOs, amount parsing, canonical terms fixtures
  server/              local demo authority and durable ledger
  contract/            Rust escrow source and tests
  scripts/             setup, scenario, deployment and verification tools
  tests/               domain/integration/browser scenarios
  docs/                threat model, deployment and verified evidence
```

Implementation may adjust this layout for a compact toolchain while preserving boundaries. ArchivePass is a separate project at `C:\CryptoProject\archivepass`: no shared escrow, state database, contract, package identity, or claims ledger. The two READMEs should name each other for the hackathon's independence disclosure.

### 9.2 Adapter contract

The UI depends on a small `AllTogetherClient` interface for metadata, campaign list/detail, account state, creation, sponsorship, pledge, removal, finalization, claims, activity, and exports. Local and NEAR adapters return the same semantic states but distinct source evidence. Include `mode`, `network`, `observedAt`, optional block reference, and integration capabilities in responses.

Do not implement the NEAR adapter by returning seeded local results on network errors. A disconnected chain remains disconnected. Read failures preserve last-known data with stale labeling and disable actions that cannot be safely confirmed.

### 9.3 Durable local mode

The local service is the sole authority for clock, balances, permission checks, transactions, and idempotency. Browser localStorage may retain UI preferences or drafts but is not the authoritative money ledger.

Use a proven transactional store such as SQLite if available. A fallback append-only journal plus atomic snapshots is acceptable only if crash consistency, serialized mutation, recovery, and durability-before-acknowledgment are demonstrated; a naive JSON overwrite is insufficient. Do not require an external hosted database for the core walkthrough.

Persist accounts and test balances, campaign terms/outcomes, positions, credits, transfer attempts, token registrations, governance simulation status, events, and idempotency results. A successful response must survive immediate process restart. Serialize or transact conflicting mutations so concurrent last-slot pledges cannot overfill.

Local identity selection is an explicit role simulator, not real authentication. Label it “Demo account”; bind any issued session to the selected identity and still enforce ownership in the domain layer. Keep local service bound to loopback by default and disable demo-role controls outside local mode. Reject cross-origin mutation requests; document the local simulator's trust boundary.

Provide an explicit, idempotent seed operation with funded demo accounts and a DAO. Seed ledger entries are marked fixture issuance, not blockchain deposits. Restarting the service must not reseed balances or erase work. Reset is a separate local-only destructive action with clear UI confirmation.

Transfers simulate real ledger movement, not cosmetic success states. Persist a pending attempt, process it against recipient registration and available escrow balance, record the actual transfer result once, then settle the credit. On restart, reconcile pending attempts from the persisted transfer result without paying twice. Failure injection is local-only and labeled. It must exercise the same recovery path as a registration failure.

### 9.4 Data entities

| Entity | Minimum fields |
|---|---|
| Config | Mode, schema version, DAO, token, decimals, escrow identity, caps, deployment/version evidence |
| Campaign | ID, organizer, immutable terms and hash, state, timestamps, deadline, reserve funding receipt, closing snapshot, failure reason, aggregate accounting |
| Leg | Campaign ID, bounded index, title/purpose, beneficiary, `B`, declared `K`, effective `S`, `C`, current/closing `A` |
| Position | Campaign/account/leg key, accepted principal history, active principal, failure-refund consumption marker |
| Credit | Campaign/type/owner/optional-leg key, fixed recipient, available amount, pending amount, paid amount |
| Attempt | Unique ID, credit key, recipient, amount, state, source reference, result reference, timestamps, error code |
| Proposal reference | DAO, proposal ID, kind, terms hash, observed status, observation time, execution reference |
| Event | Monotonic local/event ID, version, campaign, actor, kind, relevant amounts, time, source evidence |
| Demo account | Account ID, role labels, token registration, persistent test balance |

Do not store wallet private keys in the app, browser bundle, local database, repository, examples, or exports.

### 9.5 Proposed local HTTP API

Exact naming can be finalized in the implementation plan, but preserve these operations:

| Method/path | Behavior |
|---|---|
| `GET /api/config` | Mode, capabilities, token and deployment information |
| `GET /api/campaigns` | Paginated summaries and filters |
| `POST /api/campaigns` | Publish validated immutable terms |
| `GET /api/campaigns/:id` | Terms, funding state, outcome, aggregates |
| `GET /api/accounts/:id` | Public positions and credits; no secrets |
| `POST /api/campaigns/:id/sponsor-proposal` | Create local proposal record or prepare supported chain payload |
| `POST /api/demo/proposals/:id/decision` | Explicit local simulation, no chain-equivalent claim |
| `POST /api/demo/campaigns/:id/fund` | Debit actual local DAO balance and receive exact reserve |
| `POST /api/campaigns/:id/pledges` | Accept authenticated actor's exact principal for a leg |
| `POST /api/campaigns/:id/withdrawals` | Convert actor's active principal into withdrawal credit |
| `POST /api/campaigns/:id/finalize` | Evaluate authoritative deadline and finalize once |
| `POST /api/campaigns/:id/refunds` | Materialize actor's failed principal once |
| `POST /api/credits/:id/claims` | Start an authorized fixed-recipient transfer |
| `GET /api/campaigns/:id/activity` | Paginated auditable events |
| `GET /api/campaigns/:id/export?format=json|csv` | Mode-labeled records |
| `POST /api/demo/register-token` | Persist local token registration |

All monetary mutation requests carry an idempotency key. The same actor/key/body returns the existing result; key reuse with a different body is a conflict. Contract methods rely on state guards and transfer identity, not a server-generated idempotency key as a security boundary. Use structured errors with stable code, useful message, retryability, and receipt reference when known. Examples: `DEADLINE_REACHED`, `NOT_FUNDED`, `LEG_FULL`, `INSUFFICIENT_BALANCE`, `NOT_CREDIT_OWNER`, `TRANSFER_PENDING`, `TOKEN_NOT_REGISTERED`, `STORAGE_NOT_FUNDED`, `PARTICIPANT_LIMIT`, `RPC_UNAVAILABLE`.

## 10. NEAR escrow and DAO integration

### 10.1 Contract surface proposal

The Rust implementation should expose small methods with checked arithmetic and bounded work:

| Method | Purpose |
|---|---|
| `new(config)` | Initialize once with fixed DAO, token, limits and rules |
| `create_campaign(terms)` | Validate/freeze terms; require sufficient native storage provision |
| `ft_on_transfer(sender_id, amount, msg)` | Accept only known token; route sponsor/pledge; return full amount on a rejected logical transfer |
| `remove_pledge(campaign_id, leg_id, amount)` | Convert caller's active principal into withdrawal credit |
| `finalize(campaign_id)` | Permissionless, deadline-bound, up to three legs |
| `materialize_refund(campaign_id)` | Consume caller's failed positions, at most three |
| `claim_credit(credit_key)` | Enforce trigger rules; transfer only to stored recipient |
| `on_transfer_result(attempt_id)` | Private promise-result callback; resolve exactly once |
| `get_campaign`, `list_campaigns` | Bounded views with pagination |
| `get_account_campaign`, `get_credit`, `get_attempt` | Inspect authoritative positions and payment state |
| `get_accounting`, `get_config` | Inspect liabilities, limits and deployment identity |

Token receiver message examples:

```json
{"v":1,"action":"sponsor","campaign_id":"42","terms_hash":"..."}
{"v":1,"action":"pledge","campaign_id":"42","leg_id":2,"terms_hash":"..."}
```

Restrict message byte length, version, schema, campaign/leg values and hash. Check `predecessor_account_id == configured_token`. Only sponsor messages with token-supplied `sender_id == configured_dao` qualify. A user passing the DAO name in JSON is not sponsor authorization.

The NEP-141 transfer-call path reports the amount the receiver did not use; the implementation must return the full amount when rejecting an overfill or late receipt and zero only for a fully accepted transfer. Outgoing token transfers require the standard attached deposit. Test the complete promise chain and refund behavior, not just the receiver method in isolation. [NEP-141](https://github.com/near/NEPs/blob/master/neps/nep-0141.md)

All promise callbacks must be private, validate their unique pending attempt, and avoid state changes based on unauthenticated user-supplied success flags. [NEAR callback guidance](https://docs.near.org/smart-contracts/security/cross-contract-calls/callbacks)

### 10.2 Storage and bounded work

Set an immutable maximum of **128 distinct contributor accounts ever admitted per campaign** for the MVP; each account has up to three bounded positions. Withdrawing to zero does not erase admission history or allow slot churn to grow storage without limit. Existing admitted accounts may contribute again before the deadline. Pagination limits are bounded, e.g. at most 50 records per view.

The creator must fund campaign storage, including the reserved worst-case participant/claim capacity, or an equivalent explicit account-registration design must be selected and proven before implementation. Preferred MVP: prepaid campaign capacity avoids attaching native deposits through the token receiver path. Compute the actual required storage charge from measured worst-case serialization and the runtime storage-byte cost, with documented margin; do not invent a fixed fee without measurement. Reject campaign creation if the deposit is inadequate. Report native charges and any excess handling explicitly. Do not promise native storage refunds in the MVP unless implemented and tested.

Transfer attempts must not make permanent onchain storage grow unbounded for free. Keep a bounded current/last attempt record per credit and emit historical attempts as events, or charge demonstrable additional storage. Retain sufficient monotonic nonce/tombstone state to reject stale callbacks. The local ledger can retain full history with pagination and disk limits.

Register escrow, DAO, and intended beneficiaries with the token before normal flows where possible. Missing or later-revoked beneficiary registration remains a recoverable transfer error. Query actual token storage bounds rather than hardcoding registration cost. [NEP-145](https://github.com/near/NEPs/blob/master/neps/nep-0145.md)

### 10.3 Sputnik proposal preparation

Read the deployed DAO's configuration/policy and verify its version/capabilities. Use its actual proposal bond and permission model; do not assume a constant bond or that the current repository schema exactly matches the deployed instance.

Preferred portable proposal: a supported `FunctionCall` to the configured token invoking `ft_transfer_call` with escrow receiver, exact sponsor amount, and the sponsor message/hash. The DAO attaches the required token-transfer deposit and appropriate tested gas. If the deployed DAO supports a token `Transfer` proposal with `msg`, that may be used after verification. Current Sputnik source shows both function-call and token-transfer facilities; it is evidence of available implementation paths, not proof of a specific deployment's behavior. [Sputnik proposal source](https://github.com/near-daos/sputnik-dao-contract/blob/main/sputnikdao2/src/proposals.rs)

The governance proposal description includes campaign ID, hash, readable budget breakdown, common deadline, sponsor amount, and escrow/token identities. Export the exact proposal JSON for inspection. The frontend must refresh the actual DAO policy/bond close to signing and handle policy changes or expired proposals.

Track proposal approval and execution as observations. The escrow receives sponsor authority from the actual DAO-originating token transfer. Do not attempt to trust an organizer's claim that a proposal passed. Do not grant AllTogether blanket treasury spending permissions.

### 10.4 Deployment and operations

Provide explicit environment configuration for network, RPC, token, DAO, escrow, and optional wallet adapter. Pin and document compiler/SDK versions used to produce WASM and record artifact hash, deployed code hash, initialization arguments, and test evidence. Verify the deployed configuration matches the UI before enabling transactions.

A deployment script must stop clearly when credentials, balances, accounts, prerequisites, or supported DAO capabilities are absent. It must not fabricate accounts, receipts or successful deployment output. Key management uses the operator's existing secure wallet/CLI mechanisms; keys are never printed.

Prefer an immutable or clearly disclosed contract upgrade policy for the testnet prototype. If a deployment account retains full-access upgrade keys, disclose that operator trust explicitly. Production immutability, audit, governance-controlled upgrades, and economic bounds are later release gates, not claims of this hackathon prototype.

## 11. Security, trust, and failure handling

| Threat or failure | Required handling |
|---|---|
| Wrong token contract calls receiver | Reject by predecessor; never mint a liability |
| Spoofed sponsor or beneficiary | Authenticate token sender; use frozen recipients |
| Concurrent pledges overfill a leg | Atomic validation and update; reject the later overfill entirely |
| Withdrawal races with deadline | Authoritative receipt execution time; active amount changes synchronously |
| Late failed withdrawal callback | Restore withdrawal credit only; never alter funding or final outcome |
| Double claim or replayed callback | Available-to-pending transition, unique nonce, private callback, terminal result guard |
| Failed or missing token registration | Credit preserved; show registration and retry path |
| RPC failure or stale UI | Show stale/unknown; no fabricated receipt or local fallback |
| Browser closes after signing | Recover from chain state/receipt; no duplicate automatic signing |
| Local crash between transfer and resolution | Persist result and reconcile once after restart |
| Malicious text/CSV | Escape rendered text, reject executable URLs, neutralize formula cells |
| Storage denial of service | Bounded legs/participants/text/views; prepaid or measured storage |
| Large integer overflow | Checked u128 arithmetic, BigInt client, upper-bound validation |
| Beneficiary self-funds to capture subsidy | Disclose trust assumption; DAO reviews beneficiary and purpose |
| Beneficiary does not deliver service | Outside funding guarantee; show this in plan terms |
| Sponsor tries to reuse reserve | Accepted funds allocated to exactly one campaign; no global reusable match pool |
| Operator upgrades escrow | Disclose retained key authority; no claim of immutability without evidence |
| One payout fails after another succeeds | Keep independent credits; do not claim atomic cross-account transfers |
| Callback cannot complete | Keep pending reservation; no timeout-based double-payment workaround |

No owner “emergency withdraw all tokens” function is permitted in the MVP. If a pause is added later, it must not block legitimate refunds or completed-entitlement claims and requires a separate reviewed specification.

## 12. Observability and evidence

Use structured versioned events for campaign publication, sponsor acceptance/rejection, pledge acceptance/rejection, withdrawal conversion, finalization, refund materialization, attempt creation, and attempt result. Include campaign/leg/credit/attempt identifiers and atomic amounts; never secrets.

Local logs include command/request ID, actor, duration, error code, and durability outcome. Expose a lightweight health endpoint showing storage accessibility and mode. Onchain events and state views are authoritative; any event index is a cache and can be rebuilt. Do not store an ever-growing full event list in expensive contract state merely to support an activity feed.

An invariant checker must be callable in local tests and diagnostics. Report book reconciliation separately from observed token-balance reconciliation. A demo evidence document must record actual commands, test results, dates, screenshots if produced, and real transaction/receipt IDs only where available.

## 13. Acceptance criteria and meaningful verification

### 13.1 Local release gate — all required

- **L1 Setup:** A documented command starts the application on the available Windows environment; required dependencies and optional external services are explicit. A fresh checkout can initialize local data without credentials.
- **L2 Honest mode:** Every principal screen identifies local demo mode. Local receipts cannot be mistaken for chain hashes; no explorer links are fabricated.
- **L3 Complete authoring:** A user can create valid one-, two-, and three-leg plans, inspect derived targets, publish immutable terms, and see validation errors without source edits.
- **L4 Actual sponsor transfer:** Approval alone leaves `AwaitingFunding`. A successful exact transfer debits the persistent DAO balance and opens the plan. Insufficient balance or wrong amount does neither.
- **L5 Persistent contributions:** Accepted pledges debit the contributor, credit custody, update only the selected leg, and survive server restart. Two simultaneous attempts cannot exceed remaining capacity.
- **L6 Withdrawal correctness:** Removal before the deadline lowers active funding immediately. A failed transfer restores its credit even if finalization occurs before resolution. At/after the deadline removal is rejected.
- **L7 All-or-none failure:** Canonical 400/125/50 example creates zero beneficiary credits and refunds exactly 575 to contributors plus 400 to the DAO when claimed.
- **L8 Success:** Canonical 400/125/75 example creates 600/250/150 beneficiary credits together; independent claims pay only those recipients and amounts.
- **L9 Failure recovery:** An unregistered equipment beneficiary's transfer fails, leaves its full credit available, and succeeds exactly once after registration and retry.
- **L10 Idempotency/crashes:** Duplicate HTTP commands and repeated callback processing never duplicate transfers or credits. Restart with a pending transfer reconciles correctly.
- **L11 Accounting:** Every mutation preserves disjoint-liability conservation; all completed scenarios reconcile actual local balances and credits. No cross-campaign reserve sharing occurs.
- **L12 Public proof:** Activity, My funds, custody view, and JSON/CSV exports agree with authoritative state and contain mode/source evidence.
- **L13 Usability:** The primary walkthrough is keyboard-completable and works at 360 px and desktop widths with no hidden monetary action.
- **L14 Documentation:** README states implemented features, verification results, current NEAR status, limitations, startup/reset steps, trust assumptions, and the independent ArchivePass project.

### 13.2 Contract/source release gate

- Checked amounts, known-token authorization, immutable campaign terms, sponsor authentication, strict deadline boundary, bounded finalization, lazy refunds, and private callback logic exist in actual source.
- Tests cover all success/failure accounting transitions, overfill, duplicate finalization/refund/claim/callback, unauthorized callbacks, sponsor rejection, late token arrival, withdrawal/finalization interleaving, and concurrent/state-order equivalents.
- A property/invariant test generates varied sequences of valid and invalid commands across at least two campaigns and verifies conservation, no double entitlement, and immutable terms.
- Finalization work is independent of participant count; test a full 128-account campaign without iterating positions in finalize.
- Canonical terms hash vectors and amount precision tests match the frontend/server conventions.
- If Rust dependencies or build targets are unavailable, document the exact unmet gate and error. Written source alone does not pass build or integration gates.

### 13.3 Actual NEAR integration gate

To claim “verified on NEAR testnet,” record all of the following:

1. Real network, account, token, escrow, DAO version/policy and code artifact evidence.
2. Real DAO proposal creation/approval/execution or an explicitly identified pre-existing approved proposal, with the reserve accepted by the escrow.
3. Actual successful contribution and rejected overfill/late contribution with verified token return behavior.
4. Failure scenario and successful contributor/DAO refunds, with final token balances reconciled.
5. Success scenario and beneficiary payouts, including at least one real or sandbox-verified failed token-transfer callback followed by successful retry. State precisely which environment proved the failure branch.
6. Contract state and downstream receipts confirm results; no success depends only on an optimistic UI state or top-level transaction hash.

If some are blocked, the UI/README reports the achieved subset, and remaining chain buttons are disabled or clearly identified as prepared integration. A polished local demo must not obscure an incomplete live path.

### 13.4 Test matrix

| Area | Essential cases |
|---|---|
| Amounts | Zero, negative, excess decimals, large values, checked overflow, exact final atomic unit, odd-unit budget with cap above half and floor-derived reserve |
| Timing | `D-1`, `D`, `D+1`; receiver execution after deadline; terminal finalize repeated |
| Funding | Wrong token/sender/hash, duplicate reserve, partial/excess reserve, absent storage, insufficient local balance |
| Participation | New and existing account at cap, three positions, withdrawal to zero then re-entry, last-slot collision |
| Settlement | Each possible missing leg; all full; one-leg variant; duplicate beneficiaries; unfunded expiry |
| Refunds | Multiple legs per contributor, partial removal before failure, refund materialized twice, failed refund transfer |
| Callbacks | Success, failure, unauthorized, stale nonce, duplicate, new credit accrual while old attempt pending |
| Persistence | Restart after acceptance, before/after transfer result, before callback application, repeated seed |
| UI | Mode labels, deadline cutoff, stale data, rejected wallet action, visible claim recovery, mobile/keyboard |
| Isolation | Two campaigns, two accounts, and separate ArchivePass directory/data boundary |

Avoid tests that merely assert CSS classes or mirror a trivial implementation. Concentrate on monetary invariants, receipt boundaries, durable state, and the complete user journey.

## 14. Demo script

Provide a reproducible local walkthrough that uses real server time and genuine local ledger movement:

1. Explain the three obligations and show the full reserve actually received from the demo DAO.
2. Fill venue and equipment; leave accessibility short. Show that venue has no payable credit despite being full.
3. Try a beneficiary payout; receive a clear unavailable-entitlement result, not a pretend transaction.
4. Wait for the short published deadline, finalize, and claim contributor and DAO refunds.
5. Open an independently funded clone with new ID/hash/deadline. Fill all three legs and finalize after its real deadline.
6. Pay venue; attempt equipment with recipient unregistered; inspect the preserved equipment credit; register and retry; pay accessibility.
7. Open custody and export; reconcile all test balances and restart the service to prove persistence.

Historical preseeded campaigns may shorten presentation, but every such item must be labeled **“Seeded local example”** with its true fixture origin. Do not mutate the actual clock, invent elapsed wall time, or present generated history as a live transaction. A separate visible deterministic test clock is allowed only inside automated tests, not the ordinary app.

## 15. Prioritized implementation milestones

| Milestone | Deliverable | Exit condition |
|---|---|---|
| M0 — Plan and tools | Implementation plan, dependency probe, version choices, explicit interfaces | No unresolved ambiguity about money rules or local persistence; chain prerequisites documented |
| M1 — Accounting core | Domain transitions, durable store, balances, claims, invariant tests | L4–L11 exercised through API/tests, including restart and failure |
| M2 — Product flow | Responsive authoring, budget board, My funds, DAO review, custody/export | A new user completes both local outcomes without source edits |
| M3 — NEAR contract | Rust source, unit/property tests, WASM build, token/DAO integration harness | Source gate passes; exact build and sandbox/testnet status recorded |
| M4 — Integration | Real adapters, proposal payloads, wallet/RPC handling, deployment evidence | Achievable chain gates pass; unsupported steps remain honest and documented |
| M5 — Review and demo | Security/accounting review, end-to-end evidence, README, scenario script | All local gates pass; every claimed external capability has evidence |

Development can allocate separate engineers to UI, local engine, and contract after this specification and the implementation plan are complete. Ownership boundaries and shared DTOs must be agreed first. The implementation plan should sequence integrations so a contract delay does not leave a nonfunctional UI, and UI polish never substitutes for completed refunds.

The official hackathon deadline is 14 November 2026 at 23:59 UTC (15 November 07:59 in Taipei). Public repository and public demo-post links are required for submission; each independent project README must name the other when one person enters two projects. Publishing or messaging is a separate action that requires the user's instruction; this specification requests implementation artifacts, not external submission. [Official hackathon rules and submission page](https://nearhackathon.com/)

## 16. Risk register and decisions still to verify

| Risk | Severity | Mitigation / owner decision |
|---|---|---|
| Dependency fetch or version compatibility fails | Medium delivery risk | Native Rust/WASM and Node/SQLite are verified; pin compatible SDK/UI packages, use approved dependency access, report any actual build failure |
| No wallet credentials or funded testnet accounts | High integration risk | Produce complete configuration/deployment instructions; never assert a deployment; use local ledger for the self-contained demo |
| Deployed Sputnik differs from repository | High integration risk | Inspect actual policy/version; choose supported proposal shape and actual bond |
| Async callback accounting bug | Critical | Immutable credit ownership, pending reservation, private nonce-bound callbacks, interleaving tests |
| Storage cost or unbounded retries | High | Prepaid bounded participant capacity; measured storage; bounded attempt records/events |
| Deadline arrives during DAO voting | Medium | Show time remaining at proposal creation; reject late reserve; allow a new immutable campaign |
| TestUSD mistaken for money | High trust risk | Persistent labels, known contract identity, no dollar/redemption claims |
| Sponsor subsidy captured by beneficiary self-funding | Medium product risk | Explicit DAO approval trust; no false sybil-resistance claim |
| Real-world delivery failure | High expectation risk | Limit guarantee to funding/entitlements; no invented delivery assurance |
| Local roles mistaken for authentication | Medium | Local-only banner, loopback binding, disabled production controls |
| Full-access deployment key retained | High production risk | Disclose authority; mainnet requires reviewed upgrade/immutability policy |
| Scope expands into second product | High delivery risk | Separate roots and state; finish first product's verification before starting ArchivePass pipeline |

Before contract deployment, verify the exact SDK/compiler version, storage measurement, callback gas allocation, token metadata/behavior, deployed DAO capabilities, wallet integration API, and explorer URL format. These are integration facts to measure, not reasons to weaken the accounting rules.

## 17. Source notes

Primary sources consulted on 5 November 2026:

- [Official NEAR Hackathon](https://nearhackathon.com/): track framing, deadline, submission requirements, and two-independent-project disclosure.
- [Social Money track prompt](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/12-social.md): broad category and separate bounty example.
- [Sputnik proposal source](https://github.com/near-daos/sputnik-dao-contract/blob/main/sputnikdao2/src/proposals.rs): proposal kinds and current source-level transfer/function-call shapes.
- [NEP-141](https://github.com/near/NEPs/blob/master/neps/nep-0141.md): fungible-token transfer-call and unused-amount semantics.
- [NEP-145](https://github.com/near/NEPs/blob/master/neps/nep-0145.md): token storage registration interfaces.
- [NEAR private callback guidance](https://docs.near.org/smart-contracts/security/cross-contract-calls/callbacks): callback authorization and failure recovery pattern.
- [Petty Cash](https://github.com/kasbsquall/petty-cash) and [Patch Fund](https://github.com/emilhuseyn/patch-fund): limited comparative descriptions from their project READMEs, not independent audits of their deployments.

Other competitor links in the matrix are explicitly identified as research leads that were not independently re-fetched in this specification pass. AllTogether's detailed state machine, UX, limits, accounting, and acceptance gates above are design decisions, not claims copied from those projects.
