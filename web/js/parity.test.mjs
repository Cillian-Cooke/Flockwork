// Engine regression suite for the push / herding model.
// Run with: node web/js/parity.test.mjs
import { Engine } from "./engine.js";
import { Entity, HERO, ENEMY, SHEEP } from "./entity.js";
import { GameMap } from "./mapdata.js";
import { setActiveLevel, simulateTo } from "./game.js";

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  XX  ${name}`); }
}

const grass = (r, c) => Array.from({ length: r }, () => Array(c).fill(1));
const E = (letter, kind, row, col, loop = [], opts = {}) =>
  new Entity({ letter, kind, row, col, loop, ...opts });
const mk = (terrain, ents) =>
  new GameMap({ name: "t", vision: 0, terrain, entities: ents,
    rows: terrain.length, cols: terrain[0].length });
const pos = (e) => `${e.row},${e.col}`;
const wait = Array(10).fill(".");

// --- pushing --------------------------------------------------------------

// hero pushes a sheep into lava: sheep dies, hero takes the freed tile
(() => {
  const h = E("P", HERO, 0, 0);
  const s = E("s", SHEEP, 0, 1, wait);
  const eng = new Engine(mk([[1, 1, 3]], [h, s]));
  eng.step("d");
  check("push_into_lava", !s.alive && pos(h) === "0,1");
})();

// push blocked by a wall behind the sheep: nothing moves
(() => {
  const h = E("P", HERO, 0, 0);
  const s = E("s", SHEEP, 0, 1, wait);
  const eng = new Engine(mk([[1, 1, 2]], [h, s]));
  eng.step("d");
  check("push_blocked_by_wall", pos(h) === "0,0" && s.alive && pos(s) === "0,1");
})();

// cascade: hero -> sheep -> enemy, all shift one tile
(() => {
  const h = E("P", HERO, 0, 0);
  const s = E("s", SHEEP, 0, 1, wait);
  const en = E("a", ENEMY, 0, 2, wait);
  const eng = new Engine(mk([[1, 1, 1, 1]], [h, s, en]));
  eng.step("d");
  check("push_cascade_hero_sheep_enemy",
    pos(h) === "0,1" && pos(s) === "0,2" && pos(en) === "0,3");
})();

// a sheep can push an enemy (sheep out-ranks enemy)
(() => {
  const s = E("s", SHEEP, 0, 0, ["d", ...Array(9).fill(".")]);
  const en = E("a", ENEMY, 0, 1, wait);
  const eng = new Engine(mk([[1, 1, 1]], [s, en]));
  eng.step(".");
  check("sheep_pushes_enemy", pos(s) === "0,1" && pos(en) === "0,2");
})();

// equal-rank never pushes: an enemy can't shove another enemy
(() => {
  const a = E("a", ENEMY, 0, 0, ["d", ...Array(9).fill(".")]);
  const b = E("b", ENEMY, 0, 1, wait);
  const eng = new Engine(mk([[1, 1, 1]], [a, b]));
  eng.step(".");
  check("equal_rank_no_push", pos(a) === "0,0" && pos(b) === "0,1");
})();

// --- contact death --------------------------------------------------------

// hero walks into a lethal enemy and dies
(() => {
  const h = E("P", HERO, 0, 0);
  const en = E("a", ENEMY, 0, 1, wait);
  const eng = new Engine(mk([[1, 1]], [h, en]));
  eng.step("d");
  check("hero_into_lethal_enemy_dies", !h.alive && en.alive);
})();

// a non-lethal enemy is pushed by the hero instead of killing it
(() => {
  const h = E("P", HERO, 0, 0);
  const en = E("a", ENEMY, 0, 1, wait, { lethalToHero: false });
  const eng = new Engine(mk([[1, 1, 1]], [h, en]));
  eng.step("d");
  check("hero_pushes_nonlethal_enemy", h.alive && pos(h) === "0,1" && pos(en) === "0,2");
})();

// hero and a lethal enemy pick the same empty square: hero wins it but dies
(() => {
  const h = E("P", HERO, 0, 0);
  const en = E("a", ENEMY, 0, 2, ["a", ...Array(9).fill(".")]); // moves left into (0,1)
  const eng = new Engine(mk([[1, 1, 1]], [h, en]));
  eng.step("d"); // hero moves right into (0,1)
  check("contested_square_hero_dies", !h.alive);
})();

// sheep shoved into a sheep-lethal enemy dies (the "kill tile")
(() => {
  const h = E("P", HERO, 0, 0);
  const s = E("s", SHEEP, 0, 1, wait);
  const en = E("a", ENEMY, 0, 2, wait, { lethalToSheep: true });
  const eng = new Engine(mk([[1, 1, 1]], [h, s, en]));
  eng.step("d");
  check("sheep_into_kill_tile_enemy", !s.alive && pos(h) === "0,1" && pos(en) === "0,2");
})();

// --- flock ----------------------------------------------------------------

// one shove wipes a flock lined up beside lava (chain reaction)
(() => {
  const h = E("P", HERO, 0, 1);
  const s1 = E("s", SHEEP, 1, 0, wait);
  const s2 = E("s", SHEEP, 1, 1, wait);
  const s3 = E("s", SHEEP, 1, 2, wait);
  const eng = new Engine(mk([[1, 1, 1], [1, 1, 1], [3, 3, 3]], [h, s1, s2, s3]));
  eng.step("s");
  check("flock_chain_reaction", !s1.alive && !s2.alive && !s3.alive);
})();

// --- contention (same rank) -----------------------------------------------

// two enemies aiming at the same empty tile: the lower grid index wins
(() => {
  const a = E("a", ENEMY, 0, 1, ["s", ...Array(9).fill(".")]); // index 0, moves down
  const b = E("b", ENEMY, 2, 1, ["w", ...Array(9).fill(".")]); // index 1, moves up
  const eng = new Engine(mk(grass(3, 3), [a, b]));
  eng.step(".");
  check("lowest_index_wins", pos(a) === "1,1" && pos(b) === "2,1");
})();

// head-on swap between equals is blocked
(() => {
  const a = E("a", ENEMY, 0, 0, ["s", ...Array(9).fill(".")]);
  const b = E("b", ENEMY, 1, 0, ["w", ...Array(9).fill(".")]);
  const eng = new Engine(mk([[1], [1]], [a, b]));
  eng.step(".");
  check("swap_blocked", pos(a) === "0,0" && pos(b) === "1,0");
})();

// --- skittish flee --------------------------------------------------------

// a skittish sheep steps directly away from the hero
(() => {
  const h = E("P", HERO, 0, 0);
  const s = E("s", SHEEP, 0, 2, [], { behavior: "skittish" });
  const eng = new Engine(mk([[1, 1, 1, 1, 1]], [h, s]));
  eng.step(".");
  check("skittish_flees", pos(s) === "0,3");
})();

// a pushed skittish sheep does NOT also flee the same tick (no double move)
(() => {
  const h = E("P", HERO, 1, 1);
  const s = E("s", SHEEP, 1, 2, [], { behavior: "skittish" });
  const eng = new Engine(mk([[2, 2, 2, 2, 2], [2, 1, 1, 1, 3], [2, 2, 2, 2, 2]], [h, s]));
  eng.step("d"); // hero pushes sheep to (1,3); it must not then flee into the lava at (1,4)
  check("skittish_no_double_move", s.alive && pos(s) === "1,3" && pos(h) === "1,2");
})();

// a skittish sheep refuses to flee onto a hazard (self-preservation)
(() => {
  const h = E("P", HERO, 0, 0);
  const s = E("s", SHEEP, 0, 1, [], { behavior: "skittish" });
  const eng = new Engine(mk([[1, 1, 3]], [h, s])); // only escape (right) is lava
  eng.step(".");
  check("skittish_avoids_hazard", s.alive && pos(s) === "0,1");
})();

// --- terrain (unchanged effects still hold) -------------------------------

(() => {
  const h = E("P", HERO, 0, 0);
  const eng = new Engine(mk([[1], [2], [1]], [h, E("s", SHEEP, 2, 0, wait)]));
  eng.step("s");
  check("wall_blocks", pos(h) === "0,0");
})();

(() => {
  const h = E("P", HERO, 0, 0);
  const eng = new Engine(mk([[1, 1], [3, 1]], [h, E("s", SHEEP, 1, 1, wait)]));
  eng.step("s");
  check("lava_kills", !h.alive);
})();

(() => {
  const h = E("P", HERO, 0, 0);
  const eng = new Engine(mk([[1, 4, 1, 1]], [h, E("s", SHEEP, 0, 3, wait)]));
  eng.step("d");
  check("slip_slides", pos(h) === "0,2");
})();

(() => {
  const h = E("P", HERO, 0, 0);
  const eng = new Engine(mk([[1, 5, 1], [1, 1, 1]], [h, E("s", SHEEP, 1, 2, wait)]));
  eng.step("d"); const p1 = pos(h);
  eng.step("d"); const p2 = pos(h);
  eng.step("d"); const p3 = pos(h);
  check("skip_consumes_next", p1 === "0,1" && p2 === "0,1" && p3 === "0,2");
})();

(() => {
  const h = E("P", HERO, 1, 1);
  const eng = new Engine(mk([[6, 1, 1], [1, 1, 6]], [h, E("s", SHEEP, 0, 1, wait)]));
  eng.step("d"); // step onto the portal at (1,2) -> teleport to lowest-index portal (0,0)
  check("portal_lowest_index", pos(h) === "0,0");
})();

// --- simulateTo (UI scrubber path) ----------------------------------------

// a one-shove map wins, and re-simulating the same input is deterministic
(() => {
  const map = {
    name: "shove", vision: 5,
    grid: [["1", "1", "1"], ["1P", "1s", "3"], ["1", "1", "1"]],
    scripts: { s: wait },
  };
  setActiveLevel(map);
  const a = simulateTo([], ["d"], 1);
  const b = simulateTo([], ["d"], 1);
  const sig = (g) => g.entities.map((e) => `${e.letter}${pos(e)}${e.alive}`).join("|");
  check("simulateTo_wins", a.status === "win");
  check("simulateTo_deterministic", sig(a.gmap) === sig(b.gmap));
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
