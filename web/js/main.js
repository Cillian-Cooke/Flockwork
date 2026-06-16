// UI wiring: controls → hotbar, global timeline, chat log, save/load/download.

import { simulateTo, parseMoves, setActiveLevel, getActiveLevel } from "./game.js";
import { buildGameMap, MapError } from "./mapdata.js";
import { initBoard, updateBoard, startRafLoop, buildInitialLog, buildTickEntries } from "./render.js";
import { classify, tokenLabel, ROUND_LENGTH } from "./tokens.js";
import { describeTerrain } from "./terrain.js";
import { HERO, ENEMY, SHEEP, ABILITY_INFO } from "./entity.js";
import { initRiv, buildFilmstrips, playYouLose } from "./riv.js";

// --- state ----------------------------------------------------------------

let roundMoves     = [];    // completed round move sequences (arrays of tokens)
let currentMoves   = [];    // tokens queued for the current round
let globalPos      = 0;     // current global tick position shown on timeline
let maxGlobalPos   = 0;     // furthest position reached — timeline max
let playing        = false;
let playingThrough = false;
let loadedSave     = null;  // raw JSON of a loaded save file
let lastSnapshot   = null;

// Rive board state
let board         = null;
let riveModule    = null;
let filmstrips    = null;
let youLosePlayed = false;

const KEYMAP = { w:"w",a:"a",s:"s",d:"d",t:"t",f:"f",g:"g",h:"h",e:"e",r:"r",".":"." };
const SYMBOL  = { w:"↑",s:"↓",a:"←",d:"→",t:"↑",f:"←",g:"↓",h:"→",e:"e",r:"r",".":"·" };

// --- mobile lockdown: no pinch-zoom / double-tap-zoom, page stays fixed ----

document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener("gesturestart", e => e.preventDefault());

// --- DOM refs -------------------------------------------------------------

const boardEl        = document.getElementById("board");
const chatBody       = document.getElementById("chat-body");
const chatPopup      = document.getElementById("chat-popup");
const chatToggle     = document.getElementById("chat-toggle");
const chatClose      = document.getElementById("chat-close");
const hotbarEl       = document.getElementById("hotbar");
const timelineDotsEl = document.getElementById("timeline-dots");
const tooltip        = document.getElementById("tooltip");
const mapTitleEl     = document.getElementById("map-title");
const mapMetaEl      = document.getElementById("map-meta");
const saveOptionsEl  = document.getElementById("save-options");
const saveInfoEl     = document.getElementById("save-info");
const youLoseCanvas  = document.getElementById("you-lose-canvas");

// --- helpers --------------------------------------------------------------

function shortTitle(name, max = 20) {
  const n = String(name || "—");
  return n.length > max ? n.slice(0, max) + "…" : n;
}

// Convert a global tick position to the right simulateTo arguments.
// Completed rounds are replayed as "banked"; the target round as "current".
function simulateToGlobal(pos) {
  const round = Math.floor(pos / ROUND_LENGTH);
  const tick  = pos % ROUND_LENGTH;

  // tick=0 at a non-zero position means the full previous round was completed,
  // not that zero ticks should be applied (which would return the initial state).
  const eRound = (tick === 0 && pos > 0) ? round - 1 : round;
  const eTick  = (tick === 0 && pos > 0) ? ROUND_LENGTH : tick;

  if (eRound < roundMoves.length) {
    return simulateTo(roundMoves.slice(0, eRound), roundMoves[eRound], eTick);
  }
  return simulateTo(roundMoves, currentMoves, eTick);
}

// Parse the last log entry for the current tick's events.
function tickEventsFromSnap(snap) {
  const line = snap.log[snap.log.length - 1] || "";
  if (!line.startsWith("tick ")) return { token: "", events: [] };
  const parts = line.split(/\s{2,}/);
  return {
    token:  (parts[1] || "").replace(/'/g, ""),
    events: parts.slice(2).filter(Boolean).filter(s => s !== "(no change)"),
  };
}

// --- rendering ------------------------------------------------------------

// Render the board + meta + status for a position, WITHOUT rebuilding or
// re-centring the timeline strip. Used both by full renders and by the
// scroll-driven selection so sliding can update the map live.
function showState(pos) {
  globalPos = pos;
  const snap = simulateToGlobal(pos);
  lastSnapshot = snap;

  if (board) updateBoard(board, snap.gmap);

  const roundNum = Math.floor(pos / ROUND_LENGTH) + 1;
  const tickNum  = pos % ROUND_LENGTH;
  mapMetaEl.textContent = `R${roundNum} · T${tickNum}`;

  checkGameStatus(snap);
  return snap;
}

// Full render: show the state AND rebuild + recentre the timeline. Used for
// programmatic moves (append, play, load) where the selection jumps.
function renderGlobal(pos) {
  const snap = showState(pos);
  updateTimelineDots();
  return snap;
}

// Mark a dot as the current selection (move the blue ring) without rebuilding
// the strip or scrolling — for live updates as the user slides the timeline.
function selectPos(pos) {
  showState(pos);
  for (const dot of timelineDotsEl.children) {
    dot.classList.toggle("current", Number(dot.dataset.pos) === pos);
  }
}

// The dot nearest the horizontal centre of the strip — i.e. what the user has
// scrolled onto.
function centeredPos() {
  const center = timelineDotsEl.scrollLeft + timelineDotsEl.clientWidth / 2;
  let bestPos = null, bestDist = Infinity;
  for (const dot of timelineDotsEl.children) {
    const dotCenter = dot.offsetLeft + dot.offsetWidth / 2;
    const dist = Math.abs(dotCenter - center);
    if (dist < bestDist) { bestDist = dist; bestPos = Number(dot.dataset.pos); }
  }
  return bestPos;
}

function updateTimelineDots() {
  timelineDotsEl.innerHTML = "";

  const endPos    = Math.max(0, maxGlobalPos);
  const finalStatus = lastSnapshot ? lastSnapshot.status : "playing";

  // Create all dots
  for (let i = 0; i <= endPos; i++) {
    const dot = document.createElement("div");
    dot.className = "timeline-dot";
    dot.dataset.pos = i;

    // Round markers (every ROUND_LENGTH ticks)
    if (i > 0 && i % ROUND_LENGTH === 0) {
      dot.classList.add("round-marker");
    }

    // Current position
    if (i === globalPos) {
      dot.classList.add("current");
    }

    // Final dot reflects outcome
    if (i === endPos && finalStatus !== "playing") {
      dot.classList.add(finalStatus === "win" ? "win" : "lose");
    }

    // Clicking smooth-scrolls the dot to centre; the scroll handler then
    // selects it — so click and slide share one path.
    dot.addEventListener("click", () => {
      if (playing || playingThrough) return;
      const target = dot.offsetLeft + dot.offsetWidth / 2 - timelineDotsEl.clientWidth / 2;
      timelineDotsEl.scrollTo({ left: target, behavior: "smooth" });
    });

    timelineDotsEl.appendChild(dot);
  }

  // Centre the active dot, then ripple the wave outward from the middle.
  centerCurrentDot(false);
}

// Wave: dots swell as they near the horizontal centre of the strip and shrink
// away from it, so sliding the timeline reads as a smooth travelling bulge.
const WAVE_RADIUS = 130; // px on each side of centre that the swell reaches
const WAVE_BUMP   = 1.4; // extra scale (1 → 2.4) at dead centre

function applyWave() {
  const center = timelineDotsEl.scrollLeft + timelineDotsEl.clientWidth / 2;
  for (const dot of timelineDotsEl.children) {
    const dotCenter = dot.offsetLeft + dot.offsetWidth / 2;
    const t = Math.max(0, 1 - Math.abs(dotCenter - center) / WAVE_RADIUS);
    const eased = t * t * (3 - 2 * t); // smoothstep for a soft falloff
    dot.style.setProperty("--w", (1 + eased * WAVE_BUMP).toFixed(3));
  }
}

function centerCurrentDot(smooth) {
  const cur = timelineDotsEl.querySelector(".timeline-dot.current");
  if (!cur) { applyWave(); return; }
  const target = cur.offsetLeft + cur.offsetWidth / 2 - timelineDotsEl.clientWidth / 2;
  timelineDotsEl.scrollTo({ left: target, behavior: smooth ? "smooth" : "auto" });
  applyWave();
}

// --- hotbar ---------------------------------------------------------------

function tileKind(token) {
  const [k] = classify(token);
  if (k === "move")   return "move";
  if (k === "attack") return "attack";
  if (k === "wait")   return "wait";
  return "ability";
}

// Mirrors Engine._resolveCharges over the player's queued tokens, purely for
// hotbar display: an armed 'r' (ability_2) stays active through whatever
// comes next and only fires on the following move token — so a powerful
// charged action visibly spans every tile from the 'r' to the move that
// triggers it, and the badge shows exactly how many actions it costs.
function annotateCharges(tokens) {
  const active = new Set();
  const starts = new Map(); // start index -> ticks until it fires
  const ends   = new Set();
  let chargeStart = null;
  tokens.forEach((tok, i) => {
    const [kind] = classify(tok);
    if (kind === "ability_2") {
      chargeStart = i;
      active.add(i);
    } else if (chargeStart !== null) {
      active.add(i);
      if (kind === "move") {
        ends.add(i);
        starts.set(chargeStart, i - chargeStart);
        chargeStart = null;
      }
    }
  });
  return { active, starts, ends };
}

function makeTile(token, tickNo, solid, index, chargeInfo) {
  const tile = document.createElement("div");
  const classes = ["tile", tileKind(token), solid ? "solid" : "ghost"];
  let title = `tick ${tickNo}: ${tokenLabel(token)}`;
  let badge = "";

  if (chargeInfo.active.has(index)) classes.push("charge-active");
  if (chargeInfo.starts.has(index)) {
    classes.push("charge-start");
    const span = chargeInfo.starts.get(index);
    badge = `<span class="tile-charge-badge">×${span + 1}</span>`;
    title += ` — charges; fires ${span} tick${span === 1 ? "" : "s"} later (×${span + 1} actions total)`;
  } else if (chargeInfo.active.has(index) && !chargeInfo.ends.has(index)) {
    title += " — ability still charging";
  }
  if (chargeInfo.ends.has(index)) {
    classes.push("charge-end");
    title += " — charged ability fires here";
  }

  tile.className = classes.join(" ");
  tile.title = title;
  tile.innerHTML = `<span class="tile-tick">${tickNo}</span>${SYMBOL[token] || token}${badge}`;
  if (solid) { tile.dataset.index = index; }
  return tile;
}

function renderHotbar() {
  hotbarEl.innerHTML = "";
  const n = currentMoves.length;
  if (!n) return;
  const displayed   = Array.from({ length: ROUND_LENGTH }, (_, i) => currentMoves[i % n]);
  const chargeInfo  = annotateCharges(displayed);
  for (let i = 0; i < ROUND_LENGTH; i++) {
    hotbarEl.appendChild(makeTile(displayed[i], i + 1, i < n, i, chargeInfo));
  }
}

// --- move management ------------------------------------------------------

// Reset the "current round" portion of the timeline (keep banked rounds).
function resetCurrentRound() {
  const base = roundMoves.length * ROUND_LENGTH;
  maxGlobalPos = base;
  globalPos    = base;
  renderGlobal(base);
}

function appendToken(token) {
  if (playing || playingThrough) return;
  currentMoves.push(token);
  renderHotbar();
  resetCurrentRound();
}

function popToken() {
  if (playing || playingThrough || !currentMoves.length) return;
  currentMoves.pop();
  renderHotbar();
  resetCurrentRound();
}

function clearMoves() {
  if (playing || playingThrough) return;
  currentMoves = [];
  renderHotbar();
  resetCurrentRound();
}

// --- playback -------------------------------------------------------------

const delay = ms => new Promise(r => setTimeout(r, ms));

async function playRound() {
  if (playing || playingThrough) return;
  try { parseMoves(currentMoves.join("")); }
  catch (err) { appendChatLine(`! ${err.message}`, "error"); return; }

  playing = true;
  setControlsDisabled(true);

  const roundNo = roundMoves.length + 1;
  appendChatLine(`── Round ${roundNo} ──`, "header");

  for (let t = 1; t <= ROUND_LENGTH; t++) {
    const pos = roundMoves.length * ROUND_LENGTH + t;
    maxGlobalPos = pos;
    const snap = renderGlobal(pos);

    const { token, events } = tickEventsFromSnap(snap);
    for (const e of buildTickEntries(roundNo, t, token, events, snap.status)) {
      appendChat([e]);
    }

    await delay(500);
    if (snap.status !== "playing") {
      playing = false;
      setControlsDisabled(false);
      return;
    }
  }

  // Bank the completed round; keep current position for review.
  roundMoves.push(currentMoves.slice());
  currentMoves = [];
  renderHotbar();
  playing = false;
  setControlsDisabled(false);
}

// Animate through all provided rounds + optional current moves.
async function animatePlaythrough(savedRounds, savedCurrent) {
  playingThrough = true;
  setControlsDisabled(true);

  for (let r = 0; r < savedRounds.length; r++) {
    appendChatLine(`── Round ${r + 1} (replay) ──`, "header");
    for (let t = 1; t <= ROUND_LENGTH; t++) {
      if (!playingThrough) { setControlsDisabled(false); return; }
      const pos    = r * ROUND_LENGTH + t;
      maxGlobalPos = pos;
      const snap   = renderGlobal(pos);
      const { token, events } = tickEventsFromSnap(snap);
      for (const e of buildTickEntries(r + 1, t, token, events, snap.status)) appendChat([e]);
      await delay(500);
      if (snap.status !== "playing") break;
    }
  }

  if (savedCurrent.length && playingThrough) {
    const r = savedRounds.length;
    appendChatLine(`── Round ${r + 1} (current) ──`, "header");
    for (let t = 1; t <= savedCurrent.length; t++) {
      if (!playingThrough) break;
      const pos    = r * ROUND_LENGTH + t;
      maxGlobalPos = pos;
      const snap   = renderGlobal(pos);
      const { token, events } = tickEventsFromSnap(snap);
      for (const e of buildTickEntries(r + 1, t, token, events, snap.status)) appendChat([e]);
      await delay(500);
    }
  }

  playingThrough = false;
  setControlsDisabled(false);
}

function setControlsDisabled(disabled) {
  document.querySelectorAll(".ctl,.diamond-btn,.opt-btn,.download-btn").forEach(b => {
    b.disabled = disabled;
  });
}

// --- download / save JSON -------------------------------------------------

function buildSaveData() {
  const level = getActiveLevel();
  return {
    name:    level.name,
    grid:    level.grid,
    scripts: level.scripts,
    rounds:  roundMoves,
    current: currentMoves,
  };
}

function downloadSave() {
  const data = buildSaveData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${(data.name || "save").replace(/[^a-z0-9]/gi, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- load / save handling -------------------------------------------------

function initChatForMap(levelData) {
  chatBody.innerHTML = "";
  const gmap = buildGameMap(levelData);
  appendChat(buildInitialLog(gmap));
}

function resetGame() {
  roundMoves    = [];
  currentMoves  = [];
  globalPos     = 0;
  maxGlobalPos  = 0;
  loadedSave    = null;
  youLosePlayed = false;
  if (youLoseCanvas) youLoseCanvas.hidden = true;
  saveOptionsEl.hidden = true;
  renderHotbar();
  renderGlobal(0);
}

function showSaveOptions(data) {
  const rounds     = data.rounds  || [];
  const current    = data.current || [];
  const totalTicks = rounds.length * ROUND_LENGTH + current.length;
  saveInfoEl.textContent =
    `${rounds.length} completed round${rounds.length !== 1 ? "s" : ""} · ${totalTicks} ticks`;
  saveOptionsEl.hidden = false;
}

function loadLevelData(data, sourceName = "custom map") {
  if (playing || playingThrough) return;
  try { buildGameMap(data); }
  catch (err) {
    const why = err instanceof MapError ? err.message : String(err);
    appendChatLine(`could not load ${sourceName}: ${why}`, "error");
    return;
  }

  setActiveLevel(data);
  mapTitleEl.textContent = shortTitle(data.name);

  // Rebuild board if vision radius changed between levels
  const newVision = parseInt(data.vision || 5, 10);
  if (board && board.vision !== newVision) {
    board.stopped = true;
    board = initBoard(boardEl, newVision);
    board.filmstrips = filmstrips;
    if (filmstrips) startRafLoop(board);
  }

  const hasSave    = Array.isArray(data.rounds)  && data.rounds.length > 0;
  const hasCurrent = Array.isArray(data.current) && data.current.length > 0;

  if (hasSave || hasCurrent) {
    loadedSave   = data;
    roundMoves   = (data.rounds  || []).map(r => [...r]);
    currentMoves = [...(data.current || [])];
    maxGlobalPos = roundMoves.length * ROUND_LENGTH + currentMoves.length;
    renderHotbar();
    renderGlobal(maxGlobalPos);       // jump to end of save
    initChatForMap(data);
    showSaveOptions(data);
  } else {
    resetGame();
    initChatForMap(data);
    appendChatLine(`✓ Loaded "${data.name || sourceName}"`, "header");
  }
}

// Save-option button handlers
document.getElementById("opt-continue").addEventListener("click", () => {
  saveOptionsEl.hidden = true;
  // roundMoves + currentMoves already set; player queues more and presses Play
  appendChatLine(`▶ Continuing — round ${roundMoves.length + 1}`, "header");
});

document.getElementById("opt-playthrough").addEventListener("click", () => {
  saveOptionsEl.hidden = true;
  if (!loadedSave) return;
  const savedRounds  = (loadedSave.rounds  || []).map(r => [...r]);
  const savedCurrent = [...(loadedSave.current || [])];
  // Restore state so simulateToGlobal has the data it needs
  roundMoves   = savedRounds;
  currentMoves = savedCurrent;
  globalPos    = 0;
  maxGlobalPos = 0;
  renderGlobal(0);
  animatePlaythrough(savedRounds, savedCurrent);
});

document.getElementById("opt-restart").addEventListener("click", () => {
  saveOptionsEl.hidden = true;
  resetGame();
  appendChatLine("↺ Restarted from scratch.", "header");
});

// --- timeline dots (click handlers are in updateTimelineDots) -------

// Drive both the wave and the selection from the strip's own scrolling,
// rAF-throttled. Whatever dot the user scrolls onto becomes the current
// state and updates the map live.
let waveFrame = null;
timelineDotsEl.addEventListener("scroll", () => {
  if (waveFrame) return;
  waveFrame = requestAnimationFrame(() => {
    waveFrame = null;
    applyWave();
    if (playing || playingThrough) return;
    const pos = centeredPos();
    if (pos !== null && pos !== globalPos) selectPos(pos);
  });
}, { passive: true });

window.addEventListener("resize", () => {
  if (board) {
    const vision = board.vision;
    board.stopped = true;
    board = initBoard(boardEl, vision);
    board.filmstrips = filmstrips;
    if (filmstrips) startRafLoop(board);
    if (lastSnapshot) updateBoard(board, lastSnapshot.gmap);
  }
  centerCurrentDot(false);
});

// --- hotbar drag-to-reorder / drag-to-delete / drag-to-add (Pointer Events) -
//
// Two drag sources feed the same pointermove/pointerup machinery:
//  "reorder" — picked up an existing tile in the hotbar (may also delete it
//              by dropping on the controls).
//  "spawn"   — picked up an action button in the controls; dropping it on
//              the hotbar inserts a new token at that position.

let dragSource    = null;  // "reorder" | "spawn" | null
let dragIndex     = null;  // index of the tile being dragged (source: reorder)
let dragToken     = null;  // token being spawned (source: spawn)
let dragPointerId = null;
let dragging      = false; // crossed the move threshold → visually dragging
let insertAtIdx   = null;  // where the item will land (0..n)
let dropMode      = null;  // "reorder" | "delete" | null
let startX = 0, startY = 0;
let ghostEl        = null;
let pendingXY      = null;
let rafId          = null;
let suppressClick  = false; // swallow the click a finished spawn-drag leaves behind

const controlsEl = document.querySelector(".controls");
const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag

// Calculate the insertion index (0..n) based on cursor X.
function calcInsertIdx(clientX) {
  const tiles = [...hotbarEl.querySelectorAll(".tile.solid")];
  for (let i = 0; i < tiles.length; i++) {
    const { left, width } = tiles[i].getBoundingClientRect();
    if (clientX < left + width / 2) return i;
  }
  return tiles.length;
}

// Highlight the edge of the tile closest to the insertion point.
function showInsertMark(clientX) {
  const tiles = [...hotbarEl.querySelectorAll(".tile.solid")];
  tiles.forEach(t => t.classList.remove("insert-before", "insert-after"));
  insertAtIdx = calcInsertIdx(clientX);
  if (insertAtIdx < tiles.length) {
    tiles[insertAtIdx].classList.add("insert-before");
  } else if (tiles.length) {
    tiles[tiles.length - 1].classList.add("insert-after");
  }
}

function clearDragState() {
  hotbarEl.querySelectorAll(".insert-before,.insert-after,.dragging").forEach(t =>
    t.classList.remove("insert-before", "insert-after", "dragging"));
  controlsEl.classList.remove("drop-to-delete");
  if (ghostEl) { ghostEl.remove(); ghostEl = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  pendingXY     = null;
  insertAtIdx   = null;
  dragSource    = null;
  dragIndex     = null;
  dragToken     = null;
  dragPointerId = null;
  dragging      = false;
  dropMode      = null;
}

// Where is the pointer hovering — the hotbar (reorder/add) or the controls (delete)?
function hitTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  if (el.closest(".hotbar-panel")) return "reorder";
  if (dragSource === "reorder" && el.closest(".controls")) return "delete";
  return null;
}

// Floating clone of the tile being reordered.
function startGhost(tile, clientX, clientY) {
  const rect = tile.getBoundingClientRect();
  ghostEl = tile.cloneNode(true);
  ghostEl.classList.add("tile-ghost");
  ghostEl.classList.remove("dragging");
  ghostEl.style.position = "fixed";
  ghostEl.style.left   = `${rect.left}px`;
  ghostEl.style.top    = `${rect.top}px`;
  ghostEl.style.width  = `${rect.width}px`;
  ghostEl.style.height = `${rect.height}px`;
  document.body.appendChild(ghostEl);
}

// Floating preview tile for a token being dragged in from the controls —
// sized to match the real hotbar tiles, centred on the finger/cursor.
function startSpawnGhost(token, clientX, clientY) {
  const sample = hotbarEl.querySelector(".tile");
  const { width, height } = sample ? sample.getBoundingClientRect() : { width: 38, height: 38 };
  ghostEl = document.createElement("div");
  ghostEl.className = `tile ${tileKind(token)} tile-ghost`;
  ghostEl.textContent = SYMBOL[token] || token;
  ghostEl.style.position = "fixed";
  ghostEl.style.left   = `${clientX - width / 2}px`;
  ghostEl.style.top    = `${clientY - height / 2}px`;
  ghostEl.style.width  = `${width}px`;
  ghostEl.style.height = `${height}px`;
  document.body.appendChild(ghostEl);
}

function updateGhostFrame() {
  rafId = null;
  if (!pendingXY) return;
  const { x, y } = pendingXY;
  if (ghostEl) ghostEl.style.transform = `translate(${x - startX}px, ${y - startY}px) scale(1.06)`;

  dropMode = hitTarget(x, y);
  if (dropMode === "delete") {
    hotbarEl.querySelectorAll(".insert-before,.insert-after").forEach(t =>
      t.classList.remove("insert-before", "insert-after"));
    controlsEl.classList.add("drop-to-delete");
  } else {
    controlsEl.classList.remove("drop-to-delete");
    if (dropMode === "reorder") showInsertMark(x);
  }
}

function onPointerMove(e) {
  if (dragSource === null || e.pointerId !== dragPointerId) return;
  const dx = e.clientX - startX, dy = e.clientY - startY;

  if (!dragging) {
    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    dragging = true;
    if (dragSource === "reorder") {
      const tile = hotbarEl.querySelector(`.tile.solid[data-index="${dragIndex}"]`);
      if (tile) { tile.classList.add("dragging"); startGhost(tile, e.clientX, e.clientY); }
    } else if (dragSource === "spawn") {
      startSpawnGhost(dragToken, e.clientX, e.clientY);
    }
  }

  e.preventDefault();
  pendingXY = { x: e.clientX, y: e.clientY };
  if (!rafId) rafId = requestAnimationFrame(updateGhostFrame);
}

function onPointerUp(e) {
  if (dragSource === null || e.pointerId !== dragPointerId) return;
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
  document.removeEventListener("pointercancel", onPointerCancel);

  if (dragging) {
    if (dragSource === "reorder") {
      if (dropMode === "delete") {
        currentMoves.splice(dragIndex, 1);
        renderHotbar();
        resetCurrentRound();
      } else if (dropMode === "reorder") {
        let toIdx = insertAtIdx ?? calcInsertIdx(e.clientX);
        if (toIdx > dragIndex) toIdx--; // removing dragIndex shifts later items left by 1
        toIdx = Math.max(0, Math.min(toIdx, currentMoves.length - 1));
        if (toIdx !== dragIndex) {
          const [moved] = currentMoves.splice(dragIndex, 1);
          currentMoves.splice(toIdx, 0, moved);
          renderHotbar();
          resetCurrentRound();
        }
      }
    } else if (dragSource === "spawn" && dropMode === "reorder" && !playing && !playingThrough) {
      const idx = Math.max(0, Math.min(insertAtIdx ?? calcInsertIdx(e.clientX), currentMoves.length));
      currentMoves.splice(idx, 0, dragToken);
      renderHotbar();
      resetCurrentRound();
    }
    // The browser may or may not still fire a synthetic "click" after this
    // (it won't if the drop target differs from the press target). Set the
    // flag for that same-tick click to consume, then self-clear shortly after
    // so an unrelated future tap is never accidentally swallowed.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
  }
  clearDragState();
}

function onPointerCancel() {
  document.removeEventListener("pointermove", onPointerMove);
  document.removeEventListener("pointerup", onPointerUp);
  document.removeEventListener("pointercancel", onPointerCancel);
  clearDragState();
}

hotbarEl.addEventListener("pointerdown", e => {
  const tile = e.target.closest(".tile.solid");
  if (!tile || dragSource !== null) return;
  dragSource    = "reorder";
  dragIndex     = Number(tile.dataset.index);
  dragPointerId = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerCancel);
});

// Press-and-drag an action button straight into the hotbar to queue it at a
// specific position (a plain tap still appends to the end — see the click
// handler in the input-wiring section below).
document.querySelectorAll(".controls [data-token]").forEach(btn => {
  btn.addEventListener("pointerdown", e => {
    if (playing || playingThrough || dragSource !== null) return;
    dragSource    = "spawn";
    dragToken     = btn.dataset.token;
    dragPointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
  });
});

// --- chat -----------------------------------------------------------------

function appendChat(entries) {
  for (const { cls, text } of entries) {
    const div = document.createElement("div");
    div.className   = `chat-msg ${cls}`;
    div.textContent = text;
    chatBody.appendChild(div);
  }
  chatBody.scrollTop = chatBody.scrollHeight;
}
function appendChatLine(text, cls = "sep") { appendChat([{ cls, text }]); }

chatToggle.addEventListener("click", () => {
  chatPopup.hidden = !chatPopup.hidden;
  chatToggle.classList.toggle("active", !chatPopup.hidden);
});
chatClose.addEventListener("click", () => {
  chatPopup.hidden = true;
  chatToggle.classList.remove("active");
});
document.getElementById("download-log").addEventListener("click", downloadSave);

// --- tooltips ------------------------------------------------------------

function entityAt(gmap, r, c) {
  return gmap.entities.find(e => e.alive && e.row === r && e.col === c) || null;
}
function describeEntity(e) {
  const kindName = e.kind === HERO ? "Hero" : e.kind === ENEMY ? "Enemy" : "Sheep";
  const typeName = e.entityType ? ` ${e.entityType}` : "";
  const role = e.kind === HERO
    ? "Player-controlled."
    : e.kind === SHEEP ? "Clear all sheep to win. Pushed/slipped/teleported as one flock." : "Runs fixed loop; kills heroes.";
  const pattern = e.kind === HERO ? "player" : (e.loop.length ? e.loop.join(" ") : "—");
  const info = ABILITY_INFO[e.entityType];
  const abilities = info
    ? `<div class="tt-sub">e: ${info.e}</div><div class="tt-sub">r: ${info.r}</div>` +
      (info.move ? `<div class="tt-sub">${info.move}</div>` : "")
    : "";
  return `<div class="tt-title">${kindName}${typeName} '${e.letter}'</div>` +
    `<div>${role}</div><div class="tt-sub">loop: ${pattern}</div>${abilities}`;
}

// Shared by the desktop hover tooltip and the mobile tap popup.
function cellInfoHTML(cell) {
  if (!lastSnapshot) return null;
  const r = Number(cell.dataset.worldR ?? cell.dataset.r);
  const c = Number(cell.dataset.worldC ?? cell.dataset.c);
  const ent = entityAt(lastSnapshot.gmap, r, c);
  if (ent) return describeEntity(ent);
  const tid  = Number(cell.dataset.terrain);
  const info = describeTerrain(tid);
  return `<div class="tt-title">${info.name} (${tid})</div>` +
         `<div>${info.desc}</div><div class="tt-sub">[${r}][${c}]</div>`;
}

boardEl.addEventListener("mousemove", e => {
  const cell = e.target.closest(".cell");
  const html = cell && cellInfoHTML(cell);
  if (!html) { tooltip.hidden = true; return; }
  tooltip.innerHTML  = html;
  tooltip.hidden     = false;
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top  = `${e.clientY + 14}px`;
});
boardEl.addEventListener("mouseleave", () => { tooltip.hidden = true; });

// --- mobile board: tap a tile/enemy for an info popup; pinch/drag to zoom & pan
// (touch only — desktop keeps the hover tooltip above untouched).

const cellPopupOverlay = document.getElementById("cell-popup-overlay");
const cellPopupBody    = document.getElementById("cell-popup-body");
const cellPopupClose   = document.getElementById("cell-popup-close");

let cellPopupOpenedAt = 0;
function showCellPopup(html) {
  cellPopupBody.innerHTML = html;
  cellPopupOverlay.hidden = false;
  cellPopupOpenedAt = performance.now();
}
function hideCellPopup() { cellPopupOverlay.hidden = true; }
cellPopupClose.addEventListener("click", hideCellPopup);
cellPopupOverlay.addEventListener("click", e => {
  // The same touch that opens the popup can leave behind a synthetic mouse
  // "click" that lands on the now-visible overlay — ignore it for a beat so
  // the popup we just opened doesn't immediately close itself.
  if (performance.now() - cellPopupOpenedAt < 350) return;
  if (e.target === cellPopupOverlay) hideCellPopup();
});

const CAM_MIN_SCALE = 1;
const CAM_MAX_SCALE = 4;
const TAP_MOVE_THRESHOLD = 8; // px — beyond this a touch is a pan, not a tap

function applyCam(b) {
  if (!b) return;
  const { scale, x, y } = b.cam;
  b.boardEl.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

// Keep the (possibly zoomed) board from panning entirely out of view.
function clampCam(b) {
  const stage = b.boardEl.closest(".board-stage");
  if (!stage) return;
  const contentSize = b.screenDim * b.cellSize * b.cam.scale;
  const maxX = Math.max(0, (contentSize - stage.clientWidth)  / 2);
  const maxY = Math.max(0, (contentSize - stage.clientHeight) / 2);
  b.cam.x = Math.max(-maxX, Math.min(maxX, b.cam.x));
  b.cam.y = Math.max(-maxY, Math.min(maxY, b.cam.y));
}

const touchPoints   = new Map(); // pointerId -> {x,y}
let touchGestureMoved = false;
let tapStart           = null;  // {x,y} of the sole touch when it started
let panOrigin           = null; // board.cam snapshot when the pan/pinch began
let pinchStartDist      = null;
let pinchStartMid       = null;

function midpoint(pts) {
  const [a, b] = pts;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function distance(pts) {
  const [a, b] = pts;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

boardEl.addEventListener("pointerdown", e => {
  if (e.pointerType !== "touch") return;
  touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (touchPoints.size === 1) {
    touchGestureMoved = false;
    tapStart  = { x: e.clientX, y: e.clientY };
    panOrigin = board ? { ...board.cam } : null;
  } else if (touchPoints.size === 2 && board) {
    touchGestureMoved = true; // multi-touch is never a tap
    hideCellPopup();
    const pts = [...touchPoints.values()];
    pinchStartDist  = distance(pts);
    pinchStartMid   = midpoint(pts);
    panOrigin       = { ...board.cam };
  }
});

boardEl.addEventListener("pointermove", e => {
  if (e.pointerType !== "touch" || !touchPoints.has(e.pointerId) || !board) return;
  touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (touchPoints.size === 1 && panOrigin) {
    const dx = e.clientX - tapStart.x, dy = e.clientY - tapStart.y;
    if (!touchGestureMoved && Math.hypot(dx, dy) < TAP_MOVE_THRESHOLD) return;
    touchGestureMoved = true;
    e.preventDefault();
    board.cam.x = panOrigin.x + dx;
    board.cam.y = panOrigin.y + dy;
    clampCam(board);
    applyCam(board);
  } else if (touchPoints.size === 2 && pinchStartDist && panOrigin) {
    e.preventDefault();
    const pts    = [...touchPoints.values()];
    const dist   = distance(pts);
    const mid    = midpoint(pts);
    board.cam.scale = Math.max(CAM_MIN_SCALE, Math.min(CAM_MAX_SCALE,
      panOrigin.scale * (dist / pinchStartDist)));
    board.cam.x = panOrigin.x + (mid.x - pinchStartMid.x);
    board.cam.y = panOrigin.y + (mid.y - pinchStartMid.y);
    clampCam(board);
    applyCam(board);
  }
});

function touchEnd(e) {
  if (e.pointerType !== "touch" || !touchPoints.has(e.pointerId)) return;
  touchPoints.delete(e.pointerId);

  if (touchPoints.size === 0) {
    if (!touchGestureMoved && tapStart) {
      const cell = document.elementFromPoint(tapStart.x, tapStart.y)?.closest(".cell");
      const html = cell && cellInfoHTML(cell);
      if (html) showCellPopup(html);
    }
    tapStart = null; panOrigin = null; pinchStartDist = null; pinchStartMid = null;
  } else if (touchPoints.size === 1 && board) {
    // Dropped from a pinch back to one finger — re-baseline so panning
    // continues smoothly from here instead of jumping.
    const [remaining] = touchPoints.values();
    tapStart  = { ...remaining };
    panOrigin = { ...board.cam };
  }
}
boardEl.addEventListener("pointerup", touchEnd);
boardEl.addEventListener("pointercancel", touchEnd);

// --- input wiring --------------------------------------------------------

// A tap appends to the end; a press-and-drag (handled above) inserts at the
// drop position instead and sets suppressClick so this handler is a no-op.
function clickAppend(token) {
  if (suppressClick) { suppressClick = false; return; }
  appendToken(token);
}
document.querySelectorAll(".ctl[data-token]").forEach(btn => {
  btn.addEventListener("click", () => clickAppend(btn.dataset.token));
});
document.getElementById("btn-r").addEventListener("click", () => clickAppend("r"));
document.getElementById("clear").addEventListener("click", clearMoves);
document.getElementById("play").addEventListener("click", playRound);

window.addEventListener("keydown", e => {
  if (e.key === "Enter")     { e.preventDefault(); playRound(); return; }
  if (e.key === "Backspace") { e.preventDefault(); popToken();  return; }
  const token = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (token) { e.preventDefault(); appendToken(token); }
});

// --- file loading --------------------------------------------------------

const fileInput   = document.getElementById("file-input");
const dragOverlay = document.getElementById("drag-overlay");

function loadFromFile(file) {
  if (!file) return;
  if (!/\.json$/i.test(file.name) && file.type && !/json/.test(file.type)) {
    appendChatLine(`"${file.name}" is not a .json file`, "error"); return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); }
    catch (err) { appendChatLine(`invalid JSON: ${err.message}`, "error"); return; }
    loadLevelData(data, file.name);
  };
  reader.onerror = () => appendChatLine(`could not read "${file.name}"`, "error");
  reader.readAsText(file);
}

document.getElementById("pick-file").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => { loadFromFile(fileInput.files[0]); fileInput.value = ""; });

let dragDepth = 0;
function hasFiles(e) { return e.dataTransfer && [...e.dataTransfer.types].includes("Files"); }
window.addEventListener("dragenter", e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; dragOverlay.hidden = false; });
window.addEventListener("dragover",  e => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener("dragleave", e => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dragOverlay.hidden = true; });
window.addEventListener("drop", e => {
  if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; dragOverlay.hidden = true;
  loadFromFile(e.dataTransfer.files[0]);
});

// --- format help modal ---------------------------------------------------

const formatModal = document.getElementById("format-modal");
document.getElementById("format-help").addEventListener("click", () => { formatModal.hidden = false; });
formatModal.addEventListener("click", e => { if (e.target.hasAttribute("data-close")) formatModal.hidden = true; });
window.addEventListener("keydown", e => { if (e.key === "Escape") formatModal.hidden = true; }, true);

// --- you-lose overlay ----------------------------------------------------

function checkGameStatus(snap) {
  if (!youLoseCanvas) return;
  if (snap.status === "lose") {
    if (!youLosePlayed) {
      youLosePlayed = true;
      playYouLose(youLoseCanvas);
    } else {
      youLoseCanvas.hidden = false;
    }
  } else {
    youLoseCanvas.hidden = true;
  }
}

// --- boot ----------------------------------------------------------------

(async () => {
  const defaultLevel = getActiveLevel();
  mapTitleEl.textContent = shortTitle(defaultLevel.name);
  initChatForMap(defaultLevel);
  renderHotbar();

  // Initialise Rive runtime and pre-render all terrain filmstrips
  try {
    riveModule = await initRiv();
    filmstrips  = await buildFilmstrips();
  } catch (err) {
    console.error("Rive init failed — serve over http (not file://):", err);
  }

  // Build the persistent board grid
  const vision = parseInt(defaultLevel.vision || 5, 10);
  board = initBoard(boardEl, vision);
  board.filmstrips = filmstrips;
  if (filmstrips) startRafLoop(board);

  renderGlobal(0);
})();
