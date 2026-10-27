# 3Dtest

## Concept
A 3D starter: roll a ball around an arena collecting spinning gems.

## Controls
- WASD / arrows: roll

## Current features
- Grassy lawn arena (Poly Haven "Leafy Grass" PBR colour/normal/roughness tiles,
  new src/ground.js) with a low hedge marking the bounds, daylight sky fog
- Lit arena with shadows and a follow camera
- Ball with momentum
- Gems that respawn when collected (never inside a barrel)
- 5 Barrel_01 props (Poly Haven, CC0) placed around the arena — solid obstacles
  with circle colliders: the ball reflects off them (with a little energy loss),
  the barrels wobble on impact and the HUD flashes "BONK!"
- Score HUD

## Ideas / to do
- Barrel hit sound effect
- Knock barrels over / push them when hit fast enough
- Scattered grass tufts / flowers for silhouette break-up on the lawn
