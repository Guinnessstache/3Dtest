// Barrels: load the Poly Haven Barrel_01 glTF, place copies around the arena,
// and expose simple circle colliders the ball bounces off.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_URL = 'assets/models/Barrel_01/Barrel_01.gltf'
const TARGET_HEIGHT = 3.2 // barrels are scaled so they read well next to the ball

// Where the barrels stand (x, z) and a per-barrel spin for variety.
export const BARREL_SPOTS = [
  { x: 0, z: -9, rot: 0.4 },
  { x: 10, z: -3, rot: 1.7 },
  { x: 6, z: 8, rot: 2.9 },
  { x: -7, z: 7, rot: 0.9 },
  { x: -11, z: -6, rot: 2.2 }
]

// Each collider: { x, z, radius, mesh, hitT }
export function createBarrels(scene, spots = BARREL_SPOTS) {
  const colliders = []

  const register = (proto, scale, baseY) => {
    for (const spot of spots) {
      const barrel = proto.clone(true)
      barrel.scale.setScalar(scale)
      barrel.position.set(spot.x, baseY, spot.z)
      barrel.rotation.y = spot.rot
      barrel.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      scene.add(barrel)
      colliders.push({ x: spot.x, z: spot.z, radius: 0, mesh: barrel, hitT: 0 })
    }
  }

  const measureAndRegister = (root) => {
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3()
    box.getSize(size)
    const scale = size.y > 0.01 ? TARGET_HEIGHT / size.y : 1
    // Seat the barrel on the floor even if the model's origin is at its centre.
    register(root, scale, -box.min.y * scale)
    const radius = Math.max(size.x, size.z) * 0.5 * scale * 0.92
    for (const c of colliders) c.radius = Math.max(0.6, radius)
  }

  // Fallback so the arena still has bounce-able obstacles if the model fails.
  const fallback = () => {
    const geo = new THREE.CylinderGeometry(1.1, 1.1, TARGET_HEIGHT, 20)
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 })
    const proto = new THREE.Mesh(geo, mat)
    register(proto, 1, TARGET_HEIGHT / 2)
    for (const c of colliders) c.radius = 1.05
    console.warn('[barrels] glTF failed to load — using simple cylinders')
  }

  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => measureAndRegister(gltf.scene),
    undefined,
    fallback
  )

  return colliders
}

// Push the ball out of any barrel it overlaps and reflect its velocity.
// Returns true when a bounce happened this frame.
export function bounceOffBarrels(position, velocity, colliders, ballRadius) {
  let bounced = false
  for (const c of colliders) {
    const dx = position.x - c.x
    const dz = position.z - c.z
    const minDist = c.radius + ballRadius
    const distSq = dx * dx + dz * dz
    if (distSq >= minDist * minDist || distSq === 0) continue

    const dist = Math.sqrt(distSq)
    const nx = dx / dist
    const nz = dz / dist

    // Separate the ball from the barrel.
    position.x = c.x + nx * minDist
    position.z = c.z + nz * minDist

    // Mirror the velocity along the contact normal, losing a little energy.
    const into = velocity.x * nx + velocity.z * nz
    if (into < 0) {
      const RESTITUTION = 0.72
      velocity.x -= (1 + RESTITUTION) * into * nx
      velocity.z -= (1 + RESTITUTION) * into * nz
      // Guarantee a visible rebound even on slow, glancing contacts.
      const kick = Math.min(6, 2 + Math.abs(into))
      velocity.x += nx * kick
      velocity.z += nz * kick
      c.hitT = 1
    }
    bounced = true
  }
  return bounced
}

// Decay the wobble a barrel plays after being hit.
export function updateBarrels(colliders, dt) {
  for (const c of colliders) {
    if (c.hitT <= 0) continue
    c.hitT = Math.max(0, c.hitT - dt * 2.6)
    const w = c.hitT * 0.14
    c.mesh.rotation.x = Math.sin(c.hitT * 22) * w
    c.mesh.rotation.z = Math.cos(c.hitT * 19) * w
  }
}

// True when a point is too close to any barrel (used to keep gems reachable).
export function blockedByBarrel(x, z, colliders, margin) {
  for (const c of colliders) {
    const dx = x - c.x
    const dz = z - c.z
    const r = c.radius + margin
    if (dx * dx + dz * dz < r * r) return true
  }
  return false
}
