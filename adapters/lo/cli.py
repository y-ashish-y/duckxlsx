"""Flag-only CLI parsing (no prompts, no interactive input)."""


def _flag(args: list, name: str) -> str:
    if name not in args or args.index(name) + 1 >= len(args):
        raise ValueError(f"missing value for {name}")
    return args[args.index(name) + 1]


def parse_args(argv: list) -> dict:
    if not argv:
        raise ValueError("unknown command \"\" (save|run|remove|list)")
    command, rest = argv[0], argv[1:]
    if command == "list":
        return {"command": "list"}
    if command == "run":
        return {"command": "run", "name": _flag(rest, "--name")}
    if command == "remove":
        return {"command": "remove", "name": _flag(rest, "--name")}
    if command == "save":
        cmd = {
            "command": "save",
            "name": _flag(rest, "--name"),
            "db": _flag(rest, "--db"),
            "workbook": _flag(rest, "--workbook"),
            "range": _flag(rest, "--range"),
        }
        if "--table" in rest:
            cmd["table"] = _flag(rest, "--table")
        if "--sql" in rest:
            cmd["sql"] = _flag(rest, "--sql")
        if "--limit" in rest:
            cmd["limit"] = int(_flag(rest, "--limit"))
        return cmd
    raise ValueError(f'unknown command "{command}" (save|run|remove|list)')
