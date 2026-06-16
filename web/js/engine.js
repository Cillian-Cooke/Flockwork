// Per-tick simultaneous resolution — port of game/engine.py.
//
// One round is 10 ticks. Each step() advances a single tick. Resolution order:
//   1. Classify each entity's action into move / attack / wait / ability.
//   2. Charges: an armed ability_2 (token 'r') reinterprets this entity's NEXT
//      move-direction token as the charged ability firing in that direction —
//      the charge persists through waits/attacks/ability_1 in between, and the
//      ability itself never fires on the 'r' tick, only on the direction tick.
//   3. Abilities resolve (ability_1 instantly; charged_2 using the captured
//      direction). They can affect movement/attacks.
//   4. Movement, simultaneous, lowest-index-wins on contested cells, head-on
//      swaps blocked.
//   5. On-enter terrain for entities that moved (chains).
//   6. Brute bonus step: a Brute that took a plain move advances one further
//      tile in the same direction (so every move covers 2 tiles).
//   7. Attacks resolve against POST-move positions.
//   8. Mark the dead.
//
// Sheep flock: sheep share one script per letter, so scripted moves are
// already in lockstep. Anything that displaces a sheep OUTSIDE that shared
// script (terrain push/slip/glide/teleport/warp/mirror) is mirrored onto every
// other living sheep too, so the whole flock always moves "as one".

import * as terrain from "./terrain.js";
import { classify, ROUND_LENGTH } from "./tokens.js";
import { Entity, SHEEP } from "./entity.js";

const key = (r, c) => `${r},${c}`;
const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

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

    this._resolveCharges(living, classified);
    this._resolveAbilities(living, classified);
    const moved = this._resolveMovement(living, classified);
    this._applyArrivals(moved);
    this._resolveBruteExtraStep(moved);
    this._resolveAttacks(living, classified);

    for (const e of living) {
      e.blocked = false;
      e.barrier = false;
    }

    this.tick += 1;
  }

  // --- charges --------------------------------------------------------------

  // Arms ability_2 the tick 'r' is pressed; consumes the arm + fires on the
  // entity's next "move" token, replacing that token's classification with
  // ["charged_2", direction] so _resolveMovement leaves the entity in place.
  _resolveCharges(living, classified) {
    for (const e of living) {
      const [kind, dir] = classified.get(e);
      if (kind === "ability_2") {
        e.chargingAbility2 = true;
      } else if (e.chargingAbility2 && kind === "move") {
        e.chargingAbility2 = false;
        classified.set(e, ["charged_2", dir]);
      }
    }
  }

  // --- abilities ----------------------------------------------------------

  _resolveAbilities(living, classified) {
    for (const e of living) {
      const [actionType, dir] = classified.get(e);
      if (actionType === "ability_1") this._executeAbility1(e);
      else if (actionType === "charged_2") this._executeCharged2(e, dir);
    }
  }

  _executeAbility1(e) {
    if (e.entityType === "knight") e.blocked = true;        // BLOCK
    else if (e.entityType === "rogue") e.repeatNext = true; // DASH (move again)
    else if (e.entityType === "mage") e.barrier = true;     // BARRIER
    else if (e.entityType === "brute") this._slam(e);       // SLAM
    else if (e.entityType === "hunter") this._quickshot(e); // QUICKSHOT
  }

  _executeCharged2(e, dir) {
    if (!dir || (dir[0] === 0 && dir[1] === 0)) return;
    if (e.entityType === "knight") this._lunge(e, dir);
    else if (e.entityType === "rogue") this._backstab(e, dir);
    else if (e.entityType === "mage") this._chainBolt(e, dir);
    else if (e.entityType === "brute") this._chargeAttack(e, dir);
    else if (e.entityType === "hunter") this._snipe(e, dir);
  }

  // Knight: step into the target tile (if free), then stab the tile beyond.
  _lunge(e, [dr, dc]) {
    const nr = e.row + dr, nc = e.col + dc;
    if (this._inBounds(nr, nc) && terrain.isPassable(this.gmap.terrain[nr][nc])
        && !this._occupant(nr, nc, e)) {
      e.row = nr; e.col = nc; e.lastMove = [dr, dc];
      this._arrive(e, [dr, dc]);
      if (!e.alive) return;
    }
    const tr = e.row + dr, tc = e.col + dc;
    if (this._inBounds(tr, tc)) this._strike(tr, tc);
  }

  // Rogue: strikes 2 tiles away without moving.
  _backstab(e, [dr, dc]) {
    const tr = e.row + dr * 2, tc = e.col + dc * 2;
    if (this._inBounds(tr, tc)) this._strike(tr, tc);
  }

  // Mage: a beam that hits every tile in a line until it would enter a wall.
  _chainBolt(e, [dr, dc]) {
    let r = e.row + dr, c = e.col + dc;
    while (this._inBounds(r, c) && terrain.isPassable(this.gmap.terrain[r][c])) {
      this._strike(r, c);
      r += dr; c += dc;
    }
  }

  // Brute: instant shockwave on all 4 adjacent tiles, no direction needed.
  _slam(e) {
    for (const [dr, dc] of ORTHOGONAL) {
      const r = e.row + dr, c = e.col + dc;
      if (this._inBounds(r, c)) this._strike(r, c);
    }
  }

  // Brute: barrels forward until a wall or an entity; an entity hit is
  // struck and the brute stops just short of it.
  _chargeAttack(e, [dr, dc]) {
    let r = e.row, c = e.col;
    for (;;) {
      const nr = r + dr, nc = c + dc;
      if (!this._inBounds(nr, nc) || !terrain.isPassable(this.gmap.terrain[nr][nc])) break;
      const occ = this._occupant(nr, nc, e);
      if (occ) { this._strike(nr, nc); break; }
      r = nr; c = nc;
    }
    if (r !== e.row || c !== e.col) {
      e.row = r; e.col = c; e.lastMove = [dr, dc];
      this._arrive(e, [dr, dc]);
    }
  }

  // Hunter: instant shot 2 tiles along the entity's last move — no direction
  // input, fitting an instant (ability_1) move.
  _quickshot(e) {
    const [dr, dc] = e.lastMove;
    if (dr === 0 && dc === 0) return;
    const tr = e.row + dr * 2, tc = e.col + dc * 2;
    if (this._inBounds(tr, tc)) this._strike(tr, tc);
  }

  // Hunter: long-range shot, hits only the first entity (or stops at a wall).
  _snipe(e, [dr, dc]) {
    let r = e.row + dr, c = e.col + dc;
    while (this._inBounds(r, c) && terrain.isPassable(this.gmap.terrain[r][c])) {
      if (this._occupant(r, c)) { this._strike(r, c); return; }
      r += dr; c += dc;
    }
  }

  // Kills whatever living entity occupies (r, c), respecting BLOCK/BARRIER.
  _strike(r, c) {
    for (const e of this.gmap.entities) {
      if (e.alive && e.row === r && e.col === c) {
        if (e.blocked || e.barrier) continue;
        e.alive = false;
      }
    }
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
          this._mirrorSheepDelta(e, dr, dc);
          continue; // re-evaluate the new tile
        }
        return; // blocked: rest on the slip tile
      }
      if (eff === terrain.GLIDE) {
        const [dr, dc] = direction;
        const startR = e.row, startC = e.col;
        let nr = e.row + dr, nc = e.col + dc;
        while (this._inBounds(nr, nc)
               && terrain.isPassable(this.gmap.terrain[nr][nc])
               && !this._occupant(nr, nc, e)) {
          e.row = nr; e.col = nc;
          nr = e.row + dr; nc = e.col + dc;
        }
        this._mirrorSheepDelta(e, e.row - startR, e.col - startC);
        continue; // re-evaluate the landing tile (can chain into another hazard)
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
      if (eff === terrain.WARD) {
        e.barrier = true;
        return;
      }
      if (eff === terrain.WARP) {
        this._warp(e);
        return;
      }
      if (eff === terrain.MIRROR) {
        this._mirrorSwap(e);
        return;
      }
      return; // plain terrain
    }
  }

  _teleport(e, mirror = true) {
    for (const [r, c] of this._portals) {
      if (!(r === e.row && c === e.col) && !this._occupant(r, c, e)) {
        e.row = r;
        e.col = c;
        if (mirror) this._mirrorSheepEffect(e, (other) => this._teleport(other, false));
        return; // no chain
      }
    }
  }

  // Random-looking warp, but seeded off deterministic tick/position state so
  // timeline scrubbing (which replays from tick 0 every time) stays repeatable.
  _warp(e, mirror = true) {
    const free = [];
    for (let r = 0; r < this.gmap.rows; r++) {
      for (let c = 0; c < this.gmap.cols; c++) {
        if (!(r === e.row && c === e.col)
            && terrain.isPassable(this.gmap.terrain[r][c])
            && !this._occupant(r, c, e)) {
          free.push([r, c]);
        }
      }
    }
    if (!free.length) return;
    const seed = this.tick * 7 + e.row * 13 + e.col * 31;
    const [r, c] = free[seed % free.length];
    e.row = r;
    e.col = c;
    if (mirror) this._mirrorSheepEffect(e, (other) => this._warp(other, false));
  }

  // Swaps with the nearest other living entity (ties broken by lowest index).
  _mirrorSwap(e, mirror = true) {
    let best = null, bestDist = Infinity;
    for (const other of this.gmap.entities) {
      if (other === e || !other.alive) continue;
      const dist = Math.abs(other.row - e.row) + Math.abs(other.col - e.col);
      if (dist < bestDist
          || (dist === bestDist && this._index.get(other) < this._index.get(best))) {
        bestDist = dist;
        best = other;
      }
    }
    if (!best) return;
    const er = e.row, ec = e.col;
    e.row = best.row; e.col = best.col;
    best.row = er; best.col = ec;
    if (mirror) this._mirrorSheepEffect(e, (other) => this._mirrorSwap(other, false));
  }

  _duplicate(e) {
    for (const [dr, dc] of ORTHOGONAL) {
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
      this._mirrorSheepDelta(e, -dr, -dc);
    }
  }

  // --- sheep flock ----------------------------------------------------------
  // Sheep already share one script per letter, so scripted moves stay in
  // lockstep on their own. These two helpers cover everything ELSE that can
  // move a sheep, so the whole flock keeps moving "as one" no matter the
  // source — push a sheep on one side of the map and every other sheep,
  // however far away, gets pushed too.

  _mirrorSheepDelta(source, dr, dc) {
    if (source.kind !== SHEEP || (dr === 0 && dc === 0)) return;
    for (const other of this.gmap.entities) {
      if (other === source || !other.alive || other.kind !== SHEEP) continue;
      const nr = other.row + dr, nc = other.col + dc;
      if (this._inBounds(nr, nc)
          && terrain.isPassable(this.gmap.terrain[nr][nc])
          && !this._occupant(nr, nc, other)) {
        other.row = nr;
        other.col = nc;
      }
    }
  }

  _mirrorSheepEffect(source, fn) {
    if (source.kind !== SHEEP) return;
    for (const other of this.gmap.entities) {
      if (other === source || !other.alive || other.kind !== SHEEP) continue;
      fn(other);
    }
  }

  // --- brute --------------------------------------------------------------

  // A Brute that made a plain move advances one extra tile in the same
  // direction, so every move action covers 2 tiles.
  _resolveBruteExtraStep(moved) {
    for (const [e, [dr, dc]] of moved) {
      if (!e.alive || e.entityType !== "brute") continue;
      const nr = e.row + dr, nc = e.col + dc;
      if (this._inBounds(nr, nc)
          && terrain.isPassable(this.gmap.terrain[nr][nc])
          && !this._occupant(nr, nc, e)) {
        e.row = nr;
        e.col = nc;
        e.lastMove = [dr, dc];
        this._arrive(e, [dr, dc]);
      }
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
