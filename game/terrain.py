"""Terrain registry and the v1 core-set effects.

Terrain is a numeric layer: 0 is void (no tile), 1-100 are type IDs. Each ID
maps to an *effect* that fires when an entity ends a step on it (or, for walls
and void, that forbids entering at all).

v1 wires up the core five effects; the rest of the 1-100 space defaults to plain
grass. Deferred effects (see-more, see-less, duplicate, push, repeat-move) are
left as named hooks so maps can reference them later without engine changes.
"""

from __future__ import annotations

# Effect names ---------------------------------------------------------------
NONE = "none"          # plain, walkable, no side effect
WALL = "wall"          # cannot be entered
DIE = "die"            # entity that ends here dies (lava)
SLIP = "slip"          # forced one more step in the same direction
SKIP = "skip"          # entity's next action is consumed as a wait
TELEPORT = "teleport"  # relocate to the lowest-index other portal
DUPLICATE = "duplicate"  # entity duplicates on this tile
PUSH = "push"          # entity is pushed back one tile in opposite direction
REPEAT_MOVE = "repeat-move"  # entity repeats its previous move
SEE_MORE = "see-more"  # deferred: expand vision
SEE_LESS = "see-less"  # deferred: reduce vision

# Deferred (recognised, not yet implemented in the engine)
DEFERRED = {"see-more", "see-less"}

VOID = 0

# Default ID -> effect registry. A map file may override per level later
DEFAULT_REGISTRY: dict[int, str] = {
    0: WALL,        # void: impassable
    1: NONE,        # grass
    2: WALL,        # wall
    3: DIE,         # lava
    4: SLIP,        # slip
    5: SKIP,        # skip
    6: TELEPORT,    # portal
    7: DUPLICATE,   # duplicate
    8: PUSH,        # push
    9: REPEAT_MOVE, # repeat move
}


def effect_of(terrain_id: int, registry: dict[int, str] | None = None) -> str:
    """Effect for a terrain ID; unregistered IDs (7-100) are plain grass."""
    reg = registry or DEFAULT_REGISTRY
    return reg.get(terrain_id, NONE)


def is_passable(terrain_id: int, registry: dict[int, str] | None = None) -> bool:
    """Whether an entity may enter a tile of this terrain ID."""
    return effect_of(terrain_id, registry) != WALL
