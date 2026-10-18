import duckdbPkg from "duckdb";

interface DuckDBDatabase {
  all(
    sql: string,
    ...args: [...params: unknown[], cb: (err: Error | null, rows: Record<string, unknown>[]) => void]
  ): void;
  close(cb: () => void): void;
}

const { Database } = duckdbPkg as unknown as { Database: new (path: string) => DuckDBDatabase };

export interface Engine {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// single-writer rule for the file: only one handle per path per process.
// duckdb@1.4.x on Windows cannot establish a second connection to the same
// path — not concurrently, and not again after close() — so every NodeEngine
// for a given path shares one refcounted Database handle.
const sharedDatabases = new Map<string, { db: DuckDBDatabase; refs: number }>();

function acquireShared(path: string): DuckDBDatabase {
  if (path === ":memory:") {
    // Memory databases are per-instance by design (no file lock to collide with);
    // only real file paths go through the shared-handle registry.
    return new Database(path);
  }
  const entry = sharedDatabases.get(path);
  if (entry) {
    entry.refs += 1;
    return entry.db;
  }
  const db = new Database(path);
  sharedDatabases.set(path, { db, refs: 1 });
  return db;
}

function releaseShared(path: string): Promise<void> {
  if (path === ":memory:") return Promise.resolve();
  const entry = sharedDatabases.get(path);
  if (!entry) return Promise.resolve();
  entry.refs -= 1;
  // Never actually close: duckdb@1.4.x on Windows cannot attach a path again after
  // close (or concurrently) within one process — the second connection never
  // establishes. The single-writer rule wants the lock held for process lifetime,
  // so the shared handle stays live until process exit; close() just drops a ref.
  return Promise.resolve();
}

// ponytail: native binding for tests/dev; taskpane uses WasmEngine (same SQL) — see src/wasm-engine.ts
export class NodeEngine implements Engine {
  private db: DuckDBDatabase;
  constructor(private path: string) {
    this.db = acquireShared(path);
  }

  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, ...params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
    });
  }

  close(): Promise<void> {
    return releaseShared(this.path);
  }
}
