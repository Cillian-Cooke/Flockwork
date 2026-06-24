// Entity model and kind/rank helpers.

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

export function kindOf(letter) {
  if (letter === SHEEP_LETTER) return SHEEP;
  if (letter >= "A" && letter <= "Z") return HERO;
  if (letter >= "a" && letter <= "z") return ENEMY;
  throw new Error(`not an entity letter: ${JSON.stringify(letter)}`);
}

export class Entity {
  constructor({ letter, kind, row, col, loop = [], alive = true,
                lastMove = [0, 0],
                behavior = "flock", lethalToHero = true, lethalToSheep = false,
                heavy = false, abilities = [], toggle = null }) {
    this.letter = letter;
    this.kind = kind;
    this.row = row;
    this.col = col;
    this.loop = loop;
    this.alive = alive;
    this.skipNext = false;
    this.repeatNext = false; // force repeat of last move
    this.lastMove = lastMove; // [dr, dc] of previous move
    // Sheep movement: "flock" sheep are scripted and move as one.
    this.behavior = behavior;
    // Enemy contact lethality (most enemies kill the hero, not the sheep).
    this.lethalToHero = lethalToHero;
    this.lethalToSheep = lethalToSheep;
    // A heavy entity (e.g. a Boulder) cannot be pushed.
    this.heavy = heavy;
    // Hero loadout: up to three ability ids (see abilities.js).
    this.abilities = abilities;
    // Trap toggle schedule { period, phase } — lethal on active ticks.
    this.toggle = toggle;
    // Ability runtime state.
    this.armedAbility = null; // id of a directional ability waiting for a move
    this.lockedTicks = 0;     // forced waits remaining (an ability's action cost)
    this.invuln = 0;          // ticks of invincibility remaining (Invincible)
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
      behavior: this.behavior,
      lethalToHero: this.lethalToHero,
      lethalToSheep: this.lethalToSheep,
      heavy: this.heavy,
      abilities: this.abilities.slice(),
      toggle: this.toggle ? { ...this.toggle } : null,
    });
    e.skipNext = this.skipNext;
    e.repeatNext = this.repeatNext;
    e.armedAbility = this.armedAbility;
    e.lockedTicks = this.lockedTicks;
    e.invuln = this.invuln;
    return e;
  }
}
