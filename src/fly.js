import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const PITCH_LIMIT = Math.PI / 2 - 0.02

// Dikeyden sapma. Üst üste kabloların ekranda ayrılması için.
export const SCHEMA_TILT = 50 * Math.PI / 180

export function cameraBasis(camera, planar = false) {
  const fwd = new THREE.Vector3()
  const right = new THREE.Vector3()
  camera.getWorldDirection(fwd)
  right.setFromMatrixColumn(camera.matrixWorld, 0)
  if (planar && Math.abs(fwd.y) > 0.92) {
    fwd.setFromMatrixColumn(camera.matrixWorld, 1)
    fwd.y = 0
  }
  right.y = 0
  if (right.lengthSq() < 1e-8) {
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    right.set(-screenUp.z, 0, screenUp.x)
  }
  if (fwd.lengthSq() < 1e-8) fwd.set(0, -1, 0)
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  fwd.normalize()
  right.normalize()
  return { fwd, right }
}

export function flyDelta(camera, input, distance, planar = false) {
  const { fwd, right } = cameraBasis(camera, planar)
  const move = new THREE.Vector3()
  move.addScaledVector(fwd, input.forward || 0)
  move.addScaledVector(right, input.strafe || 0)
  move.addScaledVector(UP, input.lift || 0)
  if (move.lengthSq() < 1e-8) return move
  return move.normalize().multiplyScalar(distance)
}

// yawDelta sağa, pitchDelta aşağı. Konum değişmez. YXZ, roll sıfır.
export function turnLook(camera, yawDelta, pitchDelta) {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')
  euler.setFromQuaternion(camera.quaternion, 'YXZ')
  euler.y -= yawDelta
  euler.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, euler.x - pitchDelta))
  euler.z = 0
  camera.quaternion.setFromEuler(euler)
  camera.up.set(0, 1, 0)
}

export function aimAhead(camera, target, distance) {
  const dir = new THREE.Vector3()
  camera.updateMatrixWorld(true)
  camera.getWorldDirection(dir)
  target.copy(camera.position).addScaledVector(dir, distance)
}

function asDir(direction) {
  const x = direction?.x ?? direction?.[0] ?? 0
  const y = direction?.y ?? direction?.[1] ?? 1
  const z = direction?.z ?? direction?.[2] ?? 0
  const length = Math.hypot(x, y, z)
  if (length < 1e-8) return [0, 1, 0]
  return [x / length, y / length, z / length]
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

// Kameranın durduğu yön. Dikey bakışta ekranın yukarısı dünya -Z.
export function viewUp(direction) {
  const dir = asDir(direction)
  if (Math.abs(dir[1]) > 0.92) return [0, 0, -1]
  return [0, 1, 0]
}

export function cameraPlacement(target, direction, distance) {
  const dir = asDir(direction)
  const up = viewUp(dir)
  return {
    position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance],
    up,
    target: [target[0], target[1], target[2]]
  }
}

// direction: hedeften kameraya. Üst [0,1,0]. Eğik şema [0, cos, sin].
export function schemaPose(focusX, focusZ, direction = [0, 1, 0], height = 16) {
  return cameraPlacement([focusX, 0, focusZ], direction, height)
}

// Küp yüzünün dokusu. Yerel +Z dışarı, yerel +Y yazının yukarısı.
export function faceBasis(normal) {
  const z = asDir(normal)
  const hint = Math.abs(z[1]) > 0.9 ? [0, 0, -Math.sign(z[1]) || -1] : [0, 1, 0]
  const x = asDir(cross(hint, z))
  const y = asDir(cross(z, x))
  return { x, y, z }
}

// Yüzün ortası tek eksen, kenar iki, köşe üç. point küpün içinde, yüzey 0.5.
export function pickView(point, normal, edge = 0.18) {
  const dir = [0, 0, 0]
  for (let i = 0; i < 3; i += 1) {
    const n = normal[i] || 0
    const p = point[i] || 0
    if (Math.abs(n) > 0.5) dir[i] = Math.sign(n)
    else if (Math.abs(0.5 - Math.abs(p)) < edge) dir[i] = Math.sign(p) || 1
  }
  return asDir(dir)
}

export function groundAxes(camera) {
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  right.y = 0
  up.y = 0
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  if (up.lengthSq() < 1e-8) up.set(0, 0, -1)
  right.normalize()
  up.normalize()
  return { right, up }
}

export function panFocus(focus, right, up, dx, dy, worldPerX, worldPerY) {
  return {
    x: focus.x + (-dx * worldPerX) * right.x + (dy * worldPerY) * up.x,
    z: focus.z + (-dx * worldPerX) * right.z + (dy * worldPerY) * up.z
  }
}
