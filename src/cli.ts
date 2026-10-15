export type CliCommand =
  | { command: "save"; name: string; db: string; table?: { schema: string; table: string }; sql?: string; range: string; workbook: string; limit?: number; params: string[] }
  | { command: "run"; name: string }
  | { command: "remove"; name: string }
  | { command: "export"; workbook: string; range: string; table: string; db: string; header: boolean; mode: "create" | "overwrite" }
  | { command: "host"; port: number; gridcraftDir?: string; gridcraftUrl?: string }
  | { command: "list" };

function requireFlagValue(args: string[], name: string): string {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) throw new Error(`missing value for ${name}`);
  return args[i + 1];
}

function optionalInt(args: string[], name: string): number | undefined {
  if (!args.includes(name)) return undefined;
  const n = Number(requireFlagValue(args, name));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

function allFlags(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length - 1; i++) if (args[i] === name) out.push(args[i + 1]);
  return out;
}

function parseTableRef(ref: string): { schema: string; table: string } {
  const parts = ref.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error(`--table must be SCHEMA.TABLE (got "${ref}")`);
  return { schema: parts[0], table: parts[1] };
}

export function parseArgs(argv: string[]): CliCommand {
  const [command, ...rest] = argv;
  if (command === "list") return { command: "list" };
  if (command === "run") return { command: "run", name: requireFlagValue(rest, "--name") };
  if (command === "remove") return { command: "remove", name: requireFlagValue(rest, "--name") };
  if (command === "save") {
    const tableRef = rest.includes("--table") ? requireFlagValue(rest, "--table") : undefined;
    return {
      command: "save",
      name: requireFlagValue(rest, "--name"),
      db: requireFlagValue(rest, "--db"),
      range: requireFlagValue(rest, "--range"),
      workbook: requireFlagValue(rest, "--workbook"),
      limit: optionalInt(rest, "--limit"),
      params: allFlags(rest, "--param"),
      ...(tableRef ? { table: parseTableRef(tableRef) } : {}),
      ...(rest.includes("--sql") ? { sql: requireFlagValue(rest, "--sql") } : {}),
    };
  }
  if (command === "export") return parseExport(rest);
  if (command === "host") return parseHost(rest);
  throw new Error(`unknown command "${command}" (save|run|remove|list|export|host)`);
}

function parseExport(rest: string[]): CliCommand {
  return {
    command: "export",
    workbook: requireFlagValue(rest, "--workbook"),
    range: requireFlagValue(rest, "--range"),
    table: requireFlagValue(rest, "--table"),
    db: requireFlagValue(rest, "--db"),
    header: !rest.includes("--no-header"),
    mode: rest.includes("--overwrite") ? "overwrite" : "create",
  };
}

function parseHost(rest: string[]): CliCommand {
  return {
    command: "host",
    port: rest.includes("--port") ? optionalInt(rest, "--port")! : 8766,
    ...(rest.includes("--gridcraft-dir") ? { gridcraftDir: requireFlagValue(rest, "--gridcraft-dir") } : {}),
    ...(rest.includes("--gridcraft-url") ? { gridcraftUrl: requireFlagValue(rest, "--gridcraft-url") } : {}),
  };
}
}
