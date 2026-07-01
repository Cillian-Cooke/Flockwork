# Flockwork — Game Guide

Flockwork is a deterministic, turn-based **herding puzzle**. You control one or
more heroes and must clear every sheep off the board by herding them into hazards
(lava, the void, spike traps…) — while dodging scripted enemies and using the
terrain and your abilities to your advantage.

The whole game runs client-side in the browser (`web/`). Serve the folder over
http and open it:

```bash
cd web
python3 -m http.server 8000
# open http://localhost:8000/
```

---

## How the game works

### The goal

- **Win:** clear the board of **all sheep** (herd/push them into a hazard, or feed
  them to a wolf).
- **Lose:** **all your heroes die**.

### Rounds and ticks

- Play happens in **rounds of 10 ticks** (a "tick" = one action for every piece).
- You **queue up to 10 actions** for your hero, then press **▶ Play**. The round
  plays out one tick at a time.
- If you queue **fewer than 10** actions, the queue **repeats** to fill the round
  (shown as faded "ghost" tiles in the hotbar).
- Every non-hero piece (sheep, enemies) follows a **fixed script** — the game is
  fully deterministic, so the same moves always produce the same result. Plan,
  play, and refine.

### Actions (tokens)

Each queued action is a single token:

| Token | Action |
|------|--------|
| `w` `a` `s` `d` | Move up / left / down / right |
| `.` | Wait (skip this tick) |
| `1` `2` `3` | Trigger ability slot 1 / 2 / 3 |

Walking **into** another piece **pushes** it if you outrank it (see below).

### The push hierarchy

Pieces can only push pieces **strictly below** them:

```
Hero (3)  >  Sheep (2)  >  Enemy (1)
```

- A hero pushes sheep and enemies; a sheep pushes enemies; enemies push nothing.
- Same-rank or "upward" pushes are **blocked** (you just don't move).
- Pushes **cascade**: shoving a sheep into an enemy shoves the enemy too.
- Pushing a sheep (or enemy) **into a hazard** kills it — that's how you clear the
  board.

### The flock

Scripted sheep that share a letter form a **flock** and move **as one**. Anything
that displaces a flock sheep *outside* its script (a push, slip, glide, teleport,
warp, or mirror) is **mirrored onto every other living flock sheep** — so the
whole flock shifts together, and dies together if the mirrored step lands on a
hazard. Use this: nudge one sheep and the flock follows.

### Scoring

Score reads as `"<rounds>.<actions>"`: the number of fully-completed 10-action
rounds plus how many actions into the final round the last sheep died. Lower is
better — clear the flock in as few actions as possible.

### Reading the board

- **Click / tap** any tile or entity to open an **inspect card**: the map slides
  away and a small looping 5×5 demo shows exactly what that thing does, with a
  clear description. Hit **← Back** (or Esc) to return.
- On desktop you also get a quick **hover tooltip**.
- The **timeline** dots under the board let you scrub through the ticks of a
  played round.

---

## Entities (characters)

Entities are identified by a single letter in the map grid:

- **Uppercase `A`–`Z` → Hero** (the pieces you control).
- **`s` → Sheep** (what you must clear).
- **Lowercase `a`–`z` (except `s`) → Enemy** (scripted hazards).

Heroes and some entities are drawn as full-tile animations; others show a coloured
letter disc.

### Hero

The piece(s) you control. Queue its actions and play them out. It pushes sheep and
weaker enemies, carries up to **three abilities** (see below), and can be cloned
into a **swarm** with the Duplicate ability — every copy runs the same moves.

### Sheep (`s`)

The flock you must clear. Sheep follow a fixed path and (when they share a letter)
move together as one. Herd or push them into lava/void, or let a wolf eat them.

### Enemy variants

All enemies run a **fixed script** (a loop of tokens) and never react to you. Their
behaviour is set by flags in the map's `meta` (see map format):

| Variant | Flags | Behaviour |
|--------|-------|-----------|
| **Guard** | `lethalToHero: true` (default) | Paces a route; **kills the hero on contact**, ignores sheep. (Rendered as the turtle.) |
| **Wolf** | `lethalToHero: true`, `lethalToSheep: true` | Kills **both** the hero and any sheep it touches — keep the flock clear of its lane. |
| **Boulder** | `heavy: true` | Too heavy to push; a movable-looking obstacle. Route around it or use it as cover. |
| **Harmless** | `lethalToHero: false` | Won't hurt anyone; the hero simply shoves it aside. |

An enemy can also carry a `toggle` schedule to be lethal only on certain ticks.

---

## Tiles (terrain)

Terrain is a numeric layer. `0` is the void; `1`–`100` are tile-type IDs. An effect
fires when a piece **ends a step** on a tile (or the tile forbids entry).

| ID(s) | Tile | What it does |
|------|------|--------------|
| `0` | **Void** | The empty gap beyond the level — step in and fall to your death. |
| `1` | **Grass** | Plain walkable ground. No effect. |
| `2` | **Wall** | Solid and impassable — shapes the paths through a level. |
| `3` | **Lava** | Deadly: any piece that ends a step here dies. Herd enemies/sheep in, never end your own move here. |
| `4` | **Slip (ice)** | Forces **one more step** in the same direction — the slide can carry you into lava or off an edge. |
| `5` | **Skip (mud)** | Your **next action is eaten as a wait** — you lose a tick. |
| `6` | **Portal** | Teleports you to the matching portal elsewhere (lowest-index other portal). |
| `7` | **Duplicate** | Spawns a copy of the piece on a free neighbouring tile. |
| `8` | **Push** | A spring — shoves you back one tile, opposite to the move that brought you in. |
| `9` | **Repeat** | Your last move automatically **replays** next tick (two tiles for one action). |
| `10` | **Glide** | Frictionless — you keep sliding in that direction until a wall or piece stops you. |
| `11` | **Ward** | While you stand on it you carry a shield, surviving one hit/hazard that tick. |
| `12` | **Warp** | Flings you to a **random** free tile anywhere on the map. |
| `13` | **Mirror** | Swaps you with the **nearest other entity**. |
| `14` / `15` | **Spike Trap** | Blinks on/off each tick — lethal while **up**, safe while down. `14` is active on **even** ticks, `15` on **odd**. Cross on the off-beat. |
| `16`–`19` | **Conveyor** | A belt: carries anything on it one tile per tick in its arrow's direction. `16`=up, `17`=right, `18`=down, `19`=left. |
| `20`–`23` | **One-way** | A turnstile — enterable only from the arrow's direction. `20`=up, `21`=right, `22`=down, `23`=left. |
| `24` | **Pressure Plate** | While any piece stands on a plate, **every gate** on the map is held open. |
| `25` | **Gate** | Solid by default; opens (becomes walkable) only while a pressure plate is pressed. |
| `26` | **Ability Cache** | A stash of abilities. End a turn here, then tap **🤝 Interact** to pick up / swap what your hero carries. |
| `91`–`99` | **Cracking Floor** | Survives a set number of crossings, then collapses into deadly void. Durability = `id − 90` (so `91` breaks after one crossing). |

Any unlisted ID renders as plain grass.

> **Tip:** slip, glide, conveyors and charges can be **chained** — a slide into a
> conveyor into lava is a clean way to clear a sheep from across the board.

---

## Abilities

A hero carries up to **three abilities** in slots, triggered with tokens `1`/`2`/`3`.

- **Directional** abilities *arm* when you press the slot, then **fire in the
  direction of your next move** (which they consume).
- **Instant** abilities fire the moment you press the slot.
- **Cost** is the total number of actions the ability spends. Anything beyond the
  press (and, for directional, the direction) is paid as forced waits — the hotbar
  shows these reserved slots so you can see the true cost.
- Abilities never "attack" — in this push/herding game they **reposition** things.

| Ability | Icon | Type | Cost | Effect |
|--------|------|------|------|--------|
| **Duplicate** | 👥 | Directional | 3 | Spawn a copy of the hero one tile away. Every copy runs the same moves — build a swarm. |
| **Hook** | 🪝 | Directional | 2 | Drag the first entity in that direction **one tile toward you** (reverse push). |
| **Charge** | 💨 | Directional | 2 | Barrel forward until blocked, shoving whatever you hit. Moves the hero (dies if it ploughs into a lethal enemy). |
| **Whistle** | 📣 | Directional | 2 | Shift the **whole flock** one tile in that direction, ignoring their script this tick. |
| **Blink** | ✨ | Directional | 2 | Leap **two tiles** in that direction, over whatever's between; lands on open ground. |
| **Invincible** | 🛡️ | Instant | 1 | Be invincible for your next action — walk through a guard or cross lava once. |
| **Freeze** | ❄️ | Instant | 2 | Every enemy skips its next move. |

### Getting & swapping abilities

Loadouts **never change on their own**. To change what your hero carries, end a
turn on an **Ability Cache** (tile `26`), then tap the **🤝 Interact** button and
drag abilities between the cache and your slots. The choice is recorded so replays
stay deterministic. The default loadout (if a map doesn't specify one) is
**Hook, Charge, Duplicate**.

---

## Making a map

A map (and a saved game) is a single JSON file. Drag-and-drop it onto the game, or
use the **click-to-choose** link in the footer.

### Fields

| Field | Required | Meaning |
|------|----------|---------|
| `name` | yes | Map title (first ~20 chars are shown). |
| `grid` | yes | 2-D array of **cell strings** (see below). Must be rectangular. |
| `scripts` | for NPCs | A loop of action tokens for **each enemy/sheep letter**. |
| `vision` | optional | Hero sight radius (fog beyond it). |
| `meta` | optional | Per-letter entity settings (see below). |
| `grants` | optional | Ability-cache contents, keyed by `"row,col"`. |
| `rounds` | save only | Array of completed rounds (each an array of move tokens). |
| `current` | save only | Moves queued for the next round. |

### Cell strings

Each grid cell is a string: the **terrain number** with the **entity letter**
appended if a piece starts there.

```
"1"    grass, empty          "1A"   hero 'A' on grass
"0"    void                  "1s"   a sheep on grass
"2"    wall                  "3a"   enemy 'a' on lava
"26"   ability cache         "18s"  a sheep on a down-conveyor
```

- Terrain 0–100 (see the tile table). Entity letter: uppercase = hero, `s` =
  sheep, other lowercase = enemy. Each **enemy letter must be unique**; sheep can
  share the `s` letter to form a flock.

### Scripts

Every enemy and sheep needs a `scripts` entry — a list of action tokens it loops
through, one per tick (`w a s d` / `.`). Example: `"a": ["d","d","a","a"]` paces
right-right-left-left forever.

### `meta` (entity settings)

Keyed by letter; all fields optional:

| Field | Default | Meaning |
|------|---------|---------|
| `lethalToHero` | `true` | Enemy kills the hero on contact. |
| `lethalToSheep` | `false` | Enemy kills sheep on contact (makes a **wolf**). |
| `heavy` | `false` | Can't be pushed (makes a **boulder**). |
| `toggle` | `null` | `{ period, phase }` — lethal only on active ticks. |
| `abilities` | default loadout | Hero's starting 3 abilities (for uppercase letters). |

### `grants` (ability caches)

For each ability-cache tile, list up to 3 ability ids it holds:

```json
"grants": { "2,3": ["hook", "blink"] }
```

Ability ids: `duplicate`, `hook`, `charge`, `whistle`, `blink`, `shield`
(Invincible), `freeze`.

### A minimal example

```json
{
  "name": "First Steps",
  "vision": 5,
  "grid": [
    ["1A", "1",  "1",  "1",  "1" ],
    ["1",  "2",  "3",  "1",  "1" ],
    ["1",  "1",  "1",  "1",  "1s"],
    ["1",  "1a", "1",  "1",  "3" ]
  ],
  "scripts": {
    "s": [".", ".", ".", ".", "."],
    "a": ["d", "a", "d", "a"]
  }
}
```

Hero `A` (top-left) must herd sheep `s` into one of the lava tiles (`3`) while the
guard `a` paces below. There's a wall (`2`) in the middle of the board.

---

## Quick reference

- **Move:** `w a s d` · **Wait:** `.` · **Abilities:** `1 2 3`
- **Win:** clear all sheep. **Lose:** all heroes die.
- **Ranks:** Hero > Sheep > Enemy (you can only push down the ladder).
- **Round:** 10 ticks; a short queue repeats to fill it.
- **Hazards to herd into:** lava (`3`), void (`0`), active spikes (`14`/`15`),
  collapsed cracking floor (`91`–`99`).
- **Inspect anything:** click/tap a tile or entity for an animated explainer.
