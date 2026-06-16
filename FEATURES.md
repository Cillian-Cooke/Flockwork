# New Features Implemented

## Terrain Types (IDs 0-9)

| ID | Name | Effect |
|----|------|--------|
| 0 | WALL (void) | Impassable |
| 1 | NONE (grass) | Walkable, no effect |
| 2 | WALL (solid) | Impassable |
| 3 | DIE (lava) | Entity dies when landing on it |
| 4 | SLIP | Entity is forced to move one more tile in same direction |
| 5 | SKIP | Entity's next action is consumed (becomes wait) |
| 6 | TELEPORT | Entity teleports to lowest-index portal |
| 7 | DUPLICATE | Creates a copy of entity on adjacent free tile |
| 8 | PUSH | Entity is pushed back one tile in opposite direction |
| 9 | REPEAT_MOVE | Entity repeats its last move on next tick |

## Variable-Length Entity Scripts

Previously, all entity scripts required exactly 10 tokens. Now they can be any length:

- Scripts cycle through each round using `tick % script_length`
- **Example 1**: 2-move script `["w", "s"]` repeats 5 times in one 10-tick round
- **Example 2**: 3-move script `["d", "a", "."]` cycles as: d, a, ., d, a, ., d, a, ., d
- **Example 3**: 20-move script cycles twice per round (5 ticks each)

## Flexible Player Input

Players can now enter 1-10+ move tokens instead of exactly 10:

- **1 move**: `d` cycles right 10 times
- **2 moves**: `ww` cycles up 5 times
- **4 moves**: `ddss` cycles right-right-down-down pattern
- **10 moves**: `wwdd..fass` plays sequence once (backward compatible)
- **Any length**: Cycles automatically through the 10-tick round

**Input Format:**
```
Enter moves (1-10+ chars, will cycle each round; e.g. w d . or wwdd..fass):
```

## New Game Mechanics

### Slip Tiles (Terrain 4)
When you step on a slip tile, you're forced to continue sliding in the same direction. This can chain - if you slide onto lava, you die!

### Skip Tiles (Terrain 5)
Landing on a skip tile makes your next action a automatic wait. Useful for traps or tactical positioning.

### Duplicate Tiles (Terrain 7)
Landing here creates a copy of you on an adjacent tile. Useful for puzzle elements or creating tactical duplicates.

### Push Tiles (Terrain 8)
You get pushed backward (opposite of your movement direction). Can combine with other terrain for interesting chains.

### Repeat Tiles (Terrain 9)
Your next move repeats your previous move direction. Creates momentum/slipping effects without the forced slide.

## Backward Compatibility

- Existing 10-move scripts work unchanged
- Existing maps load and play identically
- Only new maps can use short/long scripts and new terrain types
- Original Level 1 still works perfectly

## Example Map with New Features

```json
{
  "name": "Feature Showcase",
  "vision": 5,
  "grid": [
    ["1A", "4",  "5",  "6",  "6" ],
    ["1",  "1",  "1",  "1",  "1" ],
    ["1",  "7",  "8",  "9",  "1s"],
    ["1",  "1",  "1",  "1",  "1" ]
  ],
  "scripts": {
    "s": ["s", "."],
    "a": ["d"]
  }
}
```

- Hero `A` starts on grass
- Sheep `s` has 2-move loop: down, wait
- Enemy `a` has 1-move loop: right (moves right every tick)
- Player can test terrains 4-9 by navigating the grid
