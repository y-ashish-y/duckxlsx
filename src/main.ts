import { homedir } from "os";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { parseArgs, type CliCommand } from "./cli.js";
import { ImportStore } from "./saved.js";
import { ensureWorkbook, runSaved, tableColumns } from "./run.js";
import { GridCraftBridge } from "./bridge.js";
import { NodeEngine } from "./engine.js";
import { exportRange } from "./gridcraft-export.js";
import { startHost } from "./host-server.js";

export interface ExportArgs {
  workbook: string;
  range: string;
  table: string;
  db: string;
  header: boolean;
  mode: "create" | "overwrite";
  cliPath: string;
}

export interface HostArgs {
  port: number;
  gridcraftDir?: string;
  gridcraftUrl?: string;
}

export interface Deps {
  storeFile: string;
  cliPath: string;
  runner?: (store: ImportStore, name: string, cliPath: string) => Promise<number>;
  exporter?: (args: ExportArgs) => Promise<number>;
  hostStarter?: (args: HostArgs) => Promise<{ port: number; close: () => Promise<void> }>;
}

async function defaultExporter(args: ExportArgs): Promise<number> {
  if (!existsSync(args.workbook)) throw new Error(`workbook not found: ${args.workbook}`);
  const bridge = new GridCraftBridge(args.cliPath);
  await bridge.start();
  const engine = new NodeEngine(args.db);
  try {
    await bridge.openWorkbook(resolve(args.workbook));
    return await exportRange(engine, bridge, { range: args.range, table: args.table, header: args.header, mode: args.mode });
  } finally {
    await bridge.close();
    await engine.close();
  }
}

// Returns a process exit code; all failures surface on stderr, never silent.
export async function dispatch(argv: string[], deps: Deps): Promise<number> {
  let cmd: CliCommand;
  try {
    cmd = parseArgs(argv);
  } catch (err) {
    console.error(`usage: duckxlsx (save --name N --db DB [--table S.T | --sql SQL] --range A1 | run --name N | remove --name N | list | export --workbook WB --range R --table T --db DB | host [--port P])`);
    console.error((err as Error).message);
    return 2;
  }
  const store = new ImportStore(deps.storeFile);
  const run = deps.runner ?? runSaved;
  try {
    if (cmd.command === "list") {
      for (const imp of store.list()) {
        const source =
          imp.kind === "table" ? `${imp.schema}.${imp.table}` : (imp.sql ?? "");
        const extras = [imp.limit === undefined ? "" : `limit=${imp.limit}`, `range=${imp.range}`]
          .filter(Boolean)
          .join(" ");
        console.log(`${imp.name}\t${imp.kind}\t${source}\t${imp.dbPath}\t${extras}`);
      }
      return 0;
    }
    if (cmd.command === "remove") {
      store.remove(cmd.name);
      return 0;
    }
    if (cmd.command === "run") {
      const count = await run(store, cmd.name, deps.cliPath);
      console.log(`${cmd.name}: ${count} rows`);
      return 0;
    }
    if (cmd.command === "export") {
      const exporter = deps.exporter ?? defaultExporter;
      const count = await exporter({
        workbook: cmd.workbook,
        range: cmd.range,
        table: cmd.table,
        db: cmd.db,
        header: cmd.header,
        mode: cmd.mode,
        cliPath: deps.cliPath,
      });
      console.log(`${cmd.table}: ${count} rows`);
      return 0;
    }
    if (cmd.command === "host") {
      const starter = deps.hostStarter ?? startHost;
      const { port, close } = await starter({
        port: cmd.port,
        gridcraftDir: cmd.gridcraftDir ?? process.env.GRIDCRAFT_WEB_DIR,
        gridcraftUrl: cmd.gridcraftUrl ?? process.env.GRIDCRAFT_WEB_URL,
      });
      console.log(`duckxlsx host on http://127.0.0.1:${port}`);
      if (starter === startHost) {
        await new Promise<void>((resolve) => {
          const stop = () => void close().finally(() => resolve());
          process.on("SIGINT", stop);
          process.on("SIGTERM", stop);
        });
      }
      return 0;
    }
    if (!cmd.table && !cmd.sql) {
      console.error("save needs --table SCHEMA.TABLE or --sql SQL");
      return 2;
    }
    if (!existsSync(cmd.workbook)) await ensureWorkbook(deps.cliPath, cmd.workbook);
    if (cmd.table) {
      const columns = await tableColumns(cmd.db, cmd.table.schema, cmd.table.table);
      if (columns.length === 0) {
        console.error(`table ${cmd.table.schema}.${cmd.table.table} not found or has no columns`);
        return 1;
      }
      store.save({
        name: cmd.name,
        dbPath: cmd.db,
        kind: "table",
        schema: cmd.table.schema,
        table: cmd.table.table,
        columns,
        limit: cmd.limit,
        workbook: cmd.workbook,
        range: cmd.range,
      });
    } else {
      store.save({
        name: cmd.name,
        dbPath: cmd.db,
        kind: "query",
        sql: cmd.sql!,
        params: cmd.params,
        limit: cmd.limit,
        workbook: cmd.workbook,
        range: cmd.range,
      });
    }
    console.log(`saved ${cmd.name}`);
    return 0;
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }
}

function defaultStore(): string {
  return process.env.DUCKXLSX_STORE ?? join(homedir(), ".config", "duckxlsx", "imports.json");
}

function defaultCli(): string {
  return process.env.GRIDCRAFT_CLI ?? "gridcraft-cli";
}

// Entry: `duckxlsx save|run|remove|list`. No prompts — all inputs are flags.
export async function main(argv: string[]): Promise<void> {
  process.exit(await dispatch(argv, { storeFile: defaultStore(), cliPath: defaultCli() }));
}

const invokedAs = process.argv[1] ?? "";
if (invokedAs && fileURLToPath(import.meta.url) === invokedAs) {
  await main(process.argv.slice(2));
}
