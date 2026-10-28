// Ground: a big plane textured with the Poly Haven "Leafy Grass" PBR set,
// plus a low timber edge so the playable area reads clearly from the air.
import * as THREE from 'three'

const BASE = 'assets/textures/leafy_grass/leafy_grass_'
const TILE_METERS = 5 // one texture tile covers this many metres

export function createGround(scene, renderer, halfSize) {
  const loader = new THREE.TextureLoader()
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  const repeat = (halfSize * 2) / TILE_METERS

  const tile = (tex, srgb = false) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeat, repeat)
    tex.anisotropy = maxAniso
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  const material = new THREE.MeshStandardMaterial({
    map: tile(loader.load(BASE + 'color.jpg'), true),
    normalMap: tile(loader.load(BASE + 'normal.jpg')),
    roughnessMap: tile(loader.load(BASE + 'roughness.jpg')),
    color: 0xffffff,
    roughness: 1,
    metalness: 0
  })
  material.normalScale.set(0.8, 0.8)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(halfSize * 2, halfSize * 2), material)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  // Endless meadow skirt so the lawn never shows a visible edge under the fog.
  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(halfSize * 60, halfSize * 60),
    new THREE.MeshStandardMaterial({ color: 0x778c52, roughness: 1 })
  )
  skirt.rotation.x = -Math.PI / 2
  skirt.position.y = -0.05
  scene.add(skirt)

  return ground
}

// Four low hedge-like walls marking the invisible arena clamp.
export function createArenaEdge(scene, halfSize) {
  const edge = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f4a26, roughness: 0.95 })
  const thickness = 1.2
  const height = 1.1
  const long = new THREE.BoxGeometry(halfSize * 2 + thickness, height, thickness)
  const wide = new THREE.BoxGeometry(thickness, height, halfSize * 2 + thickness)

  const add = (geo, x, z) => {
    const wall = new THREE.Mesh(geo, mat)
    wall.position.set(x, height / 2, z)
    wall.castShadow = true
    wall.receiveShadow = true
    edge.add(wall)
  }

  add(long, 0, -halfSize)
  add(long, 0, halfSize)
  add(wide, -halfSize, 0)
  add(wide, halfSize, 0)
  scene.add(edge)
  return edge
}
