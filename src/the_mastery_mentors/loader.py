from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .schemas import AreaBConfig, BotProfile


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_area_b(path: str | Path) -> AreaBConfig:
    payload = _read_json(Path(path))
    return AreaBConfig(**payload)


def load_bot_profiles(path: str | Path) -> list[BotProfile]:
    root = Path(path)
    if root.is_file():
        payload = _read_json(root)
        if isinstance(payload, list):
            return [BotProfile(**item) for item in payload]
        return [BotProfile(**payload)]

    profiles: list[BotProfile] = []
    for file_path in sorted(root.glob("*.json")):
        payload = _read_json(file_path)
        profiles.append(BotProfile(**payload))
    return profiles


def load_tactical_priors(path: str | Path) -> dict[str, Any]:
    return _read_json(Path(path))

