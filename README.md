# AllTogether

**Fund the whole community plan, or nobody gets stranded.**

A plan has one to three essential, separately earmarked budgets, fixed beneficiaries, a prefunded DAO matching allocation and one deadline. Every budget must reach its own community target. Success creates all beneficiary payment rights together; failure unlocks contributor principal refunds and the DAO's reserve return. Actual token payouts remain independent and retryable.

## Run the application

Requires Node 24 or newer and pnpm 11.25.0. From this directory:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:5173>. The persistent SQLite API runs at <http://127.0.0.1:8787>. For a built application, run `pnpm build`, then `pnpm start` and open port 8787. `ALLTOGETHER_DB` selects a separate database; the default is `data/alltogether.sqlite`.

The local workspace uses a clearly labeled persistent demo ledger and simulated roles. The separate **Live testnet** workspace reads verified finalized state and connects an external testnet wallet for reviewed transactions. The server never receives a wallet private key. Local role selection does not authenticate an onchain account.

## Try the complete flow

1. Select **Organizer** and load sample plans, or create a plan with your own fixed budgets and deadline. Sample plans are clearly marked fixtures; one uses a real three-minute deadline.
2. Request sponsorship, switch to **Community DAO**, approve the proposal, then fund the exact matching reserve. Approval alone does not open contributions.
3. Switch to Alice or Bob and pledge to individual budgets. Before closing, removing a pledge creates a separate withdrawal credit; claiming it is another action.
4. After the actual deadline, anyone can finalize. A missing essential budget blocks every beneficiary entitlement. **My funds** exposes failed principal, then separate refund-credit creation and payment claim actions.
5. A complete plan creates all beneficiary credits. An unregistered receiver's payment fails safely; register the receiver and retry. Activity, custody and exports expose the resulting state.

`pnpm seed` idempotently loads fixtures while the API is running. `pnpm scenario` runs an actual short-deadline local API walkthrough covering success, failure, exact refunds, rejected overfill and payment recovery. It creates new test plans. Startup does not erase or reseed existing balances. To start fresh without deleting anything, select a new `ALLTOGETHER_DB` path.

## Verified implementation

- 63 JavaScript/TypeScript tests passed, including real HTTP concurrency, accounting interleavings, crash recovery at three transfer boundaries, complete 52-attempt exports and refund discovery.
- 17 Rust escrow tests and five test-token tests passed.
- TypeScript checks and production frontend build passed.
- Both optimized Rust WASM artifacts were built and deployed to dedicated NEAR testnet accounts.
- A genuine Sputnik DAO approved actual token transfer-call funding. Both failed and successful plans were executed on testnet, including rejected-transfer token returns, contributor/DAO refunds, beneficiary payments and failed-registration retry.
- Desktop UI sponsorship, pledge, finalization and refund recovery were exercised. A single-budget plan was published through a real 360px iframe viewport with no horizontal document overflow.

Current release checks: [release testnet](docs/RELEASE_TESTNET.md), [wallet/controller QA](docs/RELEASE_WALLET_QA.md), [release UI](docs/RELEASE_UI.md), [operations](docs/RELEASE_OPERATIONS.md), and [workspace release QA](release-qa/REPRODUCIBILITY.md). Earlier evidence is retained in [EVIDENCE.md](docs/EVIDENCE.md), [NEAR.md](docs/NEAR.md), [STORAGE.md](docs/STORAGE.md) and [public testnet receipts](docs/testnet-scenario.json). No sandbox-node execution is claimed; the recorded integration runs used the actual public testnet.

## Actual testnet deployment

| Component | Account |
| --- | --- |
| Sputnik DAO | `alltogether-mw3kfemk.sputnikv2.testnet` |
| Escrow | `escrow.at-rel-owner-mw3qu2g0.testnet` |
| Test token | `testusd.at-rel-owner-mw3qu2g0.testnet` |

These are valueless test assets. The Live testnet workspace supports external wallet connection, exact transaction review and persistent receipt reconciliation. Actual SDK-backed controller execution was verified separately; external wallet account login/approval was not exercised in release QA. Keep a correct local clock: a receipt executed before its saved intent cannot confirm it, and clock-skew ambiguity remains Unknown. Dedicated testnet deployment keys are retained for development, so the deployments are not immutable or audited. Keys are ignored under `.secrets`, are never printed, and are not user wallet credentials.

## Verification commands

```powershell
pnpm test
pnpm build
pnpm test:contract
pnpm build:contract
```

The contract scripts use the workspace-local Rust/GNU/CMake toolchain on this Windows workstation; elsewhere install Rust, its WASM target and cargo-near. Registry access and loopback tests require the execution environment's network permissions. Package locks pin dependency versions.

See `scripts/testnet-bootstrap.mjs`, `scripts/testnet-dao.mjs`, `scripts/testnet-contracts.mjs`, `scripts/testnet-scenario.mjs` and `scripts/near/` for guarded, dedicated-testnet-only operations. Never point them at mainnet or supply a personal wallet. Current scenario credentials/configuration belong to this local development workspace; a fresh clone must create its own dedicated testnet setup.

## Boundaries

The DAO retains its ordinary treasury and governance; only the approved tranche and pledges enter the campaign escrow. Funding success does not establish supplier delivery. Named accounts are not unique people. Storage/native gas costs are separate from testUSD principal. A pending chain transfer cannot be retried merely because a browser timer expires. Unsolicited token deposits are not silently allocated to campaigns.

AllTogether and [ArchivePass](../archivepass/) are independent NEAR Hackathon projects with separate application code, contracts, data and tests. Each README identifies the other. The [product specification](PRODUCT_SPEC.md) and [implementation plan](IMPLEMENTATION_PLAN.md) record the complete scope and design.
