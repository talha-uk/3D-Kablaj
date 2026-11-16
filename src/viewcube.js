import * as THREE from 'three'
import { faceBasis } from './fly.js'

const FACES = [
  { normal: [1, 0, 0], label: 'Sağ', tint: 'rgba(196,165,116,0.38)', ink: '#1c1915' },
  { normal: [-1, 0, 0], label: 'Sol', tint: 'rgba(138,154,123,0.38)', ink: '#1c1915' },
  { normal: [0, 1, 0], label: 'Üst', tint: 'rgba(244,240,232,0.42)', ink: '#1c1915' },
  { normal: [0, -1, 0], label: 'Alt', tint: 'rgba(74,67,58,0.4)', ink: '#f3efe6' },
  { normal: [0, 0, 1], label: 'Arka', tint: 'rgba(154,122,98,0.4)', ink: '#f3efe6' },
  { normal: [0, 0, -1], label: 'Ön', tint: 'rgba(231,211,192,0.42)', ink: '#1c1915' }
]

function unit(values) {
  const length = Math.hypot(values[0], values[1], values[2])
  return values.map((value) => value / length)
}

function labelTexture(label, tint, ink) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, 128, 128)
  ctx.fillStyle = tint
  ctx.fillRect(8, 8, 112, 112)
  ctx.fillStyle = ink
  ctx.font = '600 40px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 64, 68)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function glass(color, opacity) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 0.18,
    metalness: 0.04,
    depthWrite: false,
    emissive: 0x000000
  })
}

function orient(mesh, normal) {
  const basis = faceBasis(normal)
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().fromArray(basis.x),
    new THREE.Vector3().fromArray(basis.y),
    new THREE.Vector3().fromArray(basis.z)
  )
  mesh.quaternion.setFromRotationMatrix(matrix)
  mesh.position.copy(new THREE.Vector3().fromArray(basis.z).multiplyScalar(0.5))
}

export function createViewCube() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20)
  const root = new THREE.Group()
  const picks = []
  for (const spec of FACES) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.46),
      new THREE.MeshStandardMaterial({
        map: labelTexture(spec.label, spec.tint, spec.ink),
        transparent: true,
        roughness: 0.2,
        metalness: 0.02,
        depthWrite: false
      })
    )
    mesh.userData.dir = spec.normal.slice()
    mesh.userData.kind = 'face'
    mesh.renderOrder = 1
    orient(mesh, spec.normal)
    root.add(mesh)
    picks.push(mesh)
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const u = (axis + 1) % 3
    const v = (axis + 2) % 3
    for (const su of [-1, 1]) {
      for (const sv of [-1, 1]) {
        const dir = [0, 0, 0]
        dir[u] = su
        dir[v] = sv
        const size = [0.18, 0.18, 0.18]
        size[axis] = 0.5
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), glass(0xe7dccb, 0.78))
        const pos = [0, 0, 0]
        pos[u] = su * 0.56
        pos[v] = sv * 0.56
        mesh.position.set(pos[0], pos[1], pos[2])
        mesh.userData.dir = unit(dir)
        mesh.userData.kind = 'edge'
        mesh.renderOrder = 2
        root.add(mesh)
        picks.push(mesh)
      }
    }
  }
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), glass(0xf7f1e8, 0.92))
        mesh.position.set(x * 0.56, y * 0.56, z * 0.56)
        mesh.userData.dir = unit([x, y, z])
        mesh.userData.kind = 'corner'
        mesh.renderOrder = 3
        root.add(mesh)
        picks.push(mesh)
      }
    }
  }
  scene.add(root)
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3a342c, 1.2))
  const sun = new THREE.DirectionalLight(0xffffff, 0.7)
  sun.position.set(3, 4, 2)
  scene.add(sun)
  return { scene, camera, picks }
}

export function syncViewCube(main, cubeCam) {
  main.updateMatrixWorld(true)
  const dir = new THREE.Vector3()
  const up = new THREE.Vector3()
  main.getWorldDirection(dir)
  up.setFromMatrixColumn(main.matrixWorld, 1)
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0)
  cubeCam.position.copy(dir).multiplyScalar(-3.6)
  cubeCam.up.copy(up)
  cubeCam.lookAt(0, 0, 0)
  cubeCam.updateMatrixWorld(true)
}

export function markCube(picks, direction) {
  for (const mesh of picks) {
    const dir = mesh.userData.dir
    const dot = direction ? dir[0] * direction[0] + dir[1] * direction[1] + dir[2] * direction[2] : 0
    const on = dot > 0.98
    mesh.material.emissive.set(on ? 0xd86a2a : 0x000000)
    mesh.material.emissiveIntensity = on ? 0.85 : 0
  }
}
