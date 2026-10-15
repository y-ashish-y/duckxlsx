"""Shared mapping layers, ported from the TypeScript core (src/import-sql.ts,
src/export-mapping.ts): same semantics, pytest-proven."""

from datetime import date, datetime
from typing import Any, Optional


def quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def quote_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def build_import_sql(source: dict) -> str:
    limit = source.get("limit")
    if limit is not None and (not isinstance(limit, int) or isinstance(limit, bool) or limit <= 0):
        raise ValueError(f"build_import_sql: limit must be a positive integer (got {limit})")
    select = ", ".join(quote_ident(c) for c in source["columns"])
    limit_clause = "" if limit is None else f" LIMIT {limit}"
    return f"SELECT {select} FROM {quote_ident(source['schema'])}.{quote_ident(source['table'])}{limit_clause};"


def _infer_type(values: list) -> str:
    present = [v for v in values if v is not None]
    if not present:
        return "VARCHAR"
    if all(isinstance(v, bool) for v in present):
        return "BOOLEAN"
    if all(isinstance(v, (datetime, date)) and not isinstance(v, bool) for v in present):
        return "TIMESTAMP"
    if all(isinstance(v, int) and not isinstance(v, bool) for v in present):
        return "INTEGER"
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in present):
        return "DOUBLE"
    return "VARCHAR"


def _format_literal(value: Any, type_: str) -> str:
    if value is None:
        return "NULL"
    if type_ == "BOOLEAN":
        return "TRUE" if value else "FALSE"
    if type_ == "TIMESTAMP":
        if isinstance(value, datetime):
            return quote_string(value.isoformat(sep=" ", timespec="seconds"))
        if isinstance(value, date):
            return quote_string(value.isoformat())
        return quote_string(str(value))
    if type_ in ("INTEGER", "DOUBLE") and isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return quote_string(str(value))


def infer_columns(header: Optional[list], rows: list, overrides: Optional[dict] = None) -> list:
    overrides = overrides or {}
    width = max([len(header) if header else 0] + [len(r) for r in rows])
    columns = []
    for i in range(width):
        current = header[i] if header and i < len(header) and header[i] != "" else f"col_{i + 1}"
        override = overrides.get(current)
        if isinstance(override, str):
            renamed, retyped = current, override
        elif isinstance(override, dict):
            renamed = override.get("name", current)
            retyped = override.get("type")
        else:
            renamed, retyped = current, None
        if retyped is None:
            retyped = _infer_type([r[i] if i < len(r) else None for r in rows])
        columns.append({"name": renamed, "type": retyped})
    return columns


def columns_from_names_types(names: list, types: list, overrides: Optional[dict] = None) -> list:
    """Build column defs from macro-reported names + VarType-derived types."""
    overrides = overrides or {}
    columns = []
    for name, type_ in zip(names, types):
        override = overrides.get(name, {})
        if isinstance(override, str):
            override = {"type": override}
        columns.append({"name": override.get("name", name), "type": override.get("type", type_)})
    return columns


def coerce_cell(text: str, type_: str):
    """Convert macro TSV text back to a typed value for INSERT literals."""
    if text == "":
        return None
    if type_ == "BOOLEAN":
        return text.strip().upper() == "TRUE"
    if type_ in ("INTEGER", "DOUBLE"):
        try:
            number = float(text.replace(",", "."))
        except ValueError:
            return text
        if type_ == "INTEGER" and number.is_integer():
            return int(number)
        return number
    return text


def create_table_sql(table: str, columns: list, mode: str) -> str:
    or_replace = " OR REPLACE" if mode == "overwrite" else ""
    defs = ", ".join(f"{quote_ident(c['name'])} {c['type']}" for c in columns)
    return f"CREATE{or_replace} TABLE {quote_ident(table)} ({defs});"


def insert_sql(table: str, columns: list, rows: list) -> str:
    if not rows:
        raise ValueError("insert_sql: no rows to insert")
    names = ", ".join(quote_ident(c["name"]) for c in columns)
    values = ", ".join(
        "(" + ", ".join(_format_literal(row[i] if i < len(row) else None, columns[i]["type"]) for i in range(len(columns))) + ")"
        for row in rows
    )
    return f"INSERT INTO {quote_ident(table)} ({names}) VALUES {values};"
