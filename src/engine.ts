import { DuckDBInstance, type DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";

export interface Engine {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// Keep new files at the 1.5.6 storage version: the taskpane still ships
// DuckDB-WASM 1.5.x, which cannot read 2.0-format files (2.0 reads both).
const CREATE_OPTIONS = { storage_compatibility_version: "v1.5.6" };

// single-writer rule for the file: only one instance per path per process.
// @duckdb/node-api (Neo) replaces the legacy duckdb@1.4.x package (which stops
// at 1.4.4 and cannot speak 2.0); every NodeEngine for a path shares one
// refcounted instance, and each engine gets its own connection on it.
const sharedInstances = new Map<string, { instance: Promise<DuckDBInstance>; refs: number }>();

function acquireInstance(path: string): Promise<DuckDBInstance> {
  if (path === ":memory:") {
    // Memory databases are per-instance by design (no file lock to collide with);
    // only real file paths go through the shared-instance registry.
    return DuckDBInstance.create(path, CREATE_OPTIONS);
  }
  const entry = sharedInstances.get(path);
  if (entry) {
    entry.refs += 1;
    return entry.instance;
  }
  const instance = DuckDBInstance.create(path, CREATE_OPTIONS);
  sharedInstances.set(path, { instance, refs: 1 });
  // Do not poison the registry with a rejected create (e.g. file locked elsewhere).
  instance.catch(() => {
    if (sharedInstances.get(path)?.instance === instance) sharedInstances.delete(path);
  });
  return instance;
}

function releaseInstance(path: string): void {
  if (path === ":memory:") return;
  const entry = sharedInstances.get(path);
  if (!entry) return;
  entry.refs -= 1;
  // Never actually close: an open instance holds the single-writer lock, and
  // Neo can hand out further connections to the same file while it stays live.
  // close() only drops this engine's ref; the shared instance lives until exit.
}

// ponytail: native binding for tests/dev; taskpane uses WasmEngine (same SQL) — see src/wasm-engine.ts
export class NodeEngine implements Engine {
  private connection: Promise<DuckDBConnection>;

  constructor(private path: string) {
    this.connection = acquireInstance(path).then((instance) => instance.connect());
  }

  async query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    const connection = await this.connection;
    const reader =
      params.length === 0
        ? await connection.runAndReadAll(sql)
        : await connection.runAndReadAll(sql, params as DuckDBValue[]);
    // getRowObjectsJS converts DuckDBValue wrappers to plain JS (Date, number, bigint, ...).
    return reader.getRowObjectsJS() as unknown as T[];
  }

  async close(): Promise<void> {
    releaseInstance(this.path);
  }
}
