"""Round flow, scoring, and win/lose for an interactive terminal session.

A game is a sequence of rounds. Each round the player queues 10 moves; the
engine then plays them tick-by-tick alongside every entity's fixed loop. If the
sheep aren't all dead by the end of a round, the entities reset their loops and
the player picks another 10.

Score is ``<full_sets>.<extra_actions>``: the number of fully-spent 10-move sets
plus how many actions into the final set the last sheep died.
"""

from __future__ import annotations

import time

from . import render
from .engine import Engine
from .entities import ROUND_LENGTH
from .inputs import parse_moves, InputError
from .mapfile import GameMap, load_map


class Game:
    def __init__(self, gmap: GameMap):
        self.gmap = gmap
        self.engine = Engine(gmap)
        self.completed_sets = 0  # fully-spent 10-move sets

    def score_str(self, extra_actions: int) -> str:
        return f"{self.completed_sets}.{extra_actions}"

    def status(self) -> str:
        if self.gmap.sheep_alive() == 0:
            return "win"
        if self.gmap.heroes_alive() == 0:
            return "lose"
        return "playing"


def _prompt_moves(read, write) -> list[str]:
    while True:
        write("\nEnter moves (1-10+ chars, will cycle each round; e.g. w d . or wwdd..fass): ")
        line = read()
        if line is None:
            raise EOFError
        try:
            return parse_moves(line)
        except InputError as exc:
            write(f"  ! {exc}\n")


def play(gmap: GameMap, read=input, write=print, pause=lambda: time.sleep(0.2)):
    """Run an interactive session. ``read``/``write``/``pause`` are injectable
    for testing; defaults wire to stdin/stdout."""
    game = Game(gmap)
    write(render.render_loops(gmap))

    while True:
        status = game.status()
        if status != "playing":
            break

        write("\n" + render.render(gmap, game.engine, game.completed_sets + 1,
                                    game.score_str(0)))
        move_sequence = _prompt_moves(read, write)

        # fresh round: reset the tick counter and every entity's loop position
        game.engine.tick = 0
        won_at = None
        for tick in range(ROUND_LENGTH):
            # Cycle through move sequence
            token = move_sequence[tick % len(move_sequence)]
            game.engine.step(token)
            write("\n" + render.render(gmap, game.engine, game.completed_sets + 1,
                                       game.score_str(tick + 1)))
            if game.gmap.sheep_alive() == 0:
                won_at = tick + 1
                break
            if game.gmap.heroes_alive() == 0:
                break
            pause()

        if won_at is not None:
            write(f"\n*** ALL SHEEP CLEARED — completed in "
                  f"{game.score_str(won_at)} ***\n")
            return game.score_str(won_at)
        if game.gmap.heroes_alive() == 0:
            write("\n*** ALL HEROES DEAD — you lose ***\n")
            return "lose"

        # round survived without a win: bank a full set and continue
        game.completed_sets += 1

    final = game.status()
    write(f"\n*** GAME OVER: {final} ***\n")
    return final


def play_file(path: str):
    return play(load_map(path))
