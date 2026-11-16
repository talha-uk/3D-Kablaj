import * as THREE from 'three'

const UP = new THREE.Vector3(0, 1, 0)
const PITCH_LIMIT = Math.PI / 2 - 0.02

// Dikeyden sapma. Üst üste kabloların ekranda ayrılması için.
export const SCHEMA_TILT = 50 * Math.PI / 180

export function cameraBasis(camera) {
  const fwd = new THREE.Vector3()
  const right = new THREE.Vector3()
  camera.getWorldDirection(fwd)
  right.setFromMatrixColumn(camera.matrixWorld, 0)
  if (Math.abs(fwd.y) > 0.92) {
    fwd.setFromMatrixColumn(camera.matrixWorld, 1)
    fwd.y = 0
  }
  right.y = 0
  if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1)
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0)
  fwd.normalize()
  right.normalize()
  return { fwd, right }
}

export function flyDelta(camera, input, distance) {
  const { fwd, right } = cameraBasis(camera)
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

// tilt 0 üstten. Ekranın yukarısı dünya -Z, sağı +X.
export function schemaPose(focusX, focusZ, tilt, height = 16) {
  if (tilt < 1e-4) {
    return {
      position: [focusX, height, focusZ],
      up: [0, 0, -1],
      target: [focusX, 0, focusZ]
    }
  }
  return {
    position: [focusX, height * Math.cos(tilt), focusZ + height * Math.sin(tilt)],
    up: [0, 1, 0],
    target: [focusX, 0, focusZ]
  }
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
