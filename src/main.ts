import { homedir } from "os";
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { parseArgs, type CliCommand } from "./cli.js";
import { ImportStore } from "./saved.js";
import { ensureWorkbook, runSaved, tableColumns } from "./run.js";

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
