# AllTogether

[![CI](https://github.com/aarash-mohsin/alltogether-near/actions/workflows/ci.yml/badge.svg)](https://github.com/aarash-mohsin/alltogether-near/actions/workflows/ci.yml)

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
| Escrow contract | [`escrow.at-rel-owner-mw4f9xmq.testnet`](https://testnet.nearblocks.io/address/escrow.at-rel-owner-mw4f9xmq.testnet) |
| Test token (testUSD) | [`testusd.at-rel-owner-mw4f9xmq.testnet`](https://testnet.nearblocks.io/address/testusd.at-rel-owner-mw4f9xmq.testnet) |
| Sputnik DAO | [`alltogether-mw4f9nmo.sputnikv2.testnet`](https://testnet.nearblocks.io/address/alltogether-mw4f9nmo.sputnikv2.testnet) |

**The escrow and the token have no access keys.** Each was created, deployed and initialized in one transaction with no key added ([escrow](https://testnet.nearblocks.io/txns/2aawQQojN5pQfPr42jtDXZTfYMgadyH18uTREy55Gd2a), [token](https://testnet.nearblocks.io/txns/97yDkmrvh9amNGeD8L9Z66P8i2sW3j6EnkhLKAgzetEx)). Nobody can change their code, and the escrow has no owner or admin methods.

Two complete plans were run on this deployment, one that failed and one that succeeded:

| Step | Transaction |
|---|---|
| DAO proposal to sponsor plan 2 | [`62Dyu3UP…`](https://testnet.nearblocks.io/txns/62Dyu3UP5QdADHD5LxsMwKTsDojKrPXjkDsDCb47kWum) |
| DAO council approves it; the matching reserve moves into the escrow | [`HoGqStqe…`](https://testnet.nearblocks.io/txns/HoGqStqefefHq5GLmPfLaEtUr9CC7wPZitPQ6WYXLFc6) |
| A pledge to plan 2 | [`6C9DkvQz…`](https://testnet.nearblocks.io/txns/6C9DkvQzfYqvjC8LzT6Q2PQfuexEJQkGwPumqZjZXxKm) |
| An overfilled pledge returned by the resolver | [`CD6cLKuf…`](https://testnet.nearblocks.io/txns/CD6cLKufN95QiVQn438NQ5ewh95qJzgxncunkGgZTCYq) |
| Plan 2 finalized as successful | [`AtdnRfPM…`](https://testnet.nearblocks.io/txns/AtdnRfPMoTq4ehnXTypfBayxxRtZHc9iCbyWPMHf8npY) |
| Payout fails for an unregistered beneficiary; credit restored | [`Aw4mZTr9…`](https://testnet.nearblocks.io/txns/Aw4mZTr9toPVVwJgkNNt1YKXDhZiw6D2pKt4voGfn45r) |
| Retry after registration pays exactly once | [`9qNLhsxt…`](https://testnet.nearblocks.io/txns/9qNLhsxtxnGp9fycqfjLrHLcD88osrDfuhti52yJKL5K) |
| Plan 1 finalized as failed | [`8jz4fuQh…`](https://testnet.nearblocks.io/txns/8jz4fuQhgRMms4ZvkpeKaXnLGi26UEJDgaGCMgQKHVAf) |
| Contributor refund paid | [`GTnRSSUc…`](https://testnet.nearblocks.io/txns/GTnRSSUcWKMomXKvKC3YYw6Yq4qDTiwFHoMpNTu3T4VB) |
| DAO reserve returned | [`GV2bAfi9…`](https://testnet.nearblocks.io/txns/GV2bAfi9KtgHK3LumPJ6eTHGAYnkgF7MauZdWhniiWmR) |

All 52 transactions of that run, including the DAO's creation, are in [`docs/qa-release-testnet.json`](docs/qa-release-testnet.json), summarized in [`docs/RELEASE_TESTNET.md`](docs/RELEASE_TESTNET.md).

### Check the contract yourself

These read-only calls need no wallet. They query the public testnet RPC (`e30=` is `{}` in base64):

```sh
# Access keys on the escrow; expect "keys": []
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"escrow.at-rel-owner-mw4f9xmq.testnet"}}'

# Totals across all plans: accepted and paid principal, custody, pending transfers
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"escrow.at-rel-owner-mw4f9xmq.testnet","method_name":"get_accounting","args_base64":"e30="}}'

# All plans and their outcomes
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"escrow.at-rel-owner-mw4f9xmq.testnet","method_name":"list_campaigns","args_base64":"e30="}}'

# Deployed code hash; should be DJ73KDw8fE818kYrR9CVMztonGUnv8nn4475fpdV21pS
curl -s https://rpc.testnet.near.org -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"escrow.at-rel-owner-mw4f9xmq.testnet"}}'
```

`result.result` in the second and third responses is a byte array of JSON text. testUSD has 6 decimals, so `"1975000000"` means 1,975 testUSD. After the release run, `accepted_inflows` and `confirmed_paid` were both 1,975 testUSD, with nothing left in custody or pending. The deployed code hash matches the WASM committed at `contract/target/near/alltogether_escrow.wasm` (SHA-256 `b6adf23a…c5e7`); CI checks this on every push.

Earlier deployments of the same contracts, including the wallet-controller test run, are listed in the [evidence index](docs/EVIDENCE_INDEX.md).

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

- **Testnet only**, with a valueless test token. There is no mainnet deployment, and the contracts have not had an external audit.
- **Signing in the Live workspace has been tested only through an SDK wallet adapter.** Opening and closing the external wallet picker was checked in the browser, but logging in with a real wallet and approving a transaction there has not been tested yet.
- A successful plan proves the money was raised and paid out, not that the venue or supplier delivered.

## Built with

- **Contracts:** Rust, [near-sdk](https://github.com/near/near-sdk-rs) 5.30, near-contract-standards (NEP-141 / NEP-145)
- **App:** TypeScript, React 19, Vite, Node.js 24 (built-in SQLite), [near-api-js](https://github.com/near/near-api-js) 7.4, [@hot-labs/near-connect](https://www.npmjs.com/package/@hot-labs/near-connect)
- **On chain:** NEAR testnet, Sputnik DAO v2
- **AI tools:** OpenAI Codex with OpenAI's GPT-6 Astra model, used as a coding assistant for implementation and for the review passes recorded in `docs/ASTRA_*.md`.

The exact versions are pinned in `package.json`, `pnpm-lock.yaml` and `contract/Cargo.lock`.

## Development history

The project was built locally during the hackathon and put under Git only when it was published, so the first commit contains the finished work. The testnet deployments give independent dated evidence: the first deployment was made on 5 November 2026, and the current keyless one on 6 November 2026 (see the [evidence index](docs/EVIDENCE_INDEX.md) and the explorer links above).

## License

[MIT](LICENSE)
