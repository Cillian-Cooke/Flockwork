// Modular ability library.
//
// A hero has up to THREE ability slots (entity.abilities = [id, id, id]); the
// player triggers a slot and the engine runs the matching ability here. This is
// the mix-and-match foundation: maps assign a loadout now, players will later.
//
// Each ability declares:
//   directional : true  -> arms on the slot press, then fires in the direction
//                          of the player's NEXT move (which it consumes).
//                 false -> fires instantly the moment the slot is pressed.
//   cost        : total action-slots the ability spends. Stronger = costlier.
//                 The engine locks the hero (forced waits) for the leftover
//                 ticks: instant abilities lock cost-1; directional ones already
//                 spend 2 (the press + the direction) and lock cost-2.
//   run(engine, hero, dir) : perform the effect. `dir` is [dr,dc] for
//                 directional abilities, [0,0] for instant ones.
//
// Abilities never "attack" — in the push/herding game they manipulate position:
// duplicate, drag, shove, blink, herd, freeze, shield.

import { Entity, HERO, ENEMY, SHEEP, rankOf } from "./entity.js";
import * as terrain from "./terrain.js";

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const isDir = (d) => d && (d[0] !== 0 || d[1] !== 0);

export const ABILITIES = {
  // --- directional -------------------------------------------------------

  // Spawn a copy of the hero on the adjacent tile in `dir`. Both copies run the
  // same move tape from here on — the swarm. The headline ability, so it's the
  // priciest (3 actions).
  duplicate: {
    name: "Duplicate", glyph: "👥", directional: true, cost: 3, color: "#ef4444",
    desc: "Spawn a copy of the hero one tile in the chosen direction. Every copy runs the same moves — build a swarm. Costs 3 actions.",
    run(engine, hero, dir) {
      if (!isDir(dir)) return;
      const nr = hero.row + dir[0], nc = hero.col + dir[1];
      if (!engine._inBounds(nr, nc)) return;
      if (!terrain.isPassable(engine.gmap.terrain[nr][nc])) return;
      if (engine._occupant(nr, nc, hero)) return;
      const dup = hero.clone();
      dup.row = nr; dup.col = nc;
      dup.armedAbility = null; dup.lockedTicks = 0; dup.invuln = 0;
      engine._spawn(dup);
    },
  },

  // Drag the first entity in line one tile TOWARD you (reverse push). Reposition
  // a sheep you can't get behind; can pull one into a hazard beside you.
  hook: {
    name: "Hook", glyph: "🪝", directional: true, cost: 2, color: "#f59e0b",
    desc: "Drag the first entity in that direction one tile toward you. The cheap, precise repositioning tool. Costs 2 actions.",
    run(engine, hero, dir) {
      if (!isDir(dir)) return;
      const [dr, dc] = dir;
      let r = hero.row + dr, c = hero.col + dc;
      while (engine._inBounds(r, c) && terrain.isPassable(engine.gmap.terrain[r][c])) {
        const target = engine._occupant(r, c, hero);
        if (target) {
          const tr = r - dr, tc = c - dc; // one tile back toward the hero
          if (!engine._inBounds(tr, tc)) return;
          if (!terrain.isPassable(engine.gmap.terrain[tr][tc])) return;
          if (engine._occupant(tr, tc, target)) return;
          const flock = target.kind === SHEEP && target.behavior === "flock";
          target.row = tr; target.col = tc; target.lastMove = [-dr, -dc];
          if (flock) engine._mirrorSheepDelta(target, -dr, -dc);
          engine._arrive(target, [-dr, -dc]);
          return;
        }
        r += dr; c += dc;
      }
    },
  },

  // Barrel forward until blocked, shoving whatever you hit (cascades down the
  // hierarchy). Moves the hero. Dies if it ploughs into a lethal enemy.
  charge: {
    name: "Charge", glyph: "💨", directional: true, cost: 2, color: "#a855f7",
    desc: "Barrel in that direction until blocked, shoving whatever you hit. Moves the hero. Costs 2 actions.",
    run(engine, hero, dir) {
      if (!isDir(dir)) return;
      const [dr, dc] = dir;
      for (let step = 0; step < 64; step++) {
        const nr = hero.row + dr, nc = hero.col + dc;
        if (!engine._inBounds(nr, nc) || !terrain.isPassable(engine.gmap.terrain[nr][nc])) break;
        const occ = engine._occupant(nr, nc, hero);
        if (occ) {
          if (occ.kind === ENEMY && occ.lethalToHero && hero.invuln <= 0) { hero.alive = false; return; }
          if (rankOf(hero.kind) > rankOf(occ.kind)) { if (!engine._attemptPush(occ, dir)) break; }
          else break;
        }
        // Don't barrel onto a hazard — stop short (the shoved entity still fell in).
        if (terrain.effectOf(engine.gmap.terrain[nr][nc]) === terrain.DIE) break;
        hero.row = nr; hero.col = nc; hero.lastMove = dir;
        engine._arrive(hero, dir);
        if (!hero.alive) return;
      }
    },
  },

  // Shepherd's whistle: shift the WHOLE flock one tile in `dir`, free of their
  // script this tick. Sheep that land on a hazard die. Pure herding.
  whistle: {
    name: "Whistle", glyph: "📣", directional: true, cost: 2, color: "#10b981",
    desc: "Call the whole flock one tile in that direction (ignores their script this tick). Costs 2 actions.",
    run(engine, hero, dir) {
      if (!isDir(dir)) return;
      const [dr, dc] = dir;
      // Move the sheep furthest along `dir` first so a line shuffles cleanly.
      const sheep = engine.gmap.entities
        .filter((e) => e.alive && e.kind === SHEEP)
        .sort((a, b) => (b.row * dr + b.col * dc) - (a.row * dr + a.col * dc));
      for (const s of sheep) {
        const nr = s.row + dr, nc = s.col + dc;
        if (!engine._inBounds(nr, nc) || !terrain.isPassable(engine.gmap.terrain[nr][nc])) continue;
        if (engine._occupant(nr, nc, s)) continue;
        s.row = nr; s.col = nc; s.lastMove = dir;
        engine._arrive(s, dir);
      }
    },
  },

  // Leap two tiles in `dir`, clearing whatever's between. Lands only on a free,
  // passable tile. Great for crossing gaps or hopping a blocker.
  blink: {
    name: "Blink", glyph: "✨", directional: true, cost: 2, color: "#06b6d4",
    desc: "Leap two tiles in that direction, over whatever's between. Lands on open ground. Costs 2 actions.",
    run(engine, hero, dir) {
      if (!isDir(dir)) return;
      const nr = hero.row + dir[0] * 2, nc = hero.col + dir[1] * 2;
      if (!engine._inBounds(nr, nc) || !terrain.isPassable(engine.gmap.terrain[nr][nc])) return;
      if (engine._occupant(nr, nc, hero)) return;
      hero.row = nr; hero.col = nc; hero.lastMove = dir;
      engine._arrive(hero, dir);
    },
  },

  // --- instant (non-directional) -----------------------------------------

  // Invincible for the next stretch: survive enemy contact and hazards. Lets you
  // walk a guard's lane or cross lava once.
  shield: {
    name: "Invincible", glyph: "🛡️", directional: false, cost: 1, color: "#eab308",
    desc: "Become invincible for your next action — walk through a guard once. Fires instantly (1 action).",
    run(engine, hero) { hero.invuln = Math.max(hero.invuln, 2); },
  },

  // Freeze every enemy: they skip their next move. Buys a beat to slip past a
  // patrol or wait out a trap.
  freeze: {
    name: "Freeze", glyph: "❄️", directional: false, cost: 2, color: "#6366f1",
    desc: "Freeze every enemy — they skip their next move. Costs 2 actions.",
    run(engine, hero) {
      for (const e of engine.gmap.entities) {
        if (e.alive && e.kind === ENEMY) e.skipNext = true;
      }
    },
  },
};

// Lock (forced waits) an ability imposes AFTER it resolves: instant abilities
// spend 1 action on the press, directional ones spend 2 (press + direction).
export function lockAfter(ability) {
  const base = ability.directional ? 2 : 1;
  return Math.max(0, (ability.cost || base) - base);
}

export { DIRS };
