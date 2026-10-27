// Gems: they no longer sit still — each one wanders the lawn, bounces off the
// hedge and the barrels, and scampers away when the ball gets close.
import * as THREE from 'three'

const GEM_SPEED = 2.9 // cruising speed of a wandering gem
const FLEE_SPEED = 5.4 // top speed while running away from the player
const FLEE_RADIUS = 7
const COLLECT_DIST = 1.6

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
}

export function createGems(scene, { count = 6, arena, barrels }) {
  const geo = new THREE.OctahedronGeometry(0.55)
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0x8a5a00,
    emissiveIntensity: 1.1,
    roughness: 0.3,
    metalness: 0.35
  })

  const bounds = arena - 2.4 // gems stay clear of the hedge
  const gems = []

  function clearOfBarrels(x, z) {
    for (const c of barrels) {
      if (!c.alive) continue
      const dx = x - c.x
      const dz = z - c.z
      const r = c.radius + 1.8
      if (dx * dx + dz * dz < r * r) return false
    }
    return true
  }

  function spot() {
    let x = 0
    let z = 0
    for (let i = 0; i < 60; i++) {
      x = (Math.random() * 2 - 1) * bounds
      z = (Math.random() * 2 - 1) * bounds
      if (clearOfBarrels(x, z)) break
    }
    return [x, z]
  }

  function place(gem) {
    const [x, z] = spot()
    gem.mesh.position.set(x, 1, z)
    gem.heading = Math.random() * Math.PI * 2
    gem.speed = GEM_SPEED
  }

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    scene.add(mesh)
    const gem = { mesh, heading: 0, speed: GEM_SPEED, phase: Math.random() * 6.28 }
    place(gem)
    gems.push(gem)
  }

  // Move one gem: wander, flee the player, avoid the hedge and the barrels.
  function steer(gem, dt, playerPos) {
    const p = gem.mesh.position
    gem.heading += (Math.random() - 0.5) * 3 * dt

    const dx = p.x - playerPos.x
    const dz = p.z - playerPos.z
    const dist = Math.hypot(dx, dz)
    let target = GEM_SPEED
    if (dist < FLEE_RADIUS && dist > 0.001) {
      const away = Math.atan2(dx, dz)
      gem.heading += wrapAngle(away - gem.heading) * Math.min(1, dt * 4)
      target = FLEE_SPEED
    }

    // Nudge back toward the middle before the hedge so gems stay reachable.
    const edge = bounds - Math.max(Math.abs(p.x), Math.abs(p.z))
    if (edge < 3.5) gem.heading += wrapAngle(Math.atan2(-p.x, -p.z) - gem.heading) * Math.min(1, dt * 3)

    gem.speed += (target - gem.speed) * Math.min(1, dt * 2.4)
    p.x += Math.sin(gem.heading) * gem.speed * dt
    p.z += Math.cos(gem.heading) * gem.speed * dt

    // Bounce off the hedge walls.
    if (p.x > bounds) { p.x = bounds; gem.heading = -gem.heading }
    else if (p.x < -bounds) { p.x = -bounds; gem.heading = -gem.heading }
    if (p.z > bounds) { p.z = bounds; gem.heading = Math.PI - gem.heading }
    else if (p.z < -bounds) { p.z = -bounds; gem.heading = Math.PI - gem.heading }

    // Bounce off barrels so gems never get stuck inside a hazard.
    for (const c of barrels) {
      if (!c.alive) continue
      const ox = p.x - c.x
      const oz = p.z - c.z
      const minDist = c.radius + 1.1
      const d2 = ox * ox + oz * oz
      if (d2 >= minDist * minDist || d2 === 0) continue
      const d = Math.sqrt(d2)
      const nx = ox / d
      const nz = oz / d
      p.x = c.x + nx * minDist
      p.z = c.z + nz * minDist
      let vx = Math.sin(gem.heading)
      let vz = Math.cos(gem.heading)
      const into = vx * nx + vz * nz
      if (into < 0) {
        vx -= 2 * into * nx
        vz -= 2 * into * nz
        gem.heading = Math.atan2(vx, vz)
      }
    }
  }

  // Advance the gems; returns how many the player collected this frame.
  function update(dt, playerPos, elapsed) {
    let collected = 0
    for (const gem of gems) {
      steer(gem, dt, playerPos)
      gem.mesh.rotation.y += 2.6 * dt
      gem.mesh.position.y = 1 + Math.sin(elapsed * 2.4 + gem.phase) * 0.3

      const dx = gem.mesh.position.x - playerPos.x
      const dz = gem.mesh.position.z - playerPos.z
      if (dx * dx + dz * dz < COLLECT_DIST * COLLECT_DIST) {
        collected++
        place(gem)
      }
    }
    return collected
  }

  // Barrels arrive asynchronously: shift any gem that ended up inside one.
  function relocate() {
    for (const gem of gems) {
      if (!clearOfBarrels(gem.mesh.position.x, gem.mesh.position.z)) place(gem)
    }
  }

  function reset() {
    for (const gem of gems) place(gem)
  }

  return { update, relocate, reset, gems }
}
