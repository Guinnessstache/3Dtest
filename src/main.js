// Starter 3D game: roll a ball around a floor and collect spinning gems.
// Available imports: 'three' and 'three/addons/...' (see index.html import map).
// Models: put .glb files in /assets and load them with GLTFLoader from
// 'three/addons/loaders/GLTFLoader.js'.
import * as THREE from 'three'
import { createBarrels, bounceOffBarrels, updateBarrels, blockedByBarrel } from './barrels.js'
import { createGround, createArenaEdge } from './ground.js'

const BALL_RADIUS = 1

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9dc4e0)
scene.fog = new THREE.Fog(0x9dc4e0, 34, 95)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200)

scene.add(new THREE.HemisphereLight(0xdff0ff, 0x3a4a2c, 1.15))
const sun = new THREE.DirectionalLight(0xfff4d6, 2.4)
sun.position.set(10, 20, 8)
sun.castShadow = true
sun.shadow.camera.left = sun.shadow.camera.bottom = -30
sun.shadow.camera.right = sun.shadow.camera.top = 30
scene.add(sun)

const ARENA = 24
// Grass lawn instead of a flat colour plane; the grid helper is gone so the
// turf can read on its own. A low hedge marks the arena bounds.
createGround(scene, renderer, ARENA)
createArenaEdge(scene, ARENA)

const player = new THREE.Mesh(
  new THREE.SphereGeometry(1, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.3 })
)
player.position.y = 1
player.castShadow = true
scene.add(player)

// Barrels: solid obstacles scattered around the arena that the ball bounces off.
const barrels = createBarrels(scene)

const gems = []
const gemGeo = new THREE.OctahedronGeometry(0.6)
const gemMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x664400 })
const SPREAD = ARENA - 3 // keep gems inside the hedge walls
function gemSpot() {
  let x = 0
  let z = 0
  do {
    x = (Math.random() - 0.5) * SPREAD * 2
    z = (Math.random() - 0.5) * SPREAD * 2
  } while (blockedByBarrel(x, z, barrels, 2.5))
  return [x, z]
}
function spawnGem() {
  const gem = new THREE.Mesh(gemGeo, gemMat)
  const [x, z] = gemSpot()
  gem.position.set(x, 1, z)
  gem.castShadow = true
  scene.add(gem)
  gems.push(gem)
}
for (let i = 0; i < 8; i++) spawnGem()

const keys = {}
addEventListener('keydown', (e) => (keys[e.code] = true))
addEventListener('keyup', (e) => (keys[e.code] = false))

let score = 0
let bumpTimer = 0
let lastBarrelCount = -1
const hud = document.getElementById('hud')
const velocity = new THREE.Vector3()
const timer = new THREE.Timer()

function tick() {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)

  const input = new THREE.Vector3(
    (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
    0,
    (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0)
  )
  if (input.lengthSq() > 0) input.normalize()
  velocity.addScaledVector(input, 30 * dt)
  velocity.multiplyScalar(1 - 2.5 * dt)
  player.position.addScaledVector(velocity, dt)

  if (bounceOffBarrels(player.position, velocity, barrels, BALL_RADIUS)) {
    hud.textContent = `Score: ${score}   BONK!`
    clearTimeout(bumpTimer)
    bumpTimer = setTimeout(() => (hud.textContent = `Score: ${score}`), 350)
  }
  updateBarrels(barrels, dt)

  // Barrels finish loading asynchronously: move any gem that ended up inside one.
  if (barrels.length !== lastBarrelCount) {
    lastBarrelCount = barrels.length
    for (const gem of gems) {
      if (blockedByBarrel(gem.position.x, gem.position.z, barrels, 2.5)) {
        const [x, z] = gemSpot()
        gem.position.set(x, 1, z)
      }
    }
  }

  // Rest the ball against the inside of the hedge (inner face sits at ARENA - 0.6).
  player.position.x = THREE.MathUtils.clamp(player.position.x, -ARENA + 1.6, ARENA - 1.6)
  player.position.z = THREE.MathUtils.clamp(player.position.z, -ARENA + 1.6, ARENA - 1.6)
  player.rotation.x += velocity.z * dt
  player.rotation.z -= velocity.x * dt

  for (let i = gems.length - 1; i >= 0; i--) {
    const gem = gems[i]
    gem.rotation.y += 2 * dt
    if (gem.position.distanceTo(player.position) < 1.6) {
      scene.remove(gem)
      gems.splice(i, 1)
      score += 10
      hud.textContent = `Score: ${score}`
      spawnGem()
    }
  }

  camera.position.lerp(new THREE.Vector3(player.position.x, 14, player.position.z + 16), 0.08)
  camera.lookAt(player.position)
  renderer.render(scene, camera)
}
renderer.setAnimationLoop(tick)

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
