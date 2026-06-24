// UI wiring: controls → hotbar, global timeline, chat log, save/load/download.

import { simulateTo, parseMoves, setActiveLevel, getActiveLevel } from "./game.js";
import { buildGameMap, MapError } from "./mapdata.js";
import { initBoard, updateBoard, startRafLoop, buildInitialLog, buildTickEntries } from "./render.js";
import { classify, tokenLabel, ROUND_LENGTH, abilitySlotOf, isMoveToken, AIM_TOKEN, LOCK_TOKEN } from "./tokens.js";
import { describeTerrain, effectOf, DIE } from "./terrain.js";
import { HERO, ENEMY, SHEEP } from "./entity.js";
import { ABILITIES, lockAfter } from "./abilities.js";
import { initRiv, buildFilmstrips, playYouLose } from "./riv.js";
import { buildShareText, computeScore } from "./share.js";

// The loaded hero's ability loadout (3 slots) — drives the ability buttons and
// the glyphs shown on queued ability tiles.
let currentAbilities = [];

// --- state ----------------------------------------------------------------

let roundMoves     = [];    // completed round move sequences (arrays of tokens)
let currentMoves   = [];    // tokens queued for the current round
let globalPos      = 0;     // current global tick position shown on timeline
let maxGlobalPos   = 0;     // furthest position reached — timeline max
let playing        = false;
let playingThrough = false;
let loadedSave     = null;  // raw JSON of a loaded save file
let lastSnapshot   = null;

// Daily pack state
let dailyPack     = null;  // loaded { start_date, name, maps[] }
let dailyDayIndex = null;  // index of map currently being played (null = not in daily mode)

// Rive board state
let board         = null;
let riveModule    = null;
let filmstrips    = null;
let youLosePlayed = false;
let endShown      = false;

const KEYMAP = { w:"w",a:"a",s:"s",d:"d","1":"1","2":"2","3":"3",".":"." };
const SYMBOL  = { w:"↑",s:"↓",a:"←",d:"→",".":"·" };

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

// Daily modal refs
const dailyModal   = document.getElementById("daily-modal");
const dailyListEl  = document.getElementById("daily-list");
const dailyTitleEl = document.getElementById("daily-modal-title");
const dailyMetaEl  = document.getElementById("daily-pack-meta");
const dailyBtn     = document.getElementById("daily-btn");

// Field guide refs
const codexOverlay = document.getElementById("codex-overlay");
const codexBody    = document.getElementById("codex-body");
const guideBtn     = document.getElementById("guide-btn");

// End overlay refs
const endOverlay  = document.getElementById("end-overlay");
const endCard     = document.getElementById("end-card");
const endEmoji    = document.getElementById("end-emoji");
const endTitle    = document.getElementById("end-title");
const endMapName  = document.getElementById("end-map-name");
const endStats    = document.getElementById("end-stats");
const endNext     = document.getElementById("end-next");
const endScore    = document.getElementById("end-score");
const endShare    = document.getElementById("end-share");
let lastShareText = "";

// Link included in every shared result.
const GAME_URL = "https://vercel.com/cillian-cookes-projects/flockwork";

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

    const dotRound = Math.floor(i / ROUND_LENGTH) + 1;
    const dotTick  = i % ROUND_LENGTH;
    if (i === 0) {
      dot.title = "Start";
    } else if (i === endPos && finalStatus !== "playing") {
      dot.title = finalStatus === "win" ? "You win!" : "You lose";
    } else if (i % ROUND_LENGTH === 0) {
      dot.title = `Round ${dotRound} begins`;
    } else {
      dot.title = `Round ${dotRound} · Tick ${dotTick}`;
    }

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
  if (k === "move") return "move";
  if (k === "wait") return "wait";
  return "ability";
}

// The glyph shown on a queued tile: ability tokens render the loadout's icon.
function tokenGlyph(token) {
  const slot = abilitySlotOf(token);
  if (slot >= 0) {
    const ab = ABILITIES[currentAbilities[slot]];
    return ab ? ab.glyph : String(slot + 1);
  }
  return SYMBOL[token] || token;
}

// Walk the queued tokens exactly as the engine would, tagging each tile with its
// role in an ability: 'cast' (the press), 'active' (armed, waiting for a
// direction), 'fire' (the move that triggers it) and 'lock' (extra action-slots
// a costly ability eats as forced waits). Lets the hotbar show how many actions
// an ability really spends.
// Tag each queued tile's role so the hotbar can show an ability as one block:
// 'cast' (with a ×cost badge), 'fire' (the direction that triggers it), 'aim'
// (still needs a direction) and 'lock' (a reserved action the cost eats).
function annotateAbilities(tokens) {
  const role = new Map();
  const cost = new Map();
  let armed = false;
  tokens.forEach((tok, i) => {
    const slot = abilitySlotOf(tok);
    const ab = slot >= 0 ? ABILITIES[currentAbilities[slot]] : null;
    if (ab) { role.set(i, "cast"); cost.set(i, ab.cost); armed = ab.directional; }
    else if (tok === AIM_TOKEN) { role.set(i, "aim"); }       // armed stays — still needs a direction
    else if (tok === LOCK_TOKEN) { role.set(i, "lock"); }
    else if (armed && isMoveToken(tok)) { role.set(i, "fire"); armed = false; }
    else { armed = false; }
  });
  return { role, cost };
}

// A non-draggable tile role (ability blocks shouldn't be reordered piecemeal).
function isBlockRole(role) {
  return role === "cast" || role === "fire" || role === "aim" || role === "lock";
}

function makeTile(token, tickNo, solid, index, info) {
  const tile = document.createElement("div");
  const role = info.role.get(index);
  const classes = ["tile", tileKind(token), solid ? "solid" : "ghost"];
  const slot = abilitySlotOf(token);
  const ab = slot >= 0 ? ABILITIES[currentAbilities[slot]] : null;
  let title = `tick ${tickNo}: ${ab ? ab.name : tokenLabel(token)}`;
  let badge = "";
  let glyph = tokenGlyph(token);

  if (role === "cast") {
    classes.push("ability-cast");
    const c = info.cost.get(index) || 1;
    badge = `<span class="tile-cost-badge">×${c}</span>`;
    if (c >= 3) classes.push("ability-costly");
    title += ` — costs ${c} action${c > 1 ? "s" : ""}`;
  } else if (role === "aim") {
    classes.push("ability-aim");
    glyph = "✛";
    badge = `<span class="tile-aim-hint">aim</span>`;
    title = `tick ${tickNo}: pick a direction (W/A/S/D) to aim the ability`;
  } else if (role === "fire") {
    classes.push("ability-fire");
    title += " — the ability fires this way";
  } else if (role === "lock") {
    classes.push("ability-lock");
    glyph = "🔒";
    title = `tick ${tickNo}: locked — spent powering the ability`;
  }

  tile.className = classes.join(" ");
  tile.title = title;
  tile.innerHTML = `<span class="tile-tick">${tickNo}</span>${glyph}${badge}`;
  // Only plain moves are draggable; ability blocks move as a unit (or not).
  if (solid && !isBlockRole(role)) tile.dataset.index = index;
  return tile;
}

function renderHotbar() {
  hotbarEl.innerHTML = "";
  const n = currentMoves.length;
  if (n) {
    // The round fills 10 ticks by repeating your queued actions; the repeats are
    // shown as transparent "ghost" tiles. Ability blocks (cast + direction +
    // lock) repeat whole, so a multi-action ability still reads as one unit.
    const displayed = Array.from({ length: ROUND_LENGTH }, (_, i) => currentMoves[i % n]);
    const info = annotateAbilities(displayed);
    for (let i = 0; i < ROUND_LENGTH; i++) {
      hotbarEl.appendChild(makeTile(displayed[i], i + 1, i < n, i, info));
    }
  } else {
    const hint = document.createElement("span");
    hint.className = "hotbar-empty";
    hint.textContent = "Tap move buttons to herd — push sheep into hazards · Enter to play";
    hotbarEl.appendChild(hint);
  }
  refreshLogJSON();
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
  if (playing || playingThrough || !lastSnapshot) return;
  const slot = abilitySlotOf(token);

  if (slot >= 0) {
    // Pressing an ability reserves its whole footprint up-front: the cast, a
    // slot awaiting a direction (if directional), and lock slots for its cost.
    const ab = ABILITIES[currentAbilities[slot]];
    if (!ab) return; // empty slot button
    const footprint = 1 + (ab.directional ? 1 : 0) + lockAfter(ab);
    if (currentMoves.length + footprint > ROUND_LENGTH) return; // not enough room this round
    currentMoves.push(token);
    if (ab.directional) currentMoves.push(AIM_TOKEN);
    for (let k = 0; k < lockAfter(ab); k++) currentMoves.push(LOCK_TOKEN);
  } else if (isMoveToken(token)) {
    // A direction fills the earliest ability that's awaiting one; otherwise it's
    // a normal move appended at the end.
    const aimIdx = currentMoves.indexOf(AIM_TOKEN);
    if (aimIdx >= 0) currentMoves[aimIdx] = token;
    else if (currentMoves.length < ROUND_LENGTH) currentMoves.push(token);
    else return;
  } else {
    // wait (or anything non-directional) just appends after whatever's queued
    if (currentMoves.length >= ROUND_LENGTH) return;
    currentMoves.push(token);
  }

  renderHotbar();
  resetCurrentRound();
}

// Backspace removes a whole ability block (cast + its direction/aim + locks) at
// once, or a single plain token otherwise.
function popToken() {
  if (playing || playingThrough || !currentMoves.length) return;
  let i = currentMoves.length - 1;
  const tail = currentMoves[i];
  if (tail === LOCK_TOKEN || tail === AIM_TOKEN) {
    while (i >= 0 && currentMoves[i] === LOCK_TOKEN) i--;        // trailing locks
    if (i >= 0 && currentMoves[i] === AIM_TOKEN) i--;            // unfilled direction
    else if (i >= 0 && isMoveToken(currentMoves[i])) i--;        // the firing direction
    if (i >= 0 && abilitySlotOf(currentMoves[i]) >= 0) i--;      // the cast
    currentMoves.length = i + 1;
  } else {
    currentMoves.pop();
  }
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

// Entities that died on a lava/void tile between two snapshots (matched by their
// stable creation index), so playback can flash them on the hazard before they
// vanish — making "pushed into the lava" read clearly.
function hazardDeaths(prevSnap, curSnap) {
  if (!prevSnap || !curSnap) return [];
  const prev = prevSnap.gmap.entities, cur = curSnap.gmap.entities;
  const out = [];
  for (let i = 0; i < Math.min(prev.length, cur.length); i++) {
    const p = prev[i], c = cur[i];
    if (p.alive && !c.alive && effectOf(curSnap.gmap.terrain[c.row]?.[c.col]) === DIE) {
      out.push({ row: c.row, col: c.col, letter: c.letter, kind: c.kind, entityType: c.entityType });
    }
  }
  return out;
}

async function playRound() {
  if (playing || playingThrough) return;
  if (currentMoves.includes(AIM_TOKEN)) {
    appendChatLine("! finish your ability — pick a direction (W/A/S/D) to aim it", "error");
    return;
  }
  try { parseMoves(currentMoves.join("")); }
  catch (err) { appendChatLine(`! ${err.message}`, "error"); return; }

  playing = true;
  setControlsDisabled(true);

  for (let t = 1; t <= ROUND_LENGTH; t++) {
    const pos = roundMoves.length * ROUND_LENGTH + t;
    maxGlobalPos = pos;
    const prevSnap = lastSnapshot;
    const snap = renderGlobal(pos);

    // Highlight the tile slot that is executing this tick.
    const hotbarTiles = [...hotbarEl.children];
    hotbarTiles.forEach((tile, i) => tile.classList.toggle("playing", i === t - 1));

    // If anything fell into lava/void this tick, flash it on the hazard (with the
    // pusher already on its old tile) before it vanishes.
    const dying = hazardDeaths(prevSnap, snap);
    if (dying.length && board) {
      updateBoard(board, snap.gmap, dying);
      await delay(300);
      updateBoard(board, snap.gmap);
      await delay(220);
    } else {
      await delay(500);
    }
    if (snap.status !== "playing") {
      hotbarTiles.forEach(tile => tile.classList.remove("playing"));
      playing = false;
      setControlsDisabled(false);
      return;
    }
  }

  // Bank the completed round; keep current position for review.
  hotbarEl.querySelectorAll(".tile.playing").forEach(t => t.classList.remove("playing"));
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
    for (let t = 1; t <= ROUND_LENGTH; t++) {
      if (!playingThrough) { setControlsDisabled(false); return; }
      const pos    = r * ROUND_LENGTH + t;
      maxGlobalPos = pos;
      const snap   = renderGlobal(pos);
      await delay(500);
      if (snap.status !== "playing") break;
    }
  }

  if (savedCurrent.length && playingThrough) {
    const r = savedRounds.length;
    for (let t = 1; t <= savedCurrent.length; t++) {
      if (!playingThrough) break;
      const pos    = r * ROUND_LENGTH + t;
      maxGlobalPos = pos;
      renderGlobal(pos);
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
  const blob = new Blob([formatSaveJSON(data)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${(data.name || "save").replace(/[^a-z0-9]/gi, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- daily maps -----------------------------------------------------------

function isDailyPack(data) {
  return data && typeof data.start_date === "string" && Array.isArray(data.maps) && data.maps.length > 0;
}

function dailyPackKey(pack) {
  return `flockwork_daily_${pack.name || "pack"}`;
}

function getDailyCompletions(pack) {
  try { return JSON.parse(localStorage.getItem(dailyPackKey(pack)) || "[]"); }
  catch { return []; }
}

function markDailyComplete(pack, idx) {
  const done = getDailyCompletions(pack);
  if (!done.includes(idx)) {
    done.push(idx);
    localStorage.setItem(dailyPackKey(pack), JSON.stringify(done));
    // Refresh the modal list in the background so it reflects the win next time it's opened
  }
}

function dailyAvailableCount(pack) {
  const [sy, sm, sd] = pack.start_date.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const [ty, tm, td] = new Date().toISOString().slice(0, 10).split("-").map(Number);
  const todayUTC = Date.UTC(ty, tm - 1, td);
  const daysSince = Math.floor((todayUTC - start) / 86400000);
  return Math.min(pack.maps.length, Math.max(0, daysSince + 1));
}

function dailyTodayIndex(pack) {
  const [sy, sm, sd] = pack.start_date.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const [ty, tm, td] = new Date().toISOString().slice(0, 10).split("-").map(Number);
  const todayUTC = Date.UTC(ty, tm - 1, td);
  return Math.floor((todayUTC - start) / 86400000);
}

function renderDailyList() {
  if (!dailyPack) return;
  const available   = dailyAvailableCount(dailyPack);
  const completions = getDailyCompletions(dailyPack);
  const todayIdx    = dailyTodayIndex(dailyPack);

  dailyListEl.innerHTML = "";
  dailyPack.maps.forEach((map, idx) => {
    const unlocked = idx < available;
    const isToday  = idx === todayIdx && idx < dailyPack.maps.length;
    const done     = completions.includes(idx);

    const row = document.createElement("div");
    row.className = ["daily-row", unlocked ? "unlocked" : "locked", isToday ? "today" : ""].filter(Boolean).join(" ");

    const num = document.createElement("div");
    num.className = "daily-day-num";
    num.textContent = `Day ${idx + 1}`;

    const name = document.createElement("div");
    name.className = "daily-day-name";
    name.textContent = map.name || `Day ${idx + 1}`;

    if (isToday) {
      const b = document.createElement("span");
      b.className = "daily-today-badge";
      b.textContent = "Today";
      name.appendChild(b);
    }
    if (done) {
      const b = document.createElement("span");
      b.className = "daily-done-badge";
      b.textContent = "✓";
      name.appendChild(b);
    }

    row.appendChild(num);
    row.appendChild(name);

    if (unlocked) {
      const btn = document.createElement("button");
      btn.className = "daily-play-btn" + (done ? " replay" : "");
      btn.textContent = done ? "Replay" : "Play";
      btn.addEventListener("click", () => playDailyDay(idx));
      row.appendChild(btn);
    } else {
      const lock = document.createElement("span");
      lock.className = "daily-lock";
      lock.textContent = "🔒";
      row.appendChild(lock);
    }

    dailyListEl.appendChild(row);
  });
}

function showDailyModal() {
  if (!dailyPack) {
    dailyTitleEl.textContent = "📅 Daily Maps";
    dailyMetaEl.textContent  = "";
    dailyListEl.innerHTML    = '<p class="daily-empty">Drop a daily pack <code>.json</code> file onto the page to unlock daily challenges.</p>';
    dailyModal.hidden = false;
    return;
  }
  const available = dailyAvailableCount(dailyPack);
  dailyTitleEl.textContent = `📅 ${dailyPack.name || "Daily Maps"}`;
  dailyMetaEl.textContent  = `${available} of ${dailyPack.maps.length} day${dailyPack.maps.length !== 1 ? "s" : ""} unlocked`;
  renderDailyList();
  dailyModal.hidden = false;
}

async function playDailyDay(idx) {
  if (!dailyPack) return;
  dailyModal.hidden = true;

  // Animate the current map away before loading the next one
  if (lastSnapshot && board && board.animCells.size > 0) {
    // Reverse all tile animations at 2.5× speed (visible fade ≈ 200 ms, gone by 400 ms)
    for (const anim of board.animCells.values()) {
      anim.target = 0;
      anim.speed  = 2.5;
    }
    // Clear entity glyphs so they don't float over the receding tiles
    for (let i = 0; i < board.screenDim; i++) {
      for (let j = 0; j < board.screenDim; j++) {
        const c = board.cells[i][j];
        c.div.classList.remove('ent-hero', 'ent-enemy', 'ent-sheep', 'blocked', 'barrier', 'charging');
        delete c.div.dataset.entity;
        c.inner.textContent = '';
        c.inner.className   = 'cell-inner';
      }
    }
    // Wait for tiles to finish fading + half-second pause
    await new Promise(r => setTimeout(r, 550));
    board.animCells.clear();
  }

  loadLevelData(dailyPack.maps[idx], `Daily Day ${idx + 1}`, idx);
}

function loadDailyPack(pack, sourceName) {
  dailyPack = pack;
  dailyBtn.classList.add("has-pack");
  showDailyModal();
}

dailyBtn.addEventListener("click", showDailyModal);
document.getElementById("daily-close").addEventListener("click", () => { dailyModal.hidden = true; });
document.getElementById("daily-backdrop").addEventListener("click", () => { dailyModal.hidden = true; });

// --- load / save handling -------------------------------------------------

function initChatForMap() {
  refreshLogJSON();
}

function resetGame() {
  roundMoves    = [];
  currentMoves  = [];
  globalPos     = 0;
  maxGlobalPos  = 0;
  loadedSave    = null;
  youLosePlayed = false;
  endShown      = false;
  if (youLoseCanvas) youLoseCanvas.hidden = true;
  endOverlay.hidden = true;
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

// Paint the three ability buttons from the loaded hero's loadout. Unused slots
// stay visible as empty placeholders, so it's clear abilities can go there.
function updateAbilityButtons() {
  for (let i = 0; i < 3; i++) {
    const btn = document.getElementById(`ability-${i + 1}`);
    if (!btn) continue;
    const ab = ABILITIES[currentAbilities[i]];
    const span = btn.querySelector("span");
    btn.hidden = false;
    if (ab) {
      btn.classList.remove("ability-empty");
      btn.disabled = false;
      if (span) span.textContent = ab.glyph;
      btn.title = `${ab.name} — ${ab.desc}`;
    } else {
      btn.classList.add("ability-empty");
      btn.disabled = true;
      if (span) span.textContent = "";
      btn.title = `Ability slot ${i + 1} — empty (equip an ability here)`;
    }
  }
}

function loadLevelData(data, sourceName = "custom map", dailyCtx = null) {
  if (playing || playingThrough) return;
  dailyDayIndex = dailyCtx;
  hideEndOverlay();
  try { buildGameMap(data); }
  catch (err) {
    const why = err instanceof MapError ? err.message : String(err);
    appendChatLine(`could not load ${sourceName}: ${why}`, "error");
    return;
  }

  setActiveLevel(data);
  mapTitleEl.textContent = shortTitle(data.name);

  // Read the hero's loadout so the ability buttons + tiles show the right icons.
  const heroEnt = buildGameMap(data).entities.find(e => e.kind === HERO);
  currentAbilities = heroEnt ? heroEnt.abilities.slice(0, 3) : [];
  updateAbilityButtons();

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
  }
}

// Save-option button handlers
document.getElementById("opt-continue").addEventListener("click", () => {
  saveOptionsEl.hidden = true;
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
  ghostEl.textContent = tokenGlyph(token);
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
    clearTimeout(holdTimer); // a real drag started — not a hold
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
  clearTimeout(holdTimer);
  if (holdActive) { hideHoldExplain(); clearDragState(); return; } // a hold, not a tap/drag

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
  clearTimeout(holdTimer);
  hideHoldExplain();
  clearDragState();
}

hotbarEl.addEventListener("pointerdown", e => {
  const tile = e.target.closest(".tile.solid");
  if (!tile || dragSource !== null) return;
  if (tile.dataset.index === undefined) return; // ability-block tiles aren't draggable
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
    // Press and hold to read what the button does (until you let go).
    holdBtn = btn;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(showHoldExplain, 450);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
  });
});

// --- hold-to-explain ------------------------------------------------------

let holdTimer = null, holdActive = false, holdBtn = null;
const holdPopup = document.createElement("div");
holdPopup.className = "hold-explain";
holdPopup.hidden = true;
document.body.appendChild(holdPopup);

function describeAction(token) {
  const slot = abilitySlotOf(token);
  if (slot >= 0) {
    const ab = ABILITIES[currentAbilities[slot]];
    return ab
      ? `<b>${ab.name}</b> · costs ${ab.cost} action${ab.cost > 1 ? "s" : ""}<br>${ab.desc}`
      : `<b>Ability slot ${slot + 1}</b><br>Empty — an ability can be equipped here.`;
  }
  if (isMoveToken(token)) {
    const lbl = { w: "up", a: "left", s: "down", d: "right" }[token];
    return `<b>Move ${lbl}</b><br>Step one tile. Walk into a sheep to push it — shove it into lava or void to kill it.`;
  }
  if (token === WAIT_TOKEN) return `<b>Wait</b><br>Hold position for one tick.`;
  return tokenLabel(token);
}

function showHoldExplain() {
  if (dragging || !holdBtn) return;
  holdActive = true;
  holdPopup.innerHTML = describeAction(holdBtn.dataset.token);
  holdPopup.hidden = false;
  const r = holdBtn.getBoundingClientRect();
  holdPopup.style.left = `${Math.round(r.left + r.width / 2)}px`;
  holdPopup.style.top = `${Math.round(r.top - 8)}px`;
}

function hideHoldExplain() {
  if (holdActive) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
  holdActive = false;
  holdPopup.hidden = true;
  holdBtn = null;
}

// --- chat / JSON log ------------------------------------------------------

// Tokenise raw JSON and wrap keys/strings in colour spans.
function highlightJSON(raw) {
  let out = '', i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') {
      // Walk to the closing quote, respecting backslash escapes.
      let j = i + 1;
      while (j < raw.length && raw[j] !== '"') { if (raw[j] === '\\') j++; j++; }
      const str = raw.slice(i, j + 1);
      // Peek past whitespace — colon next means this is a key.
      let k = j + 1;
      while (k < raw.length && (raw[k] === ' ' || raw[k] === '\n' || raw[k] === '\t')) k++;
      const esc = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      out += raw[k] === ':' ? `<span class="j-key">${esc}</span>` : `<span class="j-str">${esc}</span>`;
      i = j + 1;
    } else {
      out += ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
      i++;
    }
  }
  return out;
}

// Format the grid so every row is on one line and all columns align.
// The column width is the widest cell (in JSON notation) across the whole grid,
// so the spacing is uniform. Matches the hand-written codebase example format.
function formatGridRows(grid) {
  if (!grid || !grid.length) return [];
  let colMax = 0;
  for (const row of grid)
    for (const cell of row)
      colMax = Math.max(colMax, JSON.stringify(cell).length);
  return grid.map(row => {
    const cells = row.map(c => JSON.stringify(c));
    return '[' + cells.map((c, i) =>
      i < cells.length - 1
        ? c + ',' + ' '.repeat(colMax - c.length + 1)
        : c + ' '.repeat(colMax - c.length)
    ).join('') + ']';
  });
}

function formatSaveJSON(data) {
  const gridRows = formatGridRows(data.grid || []);
  const scripts  = data.scripts || {};
  const rounds   = data.rounds  || [];
  const current  = data.current || [];

  const scriptStr = Object.keys(scripts).length === 0
    ? '{}'
    : '{ ' + Object.entries(scripts)
        .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        .join(', ') + ' }';

  const lines = ['{', `  "name": ${JSON.stringify(data.name ?? '')},`];

  if (gridRows.length === 0) {
    lines.push('  "grid": [],');
  } else {
    lines.push('  "grid": [');
    gridRows.forEach((r, i) => lines.push(`    ${r}${i < gridRows.length - 1 ? ',' : ''}`));
    lines.push('  ],');
  }

  lines.push(`  "scripts": ${scriptStr},`);

  if (rounds.length === 0) {
    lines.push('  "rounds": [],');
  } else {
    lines.push('  "rounds": [');
    rounds.forEach((r, i) => lines.push(`    ${JSON.stringify(r)}${i < rounds.length - 1 ? ',' : ''}`));
    lines.push('  ],');
  }

  lines.push(`  "current": ${JSON.stringify(current)}`);
  lines.push('}');
  return lines.join('\n');
}

function refreshLogJSON() {
  const raw = formatSaveJSON(buildSaveData());
  chatBody.innerHTML = `<pre class="log-json">${highlightJSON(raw)}</pre>`;
}

function showChatError(text) {
  const div = document.createElement("div");
  div.className = "log-error";
  div.textContent = text;
  chatBody.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

function appendChat(entries) {
  for (const { cls, text } of entries) {
    if (cls === "error") showChatError(text);
  }
}
function appendChatLine(text, cls = "sep") {
  if (cls === "error") showChatError(text);
}

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
    ? "Player-controlled. Walk into an entity to push it."
    : e.kind === SHEEP ? "Herd into a hazard to clear it. Moves as one flock."
    : e.heavy ? "A heavy block — can't be pushed."
    : e.lethalToSheep && e.lethalToHero ? "Kills the hero AND sheep on contact."
    : e.lethalToHero ? "Kills the hero on contact." : "Harmless on contact.";
  const pattern = e.kind === HERO ? "player" : (e.loop.length ? e.loop.join(" ") : "—");
  const abilities = (e.kind === HERO && e.abilities && e.abilities.length)
    ? e.abilities.filter(Boolean).map((id, i) => {
        const ab = ABILITIES[id];
        return ab ? `<div class="tt-sub">${i + 1}: ${ab.glyph} ${ab.name}</div>` : "";
      }).join("")
    : "";
  return `<div class="tt-title">${kindName} '${e.letter}'</div>` +
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
    if (isDailyPack(data)) { loadDailyPack(data, file.name); return; }
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

// --- field guide codex -------------------------------------------------------

const CODEX_ENTITY_COLOR = {
  knight: '#2c4d8a', rogue: '#2f9e44', mage: '#8e5ad4',
  brute: '#c2530c', hunter: '#d4a017',
};
const CODEX_KIND_COLOR = { [HERO]: '#2c5de5', [ENEMY]: '#d43030', [SHEEP]: '#c8c0a8' };
const CODEX_TERRAIN_COLOR = {
  0:'#3a3530', 1:'#7ec87c', 2:'#b0a89e', 3:'#e86040', 4:'#58b8d8',
  5:'#e8c840', 6:'#8e5ad4', 7:'#3ab8a8', 8:'#e89a40', 9:'#e068a0',
  10:'#5ad0e0', 11:'#f0d878', 12:'#d83ad8', 13:'#ff5ab0',
  14:'#c0392b', 15:'#e67e22', 16:'#8a97b0', 17:'#8a97b0', 18:'#8a97b0', 19:'#8a97b0',
  20:'#7fae7f', 21:'#7fae7f', 22:'#7fae7f', 23:'#7fae7f', 24:'#f1c40f', 25:'#4a4a55',
  91:'#9c6b3f', 92:'#9c6b3f', 93:'#9c6b3f', 94:'#9c6b3f', 95:'#9c6b3f',
};

function buildCodexHTML(gmap) {
  if (!gmap) {
    return '<p class="codex-empty">Load a map to see its field guide.</p>';
  }

  let html = '';

  // Entities — heroes first, then enemies, then sheep.
  const kindOrder = { [HERO]: 0, [ENEMY]: 1, [SHEEP]: 2 };
  const entities = [...gmap.entities].sort((a, b) =>
    (kindOrder[a.kind] ?? 3) - (kindOrder[b.kind] ?? 3));

  if (entities.length) {
    html += '<div class="codex-section"><div class="codex-section-label">Entities on this map</div>';
    for (const e of entities) {
      const kindName = e.kind === HERO ? 'Hero' : e.kind === ENEMY ? 'Enemy' : 'Sheep';
      const enemyKind = e.heavy ? 'Boulder'
        : e.lethalToSheep && e.lethalToHero ? 'Wolf'
        : e.lethalToHero ? 'Guard' : 'Enemy';
      const typeName = e.kind === ENEMY ? enemyKind : '';
      const color     = CODEX_KIND_COLOR[e.kind] ?? '#888';
      const textColor = e.kind === SHEEP ? '#3a3530' : '#fff';
      const role = e.kind === HERO
        ? 'Player-controlled. Walk into an entity to push it; queue moves and press Play.'
        : e.kind === SHEEP
          ? 'Herd into lava or void to clear it. Moves as a flock and can be pushed.'
          : e.heavy ? 'A heavy block — it cannot be pushed.'
          : e.lethalToSheep && e.lethalToHero ? 'Runs a fixed loop. Kills the hero AND eats sheep on contact.'
          : e.lethalToHero ? 'Runs a fixed loop. Kills your hero on contact.'
          : 'Runs a fixed loop. Harmless on contact.';
      const loop = e.kind !== HERO && e.loop.length
        ? `<div class="codex-sub">Loop: <b>${e.loop.join(' ')}</b></div>` : '';
      const abilities = (e.kind === HERO && e.abilities && e.abilities.length)
        ? e.abilities.filter(Boolean).map((id, i) => {
            const ab = ABILITIES[id];
            return ab ? `<div class="codex-sub"><b>${i + 1}</b> ${ab.glyph} ${ab.name} — ${ab.desc}</div>` : '';
          }).join('')
        : '';
      const kindTag = typeName ? `<span class="codex-tag">${kindName}</span>` : '';
      const displayName = typeName || kindName;

      html += `<div class="codex-item">
        <div class="codex-badge" style="background:${color};color:${textColor}">${e.letter}</div>
        <div class="codex-content">
          <div class="codex-name">${displayName}${kindTag}</div>
          <div class="codex-desc">${role}</div>
          ${loop}${abilities}
        </div>
      </div>`;
    }
    html += '</div>';
  }

  // Terrain — all unique IDs present, sorted by ID.
  const counts = new Map();
  for (const row of gmap.terrain)
    for (const tid of row) counts.set(tid, (counts.get(tid) || 0) + 1);

  const terrainEntries = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  if (terrainEntries.length) {
    html += '<div class="codex-section"><div class="codex-section-label">Terrain on this map</div>';
    for (const [tid, count] of terrainEntries) {
      const info  = describeTerrain(tid);
      const color = CODEX_TERRAIN_COLOR[tid] ?? CODEX_TERRAIN_COLOR[1];
      html += `<div class="codex-item">
        <div class="codex-swatch" style="background:${color}"></div>
        <div class="codex-content">
          <div class="codex-name">${info.name}<span class="codex-tag">${count} tile${count !== 1 ? 's' : ''}</span></div>
          <div class="codex-desc">${info.desc}</div>
        </div>
      </div>`;
    }
    html += '</div>';
  }

  return html || '<p class="codex-empty">Nothing to show.</p>';
}

function openCodex()  {
  codexBody.innerHTML = buildCodexHTML(lastSnapshot?.gmap ?? null);
  codexOverlay.hidden = false;
}
function closeCodex() { codexOverlay.hidden = true; }

guideBtn.addEventListener("click", openCodex);
document.getElementById("codex-close").addEventListener("click", closeCodex);
codexOverlay.addEventListener("click", e => { if (e.target === codexOverlay) closeCodex(); });

// --- format help modal ---------------------------------------------------

const formatModal = document.getElementById("format-modal");
document.getElementById("format-help").addEventListener("click", () => { formatModal.hidden = false; });
formatModal.addEventListener("click", e => { if (e.target.hasAttribute("data-close")) formatModal.hidden = true; });
window.addEventListener("keydown", e => { if (e.key === "Escape") { formatModal.hidden = true; dailyModal.hidden = true; closeCodex(); } }, true);

// --- end overlay (win / lose) ---------------------------------------------

function gameStats() {
  // Total completed ticks = maxGlobalPos (each tick is one queued action)
  const ticks  = maxGlobalPos;
  const rounds = Math.floor(ticks / ROUND_LENGTH);
  const extra  = ticks % ROUND_LENGTH;
  const actions = roundMoves.reduce((s, r) => s + r.length, 0) +
                  (extra > 0 ? currentMoves.slice(0, extra).length : 0);
  return { ticks, rounds, extra, actions };
}

function showEndOverlay(status) {
  if (endShown) return;
  endShown = true;

  const isWin = status === "win";
  const level = getActiveLevel();
  const { rounds, extra, ticks } = gameStats();

  // Trigger the lose canvas animation in the background
  if (!isWin && youLoseCanvas && !youLosePlayed) {
    youLosePlayed = true;
    youLoseCanvas.hidden = false;
    playYouLose(youLoseCanvas);
  }

  endCard.className = `end-card ${isWin ? "win" : "lose"}`;
  endEmoji.textContent  = isWin ? "🎉" : "💀";
  endTitle.textContent  = isWin ? "YOU WIN!" : "YOU LOSE";
  endMapName.textContent = shortTitle(level.name, 30);

  // Win: show a score + prep the Wordle-style share. Lose: just the verdict.
  if (isWin) {
    const moves = ticks;
    const score = computeScore(lastSnapshot.gmap, moves);
    const par = level.par;
    const day = (dailyPack && dailyDayIndex !== null) ? dailyDayIndex + 1 : null;
    endScore.textContent = `⭐ ${score}  ·  ${moves} move${moves !== 1 ? "s" : ""}${par ? `  ·  best ${par}` : ""}`;
    endScore.hidden = false;
    endStats.textContent = par && moves <= par ? "Optimal solve! 🏆" : "Solved!";
    lastShareText = buildShareText({
      day, moves, score, par,
      initialGmap: buildGameMap(getActiveLevel()),
      url: GAME_URL,
    });
    endShare.hidden = false;
  } else {
    const roundStr = rounds === 1 ? "1 round" : `${rounds} rounds`;
    const extraStr = extra > 0 ? ` + ${extra} tick${extra !== 1 ? "s" : ""}` : "";
    endStats.textContent = `Eliminated in ${roundStr}${extraStr}`;
    endScore.hidden = true;
    endShare.hidden = true;
  }

  // "Next Day" button — only on win in daily mode with an available next map
  const nextIdx = dailyDayIndex !== null ? dailyDayIndex + 1 : -1;
  const nextAvail = dailyPack && nextIdx < dailyAvailableCount(dailyPack);
  endNext.hidden = !(isWin && nextAvail);

  if (isWin && dailyPack && dailyDayIndex !== null) {
    markDailyComplete(dailyPack, dailyDayIndex);
  }

  endOverlay.hidden = false;
}

// Share via the native sheet on mobile, else copy to the clipboard.
async function shareResult() {
  if (!lastShareText) return;
  if (navigator.share) {
    try { await navigator.share({ text: lastShareText }); return; } catch { /* cancelled */ }
  }
  try {
    await navigator.clipboard.writeText(lastShareText);
    const old = endShare.textContent;
    endShare.textContent = "✓ Copied!";
    setTimeout(() => { endShare.textContent = old; }, 1500);
  } catch {
    appendChatLine("Couldn't copy — here's your result:\n" + lastShareText, "header");
  }
}
endShare.addEventListener("click", shareResult);

function hideEndOverlay() {
  endOverlay.hidden = true;
  endShown = false;
  if (youLoseCanvas) youLoseCanvas.hidden = true;
}

function checkGameStatus(snap) {
  if (snap.status !== "playing" && !endShown) {
    showEndOverlay(snap.status);
  }
  if (snap.status === "playing") {
    // Scrubbing back to before the game end — hide the overlay
    hideEndOverlay();
  }
}

// End overlay button wiring
document.getElementById("end-retry").addEventListener("click", () => {
  hideEndOverlay();
  resetGame();
  initChatForMap(getActiveLevel());
  appendChatLine("↺ Retrying…", "header");
});

endNext.addEventListener("click", () => {
  hideEndOverlay();
  if (dailyPack && dailyDayIndex !== null) playDailyDay(dailyDayIndex + 1);
});

document.getElementById("end-watch").addEventListener("click", () => {
  hideEndOverlay();
  const savedRounds  = roundMoves.map(r => [...r]);
  const savedCurrent = [...currentMoves];
  roundMoves   = savedRounds;
  currentMoves = savedCurrent;
  globalPos    = 0;
  maxGlobalPos = 0;
  renderGlobal(0);
  animatePlaythrough(savedRounds, savedCurrent);
});

document.getElementById("end-download").addEventListener("click", () => {
  downloadSave();
});

document.getElementById("end-copy").addEventListener("click", async () => {
  const json = formatSaveJSON(buildSaveData());
  try {
    await navigator.clipboard.writeText(json);
    const btn = document.getElementById("end-copy");
    const orig = btn.textContent;
    btn.textContent = "✓ Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1800);
  } catch {
    // Clipboard not available — fall back to download
    downloadSave();
  }
});

// --- boot ----------------------------------------------------------------

(async () => {
  renderHotbar();

  // Initialise Rive runtime and pre-render all terrain filmstrips
  try {
    riveModule = await initRiv();
    filmstrips  = await buildFilmstrips();
  } catch (err) {
    console.error("Rive init failed — serve over http (not file://):", err);
  }

  // Build the persistent board grid (vision 5 default; resized when a map loads)
  board = initBoard(boardEl, 5);
  board.filmstrips = filmstrips;
  if (filmstrips) startRafLoop(board);

  // Auto-load today's daily map from the bundled pack
  try {
    const res = await fetch("./maps/daily_pack.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pack = await res.json();
    if (isDailyPack(pack)) {
      dailyPack = pack;
      dailyBtn.classList.add("has-pack");
      const available = dailyAvailableCount(pack);
      if (available > 0) {
        const idx = Math.min(Math.max(0, dailyTodayIndex(pack)), available - 1);
        loadLevelData(pack.maps[idx], `Daily Day ${idx + 1}`, idx);
      }
    }
  } catch {
    appendChatLine("📅 Drop a daily pack or map .json to get started.", "header");
  }
})();
