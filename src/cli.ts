export type CliCommand =
  | { command: "save"; name: string; db: string; table?: string; sql?: string; range: string; workbook: string }
  | { command: "run"; name: string }
  | { command: "remove"; name: string }
  | { command: "list" };

function flag(args: string[], name: string): string {
  const i = args.indexOf(name);
  if (i === -1 || i + 1 >= args.length) throw new Error(`missing value for ${name}`);
  return args[i + 1];
}

export function parseArgs(argv: string[]): CliCommand {
  const [command, ...rest] = argv;
  if (command === "list") return { command: "list" };
  if (command === "run") return { command: "run", name: flag(rest, "--name") };
  if (command === "remove") return { command: "remove", name: flag(rest, "--name") };
  if (command === "save") {
    return {
      command: "save",
      name: flag(rest, "--name"),
      db: flag(rest, "--db"),
      range: flag(rest, "--range"),
      workbook: flag(rest, "--workbook"),
      ...(rest.includes("--table") ? { table: flag(rest, "--table") } : {}),
      ...(rest.includes("--sql") ? { sql: flag(rest, "--sql") } : {}),
    };
  }
  throw new Error(`unknown command "${command}" (save|run|remove|list)`);
}
