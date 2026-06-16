"""Load and validate a level from its JSON file.

The on-disk format is a single combined grid: each cell is a string holding the
terrain number with the entity letter appended only when something stands there.

    "1"   -> terrain 1 (grass), empty
    "1a"  -> enemy 'a' on grass
    "1A"  -> hero 'A' on grass
    "1s"  -> sheep on grass
    "0"   -> void, empty

On load we split that into a numeric terrain matrix plus a list of Entity
objects, validate the level, and hand back a ready-to-play GameMap.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

from .entities import ROUND_LENGTH, ALL_TOKENS, Entity, kind_of, HERO, ENEMY, SHEEP, entity_type_of

CELL_RE = re.compile(r"^(\d{1,3})([A-Za-z])?$")


class MapError(ValueError):
    """Raised when a level file is malformed or fails validation."""


@dataclass
class GameMap:
    name: str
    vision: int
    terrain: list[list[int]]   # numeric terrain layer
    entities: list[Entity]     # living creatures, row-major creation order
    rows: int
    cols: int

    def sheep_alive(self) -> int:
        return sum(1 for e in self.entities if e.alive and e.kind == SHEEP)

    def heroes_alive(self) -> int:
        return sum(1 for e in self.entities if e.alive and e.kind == HERO)


def _parse_cell(cell: str, r: int, c: int) -> tuple[int, str | None]:
    if not isinstance(cell, str):
        raise MapError(f"cell [{r}][{c}] must be a string, got {cell!r}")
    m = CELL_RE.match(cell.strip())
    if not m:
        raise MapError(f"cell [{r}][{c}] = {cell!r} is not '<terrain><entity?>'")
    terrain = int(m.group(1))
    if terrain > 100:
        raise MapError(f"cell [{r}][{c}] terrain {terrain} out of range 0-100")
    return terrain, m.group(2)


def load_map(path: str) -> GameMap:
    """Parse, validate, and return the level at ``path``."""
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    grid = data.get("grid")
    if not grid or not isinstance(grid, list):
        raise MapError("missing or invalid 'grid'")
    cols = len(grid[0])
    if cols == 0:
        raise MapError("grid rows must be non-empty")
    if any(len(row) != cols for row in grid):
        raise MapError("grid is not rectangular")

    scripts = data.get("scripts", {})
    terrain: list[list[int]] = []
    entities: list[Entity] = []
    seen_enemy_letters: set[str] = set()

    for r, row in enumerate(grid):
        terrain_row: list[int] = []
        for c, cell in enumerate(row):
            tid, letter = _parse_cell(cell, r, c)
            terrain_row.append(tid)
            if letter is None:
                continue
            kind = kind_of(letter)
            loop: list[str] = []
            if kind in (ENEMY, SHEEP):
                if letter not in scripts:
                    raise MapError(f"entity {letter!r} at [{r}][{c}] has no script")
                loop = _validate_script(letter, scripts[letter])
            if kind == ENEMY:
                if letter in seen_enemy_letters:
                    raise MapError(
                        f"enemy letter {letter!r} reused; each enemy must be unique"
                    )
                seen_enemy_letters.add(letter)
            ent = Entity(letter=letter, kind=kind, row=r, col=c, loop=loop)
            ent.entity_type = entity_type_of(letter) or ""
            entities.append(ent)
        terrain.append(terrain_row)

    if not any(e.kind == SHEEP for e in entities):
        raise MapError("level needs at least one sheep ('s')")
    if not any(e.kind == HERO for e in entities):
        raise MapError("level needs at least one hero (uppercase letter)")

    return GameMap(
        name=data.get("name", path),
        vision=int(data.get("vision", 0)),
        terrain=terrain,
        entities=entities,
        rows=len(grid),
        cols=cols,
    )


def _validate_script(letter: str, script) -> list[str]:
    if not isinstance(script, list) or not script:
        raise MapError(f"script for {letter!r} must be a non-empty list of tokens")
    for tok in script:
        if tok not in ALL_TOKENS:
            raise MapError(f"script for {letter!r} has bad token {tok!r}")
    return list(script)
