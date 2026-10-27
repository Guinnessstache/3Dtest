// Tiny pooled FX system: chunky explosions (shards + shockwave ring + flash)
// plus a decaying screen-shake value the camera can read.
import * as THREE from 'three'

const GRAVITY = 24

export function createFx(scene) {
  const root = new THREE.Group()
  scene.add(root)

  const bursts = []
  let shake = 0

  const shardGeos = [
    new THREE.BoxGeometry(0.3, 0.26, 0.16),
    new THREE.IcosahedronGeometry(0.2, 0),
    new THREE.ConeGeometry(0.16, 0.42, 5)
  ]
  const shardMats = [
    new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x5f6169, roughness: 0.45, metalness: 0.65 }),
    new THREE.MeshStandardMaterial({
      color: 0xff8c1a,
      emissive: 0xff5a00,
      emissiveIntensity: 2.2,
      roughness: 0.6
    })
  ]
  const ringGeo = new THREE.RingGeometry(0.86, 1.1, 48)
  const flashGeo = new THREE.SphereGeometry(1, 16, 12)

  // Blast a burst of debris at `position`. power scales force + screen shake.
  function explode(position, { count = 22, power = 1, color = 0xff7b1c, life = 1.5 } = {}) {
    const shards = []
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(shardGeos[i % shardGeos.length], shardMats[i % shardMats.length])
      const angle = Math.random() * Math.PI * 2
      const out = (2.5 + Math.random() * 7) * power
      mesh.position.set(position.x, position.y + 0.4 + Math.random() * 0.6, position.z)
      mesh.scale.setScalar(0.5 + Math.random() * 1.1)
      mesh.castShadow = true
      root.add(mesh)
      shards.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(angle) * out, 3 + Math.random() * 7 * power, Math.sin(angle) * out),
        spin: new THREE.Vector3(Math.random() * 9 - 4.5, Math.random() * 9 - 4.5, Math.random() * 9 - 4.5),
        life: life + Math.random() * 0.7
      })
    }

    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(position.x, 0.12, position.z)
    root.add(ring)

    const flash = new THREE.Mesh(
      flashGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffe0b0,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    flash.position.set(position.x, position.y + 0.7, position.z)
    root.add(flash)

    bursts.push({ shards, ring, flash, t: 0, ttl: 0.6 })
    shake = Math.min(1.5, shake + power * 0.8)
  }

  function update(dt) {
    for (let b = bursts.length - 1; b >= 0; b--) {
      const burst = bursts[b]
      burst.t += dt
      const k = Math.min(1, burst.t / burst.ttl)

      // Shockwave ring + fireball flash fade as they expand.
      burst.ring.scale.setScalar(0.6 + 9 * k)
      burst.ring.material.opacity = 0.9 * (1 - k) * (1 - k)
      burst.flash.scale.setScalar(0.5 + 4.5 * Math.sqrt(k))
      burst.flash.material.opacity = Math.max(0, 1 - k * 1.6)

      for (let s = burst.shards.length - 1; s >= 0; s--) {
        const shard = burst.shards[s]
        shard.life -= dt
        if (shard.life <= 0) {
          root.remove(shard.mesh)
          burst.shards.splice(s, 1)
          continue
        }
        shard.vel.y -= GRAVITY * dt
        shard.mesh.position.addScaledVector(shard.vel, dt)
        shard.mesh.rotation.x += shard.spin.x * dt
        shard.mesh.rotation.y += shard.spin.y * dt
        shard.mesh.rotation.z += shard.spin.z * dt
        if (shard.mesh.position.y < 0.16) {
          shard.mesh.position.y = 0.16
          shard.vel.y *= -0.34
          shard.vel.x *= 0.7
          shard.vel.z *= 0.7
          shard.spin.multiplyScalar(0.55)
        }
        if (shard.life < 0.45) shard.mesh.scale.multiplyScalar(1 - 2.5 * dt)
      }

      if (k >= 1 && burst.shards.length === 0) {
        burst.ring.material.dispose()
        burst.flash.material.dispose()
        root.remove(burst.ring, burst.flash)
        bursts.splice(b, 1)
      }
    }

    shake = Math.max(0, shake - dt * 2.6)
  }

  function clear() {
    for (const burst of bursts) {
      for (const shard of burst.shards) root.remove(shard.mesh)
      root.remove(burst.ring, burst.flash)
      burst.ring.material.dispose()
      burst.flash.material.dispose()
    }
    bursts.length = 0
    shake = 0
  }

  return { explode, update, clear, get shake() { return shake } }
}
