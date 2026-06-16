"""Per-tick simultaneous resolution — the deterministic heart of the game.

One round is 10 ticks. Each call to :meth:`Engine.step` advances a single tick:
every living entity performs its action (heroes share the player's token, others
read their loop), and the board is resolved deterministically so the same inputs
always produce the same outcome.

Resolution order within a tick (see plan):
  1. Classify each entity's action into move / attack / wait.
  2. Movement, simultaneous, with lowest-index-wins on contested cells and no
     walking through one another (head-on swaps blocked).
  3. On-enter terrain for entities that actually moved: lava kills, slip slides,
     portal teleports to the lowest-index other portal, skip eats the next action.
  4. Attacks resolve against POST-move positions: an attacked square kills whoever
     ends the tick on it.
  5. Mark the dead.
"""

from __future__ import annotations

from . import terrain
from .entities import ROUND_LENGTH, classify
from .mapfile import GameMap


class Engine:
    def __init__(self, gmap: GameMap):
        self.gmap = gmap
        self.tick = 0
        # creation order == row-major scan order == grid-index priority.
        self._index = {e: i for i, e in enumerate(gmap.entities)}
        self._portals = self._find_portals()

    # --- public API ---------------------------------------------------------

    def step(self, player_token: str) -> None:
        """Advance exactly one tick using ``player_token`` for all heroes."""
        living = [e for e in self.gmap.entities if e.alive]
        actions = {e: e.action_for(self.tick, player_token) for e in living}
        classified = {e: classify(tok) for e, tok in actions.items()}

        # Resolve abilities first (they can affect movement/attacks)
        self._resolve_abilities(living, classified, actions)
        
        moved = self._resolve_movement(living, classified)
        self._apply_arrivals(moved)
        self._resolve_attacks(living, classified)
        
        # Clear temporary ability effects
        for e in living:
            if e.blocked:
                e.blocked = False
            if e.barrier:
                e.barrier = False

        self.tick += 1

    # --- abilities -----------------------------------------------------------

    def _resolve_abilities(self, living, classified, actions):
        """Resolve special abilities before movement/attack."""
        for e in living:
            action_type, _ = classified[e]
            
            if action_type == "ability_1":
                self._execute_ability_1(e)
            elif action_type == "ability_2":
                self._execute_ability_2(e)

    def _execute_ability_1(self, e):
        """Execute first ability based on entity type."""
        if e.entity_type == "knight":
            # BLOCK: become invincible for this action
            e.blocked = True
        elif e.entity_type == "rogue":
            # DASH: placeholder (will be handled in movement as double move)
            e.repeat_next = True  # Will move again next tick
        elif e.entity_type == "mage":
            # BARRIER: become invincible for this action
            e.barrier = True

    def _execute_ability_2(self, e):
        """Execute second ability based on entity type."""
        if e.entity_type == "knight":
            # LUNGE: move and attack in same direction (handled in movement phase)
            e.skip_next = False  # Will handle specially
        elif e.entity_type == "rogue":
            # AMBUSH: attack without moving
            e.skip_next = False  # Special handling in attacks
        elif e.entity_type == "mage":
            # CHAIN: attack spreads to adjacent enemies (handled in attacks)
            e.skip_next = False

    # --- movement -----------------------------------------------------------

    def _resolve_movement(self, living, classified):
        """Resolve simultaneous movement; return {entity: (dr, dc)} actually moved."""
        terrain_grid = self.gmap.terrain
        origin = {e: e.pos for e in living}
        target: dict = {}
        move_dir: dict = {}

        for e in living:
            kind, (dr, dc) = classified[e]
            if kind == "move":
                nr, nc = e.row + dr, e.col + dc
                if self._in_bounds(nr, nc) and terrain.is_passable(terrain_grid[nr][nc]):
                    target[e] = (nr, nc)
                    move_dir[e] = (dr, dc)
                    continue
            target[e] = origin[e]  # attack / wait / blocked-by-wall stay put

        rejected: set = set()
        changed = True
        while changed:
            changed = False
            final = {e: (origin[e] if e in rejected else target[e]) for e in living}
            occ: dict = {}
            for e in living:
                occ.setdefault(final[e], []).append(e)

            for e in living:
                if e in rejected or e not in move_dir:
                    continue
                tgt = target[e]
                contenders = occ[tgt]
                if len(contenders) > 1:
                    winner = self._cell_winner(contenders, origin, move_dir, rejected)
                    if e is not winner:
                        rejected.add(e)
                        changed = True
                        continue
                # head-on swap: someone sitting on my target is moving into my origin
                for other in living:
                    if other is e or other in rejected:
                        continue
                    if (origin[other] == tgt and other in move_dir
                            and target[other] == origin[e]):
                        rejected.add(e)
                        changed = True
                        break

        moved = {}
        for e in living:
            if e in move_dir and e not in rejected:
                e.row, e.col = target[e]
                moved[e] = move_dir[e]
                e.last_move = move_dir[e]  # Track for repeat-move terrain
        return moved

    def _cell_winner(self, contenders, origin, move_dir, rejected):
        """Pick who keeps a contested cell: a settled occupant beats movers,
        otherwise the lowest grid index wins.

        All contenders share the same final cell. An entity that is not moving
        (or already rejected) is settled on that cell and cannot be displaced.
        """
        for e in contenders:
            if e not in move_dir or e in rejected:
                return e
        return min(contenders, key=lambda e: self._index[e])

    # --- terrain on-enter ---------------------------------------------------

    def _apply_arrivals(self, moved):
        """Apply enter-effects for entities that moved, in grid-index order."""
        for e in sorted(moved, key=lambda x: self._index[x]):
            if not e.alive:
                continue
            self._arrive(e, moved[e])

    def _arrive(self, e, direction):
        """Resolve the tile an entity just stepped onto, applying terrain effects.
        Effects can chain (e.g., slip can land on lava or another effect)."""
        while True:
            eff = terrain.effect_of(self.gmap.terrain[e.row][e.col])
            if eff == terrain.DIE:
                e.alive = False
                return
            if eff == terrain.SKIP:
                e.skip_next = True
                return
            if eff == terrain.TELEPORT:
                self._teleport(e)
                return
            if eff == terrain.SLIP:
                dr, dc = direction
                nr, nc = e.row + dr, e.col + dc
                if (self._in_bounds(nr, nc)
                        and terrain.is_passable(self.gmap.terrain[nr][nc])
                        and not self._occupant(nr, nc, exclude=e)):
                    e.row, e.col = nr, nc
                    continue  # re-evaluate the new tile (may chain / be lava)
                return  # blocked: rest on the slip tile
            if eff == terrain.DUPLICATE:
                self._duplicate(e)
                return
            if eff == terrain.PUSH:
                self._push(e, direction)
                return
            if eff == terrain.REPEAT_MOVE:
                e.repeat_next = True  # Will repeat last move on next tick
                return
            return  # plain terrain

    def _teleport(self, e):
        """Send to the lowest-index portal that isn't the current tile."""
        for (r, c) in self._portals:
            if (r, c) != (e.row, e.col) and not self._occupant(r, c, exclude=e):
                e.row, e.col = r, c
                return  # no chain: arriving on a portal does not re-teleport

    def _duplicate(self, e):
        """Create a copy of the entity on an adjacent free tile."""
        from .entities import Entity
        # Try to find an adjacent empty tile
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = e.row + dr, e.col + dc
            if (self._in_bounds(nr, nc) and 
                terrain.is_passable(self.gmap.terrain[nr][nc]) and
                not self._occupant(nr, nc)):
                # Create a duplicate with the same properties
                dup = Entity(
                    letter=e.letter,
                    kind=e.kind,
                    row=nr,
                    col=nc,
                    loop=e.loop[:],  # copy the loop
                    alive=True,
                    last_move=e.last_move
                )
                self.gmap.entities.append(dup)
                self._index[dup] = len(self.gmap.entities) - 1
                return

    def _push(self, e, direction):
        """Push entity back one tile in opposite direction."""
        dr, dc = direction
        # Opposite direction
        nr, nc = e.row - dr, e.col - dc
        if (self._in_bounds(nr, nc) and 
            terrain.is_passable(self.gmap.terrain[nr][nc]) and
            not self._occupant(nr, nc, exclude=e)):
            e.row, e.col = nr, nc

    # --- attacks ------------------------------------------------------------

    def _resolve_attacks(self, living, classified):
        marked: set = set()
        for e in living:
            if not e.alive:
                continue
            kind, (dr, dc) = classified[e]
            if kind == "attack":
                tr, tc = e.row + dr, e.col + dc  # attackers never moved this tick
                if self._in_bounds(tr, tc):
                    marked.add((tr, tc))
        if not marked:
            return
        for e in self.gmap.entities:
            if e.alive and e.pos in marked:
                # BLOCK and BARRIER abilities prevent death from attacks
                if e.blocked or e.barrier:
                    continue
                e.alive = False

    # --- helpers ------------------------------------------------------------

    def _in_bounds(self, r, c) -> bool:
        return 0 <= r < self.gmap.rows and 0 <= c < self.gmap.cols

    def _occupant(self, r, c, exclude=None):
        for e in self.gmap.entities:
            if e.alive and e is not exclude and e.row == r and e.col == c:
                return e
        return None

    def _find_portals(self):
        portals = []
        for r in range(self.gmap.rows):
            for c in range(self.gmap.cols):
                if terrain.effect_of(self.gmap.terrain[r][c]) == terrain.TELEPORT:
                    portals.append((r, c))
        return portals  # already row-major == lowest-index first

    @property
    def round_over(self) -> bool:
        return self.tick >= ROUND_LENGTH
