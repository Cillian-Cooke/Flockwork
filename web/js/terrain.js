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
};

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
};

export function effectOf(terrainId, registry = DEFAULT_REGISTRY) {
  // Unregistered IDs (10-100) are plain grass.
  return terrainId in registry ? registry[terrainId] : NONE;
}

export function isPassable(terrainId, registry = DEFAULT_REGISTRY) {
  return effectOf(terrainId, registry) !== WALL;
}

export function describeTerrain(terrainId) {
  if (terrainId === 0) return { name: "Void", desc: "Empty space — step here and fall to your death." };
  return EFFECT_INFO[effectOf(terrainId)] || EFFECT_INFO[NONE];
}
