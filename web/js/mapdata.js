// Hardcoded level + map builder — port of game/mapfile.py.
//
// The on-disk format is a single combined grid: each cell is a string holding the
// terrain number with the entity letter appended only when something stands there.
//   "1"  -> terrain 1 (grass), empty
//   "1a" -> enemy 'a' on grass     "1A" -> hero 'A'     "1s" -> sheep    "0" -> void

import { Entity, kindOf, HERO, ENEMY, SHEEP } from "./entity.js";
import { ALL_TOKENS } from "./tokens.js";
import { ABILITIES, normalizeLoadout } from "./abilities.js";

// Default loadout for a hero whose map doesn't specify abilities.
const DEFAULT_ABILITIES = ["hook", "charge", "duplicate"];

// Fallback level used before any map is loaded.
export const LEVEL = {
  name: "Level 1 — First Steps",
  vision: 5,
  grid: [
    ["1A", "1",  "1",  "1",  "1" ],
    ["1",  "2",  "3",  "1",  "1" ],
    ["1",  "1",  "1",  "1",  "1s"],
    ["1",  "1a", "1",  "1",  "3" ],
  ],
  scripts: {
    s: [".", ".", ".", ".", ".", ".", ".", ".", ".", "."],
    a: ["d", "a", "d", "a", "d", "a", "d", "a", "d", "a"],
  },
};

const CELL_RE = /^(\d{1,3})([A-Za-z])?$/;

export class MapError extends Error {}

export class GameMap {
  constructor({ name, vision, terrain, entities, rows, cols, grants }) {
    this.name = name;
    this.vision = vision;
    this.terrain = terrain;
    this.entities = entities;
    this.rows = rows;
    this.cols = cols;
    // Ability terrain: Map "r,c" -> [ability id, …] (max 3, one of each).
    this.grants = grants || new Map();
  }

  // The abilities cached on the tile at (r,c), or null if it isn't ability terrain.
  grantAt(r, c) {
    return this.grants.get(`${r},${c}`) || null;
  }

  sheepAlive() {
    return this.entities.filter((e) => e.alive && e.kind === SHEEP).length;
  }

  heroesAlive() {
    return this.entities.filter((e) => e.alive && e.kind === HERO).length;
  }
}

function parseCell(cell, r, c) {
  if (typeof cell !== "string") {
    throw new MapError(`cell [${r}][${c}] must be a string`);
  }
  const m = CELL_RE.exec(cell.trim());
  if (!m) {
    throw new MapError(`cell [${r}][${c}] = ${JSON.stringify(cell)} is not '<terrain><entity?>'`);
  }
  const terrain = parseInt(m[1], 10);
  if (terrain > 100) {
    throw new MapError(`cell [${r}][${c}] terrain ${terrain} out of range 0-100`);
  }
  return [terrain, m[2] || null];
}

function validateScript(letter, script) {
  if (!Array.isArray(script) || !script.length) {
    throw new MapError(`script for ${letter} must be a non-empty list of tokens`);
  }
  for (const tok of script) {
    if (!ALL_TOKENS.has(tok)) {
      throw new MapError(`script for ${letter} has bad token ${JSON.stringify(tok)}`);
    }
  }
  return script.slice();
}

// Parse the optional `grants` field — ability terrain contents keyed by "r,c".
// Each entry is a list of up to 3 unique ability ids (validated against the
// library). Returns a Map for fast per-tile lookup during play.
function parseGrants(raw, rows, cols) {
  const grants = new Map();
  if (!raw) return grants;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new MapError("'grants' must be an object keyed by \"row,col\"");
  }
  for (const [key, ids] of Object.entries(raw)) {
    const m = /^(\d+),(\d+)$/.exec(String(key).trim());
    if (!m) throw new MapError(`grant key ${JSON.stringify(key)} must be "row,col"`);
    const r = Number(m[1]), c = Number(m[2]);
    if (r < 0 || r >= rows || c < 0 || c >= cols) {
      throw new MapError(`grant tile ${key} is out of bounds`);
    }
    if (!Array.isArray(ids) || !ids.length) {
      throw new MapError(`grant ${key} must be a non-empty list of ability ids`);
    }
    if (ids.length > 3) throw new MapError(`grant ${key} holds more than 3 abilities`);
    const seen = new Set();
    for (const id of ids) {
      if (!ABILITIES[id]) throw new MapError(`grant ${key} has unknown ability ${JSON.stringify(id)}`);
      if (seen.has(id)) throw new MapError(`grant ${key} repeats ability ${JSON.stringify(id)}`);
      seen.add(id);
    }
    grants.set(`${r},${c}`, ids.slice());
  }
  return grants;
}

// Build a fresh GameMap from level data. Called once per (re-)simulation so each
// playback/scrub starts from a clean, deterministic board.
export function buildGameMap(data = LEVEL) {
  const grid = data.grid;
  if (!Array.isArray(grid) || !grid.length) {
    throw new MapError("missing or invalid 'grid'");
  }
  const cols = grid[0].length;
  if (cols === 0) throw new MapError("grid rows must be non-empty");
  if (grid.some((row) => row.length !== cols)) {
    throw new MapError("grid is not rectangular");
  }

  const scripts = data.scripts || {};
  const meta = data.meta || {};
  const terrain = [];
  const entities = [];
  const seenEnemy = new Set();

  grid.forEach((row, r) => {
    const terrainRow = [];
    row.forEach((cell, c) => {
      const [tid, letter] = parseCell(cell, r, c);
      terrainRow.push(tid);
      if (letter === null) return;
      const kind = kindOf(letter);
      const m = meta[letter] || {};
      // Every NPC is fully scripted (no reactive AI) — sheep and enemies need a
      // loop. A heavy Boulder may sit still; a stationary enemy can use ".".
      let loop = [];
      if (kind === ENEMY || kind === SHEEP) {
        if (!(letter in scripts)) {
          throw new MapError(`entity ${letter} at [${r}][${c}] has no script`);
        }
        loop = validateScript(letter, scripts[letter]);
      }
      if (kind === ENEMY) {
        if (seenEnemy.has(letter)) {
          throw new MapError(`enemy letter ${letter} reused; each enemy must be unique`);
        }
        seenEnemy.add(letter);
      }
      entities.push(new Entity({
        letter, kind, row: r, col: c, loop,
        lethalToHero: m.lethalToHero !== undefined ? m.lethalToHero : true,
        lethalToSheep: m.lethalToSheep !== undefined ? m.lethalToSheep : false,
        heavy: !!m.heavy,
        toggle: m.toggle || null,
        abilities: kind === HERO ? normalizeLoadout(m.abilities || DEFAULT_ABILITIES) : [],
      }));
    });
    terrain.push(terrainRow);
  });

  if (!entities.some((e) => e.kind === SHEEP)) {
    throw new MapError("level needs at least one sheep ('s')");
  }
  if (!entities.some((e) => e.kind === HERO)) {
    throw new MapError("level needs at least one hero (uppercase letter)");
  }

  return new GameMap({
    name: data.name || "level",
    vision: parseInt(data.vision || 0, 10),
    terrain,
    entities,
    rows: grid.length,
    cols,
    grants: parseGrants(data.grants, grid.length, cols),
  });
}
