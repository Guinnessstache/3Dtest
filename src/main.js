// Roll a ball around a grassy arena collecting skittish gems while a hatchback
// hunts you down. Ram a barrel or get touched by the car and the run is over.
import * as THREE from 'three'
import { createBarrels, checkBarrels, detonate, updateBarrels, resetBarrels } from './barrels.js'
import { createGround, createArenaEdge } from './ground.js'
import { createGems } from './gems.js'
import { createCar } from './car.js'
import { createFx } from './fx.js'

const BALL_RADIUS = 1
const ARENA = 24
const GEM_SCORE = 10

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

createGround(scene, renderer, ARENA)
createArenaEdge(scene, ARENA)

const player = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_RADIUS, 32, 16),
  new THREE.MeshStandardMaterial({ color: 0x4cc9f0, roughness: 0.3 })
)
player.position.y = BALL_RADIUS
player.castShadow = true
scene.add(player)

const barrels = createBarrels(scene)
const fx = createFx(scene)
const gems = createGems(scene, { count: 6, arena: ARENA, barrels })
const car = createCar(scene, { arena: ARENA })

const keys = {}
addEventListener('keyup', (e) => (keys[e.code] = false))

const hud = document.getElementById('hud')
const help = document.getElementById('help')
const banner = document.getElementById('banner')
const warn = document.getElementById('warn')

const velocity = new THREE.Vector3()
const camTarget = new THREE.Vector3()
const shakeOffset = new THREE.Vector3()
const timer = new THREE.Timer()

let score = 0
let best = 0
let elapsed = 0
let bumpTimer = 0
let lastBarrelCount = -1
const state = { over: false, reason: '' }

addEventListener('keydown', (e) => {
  keys[e.code] = true
  if (state.over && (e.code === 'KeyR' || e.code === 'Enter')) restart()
})

function setHud(text) {
  hud.textContent = text
}

function gameOver(reason) {
  if (state.over) return
  state.over = true
  state.reason = reason
  best = Math.max(best, score)
  banner.innerHTML = `<b>${reason}</b><span>Score ${score} &middot; Best ${best}</span><em>Press R to play again</em>`
  banner.classList.add('show')
  warn.classList.remove('show')
}

function restart() {
  state.over = false
  state.reason = ''
  score = 0
  velocity.set(0, 0, 0)
  player.position.set(0, BALL_RADIUS, 0)
  player.visible = true
  player.scale.set(1, 1, 1)
  resetBarrels(barrels)
  gems.reset()
  car.reset()
  fx.clear()
  banner.classList.remove('show')
  setHud('Score: 0')
}

function tick() {
  timer.update()
  const dt = Math.min(timer.getDelta(), 0.05)
  elapsed += dt

  if (!state.over) {
    const input = new THREE.Vector3(
      (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
      0,
      (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0)
    )
    if (input.lengthSq() > 0) input.normalize()
    velocity.addScaledVector(input, 30 * dt)
    velocity.multiplyScalar(1 - 2.5 * dt)
    player.position.addScaledVector(velocity, dt)

    // Barrels are solid obstacles — and volatile ones if you hit them hard.
    const { bounced, boom } = checkBarrels(player.position, velocity, barrels, BALL_RADIUS)
    if (boom) {
      detonate(scene, fx, boom)
      fx.explode(player.position, { count: 14, power: 1.2, color: 0x8fd8ff })
      gameOver('KABOOM! You rammed a barrel')
    } else if (bounced) {
      setHud(`Score: ${score}   BONK!`)
      clearTimeout(bumpTimer)
      bumpTimer = setTimeout(() => setHud(`Score: ${score}`), 350)
    }
    updateBarrels(barrels, dt)

    // Barrels load asynchronously: shift gems that ended up inside one.
    if (barrels.length !== lastBarrelCount) {
      lastBarrelCount = barrels.length
      gems.relocate()
    }

    // Rest the ball against the inside of the hedge.
    player.position.x = THREE.MathUtils.clamp(player.position.x, -ARENA + 1.6, ARENA - 1.6)
    player.position.z = THREE.MathUtils.clamp(player.position.z, -ARENA + 1.6, ARENA - 1.6)
    player.rotation.x += velocity.z * dt
    player.rotation.z -= velocity.x * dt

    const got = gems.update(dt, player.position, elapsed)
    if (got) {
      score += GEM_SCORE * got
      setHud(`Score: ${score}`)
    }

    // The hatchback never gets tired. Each gem makes it faster.
    const caught = car.update(dt, player.position, barrels, score / GEM_SCORE)
    const gap = car.distanceTo(player.position)
    warn.classList.toggle('show', gap < 12)
    if (gap < 12) warn.textContent = gap < 6 ? 'CAR! CAR! CAR!' : 'Car closing in'
    if (caught) {
      player.scale.set(1.6, 0.25, 1.6) // squashed flat
      fx.explode(player.position, { count: 24, power: 1.4, color: 0xff4d4d })
      gameOver('FLATTENED! The car got you')
    }
  }

  fx.update(dt)

  // Follow camera with a little impact shake; creep in close when you die.
  const height = state.over ? 9 : 14
  const back = state.over ? 10 : 16
  camTarget.set(player.position.x, height, player.position.z + back)
  camera.position.lerp(camTarget, 0.08)
  if (fx.shake > 0.001) {
    shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(fx.shake * 1.4)
    camera.position.add(shakeOffset)
  }
  camera.lookAt(player.position.x, 1, player.position.z)

  renderer.render(scene, camera)
}
renderer.setAnimationLoop(tick)

help.textContent = 'WASD / arrows to roll — grab the moving gems, dodge the car, and do NOT hit the barrels'
banner.addEventListener('click', () => { if (state.over) restart() })

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
