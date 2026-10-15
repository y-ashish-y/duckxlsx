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
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps([i for i in self.list() if i["name"] != imp["name"]] + [imp], indent=2),
            encoding="utf-8",
        )

    def remove(self, name: str) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps([i for i in self.list() if i["name"] != name], indent=2),
            encoding="utf-8",
        )
