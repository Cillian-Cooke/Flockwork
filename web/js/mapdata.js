// Hardcoded level + map builder — port of game/mapfile.py.
//
// The on-disk format is a single combined grid: each cell is a string holding the
// terrain number with the entity letter appended only when something stands there.
//   "1"  -> terrain 1 (grass), empty
//   "1a" -> enemy 'a' on grass     "1A" -> hero 'A'     "1s" -> sheep    "0" -> void

import { Entity, kindOf, entityTypeOf, HERO, ENEMY, SHEEP } from "./entity.js";
import { ALL_TOKENS } from "./tokens.js";

// Port of maps/level1.json — the single hardcoded level.
export const LEVEL = {
  name: "Level 1 — First Blood",
  vision: 5,
  grid: [
    ["1A", "1",  "1",  "1",  "1" ],
    ["1",  "2",  "3",  "4",  "1" ],
    ["1",  "1",  "1",  "1",  "1s"],
    ["6",  "1a", "1",  "1",  "6" ],
  ],
  scripts: {
    s: ["w", "s", ".", ".", ".", ".", ".", ".", ".", "."],
    a: ["d", "a", "d", "a", "d", "a", "d", "a", "d", "a"],
  },
};

const CELL_RE = /^(\d{1,3})([A-Za-z])?$/;

export class MapError extends Error {}

export class GameMap {
  constructor({ name, vision, terrain, entities, rows, cols }) {
    this.name = name;
    this.vision = vision;
    this.terrain = terrain;
    this.entities = entities;
    this.rows = rows;
    this.cols = cols;
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
      // Skittish sheep compute their own flee moves, so they need no script.
      const selfDriven = kind === SHEEP && m.behavior === "skittish";
      let loop = [];
      if ((kind === ENEMY || kind === SHEEP) && !selfDriven) {
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
        entityType: entityTypeOf(letter) || "",
        behavior: kind === SHEEP ? (m.behavior || "flock") : "flock",
        lethalToHero: m.lethalToHero !== undefined ? m.lethalToHero : true,
        lethalToSheep: m.lethalToSheep !== undefined ? m.lethalToSheep : false,
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
  });
}
