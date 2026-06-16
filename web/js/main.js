// UI wiring: controls → hotbar, global timeline, chat log, save/load/download.

import { simulateTo, parseMoves, setActiveLevel, getActiveLevel } from "./game.js";
import { buildGameMap, MapError } from "./mapdata.js";
import { initBoard, updateBoard, startRafLoop, buildInitialLog, buildTickEntries } from "./render.js";
import { classify, tokenLabel, ROUND_LENGTH } from "./tokens.js";
import { describeTerrain } from "./terrain.js";
import { HERO, ENEMY, SHEEP } from "./entity.js";
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

function makeTile(token, tickNo, solid, index) {
  const tile = document.createElement("div");
  tile.className = `tile ${tileKind(token)} ${solid ? "solid" : "ghost"}`;
  tile.title = `tick ${tickNo}: ${tokenLabel(token)}`;
  tile.innerHTML = `<span class="tile-tick">${tickNo}</span>${SYMBOL[token] || token}`;
  if (solid) { tile.draggable = true; tile.dataset.index = index; }
  return tile;
}

function renderHotbar() {
  hotbarEl.innerHTML = "";
  const n = currentMoves.length;
  for (let i = 0; i < ROUND_LENGTH; i++) {
    if (i < n)       hotbarEl.appendChild(makeTile(currentMoves[i],     i + 1, true,  i));
    else if (n > 0)  hotbarEl.appendChild(makeTile(currentMoves[i % n], i + 1, false, i));
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

// --- hotbar drag-to-reorder + drag-to-delete --------------------------------

let dragIndex    = null;
let insertAtIdx  = null; // where the item will land (0..n)

const controlsEl = document.querySelector(".controls");

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
  insertAtIdx = null;
  dragIndex   = null;
}

hotbarEl.addEventListener("dragstart", e => {
  const tile = e.target.closest(".tile.solid");
  if (!tile) return;
  dragIndex = Number(tile.dataset.index);
  tile.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});

hotbarEl.addEventListener("dragend", clearDragState);

hotbarEl.addEventListener("dragover", e => {
  if (dragIndex === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  controlsEl.classList.remove("drop-to-delete");
  showInsertMark(e.clientX);
});

hotbarEl.addEventListener("drop", e => {
  if (dragIndex === null) return;
  e.preventDefault();
  let toIdx = insertAtIdx ?? calcInsertIdx(e.clientX);
  // Adjust: removing item at dragIndex shifts later items left by 1
  if (toIdx > dragIndex) toIdx--;
  toIdx = Math.max(0, Math.min(toIdx, currentMoves.length - 1));
  if (toIdx !== dragIndex) {
    const [moved] = currentMoves.splice(dragIndex, 1);
    currentMoves.splice(toIdx, 0, moved);
    renderHotbar();
    resetCurrentRound();
  }
  clearDragState();
});

// Dragging a tile over the controls pads = drop to delete
controlsEl.addEventListener("dragover", e => {
  if (dragIndex === null) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  hotbarEl.querySelectorAll(".insert-before,.insert-after").forEach(t =>
    t.classList.remove("insert-before", "insert-after"));
  controlsEl.classList.add("drop-to-delete");
});

controlsEl.addEventListener("dragleave", e => {
  if (!controlsEl.contains(e.relatedTarget))
    controlsEl.classList.remove("drop-to-delete");
});

controlsEl.addEventListener("drop", e => {
  if (dragIndex === null) return;
  e.preventDefault();
  currentMoves.splice(dragIndex, 1);
  renderHotbar();
  resetCurrentRound();
  clearDragState();
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
  const role = e.kind === HERO
    ? "Player-controlled."
    : e.kind === SHEEP ? "Clear all sheep to win." : "Runs fixed loop; kills heroes.";
  const pattern = e.kind === HERO ? "player" : (e.loop.length ? e.loop.join(" ") : "—");
  return `<div class="tt-title">${kindName} '${e.letter}'</div>` +
    `<div>${role}</div><div class="tt-sub">loop: ${pattern}</div>`;
}

boardEl.addEventListener("mousemove", e => {
  const cell = e.target.closest(".cell");
  if (!cell || !lastSnapshot) { tooltip.hidden = true; return; }
  const r = Number(cell.dataset.worldR ?? cell.dataset.r);
  const c = Number(cell.dataset.worldC ?? cell.dataset.c);
  const ent = entityAt(lastSnapshot.gmap, r, c);
  tooltip.innerHTML = ent
    ? describeEntity(ent)
    : (() => {
        const tid  = Number(cell.dataset.terrain);
        const info = describeTerrain(tid);
        return `<div class="tt-title">${info.name} (${tid})</div>` +
               `<div>${info.desc}</div><div class="tt-sub">[${r}][${c}]</div>`;
      })();
  tooltip.hidden     = false;
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top  = `${e.clientY + 14}px`;
});
boardEl.addEventListener("mouseleave", () => { tooltip.hidden = true; });

// --- input wiring --------------------------------------------------------

document.querySelectorAll(".ctl[data-token]").forEach(btn => {
  btn.addEventListener("click", () => appendToken(btn.dataset.token));
});
document.getElementById("btn-r").addEventListener("click", () => appendToken("r"));
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
