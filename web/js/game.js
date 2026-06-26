// Round flow, scoring, input parsing, and deterministic re-simulation.
// Ports game/gameloop.py + game/inputs.py.
//
// Score is "<full_sets>.<extra_actions>": fully-spent 10-move sets plus how many
// actions into the final set the last sheep died.

import { buildGameMap, LEVEL } from "./mapdata.js";
import { Engine } from "./engine.js";
import { ROUND_LENGTH, ALL_TOKENS } from "./tokens.js";
import { HERO, ENEMY, SHEEP } from "./entity.js";
import { normalizeLoadout } from "./abilities.js";

export class InputError extends Error {}

// The level every (re-)simulation builds from. Swappable at runtime so a player
// can drop in their own map JSON. Validated by the caller via buildGameMap first.
let activeLevel = LEVEL;

export function setActiveLevel(data) {
  activeLevel = data;
}

export function getActiveLevel() {
  return activeLevel;
}

// --- ability pickups (ability terrain) -------------------------------------
//
// A hero's loadout NEVER changes on its own. Ending a turn on ability terrain
// (`gmap.grants`) lights the Interact button; the player opens the popup and
// chooses what to take/swap. That choice is recorded as a "swap" so it persists
// and the timeline stays deterministic across re-simulation.
//
// `activeSwaps` is keyed by the number of completed rounds at the moment of the
// swap → the chosen length-3 loadout.
let activeSwaps = {};

export function setSwaps(swaps) {
  activeSwaps = swaps || {};
}

export function getSwaps() {
  return activeSwaps;
}

// The hero's loadout as built from the map (boundary 0).
function heroLoadout(gmap) {
  const h = gmap.entities.find((e) => e.kind === HERO);
  return normalizeLoadout(h ? h.abilities : []);
}

// Stamp `loadout` onto every alive hero (the swarm shares one loadout).
function applyLoadout(gmap, loadout) {
  for (const e of gmap.entities) {
    if (e.alive && e.kind === HERO) e.abilities = loadout.slice();
  }
}

// The loadout entering round index `b` (after `b` rounds have completed): an
// explicit player swap if one was recorded at this boundary, else unchanged.
// Pickups are never automatic — the loadout only moves when the player confirms.
function loadoutAtBoundary(b, loadout, _gmap) {
  if (activeSwaps[b]) return normalizeLoadout(activeSwaps[b]);
  return loadout;
}

// "A hero just ended a turn on ability terrain holding something it doesn't own"
// — lights the Interact button so the player can open the swap popup. Returns
// the tile's abilities and the current loadout, or null.
export function pendingSwapInfo(gmap, loadout) {
  for (const e of gmap.entities) {
    if (!e.alive || e.kind !== HERO) continue;
    const tile = gmap.grantAt(e.row, e.col);
    if (!tile) continue;
    const owned = new Set(loadout.filter(Boolean));
    const lacked = tile.filter((id) => !owned.has(id));
    if (!lacked.length) continue; // hero already owns everything here
    return { tileAbilities: tile.slice(), loadout: loadout.slice(), hero: [e.row, e.col] };
  }
  return null;
}

// Parse packed or space-separated tokens into a validated list (>= 1).
export function parseMoves(line) {
  const tokens = [...line].filter((ch) => !/\s/.test(ch));
  if (!tokens.length) throw new InputError("need at least 1 move");
  for (const tok of tokens) {
    if (!ALL_TOKENS.has(tok)) {
      throw new InputError(`unknown move ${JSON.stringify(tok)}; use w a s d / t f g h / e r / .`);
    }
  }
  return tokens;
}

export function scoreStr(completedSets, extraActions) {
  return `${completedSets}.${extraActions}`;
}

function statusOf(gmap) {
  if (gmap.sheepAlive() === 0) return "win";
  if (gmap.heroesAlive() === 0) return "lose";
  return "playing";
}

// Run a single round of `ticks` steps onto an existing engine/map, appending a
// readable event log. Returns { status, stoppedAt }.
function runRound(engine, gmap, moves, ticks, log) {
  engine.tick = 0;
  for (let t = 0; t < ticks; t++) {
    // The round is 10 ticks; a shorter queue repeats to fill it (the hotbar
    // shows this as transparent ghost tiles).
    const token = moves[t % moves.length];
    const before = new Map(gmap.entities.map((e) => [e, { row: e.row, col: e.col, alive: e.alive }]));
    engine.step(token);

    const events = [];
    for (const e of gmap.entities) {
      const prev = before.get(e);
      if (!prev) { events.push(`+ ${e.letter} spawned @${e.row},${e.col}`); continue; }
      if (prev.alive && !e.alive) events.push(`x ${e.letter} died @${e.row},${e.col}`);
      else if (prev.row !== e.row || prev.col !== e.col) {
        events.push(`${e.letter}:${prev.row},${prev.col}->${e.row},${e.col}`);
      }
    }
    log.push(`tick ${t + 1}/${ROUND_LENGTH}  '${token}'  ${events.join("  ") || "(no change)"}`);

    const st = statusOf(gmap);
    if (st !== "playing") return { status: st, stoppedAt: t + 1 };
  }
  return { status: statusOf(gmap), stoppedAt: ticks };
}

// Rebuild the board and replay all banked rounds in full, then `tick` ticks of the
// current round. One code path serves both playback and timeline scrubbing.
//
// Returns { gmap, engine, completedSets, status, score, log }.
export function simulateTo(roundMoves, currentMoves, tick) {
  const gmap = buildGameMap(activeLevel);
  const engine = new Engine(gmap);
  const log = [];
  let completedSets = 0;
  let status = "playing";
  let loadout = heroLoadout(gmap); // boundary 0 == the map's loadout

  // Banked rounds always survived (they wouldn't have been banked otherwise),
  // so each runs a full round. Guard against win/lose just in case. The hero's
  // loadout is re-derived at every boundary (ability-terrain pickups + swaps).
  for (const moves of roundMoves) {
    applyLoadout(gmap, loadout);
    log.push(`-- round ${completedSets + 1} (banked) --`);
    const res = runRound(engine, gmap, moves, ROUND_LENGTH, log);
    if (res.status !== "playing") {
      return finalize(gmap, engine, completedSets, res, log, loadout);
    }
    completedSets += 1;
    loadout = loadoutAtBoundary(completedSets, loadout, gmap);
  }

  // Reflect the current loadout on the board (for codex/tooltips) and play the
  // in-progress round with it.
  applyLoadout(gmap, loadout);
  let stoppedAt = 0;
  if (currentMoves && currentMoves.length && tick > 0) {
    log.push(`-- round ${completedSets + 1} (current) --`);
    const res = runRound(engine, gmap, currentMoves, tick, log);
    status = res.status;
    stoppedAt = res.stoppedAt;
  }

  const score = scoreStr(completedSets, stoppedAt);
  return { gmap, engine, completedSets, status, score, log, loadout };
}

function finalize(gmap, engine, completedSets, res, log, loadout) {
  const score = scoreStr(completedSets, res.stoppedAt);
  return { gmap, engine, completedSets, status: res.status, score, log, loadout };
}

// Step the current round's queued moves once (no looping) from the round-start
// state, recording every alive hero's position after each tick. Used to draw the
// move-preview "ghost path". Stops early on win/lose. Returns { frames, status }
// where each frame is { heroes: [[r,c], …], status } for one queued action.
export function tracePath(roundMoves, currentMoves) {
  const gmap = buildGameMap(activeLevel);
  const engine = new Engine(gmap);

  // Replay banked rounds to reach the current round's start, threading the same
  // loadout transitions so ability tokens in the trace fire correctly.
  let loadout = heroLoadout(gmap);
  let completed = 0;
  for (const moves of roundMoves) {
    applyLoadout(gmap, loadout);
    const res = runRound(engine, gmap, moves, ROUND_LENGTH, []);
    if (res.status !== "playing") return { frames: [], status: res.status };
    completed += 1;
    loadout = loadoutAtBoundary(completed, loadout, gmap);
  }
  applyLoadout(gmap, loadout);

  // The preview deliberately ignores enemies — their movement and even presence
  // are for the player to reason about, not the planning dots. Drop them so they
  // can't block, move, or kill the hero in the trace (sheep/terrain still count).
  for (const e of gmap.entities) if (e.kind === ENEMY) e.alive = false;

  const frames = [];
  engine.tick = 0; // the current round runs from tick 0 (matches runRound)
  let status = "playing";
  for (let t = 0; t < currentMoves.length; t++) {
    engine.step(currentMoves[t]);
    const heroes = gmap.entities
      .filter((e) => e.alive && e.kind === HERO)
      .map((e) => [e.row, e.col]);
    status = statusOf(gmap);
    frames.push({ heroes, status });
    if (status !== "playing") break;
  }
  return { frames, status };
}

// Per-entity loop summary for the "enemy & sheep loops" display.
export function loopSummary(gmap) {
  const seen = new Set();
  const out = [];
  for (const e of gmap.entities) {
    if ((e.kind === ENEMY || e.kind === SHEEP) && !seen.has(e.letter)) {
      seen.add(e.letter);
      const kind = e.kind === SHEEP ? "sheep" : "enemy";
      out.push({ letter: e.letter, kind, loop: e.loop.slice() });
    }
  }
  return out;
}
