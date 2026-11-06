# Storage and bounded work

`quote_campaign_storage(leg_count)` prices a conservative per-campaign reservation at the runtime's `env::storage_byte_cost()`. It does not return a guessed fixed native fee.

## Measured serialization model

The implementation serializes maximum-size `Position` and `Credit` records with Borsh. Credit includes its maximum-size bounded latest `Attempt`, including a completed timestamp, maximum u128 balances and u64 nonce. Account IDs use their maximum 64-byte length and campaign IDs their maximum decimal length.

For a plan with `L` budgets, the quote reserves:

- 128 lifetime admissions, never reused after withdrawal.
- `128 × L` positions.
- Two aggregate contributor credits per admitted account (withdrawal and refund), each with a bounded latest attempt.
- `L` beneficiary credits and one DAO refund credit.
- Maximum allowed UTF-8 title, summary, details and purpose text (four bytes per allowed character), fixed campaign/leg/accounting metadata and index growth.
- An explicit conservative 128-byte trie/key allowance per persistent record in addition to the serialized record and logical key lengths.

The formula and its individual `record_bytes`, `reserved_bytes`, and `key_overhead_per_record` components are returned by the view. The quote measures serialization, then adds a stated safety allowance; it is not a protocol guarantee of exact trie costs.

Campaign creation rejects an attached native deposit smaller than this amount. Excess deposits are retained as native contract operating/storage funding, which is explicitly disclosed; the prototype promises no native storage refund. TestUSD liabilities remain completely separate.

## Bounded state

- Finalization visits only the one-to-three campaign budgets. It never scans contributors.
- Refund materialization visits only the calling account's at-most-three positions.
- Claims overwrite one bounded latest attempt and increment a nonce. Repeated retries do not append a permanent attempt vector.
- Full transfer/funding history is emitted as versioned event logs rather than stored forever in a contract vector.
- Campaign list views have a maximum 50-item page.
- Each new campaign purchases its own participant/credit reservation. Existing reserves cannot subsidize an unbounded number of new campaigns for free.

## Verification

The native test `storage_quote_uses_serialized_worst_records_and_bounds_actual_growth` inserts 128 maximum-length contributor accounts and exercises positions and withdrawal credits, flushes all store collections, and compares actual mocked-runtime storage growth to the reservation. This test is a partial-liability population check, complemented by the maximum-size serialized record model. Its measured numbers and actual pass/fail result must be taken from the test output, not inferred from this document.

The test `lifetime_admission_limit_survives_withdrawals_and_finalize_bounded` exercises all 128 lifetime slots, rejects a 129th despite withdrawals, and verifies bounded finalization gas in the mocked VM. Actual deployed gas/fees should be measured again from testnet receipts; mocked gas is not a production benchmark.

Native verification on 5 November 2026 passed all 15 escrow tests and the test token's supply/metadata test. The three-budget quote returned **292,408 reserved bytes** and **2,924,080,000,000,000,000,000,000 yoctoNEAR** (2.92408 NEAR at the mocked runtime byte cost). The 128-account partial-liability population consumed **100,472 bytes** after collection flush. This is the observed unit-VM measurement, not a claim of exact production trie consumption. The full command output is retained in ignored `contract/target/native-test.log`.

The development deployment's own WASM/base state storage is funded separately from campaign creation. Upgrade authority, if retained, can replace these rules and remains a disclosed trust assumption until removed or constrained.
