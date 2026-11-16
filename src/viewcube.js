import * as THREE from 'three'
import { faceBasis } from './fly.js'

const FACES = [
  { normal: [1, 0, 0], label: 'Sağ', color: '#c4a574', ink: '#1c1915' },
  { normal: [-1, 0, 0], label: 'Sol', color: '#8a9a7b', ink: '#1c1915' },
  { normal: [0, 1, 0], label: 'Üst', color: '#f4f0e8', ink: '#1c1915' },
  { normal: [0, -1, 0], label: 'Alt', color: '#4a433a', ink: '#f3efe6' },
  { normal: [0, 0, 1], label: 'Arka', color: '#9a7a62', ink: '#f3efe6' },
  { normal: [0, 0, -1], label: 'Ön', color: '#e7d3c0', ink: '#1c1915' }
]

function labelTexture(label, color, ink) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = ink
  ctx.font = '600 42px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 64, 68)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function orient(mesh, normal) {
  const basis = faceBasis(normal)
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3().fromArray(basis.x),
    new THREE.Vector3().fromArray(basis.y),
    new THREE.Vector3().fromArray(basis.z)
  )
  mesh.quaternion.setFromRotationMatrix(matrix)
  mesh.position.copy(new THREE.Vector3().fromArray(basis.z).multiplyScalar(0.52))
}

export function createViewCube() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
  const root = new THREE.Group()
  const pick = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.72, metalness: 0.04 })
  )
  root.add(pick)
  const faces = FACES.map((spec) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 0.74),
      new THREE.MeshStandardMaterial({
        map: labelTexture(spec.label, spec.color, spec.ink),
        roughness: 0.62,
        metalness: 0.02
      })
    )
    const normal = new THREE.Vector3().fromArray(spec.normal)
    mesh.userData.normal = normal
    orient(mesh, spec.normal)
    root.add(mesh)
    return mesh
  })
  scene.add(root)
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x3a342c, 1.15))
  const sun = new THREE.DirectionalLight(0xffffff, 0.85)
  sun.position.set(3, 4, 2)
  scene.add(sun)
  return { scene, camera, pick, faces }
}

export function syncViewCube(main, cubeCam) {
  main.updateMatrixWorld(true)
  const dir = new THREE.Vector3()
  const up = new THREE.Vector3()
  main.getWorldDirection(dir)
  up.setFromMatrixColumn(main.matrixWorld, 1)
  if (up.lengthSq() < 1e-8) up.set(0, 1, 0)
  cubeCam.position.copy(dir).multiplyScalar(-2.8)
  cubeCam.up.copy(up)
  cubeCam.lookAt(0, 0, 0)
  cubeCam.updateMatrixWorld(true)
}

export function markCube(faces, direction) {
  for (const mesh of faces) {
    const on = direction && mesh.userData.normal.dot(new THREE.Vector3().fromArray(direction)) > 0.45
    mesh.material.emissive.set(on ? 0xf0a070 : 0x000000)
    mesh.material.emissiveIntensity = on ? 0.55 : 0
  }
}
