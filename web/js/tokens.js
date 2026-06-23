// Action-token vocabulary.
//
// A round is 10 ticks. On each tick every living entity performs one action,
// encoded as a single token, used both by the player's queued input and by every
// non-player entity's fixed loop.
//
//   w/a/s/d  -> move    up/left/down/right (moving into an entity PUSHES it)
//   .        -> wait
//   e        -> ability 1 (entity-specific, fires instantly, no direction)
//   r        -> ability 2 (entity-specific, CHARGE: arms here, fires on
//               whichever move-direction token comes next — see Engine)
//
// Attacks (t/f/g/h) were removed: sheep are killed by being pushed into hazards,
// not struck. See the push/herding rules in engine.js.

export const MOVE_TOKENS = {
  w: [-1, 0], // up    (row - 1)
  a: [0, -1], // left  (col - 1)
  s: [1, 0],  // down  (row + 1)
  d: [0, 1],  // right (col + 1)
};

export const ABILITY_TOKENS = {
  e: "ability_1",
  r: "ability_2",
};

export const WAIT_TOKEN = ".";

export const ALL_TOKENS = new Set([
  ...Object.keys(MOVE_TOKENS),
  ...Object.keys(ABILITY_TOKENS),
  WAIT_TOKEN,
]);

export const ROUND_LENGTH = 10;

// Reverse lookup for converting [dr, dc] back to a move token (repeat-move).
export const MOVE_REVERSE = {};
for (const [tok, [dr, dc]] of Object.entries(MOVE_TOKENS)) {
  MOVE_REVERSE[`${dr},${dc}`] = tok;
}

// Returns [kind, [dr, dc]] where kind is
// "move" | "ability_1" | "ability_2" | "wait".
// Wait and abilities carry a zero delta.
export function classify(token) {
  if (token in MOVE_TOKENS) return ["move", MOVE_TOKENS[token]];
  if (token === "e") return ["ability_1", [0, 0]];
  if (token === "r") return ["ability_2", [0, 0]];
  if (token === WAIT_TOKEN) return ["wait", [0, 0]];
  throw new Error(`unknown action token: ${JSON.stringify(token)}`);
}

// A short human label for a token (used in tooltips / hotbar).
export function tokenLabel(token) {
  const labels = {
    w: "↑ move up", a: "← move left", s: "↓ move down", d: "→ move right",
    e: "ability 1 (instant)", r: "ability 2 (charge)", ".": "wait",
  };
  return labels[token] || token;
}
