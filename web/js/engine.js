// Per-tick simultaneous resolution — port of game/engine.py.
//
// One round is 10 ticks. Each step() advances a single tick. Resolution order:
//   1. Classify each entity's action into move / attack / wait / ability.
//   2. Abilities resolve first (they can affect movement/attacks).
//   3. Movement, simultaneous, lowest-index-wins on contested cells, head-on
//      swaps blocked.
//   4. On-enter terrain for entities that moved (chains).
//   5. Attacks resolve against POST-move positions.
//   6. Mark the dead.

import * as terrain from "./terrain.js";
import { classify, ROUND_LENGTH } from "./tokens.js";
import { Entity } from "./entity.js";

const key = (r, c) => `${r},${c}`;

export class Engine {
  constructor(gmap) {
    this.gmap = gmap;
    this.tick = 0;
    // creation order == row-major scan order == grid-index priority.
    this._index = new Map();
    gmap.entities.forEach((e, i) => this._index.set(e, i));
    this._portals = this._findPortals();
  }

  step(playerToken) {
    const living = this.gmap.entities.filter((e) => e.alive);
    const actions = new Map();
    const classified = new Map();
    for (const e of living) {
      const tok = e.actionFor(this.tick, playerToken);
      actions.set(e, tok);
      classified.set(e, classify(tok));
    }

    this._resolveAbilities(living, classified);
    const moved = this._resolveMovement(living, classified);
    this._applyArrivals(moved);
    this._resolveAttacks(living, classified);

    for (const e of living) {
      e.blocked = false;
      e.barrier = false;
    }

    this.tick += 1;
  }

  // --- abilities ----------------------------------------------------------

  _resolveAbilities(living, classified) {
    for (const e of living) {
      const [actionType] = classified.get(e);
      if (actionType === "ability_1") this._executeAbility1(e);
      else if (actionType === "ability_2") this._executeAbility2(e);
    }
  }

  _executeAbility1(e) {
    if (e.entityType === "knight") e.blocked = true;       // BLOCK
    else if (e.entityType === "rogue") e.repeatNext = true; // DASH (move again)
    else if (e.entityType === "mage") e.barrier = true;     // BARRIER
  }

  _executeAbility2(e) {
    // LUNGE / AMBUSH / CHAIN — placeholders matching the Python prototype.
    if (e.entityType === "knight") e.skipNext = false;
    else if (e.entityType === "rogue") e.skipNext = false;
    else if (e.entityType === "mage") e.skipNext = false;
  }

  // --- movement -----------------------------------------------------------

  _resolveMovement(living, classified) {
    const terrainGrid = this.gmap.terrain;
    const origin = new Map();
    for (const e of living) origin.set(e, [e.row, e.col]);
    const target = new Map();
    const moveDir = new Map();

    for (const e of living) {
      const [kind, [dr, dc]] = classified.get(e);
      if (kind === "move") {
        const nr = e.row + dr;
        const nc = e.col + dc;
        if (this._inBounds(nr, nc) && terrain.isPassable(terrainGrid[nr][nc])) {
          target.set(e, [nr, nc]);
          moveDir.set(e, [dr, dc]);
          continue;
        }
      }
      target.set(e, origin.get(e)); // attack / wait / blocked-by-wall stay put
    }

    const rejected = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      const final = new Map();
      for (const e of living) {
        final.set(e, rejected.has(e) ? origin.get(e) : target.get(e));
      }
      const occ = new Map();
      for (const e of living) {
        const [r, c] = final.get(e);
        const k = key(r, c);
        if (!occ.has(k)) occ.set(k, []);
        occ.get(k).push(e);
      }

      for (const e of living) {
        if (rejected.has(e) || !moveDir.has(e)) continue;
        const [tr, tc] = target.get(e);
        const contenders = occ.get(key(tr, tc));
        if (contenders.length > 1) {
          const winner = this._cellWinner(contenders, moveDir, rejected);
          if (e !== winner) {
            rejected.add(e);
            changed = true;
            continue;
          }
        }
        // head-on swap: someone sitting on my target is moving into my origin.
        const [or, oc] = origin.get(e);
        for (const other of living) {
          if (other === e || rejected.has(other)) continue;
          const [oor, ooc] = origin.get(other);
          if (oor === tr && ooc === tc && moveDir.has(other)) {
            const [otr, otc] = target.get(other);
            if (otr === or && otc === oc) {
              rejected.add(e);
              changed = true;
              break;
            }
          }
        }
      }
    }

    const moved = new Map();
    for (const e of living) {
      if (moveDir.has(e) && !rejected.has(e)) {
        const [nr, nc] = target.get(e);
        e.row = nr;
        e.col = nc;
        const dir = moveDir.get(e);
        moved.set(e, dir);
        e.lastMove = dir; // track for repeat-move terrain
      }
    }
    return moved;
  }

  // A settled occupant (not moving / already rejected) beats movers; otherwise
  // the lowest grid index wins.
  _cellWinner(contenders, moveDir, rejected) {
    for (const e of contenders) {
      if (!moveDir.has(e) || rejected.has(e)) return e;
    }
    return contenders.reduce((a, b) =>
      this._index.get(a) <= this._index.get(b) ? a : b);
  }

  // --- terrain on-enter ---------------------------------------------------

  _applyArrivals(moved) {
    const order = [...moved.keys()].sort(
      (a, b) => this._index.get(a) - this._index.get(b));
    for (const e of order) {
      if (!e.alive) continue;
      this._arrive(e, moved.get(e));
    }
  }

  _arrive(e, direction) {
    // Resolve the tile just stepped onto; effects can chain.
    for (;;) {
      const eff = terrain.effectOf(this.gmap.terrain[e.row][e.col]);
      if (eff === terrain.DIE) {
        e.alive = false;
        return;
      }
      if (eff === terrain.SKIP) {
        e.skipNext = true;
        return;
      }
      if (eff === terrain.TELEPORT) {
        this._teleport(e);
        return;
      }
      if (eff === terrain.SLIP) {
        const [dr, dc] = direction;
        const nr = e.row + dr;
        const nc = e.col + dc;
        if (this._inBounds(nr, nc)
            && terrain.isPassable(this.gmap.terrain[nr][nc])
            && !this._occupant(nr, nc, e)) {
          e.row = nr;
          e.col = nc;
          continue; // re-evaluate the new tile
        }
        return; // blocked: rest on the slip tile
      }
      if (eff === terrain.DUPLICATE) {
        this._duplicate(e);
        return;
      }
      if (eff === terrain.PUSH) {
        this._push(e, direction);
        return;
      }
      if (eff === terrain.REPEAT_MOVE) {
        e.repeatNext = true;
        return;
      }
      return; // plain terrain
    }
  }

  _teleport(e) {
    for (const [r, c] of this._portals) {
      if (!(r === e.row && c === e.col) && !this._occupant(r, c, e)) {
        e.row = r;
        e.col = c;
        return; // no chain
      }
    }
  }

  _duplicate(e) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = e.row + dr;
      const nc = e.col + dc;
      if (this._inBounds(nr, nc)
          && terrain.isPassable(this.gmap.terrain[nr][nc])
          && !this._occupant(nr, nc)) {
        const dup = new Entity({
          letter: e.letter,
          kind: e.kind,
          row: nr,
          col: nc,
          loop: e.loop.slice(),
          alive: true,
          lastMove: e.lastMove.slice(),
          entityType: e.entityType,
        });
        this.gmap.entities.push(dup);
        this._index.set(dup, this.gmap.entities.length - 1);
        return;
      }
    }
  }

  _push(e, direction) {
    const [dr, dc] = direction;
    const nr = e.row - dr;
    const nc = e.col - dc;
    if (this._inBounds(nr, nc)
        && terrain.isPassable(this.gmap.terrain[nr][nc])
        && !this._occupant(nr, nc, e)) {
      e.row = nr;
      e.col = nc;
    }
  }

  // --- attacks ------------------------------------------------------------

  _resolveAttacks(living, classified) {
    const marked = new Set();
    for (const e of living) {
      if (!e.alive) continue;
      const [kind, [dr, dc]] = classified.get(e);
      if (kind === "attack") {
        const tr = e.row + dr; // attackers never moved this tick
        const tc = e.col + dc;
        if (this._inBounds(tr, tc)) marked.add(key(tr, tc));
      }
    }
    if (!marked.size) return;
    for (const e of this.gmap.entities) {
      if (e.alive && marked.has(key(e.row, e.col))) {
        if (e.blocked || e.barrier) continue; // BLOCK / BARRIER survive
        e.alive = false;
      }
    }
  }

  // --- helpers ------------------------------------------------------------

  _inBounds(r, c) {
    return r >= 0 && r < this.gmap.rows && c >= 0 && c < this.gmap.cols;
  }

  _occupant(r, c, exclude = null) {
    for (const e of this.gmap.entities) {
      if (e.alive && e !== exclude && e.row === r && e.col === c) return e;
    }
    return null;
  }

  _findPortals() {
    const portals = [];
    for (let r = 0; r < this.gmap.rows; r++) {
      for (let c = 0; c < this.gmap.cols; c++) {
        if (terrain.effectOf(this.gmap.terrain[r][c]) === terrain.TELEPORT) {
          portals.push([r, c]);
        }
      }
    }
    return portals; // row-major == lowest-index first
  }

  get roundOver() {
    return this.tick >= ROUND_LENGTH;
  }
}
