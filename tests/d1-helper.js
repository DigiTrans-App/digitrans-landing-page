import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

// Real SQLite, with the D1 binding interface. No Cloudflare or customer data.
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(readFileSync(new URL("../docs/sql/visitor-sessions.sql", import.meta.url), "utf8"));
  const prepare = (sql) => ({
    bind: (...args) => ({
      run: () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
      first: () => sqlite.prepare(sql).get(...args) || null,
      execute: () => {
        if (/^\s*SELECT/i.test(sql)) return { results: sqlite.prepare(sql).all(...args), meta: { changes: 0 } };
        return { results: [], meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } };
      },
    }),
  });
  return {
    sqlite, prepare,
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try { const result = statements.map((statement) => statement.execute()); sqlite.exec("COMMIT"); return result; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
}
