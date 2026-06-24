// Action-token vocabulary.
//
// A round is 10 ticks. On each tick every living entity performs one action,
// encoded as a single token, used both by the player's queued input and by every
// non-player entity's fixed loop.
//
//   w/a/s/d  -> move    up/left/down/right (moving into an entity PUSHES it)
//   .        -> wait
//   1/2/3    -> trigger ability slot 1/2/3 (the hero's loadout — see abilities.js).
//               A directional ability arms here and fires in the direction of the
//               NEXT move token; an instant ability fires immediately.
//
// Attacks (t/f/g/h) were removed: sheep are killed by being pushed into hazards,
// not struck. See the push/herding rules in engine.js.

export const MOVE_TOKENS = {
  w: [-1, 0], // up    (row - 1)
  a: [0, -1], // left  (col - 1)
  s: [1, 0],  // down  (row + 1)
  d: [0, 1],  // right (col + 1)
};

// Ability slot tokens map to the hero's loadout index (0-2).
export const ABILITY_TOKENS = { "1": 0, "2": 1, "3": 2 };

export function abilitySlotOf(token) {
  return token in ABILITY_TOKENS ? ABILITY_TOKENS[token] : -1;
}

export const WAIT_TOKEN = ".";

// Hotbar placeholders reserved by a multi-action ability. AIM marks the slot
// awaiting a direction; LOCK marks the extra action-slots a costly ability eats.
// Both behave as waits for the engine; they exist so the cost is visible.
export const AIM_TOKEN = "?";
export const LOCK_TOKEN = "_";

export const ALL_TOKENS = new Set([
  ...Object.keys(MOVE_TOKENS),
  ...Object.keys(ABILITY_TOKENS),
  WAIT_TOKEN,
  AIM_TOKEN,
  LOCK_TOKEN,
]);

export function isMoveToken(token) {
  return token in MOVE_TOKENS;
}

export const ROUND_LENGTH = 10;

// Reverse lookup for converting [dr, dc] back to a move token (repeat-move).
export const MOVE_REVERSE = {};
for (const [tok, [dr, dc]] of Object.entries(MOVE_TOKENS)) {
  MOVE_REVERSE[`${dr},${dc}`] = tok;
}

// Returns [kind, [dr, dc]] where kind is "move" | "ability" | "wait".
// Wait and abilities carry a zero delta.
export function classify(token) {
  if (token in MOVE_TOKENS) return ["move", MOVE_TOKENS[token]];
  if (token in ABILITY_TOKENS) return ["ability", [0, 0]];
  if (token === WAIT_TOKEN || token === AIM_TOKEN || token === LOCK_TOKEN) return ["wait", [0, 0]];
  throw new Error(`unknown action token: ${JSON.stringify(token)}`);
}

// A short human label for a token (used in tooltips / hotbar). Ability slots are
// labelled generically here; the UI substitutes the loadout's real names.
export function tokenLabel(token) {
  const labels = {
    w: "↑ move up", a: "← move left", s: "↓ move down", d: "→ move right",
    "1": "ability slot 1", "2": "ability slot 2", "3": "ability slot 3", ".": "wait",
  };
  return labels[token] || token;
}
