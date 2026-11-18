# Neon Survivor — browser edition

This is a standalone HTML, CSS, and JavaScript recreation. It has no build step
or package dependencies.

## Run locally

From this directory, start any static HTTP server. With Python:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>.

## Controls

- Move with **WASD** or the on-screen joystick.
- Tap **SHOT** to attack the lowest-health enemy; drag from it to aim.
- Tap or drag **BOMB** and **NUKE** to use or aim those skills.
- On desktop, click to fire, right-click for a bomb, and hold **Space** while
  clicking to launch a nuke.
- Use **Settings** to reposition the joystick and skill buttons or adjust their
  size. Settings and best score are saved in this browser.

The original Python game and Flask files remain outside this folder and are not
needed to run this edition.
