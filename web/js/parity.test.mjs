// Parity check: replicate tests/test_engine.py scenarios against the JS engine.
import { Engine } from "./engine.js";
import { Entity, HERO, ENEMY, SHEEP } from "./entity.js";
import { GameMap, buildGameMap } from "./mapdata.js";
import { simulateTo } from "./game.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  XX  ${name}`); }
}

const grass = (r, c) => Array.from({ length: r }, () => Array(c).fill(1));
const E = (letter, kind, row, col, loop = []) =>
  new Entity({ letter, kind, row, col, loop });
const mk = (terrain, ents) =>
  new GameMap({ name: "t", vision: 0, terrain, entities: ents,
    rows: terrain.length, cols: terrain[0].length });
const pos = (e) => `${e.row},${e.col}`;

// lowest index wins contested cell
(() => {
  const a = E("A", HERO, 0, 1);
  const s = E("s", SHEEP, 2, 1, ["w", ...Array(9).fill(".")]);
  const eng = new Engine(mk(grass(3, 3), [a, s]));
  eng.step("s");
  check("lowest_index_wins", pos(a) === "1,1" && pos(s) === "2,1");
})();

// swap blocked
(() => {
  const a = E("A", HERO, 0, 0);
  const b = E("b", ENEMY, 1, 0, ["w", ...Array(9).fill(".")]);
  const eng = new Engine(mk(grass(2, 1), [a, b]));
  eng.step("s");
  check("swap_blocked", pos(a) === "0,0" && pos(b) === "1,0");
})();

// post-move attack kills stepper
(() => {
  const a = E("A", HERO, 0, 0);
  const b = E("b", ENEMY, 2, 0, ["w", ...Array(9).fill(".")]);
  const eng = new Engine(mk(grass(3, 1), [a, b]));
  eng.step("g");
  check("attack_kills_stepper", b.alive === false);
})();

// attack misses leaver
(() => {
  const a = E("A", HERO, 0, 0);
  const b = E("b", ENEMY, 1, 0, ["s", ...Array(9).fill(".")]);
  const eng = new Engine(mk(grass(3, 1), [a, b]));
  eng.step("g");
  check("attack_misses_leaver", b.alive === true && pos(b) === "2,0");
})();

// wall blocks
(() => {
  const a = E("A", HERO, 0, 0);
  const s = E("s", SHEEP, 2, 0, Array(10).fill("."));
  const eng = new Engine(mk([[1], [2], [1]], [a, s]));
  eng.step("s");
  check("wall_blocks", pos(a) === "0,0");
})();

// lava kills
(() => {
  const a = E("A", HERO, 0, 0);
  const s = E("s", SHEEP, 1, 1, Array(10).fill("."));
  const eng = new Engine(mk([[1, 1], [3, 1]], [a, s]));
  eng.step("s");
  check("lava_kills", a.alive === false);
})();

// slip slides
(() => {
  const t = [[1, 4, 1, 1]];
  const a = E("A", HERO, 0, 0);
  const s = E("s", SHEEP, 0, 3, Array(10).fill("."));
  const eng = new Engine(mk(t, [a, s]));
  eng.step("d");
  check("slip_slides", pos(a) === "0,2");
})();

// skip consumes next
(() => {
  const t = [[1, 5, 1], [1, 1, 1]];
  const a = E("A", HERO, 0, 0);
  const s = E("s", SHEEP, 1, 2, Array(10).fill("."));
  const eng = new Engine(mk(t, [a, s]));
  eng.step("d"); const p1 = pos(a);
  eng.step("d"); const p2 = pos(a);
  eng.step("d"); const p3 = pos(a);
  check("skip_consumes", p1 === "0,1" && p2 === "0,1" && p3 === "0,2");
})();

// portal teleports to lowest index
(() => {
  const t = [[6, 1, 1], [1, 1, 6]];
  const a = E("A", HERO, 1, 1);
  const s = E("s", SHEEP, 0, 1, Array(10).fill("."));
  const eng = new Engine(mk(t, [a, s]));
  eng.step("d");
  check("portal_lowest_index", pos(a) === "0,0");
})();

// level1 known solution clears at tick 6 (score 0.6)
(() => {
  const solution = ["d", "d", "d", "d", "s", "g", ".", ".", ".", "."];
  const gm = buildGameMap();
  const eng = new Engine(gm);
  let wonAt = null;
  solution.forEach((tok, i) => {
    if (wonAt !== null) return;
    eng.step(tok);
    if (gm.sheepAlive() === 0) wonAt = i + 1;
  });
  check("level1_solution_wins_at_6", wonAt === 6);

  // and the same via simulateTo (used by the UI scrubber)
  const snap = simulateTo([], solution, 6);
  check("simulateTo_matches_win", snap.status === "win" && snap.score === "0.6");
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
