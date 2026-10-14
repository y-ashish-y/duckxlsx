import { Database } from "duckdb";

export interface Engine {
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  close(): Promise<void>;
}

// ponytail: native binding for tests/dev; taskpane uses WasmEngine (same SQL) — see src/wasm-engine.ts
export class NodeEngine implements Engine {
  private db: Database;
  constructor(private path: string) {
    this.db = new Database(path);
  }

  query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.db.close(() => resolve()));
  }
}
