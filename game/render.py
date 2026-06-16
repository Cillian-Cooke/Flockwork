"""Terminal renderer — the matrix view (the only view in the prototype).

Each cell shows the entity letter if one stands there, otherwise the terrain
digit (void renders as a faint dot). A coding-stats panel sits to the top-left,
per the design: array indices, tick/round counters, score-so-far, and counts.
"""

from __future__ import annotations

from . import terrain
from .entities import MOVE_TOKENS, ATTACK_TOKENS, SHEEP, HERO, ENEMY
from .engine import Engine
from .mapfile import GameMap

VOID_GLYPH = "·"


def _entity_at(gmap: GameMap, r: int, c: int):
    for e in gmap.entities:
        if e.alive and e.row == r and e.col == c:
            return e
    return None


def render(gmap: GameMap, engine: Engine, round_no: int, score: str,
           note: str = "") -> str:
    """Return the full frame: stats panel above, then the matrix grid."""
    lines = []
    lines.append("┌─ CODING STATS ───────────────────────────")
    lines.append(f"│ map      : {gmap.name}")
    lines.append(f"│ grid     : {gmap.rows}x{gmap.cols}  (array[row][col])")
    lines.append(f"│ tick     : {min(engine.tick, 10)}/10   round: {round_no}")
    lines.append(f"│ score    : {score}")
    lines.append(f"│ sheep[s] : {gmap.sheep_alive()}    heroes: {gmap.heroes_alive()}")
    if note:
        lines.append(f"│ note     : {note}")
    lines.append("└──────────────────────────────────────────")

    # column header (col indices)
    header = "     " + " ".join(f"{c:>2}" for c in range(gmap.cols))
    lines.append(header)
    for r in range(gmap.rows):
        cells = []
        for c in range(gmap.cols):
            tid = gmap.terrain[r][c]
            terrain_glyph = VOID_GLYPH if tid == terrain.VOID else str(tid)
            ent = _entity_at(gmap, r, c)
            if ent is not None:
                # Show ability status with special symbols
                entity_glyph = ent.letter
                if ent.blocked:
                    entity_glyph = ent.letter.lower() + "█"  # Block indicator
                elif ent.barrier:
                    entity_glyph = ent.letter.lower() + "◆"  # Barrier indicator
                cells.append(f"{terrain_glyph}{entity_glyph}")
            else:
                cells.append(f"{terrain_glyph} ")
        lines.append(f"{r:>3}  " + " ".join(cells))
    return "\n".join(lines)


def render_loops(gmap: GameMap) -> str:
    """Show every non-player entity's fixed loop so the player can plan."""
    lines = ["── ENEMY & SHEEP LOOPS (they repeat every round) ──"]
    seen = set()
    for e in gmap.entities:
        if e.kind in (ENEMY, SHEEP) and e.letter not in seen:
            seen.add(e.letter)
            kind = "sheep" if e.kind == SHEEP else "enemy"
            lines.append(f"  {e.letter} ({kind}): {' '.join(e.loop)}")
    lines.append("")
    lines.append("Move:  w=up a=left s=down d=right   "
                 "Attack: t=up f=left g=down h=right   .=wait")
    return "\n".join(lines)
