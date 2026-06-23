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
import { classify, ROUND_LENGTH, WAIT_TOKEN, MOVE_TOKENS } from "./tokens.js";
import { Entity, SHEEP, HERO, ENEMY, rankOf } from "./entity.js";

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
      const tok = (e.kind === SHEEP && e.behavior === "skittish")
        ? this._fleeToken(e)
        : e.actionFor(this.tick, playerToken);
      actions.set(e, tok);
      classified.set(e, classify(tok));
    }

    this._resolveCharges(living, classified);
    this._resolveAbilities(living, classified);

    // Intended destinations (post-ability) drive hero/enemy contact-death so a
    // hero that wins a contested square against a lethal enemy still dies.
    const intended = this._intendedTargets(living, classified);

    const moved = this._resolveMovement(living, classified);
    this._resolveBruteExtraStep(moved);
    this._contactDeaths(intended);

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
    if (!this._inBounds(nr, nc) || !terrain.isPassable(this.gmap.terrain[nr][nc])) {
      return false; // wall / out of bounds
    }

    let occ = this._occupant(nr, nc, e);
    if (occ && !this._resolved.has(occ) && moveDir.has(occ)) {
      // let the occupant try to vacate first, then re-check
      this._attemptMove(occ, moveDir, moved);
      occ = this._occupant(nr, nc, e);
    }

    if (occ) {
      if (e.kind === HERO && occ.kind === ENEMY && occ.lethalToHero) {
        e.alive = false; // contact death — hero does not advance
        return false;
      }
      if (e.kind === SHEEP && occ.kind === ENEMY && occ.lethalToSheep) {
        e.alive = false; // sheep walks into a sheep-killing enemy
        return false;
      }
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
    if (!this._inBounds(nr, nc) || !terrain.isPassable(this.gmap.terrain[nr][nc])) {
      return false; // pushed into a wall / off the map
    }
    const occ = this._occupant(nr, nc, b);
    if (occ) {
      if (b.kind === SHEEP && occ.kind === ENEMY && occ.lethalToSheep) {
        this._markResolved(b);
        if (b.behavior === "flock") this._mirrorSheepDelta(b, dr, dc);
        b.alive = false; // shoved into a sheep-killing enemy
        return true;     // b vacated (died) → the pusher advances
      }
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

  // Deterministic flee for a skittish sheep: step to maximise distance from the
  // nearest hero, refusing walls, occupied tiles and hazards. Ties broken by the
  // fixed w/a/s/d order; if nothing increases distance, wait.
  _fleeToken(sheep) {
    let target = null, best = Infinity;
    for (const h of this.gmap.entities) {
      if (!h.alive || h.kind !== HERO) continue;
      const d = Math.abs(h.row - sheep.row) + Math.abs(h.col - sheep.col);
      if (d < best || (d === best && this._index.get(h) < this._index.get(target))) {
        best = d; target = h;
      }
    }
    if (!target) return WAIT_TOKEN;

    let bestTok = WAIT_TOKEN, bestDist = best;
    for (const tok of ["w", "a", "s", "d"]) {
      const [dr, dc] = MOVE_TOKENS[tok];
      const nr = sheep.row + dr, nc = sheep.col + dc;
      if (!this._inBounds(nr, nc)) continue;
      const tid = this.gmap.terrain[nr][nc];
      if (!terrain.isPassable(tid)) continue;                 // wall
      if (terrain.effectOf(tid) === terrain.DIE) continue;    // self-preservation
      if (this._occupant(nr, nc, sheep)) continue;            // blocked
      const d = Math.abs(target.row - nr) + Math.abs(target.col - nc);
      if (d > bestDist) { bestDist = d; bestTok = tok; }
    }
    return bestTok;
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
