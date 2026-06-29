// Terrain registry and core-set effects — port of game/terrain.py.
//
// Terrain is a numeric layer: 0 is void, 1-100 are type IDs. Each ID maps to an
// effect that fires when an entity ends a step on it (or forbids entering).

export const NONE = "none";          // plain, walkable, no side effect
export const WALL = "wall";          // cannot be entered
export const DIE = "die";            // ends here -> dies (lava)
export const SLIP = "slip";          // forced one more step in the same direction
export const SKIP = "skip";          // next action consumed as a wait
export const TELEPORT = "teleport";  // relocate to the lowest-index other portal
export const DUPLICATE = "duplicate";// entity duplicates on this tile
export const PUSH = "push";          // pushed back one tile, opposite direction
export const REPEAT_MOVE = "repeat-move"; // repeats previous move next tick
export const SEE_MORE = "see-more";  // deferred
export const SEE_LESS = "see-less";  // deferred
export const GLIDE = "glide";        // slides all the way until blocked
export const WARD = "ward";          // grants a damage barrier for this tick
export const WARP = "warp";          // teleports to a random free tile, anywhere
export const MIRROR = "mirror";      // swaps with the nearest other entity
// Phase 2 puzzle tiles (handled with extra engine passes, not plain on-enter):
export const SPIKE = "spike";        // toggling trap — lethal on its active ticks
export const CONVEYOR = "conveyor";  // carries anything on it one tile per tick
export const CRACK = "crack";        // collapses to void after N traversals
export const PLATE = "plate";        // a pressure plate — holds the gates open
export const GATE = "gate";          // wall until any plate is pressed
export const ONEWAY = "oneway";      // enterable only from one direction
export const GRANT = "grant";        // ability terrain — collect abilities when ending a turn here

export const VOID = 0;

export const DEFAULT_REGISTRY = {
  0: DIE,         // void: entity falls in and dies
  1: NONE,        // grass
  2: WALL,        // wall
  3: DIE,         // lava
  4: SLIP,        // slip
  5: SKIP,        // skip
  6: TELEPORT,    // portal
  7: DUPLICATE,   // duplicate
  8: PUSH,        // push
  9: REPEAT_MOVE, // repeat move
  10: GLIDE,      // glide
  11: WARD,       // ward
  12: WARP,       // warp
  13: MIRROR,     // mirror
  14: SPIKE,      // trap, active on EVEN ticks
  15: SPIKE,      // trap, active on ODD ticks
  16: CONVEYOR,   // conveyor up
  17: CONVEYOR,   // conveyor right
  18: CONVEYOR,   // conveyor down
  19: CONVEYOR,   // conveyor left
  20: ONEWAY,     // one-way, enter moving up
  21: ONEWAY,     // one-way, enter moving right
  22: ONEWAY,     // one-way, enter moving down
  23: ONEWAY,     // one-way, enter moving left
  24: PLATE,      // pressure plate
  25: GATE,       // gate (closed wall until a plate is pressed)
  26: GRANT,      // ability terrain (holds abilities — see the map's `grants` field)
  // 91-99: cracking tiles, durability = id - 90 (see crackUses)
};

// --- Phase 2 tile helpers --------------------------------------------------

// Spikes: 14 is active on even ticks, 15 on odd ticks. Lets a map alternate
// two banks of spikes for timing puzzles.
export function spikeActive(id, tick) {
  if (id === 14) return tick % 2 === 0;
  if (id === 15) return tick % 2 === 1;
  return false;
}

// Conveyor direction [dr,dc] for ids 16-19 (up/right/down/left), else null.
const CONVEYOR_DIR = { 16: [-1, 0], 17: [0, 1], 18: [1, 0], 19: [0, -1] };
export function conveyorDir(id) { return CONVEYOR_DIR[id] || null; }

// One-way allowed entry direction for ids 20-23, else null.
const ONEWAY_DIR = { 20: [-1, 0], 21: [0, 1], 22: [1, 0], 23: [0, -1] };
export function onewayDir(id) { return ONEWAY_DIR[id] || null; }

// Cracking: ids 91-99 carry a durability of (id - 90) traversals.
export function isCrack(id) { return id >= 91 && id <= 99; }
export function crackUses(id) { return isCrack(id) ? id - 90 : 0; }

// Human-facing descriptions for tooltips, keyed by effect.
export const EFFECT_INFO = {
  [NONE]:        { name: "Grass",     desc: "Ordinary open ground. Anyone can walk across it freely — it has no effect." },
  [WALL]:        { name: "Wall",      desc: "A solid block. Nothing can step onto it, so it stops movement and shapes the paths through a level." },
  [DIE]:         { name: "Lava",      desc: "Deadly. Any entity that ends a step on lava dies instantly. Herd enemies and sheep into it — but never end your own move here." },
  [SLIP]:        { name: "Slip",      desc: "Slick ice. Stepping on causes one extra forced step in the same direction. That slide can carry you off an edge or into lava, so look before you skate." },
  [SKIP]:        { name: "Skip",      desc: "Sticky ground. The moment you land here your NEXT action is eaten as a wait — you lose a tick before you can move again." },
  [TELEPORT]:    { name: "Portal",    desc: "Step on to be sent instantly to the matching portal elsewhere on the map. Pairs of portals link travel across the board." },
  [DUPLICATE]:   { name: "Duplicate", desc: "Lands a copy of the entity on a free neighbouring tile — handy for splitting a hero into a swarm, or accidentally cloning an enemy." },
  [PUSH]:        { name: "Push",      desc: "A spring. Whoever steps on is immediately shoved back one tile, the opposite way to the move that brought them in." },
  [REPEAT_MOVE]: { name: "Repeat",    desc: "An echo tile. After you step on, your last move automatically replays on the next tick — you travel two tiles for one action." },
  [GLIDE]:       { name: "Glide",     desc: "Frictionless lane. Enter and you keep sliding in that direction until a wall or another entity finally stops you." },
  [WARD]:        { name: "Ward",      desc: "A blessing tile. While you stand on it you carry a shield, surviving a hit or hazard for that tick." },
  [WARP]:        { name: "Warp",      desc: "Chaotic teleporter. Step on to be flung to a completely random free tile anywhere on the map — destination unknown." },
  [MIRROR]:      { name: "Mirror",    desc: "Step on to instantly swap places with the nearest other entity — pull a far-off sheep to you, or trade spots with a threat." },
  [SPIKE]:       { name: "Spike Trap", desc: "Blinks on and off every tick. Anything caught on it while the spikes are UP dies; while they're down it's safe. Cross on the off-beat." },
  [CONVEYOR]:    { name: "Conveyor",  desc: "A moving belt. Anything standing on it is carried one tile per tick in the arrow's direction, whether it wants to move or not." },
  [CRACK]:       { name: "Cracking Floor", desc: "Fragile ground. It survives a set number of crossings, then collapses into deadly void — the next entity to step there falls through." },
  [PLATE]:       { name: "Pressure Plate", desc: "A switch held down by weight. While any entity stands on a plate, every gate on the map stays open. Step off and the gates slam shut." },
  [GATE]:        { name: "Gate",      desc: "A barrier that's solid by default. It only opens — and becomes walkable — while a pressure plate somewhere is being pressed." },
  [ONEWAY]:      { name: "One-way",   desc: "A turnstile. It can only be entered from the direction its arrow points; try to step in from any other side and you're blocked." },
  [GRANT]:       { name: "Ability Cache", desc: "A stash of abilities. End a turn standing here, then tap the 🤝 Interact button to pick up or swap which abilities your hero carries." },
};

export function effectOf(terrainId, registry = DEFAULT_REGISTRY) {
  if (isCrack(terrainId)) return CRACK;
  // Unregistered IDs are plain grass.
  return terrainId in registry ? registry[terrainId] : NONE;
}

// Static passability (used by ability line-scans). A GATE is treated as closed
// here; the engine's movement uses a dynamic check that opens it on a plate.
export function isPassable(terrainId, registry = DEFAULT_REGISTRY) {
  const eff = effectOf(terrainId, registry);
  return eff !== WALL && eff !== GATE;
}

export function describeTerrain(terrainId) {
  if (terrainId === 0) return { name: "Void", desc: "The empty gap beyond the level. Anything that steps into the void falls and dies — push hazards toward it, and mind the edges." };
  return EFFECT_INFO[effectOf(terrainId)] || EFFECT_INFO[NONE];
}
