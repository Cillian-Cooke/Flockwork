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
  [NONE]:        { name: "Grass",     desc: "Plain walkable ground. No effect." },
  [WALL]:        { name: "Wall",      desc: "Impassable. Entities cannot enter." },
  [DIE]:         { name: "Lava",      desc: "Any entity that ends a step here dies." },
  [SLIP]:        { name: "Slip",      desc: "Forces one more step in the same direction (can chain into lava!)." },
  [SKIP]:        { name: "Skip",      desc: "The entity's next action is consumed as a wait." },
  [TELEPORT]:    { name: "Portal",    desc: "Teleports to the lowest-index other portal." },
  [DUPLICATE]:   { name: "Duplicate", desc: "Creates a copy of the entity on an adjacent free tile." },
  [PUSH]:        { name: "Push",      desc: "Pushes the entity back one tile (opposite of its move)." },
  [REPEAT_MOVE]: { name: "Repeat",    desc: "The entity repeats its last move on the next tick." },
  [GLIDE]:       { name: "Glide",     desc: "Slides all the way in the direction you entered, until blocked by a wall or entity." },
  [WARD]:        { name: "Ward",      desc: "Grants a damage shield for this tick." },
  [WARP]:        { name: "Warp",      desc: "Teleports to a random free tile, anywhere on the map." },
  [MIRROR]:      { name: "Mirror",    desc: "Swaps places with the nearest other entity." },
  [SPIKE]:       { name: "Spike Trap", desc: "Toggles on and off. Anything standing on it while it's active dies — cross it on the off-beat." },
  [CONVEYOR]:    { name: "Conveyor",  desc: "Carries anything on it one tile per tick in its arrow's direction." },
  [CRACK]:       { name: "Cracking",  desc: "Collapses to void after being walked over a set number of times." },
  [PLATE]:       { name: "Plate",     desc: "A pressure plate. While something stands on it, every gate is held open." },
  [GATE]:        { name: "Gate",      desc: "A wall that opens only while a pressure plate is pressed." },
  [ONEWAY]:      { name: "One-way",   desc: "Can only be entered from one direction." },
  [GRANT]:       { name: "Ability Cache", desc: "Holds abilities. End your turn here, then tap the Interact button to choose what to take or swap." },
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
  if (terrainId === 0) return { name: "Void", desc: "Empty space — step here and fall to your death." };
  return EFFECT_INFO[effectOf(terrainId)] || EFFECT_INFO[NONE];
}
