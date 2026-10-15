"""Adapter-side saved imports (JSON store). Same shape as the other adapters."""

import json
from pathlib import Path


class ImportStore:
    def __init__(self, path):
        self.path = Path(path)

    def list(self) -> list:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8"))

    def get(self, name: str):
        for imp in self.list():
            if imp["name"] == name:
                return imp
        return None

    def save(self, imp: dict) -> None:
        self._write([i for i in self.list() if i["name"] != imp["name"]] + [imp])

    def remove(self, name: str) -> None:
        self._write([i for i in self.list() if i["name"] != name])

    def _write(self, rows: list) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(rows, indent=2), encoding="utf-8")
