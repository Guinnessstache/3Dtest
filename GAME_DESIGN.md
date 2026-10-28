# 3Dtest

## Concept
Roll a ball around a sunny grass arena grabbing skittish gems while a low-poly
hatchback hunts you down. Barrels are solid — and volatile if you hit them hard.

## Controls
- WASD / arrows: roll
- C (or click the CAM pill): switch chase camera (TOP-DOWN ⇄ SKYLINE)
- R or Enter (or click the card): restart after a game over

## Current features
- **The player is your BallCharacter** (src/player.js, `assets/models/ballcharacter/ballcharacter.glb`):
  loaded with GLTFLoader, auto-scaled to 1.75 m and stood on the grass whatever
  its origin ended up as. It swivels to face where it rolls, leans into the
  throttle, waddle-bobs faster the quicker it goes, spins its energy rings and
  pulses its emissive arcs — and squashes flat when the car reaches it. A
  code-built ball stands in if the glb ever fails to load.
- Grassy lawn arena (Poly Haven "Leafy Grass" PBR tiles, src/ground.js) with a
  low hedge marking the bounds, shadows, and an open view of the countryside
- **Real sky** (src/sky.js): the Poly Haven HDRI **"Kloppenheim 03 (Pure Sky)"**
  is the background *and* the environment map (image-based lighting), so props
  reflect the fields. ACES tone mapping, fog colour measured from the panorama's
  horizon band, and exposure/lights auto-tuned to the sky's brightness; a gradient
  dome stands in if the .hdr ever fails to load.
- **Two chase cameras** (press C, or click the CAM pill). `TOP-DOWN` — default — sits 29 m out at a 47°
  pitch with a 58° FOV: the whole board reads at a glance, props only hide a
  short wedge behind them, and near/far objects are within ~2× of each other in
  size. At that angle the frustum never reaches the horizon, so the sky is out of
  frame (the HDRI still provides all lighting/reflections) and fog pulls in to
  40–115 m. `SKYLINE` sits 34 m out at 26° with a 66° FOV — under half the
  vertical FOV, which is what keeps a band of real skyline along the top of the
  screen — with a long 70–230 m fog reach. Portrait screens widen either rig's
  FOV to keep the same amount of arena in frame.
- **Moving gems** (src/gems.js): six gems wander the lawn, bounce off the hedge
  and barrels, and flee when the ball gets close. Collecting one is +10 and it
  respawns somewhere else.
- **The car** (src/car.js): Poly Haven low-poly hatchback, auto-scaled to ~4.2 m
  and auto-oriented so it drives nose-first. It steers toward the player, probes
  ahead for barrels (reverses and swings around them) and turns back at the
  hedge. Wheels spin. **Touching it = game over** ("FLATTENED!").
  Each gem collected makes it faster (9.5 → 15 m/s cap).
- **Explosive barrels** (src/barrels.js): five Barrel_01 props with circle
  colliders. A soft bump still bounces you, but hitting one at speed detonates
  it — debris + shockwave + scorch mark — and ends the run ("KABOOM!").
- FX module (src/fx.js): pooled shard/ring/flash explosions and camera shake.
- HUD: score, a blinking "Car closing in / CAR!" proximity warning, and a game
  over card showing score and best.

## Hazards / game over
- Touched by the car
- Ramming a barrel too fast (slow nudges are safe bounces)

## Ideas / to do
- Explosion + engine sounds
- A pickup that freezes or slows the car for a few seconds
- Scattered grass tufts / flowers for silhouette break-up on the lawn
- Difficulty ramp: a second car after a high score
