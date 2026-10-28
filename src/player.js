// The player: the BallCharacter modelled in Blender, wired up to feel alive.
// It owns no physics — main.js moves `position` — this module only loads the
// glb, scales it to a sane height, and animates it (faces where it rolls,
// leans into the turn, waddles along, energy rings spin, flattens when run over).
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_URL = 'assets/models/ballcharacter/ballcharacter.glb'
export const PLAYER_RADIUS = 0.85 // circle collider used against barrels/car reach
export const PLAYER_HEIGHT = 1.75 // scaled metres tall
const TURN_SMOOTH = 11 // how snappily it swivels to face travel

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
}

export function createPlayer(scene) {
  const root = new THREE.Group() // sits on the grass; its origin is between the feet
  const body = new THREE.Group() // the model, leaning/turning inside root
  body.rotation.order = 'YXZ'
  root.add(body)
  scene.add(root)

  const state = { heading: 0, lean: 0, phase: 0, squash: 1 }
  const pulse = [] // emissive materials to breathe: { mat, base }
  let fitScale = 1
  let baseY = 0 // where the model sits on the grass, before the bob
  let rings = null
  let spark = null
  let flat = false

  // Shadows + remember the glowing materials so they can pulse.
  function register(object) {
    object.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = true
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m && m.emissive && !pulse.some((p) => p.mat === m)) {
          pulse.push({ mat: m, base: m.emissiveIntensity ?? 1 })
        }
      }
    })
  }

  // Scale the model to PLAYER_HEIGHT and stand it on the lawn whatever its
  // authoring units or origin ended up as.
  function fit() {
    body.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(body)
    const h = box.max.y - box.min.y || 1
    fitScale = PLAYER_HEIGHT / h
    body.scale.setScalar(fitScale)
    body.position.y = 0
    body.updateMatrixWorld(true)
    baseY = -new THREE.Box3().setFromObject(body).min.y
    body.position.y = baseY
  }

  const finish = (object) => {
    body.add(object)
    object.traverse((o) => {
      if (!o.isMesh) return
      if (/EnergyRings/i.test(o.name)) rings = o
      if (/AntennaSpark/i.test(o.name)) spark = o
    })
    register(object)
    fit()
  }

  // If the glb ever fails to load, keep a recognisable ball so the game runs.
  const fallback = () => {
    const standIn = new THREE.Group()
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a3358, roughness: 0.35 })
    )
    shell.position.y = 0.85
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.06, 8, 32),
      new THREE.MeshStandardMaterial({
        color: 0x8fd8ff,
        emissive: 0x4fb8ff,
        emissiveIntensity: 2,
        roughness: 0.3
      })
    )
    arc.position.y = 0.85
    arc.rotation.x = Math.PI / 2
    standIn.add(shell, arc)
    rings = arc
    finish(standIn)
    console.warn('[player] ballcharacter.glb failed to load — using a stand-in ball')
  }

  new GLTFLoader().load(MODEL_URL, (gltf) => finish(gltf.scene), undefined, fallback)

  function update(dt, velocity, elapsed) {
    const speed = Math.hypot(velocity.x, velocity.z)

    // Turn to face where it's going; stay put when barely moving.
    if (!flat && speed > 0.35) {
      const want = Math.atan2(velocity.x, velocity.z)
      state.heading += wrapAngle(want - state.heading) * Math.min(1, dt * TURN_SMOOTH)
    }

    // Lean into the throttle, and waddle-bob faster the quicker it rolls.
    const targetLean = flat ? 0 : Math.min(0.3, speed * 0.03)
    state.lean += (targetLean - state.lean) * Math.min(1, dt * 8)
    state.phase += dt * (2.6 + speed * 1.5)
    const bob = flat ? 0 : Math.abs(Math.sin(state.phase)) * (0.03 + Math.min(0.14, speed * 0.016))

    // Squash-and-stretch: a little bounce while rolling, pancake when flattened.
    const targetSquash = flat ? 0.28 : 1 - bob * 0.25
    state.squash += (targetSquash - state.squash) * Math.min(1, dt * (flat ? 14 : 12))
    const spread = 1 + (1 - state.squash) * 0.65

    body.rotation.set(state.lean, state.heading, Math.sin(state.phase) * (flat ? 0 : 0.05))
    body.position.y = baseY + bob
    body.scale.set(fitScale * spread, fitScale * state.squash, fitScale * spread)

    if (rings) rings.rotation.y += dt * (1.2 + speed * 0.9)
    if (spark) spark.rotation.y -= dt * 0.8

    const glow = flat ? 0.35 : 0.78 + 0.22 * Math.sin(elapsed * 4.5)
    for (const p of pulse) p.mat.emissiveIntensity = p.base * glow
  }

  function reset() {
    flat = false
    state.heading = 0
    state.lean = 0
    state.squash = 1
    root.position.set(0, 0, 0)
    root.visible = true
  }

  // Called when the car gets there first.
  function squash() {
    flat = true
  }

  return { root, position: root.position, radius: PLAYER_RADIUS, update, reset, squash }
}
