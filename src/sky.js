// Sky + image-based lighting from the Poly Haven HDRI "Kloppenheim 02".
// The same texture becomes the visible background AND the environment map, so
// the ball, barrels and car pick up real reflections of the fields around them.
import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

const SKY_URL = 'assets/skies/kloppenheim_02_1k.hdr'

// Horizon haze tone used until (or unless) the HDRI is measured.
export const SKY_FOG_COLOR = 0xa9bcc6

// Half-floats straight from an .hdr need expanding; floats do not.
function readChannel(data, i, half) {
  if (!half) return data[i]
  const bits = data[i]
  const sign = (bits & 0x8000) ? -1 : 1
  const exp = (bits >> 10) & 0x1f
  const frac = bits & 0x3ff
  if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024)
  if (exp === 0x1f) return frac ? NaN : sign * Infinity
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024)
}

// Average the pixels just above the horizon so fog/mist always match whatever
// sky is loaded. Returns a THREE.Color in display (sRGB) space, or null.
function horizonColor(texture) {
  try {
    const img = texture.image || {}
    const data = img.data
    if (!data || !img.width || !img.height) return null
    const half = !(data instanceof Float32Array)
    const row = Math.floor(img.height * 0.53)
    const step = Math.max(1, Math.floor(img.width / 48))
    let r = 0, g = 0, b = 0, n = 0
    for (let x = 0; x < img.width; x += step) {
      const i = (row * img.width + x) * 4
      r += readChannel(data, i, half)
      g += readChannel(data, i + 1, half)
      b += readChannel(data, i + 2, half)
      n++
    }
    if (!n) return null
    // Reinhard-ish tone map down to [0,1], then linear -> sRGB.
    const tm = (v) => {
      const t = Math.max(0, Math.min(v / Math.max(n, 1), 8)) / (1 + Math.max(0, Math.min(v / Math.max(n, 1), 8)))
      return Math.pow(t, 1 / 2.2)
    }
    return new THREE.Color().setRGB(tm(r), tm(g), tm(b), THREE.SRGBColorSpace)
  } catch (e) {
    return null
  }
}

// Average luminance of the whole sky, so lights can match its mood (a night
// meadow HDRI should not be lit by a noon sun).
function brightness(texture) {
  try {
    const img = texture.image || {}
    const data = img.data
    if (!data || !img.width || !img.height) return 0.5
    const half = !(data instanceof Float32Array)
    const stepX = Math.max(1, Math.floor(img.width / 40))
    const stepY = Math.max(1, Math.floor(img.height / 24))
    let sum = 0, n = 0
    for (let y = 0; y < img.height; y += stepY) {
      for (let x = 0; x < img.width; x += stepX) {
        const i = (y * img.width + x) * 4
        sum += 0.2126 * readChannel(data, i, half) + 0.7152 * readChannel(data, i + 1, half) + 0.0722 * readChannel(data, i + 2, half)
        n++
      }
    }
    return n ? sum / n : 0.5
  } catch (e) {
    return 0.5
  }
}

// Cheap stand-in if the .hdr ever fails to fetch: a vertical gradient dome.
function fallbackSky(scene) {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 128
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, '#4f7fc4')
  grad.addColorStop(0.55, '#a9bcc6')
  grad.addColorStop(1, '#d9c9a8')
  g.fillStyle = grad
  g.fillRect(0, 0, 8, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  scene.background = tex
  scene.environment = tex
}

export function createSky(scene, { environmentIntensity = 0.65, blur = 0.1, sunLight, hemiLight } = {}) {
  const sky = { texture: null, ready: false, fogColor: new THREE.Color(SKY_FOG_COLOR), brightness: 0.5 }

  // Match the props to the sky's mood: a dusk/night meadow gets cool moonlight,
  // a bright one gets a warm sun. Everything is driven by measured luminance.
  function applyMood(lum) {
    const t = THREE.MathUtils.clamp((lum - 0.12) / 0.55, 0, 1) // 0 = night, 1 = day
    sky.brightness = lum
    if (sunLight) {
      sunLight.color.setRGB(
        THREE.MathUtils.lerp(0.62, 1.0, t),
        THREE.MathUtils.lerp(0.7, 0.94, t),
        THREE.MathUtils.lerp(1.0, 0.82, t)
      )
      sunLight.intensity = THREE.MathUtils.lerp(0.55, 2.0, t)
    }
    if (hemiLight) hemiLight.intensity = THREE.MathUtils.lerp(0.18, 0.45, t)
  }

  new HDRLoader().load(
    SKY_URL,
    (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping
      sky.texture = tex
      sky.ready = true
      scene.background = tex
      scene.environment = tex
      scene.backgroundBlurriness = blur // soften banding but keep horizon detail
      scene.environmentIntensity = environmentIntensity

      const measured = horizonColor(tex)
      if (measured) {
        sky.fogColor.copy(measured)
        if (scene.fog) scene.fog.color.copy(measured)
      }
      applyMood(brightness(tex))
    },
    undefined,
    () => fallbackSky(scene)
  )

  return sky
}
