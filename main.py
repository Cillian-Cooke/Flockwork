"""Entry point: play a level in the terminal.

    python main.py maps/level1.json
"""

import sys

from game.gameloop import play_file
from game.mapfile import MapError


def main(argv):
    if len(argv) != 2:
        print("usage: python main.py <map.json>")
        return 2
    try:
        play_file(argv[1])
    except FileNotFoundError:
        print(f"no such map file: {argv[1]}")
        return 1
    except MapError as exc:
        print(f"bad map: {exc}")
        return 1
    except (EOFError, KeyboardInterrupt):
        print("\nbye.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
