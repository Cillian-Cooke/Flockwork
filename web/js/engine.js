// Per-tick resolution for the push / herding model.
//
// One round is 10 ticks. Each step() advances a single tick. Resolution order:
//   1. Classify each entity's action into move / wait / ability. Skittish sheep
//      compute a flee direction here instead of reading a script.
//   2. Charges: an armed ability_2 (token 'r') reinterprets this entity's NEXT
//      move-direction token as the charged ability firing in that direction.
//   3. Abilities resolve (ability_1 instantly; charged_2 using the captured
//      direction). Kept from the old model; the rework is Phase 2.
//   4. Record intended destinations (for hero/enemy contact-death detection).
//   5. Movement, resolved SEQUENTIALLY in priority order (rank desc, then grid
//      index asc). Moving into an entity PUSHES it if you out-rank it
//      (Hero > Sheep > Enemy); same-rank or upward pushes are blocked. Terrain
//      on-enter chains inline as each entity lands.
//   6. Brute bonus step: a Brute that took a plain move advances one more tile.
//   7. Contact-death: a hero that clashes with a lethal enemy dies.
//
// Pushing: a hero shoves sheep, a sheep shoves enemies. Sheep die by being
// pushed (or flock-mirrored) onto a hazard (lava/void), or into a sheep-lethal
// enemy. Contention (two entities aiming at the same EMPTY tile) is decided by
// the priority order alone — it is not pushing.
//
// Sheep flock: scripted "flock" sheep share one script per letter, so their
// moves stay in lockstep. Anything that displaces a flock sheep OUTSIDE that
// script (push/slip/glide/teleport/warp/mirror) is mirrored onto every other
// living flock sheep, so the whole flock moves "as one" — including dying when
// the mirrored step lands on a hazard. Skittish sheep are individuals.

import * as terrain from "./terrain.js";
import { classify, ROUND_LENGTH, WAIT_TOKEN, abilitySlotOf } from "./tokens.js";
import { Entity, SHEEP, HERO, ENEMY, rankOf } from "./entity.js";
import { ABILITIES, lockAfter } from "./abilities.js";

const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export class Engine {
  constructor(gmap) {
    this.gmap = gmap;
    this.tick = 0;
    // creation order == row-major scan order == grid-index priority.
    this._index = new Map();
    gmap.entities.forEach((e, i) => this._index.set(e, i));
    this._portals = this._findPortals();
    this._crackState = new Map(); // "r,c" -> remaining traversals on a cracking tile
  }

  step(playerToken) {
    const living = this.gmap.entities.filter((e) => e.alive);
    const actions = new Map();
    const classified = new Map();
    for (const e of living) {
      let tok;
      if (e.kind === HERO && e.lockedTicks > 0) { e.lockedTicks -= 1; tok = WAIT_TOKEN; }
      else tok = e.actionFor(this.tick, playerToken);
      actions.set(e, tok);
      classified.set(e, classify(tok));
    }

    this._resolveAbilities(living, actions, classified);

    // Intended destinations (post-ability) drive hero/enemy contact-death so a
    // hero that wins a contested square against a lethal enemy still dies.
    const intended = this._intendedTargets(living, classified);

    this._resolveMovement(living, classified);
    this._resolveConveyors();   // carry anything sitting on a conveyor
    this._contactDeaths(intended);
    this._resolveSpikes();      // toggling traps kill whatever's on them when active

    for (const e of living) { if (e.invuln > 0) e.invuln -= 1; }

    this.tick += 1;
  }

  // --- Phase 2 tiles ------------------------------------------------------

  // Dynamic "can a mover enter (r,c) heading `dir`?" — handles gates (open only
  // while a plate is pressed) and one-way tiles (entered from one side only).
  _canEnter(r, c, dir) {
    if (!this._inBounds(r, c)) return false;
    const id = this.gmap.terrain[r][c];
    const eff = terrain.effectOf(id);
    if (eff === terrain.WALL) return false;
    if (eff === terrain.GATE) return this._gatesOpen();
    if (eff === terrain.ONEWAY) {
      const allow = terrain.onewayDir(id);
      return !!(dir && allow && dir[0] === allow[0] && dir[1] === allow[1]);
    }
    return true;
  }

  _gatesOpen() {
    for (const e of this.gmap.entities) {
      if (e.alive && terrain.effectOf(this.gmap.terrain[e.row][e.col]) === terrain.PLATE) return true;
    }
    return false;
  }

  // After movement, carry every entity standing on a conveyor one tile in its
  // arrow direction. Multiple passes let a line of entities shuffle forward.
  _resolveConveyors() {
    const riders = [];
    for (const e of this.gmap.entities) {
      if (!e.alive) continue;
      const dir = terrain.conveyorDir(this.gmap.terrain[e.row][e.col]);
      if (dir) riders.push([e, dir]);
    }
    if (!riders.length) return;
    for (let pass = 0; pass < riders.length + 1; pass++) {
      let moved = false;
      for (const [e, dir] of riders) {
        if (!e.alive || e._convMoved) continue;
        const nr = e.row + dir[0], nc = e.col + dir[1];
        if (!this._canEnter(nr, nc, dir) || this._occupant(nr, nc, e)) continue;
        e.row = nr; e.col = nc; e.lastMove = dir; e._convMoved = true;
        this._arrive(e, dir);
        moved = true;
      }
      if (!moved) break;
    }
    for (const [e] of riders) delete e._convMoved;
  }

  // Toggling spike traps kill anything standing on an active one (hero survives
  // while Invincible).
  _resolveSpikes() {
    for (const e of this.gmap.entities) {
      if (!e.alive) continue;
      if (!terrain.spikeActive(this.gmap.terrain[e.row][e.col], this.tick)) continue;
      if (e.kind === HERO && e.invuln > 0) continue;
      e.alive = false;
    }
  }

  // Add a freshly created entity (e.g. a Duplicate) to the board.
  _spawn(entity) {
    this.gmap.entities.push(entity);
    this._index.set(entity, this.gmap.entities.length - 1);
  }

  // --- abilities (modular, 3-slot loadout) --------------------------------

  // A hero's slot token arms a directional ability (fires on the next move) or
  // runs an instant one now. The action cost beyond the press + direction is
  // paid as forced waits (lockedTicks).
  _resolveAbilities(living, actions, classified) {
    for (const e of living) {
      if (!e.alive) continue;
      const tok = actions.get(e);
      const [kind] = classified.get(e);
      if (kind === "ability") {
        const slot = abilitySlotOf(tok);
        const id = e.abilities && e.abilities[slot];
        const ab = id && ABILITIES[id];
        if (!ab) continue;
        if (ab.directional) {
          e.armedAbility = id; // wait for the next move to supply a direction
        } else {
          ab.run(this, e, [0, 0]);
          e.lockedTicks = lockAfter(ab);
        }
      } else if (kind === "move" && e.armedAbility) {
        const ab = ABILITIES[e.armedAbility];
        e.armedAbility = null;
        const [, dir] = classified.get(e);
        ab.run(this, e, dir);
        e.lockedTicks = lockAfter(ab);
        classified.set(e, ["wait", [0, 0]]); // the move is consumed by the ability
      }
    }
  }

  // --- movement (sequential push resolution) ------------------------------

  // Process living entities in priority order (rank desc, then grid index asc).
  // Each entity attempts its move; moving into an occupied tile pushes the
  // occupant when out-ranked, otherwise blocks. Returns entity -> dir actually
  // moved (for the brute bonus step). Terrain on-enter chains inline.
  _resolveMovement(living, classified) {
    const moveDir = new Map();
    for (const e of living) {
      if (!e.alive) continue;
      const [kind, [dr, dc]] = classified.get(e);
      if (kind === "move" && !(dr === 0 && dc === 0)) moveDir.set(e, [dr, dc]);
    }

    const order = living
      .filter((e) => e.alive)
      .sort((a, b) => {
        const rk = rankOf(b.kind) - rankOf(a.kind);
        return rk !== 0 ? rk : this._index.get(a) - this._index.get(b);
      });

    // Entities whose movement is final this tick — set so push and flock-mirror
    // displacements also mark their victims, preventing an entity from being
    // shoved AND running its own queued move in the same tick.
    this._resolved = new Set();
    const moved = new Map();
    for (const e of order) {
      if (!e.alive || this._resolved.has(e)) continue;
      this._attemptMove(e, moveDir, moved);
    }
    this._resolved = null;
    return moved;
  }

  _markResolved(e) {
    if (this._resolved) this._resolved.add(e);
  }

  // Try to move e one tile in its direction. Pushes a lower-ranked occupant
  // (Hero > Sheep > Enemy); a hero that walks into a lethal enemy dies instead
  // of pushing. Records the move in `moved` if e advances.
  _attemptMove(e, moveDir, moved) {
    this._resolved.add(e); // mark in-progress: prevents reprocessing and recursion cycles
    if (!e.alive) return false;
    const dir = moveDir.get(e);
    if (!dir) return false; // not a mover
    const [dr, dc] = dir;
    const nr = e.row + dr, nc = e.col + dc;
    if (!this._canEnter(nr, nc, dir)) return false; // wall / closed gate / wrong side of a one-way

    let occ = this._occupant(nr, nc, e);
    if (occ && !this._resolved.has(occ) && moveDir.has(occ)) {
      // let the occupant try to vacate first, then re-check
      this._attemptMove(occ, moveDir, moved);
      occ = this._occupant(nr, nc, e);
    }

    if (occ) {
      if (e.kind === HERO && occ.kind === ENEMY && occ.lethalToHero && e.invuln <= 0) {
        e.alive = false; // contact death — hero does not advance
        return false;
      }
      if (e.kind === SHEEP && occ.kind === ENEMY && occ.lethalToSheep) {
        e.alive = false; // sheep walks into a sheep-killing enemy
        return false;
      }
      if (occ.heavy) return false; // a Boulder can't be pushed
      if (rankOf(e.kind) > rankOf(occ.kind)) {
        if (!this._attemptPush(occ, dir)) return false; // push failed → blocked
        // occ vacated (moved or died); fall through
      } else {
        return false; // can't push equal/higher rank
      }
    }

    e.row = nr; e.col = nc; e.lastMove = dir;
    moved.set(e, dir);
    this._arrive(e, dir);
    return true;
  }

  // Shove b one tile in dir. Cascades down the hierarchy only (Hero→Sheep→Enemy,
  // so chains are length <= 2). Returns true if b vacated its tile (moved or
  // died). Flock sheep drag the rest of the flock; hazard landings kill.
  _attemptPush(b, dir) {
    const [dr, dc] = dir;
    const nr = b.row + dr, nc = b.col + dc;
    if (!this._canEnter(nr, nc, dir)) return false; // shoved into a wall / closed gate / one-way
    const occ = this._occupant(nr, nc, b);
    if (occ) {
      if (b.kind === SHEEP && occ.kind === ENEMY && occ.lethalToSheep) {
        this._markResolved(b);
        if (b.behavior === "flock") this._mirrorSheepDelta(b, dr, dc);
        b.alive = false; // shoved into a sheep-killing enemy
        return true;     // b vacated (died) → the pusher advances
      }
      if (occ.heavy) return false; // can't shove anything into a Boulder
      if (rankOf(b.kind) > rankOf(occ.kind)) {
        if (!this._attemptPush(occ, dir)) return false;
      } else {
        return false; // blocked by an equal/higher-ranked entity
      }
    }
    const isFlock = b.kind === SHEEP && b.behavior === "flock";
    b.row = nr; b.col = nc; b.lastMove = dir;
    this._markResolved(b); // a pushed entity does not also run its own move
    if (isFlock) this._mirrorSheepDelta(b, dr, dc); // flock chain-reaction
    this._arrive(b, dir); // hazard kills; slip/glide/portal chain
    return true;
  }

  // Intended destination per living entity (origin + move dir if that tile is
  // in-bounds and passable, else origin). Used for contact-death detection.
  _intendedTargets(living, classified) {
    const intended = new Map();
    for (const e of living) {
      if (!e.alive) continue;
      const [kind, [dr, dc]] = classified.get(e);
      let tr = e.row, tc = e.col;
      if (kind === "move" && !(dr === 0 && dc === 0)) {
        const nr = e.row + dr, nc = e.col + dc;
        if (this._inBounds(nr, nc) && terrain.isPassable(this.gmap.terrain[nr][nc])) {
          tr = nr; tc = nc;
        }
      }
      intended.set(e, [tr, tc]);
    }
    return intended;
  }

  // A victim dies if it shares an intended destination with a lethal enemy (so
  // winning a contested square against one still kills you), or ends the tick
  // co-located with one (a backstop for push-induced collisions). Heroes die to
  // lethalToHero enemies; sheep die to lethalToSheep enemies.
  _contactDeaths(intended) {
    this._contactPass(intended, HERO, (en) => en.lethalToHero);
    this._contactPass(intended, SHEEP, (en) => en.lethalToSheep);
  }

  _contactPass(intended, victimKind, isLethal) {
    for (const v of this.gmap.entities) {
      if (!v.alive || v.kind !== victimKind) continue;
      if (v.invuln > 0) continue; // Invincible: immune to enemy contact this tick
      const [vr, vc] = intended.get(v) || [v.row, v.col];
      for (const en of this.gmap.entities) {
        if (!en.alive || en.kind !== ENEMY || !isLethal(en)) continue;
        const [er, ec] = intended.get(en) || [en.row, en.col];
        if ((vr === er && vc === ec) || (v.row === en.row && v.col === en.col)) {
          v.alive = false;
          break;
        }
      }
    }
  }

  // --- terrain on-enter ---------------------------------------------------

  _arrive(e, direction) {
    // Resolve the tile just stepped onto; effects can chain.
    for (;;) {
      const eff = terrain.effectOf(this.gmap.terrain[e.row][e.col]);
      if (eff === terrain.DIE) {
        e.alive = false;
        return;
      }
      if (eff === terrain.CRACK) {
        const id = this.gmap.terrain[e.row][e.col];
        const k = `${e.row},${e.col}`;
        const left = this._crackState.has(k) ? this._crackState.get(k) : terrain.crackUses(id);
        if (left <= 0) { e.alive = false; return; } // already collapsed → fall into void
        this._crackState.set(k, left - 1);
        return; // safe this time
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
    if (source.kind !== SHEEP || source.behavior !== "flock" || (dr === 0 && dc === 0)) return;
    for (const other of this.gmap.entities) {
      if (other === source || !other.alive
          || other.kind !== SHEEP || other.behavior !== "flock") continue;
      const nr = other.row + dr, nc = other.col + dc;
      if (!this._inBounds(nr, nc) || !terrain.isPassable(this.gmap.terrain[nr][nc])) continue;
      if (this._occupant(nr, nc, other)) continue;
      other.row = nr;
      other.col = nc;
      other.lastMove = [dr, dc];
      this._markResolved(other); // mirror-moved sheep don't also run their own move
      // The flock dies together: a mirrored step onto a hazard is fatal.
      if (terrain.effectOf(this.gmap.terrain[nr][nc]) === terrain.DIE) other.alive = false;
    }
  }

  _mirrorSheepEffect(source, fn) {
    if (source.kind !== SHEEP) return;
    for (const other of this.gmap.entities) {
      if (other === source || !other.alive || other.kind !== SHEEP) continue;
      fn(other);
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
