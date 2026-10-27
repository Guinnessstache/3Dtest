// The car: a low-poly hatchback that hunts the ball down across the lawn.
// Simple steering — aim at the player, steer around barrels and the hedge, and
// back off and turn when something is in the way. Touching it ends the run.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_URL = 'assets/models/car-hatchback-BG0KAhmGDt/car-hatchback.glb'
const CAR_LENGTH = 4.2 // scaled to this many metres long
const BASE_SPEED = 9.5
const MAX_SPEED = 15
const SPEED_PER_GEM = 0.45 // each gem collected makes it angrier
const TURN_RATE = 2.6
const BODY_RADIUS = 1.5

function wrapAngle(a) {
  return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
}

export function createCar(scene, { arena }) {
  const root = new THREE.Group()
  scene.add(root)

  const state = {
    pos: new THREE.Vector3(0, 0, 0),
    heading: 0,
    speed: BASE_SPEED,
    reverse: 0,
    radius: BODY_RADIUS
  }

  const wheels = []
  const axle = new THREE.Vector3()

  // Collect the car's vertices in `object` space so we can measure it.
  const points = (object) => {
    const out = []
    const v = new THREE.Vector3()
    object.updateMatrixWorld(true)
    object.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return
      const pos = o.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
        out.push(v.x, v.y, v.z)
      }
    })
    return out
  }

  // Yaw that turns the model so its nose points along local +Z (our heading).
  // The long axis is the length; on a hatchback the cabin sits toward the rear,
  // so the upper bulk tells us which end is the back.
  const faceForward = (object) => {
    const pts = points(object)
    if (!pts.length) return
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < pts.length; i += 3) {
      minX = Math.min(minX, pts[i])
      maxX = Math.max(maxX, pts[i])
      minY = Math.min(minY, pts[i + 1])
      maxY = Math.max(maxY, pts[i + 1])
      minZ = Math.min(minZ, pts[i + 2])
      maxZ = Math.max(maxZ, pts[i + 2])
    }
    const alongX = maxX - minX
    const alongZ = maxZ - minZ
    const roofY = minY + (maxY - minY) * 0.55

    let upper = 0
    let sum = 0
    for (let i = 0; i < pts.length; i += 3) {
      if (pts[i + 1] < roofY) continue
      upper++
      sum += alongX > alongZ ? pts[i] : pts[i + 2]
    }
    const centre = alongX > alongZ ? (minX + maxX) / 2 : (minZ + maxZ) / 2
    const bias = upper ? sum / upper - centre : 0
    const frontIsNegative = bias > 0 // cabin toward +axis means that end is the rear

    if (alongX > alongZ) object.rotation.y = frontIsNegative ? Math.PI / 2 : -Math.PI / 2
    else if (frontIsNegative) object.rotation.y = Math.PI
  }

  const finish = (object) => {
    root.add(object)
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(object)
    const size = new THREE.Vector3()
    box.getSize(size)
    const longest = Math.max(size.x, size.z) || 1
    object.scale.multiplyScalar(CAR_LENGTH / longest)
    state.radius = CAR_LENGTH * 0.4

    // Spin anything that looks like a wheel, and make sure it casts shadows.
    object.traverse((o) => {
      if (o.isMesh) o.castShadow = true
      if (/wheel|tyre|tire/i.test(o.name)) wheels.push(o)
    })

    faceForward(object)
    root.updateMatrixWorld(true)
    // Sit the chassis on the grass regardless of where the model's origin sits.
    object.position.y -= new THREE.Box3().setFromObject(object).min.y
  }

  const fallbackCar = () => {
    const car = new THREE.Group()
    const paint = new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.35, metalness: 0.5 })
    const glass = new THREE.MeshStandardMaterial({ color: 0x1d2b3a, roughness: 0.1, metalness: 0.6 })
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4), paint)
    hull.position.y = 0.75
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2), glass)
    cabin.position.set(0, 1.35, -0.15)
    car.add(hull, cabin)
    for (const [x, z] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16),
        new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.9 })
      )
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, 0.42, z)
      car.add(wheel)
    }
    car.traverse((o) => { if (o.isMesh) o.castShadow = true })
    finish(car)
    console.warn('[car] glb failed to load — using a boxy stand-in')
  }

  new GLTFLoader().load(MODEL_URL, (gltf) => finish(gltf.scene), undefined, fallbackCar)

  // Pick a heading: straight at the player unless a barrel or the hedge is in
  // the way, in which case slide around it.
  function steer(dt, playerPos, barrels, bounds) {
    const p = state.pos
    let want = Math.atan2(playerPos.x - p.x, playerPos.z - p.z)

    const nose = BODY_RADIUS + 2.6
    const probeX = p.x + Math.sin(want) * nose
    const probeZ = p.z + Math.cos(want) * nose

    let blockedBy = null
    for (const c of barrels) {
      if (!c.alive) continue
      const dx = probeX - c.x
      const dz = probeZ - c.z
      const r = c.radius + BODY_RADIUS
      if (dx * dx + dz * dz < r * r) blockedBy = Math.atan2(p.x - c.x, p.z - c.z)
    }

    const edgePush = 3.5
    let nearEdge = false
    if (Math.abs(probeX) > bounds - edgePush || Math.abs(probeZ) > bounds - edgePush) {
      nearEdge = true
      want = Math.atan2(-p.x, -p.z) // head back to the middle instead of the wall
    }

    if (blockedBy !== null && !nearEdge) {
      // Reverse away while swinging toward the player.
      state.reverse = Math.min(1, state.reverse + dt * 3)
      const turnTarget = wrapAngle(want - state.heading)
      state.heading += THREE.MathUtils.clamp(turnTarget, -TURN_RATE * dt, TURN_RATE * dt) * 1.6
    } else {
      state.reverse = Math.max(0, state.reverse - dt * 2.4)
      const turn = wrapAngle(want - state.heading)
      state.heading += THREE.MathUtils.clamp(turn, -TURN_RATE * dt, TURN_RATE * dt)
    }
  }

  // Advance the car; returns true when it has caught the player.
  function update(dt, playerPos, barrels, gemsCollected) {
    const targetSpeed = Math.min(MAX_SPEED, BASE_SPEED + gemsCollected * SPEED_PER_GEM)
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 0.35)

    const bounds = arena - 2.2
    steer(dt, playerPos, barrels, bounds)

    const drive = state.reverse > 0.4 ? -state.speed * 0.5 : state.speed
    state.pos.x += Math.sin(state.heading) * drive * dt
    state.pos.z += Math.cos(state.heading) * drive * dt
    state.pos.x = THREE.MathUtils.clamp(state.pos.x, -bounds, bounds)
    state.pos.z = THREE.MathUtils.clamp(state.pos.z, -bounds, bounds)

    root.position.set(state.pos.x, 0, state.pos.z)
    root.rotation.y = state.heading

    // Keep the model upright-ish and give it a menacing idle bob.
    if (wheels.length) {
      // Spin each wheel about its axle (perpendicular to the heading), which
      // works however the glTF authored the wheel nodes.
      axle.set(Math.cos(state.heading), 0, -Math.sin(state.heading))
      for (const wheel of wheels) wheel.rotateOnWorldAxis(axle, drive * dt * 1.4)
    }

    const dx = state.pos.x - playerPos.x
    const dz = state.pos.z - playerPos.z
    const reach = state.radius + 0.9
    return dx * dx + dz * dz < reach * reach
  }

  function reset() {
    state.pos.set(0, 0, -arena + 4)
    state.heading = 0
    state.speed = BASE_SPEED
    state.reverse = 0
    root.position.set(state.pos.x, 0, state.pos.z)
  }
  reset()

  // Distance from the car to a point, used for the HUD danger read-out.
  const distanceTo = (point) => Math.hypot(state.pos.x - point.x, state.pos.z - point.z)

  return { update, reset, distanceTo, root, state }
}
