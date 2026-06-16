"""Deterministic engine tests — the rules that must never drift.

Each test builds a tiny GameMap by hand (so we control indices and terrain) and
asserts a single rule of the per-tick resolution.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.engine import Engine
from game.entities import Entity, HERO, ENEMY, SHEEP
from game.mapfile import GameMap, load_map


def make_map(terrain, entities):
    rows = len(terrain)
    cols = len(terrain[0])
    return GameMap(name="t", vision=0, terrain=terrain, entities=entities,
                   rows=rows, cols=cols)


def grass(rows, cols):
    return [[1] * cols for _ in range(rows)]


def test_lowest_index_wins_contested_cell():
    # Two heroes both step into the same empty middle cell; lower index wins.
    a = Entity("A", HERO, 0, 1)   # index 0, moving down into (1,1)
    s = Entity("s", SHEEP, 2, 1, loop=["w"] + ["."] * 9)  # moving up into (1,1)
    gm = make_map(grass(3, 3), [a, s])
    eng = Engine(gm)
    eng.step("s")  # heroes move down
    assert a.pos == (1, 1)        # lower index claimed the cell
    assert s.pos == (2, 1)        # sheep blocked, stayed put


def test_no_walk_through_swap_blocked():
    # Hero and enemy facing each other try to swap; both should be blocked.
    a = Entity("A", HERO, 0, 0)            # wants to move down to (1,0)
    b = Entity("b", ENEMY, 1, 0, loop=["w"] + ["."] * 9)  # wants up to (0,0)
    gm = make_map(grass(2, 1), [a, b])
    eng = Engine(gm)
    eng.step("s")
    assert a.pos == (0, 0)
    assert b.pos == (1, 0)


def test_post_move_attack_kills_target_that_stepped_in():
    # Hero attacks down into (1,0); enemy steps into (1,0) this tick and dies.
    a = Entity("A", HERO, 0, 0)
    b = Entity("b", ENEMY, 2, 0, loop=["w"] + ["."] * 9)  # moves up into (1,0)
    gm = make_map(grass(3, 1), [a, b])
    eng = Engine(gm)
    eng.step("g")  # hero attacks down -> marks (1,0); enemy ends there
    assert b.alive is False


def test_post_move_attack_misses_target_that_left():
    # Target sits adjacent but moves away on the same tick -> attack misses.
    a = Entity("A", HERO, 0, 0)
    b = Entity("b", ENEMY, 1, 0, loop=["s"] + ["."] * 9)  # moves down, away
    gm = make_map(grass(3, 1), [a, b])
    eng = Engine(gm)
    eng.step("g")  # attack down marks (1,0) but enemy ended at (2,0)
    assert b.alive is True
    assert b.pos == (2, 0)


def test_wall_blocks_movement():
    terrain = [[1], [2], [1]]  # wall at (1,0)
    a = Entity("A", HERO, 0, 0)
    s = Entity("s", SHEEP, 2, 0, loop=["."] * 10)
    gm = make_map(terrain, [a, s])
    eng = Engine(gm)
    eng.step("s")  # try to move down into the wall
    assert a.pos == (0, 0)


def test_lava_kills_on_enter():
    terrain = [[1], [3]]  # lava at (1,0)
    a = Entity("A", HERO, 0, 0)
    s = Entity("s", SHEEP, 0, 0, loop=["."] * 10)  # placeholder sheep elsewhere
    s.row, s.col = 1, 1  # not used; keep map valid-ish
    gm = make_map([[1, 1], [3, 1]], [a, s])
    eng = Engine(gm)
    eng.step("s")  # hero walks onto lava
    assert a.alive is False


def test_slip_slides_extra_step():
    # Stepping onto slip (id 4) forces one more step in the same direction.
    terrain = [[1, 1, 1, 1]]  # row of grass...
    terrain[0][1] = 4         # ...with slip at (0,1)
    a = Entity("A", HERO, 0, 0)
    s = Entity("s", SHEEP, 0, 3, loop=["."] * 10)
    gm = make_map(terrain, [a, s])
    eng = Engine(gm)
    eng.step("d")  # move right onto slip -> slides to (0,2)
    assert a.pos == (0, 2)


def test_skip_consumes_next_action():
    terrain = [[1, 5, 1], [1, 1, 1]]  # skip tile at (0,1)
    a = Entity("A", HERO, 0, 0)
    s = Entity("s", SHEEP, 1, 2, loop=["."] * 10)  # parked out of the way
    gm = make_map(terrain, [a, s])
    eng = Engine(gm)
    eng.step("d")   # onto skip -> next action will be eaten
    assert a.pos == (0, 1)
    eng.step("d")   # this action is consumed as a wait
    assert a.pos == (0, 1)
    eng.step("d")   # now free to move again
    assert a.pos == (0, 2)


def test_portal_teleports_to_lowest_index():
    # Two portals (id 6); stepping onto the higher-index one sends you to the
    # lowest-index portal tile.
    terrain = [[6, 1, 1], [1, 1, 6]]  # portals at (0,0) and (1,2)
    a = Entity("A", HERO, 1, 1)       # will step right onto (1,2) portal
    s = Entity("s", SHEEP, 0, 1, loop=["."] * 10)
    gm = make_map(terrain, [a, s])
    eng = Engine(gm)
    eng.step("d")
    assert a.pos == (0, 0)  # lowest-index portal


def test_win_and_lose_counts():
    a = Entity("A", HERO, 0, 0)
    s = Entity("s", SHEEP, 0, 1, loop=["."] * 10)
    gm = make_map(grass(1, 2), [a, s])
    assert gm.sheep_alive() == 1 and gm.heroes_alive() == 1
    s.alive = False
    assert gm.sheep_alive() == 0  # win condition
    a.alive = False
    assert gm.heroes_alive() == 0  # lose condition


def test_level1_loads_and_is_valid():
    here = os.path.dirname(os.path.abspath(__file__))
    gm = load_map(os.path.join(here, "..", "maps", "level1.json"))
    assert gm.sheep_alive() >= 1
    assert gm.heroes_alive() >= 1


def test_level1_known_solution_clears_sheep():
    # The intended solution: walk to the sheep and attack it while it idles.
    here = os.path.dirname(os.path.abspath(__file__))
    gm = load_map(os.path.join(here, "..", "maps", "level1.json"))
    eng = Engine(gm)
    solution = ["d", "d", "d", "d", "s", "g", ".", ".", ".", "."]
    won_at = None
    for i, tok in enumerate(solution, start=1):
        eng.step(tok)
        if gm.sheep_alive() == 0:
            won_at = i
            break
    assert won_at == 6  # completed in 0.6
