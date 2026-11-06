# Dependency release review

Checked 6 November 2026. Machine reports are in `audits/`; reproduce Rust checks with `node release-qa/audit-rust.mjs`.

Both final Rust lockfiles still produce a nonzero cargo-audit result: `crypto-bigint` 0.5.5 has RUSTSEC-2026-0387 and `unsafe-libyaml` has an unmaintained warning. The official advisory describes timing leakage in affected secret-integer arithmetic; the patched major version is not a drop-in override for this SDK dependency graph. [RustSec advisory](https://rustsec.org/advisories/RUSTSEC-2026-0387.html).

For each entire contract workspace, `cargo tree --locked --offline --workspace --target wasm32-unknown-unknown --edges normal --invert <package>` shows neither crypto-bigint nor unsafe-libyaml in the normal deployed WASM dependency graph. These retained lockfile dependencies belong to host/test/build tooling. This scopes the exposure; it does not make the full dependency audit clean or prove those tools have no vulnerabilities. Do not use these test harnesses as general-purpose secret-key cryptographic services.

The unmaintained `wee_alloc` allocator was removed by disabling default SDK features in both contract workspaces, including development/member dependencies. It no longer matches any package in either lockfile. All affected WASMs were rebuilt and freshly deployed for release testnet evidence; earlier deployed contracts retain their earlier code and evidence.

Production JavaScript audit results from the final frozen-install drill are recorded separately in `REPRODUCIBILITY.md` and its JSON evidence. A clean advisory database result is a point-in-time check, not an independent security audit.

## Public RPC handling

AllTogether's read-only transport accepts only two explicit HTTPS testnet sources (Intear and FastNear), defaults to Intear, serializes and paces reads, bounds its queue and retries, handles HTTP 429/5xx and JSON-RPC -429, and rejects write RPC methods. Retry payloads remain identical. Binding, chain identity, pinned code hashes, final-block consistency and custody checks remain required; there is no local-ledger fallback. The browser wallet provider and final transaction reader use the same default. [Official NEAR provider list](https://docs.near.org/api/rpc/providers).

Two new transport tests cover throttling, retry count/payload identity, serialization, preserved contract errors, arbitrary-provider rejection and signed-write rejection. AllTogether's final 63-test full suite passed with localhost and Windows junction privileges, zero failures or skips, including two further receipt replay regressions. Final build and strict typechecks also passed after the timestamp/hash-ownership fix.
