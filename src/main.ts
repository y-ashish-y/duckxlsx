import { homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";
import { parseArgs, type CliCommand } from "./cli.js";
import { ImportStore } from "./saved.js";
import { runSaved } from "./run.js";
import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";

export interface Deps {
  storeFile: string;
  cliPath: string;
  runner?: (store: ImportStore, name: string, cliPath: string) => Promise<number>;
}

// Returns a process exit code; all failures surface on stderr, never silent.
export async function dispatch(argv: string[], deps: Deps): Promise<number> {
  let cmd: CliCommand;
  try {
    cmd = parseArgs(argv);
  } catch (err) {
    console.error(`usage: duckxlsx (save --name N --db DB [--table S.T | --sql SQL] --range A1 | run --name N | remove --name N | list)`);
    console.error((err as Error).message);
    return 2;
  }
  const store = new ImportStore(deps.storeFile);
  const run = deps.runner ?? runSaved;
  try {
    if (cmd.command === "list") {
      for (const imp of store.list()) console.log(`${imp.name}\t${imp.kind}\t${imp.workbook}\t${imp.range}`);
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
    if (!cmd.table && !cmd.sql) {
      console.error("save needs --table SCHEMA.TABLE or --sql SQL");
      return 2;
    }
    if (cmd.table) {
      const parts = cmd.table.split(".");
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        console.error(`--table must be SCHEMA.TABLE (got "${cmd.table}")`);
        return 2;
      }
      const [schema, table] = parts;
      const engine = new NodeEngine(cmd.db);
      let columns: string[];
      try {
        const cols = await engine.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = '${schema.replace(/'/g, "''")}' AND table_name = '${table.replace(/'/g, "''")}' ORDER BY ordinal_position`,
        );
        columns = cols.map((c) => c.column_name);
      } finally {
        await engine.close();
      }
      if (columns.length === 0) {
        console.error(`table ${cmd.table} not found or has no columns`);
        return 1;
      }
      if (!existsSync(cmd.workbook)) {
        const bridge = new GridCraftBridge(deps.cliPath);
        await bridge.start();
        try {
          await bridge.newWorkbook();
          await bridge.saveWorkbook(cmd.workbook);
        } finally {
          await bridge.close();
        }
      }
      store.save({ name: cmd.name, dbPath: cmd.db, kind: "table", schema, table, columns, workbook: cmd.workbook, range: cmd.range });
    } else {
      if (!existsSync(cmd.workbook)) {
        console.error(`workbook not found: ${cmd.workbook} (save creates it only for --table)`);
        return 1;
      }
      store.save({ name: cmd.name, dbPath: cmd.db, kind: "query", sql: cmd.sql!, workbook: cmd.workbook, range: cmd.range });
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
if (invokedAs.endsWith("main.js") || invokedAs.endsWith("cli.cjs")) {
  await main(process.argv.slice(2));
}
