# Security and trust boundaries

This is a development prototype with valueless test assets, not an audited production financial service.

- Local mode binds to loopback and explicitly simulates account roles. Its headers are not production authentication; no real wallet secrets belong in the server, browser, database or exports.
- The NEAR escrow accepts only its configured token and authenticates sponsorship using the token-supplied sender. A caller-supplied DAO name is not authority.
- Terms, beneficiaries and deadlines cannot be edited after publication. Matching and all monetary arithmetic use checked integer base units.
- Withdrawal removal and payment are separate. Failed or late callbacks restore a fixed creditor's credit, never active funding. Pending attempts are reserved and cannot be paid twice or reset based only on a timer.
- Settlement is bounded by at most three budgets, creates all beneficiary entitlements or none, and does not iterate contributors. Refunds are individually materialized and claimed.
- Local transfers persist reservation, actual wallet execution and callback resolution separately. Recovery reconciles the durable result instead of paying again.
- Native storage/gas and testUSD obligations are separate. The contract quote prepays bounded participant/credit/attempt storage; see STORAGE.md.
- Actual testnet deployments retain dedicated upgrade keys. Their holder can replace code; this trust is disclosed. Production immutability or governed upgrades and an external audit are future gates.
- The DAO approves subsidies and beneficiaries. Account naming does not establish personhood or prevent beneficiary self-funding. The contract guarantees funding rules, not physical delivery.
- Exports escape CSV formula prefixes and include complete local transfer history. Public receipts contain no private keys. Generated testnet credentials remain only in ignored `.secrets` files.

For a stuck NEAR callback, inspect authoritative contract state and downstream receipts before action. Never retry a still-pending transfer or manually create a second credit. See NEAR.md for operation details and recorded integration evidence.
