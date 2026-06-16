// Rive runtime loader, filmstrip pre-renderer, and You Lose overlay player.

const TILE  = 96;   // pre-render resolution per frame (independent of cell size)
const FRAMES = 48;  // frames to sample per animation

// terrain ID → .riv filename
export const TERRAIN_RIV = {
  1: 'Grass.riv',
  2: 'Trees.riv',
  3: 'Lava.riv',
  4: 'Ice.riv',
  5: 'Mud.riv',
  6: 'Portal.riv',
  8: 'Water.riv',
};

// CSS fallback colours for terrain IDs without a .riv file
export const TERRAIN_FALLBACK = {
  7: '#3ab8a8',
  9: '#e068a0',
  10: '#5ad0e0', // glide
  11: '#f0d878', // ward
  12: '#d83ad8', // warp
  13: '#ff5ab0', // mirror
};

let _rive = null;

export async function initRiv() {
  const mod = await import('../rive/canvas_advanced.mjs');
  _rive = await mod.default({
    locateFile: f =>
      new URL(f.endsWith('.wasm') ? 'rive/rive.wasm' : 'rive/' + f, location.href).href,
  });
  return _rive;
}

// Count non-transparent pixels to find the last fully-drawn frame.
function coverage(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, TILE, TILE).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 12) n++;
  return n;
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

  // Find the last frame before the animation blanks out at the very end
  const cov = frames.map(coverage);
  const maxCov = Math.max(...cov, 1);
  let topIdx = FRAMES - 1;
  for (let i = FRAMES - 1; i >= 1; i--) {
    if (cov[i] >= 0.95 * maxCov) { topIdx = i; break; }
  }
  topIdx = Math.max(1, Math.min(topIdx, FRAMES - 1));
  return { frames, topIdx };
}

// Pre-render all terrain .riv files. Returns Map<terrainId, {frames, topIdx}>.
export async function buildFilmstrips() {
  const strips = new Map();
  for (const [id, name] of Object.entries(TERRAIN_RIV)) {
    strips.set(Number(id), await loadStrip(name));
  }
  return strips;
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
