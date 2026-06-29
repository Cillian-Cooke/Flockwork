// Rive runtime loader, filmstrip pre-renderer, and You Lose overlay player.

// Pre-render resolution per frame. High enough that tiles stay crisp when scaled
// up to a cell on a hi-DPI screen (the riv is vector, but a filmstrip is a bitmap
// cache — so we cache it large). FRAMES is the sampling rate for the animation;
// most tiles are static (one frame shown), so 24 keeps memory reasonable.
const TILE  = 192;
const FRAMES = 24;

// terrain ID → .riv filename
export const TERRAIN_RIV = {
  1: 'Grass.riv',
  2: 'Wall.riv',           // wall (Trees.riv is now free for another tile)
  3: 'Lava.riv',
  4: 'Ice.riv',
  5: 'mud.riv',          // skip — new mud animation
  6: 'Portal.riv',
  8: 'Water.riv',
  16: 'conveyor belt.riv', // conveyor up
  17: 'conveyor belt.riv', // conveyor right (the belt's base orientation)
  18: 'conveyor belt.riv', // conveyor down
  19: 'conveyor belt.riv', // conveyor left
  24: 'Pressure Plate.riv', // pressure plate
  25: 'Locked tile.riv',    // gate — frame 0 = open (grass), end = locked
};

// Tiles that keep animating AFTER they've drawn in. Everything else holds its
// grown frame (stationary). Each entry loops the frames between `lo` and `hi`
// (fractions of the animation, 0..1); `pingpong` oscillates back and forth for a
// gentle pulse instead of a hard loop-restart. (Gates animate by state regardless.)
//   id -> { lo, hi, pingpong }
export const ANIM_TERRAIN = new Map([
  [3, { lo: 0.6, hi: 1.0, pingpong: true }], // lava simmers between 60% and 100%
]);

// UI action animations (move arrows + wait), pre-rendered like the terrain.
export const ACTION_RIV = {
  arrow: 'Direction Arrow.riv', // base orientation points UP
  wait:  'Nothing Action.riv',
};

// CSS fallback colours for terrain IDs without a .riv file
export const TERRAIN_FALLBACK = {
  7: '#3ab8a8',
  9: '#e068a0',
  10: '#5ad0e0', // glide
  11: '#f0d878', // ward
  12: '#d83ad8', // warp
  13: '#ff5ab0', // mirror
  14: '#c0392b', // spike (active even)
  15: '#e67e22', // spike (active odd)
  16: '#8a97b0', 17: '#8a97b0', 18: '#8a97b0', 19: '#8a97b0', // conveyors
  20: '#7fae7f', 21: '#7fae7f', 22: '#7fae7f', 23: '#7fae7f', // one-way
  24: '#f1c40f', // pressure plate
  25: '#4a4a55', // gate (closed)
  26: '#6c5ce7', // ability cache (indigo — distinct from the gold pressure plate)
};
// Cracking tiles 91-99 — browner the fewer uses remain.
for (let u = 1; u <= 9; u++) TERRAIN_FALLBACK[90 + u] = '#9c6b3f';

let _rive = null;

export async function initRiv() {
  const mod = await import('../rive/canvas_advanced.mjs');
  _rive = await mod.default({
    locateFile: f =>
      new URL(f.endsWith('.wasm') ? 'rive/rive.wasm' : 'rive/' + f, location.href).href,
  });
  return _rive;
}

// Per-frame coverage (count of opaque pixels) and mean luma over those pixels.
// Coverage finds the fully-drawn band; luma finds the brightest frame — used as
// the gate's "open" (clean grass) frame, before the darker locked bars appear.
function measure(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, TILE, TILE).data;
  let n = 0, lum = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 12) { n++; lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }
  }
  return { cov: n, luma: n ? lum / n : 0 };
}

async function loadStrip(rivName) {
  const rive = _rive;
  const url  = new URL('../rive/' + rivName, import.meta.url).href;
  const bytes = await (await fetch(url)).arrayBuffer();
  const file  = await rive.load(new Uint8Array(bytes));
  const artboard = file.defaultArtboard();
  const la    = artboard.animationByIndex(0);
  const anim  = new rive.LinearAnimationInstance(la, artboard);
  const durSec = la.duration / la.fps;

  // Render tile canvas (shared, reused each frame)
  const tile = document.createElement('canvas');
  tile.width = tile.height = TILE;
  const tr = rive.makeRenderer(tile);

  const frames = [];
  for (let k = 0; k < FRAMES; k++) {
    anim.time = (k / (FRAMES - 1)) * durSec;
    anim.apply(1.0);
    artboard.advance(0);
    tr.clear(); tr.save();
    tr.align(rive.Fit.contain, rive.Alignment.center,
      { minX: 0, minY: 0, maxX: TILE, maxY: TILE }, artboard.bounds);
    artboard.draw(tr); tr.restore();
    rive.resolveAnimationFrame();

    // Copy to a new canvas so each frame is preserved
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    c.getContext('2d').drawImage(tile, 0, 0);
    frames.push(c);
  }

  const m = frames.map(measure);
  const cov = m.map(x => x.cov);
  const maxCov = Math.max(...cov, 1);

  // Find the last frame before the animation blanks out at the very end
  let topIdx = FRAMES - 1;
  for (let i = FRAMES - 1; i >= 1; i--) {
    if (cov[i] >= 0.95 * maxCov) { topIdx = i; break; }
  }
  topIdx = Math.max(1, Math.min(topIdx, FRAMES - 1));

  // The "fully-drawn" band: the first frame that's already near-full coverage.
  // The live board loops within [loIdx, topIdx] so it never shows the sparse
  // draw-in frames (which made grow-in terrain look washed out). For an ambient
  // riv (steady coverage) this is the whole range → it loops fully; for a pure
  // grow-in it collapses near topIdx → it just holds, lush.
  let loIdx = topIdx;
  for (let i = 0; i <= topIdx; i++) {
    if (cov[i] >= 0.85 * maxCov) { loIdx = i; break; }
  }

  // openIdx: the brightest fully-drawn frame — for the gate this is the clean
  // grass/open state, before the darker locked bars cross in.
  let openIdx = loIdx, bestLuma = -1;
  for (let i = loIdx; i <= topIdx; i++) {
    if (cov[i] >= 0.85 * maxCov && m[i].luma > bestLuma) { bestLuma = m[i].luma; openIdx = i; }
  }
  return { frames, topIdx, loIdx, openIdx, durSec };
}

// Pre-render all terrain .riv files. Returns Map<terrainId, {frames, …}>.
// Each filename is loaded once and shared across the ids that use it (conveyors).
export async function buildFilmstrips() {
  const strips = new Map();
  await loadFilmstrips(strips);
  return strips;
}

const nextIdle = () => new Promise(res => {
  // Yield to the browser between strips so we never block the main thread with
  // the whole map's pre-render at once — tiles stream in as the CPU is free.
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => res(), { timeout: 200 });
  else requestAnimationFrame(() => res());
});

// Stream the terrain filmstrips into an existing Map, one .riv at a time, yielding
// between each so the board stays responsive and tiles appear as they finish.
// `onEach(id, strip)` fires after each id is populated. Returns when all are done.
export async function loadFilmstrips(strips, onEach) {
  const byName = new Map();
  for (const [id, name] of Object.entries(TERRAIN_RIV)) {
    if (!byName.has(name)) {
      await nextIdle();
      // A missing/broken .riv must not abort the whole map — that tile just falls
      // back to its flat colour until the file is added.
      try { byName.set(name, await loadStrip(name)); }
      catch (err) { console.warn(`tile riv "${name}" failed to load:`, err); byName.set(name, null); }
    }
    const strip = byName.get(name);
    if (strip) { strips.set(Number(id), strip); if (onEach) onEach(Number(id), strip); }
  }
  return strips;
}

// Pre-render the UI action animations. Returns { arrow, wait } filmstrips.
export async function buildActionStrips() {
  return {
    arrow: await loadStrip(ACTION_RIV.arrow),
    wait:  await loadStrip(ACTION_RIV.wait),
  };
}

// Play You_Lose!.riv full-screen on an overlay canvas for durationMs, then freeze.
export async function playYouLose(canvas, durationMs = 4000) {
  const rive = _rive;
  const url   = new URL('../rive/You_Lose!.riv', import.meta.url).href;
  const bytes = await (await fetch(url)).arrayBuffer();
  const file  = await rive.load(new Uint8Array(bytes));
  const artboard = file.defaultArtboard();
  const la    = artboard.animationByIndex(0);
  const anim  = new rive.LinearAnimationInstance(la, artboard);
  const durSec = la.duration / la.fps;

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.hidden = false;

  const renderer = rive.makeRenderer(canvas);
  const startMs  = performance.now();

  function draw(ts) {
    const elapsed = ts - startMs;
    const t = Math.min((elapsed / durationMs) * durSec, durSec);
    anim.time = t;
    anim.apply(1.0);
    artboard.advance(0);
    renderer.clear(); renderer.save();
    renderer.align(rive.Fit.contain, rive.Alignment.center,
      { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height },
      artboard.bounds);
    artboard.draw(renderer); renderer.restore();
    rive.resolveAnimationFrame();
    if (elapsed < durationMs) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}
