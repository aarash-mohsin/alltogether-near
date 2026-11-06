# Fresh release testnet verification

The release source was deployed to **new dedicated testnet accounts**, not upgraded over the original token's incompatible faucet state. Only generated faucet funds and valueless testUSD were used. No user wallet store or mainnet was accessed.

## Verified deployment

| Role | Public identity |
|---|---|
| Token |`testusd.at-rel-owner-mw3qu2g0.testnet`|
| Escrow |`escrow.at-rel-owner-mw3qu2g0.testnet`|
| Creator/token initial-supply owner |`at-rel-owner-mw3qu2g0.testnet`|
| Existing actual Sputnik DAO |`alltogether-mw3kfemk.sputnikv2.testnet`|
| Existing dedicated council |`at-mw3kfemk.testnet`|
| Independent contributor Alice |`alice.at-rel-owner-mw3qu2g0.testnet`|
| Independent contributor Bob |`bob.at-rel-owner-mw3qu2g0.testnet`|
| Separate controller-QA account |`controller.at-rel-owner-mw3qu2g0.testnet`|

Both new contracts were created, funded, deployed and initialized atomically. Dedicated full-access prototype keys are retained and disclosed. They are **not keyless or audited deployments**. The actual DAO code hash and configured council policy were verified before reusing its governance. Public binding and expected hashes are in `testnet-config.json` and `qa-release-testnet-config.json`; credential slot names contain no private key values.

| Artifact | Bytes | SHA-256 | Actual code hash |
|---|---:|---|---|
| Escrow |247749|`b6adf23a9f3bcc080787943147108d428cb0a4f16eb232a8db01d5fdb5b7c5e7`|`DJ73KDw8fE818kYrR9CVMztonGUnv8nn4475fpdV21pS`|
| Public-faucet test token |174930|`7d6caab3eeac77685b2b6e385e265b9c6daed02edc2af120698a5a929da3d514`|`9Sc4vjKHWKwB7BYVPRzsfzkiHS9NhebDCM459Yz4fgqy`|

Token operations were provisioned with2.5 faucet NEAR and escrow operations with3 NEAR, separately from each campaign's quoted native storage payment. The token's observed initial faucet quote required1.93065 NEAR (`175401` current storage bytes plus`17664` reserved flag/margin bytes). The quote is an actual observation, not an instruction to treat testUSD as native storage funding.

## Actual completed checks

**51 finalized transactions** are recorded across fresh native provisioning/deployments and two complete canonical flows. Full outcomes include failures and their recovery; negative exercises are not hidden as successful calls.

- Alice and Bob each began as an independent account with0.6 faucet NEAR. Each unregistered faucet attempt was rejected, then the account registered itself and claimed exactly1000 testUSD through the public fixed-recipient faucet. Duplicate attempts were rejected without additional minting. Neither participant received an owner token transfer.
- The new DAO token treasury was registered and prefunded with800 testUSD from the token creator's initial supply. The public faucet was not used to spoof DAO governance.
- A normally storage-funded creation naming the escrow as a beneficiary failed onchain with `ESCROW_BENEFICIARY_FORBIDDEN`. Campaign count and storage usage were unchanged; the first later valid campaign received ID1.
- Each canonical campaign used an actual new Sputnik FunctionCall proposal and the verified council's actual approval. Approval alone left the campaign awaiting funding; the accepted400 testUSD transfer-call reserve opened it.
- Overfill and late one-base-unit contributions were actually returned through the token resolver. Finalized calls reported zero tokens used, and the contributor's token balance was unchanged.
- The equipment beneficiary was deliberately unregistered. Its actual outgoing FT transfer failed; the private callback restored the same250 testUSD credit with zero pending. After registration, a new attempt paid exactly once, leaving nonce2 and a successful final attempt.
- At each quiescent close, actual token custody equaled recorded outstanding book liabilities, principal conservation held, and no transfer remained pending.

| Campaign | Community contributions per leg | Actual result |
|---|---|---|
|1 / incomplete |400 /125 /50 testUSD|Zero beneficiary entitlements; Alice525 and Bob50 refunded;400 returned to DAO|
|2 / complete |400 /125 /75 testUSD|Beneficiary rights600 /250 /150 allocated together and paid; equipment failure recovered without duplication|

The failure refunded every575 contributor testUSD. The successful plan used600 contributor testUSD plus400 sponsor testUSD. Across both campaigns, accepted and paid principal each totaled1975 testUSD; custody and all pending liabilities were zero at the recorded completion. Alice held600, Bob800 and the DAO400 testUSD after those flows. These are historical observations; subsequent parent controller QA can legitimately create new activity.

## Evidence and reproducibility

- `qa-release-testnet-setup.json`: native provisioning, actual atomic deployments, metadata/configuration, native faucet quote and retained-key checks.
- `qa-release-testnet-config.json`: public release binding, artifact identities, actors and private credential **slot names only**.
- `qa-release-testnet.json`: full finalized transaction/receipt outcomes, checks, two scenarios and point-in-time final balances/accounting.
- `qa-release-testnet-progress.json`: durable progress plus pending-submission identity, written after every action.
- `qa-release-testnet-review.json`: independent read-only recheck of actual proposal IDs/actions, all six paid fixed credits, artifact hashes and current storage quote.
- `releases/original-20261105/`: copied original public deployment/config/scenario/proposal records before the release binding changed. Original root `deployment*.json` and `testnet-scenario.json` were not overwritten.

Commands:

```powershell
node scripts/qa-release-testnet.mjs setup
node scripts/qa-release-testnet.mjs flow
node scripts/qa-release-testnet-review.mjs
```

The first two are signed fixture setup and monetary workflows, not replay buttons. Completed flows are preserved without repeating transactions. An interrupted monetary run must be reconciled from saved outcomes and current state; the script refuses blind replay. Setup resume is explicit and refuses unresolved submissions. Generated dedicated keys are saved before a faucet request and never included in public receipts. A completely new checkout/run needs new dedicated accounts and preserved evidence, not deletion or upgrade of an old token.

Proposal handling in the prepared script uses `add_proposal`'s actual returned ID and checks the exact proposer/token receiver/action/message before a future vote, avoiding a race-prone `get_last_proposal_id` guess. The already executed run was independently checked afterward: actual returned proposal IDs2 and3 matched the exact approved400-token funding actions and immutable campaign hashes. No unrelated proposal was approved. The read-only review command checks this again without signing.

This work establishes real deployment, governance, token resolver and payout recovery evidence. It does **not** itself establish third-party wallet connector approval behavior, browser accessibility, backup restoration, public hosting, worst-case gas or an external audit. Parent release QA records those separate gates and the new wallet controller's real-transaction tests.
