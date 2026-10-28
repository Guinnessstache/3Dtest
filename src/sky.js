// Sky + image-based lighting from a Poly Haven HDRI. The same panorama is the
// visible background AND the environment map, so props reflect real fields.
//
// Two things make it read as an actual skyline rather than "green mush":
//  1. Use a *pure sky* panorama. A full dome shot (kloppenheim_02 — which is a
//     night scene) photographs the meadow too, and its lower half is grass.
//  2. Keep the chase camera's pitch under half the vertical FOV: past that the
//     top of the frustum dips below the horizon and the "sky" becomes the ground
//     half of the panorama. See CAM_PITCH / BASE_FOV in main.js.
import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

const SKY_URL = 'assets/skies/kloppenheim_03_puresky_1k.hdr'

// Placeholder horizon haze until (or unless) the HDRI arrives.
export const SKY_FOG_COLOR = 0xbfd0da

// Half-floats straight from an .hdr need expanding; floats do not.
function readChannel(data, i, half) {
  if (!half) return data[i]
  const bits = data[i]
  const sign = bits & 0x8000 ? -1 : 1
  const exp = (bits >> 10) & 0x1f
  const frac = bits & 0x3ff
  if (exp === 0) return sign * Math.pow(2, -14) * (frac / 1024)
  if (exp === 0x1f) return frac ? NaN : sign * Infinity
  return sign * Math.pow(2, exp - 15) * (1 + frac / 1024)
}

function pixels(texture) {
  const img = texture && texture.image
  if (!img || !img.data || !img.width || !img.height) return null
  return { data: img.data, w: img.width, h: img.height, half: !(img.data instanceof Float32Array) }
}

const LUMA = (d, i, half) =>
  0.2126 * readChannel(d, i, half) + 0.7152 * readChannel(d, i + 1, half) + 0.0722 * readChannel(d, i + 2, half)

// Reinhard-ish tone map of a linear value down to [0,1], then linear -> sRGB.
const tm = (v) => Math.pow(Math.min(v, 8) / (1 + Math.min(v, 8)), 1 / 2.2)

// Average the band straddling the horizon so fog/mist always match the sky —
// averaging across the seam means it works whichever way round the panorama's
// rows happen to be stored.
function horizonColor(texture) {
  const p = pixels(texture)
  if (!p) return null
  const stepX = Math.max(1, Math.floor(p.w / 48))
  const y0 = Math.floor(p.h * 0.44)
  const y1 = Math.floor(p.h * 0.56)
  let r = 0, g = 0, b = 0, n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < p.w; x += stepX) {
      const i = (y * p.w + x) * 4
      r += readChannel(p.data, i, p.half)
      g += readChannel(p.data, i + 1, p.half)
      b += readChannel(p.data, i + 2, p.half)
      n++
    }
  }
  if (!n) return null
  return new THREE.Color().setRGB(tm(r / n), tm(g / n), tm(b / n), THREE.SRGBColorSpace)
}

// Overall luminance of the panorama -> how bright a sky is this? Drives the
// lights so a moonlit meadow never gets lit like noon. Log scale: night skies
// land near 0.02, sunny ones near 1+.
function brightness(texture) {
  const p = pixels(texture)
  if (!p) return 0.5
  const stepX = Math.max(1, Math.floor(p.w / 48))
  const stepY = Math.max(1, Math.floor(p.h / 32))
  let sum = 0, n = 0
  for (let y = 0; y < p.h; y += stepY) {
    for (let x = 0; x < p.w; x += stepX) {
      sum += LUMA(p.data, (y * p.w + x) * 4, p.half)
      n++
    }
  }
  return n ? sum / n : 0.5
}

// Cheap stand-in if the .hdr ever fails to fetch: a vertical gradient dome.
function fallbackSky(scene) {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 128
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, '#3f74bd')
  grad.addColorStop(0.5, '#bfd0da')
  grad.addColorStop(1, '#e6dcc4')
  g.fillStyle = grad
  g.fillRect(0, 0, 8, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  scene.background = tex
  scene.environment = tex
}

export function createSky(scene, { environmentIntensity = 0.85, blur = 0.015, sunLight, hemiLight, onExposure } = {}) {
  const sky = { texture: null, ready: false, fogColor: new THREE.Color(SKY_FOG_COLOR), brightness: 0.5 }

  function applyMood(lum) {
    sky.brightness = lum
    const t = THREE.MathUtils.clamp((Math.log10(Math.max(lum, 1e-4)) + 1.6) / 1.3, 0, 1) // 0 night .. 1 day
    if (sunLight) {
      sunLight.color.setRGB(THREE.MathUtils.lerp(0.62, 1.0, t), THREE.MathUtils.lerp(0.7, 0.94, t), THREE.MathUtils.lerp(1.0, 0.84, t))
      sunLight.intensity = THREE.MathUtils.lerp(0.5, 2.6, t)
    }
    if (hemiLight) {
      hemiLight.intensity = THREE.MathUtils.lerp(0.15, 0.55, t)
      hemiLight.color.setRGB(THREE.MathUtils.lerp(0.6, 0.86, t), THREE.MathUtils.lerp(0.68, 0.93, t), 1)
    }
    if (onExposure) onExposure(THREE.MathUtils.lerp(1.25, 1.0, t))
  }

  new HDRLoader().load(
    SKY_URL,
    (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping
      sky.texture = tex
      sky.ready = true
      scene.background = tex
      scene.environment = tex
      scene.backgroundBlurriness = blur // keep cloud detail but soften banding
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
