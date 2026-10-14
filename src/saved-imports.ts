export interface SavedImport {
  name: string;
  schema: string;
  table: string;
  columns: string[];
  limit?: number;
  destination: { mode: "new-sheet" } | { mode: "current" };
}

export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "duckxlsx.savedImports";

// ponytail: localStorage-backed in v1 (per browser profile); workbook-embedded persistence is a later ticket
export class SavedImportStore {
  constructor(private storage: StringStorage) {}

  list(): SavedImport[] {
    const raw = this.storage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedImport[];
  }

  get(name: string): SavedImport | undefined {
    return this.list().find((i) => i.name === name);
  }

  save(imp: SavedImport): void {
    const rest = this.list().filter((i) => i.name !== imp.name);
    this.storage.setItem(KEY, JSON.stringify([...rest, imp]));
  }

  remove(name: string): void {
    this.storage.setItem(KEY, JSON.stringify(this.list().filter((i) => i.name !== name)));
  }
}
