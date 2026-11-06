import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.ts";

export class Store {
  db: DatabaseSync;
  closed = false;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    const version = this.db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (version.user_version > SCHEMA_VERSION || version.user_version < 0) {
      this.db.close();
      throw new Error("Database schema is newer than this application.");
    }
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    // Initial v0→v1 migration only. Future migrations belong in this ordered,
    // transactional list; current databases are not silently rewritten.
    const migrations=[{from:0,to:1,sql:SCHEMA_SQL}];
    let current=version.user_version;
    for(const migration of migrations){if(current!==migration.from)continue;this.transaction(()=>{this.db.exec(migration.sql);this.db.exec(`PRAGMA user_version=${migration.to}`);});current=migration.to;}
    if(current!==SCHEMA_VERSION){this.db.close();throw new Error('No supported database migration path.');}
  }
  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  get<T>(sql: string, ...args: (string | number | null)[]): T | undefined {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }
  all<T>(sql: string, ...args: (string | number | null)[]): T[] {
    return this.db.prepare(sql).all(...args) as T[];
  }
  run(sql: string, ...args: (string | number | null)[]) {
    return this.db.prepare(sql).run(...args);
  }
  object<T>(table: string, id: string): T | undefined {
    if (
      !["accounts", "campaigns", "credits", "attempts", "proposals"].includes(
        table,
      )
    )
      throw new Error("Invalid table");
    const row = this.get<{ payload: string }>(
      `SELECT payload FROM ${table} WHERE id=?`,
      id,
    );
    return row ? (JSON.parse(row.payload) as T) : undefined;
  }
  objects<T>(
    table: string,
    where = "",
    args: (string | number | null)[] = [],
  ): T[] {
    if (
      ![
        "accounts",
        "campaigns",
        "credits",
        "attempts",
        "proposals",
        "positions",
        "transfer_results",
        "events",
      ].includes(table)
    )
      throw new Error("Invalid table");
    return this.all<{ payload: string }>(
      `SELECT payload FROM ${table} ${where}`,
      ...args,
    ).map((row) => JSON.parse(row.payload) as T);
  }
  next(name: string): string {
    const key = `sequence:${name}`;
    const current = this.get<{ value: string }>(
      "SELECT value FROM meta WHERE key=?",
      key,
    );
    const next = (BigInt(current?.value ?? "0") + 1n).toString();
    this.run(
      "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      next,
    );
    return next;
  }
  close() {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }
}
