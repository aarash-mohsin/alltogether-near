# AllTogether

**Fund the whole community plan, or nobody gets stranded.**

A community event needs a venue, equipment and access passes. If only the venue gets funded, the money is wasted and the people who gave it are stuck. AllTogether lets a community fund a plan made of up to three essential budgets with one deadline. Every budget has to reach its own target. If they all do, every beneficiary is paid. If any one falls short, every contributor gets their money back, and so does the DAO that offered matching funds.

Built for the **Social Money** track of the NEAR Hackathon. The matching funds come from a real [Sputnik DAO](https://github.com/near-daos/sputnik-dao-contract) on NEAR testnet, which approves them through an on-chain proposal and vote.

## How it works

1. **An organizer creates a plan** with one to three budgets, a fixed beneficiary account for each, and a deadline.
2. **A community DAO sponsors it.** A Sputnik DAO proposal transfers the matching reserve into the escrow contract. Approval alone is not enough; the plan opens only once the reserve has actually arrived.
3. **People pledge** test tokens (testUSD, a NEP-141 token) to individual budgets. Overfilled or late pledges are returned automatically by the token's `ft_transfer_call` resolver.
4. **After the deadline, anyone can finalize the plan.**
   - *All budgets reached their targets:* every beneficiary gets a payment credit at the same moment.
   - *Any budget fell short:* no beneficiary is paid. Contributors get exact refunds, and the DAO gets its reserve back.
5. **Payouts are separate and retryable.** If a beneficiary's account can't receive tokens yet, the transfer fails safely, the credit is restored, and the payout can be retried later without paying twice.

The escrow is a Rust contract (`contract/`). The web app (`web/`) and API (`server/`) give each role a view of the same rules.

## See it on NEAR testnet

All accounts hold valueless test assets.

| Component | Account |
|---|---|
| Escrow contract | [`escrow.at-rel-owner-mw3qu2g0.testnet`](https://testnet.nearblocks.io/address/escrow.at-rel-owner-mw3qu2g0.testnet) |
| Test token (testUSD) | [`testusd.at-rel-owner-mw3qu2g0.testnet`](https://testnet.nearblocks.io/address/testusd.at-rel-owner-mw3qu2g0.testnet) |
| Sputnik DAO | [`alltogether-mw3kfemk.sputnikv2.testnet`](https://testnet.nearblocks.io/address/alltogether-mw3kfemk.sputnikv2.testnet) |

Two complete plans were run on testnet, one that failed and one that succeeded:

| Step | Transaction |
|---|---|
| DAO proposal to sponsor plan 2 | [`93FNRoVm…`](https://testnet.nearblocks.io/txns/93FNRoVm38bovEygFc9nPG5Pe84e55oRXDApAj7EbLpP) |
| DAO council approves it | [`6mToimmu…`](https://testnet.nearblocks.io/txns/6mToimmu7QEMweYGnwpc1bntniau5QwMw8bL1NsJBNk5) |
| A pledge to plan 2 | [`2pPE4EmR…`](https://testnet.nearblocks.io/txns/2pPE4EmRTwpxqWCZvFvkvEv6iTefz1zaPrkjHYVat18a) |
| An overfilled pledge returned by the resolver | [`5nyJp88V…`](https://testnet.nearblocks.io/txns/5nyJp88Vhiw9YuVkkV7vx6EbQEyxiFXNCTEEEx6LBNFs) |
| Plan 2 finalized as successful | [`AwCNq6e6…`](https://testnet.nearblocks.io/txns/AwCNq6e6jvR8ipriczbxwmPFuRwvJyeNdUYXqn61v8re) |
| Payout fails for an unregistered beneficiary; credit restored | [`BuERa6Ef…`](https://testnet.nearblocks.io/txns/BuERa6EfFHxGuNaTSxCfknRS6fkbozHqNPXLwyJc47uU) |
| Retry after registration pays exactly once | [`9tdmwDDh…`](https://testnet.nearblocks.io/txns/9tdmwDDheWMo1fasb31VFh2yVVKpdUhpRJSbR25L9Y32) |
| Plan 1 finalized as failed | [`4ycGwY1b…`](https://testnet.nearblocks.io/txns/4ycGwY1bcwGXqM4o2qmNxJMsQ2VVdBscQgsfwhkkV79L) |
| Contributor refund paid | [`ATuzvbdn…`](https://testnet.nearblocks.io/txns/ATuzvbdn1gJmWYM2yryP6MQRyThggh1MxVooKKBG5LbE) |
| DAO reserve returned | [`BGc6A2E2…`](https://testnet.nearblocks.io/txns/BGc6A2E2DBbEA3j1A9havggD5uMGtvhCXWbqxi7DNpXX) |

All 51 transactions of that run are in [`docs/qa-release-testnet.json`](docs/qa-release-testnet.json).

### Check the contract yourself

These read-only calls need no wallet. They query the public testnet RPC (`e30=` is `{}` in base64):

```sh
# Totals across all plans: accepted and paid principal, custody, pending transfers
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"escrow.at-rel-owner-mw3qu2g0.testnet","method_name":"get_accounting","args_base64":"e30="}}'

# All plans and their outcomes
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"escrow.at-rel-owner-mw3qu2g0.testnet","method_name":"list_campaigns","args_base64":"e30="}}'

# Deployed code hash; should be DJ73KDw8fE818kYrR9CVMztonGUnv8nn4475fpdV21pS
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"escrow.at-rel-owner-mw3qu2g0.testnet"}}'
```

`result.result` in the first two responses is a byte array of JSON text. testUSD has 6 decimals, so `"2145000000"` means 2,145 testUSD. On 6 November 2026, `accepted_inflows` and `confirmed_paid` were both 2,145 testUSD, with nothing left in custody or pending. The deployed code hash matches the WASM committed at `contract/target/near/alltogether_escrow.wasm` (SHA-256 `b6adf23a…c5e7`).

## Run it locally

Requires Node.js 24+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:5173>. The API runs on port 8787 and stores its data in `data/alltogether.sqlite` (set `ALLTOGETHER_DB` to use a different file). For a production build, run `pnpm build && pnpm start` and open port 8787.

The app has two workspaces:

- **Local demo.** A persistent local ledger with sample roles (Organizer, Community DAO, Alice, Bob), so the whole flow can be tried without a wallet. It is clearly labeled as a simulation; picking a role does not sign anything on chain.
- **Live testnet.** Reads the deployed contracts above and connects a NEAR testnet wallet (through [near-connect](https://www.npmjs.com/package/@hot-labs/near-connect)) to review and sign real transactions. The server never sees a wallet key.

### Try the complete flow (local demo)

1. As **Organizer**, load the sample plans or create your own. One sample uses a real three-minute deadline.
2. Request sponsorship, switch to **Community DAO**, approve the proposal, then fund the matching reserve. Approval alone does not open the plan.
3. Switch to **Alice** or **Bob** and pledge to individual budgets. Before the deadline, a pledge can be withdrawn.
4. After the deadline, anyone can finalize. If a budget missed its target, **My funds** shows the refund to claim.
5. If every budget succeeded, beneficiaries can claim. An unregistered receiver's payout fails safely; register it and retry.

`pnpm seed` loads the sample plans into a running API. `pnpm scenario` runs a short-deadline walkthrough of success, failure, refunds, a rejected overfill and payout recovery.

## Tests

```sh
pnpm test            # 63 application tests
pnpm typecheck       # strict TypeScript
pnpm build           # production frontend
pnpm test:contract   # 22 Rust tests (17 escrow + 5 token); needs Rust
pnpm build:contract  # optimized WASM; needs Rust, the wasm32 target and cargo-near
```

The tests cover concurrent HTTP requests, accounting under interleaved actions, crash recovery at three points during a transfer, and refund discovery. The results of the last full release check are in [`release-qa/RELEASE_GATE.md`](release-qa/RELEASE_GATE.md).

## Repository layout

| Path | Contents |
|---|---|
| `contract/` | Rust escrow contract (`src/`) and the testUSD test token (`test-token/`); committed release WASMs under `target/near/` |
| `server/` | Node API with SQLite storage and the read-only NEAR testnet reader |
| `web/` | React app, including the wallet controller for the Live testnet workspace |
| `shared/` | Types and rules shared by the server and the web app |
| `scripts/` | Dev, build, seed, backup/restore and the testnet setup scripts (`scripts/near/`, `testnet-*.mjs`) |
| `tests/` | Application, server and release tests |
| `docs/` | Design notes and on-chain evidence; start with the [evidence index](docs/EVIDENCE_INDEX.md) |
| `release-qa/` | Fresh-install, restore, dependency and browser checks |

The testnet scripts are only for creating a **new, dedicated** testnet setup. They refuse to run against mainnet or replay a completed run. Their keys are written to the ignored `.secrets/` folder and never committed.

## Known limitations

- **Testnet only**, with a valueless test token. There is no mainnet deployment.
- **The escrow contract is still upgradable.** Its deployment key is kept for development, so it is not yet locked or audited.
- **Signing in the Live workspace has been tested only through an SDK wallet adapter.** Opening and closing the external wallet picker was checked in the browser, but logging in with a real wallet and approving a transaction there has not been tested yet.
- A successful plan proves the money was raised and paid out, not that the venue or supplier delivered.

## Built with

- **Contracts:** Rust, [near-sdk](https://github.com/near/near-sdk-rs) 5.30, near-contract-standards (NEP-141 / NEP-145)
- **App:** TypeScript, React 19, Vite, Node.js 24 (built-in SQLite), [near-api-js](https://github.com/near/near-api-js) 7.4, [@hot-labs/near-connect](https://www.npmjs.com/package/@hot-labs/near-connect)
- **On chain:** NEAR testnet, Sputnik DAO v2
- **AI tools:** OpenAI Codex was used as a coding assistant for implementation and for the review passes recorded in `docs/ASTRA_*.md`.

The exact versions are pinned in `package.json`, `pnpm-lock.yaml` and `contract/Cargo.lock`.

## Development history

The project was built locally during the hackathon and put under Git only when it was published, so the first commit contains the finished work. The testnet deployments give independent dated evidence: the DAO, contracts and accounts were created on 5 November 2026 (see [`docs/qa-release-testnet-setup.json`](docs/qa-release-testnet-setup.json) and the explorer links above).

## License

[MIT](LICENSE)
