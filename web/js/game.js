// Round flow, scoring, input parsing, and deterministic re-simulation.
// Ports game/gameloop.py + game/inputs.py.
//
// Score is "<full_sets>.<extra_actions>": fully-spent 10-move sets plus how many
// actions into the final set the last sheep died.

import { buildGameMap, LEVEL } from "./mapdata.js";
import { Engine } from "./engine.js";
import { ROUND_LENGTH, ALL_TOKENS } from "./tokens.js";
import { ENEMY, SHEEP } from "./entity.js";

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

  // Banked rounds always survived (they wouldn't have been banked otherwise),
  // so each runs a full round. Guard against win/lose just in case.
  for (const moves of roundMoves) {
    log.push(`-- round ${completedSets + 1} (banked) --`);
    const res = runRound(engine, gmap, moves, ROUND_LENGTH, log);
    if (res.status !== "playing") {
      return finalize(gmap, engine, completedSets, res, log);
    }
    completedSets += 1;
  }

  // Current (in-progress) round, advanced to `tick`.
  let stoppedAt = 0;
  if (currentMoves && currentMoves.length && tick > 0) {
    log.push(`-- round ${completedSets + 1} (current) --`);
    const res = runRound(engine, gmap, currentMoves, tick, log);
    status = res.status;
    stoppedAt = res.stoppedAt;
  }

  const score = scoreStr(completedSets, stoppedAt);
  return { gmap, engine, completedSets, status, score, log };
}

function finalize(gmap, engine, completedSets, res, log) {
  const score = scoreStr(completedSets, res.stoppedAt);
  return { gmap, engine, completedSets, status: res.status, score, log };
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
