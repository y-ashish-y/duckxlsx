"""Flag-only CLI parsing (no prompts, no interactive input)."""


def _required_flag(args: list, name: str) -> str:
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
        return {"command": "run", "name": _required_flag(rest, "--name")}
    if command == "remove":
        return {"command": "remove", "name": _required_flag(rest, "--name")}
    if command == "save":
        cmd = {
            "command": "save",
            "name": _required_flag(rest, "--name"),
            "db": _required_flag(rest, "--db"),
            "workbook": _required_flag(rest, "--workbook"),
            "range": _required_flag(rest, "--range"),
            "sheet": rest[rest.index("--sheet") + 1] if "--sheet" in rest and rest.index("--sheet") + 1 < len(rest) else "Sheet1",
        }
        if "--table" in rest:
            cmd["table"] = _required_flag(rest, "--table")
        if "--sql" in rest:
            cmd["sql"] = _required_flag(rest, "--sql")
        if "--limit" in rest:
            limit = int(_required_flag(rest, "--limit"))
            if limit <= 0:
                raise ValueError("--limit must be a positive integer")
            cmd["limit"] = limit
        params = [rest[i + 1] for i in range(len(rest) - 1) if rest[i] == "--param"]
        if params:
            cmd["params"] = params
        return cmd
    raise ValueError(f'unknown command "{command}" (save|run|remove|list)')
