// DOM rendering — persistent vision-based board, Rive tile animations, chat log helpers.

import * as terrain from "./terrain.js";
import { ROUND_LENGTH } from "./tokens.js";
import { HERO, ENEMY, SHEEP } from "./entity.js";
import { loopSummary } from "./game.js";
import { TERRAIN_FALLBACK } from "./riv.js";

const ANIM_SPEED_DEFAULT = 1 / 1.0; // fallback; each cell gets its own random speed

// --- cell sizing --------------------------------------------------------------

// Fit the whole rows×cols map into the stage, reserving ~1 cell of margin on
// each side for the boundary number labels (which float just outside the grid).
export function computeCell(rows, cols, stageH = 400, stageW = 600) {
  const byW = Math.floor(stageW / (cols + 2.6));
  const byH = Math.floor(stageH / (rows + 2.6));
  return Math.max(18, Math.min(byW, byH, 72));
}

// --- board init --------------------------------------------------------------

function entityAt(gmap, r, c) {
  for (const e of gmap.entities) {
    if (e.alive && e.row === r && e.col === c) return e;
  }
  return null;
}

function makeIdxLabel(text, styles) {
  const chip = document.createElement('div');
  chip.className = 'idx';
  Object.assign(chip.style, styles);
  const inner = document.createElement('div');
  inner.className = 'idx-inner';
  inner.textContent = text;
  chip.appendChild(inner);
  return chip;
}

// Build a persistent grid sized to the map (rows×cols) so there's no void
// padding around it. The grid is only as big as the hero's vision window
// (2v+1), CLAMPED to the map — so a small map shows whole (no padding) and a
// huge 100×100 map only ever builds ~(2v+1)² cells (cheap). The window scrolls
// to follow the hero in updateBoard. Rebuild when the map dimensions change.
export function initBoard(boardEl, mapRows, mapCols, vision) {
  boardEl.innerHTML = '';
  boardEl.style.transform = ''; // fresh map → reset any pinch-zoom/pan

  // Rendered window = the hero's vision (2v+1) capped at radius 15 (31×31) and
  // clamped to the map, so a huge 100×100 map still only builds ~31² cells.
  const winDim = Math.min(2 * vision + 1, 31);
  const rows = Math.min(winDim, mapRows);
  const cols = Math.min(winDim, mapCols);

  const stage = boardEl.closest('.board-stage');
  const stageH = stage ? Math.max(stage.clientHeight, 120) : 400;
  const stageW = stage ? Math.max(stage.clientWidth,  200) : 600;
  const cellSize = computeCell(rows, cols, stageH, stageW);

  boardEl.style.setProperty('--cell', `${cellSize}px`);
  if (stage) stage.style.setProperty('--cell', `${cellSize}px`);

  const gridEl = document.createElement('div');
  gridEl.className = 'grid';
  gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  gridEl.style.gridTemplateRows    = `repeat(${rows}, ${cellSize}px)`;

  const cells = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      const div = document.createElement('div');
      div.className = 'cell';
      div.style.width  = `${cellSize}px`;
      div.style.height = `${cellSize}px`;

      // Canvas for Rive tile animation
      const canvas = document.createElement('canvas');
      canvas.className = 'tile-canvas';
      canvas.width  = cellSize;
      canvas.height = cellSize;
      div.appendChild(canvas);

      // Entity glyph layer
      const inner = document.createElement('div');
      inner.className = 'cell-inner';
      div.appendChild(inner);

      // Move-preview "ghost path" dots layer
      const preview = document.createElement('div');
      preview.className = 'cell-preview';
      div.appendChild(preview);

      gridEl.appendChild(div);
      row.push({ div, canvas, ctx: canvas.getContext('2d'), inner, preview });
    }
    cells.push(row);
  }

  boardEl.appendChild(gridEl);

  return {
    boardEl, gridEl, cells,
    rows, cols, mapRows, mapCols, vision, cellSize,
    originRow:      0,           // world coord of the window's top-left cell
    originCol:      0,
    focusIdx:       0,           // which hero the window follows (creation order)
    heroCount:      1,
    animCells:      new Map(),   // "wr,wc" → { progress:0..1, target:0|1 }
    boundaryLabels: [],          // index-label els appended to gridEl
    gmap:           null,
    heroRow:        0,
    heroCol:        0,
    filmstrips:     null,
    stopped:        false,
    // Mobile pinch-zoom/pan view state. Only touched by gesture handlers in
    // main.js and never reset by updateBoard, so scrubbing the timeline or
    // playing a round never moves the camera the user has set.
    cam: { scale: 1, x: 0, y: 0 },
  };
}

// --- state update ------------------------------------------------------------

// Euclidean vision test (circle around hero).
function inCircle(dr, dc, vision) {
  return Math.sqrt(dr * dr + dc * dc) <= vision;
}

// Sync animation targets and cell overlays to the current game snapshot.
export function updateBoard(board, gmap, dying = []) {
  if (!gmap) return;
  const { vision, animCells, cells, rows, cols, mapRows, mapCols, gridEl, cellSize } = board;
  clearPathPreview(board); // stale ghost-path dots are re-drawn by updatePathPreview

  // The window follows the FOCUS hero (lowest index by default; the player can
  // cycle the focus on big maps). Heroes are in creation order, so [0] is lowest.
  const heroes = gmap.entities.filter(e => e.alive && e.kind === HERO);
  board.heroCount = heroes.length;
  const focus = heroes[Math.min(board.focusIdx || 0, Math.max(0, heroes.length - 1))]
             || { row: 0, col: 0 };
  board.heroRow = focus.row;
  board.heroCol = focus.col;
  board.gmap    = gmap;

  // Centre the window on the focus hero, clamped to the map so it never spills
  // past an edge. originRow/Col is the world coord of cell (0,0).
  const originRow = Math.max(0, Math.min(focus.row - (rows >> 1), mapRows - rows));
  const originCol = Math.max(0, Math.min(focus.col - (cols >> 1), mapCols - cols));
  board.originRow = originRow;
  board.originCol = originCol;

  // Visible set: union of every alive hero's vision circle.
  // When a hero dies their tiles drop out here → animCells target→0 → fade.
  const newVisible = new Set();
  for (const hero of heroes) {
    for (let dr = -vision; dr <= vision; dr++) {
      for (let dc = -vision; dc <= vision; dc++) {
        if (!inCircle(dr, dc, vision)) continue;
        const wr = hero.row + dr;
        const wc = hero.col + dc;
        if (wr >= 0 && wr < gmap.rows && wc >= 0 && wc < gmap.cols) {
          newVisible.add(`${wr},${wc}`);
        }
      }
    }
  }

  // Expose the visible set so the move-preview can clip dots to what's in sight.
  board.visible = newVisible;

  // Tiles an ability touched on this tick — flashed red, only while this tick
  // is the one on screen (board.abilityFx is reset every render in main.js).
  const fxSet = new Set((board.abilityFx || []).map(([r, c]) => `${r},${c}`));

  // Update animation targets
  for (const key of newVisible) {
    const existing = animCells.get(key);
    if (existing) {
      existing.target = 1;
    } else {
      const dur = 0.8 + Math.random() * 0.4; // random 0.8–1.2 s
      animCells.set(key, { progress: 0, target: 1, speed: 1 / dur });
    }
  }
  for (const [key, anim] of animCells) {
    if (!newVisible.has(key)) anim.target = 0;
  }

  // Update each cell from its world tile (window origin + screen offset). Tiles
  // outside the hero's vision are FOGGED — terrain isn't revealed (dataset and
  // tooltip get a sentinel) and no entity is shown.
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const wr = originRow + i, wc = originCol + j;
      const cell = cells[i][j];
      const inVision = newVisible.has(`${wr},${wc}`);

      cell.div.dataset.worldR = wr;
      cell.div.dataset.worldC = wc;
      cell.div.dataset.terrain = inVision ? gmap.terrain[wr][wc] : "?"; // "?" = unseen
      cell.div.classList.toggle('fog', !inVision);
      cell.div.classList.toggle('fx-ability', inVision && fxSet.has(`${wr},${wc}`));

      // Entity overlay (only what you can see)
      cell.div.classList.remove('ent-hero', 'ent-enemy', 'ent-sheep', 'blocked', 'barrier', 'charging');
      delete cell.div.dataset.entity;
      cell.inner.textContent = '';
      cell.inner.className = 'cell-inner';

      if (inVision) {
        const ent = entityAt(gmap, wr, wc);
        if (ent) {
          cell.div.dataset.entity = ent.letter;
          cell.div.classList.add(`ent-${ent.kind}`);
          if (ent.invuln > 0) cell.div.classList.add('barrier');
          if (ent.armedAbility) cell.div.classList.add('charging');
          cell.inner.textContent = ent.letter;
          cell.inner.classList.add('glyph');
        }
      }
    }
  }

  // Death beat: draw entities that just fell into lava/void on the hazard tile
  // for one frame (they vanish next frame) so the cause of death is visible.
  for (const d of dying) {
    const si = d.row - originRow, sj = d.col - originCol;
    if (si < 0 || si >= rows || sj < 0 || sj >= cols) continue;
    const cell = cells[si][sj];
    cell.inner.textContent = d.letter;
    cell.inner.className = `cell-inner glyph dying${d.entityType ? ` type-${d.entityType}` : ""}`;
    cell.div.classList.add(`ent-${d.kind}`);
  }

  // Rebuild boundary index labels outside the grid (same style as original)
  for (const el of board.boundaryLabels) el.remove();
  board.boundaryLabels = [];

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const wr = originRow + i, wc = originCol + j;
      if (!newVisible.has(`${wr},${wc}`)) continue;
      const cs = cellSize;

      if (wr === 0) {
        // Top label (column number, above the cell)
        const lbl = makeIdxLabel(String(wc), {
          left: `${j * cs}px`, top: `${i * cs - cs - 4}px`,
          width: `${cs}px`, height: `${cs}px`,
        });
        gridEl.appendChild(lbl);
        board.boundaryLabels.push(lbl);
      }
      if (wr === gmap.rows - 1) {
        // Bottom label (column number, below the cell)
        const lbl = makeIdxLabel(String(wc), {
          left: `${j * cs}px`, top: `${(i + 1) * cs + 4}px`,
          width: `${cs}px`, height: `${cs}px`,
        });
        gridEl.appendChild(lbl);
        board.boundaryLabels.push(lbl);
      }
      if (wc === 0) {
        // Left label (row number, left of the cell)
        const lbl = makeIdxLabel(String(wr), {
          top: `${i * cs}px`, left: `${j * cs - cs - 4}px`,
          width: `${cs}px`, height: `${cs}px`,
        });
        gridEl.appendChild(lbl);
        board.boundaryLabels.push(lbl);
      }
      if (wc === gmap.cols - 1) {
        // Right label (row number, right of the cell)
        const lbl = makeIdxLabel(String(wr), {
          top: `${i * cs}px`, left: `${(j + 1) * cs + 4}px`,
          width: `${cs}px`, height: `${cs}px`,
        });
        gridEl.appendChild(lbl);
        board.boundaryLabels.push(lbl);
      }
    }
  }
}

// --- move-preview ghost path -------------------------------------------------

export function clearPathPreview(board) {
  if (!board) return;
  for (const row of board.cells) for (const cell of row) cell.preview.innerHTML = "";
}

// Draw the planned-path dots. `dots` is a list of { wr, wc, color, last } in tick
// order; each becomes a small circle in its cell, clipped to the visible set and
// the on-screen window. Multiple dots on a tile stack (the cell wraps them).
export function renderPathPreview(board, dots) {
  clearPathPreview(board);
  if (!board || !board.visible || !dots || !dots.length) return;
  const { rows, cols, cells, visible, originRow, originCol } = board;
  for (const d of dots) {
    if (!visible.has(`${d.wr},${d.wc}`)) continue;          // can't plan past your sight
    const si = d.wr - originRow, sj = d.wc - originCol;
    if (si < 0 || si >= rows || sj < 0 || sj >= cols) continue;
    const dot = document.createElement("span");
    dot.className = d.last ? "path-dot path-dot-end" : "path-dot";
    dot.style.background = d.color;
    cells[si][sj].preview.appendChild(dot);
  }
}

// --- rAF render loop ---------------------------------------------------------

export function startRafLoop(board) {
  let lastTs = 0;

  function frame(ts) {
    if (board.stopped) return;

    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
    lastTs = ts;

    const { cells, rows, cols, animCells, gmap, filmstrips, originRow, originCol } = board;

    // Clear all cell canvases first
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const { ctx, canvas } = cells[i][j];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    if (!gmap) { requestAnimationFrame(frame); return; }

    // Advance progress and draw each animated world tile
    for (const [key, anim] of animCells) {
      // Advance toward target at this cell's own random speed
      const spd = anim.speed ?? ANIM_SPEED_DEFAULT;
      if (anim.target === 1 && anim.progress < 1) {
        anim.progress = Math.min(1, anim.progress + spd * dt);
      } else if (anim.target === 0 && anim.progress > 0) {
        anim.progress = Math.max(0, anim.progress - spd * dt);
      }

      if (anim.progress <= 0.001 && anim.target === 0) {
        animCells.delete(key);
        continue;
      }

      // Map the world tile into the current window (origin + screen offset).
      const commaIdx = key.indexOf(',');
      const wr = Number(key.slice(0, commaIdx));
      const wc = Number(key.slice(commaIdx + 1));
      const si = wr - originRow, sj = wc - originCol;
      if (si < 0 || si >= rows || sj < 0 || sj >= cols) continue;

      const terrainId = gmap.terrain[wr][wc];
      const { ctx, canvas } = cells[si][sj];
      const p = anim.progress;
      // Fade in fast, hold opaque, fade out fast
      const alpha = Math.min(1, p * 2);

      if (filmstrips && filmstrips.has(terrainId)) {
        const strip = filmstrips.get(terrainId);
        const frameIdx = Math.round(p * strip.topIdx);
        ctx.globalAlpha = alpha;
        ctx.drawImage(strip.frames[frameIdx], 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      } else if (terrainId !== 0 && TERRAIN_FALLBACK[terrainId]) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = TERRAIN_FALLBACK[terrainId];
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }
      // terrain 0 = void: canvas stays clear → dark cell background visible
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// --- chat log helpers --------------------------------------------------------
// These are unchanged from the original render.js.

export function asciiMap(gmap) {
  const TERRAIN_CHAR = { 0:"·", 1:".", 2:"#", 3:"~", 4:"/", 5:"?", 6:"O", 7:"*", 8:">", 9:"@" };
  const lines = [];
  let header = "   ";
  for (let c = 0; c < gmap.cols; c++) header += String(c).padStart(2, " ");
  lines.push(header);
  for (let r = 0; r < gmap.rows; r++) {
    let row = String(r).padStart(2, " ") + " ";
    for (let c = 0; c < gmap.cols; c++) {
      const ent = gmap.entities.find(e => e.alive && e.row === r && e.col === c);
      row += ent ? " " + ent.letter : " " + (TERRAIN_CHAR[gmap.terrain[r][c]] ?? ".");
    }
    lines.push(row);
  }
  return lines;
}

export function buildInitialLog(gmap) {
  const entries = [];
  entries.push({ cls: "header", text: `=== ${gmap.name} ===` });
  entries.push({ cls: "sep",    text: `Grid: ${gmap.rows} rows × ${gmap.cols} cols` });
  entries.push({ cls: "sep",    text: "" });
  entries.push({ cls: "header", text: "Starting map:" });
  for (const line of asciiMap(gmap)) entries.push({ cls: "map-line", text: line });
  entries.push({ cls: "sep", text: "" });
  entries.push({ cls: "header", text: "Entities:" });
  for (const e of gmap.entities) {
    const kindName = e.kind === HERO ? "Hero" : e.kind === SHEEP ? "Sheep" : "Enemy";
    const loopStr  = e.loop.length ? e.loop.join(" ") : "player";
    entries.push({ cls: "sep", text: `  ${e.letter} (${kindName}) @ [${e.row}][${e.col}]  loop: ${loopStr}` });
  }
  entries.push({ cls: "sep", text: "" });
  entries.push({ cls: "header", text: "Enemy & sheep loops:" });
  for (const { letter, kind, loop } of loopSummary(gmap)) {
    entries.push({ cls: "sep", text: `  ${letter} (${kind}): ${loop.join(" ")}` });
  }
  entries.push({ cls: "sep", text: "" });
  entries.push({ cls: "sep", text: "Move: w a s d  ·  Wait: .   (walk into a sheep to push it)" });
  entries.push({ cls: "sep", text: "Herd sheep into lava/void to kill them. Watch the flock move as one." });
  entries.push({ cls: "sep", text: "e: instant ability  ·  r: charge — fires on whichever move key comes next" });
  entries.push({ cls: "sep", text: "─────────────────────────────────────" });
  return entries;
}

export function buildTickEntries(roundNo, tick, token, events, status) {
  const entries = [];
  if (events.length) {
    for (const ev of events) {
      const cls = ev.includes("died") ? "error" : "event";
      entries.push({ cls, text: `R${roundNo} T${tick} [${token}]  ${ev}` });
    }
  }
  if (status !== "playing") {
    entries.push({ cls: status === "win" ? "header" : "error",
      text: status === "win" ? "🎉 You win!" : "💀 You lose." });
  }
  return entries;
}
