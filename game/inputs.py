"""Parse and validate player token input.

Accepts the tokens space-separated or packed together. If fewer than 10 moves
are provided, they cycle through the round. If more than 10 are provided, each
group of 10 cycles.

Examples:
    "wwdd" -> cycles w,w,d,d through 10 ticks
    "wwddssddhh" -> uses all 10
    "ww" -> cycles w,w 5 times
"""

from __future__ import annotations

from .entities import ALL_TOKENS


class InputError(ValueError):
    pass


def parse_moves(line: str) -> list[str]:
    """Return a validated list of at least 1 move token."""
    tokens = [ch for ch in line if not ch.isspace()]
    if not tokens:
        raise InputError("need at least 1 move")
    for tok in tokens:
        if tok not in ALL_TOKENS:
            raise InputError(f"unknown move {tok!r}; use w a s d / t f g h / .")
    return tokens
