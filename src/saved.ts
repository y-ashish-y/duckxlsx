import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export interface SavedImport {
  name: string;
  dbPath: string;
  kind: "table" | "query";
  schema?: string;
  table?: string;
  columns?: string[];
  sql?: string;
  params?: unknown[];
  limit?: number;
  workbook: string;
  range: string;
}

// File-backed saved imports (adapter-side). JSON round-trips params,
// so only JSON-safe param values survive a save/load cycle.
export class ImportStore {
  constructor(private file: string) {}

  list(): SavedImport[] {
    if (!existsSync(this.file)) return [];
    return JSON.parse(readFileSync(this.file, "utf8")) as SavedImport[];
  }

  get(name: string): SavedImport | undefined {
    return this.list().find((i) => i.name === name);
  }

  save(imp: SavedImport): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const rest = this.list().filter((i) => i.name !== imp.name);
    writeFileSync(this.file, JSON.stringify([...rest, imp], null, 2));
  }

  remove(name: string): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.list().filter((i) => i.name !== name), null, 2));
  }
}
