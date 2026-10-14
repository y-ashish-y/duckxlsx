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

// ponytail: native binding for tests/dev; taskpane uses WasmEngine (same SQL) — see src/wasm-engine.ts
export class NodeEngine implements Engine {
  private db: DuckDBDatabase;
  constructor(private path: string) {
    this.db = new Database(path);
  }

  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, ...params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.db.close(() => resolve()));
  }
}
