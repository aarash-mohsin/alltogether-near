# Fresh install and restore check

Run on 5 November 2026 at 22:25 UTC, on Windows with Node 24.22.1 and pnpm 11.25.0. Passed. Machine records: [fresh-1793917516356/evidence.json](fresh-1793917516356/evidence.json). The harness script that ran this check is not included in this repository; the steps it took are listed below.

1. **Clean copy.** The source was copied without dependencies, build output, Rust targets, local tooling, data, environment files or credentials.
2. **Install, build, audit.** `pnpm install --frozen-lockfile`, then the build script (including strict TypeScript), then `pnpm audit --prod --json`. All exited zero, and the production audit reported no advisories at any severity ([alltogether-audit.json](fresh-1793917516356/alltogether-audit.json)). An audit result is only valid for the time it was run.
3. **Run, back up, restore.** The real API was started on an isolated port against freshly seeded SQLite data. Its built HTML was checked, and then every server and database was stopped. The shipped backup and restore functions were run, and every restored file's SHA-256 was checked against the backup manifest. The restored services were then started again. Plan accounting, credits and terms matched exactly; only freshly generated observation timestamps were excluded from the comparison.
4. **Production entry point.** The shipped `server/main.ts` was started against the restored data, outside Vite and the test harness, and its API, HTML and health checks passed ([production-entry-smoke.json](fresh-1793917516356/production-entry-smoke.json)).

The check was repeated after the last fixes (the receipt timestamp and hash-ownership rules) and passed again. It made no chain writes or RPC calls.
