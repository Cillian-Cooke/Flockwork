// Entity model and kind/type helpers — port of game/entities.py.

import { WAIT_TOKEN, MOVE_REVERSE } from "./tokens.js";

export const SHEEP_LETTER = "s";

export const HERO = "hero";
export const ENEMY = "enemy";
export const SHEEP = "sheep";

// Entity types with special abilities (K/k knight, R/r rogue, M/m mage).
export const ENTITY_TYPES = {
  K: { type: "knight", ability_1: "block", ability_2: "lunge" },
  k: { type: "knight", ability_1: "block", ability_2: "lunge" },
  R: { type: "rogue", ability_1: "dash", ability_2: "ambush" },
  r: { type: "rogue", ability_1: "dash", ability_2: "ambush" },
  M: { type: "mage", ability_1: "barrier", ability_2: "chain" },
  m: { type: "mage", ability_1: "barrier", ability_2: "chain" },
};

export function kindOf(letter) {
  if (letter === SHEEP_LETTER) return SHEEP;
  if (letter >= "A" && letter <= "Z") return HERO;
  if (letter >= "a" && letter <= "z") return ENEMY;
  throw new Error(`not an entity letter: ${JSON.stringify(letter)}`);
}

export function entityTypeOf(letter) {
  return (ENTITY_TYPES[letter] && ENTITY_TYPES[letter].type) || null;
}

export class Entity {
  constructor({ letter, kind, row, col, loop = [], alive = true,
                lastMove = [0, 0], entityType = "" }) {
    this.letter = letter;
    this.kind = kind;
    this.row = row;
    this.col = col;
    this.loop = loop;
    this.alive = alive;
    this.skipNext = false;
    this.repeatNext = false; // force repeat of last move
    this.lastMove = lastMove; // [dr, dc] of previous move
    this.entityType = entityType; // "knight" | "rogue" | "mage" | ""
    this.blocked = false; // Knight BLOCK protection
    this.barrier = false; // Mage BARRIER protection
  }

  get pos() {
    return [this.row, this.col];
  }

  // The token this entity intends to perform on `tick`. Heroes use the shared
  // player token; others read their loop. A pending skip overrides with a wait;
  // a pending repeat replays the last move. Loops cycle within each round.
  actionFor(tick, playerToken) {
    if (this.skipNext) {
      this.skipNext = false;
      return WAIT_TOKEN;
    }
    if (this.repeatNext) {
      this.repeatNext = false;
      const [dr, dc] = this.lastMove;
      return MOVE_REVERSE[`${dr},${dc}`] || WAIT_TOKEN;
    }
    if (this.kind === HERO) return playerToken;
    if (!this.loop.length) return WAIT_TOKEN;
    return this.loop[tick % this.loop.length];
  }

  clone() {
    const e = new Entity({
      letter: this.letter,
      kind: this.kind,
      row: this.row,
      col: this.col,
      loop: this.loop.slice(),
      alive: this.alive,
      lastMove: this.lastMove.slice(),
      entityType: this.entityType,
    });
    e.skipNext = this.skipNext;
    e.repeatNext = this.repeatNext;
    e.blocked = this.blocked;
    e.barrier = this.barrier;
    return e;
  }
}
