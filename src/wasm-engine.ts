import * as duckdb from "@duckdb/duckdb-wasm";
import type { Engine } from "./engine.js";

export interface Connection {
  name: string;
}

declare global {
  function showOpenFilePicker(options?: {
    types?: { description?: string; accept: Record<string, string[]> }[];
    multiple?: boolean;
  }): Promise<FileSystemFileHandle[]>;
  interface FileSystemFileHandle {
    queryPermission(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  }
}

const HANDLE_STORE = "duckxlsx";
const HANDLE_KEY = "local-file-handle";
const NAME_KEY = "duckxlsx.connectionName";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_STORE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await idb();
    const handle = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, "readonly");
      const req = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return (handle as FileSystemFileHandle) ?? null;
  } catch {
    return null;
  }
}

// Taskpane-side engine: same Engine seam as NodeEngine, backed by DuckDB-WASM.
// A local .duckdb enters only via an explicit user file pick — never a silent
// path (Office sandbox has no local-path I/O). The picked FileSystemFileHandle
// is kept in IndexedDB so the connection survives reloads; Excel re-grants
// access with one click if the browser withheld permission.
export class WasmEngine implements Engine {
  private db: duckdb.AsyncDuckDB | null = null;
  private conn: duckdb.AsyncDuckDBConnection | null = null;

  private async ensureDb(): Promise<duckdb.AsyncDuckDB> {
    if (this.db) return this.db;
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }),
    );
    const worker = new Worker(workerUrl);
    this.db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    return this.db;
  }

  private async attach(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
    await conn.query("DETACH IF EXISTS picked;");
    await conn.query("ATTACH 'picked.duckdb' AS picked;");
  }

  private async finishConnect(db: duckdb.AsyncDuckDB, name: string): Promise<Connection> {
    this.conn = await db.connect();
    await this.attach(this.conn);
    localStorage.setItem(NAME_KEY, name);
    return { name };
  }

  async connectWithPicker(): Promise<Connection> {
    const [handle] = await showOpenFilePicker({
      types: [{ description: "DuckDB database", accept: { "application/octet-stream": [".duckdb", ".db"] } }],
      multiple: false,
    });
    const db = await this.ensureDb();
    await db.registerFileHandle("picked.duckdb", handle, duckdb.DuckDBDataProtocol.BROWSER_FSACCESS, true);
    await storeHandle(handle);
    return this.finishConnect(db, handle.name);
  }

  async connectWithFile(picked: File): Promise<Connection> {
    const db = await this.ensureDb();
    await db.registerFileBuffer("picked.duckdb", new Uint8Array(await picked.arrayBuffer()));
    return this.finishConnect(db, picked.name);
  }

  async restore(): Promise<Connection | null> {
    const name = localStorage.getItem(NAME_KEY);
    if (!name) return null;
    const handle = await loadHandle();
    if (!handle) return null;
    if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") return null;
    const db = await this.ensureDb();
    await db.registerFileHandle("picked.duckdb", handle, duckdb.DuckDBDataProtocol.BROWSER_FSACCESS, true);
    return this.finishConnect(db, name);
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    if (!this.conn) throw new Error("not connected: pick a .duckdb file first");
    const result = await this.conn.query(sql);
    return result.toArray().map((row) => row.toJSON() as T);
  }

  async close(): Promise<void> {
    if (this.conn) await this.conn.close();
    this.conn = null;
  }
}
