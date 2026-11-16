import * as THREE from 'three'
import { faceBasis } from './fly.js'

const FACES = [
  { normal: [1, 0, 0], label: 'Sağ', tint: 'rgba(214, 176, 96, 0.94)', ink: '#1c1915' },
  { normal: [-1, 0, 0], label: 'Sol', tint: 'rgba(122, 150, 104, 0.94)', ink: '#1c1915' },
  { normal: [0, 1, 0], label: 'Üst', tint: 'rgba(248, 244, 236, 0.96)', ink: '#1c1915' },
  { normal: [0, -1, 0], label: 'Alt', tint: 'rgba(62, 54, 46, 0.94)', ink: '#f3efe6' },
  { normal: [0, 0, 1], label: 'Arka', tint: 'rgba(166, 122, 90, 0.94)', ink: '#f3efe6' },
  { normal: [0, 0, -1], label: 'Ön', tint: 'rgba(236, 214, 190, 0.96)', ink: '#1c1915' }
]

const AXIS = [
  { axis: 0, color: 0xff2a2a },
  { axis: 1, color: 0x2dcc3a },
  { axis: 2, color: 0x2f6dff }
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
  ctx.fillRect(6, 6, 116, 116)
  ctx.strokeStyle = ink
  ctx.lineWidth = 6
  ctx.strokeRect(8, 8, 112, 112)
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
      new THREE.PlaneGeometry(0.62, 0.62),
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
  const corner = [-0.5, -0.5, -0.5]
  for (const spec of AXIS) {
    const dir = [0, 0, 0]
    dir[spec.axis] = 1
    const material = () => new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: 0.35,
      metalness: 0.08,
      depthTest: false,
      emissive: 0x000000
    })
    const shaftLen = 1.05
    const headLen = 0.36
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, shaftLen, 12), material())
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, headLen, 14), material())
    const aim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir))
    shaft.quaternion.copy(aim)
    head.quaternion.copy(aim)
    const shaftAt = corner.map((value, index) => value + dir[index] * (shaftLen / 2))
    const headAt = corner.map((value, index) => value + dir[index] * (shaftLen + headLen / 2))
    shaft.position.set(shaftAt[0], shaftAt[1], shaftAt[2])
    head.position.set(headAt[0], headAt[1], headAt[2])
    for (const mesh of [shaft, head]) {
      mesh.userData.dir = dir.slice()
      mesh.userData.kind = 'axis'
      mesh.renderOrder = 4
      root.add(mesh)
      picks.push(mesh)
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

export function seenFrom(dir, camPos, kind) {
  if (kind === 'axis') return true
  const length = Math.hypot(camPos[0], camPos[1], camPos[2]) || 1
  const dot = (dir[0] * camPos[0] + dir[1] * camPos[1] + dir[2] * camPos[2]) / length
  return dot > (kind === 'face' ? 0.2 : 0.05)
}

export function cullViewCube(picks, cubeCam) {
  const cam = [cubeCam.position.x, cubeCam.position.y, cubeCam.position.z]
  for (const mesh of picks) {
    mesh.visible = seenFrom(mesh.userData.dir, cam, mesh.userData.kind)
  }
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
