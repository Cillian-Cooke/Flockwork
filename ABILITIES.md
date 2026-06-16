# Special Abilities System

## Overview
Three special entity types with unique abilities have been added to the game. Each can be used as heroes (controlled by player) or enemies (with AI scripts).

## Entity Types & Abilities

### Knight (K or k)
**Entity Type:** Knight  
**Available To:** Player (K) and Enemies (k)

#### Ability 1: BLOCK (e)
- **Effect:** Become invincible for 1 action
- **Duration:** Current tick only
- **Mechanics:** Blocks incoming attacks; takes no damage this tick
- **Usage:** Press `e` to activate

#### Ability 2: LUNGE (r)
- **Effect:** Move and attack in one action
- **Mechanics:** Combines movement and attack simultaneously
- **Usage:** Press `r` + direction (in future implementation)
- **Status:** Placeholder for v2

### Rogue (R or r)
**Entity Type:** Rogue  
**Available To:** Player (R) and Enemies (r)

#### Ability 1: DASH (e)
- **Effect:** Move twice in one tick
- **Duration:** Current tick + next tick
- **Mechanics:** Forces repeat move on next action
- **Usage:** Press `e` to dash

#### Ability 2: AMBUSH (r)
- **Effect:** Attack without moving
- **Mechanics:** Special attack handling
- **Usage:** Press `r` to ambush
- **Status:** Placeholder for v2

### Mage (M or m)
**Entity Type:** Mage  
**Available To:** Player (M) and Enemies (m)

#### Ability 1: BARRIER (e)
- **Effect:** Create magical immunity for 1 action
- **Duration:** Current tick only
- **Mechanics:** Blocks incoming attacks; takes no damage this tick
- **Usage:** Press `e` to activate

#### Ability 2: CHAIN (r)
- **Effect:** Attack spreads to adjacent enemies
- **Mechanics:** Attack extends to neighbors
- **Usage:** Press `r` to chain attack
- **Status:** Placeholder for v2

## Input Tokens

### Standard Tokens (unchanged)
- `w/a/s/d` - Move up/left/down/right
- `t/f/g/h` - Attack up/left/down/right
- `.` - Wait

### New Ability Tokens
- `e` - Ability 1 (entity-specific)
- `r` - Ability 2 (entity-specific)

## Map Format

Entities use their letter (K, R, M for player; k, r, m for enemies):

```json
{
  "name": "Ability Example",
  "grid": [
    ["1K", "1", "1"],
    ["1", "1s", "1k"],
    ["1", "1", "1"]
  ],
  "scripts": {
    "s": ["."],
    "k": ["d"]
  }
}
```

## Example Gameplay

### With Player Knight (K)
```
Player Input: e
Result: Knight activates BLOCK, becomes immune to attacks this turn
```

### With Player Rogue (R)
```
Player Input: ed
Turn 1: Rogue uses DASH, queues move for next
Turn 2: Rogue moves automatically (dash momentum)
```

### With Player Mage (M)
```
Player Input: e
Result: Mage activates BARRIER, blocks attacks this turn
```

## Protection Mechanics

### BLOCK (Knight)
- When used with `e`, Knight sets `blocked = True`
- Blocked entities take no damage from attacks
- Flag clears at end of tick

### BARRIER (Mage)
- When used with `e`, Mage sets `barrier = True`
- Barrier entities take no damage from attacks
- Flag clears at end of tick

### Visual Indicators
- Knight with BLOCK: `K█` or `k█`
- Mage with BARRIER: `M◆` or `m◆`

## Enemy AI with Abilities

Enemies can use abilities in their scripts:

```json
{
  "scripts": {
    "k": ["e", "d", "a", "."],
    "r": ["r", "d"],
    "m": ["e", "t"]
  }
}
```

The knight enemy will alternate between BLOCK and movement.

## Implementation Status

### Completed ✓
- BLOCK ability (Knight) - fully functional
- BARRIER ability (Mage) - fully functional
- DASH ability (Rogue) - partially functional (uses repeat_next)
- Ability tokens (e, r) parsing
- Entity type system
- Player and enemy ability support
- Protection from attacks when blocked/barrier active

### Placeholder for v2
- LUNGE (Knight r ability)
- AMBUSH (Rogue r ability)
- CHAIN (Mage r ability)

## Testing

Map: `maps/abilities.json`
- Player Knight at [0,0]
- Player Rogue at [2,1]
- Player Mage at [0,4]
- Enemy knight at [3,1]
- Enemy rogue at [2,1]
- Enemy mage at [0,4]
- Sheep at [2,3]

Try these sequences:
- `e` - Use BLOCK/BARRIER
- `ed` - Use ability then move
- `eeeee` - Use ability 5 times
