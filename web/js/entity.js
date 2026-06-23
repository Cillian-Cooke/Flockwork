// Entity model and kind/type helpers — port of game/entities.py.

import { WAIT_TOKEN, MOVE_REVERSE } from "./tokens.js";

export const SHEEP_LETTER = "s";

export const HERO = "hero";
export const ENEMY = "enemy";
export const SHEEP = "sheep";

// Push hierarchy: an entity can only push entities STRICTLY below it.
// Hero (3) > Sheep (2) > Enemy (1). Same-rank entities never push each other.
const RANK = { [HERO]: 3, [SHEEP]: 2, [ENEMY]: 1 };
export function rankOf(kind) {
  return RANK[kind] || 0;
}

// Entity types with special abilities (uppercase = hero, lowercase = enemy).
// ability_1 (token 'e') fires instantly, no direction needed. ability_2
// (token 'r') arms a charge that fires on whichever direction key comes next
// — see Engine._resolveCharges.
export const ENTITY_TYPES = {
  K: { type: "knight", ability_1: "block",     ability_2: "lunge" },
  k: { type: "knight", ability_1: "block",     ability_2: "lunge" },
  R: { type: "rogue",  ability_1: "dash",      ability_2: "backstab" },
  r: { type: "rogue",  ability_1: "dash",      ability_2: "backstab" },
  M: { type: "mage",   ability_1: "barrier",   ability_2: "chain_bolt" },
  m: { type: "mage",   ability_1: "barrier",   ability_2: "chain_bolt" },
  B: { type: "brute",  ability_1: "slam",      ability_2: "charge" },
  b: { type: "brute",  ability_1: "slam",      ability_2: "charge" },
  H: { type: "hunter", ability_1: "quickshot", ability_2: "snipe" },
  h: { type: "hunter", ability_1: "quickshot", ability_2: "snipe" },
};

// Tooltip copy for each type's abilities, plus any movement quirk.
export const ABILITY_INFO = {
  knight: {
    e: "Block — invincible against attacks this tick.",
    r: "Lunge — charge, then a direction: steps in and stabs the tile beyond.",
  },
  rogue: {
    e: "Dash — automatically repeats your last move next tick.",
    r: "Backstab — charge, then a direction: strikes 2 tiles away.",
  },
  mage: {
    e: "Barrier — blocks all damage this tick.",
    r: "Chain Bolt — charge, then a direction: beam hits everything in line until a wall.",
  },
  brute: {
    e: "Slam — instantly hits all 4 adjacent tiles.",
    r: "Charge — charge, then a direction: barrels forward until it hits a wall or an entity.",
    move: "Moves 2 tiles per move action.",
  },
  hunter: {
    e: "Quickshot — instant shot 2 tiles along your last move direction.",
    r: "Snipe — charge, then a direction: long-range shot, hits the first thing in the way.",
  },
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
                lastMove = [0, 0], entityType = "",
                behavior = "flock", lethalToHero = true, lethalToSheep = false }) {
    this.letter = letter;
    this.kind = kind;
    this.row = row;
    this.col = col;
    this.loop = loop;
    this.alive = alive;
    this.skipNext = false;
    this.repeatNext = false; // force repeat of last move
    this.lastMove = lastMove; // [dr, dc] of previous move
    this.entityType = entityType; // "knight" | "rogue" | "mage" | "brute" | "hunter" | ""
    this.blocked = false; // Knight BLOCK protection
    this.barrier = false; // Mage BARRIER / Ward protection
    this.chargingAbility2 = false; // armed by 'r', fires on the next move direction
    // Sheep movement: "flock" (scripted, moves as one) | "skittish" (flees heroes).
    this.behavior = behavior;
    // Enemy contact lethality (most enemies kill the hero, not the sheep).
    this.lethalToHero = lethalToHero;
    this.lethalToSheep = lethalToSheep;
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
      behavior: this.behavior,
      lethalToHero: this.lethalToHero,
      lethalToSheep: this.lethalToSheep,
    });
    e.skipNext = this.skipNext;
    e.repeatNext = this.repeatNext;
    e.blocked = this.blocked;
    e.barrier = this.barrier;
    e.chargingAbility2 = this.chargingAbility2;
    return e;
  }
}
