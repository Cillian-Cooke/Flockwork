// Wordle-style shareable result: render the day's board as a grid of colour
// emojis (square per terrain, circle per entity) with a score line and a link.
//
// The palette is deliberately tiny — there are only ~9 square and ~9 circle
// emojis, so the game's whole tile/entity vocabulary has to fit in them. That
// constraint is the point: a small, legible set players quickly learn to read.

import * as terrain from "./terrain.js";
import { HERO, ENEMY, SHEEP } from "./entity.js";

// Terrain → square emoji (grouped by effect; void/wall/lava pinned by id).
const EFFECT_SQUARE = {
  [terrain.NONE]:     "🟩", // grass
  [terrain.WALL]:     "🟫", // wall
  [terrain.DIE]:      "🟥", // hazard
  [terrain.SLIP]:     "🟦", // slide
  [terrain.GLIDE]:    "🟦",
  [terrain.CONVEYOR]: "🟨", // belt
  [terrain.CRACK]:    "⬜", // thin ice
  [terrain.SPIKE]:    "🟧", // trap
  [terrain.PLATE]:    "🟪", // mechanism
  [terrain.GATE]:     "🟪",
  [terrain.ONEWAY]:   "🟦",
  [terrain.TELEPORT]: "🟪",
  [terrain.WARP]:     "🟪",
};

export function terrainEmoji(id) {
  if (id === 0) return "⬛";            // void (abyss)
  if (id === 3) return "🟥";            // lava
  return EFFECT_SQUARE[terrain.effectOf(id)] || "🟩";
}

// Entity → coloured circle.
export function entityEmoji(e) {
  if (e.kind === HERO)  return "🔵";
  if (e.kind === SHEEP) return "⚪";
  if (e.kind === ENEMY) {
    if (e.heavy)        return "⚫"; // boulder
    if (e.lethalToSheep) return "🟤"; // wolf
    return "🔴";                      // guard / generic
  }
  return "🟢";
}

function aliveAt(gmap, r, c) {
  for (const e of gmap.entities) {
    if (e.alive && e.row === r && e.col === c) return e;
  }
  return null;
}

// The board (terrain + starting entities) as a multi-line emoji grid.
export function mapToEmoji(gmap) {
  const rows = [];
  for (let r = 0; r < gmap.rows; r++) {
    let line = "";
    for (let c = 0; c < gmap.cols; c++) {
      const ent = aliveAt(gmap, r, c);
      line += ent ? entityEmoji(ent) : terrainEmoji(gmap.terrain[r][c]);
    }
    rows.push(line);
  }
  return rows.join("\n");
}

// Score rewards efficiency and aggression: a solve base, minus the moves it
// took, plus a bonus for every enemy sent to its death.
export function computeScore(finalGmap, moves) {
  const kills = finalGmap.entities.filter((e) => e.kind === ENEMY && !e.alive).length;
  return Math.max(100, 1000 - moves * 75 + kills * 300);
}

// The full clipboard / native-share text. Blank lines separate the header, the
// score, the emoji board and the link — which is how WhatsApp and iMessage want
// it (plain LF newlines, no trailing spaces), mirroring Wordle's layout.
export function buildShareText({ day, moves, score, par, initialGmap, url }) {
  const tag = day ? `Flockwork #${day}` : "Flockwork";
  const parStr = par ? ` · best ${par}` : "";
  return [
    tag,
    "",
    `⭐ ${score} · ${moves} move${moves !== 1 ? "s" : ""}${parStr}`,
    "",
    mapToEmoji(initialGmap),
    "",
    url,
  ].join("\n");
}
