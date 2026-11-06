# Release core changes and verification

This work implements the core portion of the independent Astra review. Browser operation recovery/signing and backup/restore tooling are separate work packages. Existing deployed-contract evidence is not silently relabeled as the new artifact.

## Fixed rules

- Publication rejects the escrow itself as a beneficiary before contract storage or campaign IDs are allocated. The local model finishes all leg validation before allocating an ID or creating synthetic beneficiary wallets. Ordinary duplicate beneficiaries remain valid and receive separate per-leg earmarked credits.
- Native SDK default features are disabled in both escrow and test-token normal/dev dependencies. This removes the unmaintained `wee_alloc` allocator from the lock and production WASM dependency graph. The existing SDK version remains pinned. Upstream native unit-test dependency advisories are assessed separately; no unrelated semver-major dependency override was introduced.
- Local worker health exposes enabled/running state, last poll/success/error and processed count. Pending count and oldest age remain present across the delivered-but-unresolved boundary and clear only after authoritative resolution. Health is observation, never authority to reset or repeat a payment.
- Store startup uses an explicit transactional initial v0→v1 migration. A current v1 database is not rewritten through repeated CREATE statements. A newer schema is rejected before journal configuration or schema mutation. No speculative data migration was invented.
- Built serving supports GET/HEAD and correct MIME/length/cache policy, rejects dotfiles, encoded traversal, backslashes, null bytes and linked files, returns real missing-asset/API errors, and limits SPA fallback to extensionless navigation. Hashed assets are immutable-cacheable; HTML and unversioned files require revalidation. Local monetary services remain loopback-only.

## Live read-only testnet surface

`GET /api/near/snapshot?accountId=...&campaignId=...&fromIndex=0&limit=20` returns **direct `NearSnapshot` JSON**, not a local-ledger success envelope. Types live in `shared/near.ts`. Account/campaign are optional, IDs are validated and the page bound is1–20.

The server accepts only explicitly allowlisted Intear/FastNear HTTPS testnet providers and the public binding in `docs/testnet-config.json`; the current default is `https://testnet-rpc.intea.rs`. Reads are paced and serialized with bounded HTTP/JSON rate-limit retries and queue capacity. It requires testnet identification, pinned escrow/token code hashes, matching escrow DAO/token/domain/bounds, six-decimal testUSD metadata and an actual DAO policy. Explicit `expectedEscrowCodeHash`/`expectedTokenCodeHash` fields are preferred; the original matching-account deployment evidence is a fallback. Changing a bound account without corresponding pinned evidence fails closed.

All account/code/key/contract/token/DAO views are queried at one final block hash. The snapshot includes the actual source height/hash/time, contract key counts and prototype upgrade-key disclosure; typed raw Rust campaign/credit/position records; selected-account native/FT/storage state; global custody/accounting; all three campaign storage quotes; token registration bounds and DAO bond. It does not invent a historical activity index.

Successful observations are cached for10seconds in a bounded32-entry cache, with at most eight distinct in-flight snapshots. An expired cache never masks an RPC/configuration failure. Errors are returned as stale **near/testnet** errors without any local-ledger fallback. The route cannot sign, mutate chain state, load a wallet credential or accept caller-supplied RPC/contract endpoints.

`gasPriceYocto` comes from the same-block gas-price query. Native storage stake is measured account storage usage multiplied by the exact byte price derived from the runtime storage quote. `nativeBalance` is total liquid amount; `spendableNativeBalance` deducts that stake. The pure action builder additionally requires a conservative signing buffer of at least0.3NEAR, or a higher gas-price-based estimate, on top of attached deposits. This is a preparation policy, not an exact fee promise; wallets/runtime remain authoritative and unused prepaid gas is returned.

## Pure unsigned transactions

`prepareNearTransaction(snapshot, signerId, command, nowMs?)` emits the connector format `{signerId,receiverId,actions:[{type:'FunctionCall',params:{methodName,args,gas,deposit}}]}`. It neither signs/submits nor labels a transaction hash successful.

Commands: `publish`, `pledge`, `remove`, `finalize`, `refund`, `claim`, `register`, `proposal`. The helper checks verified binding/code/token, connected-account snapshot, source age at most30seconds, custody, canonical integers, deadline/state, fixed terms hash, earmarked capacity and own position, credit ownership/pending state, storage quotes and prepaid native balance. Registration uses the actual token minimum; publication uses the actual bounded storage quote; proposal preparation uses the actual DAO bond and exact token transfer-call message. DAO approval/execution remains actual existing governance.

The additional `demoFaucet` command is available only when the observed new token advertises its fixed demo faucet and the connected account is registered, unclaimed and within remaining capacity. It prepares exactly one yocto and100Tgas; it never accepts a recipient or amount override.

Fixed beneficiary and sponsor-refund credit records are exposed for the selected campaign. Anyone may prepare their fixed-payee claims, matching the contract. Contributor withdrawal/refund claims require the observed credit owner. Recipient overrides and still-pending retries are unavailable.

## Bounded public testUSD faucet

The new test token supports `demo_faucet({})` for independent wallet onboarding without a server-held key. It mints exactly1,000,000,000 base units (1000 valueless testUSD) to the immediate registered predecessor, once per account ID, with at most256 lifetime recipients. It requires exactly one yocto, emits the standard `ft_mint` event, retains the claim flag after unregister/re-register, and provides no arbitrary recipient, amount or claim-reset method.

Initialization and faucet calls require the named `.testnet` demo profile and fixed no-monetary-value metadata. The suffix is a deployment convention, not a cryptographic chain-ID oracle; the application independently checks actual RPC chain identification. No currency peg/value or Sybil-resistant distribution is claimed. The finite recipient cap can be exhausted and is not reset administratively.

Native operations must pre-fund all remaining claim flags. The measured maximum Borsh Vec of256 distinct maximum-length account IDs is17,412bytes (4-byte Vec prefix plus256×68-byte records); the reserved flag/margin allowance is17,664bytes. Headroom is checked before mint or flag mutation against current storage plus the remaining maximum flags and256-byte state margin. `get_faucet_storage_quote` exposes the actual current usage, remaining reserve and required account balance. Provision2.5 faucet NEAR for the new token deployment and inspect that actual quote; sponsor/contributor testUSD is not native storage funding.

`get_faucet_status({account_id})` returns `{enabled,amount,claimed,remainingAccounts}`. The live snapshot includes nullable `faucet` status: only an actual old-token `MethodNotFound` is treated as absent capability; transport/other execution errors remain unavailable, not a fabricated disabled/success result.

The token contract state gained the bounded claim Vec. **Deploy a fresh new token; do not upgrade an old token's incompatible state.** The parent owns fresh deployment and binding/evidence updates.

## Executed verification

- Final allocator/faucet configuration: **17 escrow native tests plus5 test-token tests passed**. Added self-beneficiary no-allocation and positive duplicate-beneficiary settlement regressions; faucet fixed-recipient/exact mint/events, registration/deposit/native-headroom failures, once/256 cap, profile and re-registration rules are covered.
- **15 domain tests passed**, including publication no-side-effect and pending health across delivery/resolution boundaries.
- **9 NEAR reader/action tests passed**: final-block binding/cache, no fallback, code/config/token/network rejection, typed query bounds, old-token missing-faucet handling, all nine prepared operations, storage/DAO/native deposits, ownership/pending/terms/deadline, faucet status and low-gas-buffer rejection.
- HTTP/static/health regressions passed with real loopback connections; the full final project suite is recorded by parent integration after all frontend/operations changes.
- Strict server TypeScript passed.
- A real read-only RPC observation against the then-recorded existing testnet deployment passed at final block276360993: campaign1, correct token, code hash match and reconciled custody. This did not deploy or mutate the new source.

Final built artifacts for parent deployment:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Escrow `contract/target/near/alltogether_escrow.wasm` |247749|`b6adf23a9f3bcc080787943147108d428cb0a4f16eb232a8db01d5fdb5b7c5e7`|
| Token `contract/target/near/alltogether_test_usd/alltogether_test_usd.wasm` |174930|`7d6caab3eeac77685b2b6e385e265b9c6daed02edc2af120698a5a929da3d514`|

Both were actually rebuilt with the workspace Rust1.99.1/SDK5.30/cargo-near toolchain after allocator removal. Artifact compilation is not a claim of identical bytes across independent toolchains or a claim that the old deployed code contains the new guard. Parent integration owns fresh testnet deployment and full release QA.
