# AllTogether release UI implementation

The browser now contains two explicit workspaces. The existing local ledger keeps its demo actor selector and local receipts. **Live testnet** (`#/testnet`) uses the configured verified RPC snapshot and the connected wallet's actual account. It does not send demo identity headers, load seeded balances as chain state, hold a private key, or fall back to local mutations after an RPC or wallet error.

## Local correctness and recovery

`web/src/operations.ts` persists each unresolved operation's actor, path, canonical body, key and creation time under `alltogether.local.operations.v1`. `api.ts` creates/persists that record before sending a mutation and reuses it after a lost response, reload or same-intent retry. In-flight identical operations share one request. Definite successful/domain-rejected responses retire the identity; transport, malformed-response and server-5xx uncertainty retain it. A later intentional operation gets a new identity after the earlier result is known. Storage failure prevents starting an unrecorded mutation.

The UI exposes a per-actor **Check or resume this exact request** panel. Checking resends the saved request and key, permitting the server's idempotency record to return the original result. It does not assume a timeout means no execution. Another actor cannot accidentally replay the saved operation as themselves. There is no force-clear control for an uncertain payment.

Refreshes are non-overlapping unless a post-command refresh must supersede an older read. Route/account/tab generation changes invalidate old results. Loaded campaign pages are refreshed rather than indefinitely preserving stale cards; loaded activity pages survive polling and deduplicate by ID. Activity is correctly described as oldest-first/later pagination. Pagination errors are visible and retryable. Old view mutation responses cannot install state or navigate under a newly selected actor/route; they acknowledge the originating actor without changing the current selection.

Stale/disconnected views block monetary actions. Missing and malformed routes have explicit recovery instead of an endless plan spinner. API requests and exports have bounded timeouts. A confirmed command followed by refresh failure stays acknowledged as confirmed; its receipt is not relabeled a failed command. My funds includes the latest fixed-credit transfer failure and token-registration recovery guidance. Open monetary dialogs receive the current campaign funding snapshot, close on actor/route changes, and revalidate amounts at confirmation. Publication rejects the configured escrow as a beneficiary with the offending budget number; ordinary duplicate recipients remain permitted.

## Actual testnet transaction path

`NearWorkspace.tsx` reads `/api/near/snapshot` and displays the final block/time, configured escrow/token/DAO, key counts/upgrade boundary, custody, actual account funds/registration, campaigns, per-account positions and fixed-payee credits. The reader/backend owns binding and code verification; an unavailable or mismatched observation blocks preparation/signing.

The official pinned `@hot-labs/near-connect` connector is loaded only for the testnet workspace, configured for `testnet`, testnet-capable transaction wallets and the fixed RPC. No function-call key is requested during sign-in. Before signing, the UI rechecks the wallet's current account and network, reloads the verified snapshot and compares the exact prepared transaction to the reviewed request.

Supported reviewed actions:

- Token registration using the actual storage minimum.
- The bounded fixed testUSD faucet, only if this deployment exposes it, the account is registered/unclaimed, and capacity remains.
- Immutable one-to-three-budget publication with exact quoted native storage deposit.
- Earmarked `ft_transfer_call` pledge with fixed terms hash/leg/amount.
- Pledge removal, deadline finalization, contributor refund materialization and fixed-recipient claims.
- Exact Sputnik proposal export, with existing DAO governance handling voting/execution. Export never claims the reserve arrived or the proposal was submitted.

The review region shows signer, receiver, method, exact arguments, attached deposit and maximum gas before wallet approval. The shared preparation helper also requires the observed spendable native balance to cover deposit plus its conservative prepaid-gas policy (at least 0.3 test NEAR). This is a signing buffer, not a consumed-fee estimate; unused prepaid gas is returned. testUSD has no monetary value.

## Finality and uncertain transactions

`NearTransactionController` persists the operation **before** invoking the wallet, under `alltogether.testnet.operations.v1`. Wallet rejection is Cancelled only for an explicit recognized user-rejection result. An unknown provider error or redirect remains unresolved. A hash is Pending, not success. Unresolved operations block a new signature for that signer/deployment.

The default reader queries the fixed RPC for `tx` with `wait_until: FINAL`, then independently reads its execution block. Reconciliation checks:

1. Actual execution occurred after the final block observed during review AND its independently read block timestamp is at least the original saved intent's creation time. The timestamp check closes the case where two intents share a cached review block. A hash assigned to another journal operation cannot be reused, and a finalized record cannot be assigned a different hash. Missing timestamps or a clock ahead of actual execution leave the outcome Unknown with inspection guidance; there is no tolerance or timestamp-reset bypass. Keep the local clock correct.
2. Actual hash, signer, receiver, single method, exact canonical arguments, gas and deposit match the saved reviewed request.
3. Final transaction and downstream receipt outcomes are inspected.
4. A pledge succeeds only when the NEP-141 resolver confirms the exact reviewed accepted amount. Used amount zero is **Returned**, not a successful pledge. Unexpected/partial results stay Unknown.
5. A failed final token promise stays Unknown unless the initial token receipt definitively failed, because a later callback failure may occur after principal was accepted.

After reload, the wallet journal can check an existing hash without signing. If the wallet returned no hash, the user can attach the actual hash from that wallet's history; the same strict matching and freshness checks apply. There is no automatic retry/resign on timeout. Confirmed receipt state remains separate from the latest account snapshot. The local journal is a recovery aid, not an independent index or authenticated proof of state; current chain views remain authoritative.

## Accessibility and responsive work

The existing skip link, native dialogs and keyboard tablist remain. Main content receives focus after a route change. Invalid routes and asynchronous errors are explicit. Four navigation items use two columns at narrow mobile widths. Hashes/accounts and transaction JSON wrap. Testnet controls show actual account identity and disable the local actor selector; cancellation, unknown and returned outcomes do not receive a green success notice.

## Verification actually performed by this implementation agent

- **21 web tests passed, zero failed.** These cover the existing payment/refund helpers and adapter, lost-after-commit response/retry exactly once, durable actor/body identity after journal reload, definite-vs-unknown failures, synchronous duplicate suppression, out-of-order actor/route reads, retained/deduplicated history, wallet cancellation, no blind resign, unknown hash recovery, exact transaction matching, RPC failure, wrong/stale binding, old-receipt rejection, downstream failure and token-resolver returns/late failure.
- Strict web TypeScript check passed.
- Vite production build passed, including a separate dynamically loaded wallet connector chunk.
- The default finalized-transaction decoder read a real prior public testnet transaction (`9wNgcynCVEgnn14NiSVhsFnKjRQCCmdcjvbgFrUxmR81`, signer `at-mw3kqf0k.testnet`) and verified `FINAL` plus execution block276347632. This was read-only and did not submit a transaction.

These tests are controller/adapter/helper tests, not a claim that external wallet approval or the complete rendered browser workflow was exercised. The parent owns fresh actual testnet signing through an injected dedicated SDK signer, rendered desktop/mobile/keyboard/outage/race QA, built-server startup and final integration evidence. A real provider's popup/redirect/hardware behavior needs its own observed coverage; it must not be inferred from the injected signer or helper tests.
