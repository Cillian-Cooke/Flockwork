"""Entity model and the shared move-token vocabulary.

A *round* is 10 ticks. On each tick every living entity performs one action,
encoded as a single token. The same token vocabulary is used by the player's
queued input and by every non-player entity's fixed loop script.

Tokens
------
    w/a/s/d  -> move    up/left/down/right
    t/f/g/h  -> attack  up/left/down/right
    .        -> wait (hold position)
    e        -> ability 1 (entity-specific)
    r        -> ability 2 (entity-specific)

Entity kinds and special abilities
-----------------------------------
    HERO   uppercase letters, driven by the shared player input
    ENEMY  unique lowercase letters (each its own loop)
    SHEEP  the letter 's' (all share one loop); killing them all wins

Entity types with abilities:
    K/k (Knight) - e: BLOCK (invincible for 1 action), r: LUNGE (move+attack)
    R/r (Rogue)  - e: DASH (move twice), r: AMBUSH (attack without moving)
    M/m (Mage)   - e: BARRIER (immunity for 1 turn), r: CHAIN (attack spreads)
"""

from __future__ import annotations

from dataclasses import dataclass, field

# --- Action tokens ----------------------------------------------------------

MOVE_TOKENS = {
    "w": (-1, 0),  # up    (row - 1)
    "a": (0, -1),  # left  (col - 1)
    "s": (1, 0),   # down  (row + 1)
    "d": (0, 1),   # right (col + 1)
}

ATTACK_TOKENS = {
    "t": (-1, 0),  # attack up
    "f": (0, -1),  # attack left
    "g": (1, 0),   # attack down
    "h": (0, 1),   # attack right
}

ABILITY_TOKENS = {
    "e": "ability_1",
    "r": "ability_2",
}

WAIT_TOKEN = "."

ALL_TOKENS = set(MOVE_TOKENS) | set(ATTACK_TOKENS) | set(ABILITY_TOKENS) | {WAIT_TOKEN}

ROUND_LENGTH = 10

# Reverse lookup for converting (dr, dc) back to token
_MOVE_REVERSE = {v: k for k, v in MOVE_TOKENS.items()}


def classify(token: str):
    """Return ('move'|'attack'|'ability1'|'ability2'|'wait', (dr, dc)).

    For a wait the delta is (0, 0).
    Abilities return empty delta (0, 0).
    """
    if token in MOVE_TOKENS:
        return "move", MOVE_TOKENS[token]
    if token in ATTACK_TOKENS:
        return "attack", ATTACK_TOKENS[token]
    if token == "e":
        return "ability_1", (0, 0)
    if token == "r":
        return "ability_2", (0, 0)
    if token == WAIT_TOKEN:
        return "wait", (0, 0)
    raise ValueError(f"unknown action token: {token!r}")


# --- Entity kinds -----------------------------------------------------------

SHEEP_LETTER = "s"

HERO = "hero"
ENEMY = "enemy"
SHEEP = "sheep"

# Entity types with special abilities
ENTITY_TYPES = {
    # Knight: BLOCK (invincible 1 action), LUNGE (move + attack)
    "K": {"type": "knight", "ability_1": "block", "ability_2": "lunge"},
    "k": {"type": "knight", "ability_1": "block", "ability_2": "lunge"},
    # Rogue: DASH (move twice), AMBUSH (attack alone)
    "R": {"type": "rogue", "ability_1": "dash", "ability_2": "ambush"},
    "r": {"type": "rogue", "ability_1": "dash", "ability_2": "ambush"},
    # Mage: BARRIER (immunity 1 turn), CHAIN (attack spreads)
    "M": {"type": "mage", "ability_1": "barrier", "ability_2": "chain"},
    "m": {"type": "mage", "ability_1": "barrier", "ability_2": "chain"},
}


def kind_of(letter: str) -> str:
    """Classify a grid entity letter into its kind."""
    if letter == SHEEP_LETTER:
        return SHEEP
    if letter.isupper():
        return HERO
    if letter.islower():
        return ENEMY
    raise ValueError(f"not an entity letter: {letter!r}")


def entity_type_of(letter: str) -> str | None:
    """Return entity type (knight, rogue, mage) or None."""
    return ENTITY_TYPES.get(letter, {}).get("type")
@dataclass(eq=False)
class Entity:
    """A single creature on the board.

    Heroes share the player's input each tick, so they carry no loop. Sheep and
    enemies carry the loop they repeat every round. ``skip_next`` is set
    by the 'skip' terrain to consume the entity's following action as a wait.
    ``last_move`` tracks the previous movement for repeat-move terrain.
    ``repeat_next`` forces a repeat of the last move on the next tick.
    
    Entities with special abilities (K, R, M letters) have:
    - entity_type: "knight", "rogue", or "mage"
    - blocked: protection flag for knight BLOCK ability
    - barrier: protection flag for mage BARRIER ability
    """

    letter: str
    kind: str
    row: int
    col: int
    loop: list[str] = field(default_factory=list)
    alive: bool = True
    skip_next: bool = False
    repeat_next: bool = False  # Force repeat of last move
    last_move: tuple[int, int] = field(default=(0, 0))  # (dr, dc) of previous move
    entity_type: str = field(default="")  # "knight", "rogue", or "mage"
    blocked: bool = False  # Knight BLOCK protection
    barrier: bool = False  # Mage BARRIER protection

    @property
    def pos(self) -> tuple[int, int]:
        return (self.row, self.col)

    def action_for(self, tick: int, player_token: str) -> str:
        """The token this entity intends to perform on ``tick``.

        Heroes use ``player_token``; others read their loop. A pending ``skip``
        overrides everything with a wait (and clears itself). A pending ``repeat``
        converts the last move back to a token and clears itself.
        
        Loops can be any length and cycle within each round.
        """
        if self.skip_next:
            self.skip_next = False
            return WAIT_TOKEN
        if self.repeat_next:
            self.repeat_next = False
            # Convert last_move back to a token
            return _MOVE_REVERSE.get(self.last_move, WAIT_TOKEN)
        if self.kind == HERO:
            return player_token
        if not self.loop:
            return WAIT_TOKEN
        # Cycle through loop based on its length
        return self.loop[tick % len(self.loop)]
    