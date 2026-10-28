// Roll a ball around a grassy arena collecting skittish gems while a hatchback
// hunts you down. Ram a barrel or get touched by the car and the run is over.
import * as THREE from 'three'
import { createBarrels, checkBarrels, detonate, updateBarrels, resetBarrels } from './barrels.js'
import { createGround, createArenaEdge } from './ground.js'
import { createGems } from './gems.js'
import { createCar } from './car.js'
import { createFx } from './fx.js'
import { createSky, SKY_FOG_COLOR } from './sky.js'

const BALL_RADIUS = 1
const ARENA = 24
const GEM_SCORE = 10

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.toneMapping = THREE.ACESFilmicToneMapping // filmic rolloff so the HDR sky doesn't clip
renderer.toneMappingExposure = 1.0
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
// Placeholder horizon haze until the HDRI arrives, then match fog to the sky.
// Kept far back so the whole lawn reads crisply from the high chase camera.
scene.background = new THREE.Color(SKY_FOG_COLOR)
scene.fog = new THREE.Fog(SKY_FOG_COLOR, 70, 230)

// Vertical field of view. Wide-ish on purpose: the horizon only stays in frame
// while pitch < FOV/2, so a generous FOV is what buys us a top-down angle that
// still shows skyline (see CAM_PITCH below).
const BASE_FOV = 66
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 4000)

// Chase rig: high and far so most of the lawn is visible — you can see the car
// coming from across the arena. Pitch stays under half the vertical FOV, which
// keeps a band of real HDRI skyline along the top of the screen.
const CAM_DIST = 34
const CAM_PITCH = THREE.MathUtils.degToRad(27)
const DEAD_DIST = 18
const DEAD_PITCH = THREE.MathUtils.degToRad(29) // still < FOV/2, so the sky survives the death zoom-in

// Portrait screens have a narrow horizontal spread, so widen the vertical FOV
// to keep roughly the same amount of arena on screen either way.
function fitFov() {
  const aspect = window.innerWidth / window.innerHeight
  camera.aspect = aspect
  camera.fov = aspect >= 1 ? BASE_FOV : Math.min(84, BASE_FOV / Math.max(aspect, 0.55))
  camera.updateProjectionMatrix()
}
fitFov()

// The HDRI does most of the ambient work now; these just shape the shadows and
// get re-tinted by createSky to suit whatever sky actually loaded.
const hemi = new THREE.HemisphereLight(0xdff0ff, 0x4a5236, 0.4)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff0d0, 2.2)
sun.position.set(-26, 34, -18)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048) // the camera is high now: keep props crisply shadowed
sun.shadow.camera.left = sun.shadow.camera.bottom = -36
sun.shadow.camera.right = sun.shadow.camera.top = 36
sun.shadow.bias = -0.0005
scene.add(sun)

createSky(scene, {
  environmentIntensity: 0.9,
  blur: 0.015,
  sunLight: sun,
  hemiLight: hemi,
  // Brighter skies get less exposure — keeps the clouds out of clipping.
  onExposure: (v) => (renderer.toneMappingExposure = v)
})

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
const lookTarget = new THREE.Vector3()
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

  // Follow camera: high above and behind the ball, looking straight at it so the
  // pitch stays exactly CAM_PITCH and the HDRI horizon stays in frame. It eases
  // back a little as you near the hedge, so the whole board stays legible.
  const edge = Math.max(Math.abs(player.position.x), Math.abs(player.position.z)) / ARENA
  const dist = state.over ? DEAD_DIST : CAM_DIST + Math.max(0, edge - 0.45) * 18
  const pitch = state.over ? DEAD_PITCH : CAM_PITCH
  camTarget.set(
    player.position.x,
    player.position.y + Math.sin(pitch) * dist,
    player.position.z + Math.cos(pitch) * dist
  )
  camera.position.lerp(camTarget, 0.1)
  if (fx.shake > 0.001) {
    shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(fx.shake * 1.4)
    camera.position.add(shakeOffset)
  }
  lookTarget.set(player.position.x, 0.6, player.position.z)
  camera.lookAt(lookTarget)

  renderer.render(scene, camera)
}
renderer.setAnimationLoop(tick)

help.textContent = 'WASD / arrows to roll — grab the moving gems, dodge the car, and do NOT hit the barrels'
banner.addEventListener('click', () => { if (state.over) restart() })

addEventListener('resize', () => {
  fitFov()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
