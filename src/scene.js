import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { clone as cloneObject } from 'three/addons/utils/SkeletonUtils.js'
import { focusFor } from './focus.js'
import { SCHEMA_TILT, aimAhead, axisAngles, cameraPlacement, dollyScale, flyDelta, flyRate, groundAxes, panFocus, schemaPose, turnLook, wheelPixels } from './fly.js'
import { exteriorMask, modelUnit, nearestMeasureCorner, sameFaceTriangles, snapModelCorner, snapReference, uniqueMeasureCorner } from './olcu.js'
import { createViewCube, cullViewCube, markCube, syncViewCube } from './viewcube.js'
import { headingFromQuaternion, portOrientation, portRoll, wrapAngle } from './yaw.js'
import { softSnap, softSnapAngle } from './snap.js'
import { cableRadius, plugReach, SCHEMA_LIFT, routeClear, routeSchema, routeVia } from './route.js'
import { cableCins, cableShown, coaxFace, modelSolid, portRecord, portTypeOf } from './state.js'

function ownedBox(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  geometry.userData.owned = true
  return geometry
}

function tagPort(mesh, component, port) {
  mesh.userData.kind = 'port'
  mesh.userData.componentId = component.id
  mesh.userData.portId = port.id
  mesh.castShadow = true
  return mesh
}

function mm(fit, value) {
  return value / 10 / (fit?.s || 1)
}

function addEthernetPort(pivot, fit, component, port) {
  const width = mm(fit, 15.8)
  const tall = mm(fit, 13.2)
  const lip = mm(fit, 1.4)
  const body = mm(fit, 14)
  const shell = portMaterial(0xc5ced6, 0.62, 0.34)
  const plastic = portMaterial(0x14171b, 0.04, 0.62)
  const gold = portMaterial(0xd4af37, 0.92, 0.22)
  const up = faceSign(pivot)
  putPort(pivot, ownedBox(width, lip, tall), shell, component, port, 0, lip * 0.35, 0)
  putPort(pivot, ownedBox(width * 0.94, body, tall * 0.92), shell, component, port, 0, -body / 2, 0)
  putPort(pivot, ownedBox(width * 0.7, lip * 1.6, tall * 0.52), plastic, component, port, 0, lip * 0.15, 0)
  putPort(pivot, ownedBox(width * 0.22, lip, tall * 0.08), plastic, component, port, 0, lip * 0.55, up * tall * 0.36)
  const tongue = putPort(pivot, ownedBox(width * 0.58, body * 0.28, tall * 0.1), plastic, component, port, 0, -mm(fit, 1.2), up * tall * 0.08)
  tongue.castShadow = false
  const span = width * 0.5
  for (let pin = 0; pin < 8; pin += 1) {
    const contact = putPort(
      pivot,
      ownedBox(width * 0.028, mm(fit, 0.35), tall * 0.08),
      gold,
      component,
      port,
      -span / 2 + (span / 7) * pin,
      -mm(fit, 0.15),
      -up * tall * 0.12
    )
    contact.castShadow = false
  }
}

function faceSign(pivot) {
  const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(pivot.quaternion.clone().invert())
  if (Math.abs(localUp.z) >= Math.abs(localUp.x)) return Math.sign(localUp.z) || 1
  return 1
}

function portMaterial(color, metalness, roughness) {
  return remember(new THREE.MeshStandardMaterial({ color, metalness, roughness }))
}

function ownedCylinder(radiusTop, radiusBottom, length, segments) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments)
  geometry.userData.owned = true
  return geometry
}

function ownedRing(inner, outer) {
  const geometry = new THREE.RingGeometry(inner, outer, 24)
  geometry.rotateX(-Math.PI / 2)
  geometry.userData.owned = true
  return geometry
}

function ownedStadium(width, breadth, depth) {
  const shape = new THREE.Shape()
  const reach = breadth / 2
  const half = Math.max(width / 2, reach + 1e-4)
  shape.absarc(half - reach, 0, reach, -Math.PI / 2, Math.PI / 2, false)
  shape.absarc(-half + reach, 0, reach, Math.PI / 2, Math.PI * 1.5, false)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 })
  geometry.rotateX(-Math.PI / 2)
  geometry.userData.owned = true
  return geometry
}

function putPort(pivot, geometry, material, component, port, x, y, z) {
  const mesh = tagPort(new THREE.Mesh(geometry, material), component, port)
  mesh.position.set(x, y, z)
  pivot.add(mesh)
  return mesh
}

function addCoaxMalePanel(pivot, fit, component, port, nType, contact = 'pin') {
  const metal = portMaterial(nType ? 0xd5dee7 : 0xe4c56a, nType ? 0.8 : 0.72, nType ? 0.3 : 0.3)
  const pinMat = portMaterial(0xf3d48a, 0.92, 0.16)
  const ptfe = portMaterial(0xf4f0e6, 0.02, 0.42)
  const hexR = mm(fit, nType ? 9.8 : 4.62)
  const nutR = mm(fit, nType ? 11 : 5.5)
  const pinR = mm(fit, nType ? 0.75 : 0.48)
  const nutT = mm(fit, nType ? 3.4 : 2.2)
  const buried = mm(fit, nType ? 13 : 9)
  const nutLen = mm(fit, nType ? 8 : 6)
  const nutCenter = mm(fit, nType ? 6 : 4.4)
  putPort(pivot, ownedCylinder(hexR, hexR, nutT, 6), metal, component, port, 0, nutT * 0.08, 0)
  putPort(pivot, ownedCylinder(mm(fit, nType ? 4.2 : 2.6), mm(fit, nType ? 4.2 : 2.6), buried, 16), metal, component, port, 0, -buried / 2, 0)
  putPort(pivot, ownedRing(pinR * 1.8, mm(fit, nType ? 3.2 : 2.1)), ptfe, component, port, 0, mm(fit, 1.3), 0)
  if (contact === 'socket') {
    putPort(pivot, ownedCylinder(pinR * 1.7, pinR * 1.7, mm(fit, 1.6), 12), portMaterial(0x1a120c, 0.2, 0.55), component, port, 0, mm(fit, 1.5), 0)
  } else {
    putPort(pivot, ownedCylinder(pinR, pinR, mm(fit, nType ? 4.2 : 3.4), 12), pinMat, component, port, 0, mm(fit, 2.1), 0)
  }
  putPort(pivot, ownedCylinder(nutR, nutR, nutLen, 6), metal, component, port, 0, nutCenter, 0)
}

function addCoaxPort(pivot, fit, component, port, nType) {
  const face = coaxFace(port?.type === 'rpsma' ? 'rpsma' : (nType ? 'ntype' : 'sma'), port?.cins === 'erkek' ? 'erkek' : 'disi')
  if (face.shell === 'nut') return addCoaxMalePanel(pivot, fit, component, port, nType, face.contact)
  const metal = portMaterial(nType ? 0xd5dee7 : 0xe4c56a, nType ? 0.8 : 0.7, nType ? 0.3 : 0.32)
  const ptfe = portMaterial(0xf4f0e6, 0.02, 0.42)
  const socket = portMaterial(0x121416, 0.3, 0.48)
  const hexR = mm(fit, nType ? 9.8 : 4.62)
  const barrelR = mm(fit, nType ? 5.2 : 3.18)
  const nutT = mm(fit, nType ? 3.4 : 2.2)
  const proud = mm(fit, nType ? 7.5 : 5.2)
  const buried = mm(fit, nType ? 13 : 9)
  putPort(pivot, ownedCylinder(hexR, hexR, nutT, 6), metal, component, port, 0, nutT * 0.08, 0)
  putPort(pivot, ownedCylinder(barrelR * 0.78, barrelR * 0.78, buried, 16), metal, component, port, 0, -buried / 2, 0)
  putPort(pivot, ownedCylinder(barrelR, barrelR, proud, 24), metal, component, port, 0, nutT * 0.45 + proud / 2, 0)
  const rings = nType ? 6 : 5
  for (let ring = 0; ring < rings; ring += 1) {
    putPort(
      pivot,
      ownedCylinder(barrelR * 1.07, barrelR * 1.07, mm(fit, 0.35), 24),
      metal,
      component,
      port,
      0,
      nutT * 0.5 + proud * (0.14 + ring * (0.72 / rings)),
      0
    )
  }
  const faceY = nutT * 0.45 + proud
  putPort(pivot, ownedRing(barrelR * 0.28, barrelR * 0.78), ptfe, component, port, 0, faceY, 0)
  if (face.contact === 'pin') {
    putPort(pivot, ownedCylinder(mm(fit, nType ? 0.7 : 0.45), mm(fit, nType ? 0.7 : 0.45), mm(fit, 2.4), 12), portMaterial(0xf6d78c, 0.92, 0.14), component, port, 0, faceY + mm(fit, 0.5), 0)
  } else {
    putPort(pivot, ownedCylinder(barrelR * 0.2, barrelR * 0.2, mm(fit, 1.4), 12), socket, component, port, 0, faceY - mm(fit, 0.55), 0)
  }
}

function addUsbAMalePanel(pivot, fit, component, port, blue) {
  const shell = portMaterial(0xe7ecef, 0.6, 0.3)
  const tongueMat = portMaterial(blue ? 0x1e3a8a : 0x101216, 0.06, 0.4)
  const house = portMaterial(0x1a1c1f, 0.08, 0.55)
  const width = mm(fit, 12)
  const thick = mm(fit, 4.5)
  const nose = mm(fit, 12)
  const buried = mm(fit, 8)
  putPort(pivot, ownedBox(width * 1.15, mm(fit, 2), thick * 1.4), house, component, port, 0, mm(fit, 0.2), 0)
  putPort(pivot, ownedBox(width * 0.9, buried, thick), shell, component, port, 0, -buried / 2, 0)
  putPort(pivot, ownedBox(width, nose, thick), shell, component, port, 0, nose / 2, 0)
  putPort(pivot, ownedBox(width * 0.7, nose * 0.45, thick * 0.22), tongueMat, component, port, 0, nose * 0.35, 0)
}

function addUsbAPort(pivot, fit, component, port, blue) {
  if (port?.cins === 'erkek') return addUsbAMalePanel(pivot, fit, component, port, blue)
  const shell = portMaterial(0xe7ecef, 0.55, 0.32)
  const house = portMaterial(blue ? 0x1d4ed8 : 0x1a1c1f, 0.08, 0.55)
  const tongueMat = portMaterial(blue ? 0x1e3a8a : 0x101216, 0.06, 0.4)
  const gold = portMaterial(0xd4af37, 0.92, 0.2)
  const width = mm(fit, 12.2)
  const thick = mm(fit, 5)
  const lip = mm(fit, 1.2)
  const buried = mm(fit, 12)
  const up = faceSign(pivot)
  putPort(pivot, ownedBox(width * 1.12, lip, thick * 1.25), house, component, port, 0, lip * 0.2, 0)
  putPort(pivot, ownedBox(width, buried, thick), shell, component, port, 0, -buried / 2, 0)
  putPort(pivot, ownedBox(width * 0.82, lip * 1.5, thick * 0.62), house, component, port, 0, -mm(fit, 0.2), 0)
  const tongueZ = up * thick * 0.16
  putPort(pivot, ownedBox(width * 0.7, buried * 0.32, thick * 0.16), tongueMat, component, port, 0, -mm(fit, 1.6), tongueZ)
  const pins = blue ? 9 : 4
  const span = width * (blue ? 0.62 : 0.5)
  for (let index = 0; index < pins; index += 1) {
    const back = blue && index >= 4
    const slot = back ? index - 4 : index
    const count = back ? 5 : 4
    const contact = putPort(
      pivot,
      ownedBox(mm(fit, back ? 0.35 : 0.5), mm(fit, 0.4), thick * 0.08),
      gold,
      component,
      port,
      -span / 2 + (span / (count - 1)) * slot,
      -mm(fit, back ? 0.6 : 0.15),
      tongueZ - up * thick * 0.12
    )
    contact.castShadow = false
  }
}

function addUsbCPort(pivot, fit, component, port) {
  const shell = portMaterial(0xe8eef1, 0.6, 0.3)
  const cavity = portMaterial(0x14181c, 0.08, 0.58)
  const gold = portMaterial(0xd4af37, 0.92, 0.2)
  const width = mm(fit, 9.2)
  const thick = mm(fit, 3.4)
  const depth = mm(fit, 8)
  const front = mm(fit, 1.1)
  putPort(pivot, ownedStadium(width, thick, depth), shell, component, port, 0, front - depth, 0)
  putPort(pivot, ownedStadium(width * 1.08, thick * 1.16, mm(fit, 0.8)), shell, component, port, 0, front - mm(fit, 0.8), 0)
  putPort(pivot, ownedStadium(width * 0.72, thick * 0.46, mm(fit, 2.2)), cavity, component, port, 0, front - mm(fit, 2.4), 0)
  const up = faceSign(pivot)
  const tongueZ = up * thick * 0.02
  putPort(pivot, ownedBox(width * 0.62, mm(fit, 2.4), thick * 0.16), cavity, component, port, 0, front - mm(fit, 2.8), tongueZ)
  const span = width * 0.48
  for (let index = 0; index < 8; index += 1) {
    const contact = putPort(
      pivot,
      ownedBox(mm(fit, 0.22), mm(fit, 0.3), thick * 0.06),
      gold,
      component,
      port,
      -span / 2 + (span / 7) * index,
      front - mm(fit, 0.35),
      tongueZ
    )
    contact.castShadow = false
  }
}

function endMat(color, metalness, roughness) {
  const material = new THREE.MeshStandardMaterial({ color, metalness, roughness })
  material.userData.owned = true
  return remember(material)
}

function endMesh(group, geometry, material, x, y, z, cableId) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.userData.kind = 'cable'
  mesh.userData.cableId = cableId
  group.add(mesh)
  return mesh
}

function cm(value) {
  return value / 10
}

function addCoaxJackPlug(group, cableId, nType, contact = 'socket') {
  const metal = endMat(nType ? 0xd5dee7 : 0xe4c56a, nType ? 0.8 : 0.72, 0.3)
  const ptfe = endMat(0xf4f0e6, 0.02, 0.42)
  const socket = endMat(0x121416, 0.3, 0.48)
  const boot = endMat(0x161616, 0.06, 0.72)
  const barrelR = cm(nType ? 5.2 : 3.18)
  const barrelLen = cm(nType ? 7.5 : 5.2)
  endMesh(group, ownedCylinder(barrelR, barrelR, barrelLen, 24), metal, 0, cm(nType ? 2.2 : 1.6), 0, cableId)
  endMesh(group, ownedRing(barrelR * 0.28, barrelR * 0.78), ptfe, 0, cm(0.35), 0, cableId)
  if (contact === 'pin') {
    endMesh(group, ownedCylinder(cm(nType ? 0.7 : 0.45), cm(nType ? 0.7 : 0.45), cm(2.4), 12), endMat(0xf6d78c, 0.92, 0.14), 0, cm(0.2), 0, cableId)
  } else {
    endMesh(group, ownedCylinder(barrelR * 0.2, barrelR * 0.2, cm(1.6), 12), socket, 0, cm(0.7), 0, cableId)
  }
  const bodyR = cm(nType ? 6.2 : 3.5)
  endMesh(group, ownedCylinder(bodyR, bodyR, cm(nType ? 8 : 6), 18), metal, 0, barrelLen + cm(nType ? 2 : 1.6), 0, cableId)
  endMesh(group, ownedCylinder(bodyR, cm(nType ? 5.4 : 2.4), cm(nType ? 8 : 6), 16), boot, 0, cm(nType ? 16 : 12), 0, cableId)
  return nType ? 2.36 : 1.74
}

function addCoaxPlug(group, cableId, nType, contact = 'pin') {
  const metal = endMat(nType ? 0xd7e0e8 : 0xe8c96a, nType ? 0.84 : 0.76, 0.26)
  const pinMat = endMat(0xf6d78c, 0.92, 0.14)
  const boot = endMat(0x161616, 0.06, 0.72)
  const nutR = cm(nType ? 11 : 5.5)
  const bodyR = cm(nType ? 6.4 : 3.3)
  const pinR = cm(nType ? 0.7 : 0.45)
  const nutCenter = cm(nType ? 5.6 : 4)
  const nutLen = cm(nType ? 7.2 : 5.2)
  if (contact === 'socket') {
    endMesh(group, ownedCylinder(pinR * 1.8, pinR * 1.8, cm(1.5), 12), endMat(0x1a120c, 0.2, 0.55), 0, nutCenter - nutLen * 0.28, 0, cableId)
  } else {
    endMesh(group, ownedCylinder(pinR, pinR, cm(nType ? 4 : 3.2), 12), pinMat, 0, cm(nType ? 1.2 : 0.8), 0, cableId)
  }
  endMesh(group, ownedCylinder(nutR, nutR, nutLen, 6), metal, 0, nutCenter, 0, cableId)
  for (let tooth = 0; tooth < 6; tooth += 1) {
    const angle = (tooth / 6) * Math.PI * 2
    endMesh(
      group,
      ownedBox(cm(0.7), nutLen * 0.92, cm(0.45)),
      metal,
      Math.cos(angle) * nutR * 0.92,
      nutCenter,
      Math.sin(angle) * nutR * 0.92,
      cableId
    )
  }
  const bodyStart = nutCenter + nutLen / 2
  const bodyLen = cm(nType ? 8 : 6)
  endMesh(group, ownedCylinder(bodyR, bodyR, bodyLen, 20), metal, 0, bodyStart + bodyLen / 2, 0, cableId)
  for (let ring = 0; ring < 5; ring += 1) {
    endMesh(group, ownedCylinder(bodyR * 1.12, bodyR * 1.12, cm(0.4), 18), metal, 0, bodyStart + cm(1 + ring * 1.1), 0, cableId)
  }
  const tail = bodyStart + bodyLen
  endMesh(group, ownedCylinder(bodyR * 1.05, cm(nType ? 5.4 : 2.4), cm(nType ? 8 : 6), 16), boot, 0, tail + cm(nType ? 2.4 : 1.8), 0, cableId)
  return nType ? 2.36 : 1.74
}

function addRjPlug(group, cableId) {
  const shell = endMat(0xd5dde6, 0.15, 0.35)
  const latch = endMat(0x9aa3ab, 0.1, 0.45)
  const gold = endMat(0xd4af37, 0.9, 0.22)
  const boot = endMat(0x4a5158, 0.06, 0.62)
  const width = cm(11.6)
  const tall = cm(6.4)
  const nose = cm(8)
  const body = cm(14)
  endMesh(group, ownedBox(width, nose, tall), shell, 0, nose / 2 - cm(3), 0, cableId)
  endMesh(group, ownedBox(width * 0.72, cm(3.5), cm(1.1)), latch, 0, cm(2.2), tall * 0.42, cableId)
  for (let pin = 0; pin < 8; pin += 1) {
    const contact = endMesh(group, ownedBox(cm(0.45), cm(2.2), cm(0.35)), gold, -width * 0.32 + pin * cm(1.05), cm(0.2), -tall * 0.28, cableId)
    contact.castShadow = false
  }
  endMesh(group, ownedBox(width * 0.9, body, tall * 0.85), boot, 0, nose + body / 2 - cm(2), 0, cableId)
  return nose + body
}

function addUsbAJackPlug(group, cableId, blue) {
  const shell = endMat(0xe7ecef, 0.65, 0.3)
  const house = endMat(blue ? 0x1d4ed8 : 0x1a1c1f, 0.08, 0.55)
  const boot = endMat(0x222222, 0.06, 0.66)
  const width = cm(13.4)
  const thick = cm(6.2)
  endMesh(group, ownedBox(width, cm(10), thick), shell, 0, cm(2), 0, cableId)
  endMesh(group, ownedBox(width * 0.82, cm(3), thick * 0.55), house, 0, cm(0.4), 0, cableId)
  endMesh(group, ownedCylinder(cm(4.2), cm(2.6), cm(10), 16), boot, 0, cm(10), 0, cableId)
  return 1.8
}

function addUsbAPlug(group, cableId, blue) {
  const shell = endMat(0xe7ecef, 0.7, 0.28)
  const house = endMat(blue ? 0x1d4ed8 : 0x1c1c1c, 0.08, 0.5)
  const boot = endMat(0x222222, 0.06, 0.66)
  const width = cm(12)
  const thick = cm(4.5)
  const nose = cm(12)
  endMesh(group, ownedBox(width, nose, thick), shell, 0, nose / 2 - cm(6), 0, cableId)
  endMesh(group, ownedBox(width * 0.72, cm(4), thick * 0.28), house, 0, cm(1.2), 0, cableId)
  endMesh(group, ownedCylinder(cm(4.2), cm(2.4), cm(10), 16), boot, 0, nose + cm(2), 0, cableId)
  return nose + cm(6)
}

function addUsbCPlug(group, cableId) {
  const shell = endMat(0xe8eef1, 0.68, 0.28)
  const boot = endMat(0x2a2a2a, 0.12, 0.72)
  const width = cm(8.6)
  const thick = cm(2.6)
  const nose = cm(7)
  endMesh(group, ownedBox(width, nose, thick), shell, 0, nose / 2 - cm(3.5), 0, cableId)
  endMesh(group, ownedCylinder(cm(3.6), cm(2.2), cm(12), 16), boot, 0, nose + cm(3), 0, cableId)
  return nose + cm(8)
}

function addBarrelJackPlug(group, cableId) {
  const steel = endMat(0xd5dbe2, 0.75, 0.3)
  const black = endMat(0x1a1a1a, 0.08, 0.62)
  const bore = endMat(0x101214, 0.15, 0.6)
  endMesh(group, ownedCylinder(cm(4.6), cm(4.6), cm(8), 20), steel, 0, cm(1.5), 0, cableId)
  endMesh(group, ownedRing(cm(1.3), cm(3.2)), bore, 0, cm(0.4), 0, cableId)
  endMesh(group, ownedCylinder(cm(4.2), cm(2.6), cm(10), 16), black, 0, cm(8), 0, cableId)
  return 1.4
}

function addBarrelPlug(group, cableId) {
  const steel = endMat(0xd5dbe2, 0.78, 0.28)
  const black = endMat(0x1a1a1a, 0.08, 0.62)
  const ring = endMat(0xc62828, 0.12, 0.5)
  endMesh(group, ownedCylinder(cm(2.6), cm(2.6), cm(9), 20), steel, 0, cm(-1), 0, cableId)
  endMesh(group, ownedCylinder(cm(3.4), cm(3.4), cm(1.2), 20), ring, 0, cm(3.2), 0, cableId)
  endMesh(group, ownedCylinder(cm(4.2), cm(2.6), cm(12), 18), black, 0, cm(8), 0, cableId)
  return cm(14)
}

function addPlainBoot(group, cableId) {
  const boot = endMat(0x3a3a3a, 0.08, 0.66)
  endMesh(group, ownedCylinder(cm(3.2), cm(2), cm(8), 16), boot, 0, cm(3), 0, cableId)
  return cm(7)
}

function addCablePlug(group, type, cableId, cins = 'erkek') {
  const disi = cins === 'disi'
  if (type === 'sma' || type === 'rf' || type === 'rpsma' || type === 'ntype') {
    const face = coaxFace(type === 'rf' ? 'sma' : type, cins)
    const nType = type === 'ntype'
    return face.shell === 'thread'
      ? addCoaxJackPlug(group, cableId, nType, face.contact)
      : addCoaxPlug(group, cableId, nType, face.contact)
  }
  if (type === 'ag') return addRjPlug(group, cableId)
  if (type === 'usb3') return disi ? addUsbAJackPlug(group, cableId, true) : addUsbAPlug(group, cableId, true)
  if (type === 'usb' || type === 'usb2') return disi ? addUsbAJackPlug(group, cableId, false) : addUsbAPlug(group, cableId, false)
  if (type === 'usbc') return addUsbCPlug(group, cableId)
  if (type === 'guc') return disi ? addBarrelJackPlug(group, cableId) : addBarrelPlug(group, cableId)
  return addPlainBoot(group, cableId)
}

function addPowerMalePanel(pivot, fit, component, port) {
  const black = portMaterial(0x1a1c1f, 0.12, 0.58)
  const steel = portMaterial(0xd5dbe2, 0.75, 0.3)
  const pinMat = portMaterial(0xc9ccd0, 0.82, 0.26)
  putPort(pivot, ownedCylinder(mm(fit, 5.5), mm(fit, 5.5), mm(fit, 2.2), 6), black, component, port, 0, mm(fit, 0.2), 0)
  putPort(pivot, ownedCylinder(mm(fit, 2.6), mm(fit, 2.6), mm(fit, 9), 20), steel, component, port, 0, mm(fit, 3.2), 0)
  putPort(pivot, ownedCylinder(mm(fit, 0.9), mm(fit, 0.9), mm(fit, 4), 12), pinMat, component, port, 0, mm(fit, 2.4), 0)
}

function addPowerPort(pivot, fit, component, port) {
  if (port?.cins === 'erkek') return addPowerMalePanel(pivot, fit, component, port)
  const black = portMaterial(0x1a1c1f, 0.12, 0.58)
  const steel = portMaterial(0xd5dbe2, 0.72, 0.32)
  const bore = portMaterial(0x101214, 0.15, 0.6)
  const pinMat = portMaterial(0xc9ccd0, 0.8, 0.28)
  const nutR = mm(fit, 5.5)
  const sleeveR = mm(fit, 3.5)
  const buried = mm(fit, 11)
  const proud = mm(fit, 3.2)
  putPort(pivot, ownedCylinder(nutR, nutR, mm(fit, 2.2), 6), black, component, port, 0, mm(fit, 0.2), 0)
  putPort(pivot, ownedCylinder(sleeveR * 0.86, sleeveR * 0.86, buried, 20), steel, component, port, 0, -buried / 2, 0)
  putPort(pivot, ownedCylinder(sleeveR, sleeveR, proud, 24), steel, component, port, 0, proud / 2, 0)
  const face = proud
  putPort(pivot, ownedRing(mm(fit, 1.15), sleeveR * 0.82), bore, component, port, 0, face, 0)
  putPort(pivot, ownedCylinder(mm(fit, 0.95), mm(fit, 0.95), mm(fit, 2.2), 12), pinMat, component, port, 0, face - mm(fit, 0.7), 0)
}

function remember(material) {
  if (material.color && !material.userData.base) material.userData.base = material.color.clone()
  if (material.emissive && !material.userData.baseEmissive) {
    material.userData.baseEmissive = material.emissive.clone()
  }
  if (material.emissiveIntensity != null && material.userData.baseEI == null) {
    material.userData.baseEI = material.emissiveIntensity
  }
  return material
}

function cloneMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return
    const apply = (material) => {
      const cloned = remember(material.clone())
      cloned.side = THREE.DoubleSide
      return cloned
    }
    if (Array.isArray(object.material)) object.material = object.material.map(apply)
    else object.material = apply(object.material)
  })
}

function paintMaterial(material, bright, dim) {
  if (!material?.color || !material.userData.base) return
  material.color.copy(material.userData.base)
  if (!bright) material.color.multiplyScalar(dim)
  if (material.emissive && material.userData.baseEmissive) {
    material.emissive.copy(material.userData.baseEmissive)
    if (!bright) material.emissive.multiplyScalar(0)
  }
  if (material.emissiveIntensity != null && material.userData.baseEI != null) {
    material.emissiveIntensity = bright ? material.userData.baseEI : 0
  }
}

function paintObject(object, bright, dim) {
  object.traverse((child) => {
    if (!child.isMesh) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => paintMaterial(material, bright, dim))
  })
}

function jacketCanvas(draw) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  draw(canvas.getContext('2d'))
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function fillJacket(g, color) {
  g.fillStyle = color
  g.fillRect(0, 0, 256, 64)
}

function jacketTextures() {
  const sma = jacketCanvas((g) => {
    fillJacket(g, '#8d5a38')
    g.fillStyle = '#c4895c'
    g.fillRect(0, 16, 256, 16)
    g.fillStyle = '#5c3a24'
    for (let x = 6; x < 256; x += 28) g.fillRect(x, 48, 10, 3)
  })
  const rf = jacketCanvas((g) => {
    fillJacket(g, '#1c1c1c')
    g.fillStyle = '#3a3a3a'
    g.fillRect(0, 22, 256, 8)
    g.fillStyle = '#d5d5d5'
    for (let x = 10; x < 256; x += 42) g.fillRect(x, 46, 16, 3)
  })
  const ntype = jacketCanvas((g) => {
    fillJacket(g, '#121212')
    g.fillStyle = '#050505'
    g.fillRect(0, 6, 256, 5)
    g.fillRect(0, 52, 256, 5)
    g.fillStyle = '#2a2a2a'
    g.fillRect(0, 26, 256, 8)
  })
  const usb2 = jacketCanvas((g) => {
    fillJacket(g, '#242424')
    g.fillStyle = '#f2f2f2'
    g.fillRect(0, 29, 256, 5)
  })
  const usb3 = jacketCanvas((g) => {
    fillJacket(g, '#1a1a1a')
    g.fillStyle = '#1565c0'
    g.fillRect(0, 24, 256, 12)
  })
  const usbc = jacketCanvas((g) => {
    fillJacket(g, '#2a2a2a')
    g.lineWidth = 2
    for (let i = -6; i < 16; i += 1) {
      g.strokeStyle = i % 2 ? '#8d8d8d' : '#4a4a4a'
      g.beginPath()
      g.moveTo(i * 18, 0)
      g.lineTo(i * 18 + 64, 64)
      g.stroke()
      g.beginPath()
      g.moveTo(i * 18, 64)
      g.lineTo(i * 18 + 64, 0)
      g.stroke()
    }
  })
  const ag = jacketCanvas((g) => {
    fillJacket(g, '#1a4fb5')
    g.fillStyle = '#4c82e0'
    g.fillRect(0, 20, 256, 12)
    g.fillStyle = '#0c2f78'
    for (let x = 4; x < 256; x += 30) g.fillRect(x, 48, 12, 5)
  })
  const guc = jacketCanvas((g) => {
    fillJacket(g, '#1a1a1a')
    g.fillStyle = '#070707'
    g.fillRect(0, 8, 256, 4)
    g.fillRect(0, 50, 256, 4)
    g.fillStyle = '#2c2c2c'
    g.fillRect(0, 26, 256, 8)
  })
  const diger = jacketCanvas((g) => {
    fillJacket(g, '#6e7370')
    g.fillStyle = '#8e948f'
    g.fillRect(0, 22, 256, 10)
  })
  const look = {
    sma: { map: sma, roughness: 0.32, metalness: 0.04, repeat: 1.6 },
    rpsma: { map: sma, roughness: 0.32, metalness: 0.04, repeat: 1.6 },
    rf: { map: rf, roughness: 0.62, metalness: 0.02, repeat: 1.8 },
    ntype: { map: ntype, roughness: 0.9, metalness: 0, repeat: 2.4 },
    usb2: { map: usb2, roughness: 0.55, metalness: 0.02, repeat: 2 },
    usb: { map: usb2, roughness: 0.55, metalness: 0.02, repeat: 2 },
    usb3: { map: usb3, roughness: 0.5, metalness: 0.02, repeat: 2 },
    usbc: { map: usbc, roughness: 0.92, metalness: 0.08, repeat: 0.45 },
    ag: { map: ag, roughness: 0.8, metalness: 0, repeat: 1.8 },
    guc: { map: guc, roughness: 0.86, metalness: 0, repeat: 2.2 },
    diger: { map: diger, roughness: 0.75, metalness: 0, repeat: 2 }
  }
  return look
}

const EDGE_COLOR = { en: 0xe10600, boy: 0x16a34a, derinlik: 0x2563eb }
const CENTER_COLOR = 0xf5f5f4
const PAIR_COLOR = 0x2f8f4e

function measureDots(record, solid = false) {
  const dots = []
  const kenar = record?.olcu?.kenar
  if (!solid && Array.isArray(kenar?.merkez)) dots.push({ key: 'merkez', position: kenar.merkez, color: CENTER_COLOR })
  if (!solid) for (const key of ['en', 'boy', 'derinlik']) {
    if (Array.isArray(kenar?.[key])) dots.push({ key, position: kenar[key], color: EDGE_COLOR[key] })
  }
  const cift = record?.olcu?.cift
  if (Array.isArray(cift?.a)) dots.push({ key: 'a', position: cift.a, color: PAIR_COLOR })
  if (Array.isArray(cift?.b)) dots.push({ key: 'b', position: cift.b, color: PAIR_COLOR })
  return dots
}

function measure(scene, unit = 1) {
  const box = new THREE.Box3().setFromObject(scene)
  const s = unit > 0 ? unit : 1
  if (box.isEmpty()) return { s, x: 0, y: 0, z: 0, dx: 1, dy: 1, dz: 1 }
  return {
    s,
    x: -((box.min.x + box.max.x) / 2) * s,
    y: -box.min.y * s,
    z: -((box.min.z + box.max.z) / 2) * s,
    dx: (box.max.x - box.min.x) * s,
    dy: (box.max.y - box.min.y) * s,
    dz: (box.max.z - box.min.z) * s
  }
}

function markSize(fit, fraction) {
  const span = Math.max(fit?.dx || 0, fit?.dy || 0, fit?.dz || 0, 1)
  return span * fraction / (fit?.s || 1)
}

function stripExtras(root) {
  const extras = []
  root.traverse((object) => {
    if (object.isLight || object.isCamera) extras.push(object)
  })
  extras.forEach((object) => object.removeFromParent())
}

export class View {
  constructor(canvas, hooks) {
    this.canvas = canvas
    this.hooks = hooks
    this.state = null
    this.mode = 'yerlesim'
    this.tool = 'sec'
    this.selection = null
    this.hover = null
    this.pending = null
    this.gen = 0
    this.live = true
    this.models = new Map()
    this.groups = new Map()
    this.pivots = new Map()
    this.cableMeshes = new Map()
    this.plugGroups = new Map()
    this.plugShift = new Map()
    this.bend = null
    this.down = null
    this.pan = null
    this.bendDrag = null
    this.pointDrag = null
    this.viewHalf = 4

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.38
    this.dim = 0.45
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#d5d0c6')
    this.perspective = new THREE.PerspectiveCamera(45, 1, 0.02, 200)
    this.perspective.position.set(3, 2.4, 4)
    this.perspective.up.set(0, 1, 0)
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
    this.schemaFocus = { x: 0, z: 0 }
    this.schemaDir = new THREE.Vector3(0, Math.cos(SCHEMA_TILT), Math.sin(SCHEMA_TILT))
    this.placeSchema(0, 0)
    this.cube = createViewCube()
    this.cubeRay = new THREE.Raycaster()
    this.cubePress = null

    this.loader = new GLTFLoader()
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.jackets = jacketTextures()

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()

    const hemi = new THREE.HemisphereLight(0xfff6ea, 0x8a8175, 0.55)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffffff, 1.35)
    sun.position.set(4, 9, 3)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 0.2
    sun.shadow.camera.far = 40
    sun.shadow.camera.left = -100
    sun.shadow.camera.right = 100
    sun.shadow.camera.top = 100
    sun.shadow.camera.bottom = -100
    this.scene.add(sun)

    this.grid = new THREE.GridHelper(200, 20, 0x5c564c, 0x8a8175)
    this.grid.position.y = 0
    this.scene.add(this.grid)

    this.pickRoot = new THREE.Group()
    this.inspectRoot = new THREE.Group()
    this.cableRoot = new THREE.Group()
    this.bendRoot = new THREE.Group()
    this.scene.add(this.pickRoot, this.inspectRoot, this.cableRoot, this.bendRoot)

    this.orbit = new OrbitControls(this.perspective, canvas)
    this.orbit.enableDamping = false
    this.orbit.enableRotate = false
    this.orbit.minDistance = 0.18
    this.orbit.maxDistance = 400
    this.orbit.target.set(0, 0.4, 0)
    this.orbit.addEventListener('change', () => this.requestRender())

    this.transform = new TransformControls(this.perspective, canvas)
    this.transform.setSize(1.6)
    this.scene.add(this.transform.getHelper())
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      this.setPointer(event)
      if (this.gizmoHandleHit()) {
        this.orbit.enabled = false
        this.transform.enabled = true
        this.holdingGizmo = true
        return
      }
      if (this.tool !== 'kablo' && this.tool !== 'dondur' && this.portUnderPointer()) {
        this.orbit.enabled = false
        this.transform.enabled = false
        this.holdingSurface = true
        return
      }
      if (this.bendUnderPointer()) {
        this.orbit.enabled = false
        this.transform.enabled = false
        this.holdingBend = true
        return
      }
      this.transform.enabled = false
      this.holdingGizmo = false
      if (this.mode !== 'sema') this.orbit.enabled = true
    }, true)
    this.transform.addEventListener('dragging-changed', (event) => {
      this.orbit.enabled = !event.value && this.mode !== 'sema'
      const plug = this.transform.object?.userData.kind === 'plug'
      if (event.value) {
        if (!plug) this.hooks.onPoseStart?.()
      } else this.commitPose()
    })
    this.transform.addEventListener('objectChange', () => {
      if (this.transform.object?.userData.kind === 'plug') {
        this.requestRender()
        return
      }
      this.softenTransform()
      this.syncCables()
      this.requestRender()
    })

    this.box = null
    this.syncClearColor()
    const scheme = matchMedia('(prefers-color-scheme: dark)')
    scheme.addEventListener('change', () => {
      this.syncClearColor()
      this.requestRender()
    })

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement)
    window.addEventListener('pointerup', () => {
      this.transform.enabled = true
      this.holdingGizmo = false
      if (!this.transform.dragging && !this.bendDrag && !this.surfaceDrag && !this.pointDrag && this.mode !== 'sema') this.orbit.enabled = true
    })
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button === 1) {
        event.preventDefault()
        this.onMiddle(event)
        return
      }
      this.onDown(event)
    })
    canvas.addEventListener('auxclick', (event) => event.preventDefault())
    canvas.addEventListener('pointermove', (event) => this.onMove(event))
    window.addEventListener('pointerup', (event) => this.onUp(event))
    canvas.addEventListener('wheel', (event) => this.onWheel(event), { passive: false, capture: true })
    canvas.addEventListener('contextmenu', (event) => event.preventDefault())

    this.resize()
    this.flyKeys = new Set()
    this.flyFast = false
    this.clock = new THREE.Clock()
    window.addEventListener('keydown', (event) => this.onFlyDown(event))
    window.addEventListener('keyup', (event) => this.onFlyUp(event))
    window.addEventListener('blur', () => {
      this.flyKeys.clear()
      this.flyFast = false
    })
    this.tick = this.tick.bind(this)
    requestAnimationFrame(this.tick)
  }

  onFlyDown(event) {
    const field = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement
      || event.target.closest?.('dialog')
    if (field) return
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.flyFast = true
    const fly = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    if (!fly.includes(event.code)) return
    const chrome = event.target.closest?.('[role="toolbar"], [role="tablist"]')
    if (chrome && event.code.startsWith('Arrow')) return
    this.flyKeys.add(event.code)
    event.preventDefault()
  }

  onFlyUp(event) {
    this.flyKeys.delete(event.code)
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.flyFast = false
  }

  applyFly(dt) {
    if (this.transform.dragging) return 0
    let forward = 0
    let strafe = 0
    let lift = 0
    if (this.flyKeys.has('KeyW') || this.flyKeys.has('ArrowUp')) forward += 1
    if (this.flyKeys.has('KeyS') || this.flyKeys.has('ArrowDown')) forward -= 1
    if (this.flyKeys.has('KeyD') || this.flyKeys.has('ArrowRight')) strafe += 1
    if (this.flyKeys.has('KeyA') || this.flyKeys.has('ArrowLeft')) strafe -= 1
    if (this.flyKeys.has('KeyE')) lift += 1
    if (this.flyKeys.has('KeyQ')) lift -= 1
    if (!forward && !strafe && !lift) return 0
    const camera = this.activeCamera()
    camera.updateMatrixWorld(true)
    const span = this.mode === 'sema'
      ? this.viewHalf / Math.max(this.ortho.zoom, 0.2)
      : this.perspective.position.distanceTo(this.orbit.target)
    const step = flyRate(span, this.flyFast, this.sceneSpan()) * dt
    const delta = flyDelta(camera, { forward, strafe, lift }, step, this.mode === 'sema')
    if (delta.lengthSq() < 1e-10 || !(dt > 0)) return 0
    if (this.mode === 'sema') {
      this.placeSchema(this.schemaFocus.x + delta.x, this.schemaFocus.z + delta.z)
    } else {
      this.perspective.position.add(delta)
      this.orbit.target.add(delta)
    }
    return delta.length() / dt
  }

  sceneSpan() {
    let span = 0
    for (const record of this.models.values()) {
      span = Math.max(span, record.fit?.dx || 0, record.fit?.dy || 0, record.fit?.dz || 0)
    }
    return Math.max(span, 1)
  }

  reportSpeed(speed) {
    const text = `${(Number.isFinite(speed) ? speed : 0).toFixed(1)} birim/s`
    if (text === this.speedText) return
    this.speedText = text
    this.hooks.onSpeed?.(text)
  }

  syncClearColor() {
    const color = getComputedStyle(document.getElementById('gorunum')).backgroundColor || '#d5d0c6'
    this.scene.background.set(color)
    this.renderer.setClearColor(color, 1)
    const channels = color.match(/[\d.]+/g)?.map(Number) || [213, 208, 198]
    const dark = channels[0] < 80
    const major = dark ? 0x6f675c : 0x8a8175
    const minor = dark ? 0x3c3832 : 0xb7b0a4
    this.grid.material.color?.set(major)
    if (Array.isArray(this.grid.material)) {
      this.grid.material[0].color.set(major)
      this.grid.material[1].color.set(minor)
    }
  }

  requestRender() {
    this.live = true
  }

  tick() {
    requestAnimationFrame(this.tick)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const speed = this.flyKeys.size ? this.applyFly(dt) : 0
    if (speed) this.live = true
    this.reportSpeed(speed)
    if (!this.live) return
    if (this.box) this.box.update()
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, width, height)
    this.renderer.render(this.scene, this.activeCamera())
    this.renderCube(width, height)
    this.live = false
  }

  activeCamera() {
    return this.mode === 'sema' ? this.ortho : this.perspective
  }

  resize() {
    const parent = this.canvas.parentElement
    const width = Math.max(1, parent.clientWidth)
    const height = Math.max(1, parent.clientHeight)
    this.renderer.setSize(width, height, false)
    this.perspective.aspect = width / height
    this.perspective.updateProjectionMatrix()
    const aspect = width / height
    this.ortho.top = this.viewHalf
    this.ortho.bottom = -this.viewHalf
    this.ortho.left = -this.viewHalf * aspect
    this.ortho.right = this.viewHalf * aspect
    this.ortho.updateProjectionMatrix()
    this.requestRender()
  }

  async setState(state) {
    this.state = state
    const generation = ++this.gen
    await this.ensureModels()
    if (generation !== this.gen || this.state !== state) return
    this.syncComponents()
    this.syncInspect()
    this.syncCables()
    this.syncGizmo()
    this.applyFocus()
    this.requestRender()
  }

  setMode(mode) {
    if (this.mode === mode) return
    this.mode = mode
    this.pending = null
    this.orbit.enabled = mode !== 'sema'
    this.pickRoot.visible = mode !== 'incele'
    this.cableRoot.visible = mode !== 'incele'
    this.grid.visible = true
    if (mode === 'sema') this.frameSchema()
    this.syncComponents()
    this.syncInspect()
    this.syncCables()
    this.syncGizmo()
    this.applyFocus()
    this.requestRender()
  }

  setTool(tool) {
    this.tool = tool
    if (tool !== 'kablo') this.pending = null
    this.syncGizmo()
    this.requestRender()
  }

  setSelection(selection) {
    this.selection = selection
    this.syncGizmo()
    this.syncCables()
    this.applyFocus()
    this.requestRender()
  }

  frameComponent(id) {
    const group = this.groups.get(id)
    if (!group) return
    this.frameObject(group)
    this.requestRender()
  }

  setHover(hit) {
    const key = this.hitKey(hit)
    if (key === this.hitKey(this.hover)) return
    this.hover = hit
    this.applyFocus()
    this.requestRender()
  }

  cancelCable() {
    this.pending = null
    this.applyFocus()
    this.requestRender()
  }

  frame() {
    if (this.mode === 'sema') this.frameSchema()
    else if (this.mode === 'incele') this.frameObject(this.inspectRoot)
    else this.frameObject(this.pickRoot)
    this.requestRender()
  }

  async ensureModels() {
    await Promise.all(this.state.models.map(async (model) => {
      if (this.models.has(model.id)) return
      const buffer = await this.hooks.modelBuffer(model)
      if (!buffer) return
      const gltf = await this.loader.parseAsync(buffer, '')
      stripExtras(gltf.scene)
      this.models.set(model.id, { scene: gltf.scene, fit: measure(gltf.scene, modelUnit(model)) })
    }))
  }

  syncComponents() {
    if (this.mode === 'incele') return
    const alive = new Set(this.state.components.map((item) => item.id))
    for (const [id, group] of this.groups) {
      if (alive.has(id)) continue
      this.disposeMaterials(group)
      group.removeFromParent()
      this.groups.delete(id)
    }
    this.pivots.clear()
    for (const component of this.state.components) {
      const record = this.state.models.find((item) => item.id === component.modelId)
      const signature = `${component.modelId}:${JSON.stringify(record?.ports || [])}:${JSON.stringify(record?.olcu?.kenar || null)}:${JSON.stringify(record?.olcu?.cift || null)}:${record?.olcek ?? ''}:${JSON.stringify(component.ports)}`
      let group = this.groups.get(component.id)
      if (!group || group.userData.signature !== signature) {
        if (group) {
          if (this.transform.object === group) this.transform.detach()
          this.disposeMaterials(group)
          group.removeFromParent()
        }
        group = this.buildComponent(component)
        if (!group) continue
        group.userData.signature = signature
        this.groups.set(component.id, group)
        this.pickRoot.add(group)
      }
      this.indexPivots(group)
      if (this.transform.dragging && this.transform.object === group) continue
      this.applyPose(group, component)
    }
  }

  buildComponent(component) {
    const model = this.models.get(component.modelId)
    if (!model) return null
    const fit = model.fit
    const align = new THREE.Group()
    align.scale.setScalar(fit.s)
    align.position.set(fit.x, fit.y, fit.z)
    const visual = cloneObject(model.scene)
    cloneMaterials(visual)
    visual.traverse((object) => {
      if (!object.isMesh) return
      object.castShadow = true
      object.receiveShadow = true
      object.userData.kind = 'component'
      object.userData.componentId = component.id
    })
    align.add(visual)
    const record = this.state.models.find((item) => item.id === component.modelId)
    const ports = [...(record?.ports || []), ...(component.ports || [])]
    const solid = modelSolid(record)
    for (const port of ports) align.add(this.makePort(component, port, fit))
    this.addMeasureDots(align, measureDots(record, solid), fit, false)
    if (!solid) this.addMeasureEdges(align, record?.olcu?.kenar)
    this.addMeasureLine(align, record?.olcu?.cift)
    const group = new THREE.Group()
    group.name = component.id
    group.userData.componentId = component.id
    group.add(align)
    return group
  }

  makePort(component, port, fit) {
    const pivot = new THREE.Group()
    pivot.name = port.id
    pivot.userData.portId = port.id
    pivot.userData.componentId = component.id
    pivot.userData.pivot = true
    pivot.position.fromArray(port.position)
    const normal = new THREE.Vector3().fromArray(port.normal)
    if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0)
    pivot.quaternion.copy(portOrientation(normal, port.roll || 0))
    const kind = port.type
    if (kind === 'ag') addEthernetPort(pivot, fit, component, port)
    else if (kind === 'sma' || kind === 'rf' || kind === 'rpsma') addCoaxPort(pivot, fit, component, port, false)
    else if (kind === 'ntype') addCoaxPort(pivot, fit, component, port, true)
    else if (kind === 'usb3') addUsbAPort(pivot, fit, component, port, true)
    else if (kind === 'usb' || kind === 'usb2') addUsbAPort(pivot, fit, component, port, false)
    else if (kind === 'usbc') addUsbCPort(pivot, fit, component, port)
    else addPowerPort(pivot, fit, component, port)
    return pivot
  }

  indexPivots(group) {
    group.traverse((object) => {
      if (object.userData.pivot) {
        this.pivots.set(`${object.userData.componentId}:${object.userData.portId}`, object)
      }
    })
  }

  applyPose(group, component) {
    group.scale.setScalar(1)
    if (this.mode === 'sema') {
      group.position.set(component.schema.x, 0, component.schema.z)
      group.rotation.set(0, component.schema.yaw || 0, 0)
    } else {
      group.position.set(component.position[0], component.position[1], component.position[2])
      group.rotation.set(0, component.yaw || 0, 0)
    }
    group.updateMatrixWorld(true)
  }

  syncInspect() {
    this.inspectRoot.visible = this.mode === 'incele'
    if (this.mode !== 'incele') return
    const modelId = this.hooks.inspectModelId?.() || ''
    const model = modelId ? this.models.get(modelId) : null
    const record = this.state?.models.find((item) => item.id === modelId)
    const ports = record?.ports || []
    const kenar = record?.olcu?.kenar || null
    const cift = record?.olcu?.cift || null
    const signature = `${modelId}:${JSON.stringify(ports)}:${JSON.stringify(kenar)}:${JSON.stringify(cift)}:${record?.olcek ?? ''}`
    if (!model) {
      if (this.inspectRoot.userData.signature !== '') {
        this.clearGroup(this.inspectRoot)
        this.inspectRoot.userData.signature = ''
      }
      return
    }
    if (this.inspectRoot.userData.signature === signature && this.inspectRoot.children.length) {
      this.indexPivots(this.inspectRoot)
      return
    }
    const keepCamera = this.inspectRoot.userData.modelId === modelId && this.inspectRoot.children.length > 0
    this.clearGroup(this.inspectRoot)
    this.inspectRoot.userData.signature = signature
    this.inspectRoot.userData.modelId = modelId
    const fit = model.fit
    const align = new THREE.Group()
    align.scale.setScalar(fit.s)
    align.position.set(fit.x, fit.y, fit.z)
    const visual = cloneObject(model.scene)
    cloneMaterials(visual)
    visual.traverse((object) => {
      if (!object.isMesh) return
      object.castShadow = true
      object.receiveShadow = true
      object.userData.kind = 'submesh'
    })
    align.add(visual)
    const solid = modelSolid(record)
    for (const port of ports) align.add(this.makePort({ id: 'incele' }, port, fit))
    this.addMeasureDots(align, measureDots(record, solid), fit, true)
    if (!solid) this.addMeasureEdges(align, kenar)
    this.addMeasureLine(align, cift)
    this.inspectRoot.add(align)
    this.indexPivots(this.inspectRoot)
    if (!keepCamera) this.frameObject(this.inspectRoot)
  }

  portFrame(componentId, portId) {
    const pivot = this.pivots.get(`${componentId}:${portId}`)
    if (!pivot) return null
    pivot.updateWorldMatrix(true, false)
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    pivot.getWorldPosition(position)
    pivot.getWorldQuaternion(quaternion)
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize()
    return {
      position: [position.x, position.y, position.z],
      normal: [normal.x, normal.y, normal.z]
    }
  }

  syncCables() {
    this.clearCables()
    if (!this.state || this.mode === 'incele') return
    const visible = this.state.cables.filter((cable) => cableShown(this.state, cable))
    const frames = new Map()
    const lanes = []
    for (const cable of visible) {
      const a = this.portFrame(cable.a.componentId, cable.a.portId)
      const b = this.portFrame(cable.b.componentId, cable.b.portId)
      frames.set(cable.id, { a, b })
      if (!a || !b) continue
      const mid = [(a.position[0] + b.position[0]) / 2, (a.position[2] + b.position[2]) / 2]
      let lane = 0
      for (const prev of lanes) {
        const dx = prev.mid[0] - mid[0]
        const dz = prev.mid[1] - mid[1]
        if (dx * dx + dz * dz < 2.25) lane = Math.max(lane, prev.lane + 1)
      }
      lanes.push({ mid, lane })
      frames.get(cable.id).lane = lane
    }
    const laid = []
    for (const cable of visible) {
      const frame = frames.get(cable.id)
      const a = this.plugFrame(frame?.a, cable.id, 'a')
      const b = this.plugFrame(frame?.b, cable.id, 'b')
      if (!a || !b) continue
      const typeA = portTypeOf(this.state, cable.a.componentId, cable.a.portId) || cable.type
      const typeB = portTypeOf(this.state, cable.b.componentId, cable.b.portId) || cable.type
      const reachA = plugReach(typeA)
      const reachB = plugReach(typeB)
      const plain = this.plainRoute(a, b, cable, frame.lane || 0, laid, reachA, reachB)
      const vias = this.viasOf(cable, plain)
      const lift = SCHEMA_LIFT[cable.type] || 0.02
      const points = vias.length
        ? routeVia(a.position, a.normal, b.position, b.normal, vias, this.mode === 'sema' ? lift : null, { leadA: reachA, leadB: reachB })
        : plain
      if (!points) continue
      laid.push(points)
      this.addCableEnd(frame.a, typeA, cable.id, 'a')
      this.addCableEnd(frame.b, typeB, cable.id, 'b')
      const line = points
      const curve = new THREE.CatmullRomCurve3(line.map((point) => new THREE.Vector3().fromArray(point)))
      if (this.mode === 'sema') {
        curve.curveType = 'catmullrom'
        curve.tension = 0.08
      } else {
        curve.curveType = 'centripetal'
      }
      const radius = cableRadius(cable.type)
      const tubular = Math.max(24, Math.round(curve.getLength() * 4))
      const geometry = new THREE.TubeGeometry(curve, tubular, radius, 16, false)
      geometry.userData.owned = true
      const jacket = this.jackets[cable.type] || this.jackets.diger
      const map = jacket.map.clone()
      map.userData.owned = true
      map.wrapS = THREE.RepeatWrapping
      map.wrapT = THREE.RepeatWrapping
      map.repeat.set(Math.max(2, curve.getLength() / jacket.repeat), 1)
      const material = remember(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map,
        roughness: jacket.roughness,
        metalness: jacket.metalness
      }))
      material.userData.owned = true
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.userData.kind = 'cable'
      mesh.userData.cableId = cable.id
      this.cableRoot.add(mesh)
      this.cableMeshes.set(cable.id, mesh)
      const pickGeometry = new THREE.TubeGeometry(curve, Math.max(12, Math.round(tubular / 2)), Math.max(radius * 2.2, 0.45), 5, false)
      pickGeometry.userData.owned = true
      const pick = new THREE.Mesh(pickGeometry, new THREE.MeshBasicMaterial())
      pick.visible = false
      pick.userData.kind = 'cable'
      pick.material.userData.owned = true
      pick.userData.cableId = cable.id
      this.cableRoot.add(pick)
      if (this.selection?.kind === 'cable' && this.selection.id === cable.id && vias.length) {
        this.addBendHandles(cable, vias, this.mode === 'sema' ? lift : null)
      }
    }
  }

  plainRoute(a, b, cable, lane = 0, laid = [], leadA = 0.7, leadB = 0.7) {
    if (this.mode === 'sema') {
      const footprints = []
      for (const group of this.groups.values()) {
        const box = new THREE.Box3().setFromObject(group)
        if (box.isEmpty()) continue
        footprints.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z })
      }
      return routeSchema(a.position, a.normal, b.position, b.normal, SCHEMA_LIFT[cable.type] || 0.02, [0, 0], footprints)
    }
    const boxes = []
    for (const group of this.groups.values()) {
      const box = new THREE.Box3().setFromObject(group)
      if (box.isEmpty()) continue
      boxes.push({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] })
    }
    const radius = cableRadius(cable.type)
    return routeClear(a.position, a.normal, b.position, b.normal, boxes, lane, {
      leadA,
      leadB,
      pad: radius + 0.25,
      gap: radius * 2 + 0.45,
      cables: laid
    })
  }

  viasOf(cable, plain) {
    if (this.bendDrag?.id === cable.id) return this.bendDrag.vias
    const schema = this.mode === 'sema'
    const stored = schema ? cable.schemaVias : cable.vias
    if (stored?.length) return stored.map((via) => [...via])
    if (!plain) return []
    const base = plain[Math.min(2, plain.length - 1)]
    if (schema) {
      const bend = cable.schemaBend || [0, 0]
      if (Math.abs(bend[0]) > 1e-4 || Math.abs(bend[1]) > 1e-4) return [[base[0] + bend[0], base[2] + bend[1]]]
      return []
    }
    const bend = cable.bend || [0, 0, 0]
    if (bend.some((value) => Math.abs(value) > 1e-4)) {
      return [[base[0] + bend[0], base[1] + (bend[1] || 0), base[2] + (bend[2] || 0)]]
    }
    return []
  }

  bendRadius(type) {
    const bead = cableRadius(type) * 1.7
    if (this.mode !== 'sema') return bead
    const span = (this.ortho.top - this.ortho.bottom) / Math.max(this.ortho.zoom, 0.001)
    const screen = span / Math.max(this.canvas.clientHeight, 1) * 6
    return Math.min(Math.max(bead, screen), bead * 1.8)
  }

  addBendHandles(cable, vias, lift) {
    const radius = this.bendRadius(cable.type)
    vias.forEach((via, index) => {
      const at = lift == null ? via : [via[0], lift, via[1]]
      const geometry = new THREE.SphereGeometry(radius, 20, 14)
      geometry.userData.owned = true
      const mesh = new THREE.Mesh(
        geometry,
        remember(new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.35, metalness: 0.15 }))
      )
      mesh.position.fromArray(at)
      mesh.userData.kind = 'bend'
      mesh.userData.cableId = cable.id
      mesh.userData.viaIndex = index
      const pickGeometry = new THREE.SphereGeometry(Math.max(radius * 1.6, 0.35), 12, 10)
      pickGeometry.userData.owned = true
      const pick = new THREE.Mesh(pickGeometry, new THREE.MeshBasicMaterial())
      pick.visible = false
      pick.position.fromArray(at)
      pick.userData.kind = 'bend'
      pick.userData.cableId = cable.id
      pick.userData.viaIndex = index
      this.bendRoot.add(mesh, pick)
    })
  }

  plugFrame(frame, cableId, end) {
    const shift = this.plugShift.get(`${cableId}:${end}`)
    if (!frame || !shift) return frame
    return {
      position: [frame.position[0] + shift.x, frame.position[1] + shift.y, frame.position[2] + shift.z],
      normal: frame.normal
    }
  }

  plugCins(cableId, end) {
    const cable = this.state?.cables?.find((item) => item.id === cableId)
    const side = end === 'b' ? cable?.b : cable?.a
    if (!side) return 'erkek'
    return cableCins(portRecord(this.state, side.componentId, side.portId))
  }

  addCableEnd(frame, type, cableId, end) {
    const group = new THREE.Group()
    const home = new THREE.Vector3().fromArray(frame.position)
    group.position.copy(home)
    const shift = this.plugShift.get(`${cableId}:${end}`)
    if (shift) group.position.add(shift)
    group.quaternion.copy(portOrientation(new THREE.Vector3().fromArray(frame.normal), 0))
    group.userData.kind = 'plug'
    group.userData.end = end
    group.userData.cableId = cableId
    group.userData.home = home
    addCablePlug(group, type, cableId, this.plugCins(cableId, end))
    group.traverse((object) => {
      if (!object.isMesh) return
      object.userData.kind = 'plug'
      object.userData.end = end
      object.userData.cableId = cableId
    })
    this.plugGroups.set(`${cableId}:${end}`, group)
    this.cableRoot.add(group)
  }

  clearCables() {
    const release = (object) => {
      if (object.geometry?.userData.owned) object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!material?.userData.owned) continue
        if (material.map?.userData.owned) material.map.dispose()
        material.dispose()
      }
    }
    for (const child of [...this.cableRoot.children]) {
      child.traverse(release)
      child.removeFromParent()
    }
    this.cableMeshes.clear()
    this.plugGroups.clear()
    for (const child of [...this.bendRoot.children]) {
      if (child.geometry?.userData.owned) child.geometry.dispose()
      if (child.material) child.material.dispose()
      child.removeFromParent()
    }
  }

  syncGizmo() {
    let group = null
    if (this.selection?.kind === 'component' && this.mode !== 'incele') group = this.groups.get(this.selection.id) || null
    if (this.selection?.kind === 'port') {
      group = this.pivots.get(`${this.selection.componentId}:${this.selection.portId}`) || null
      if (!group) {
        for (const pivot of this.pivots.values()) {
          if (pivot.userData.portId === this.selection.portId) {
            group = pivot
            break
          }
        }
      }
    }
    if (this.selection?.kind === 'plug') {
      group = this.plugGroups.get(`${this.selection.cableId}:${this.selection.end}`) || null
    }
    const rotate = this.tool === 'dondur'
    const portAxes = Boolean(group)
      && this.selection?.kind === 'port'
      && this.mode === 'incele'
      && this.tool !== 'kablo'
      && this.tool !== 'olcu'
      && !rotate
    const plugAxes = Boolean(group) && this.selection?.kind === 'plug' && this.mode !== 'incele'
    const freeAxes = portAxes || plugAxes
    const editing = freeAxes || (Boolean(group) && this.selection?.kind !== 'port' && this.selection?.kind !== 'plug' && this.tool !== 'kablo' && this.tool !== 'port' && this.tool !== 'olcu')
    if (!editing) {
      this.transform.detach()
      this.setBox(group && this.mode !== 'incele' && this.selection?.kind !== 'port' ? group : null)
      return
    }
    this.transform.camera = this.activeCamera()
    this.transform.setMode(rotate ? 'rotate' : 'translate')
    this.transform.setSize(freeAxes ? 1.15 : rotate ? 2.4 : 1.6)
    this.transform.space = freeAxes || rotate ? 'local' : 'world'
    const schema = this.mode === 'sema'
    this.transform.showX = freeAxes || !rotate
    this.transform.showY = freeAxes || rotate || !schema
    this.transform.showZ = freeAxes || !rotate
    this.transform.showXY = !freeAxes && !schema && !rotate
    this.transform.showYZ = !freeAxes && !schema && !rotate
    this.transform.showXZ = !freeAxes && !schema && !rotate
    this.transform.showE = false
    this.transform.showXYZE = false
    if (rotate) {
      this.transform.showX = false
      this.transform.showZ = false
      this.transform.showY = true
    }
    if (this.transform.object !== group) this.transform.attach(group)
    this.setBox(group)
  }

  setBox(object) {
    if (this.box) {
      this.box.removeFromParent()
      this.box.geometry?.dispose()
      this.box = null
    }
    if (!object) return
    this.box = new THREE.BoxHelper(object, 0xb45309)
    this.scene.add(this.box)
  }

  applyFocus() {
    const focus = focusFor(this.state || { cables: [], hiddenTypes: [] }, this.hover)
    const dim = this.dim
    const paintNode = (root) => {
      root.traverse((object) => {
        if (!object.isMesh) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => paintMaterial(material, this.meshLit(object, focus), dim))
      })
    }
    if (this.mode === 'incele') {
      paintNode(this.inspectRoot)
    } else {
      for (const group of this.groups.values()) paintNode(group)
      for (const mesh of this.cableMeshes.values()) paintNode(mesh)
      paintNode(this.bendRoot)
    }
    this.markActivePorts(focus)
    if (this.pending) {
      const pivot = this.pivots.get(`${this.pending.componentId}:${this.pending.portId}`)
      pivot?.traverse((object) => {
        if (object.isMesh && object.material?.emissive) object.material.emissive.set(0xf2c14e)
      })
    }
  }

  markActivePorts(focus) {
    const roots = this.mode === 'incele' ? [this.inspectRoot] : [...this.groups.values()]
    for (const root of roots) {
      root.traverse((object) => {
        if (!object.isMesh || object.userData.kind !== 'port' || !object.material?.emissive) return
        const key = `${object.userData.componentId}:${object.userData.portId}`
        const selected = this.selection?.kind === 'port'
          && object.userData.portId === this.selection.portId
          && object.userData.componentId === this.selection.componentId
        const on = selected || (Boolean(focus?.portFocus) && (focus.ports.has(key) || focus.anyPort.has(object.userData.portId)))
        if (!on) return
        object.material.emissive.set(0x8a5a18)
        object.material.emissiveIntensity = 0.35
      })
    }
  }

  meshLit(object, focus) {
    if (!focus || this.mode === 'incele') return true
    const kind = object.userData.kind
    if (focus.submesh) return object === focus.submesh
    if (focus.portFocus) return true
    if (kind === 'cable' || kind === 'bend') return focus.cables?.has(object.userData.cableId)
    if (object.userData.componentId && focus.components) return focus.components.has(object.userData.componentId)
    return true
  }

  frameObject(root) {
    const box = new THREE.Box3().setFromObject(root)
    if (box.isEmpty()) {
      this.orbit.target.set(0, 0.4, 0)
      this.perspective.position.set(3, 2.4, 4)
      this.perspective.lookAt(this.orbit.target)
      this.perspective.up.set(0, 1, 0)
      return
    }
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 1.35 || 1
    if (!Number.isFinite(center.x + center.y + center.z + radius)) return
    this.orbit.target.copy(center)
    this.perspective.up.set(0, 1, 0)
    this.perspective.position.set(center.x + radius * 0.75, center.y + radius * 0.55, center.z + radius)
    this.perspective.lookAt(center)
    this.orbit.update()
  }

  placeSchema(x, z) {
    this.schemaFocus = { x, z }
    const pose = schemaPose(x, z, this.schemaDir)
    this.ortho.up.set(pose.up[0], pose.up[1], pose.up[2])
    this.ortho.position.set(pose.position[0], pose.position[1], pose.position[2])
    this.ortho.lookAt(pose.target[0], pose.target[1], pose.target[2])
    this.ortho.updateMatrixWorld(true)
  }

  frameSchema() {
    const box = new THREE.Box3().setFromObject(this.pickRoot)
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
    const size = box.isEmpty() ? new THREE.Vector3(4, 1, 4) : box.getSize(new THREE.Vector3())
    this.viewHalf = Math.max(size.x, size.z, 2) * 0.7
    this.ortho.zoom = 1
    this.placeSchema(center.x, center.z)
    this.resize()
  }

  setPointer(event) {
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  hits(root) {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    return this.raycaster.intersectObject(root, true)
  }

  gizmoHandleHit() {
    if (!this.transform.object) return false
    const gizmo = this.transform._gizmo
    const handles = gizmo?.gizmo?.[this.transform.mode]
    if (!handles) return false
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    const roots = [handles]
    if (this.transform.mode === 'rotate' && gizmo.picker?.rotate) roots.push(gizmo.picker.rotate)
    return roots.some((root) => this.raycaster.intersectObject(root, true).some((hit) => hit.object.visible || root !== handles))
  }

  firstHit() {
    const root = this.mode === 'incele' ? this.inspectRoot : this.pickRoot
    const cableHits = this.mode === 'incele' ? [] : [...this.hits(this.cableRoot), ...this.hits(this.bendRoot)]
    const bodyHits = this.hits(root)
    const all = [...cableHits, ...bodyHits].sort((a, b) => a.distance - b.distance)
    const bendHit = all.find((hit) => hit.object.userData.kind === 'bend')
    if (bendHit) {
      const data = bendHit.object.userData
      return { ...data, point: bendHit.point, face: bendHit.face, object: bendHit.object }
    }
    let chosen = null
    let portHit = null
    for (const hit of all) {
      if (!hit.object.userData.kind) continue
      if (!chosen) chosen = hit
      if (!portHit && hit.object.userData.kind === 'port') portHit = hit
    }
    if (chosen?.object.userData.kind === 'olcu') {
      const data = chosen.object.userData
      return { ...data, point: chosen.point, face: chosen.face, object: chosen.object }
    }
    const hit = portHit && chosen && portHit.distance <= chosen.distance + 0.04 ? portHit : chosen
    if (!hit) return null
    const data = hit.object.userData
    if (data.kind === 'submesh') return { kind: 'submesh', mesh: hit.object, point: hit.point, face: hit.face, faceIndex: hit.faceIndex, object: hit.object }
    return { ...data, point: hit.point, face: hit.face, faceIndex: hit.faceIndex, object: hit.object }
  }

  hitKey(hit) {
    if (!hit) return ''
    return `${hit.kind}:${hit.componentId || ''}:${hit.cableId || ''}:${hit.portId || ''}:${hit.mesh?.uuid || ''}`
  }

  onDown(event) {
    if (event.button !== 0 || this.transform.dragging) return
    const dir = this.readCube(event)
    if (dir) {
      this.cubePress = { x: event.clientX, y: event.clientY, dir }
      return
    }
    this.setPointer(event)
    if (this.gizmoHandleHit()) return
    const hit = this.firstHit()
    this.down = { x: event.clientX, y: event.clientY, hit }
    if (this.mode === 'incele' && hit?.kind === 'olcu' && hit.olcuKey) {
      this.pointDrag = { key: hit.olcuKey, moved: false }
      this.orbit.enabled = false
      this.canvas.style.cursor = 'grabbing'
      if (event.pointerId != null) this.canvas.setPointerCapture?.(event.pointerId)
      return
    }
    if (this.tool === 'dondur' && this.turnObject(hit)) {
      const object = this.turnObject(hit)
      this.yawDrag = {
        object,
        start: this.screenAngle(event, object),
        quat: object.quaternion.clone(),
        started: false
      }
    }
    if (this.mode !== 'yerlesim' && this.tool !== 'kablo' && this.tool !== 'dondur' && hit?.kind === 'port') {
      const pivot = this.pivots.get(`${hit.componentId}:${hit.portId}`)
      const visual = pivot && this.portSurface(pivot)
      if (pivot && visual) {
        const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(pivot.quaternion).normalize()
        this.surfaceDrag = { pivot, visual, roll: portRoll(pivot.quaternion, normal), started: false }
        this.orbit.enabled = false
      }
    }
    if (hit?.kind === 'bend') {
      const cable = this.state.cables.find((item) => item.id === hit.cableId)
      const a = cable && this.portFrame(cable.a.componentId, cable.a.portId)
      const b = cable && this.portFrame(cable.b.componentId, cable.b.portId)
      const plain = a && b ? this.plainRoute(a, b, cable) : null
      this.bendDrag = {
        id: hit.cableId,
        index: hit.viaIndex || 0,
        vias: this.viasOf(cable, plain).map((via) => [...via]),
        moved: false,
        started: false
      }
      this.orbit.enabled = false
    }
  }

  onMove(event) {
    this.setPointer(event)
    if (this.cubePress) {
      this.paintCube(event)
      return
    }
    if (!this.down && !this.transform.dragging && this.paintCube(event)) {
      this.canvas.style.cursor = 'pointer'
      this.setHover(null)
      return
    }
    if (this.pointDrag && this.down) {
      if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 3) this.pointDrag.moved = true
      if (this.pointDrag.moved) this.dragMeasurePoint()
      this.canvas.style.cursor = 'grabbing'
      return
    }
    if (this.canvas.style.cursor === 'pointer' || this.canvas.style.cursor === 'grab') this.canvas.style.cursor = ''
    if (this.surfaceDrag && this.down) {
      this.dragPortOnSurface(event)
      return
    }
    if (this.yawDrag && this.down) {
      this.dragYaw(event)
      return
    }
    if (this.bendDrag && this.down) {
      if (!this.bendDrag.started) {
        this.bendDrag.started = true
        this.hooks.onPoseStart?.()
      }
      this.dragBend()
      return
    }
    if (this.pan) {
      this.dragPan(event)
      return
    }
    if (this.lookDrag) {
      this.dragLook(event)
      return
    }
    if (this.down && this.mode === 'sema' && !this.down.hit && !this.transform.dragging) {
      if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 4) {
        this.pan = { x: event.clientX, y: event.clientY, fx: this.schemaFocus.x, fz: this.schemaFocus.z }
      }
    }
    if (this.down && this.mode !== 'sema' && !this.surfaceDrag && !this.yawDrag && !this.bendDrag && !this.pointDrag && !this.holdingGizmo && !this.transform.dragging) {
      if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 4) {
        this.lookDrag = { x: event.clientX, y: event.clientY }
        this.orbit.enabled = false
      }
    }
    if (this.down || this.transform.dragging) return
    const hit = this.firstHit()
    if (hit?.kind === 'olcu') this.canvas.style.cursor = 'grab'
    const hover = hit ? { kind: hit.kind, componentId: hit.componentId, cableId: hit.cableId, portId: hit.portId, mesh: hit.mesh } : null
    this.setHover(hover)
  }

  dragPan(event) {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    const worldPerX = (this.ortho.right - this.ortho.left) / this.ortho.zoom / width
    const worldPerY = (this.ortho.top - this.ortho.bottom) / this.ortho.zoom / height
    this.placeSchema(this.pan.fx, this.pan.fz)
    const { right, up } = groundAxes(this.ortho)
    const dx = event.clientX - this.pan.x
    const dy = event.clientY - this.pan.y
    const next = panFocus({ x: this.pan.fx, z: this.pan.fz }, right, up, dx, dy, worldPerX, worldPerY)
    this.placeSchema(next.x, next.z)
    this.requestRender()
  }

  dragLook(event) {
    const dx = Math.max(-64, Math.min(64, event.clientX - this.lookDrag.x))
    const dy = Math.max(-64, Math.min(64, event.clientY - this.lookDrag.y))
    this.lookDrag.x = event.clientX
    this.lookDrag.y = event.clientY
    if (dx === 0 && dy === 0) return
    const camera = this.perspective
    const dist = Math.max(0.5, camera.position.distanceTo(this.orbit.target))
    const height = Math.max(this.canvas.clientHeight, 1)
    const step = (Math.PI * 2) / Math.max(height, 700)
    turnLook(camera, dx * step, dy * step)
    aimAhead(camera, this.orbit.target, dist)
    this.orbit.update()
    this.requestRender()
  }

  bendUnderPointer() {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    return this.raycaster.intersectObject(this.bendRoot, true).some((hit) => hit.object.userData.kind === 'bend')
  }

  onMiddle(event) {
    if (this.selection?.kind !== 'cable') return
    this.setPointer(event)
    const hit = this.firstHit()
    if (!hit || hit.cableId !== this.selection.id) return
    if (hit.kind !== 'cable' && hit.kind !== 'bend') return
    const cable = this.state.cables.find((item) => item.id === this.selection.id)
    const placed = this.placeVia(cable, hit.point)
    if (!placed) return
    this.hooks.onPoseStart?.()
    this.hooks.onBend?.(cable.id, placed.vias, this.mode === 'sema')
    this.bendDrag = { id: cable.id, index: placed.index, vias: placed.vias, moved: true, started: true }
    this.down = { x: event.clientX, y: event.clientY, hit }
    this.orbit.enabled = false
  }

  placeVia(cable, point) {
    if (!cable) return null
    const a = this.portFrame(cable.a.componentId, cable.a.portId)
    const b = this.portFrame(cable.b.componentId, cable.b.portId)
    if (!a || !b) return null
    const plain = this.plainRoute(a, b, cable)
    const vias = this.viasOf(cable, plain).map((via) => [...via])
    const schema = this.mode === 'sema'
    const spot = schema
      ? [softSnap(point.x), softSnap(point.z)]
      : [softSnap(point.x), point.y, softSnap(point.z)]
    const chain = schema
      ? [[a.position[0], a.position[2]], ...vias, [b.position[0], b.position[2]]]
      : [a.position, ...vias, b.position]
    const probe = schema ? [spot[0], spot[1]] : spot
    let index = 0
    let best = Infinity
    for (let i = 0; i < chain.length - 1; i += 1) {
      const distance = this.segmentDistance(probe, chain[i], chain[i + 1])
      if (distance < best) {
        best = distance
        index = i
      }
    }
    vias.splice(index, 0, spot)
    return { vias, index }
  }

  segmentDistance(point, start, end) {
    const ab = [end[0] - start[0], (end[1] ?? 0) - (start[1] ?? 0), (end[2] ?? 0) - (start[2] ?? 0)]
    const ap = [point[0] - start[0], (point[1] ?? 0) - (start[1] ?? 0), (point[2] ?? 0) - (start[2] ?? 0)]
    const length = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
    const t = length < 1e-8 ? 0 : Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / length))
    const dx = start[0] + ab[0] * t - point[0]
    const dy = (start[1] ?? 0) + ab[1] * t - (point[1] ?? 0)
    const dz = (start[2] ?? 0) + ab[2] * t - (point[2] ?? 0)
    return dx * dx + dy * dy + dz * dz
  }

  dragBend() {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    const via = this.bendDrag.vias[this.bendDrag.index]
    if (!via) return
    const point = new THREE.Vector3()
    if (this.mode === 'sema') {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(SCHEMA_LIFT.guc || 0.02))
      if (!this.raycaster.ray.intersectPlane(plane, point)) return
      this.bendDrag.vias[this.bendDrag.index] = [softSnap(point.x), softSnap(point.z)]
    } else {
      const normal = new THREE.Vector3()
      this.activeCamera().getWorldDirection(normal)
      const anchor = new THREE.Vector3(via[0], via[1] || 0, via[2] || 0)
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor)
      if (!this.raycaster.ray.intersectPlane(plane, point)) return
      this.bendDrag.vias[this.bendDrag.index] = [softSnap(point.x), point.y, softSnap(point.z)]
    }
    this.bendDrag.moved = true
    this.orbit.enabled = false
    this.syncCables()
    this.requestRender()
  }

  softenTransform() {
    const object = this.transform.object
    if (!object) return
    if (object.userData.kind === 'plug') return
    if (object.userData.pivot && this.transform.mode === 'translate') return
    if (this.transform.mode === 'rotate') {
      if (object.userData.pivot) {
        const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(object.quaternion).normalize()
        const roll = softSnapAngle(portRoll(object.quaternion, normal))
        object.quaternion.copy(portOrientation(normal, roll))
      } else {
        object.rotation.set(0, softSnapAngle(headingFromQuaternion(object.quaternion)), 0)
      }
      return
    }
    object.updateWorldMatrix(true, false)
    const world = object.getWorldPosition(new THREE.Vector3())
    const x = softSnap(world.x)
    const z = softSnap(world.z)
    if (x === world.x && z === world.z) return
    world.x = x
    world.z = z
    if (object.parent) object.parent.worldToLocal(world)
    object.position.copy(world)
  }

  onUp(event) {
    if (this.cubePress) {
      const press = this.cubePress
      this.cubePress = null
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4
      if (!moved) this.applyView(press.dir)
      return
    }
    if (!this.down) return
    const moved = Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 4
    if (this.surfaceDrag?.started) {
      const drag = this.surfaceDrag
      this.surfaceDrag = null
      this.commitPose(drag.pivot)
      this.hooks.onSelect?.({ kind: 'port', componentId: drag.pivot.userData.componentId, portId: drag.pivot.userData.portId })
      if (this.mode !== 'sema') this.orbit.enabled = true
      this.down = null
      this.pan = null
      return
    }
    this.surfaceDrag = null
    if (this.yawDrag) {
      if (this.yawDrag.started) this.commitPose()
      this.yawDrag = null
      if (this.mode !== 'sema') this.orbit.enabled = true
      this.down = null
      this.pan = null
      return
    }
    if (this.pointDrag) {
      const moved = this.pointDrag.moved
      this.pointDrag = null
      if (this.mode !== 'sema') this.orbit.enabled = true
      this.canvas.style.cursor = ''
      this.down = null
      this.pan = null
      this.lookDrag = null
      if (moved) this.hooks.onMeasureDragEnd?.()
      return
    }
    if (this.bendDrag) {
      if (this.bendDrag.moved) this.hooks.onBend?.(this.bendDrag.id, this.bendDrag.vias, this.mode === 'sema')
      this.bendDrag = null
      if (this.mode !== 'sema') this.orbit.enabled = true
      this.down = null
      this.pan = null
      this.lookDrag = null
      return
    }
    if (this.lookDrag) {
      this.lookDrag = null
      if (this.mode !== 'sema') this.orbit.enabled = true
      this.down = null
      this.pan = null
      return
    }
    this.pan = null
    const hit = this.down.hit
    this.down = null
    if (moved) return
    this.click(hit)
  }

  click(hit) {
    if (this.mode === 'incele' && hit?.kind === 'submesh') {
      if (!this.faceIsExterior(hit)) {
        this.hooks.status?.('İç yüzeye nokta konmaz.')
        return
      }
      const hedef = this.hooks.olcuHedef?.()
      if (hedef === 'a' || hedef === 'b') {
        this.createMeasurePoint(hit, hedef)
        return
      }
      const solid = modelSolid(this.state?.models?.find((item) => item.id === this.inspectRoot.userData.modelId))
      if (!solid && (hedef === 'merkez' || hedef === 'en' || hedef === 'boy' || hedef === 'derinlik')) {
        this.createCornerMeasure(hit, hedef)
        return
      }
      if (this.tool === 'port') {
        if (this.cameraEnclosed(hit.object)) {
          this.hooks.status?.('Modelin içinden port eklenmez.')
          return
        }
        this.createModelPort(hit)
      }
      if (this.tool === 'olcu') {
        const yazi = solid
          ? 'Sağdan mesafe ölç ile iki nokta seç.'
          : 'Sağdan merkez, kenar ucu veya mesafe belirle.'
        this.hooks.status?.(yazi)
      }
      return
    }
    if (this.mode === 'incele' && hit?.kind === 'port' && this.tool !== 'kablo') {
      this.hooks.onSelect?.({ kind: 'port', componentId: 'incele', portId: hit.portId })
      if (this.tool !== 'olcu' && this.tool !== 'dondur') {
        this.hooks.status?.('Eksenlerle taşı. Portu sürükleyince yüzeye oturur.')
      }
      return
    }
    if (this.tool === 'kablo' && hit?.kind === 'port') {
      this.pickCablePort(hit)
      return
    }
    if (!hit) {
      this.hooks.onSelect?.(null)
      return
    }
    if (hit.kind === 'plug') {
      this.hooks.onSelect?.({ kind: 'plug', cableId: hit.cableId, end: hit.end })
      this.hooks.status?.('Kablo ucu yalnızca görünüm için oynar. Bağlantı değişmez.')
      return
    }
    if (hit.kind === 'cable' || hit.kind === 'bend') {
      this.hooks.onSelect?.({ kind: 'cable', id: hit.cableId })
      this.hooks.status?.('Kıvrım için kablonun üstüne orta tuşla bas.')
    }
    else if (hit.kind === 'port') this.hooks.onSelect?.({ kind: 'port', componentId: hit.componentId, portId: hit.portId })
    else if (hit.kind === 'component') this.hooks.onSelect?.({ kind: 'component', id: hit.componentId })
    else if (hit.kind === 'olcu') this.hooks.status?.('Ölçü noktası duruyor.')
    else if (hit.kind === 'submesh') this.setHover(hit)
  }

  fitOf(modelId) {
    return this.models.get(modelId)?.fit || null
  }

  addMeasureDots(align, dots, fit, pickable) {
    for (const dot of dots) {
      const geometry = new THREE.SphereGeometry(markSize(fit, 0.006), 10, 8)
      geometry.userData.owned = true
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: dot.color, depthTest: false }))
      mesh.position.fromArray(dot.position)
      mesh.renderOrder = 10
      mesh.raycast = () => {}
      mesh.userData.kind = 'olcu'
      mesh.userData.olcuKey = dot.key
      align.add(mesh)
      if (!pickable) continue
      const grip = new THREE.SphereGeometry(markSize(fit, 0.022), 8, 6)
      grip.userData.owned = true
      const hit = new THREE.Mesh(grip, new THREE.MeshBasicMaterial({ visible: false, depthTest: false }))
      hit.position.fromArray(dot.position)
      hit.userData.kind = 'olcu'
      hit.userData.olcuKey = dot.key
      align.add(hit)
    }
  }

  addMeasureEdges(align, kenar) {
    if (!Array.isArray(kenar?.merkez)) return
    for (const key of ['en', 'boy', 'derinlik']) {
      const end = kenar[key]
      if (!Array.isArray(end)) continue
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3().fromArray(kenar.merkez),
        new THREE.Vector3().fromArray(end)
      ])
      geometry.userData.owned = true
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: EDGE_COLOR[key] }))
      line.userData.kind = 'olcu-cizgi'
      line.raycast = () => {}
      align.add(line)
    }
  }

  addMeasureLine(align, cift) {
    if (!Array.isArray(cift?.a) || !Array.isArray(cift?.b)) return
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3().fromArray(cift.a),
      new THREE.Vector3().fromArray(cift.b)
    ])
    geometry.userData.owned = true
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: PAIR_COLOR }))
    line.userData.kind = 'olcu-cizgi'
    line.raycast = () => {}
    align.add(line)
  }

  localTriangles(geometry) {
    const position = geometry?.attributes?.position
    if (!position) return []
    const index = geometry.index
    const at = (vertex) => {
      const vector = new THREE.Vector3().fromBufferAttribute(position, vertex)
      return [vector.x, vector.y, vector.z]
    }
    const triangles = []
    if (index) {
      for (let i = 0; i < index.count; i += 3) triangles.push([at(index.getX(i)), at(index.getX(i + 1)), at(index.getX(i + 2))])
    } else {
      for (let i = 0; i < position.count; i += 3) triangles.push([at(i), at(i + 1), at(i + 2)])
    }
    return triangles
  }

  exteriorFaces(geometry) {
    if (!geometry) return null
    if (geometry.userData.exteriorMask) return geometry.userData.exteriorMask
    const mask = exteriorMask(this.localTriangles(geometry))
    geometry.userData.exteriorMask = mask
    return mask
  }

  faceIsExterior(hit) {
    const geometry = hit?.object?.geometry
    if (!geometry || hit.faceIndex == null) return false
    return Boolean(this.exteriorFaces(geometry)?.[hit.faceIndex])
  }

  cameraEnclosed(object) {
    if (!object) return false
    const box = new THREE.Box3().setFromObject(object)
    const camera = this.activeCamera().position
    if (box.isEmpty() || !box.containsPoint(camera)) return false
    const dirs = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1)
    ]
    let blocked = 0
    for (const dir of dirs) {
      this.raycaster.set(camera, dir)
      const hit = this.raycaster.intersectObject(object, false).find((item) => item.face)
      if (!hit) continue
      const exit = this.rayExit(box, camera, dir)
      if (hit.distance < exit - 1e-4) blocked += 1
    }
    return blocked >= 5
  }

  rayExit(box, origin, dir) {
    let limit = Infinity
    for (const axis of ['x', 'y', 'z']) {
      if (Math.abs(dir[axis]) < 1e-8) continue
      const bound = dir[axis] > 0 ? box.max[axis] : box.min[axis]
      limit = Math.min(limit, (bound - origin[axis]) / dir[axis])
    }
    return limit
  }

  meshTriangles(mesh, inverse) {
    const position = mesh.geometry?.attributes?.position
    if (!position) return []
    const mask = this.exteriorFaces(mesh.geometry)
    const index = mesh.geometry.index
    const local = (vertex) => {
      const vector = new THREE.Vector3().fromBufferAttribute(position, vertex)
      vector.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse)
      return [vector.x, vector.y, vector.z]
    }
    const triangles = []
    const push = (a, b, c, faceIndex) => {
      if (mask && mask[faceIndex] === false) return
      triangles.push([local(a), local(b), local(c)])
    }
    if (index) {
      for (let i = 0; i < index.count; i += 3) push(index.getX(i), index.getX(i + 1), index.getX(i + 2), i / 3)
    } else {
      for (let i = 0; i < position.count; i += 3) push(i, i + 1, i + 2, i / 3)
    }
    return triangles
  }

  surfaceUnderPointer() {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    const hits = this.raycaster.intersectObject(this.inspectRoot, true)
    const hit = hits.find((item) => item.object.userData.kind === 'submesh')
    if (!hit || !this.faceIsExterior(hit)) return null
    return { kind: 'submesh', mesh: hit.object, point: hit.point, face: hit.face, faceIndex: hit.faceIndex, object: hit.object }
  }

  dragMeasurePoint() {
    const hit = this.surfaceUnderPointer()
    if (!hit?.face) return
    const key = this.pointDrag.key
    if (key === 'a' || key === 'b') this.createMeasurePoint(hit, key, true)
    else this.createCornerMeasure(hit, key, true)
  }

  createMeasurePoint(hit, hedef, drag = false) {
    const align = this.inspectRoot.children[0]
    if (!align || !hit.face || !hit.object?.geometry) return
    const inverse = align.matrixWorld.clone().invert()
    const point = hit.point.clone().applyMatrix4(inverse)
    const normal = hit.face.normal.clone().transformDirection(inverse).normalize()
    if (hedef !== 'a' && hedef !== 'b') {
      this.hooks.onMeasurePoint?.({
        position: [point.x, point.y, point.z],
        drag
      })
      return
    }
    const snap = this.hooks.olcuSnap?.() || 'yuzey'
    const raw = [point.x, point.y, point.z]
    const facing = [normal.x, normal.y, normal.z]
    const island = sameFaceTriangles(this.meshTriangles(hit.object, inverse), raw, facing)
    const result = snapReference(island, raw, facing, snap, null)
    if (!result) {
      if (!drag) this.hooks.status?.(snap === 'kenar' ? 'Keskin bir kenar bulunamadı.' : 'Bu tıkta nokta bulunamadı.')
      return
    }
    this.hooks.onMeasurePoint?.({
      position: result.position,
      hedef,
      plane: result.plane,
      y: result.y,
      drag
    })
  }

  inspectTriangles() {
    const align = this.inspectRoot.children[0]
    if (!align) return []
    align.updateWorldMatrix(true, false)
    const inverse = align.matrixWorld.clone().invert()
    const triangles = []
    align.traverse((object) => {
      if (object.userData.kind !== 'submesh') return
      triangles.push(...this.meshTriangles(object, inverse))
    })
    return triangles
  }

  nearestAxisCorner(anchor, hedef, hint) {
    return nearestMeasureCorner(this.inspectTriangles(), anchor, hedef, hint)
  }

  measureAutoPoints(anchor) {
    if (!anchor) return null
    const triangles = this.inspectTriangles()
    return {
      en: uniqueMeasureCorner(triangles, anchor, 'en'),
      boy: uniqueMeasureCorner(triangles, anchor, 'boy'),
      derinlik: uniqueMeasureCorner(triangles, anchor, 'derinlik')
    }
  }

  createCornerMeasure(hit, hedef, drag = false) {
    const align = this.inspectRoot.children[0]
    if (!align || !hit.object?.geometry) return
    const inverse = align.matrixWorld.clone().invert()
    const point = hit.point.clone().applyMatrix4(inverse)
    const raw = [point.x, point.y, point.z]
    const triangles = this.inspectTriangles()
    if (hedef === 'merkez') {
      const snapped = snapModelCorner(triangles, raw)
      if (!snapped) {
        if (!drag) this.hooks.status?.('Köşe bulunamadı.')
        return
      }
      this.hooks.onMeasurePoint?.({ position: snapped, hedef, drag })
      return
    }
    const anchor = this.hooks.olcuAnchor?.()
    if (!anchor) {
      if (!drag) this.hooks.status?.('Önce merkez noktasını seç.')
      return
    }
    const snapped = nearestMeasureCorner(triangles, anchor, hedef, raw)
    if (!snapped) {
      if (!drag) this.hooks.status?.('Bu eksende köşe yok.')
      return
    }
    this.hooks.onMeasurePoint?.({ position: snapped, hedef, drag })
  }

  createModelPort(hit) {
    const align = this.inspectRoot.children[0]
    if (!align || !hit.face) return
    const inverse = align.matrixWorld.clone().invert()
    const point = hit.point.clone().applyMatrix4(inverse)
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
    const towardCamera = this.perspective.position.clone().sub(hit.point).normalize()
    if (worldNormal.dot(towardCamera) < 0) worldNormal.negate()
    const normal = worldNormal.clone().transformDirection(inverse).normalize()
    this.hooks.onModelPort?.({
      position: [point.x, point.y, point.z],
      normal: [normal.x, normal.y, normal.z]
    })
  }

  createPlacedPort(hit) {
    const group = this.groups.get(hit.componentId)
    const align = group?.children[0]
    const component = this.state.components.find((item) => item.id === hit.componentId)
    if (!align || !component || !hit.face) return
    align.updateWorldMatrix(true, false)
    const inverse = align.matrixWorld.clone().invert()
    const point = hit.point.clone().applyMatrix4(inverse)
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
    const towardCamera = this.activeCamera().position.clone().sub(hit.point).normalize()
    if (worldNormal.dot(towardCamera) < 0) worldNormal.negate()
    const normal = worldNormal.clone().transformDirection(inverse).normalize()
    this.hooks.onModelPort?.({
      modelId: component.modelId,
      position: [point.x, point.y, point.z],
      normal: [normal.x, normal.y, normal.z]
    })
  }

  createPort(hit) {
    const group = this.groups.get(hit.componentId)
    const align = group?.children[0]
    if (!align) return
    const inverse = align.matrixWorld.clone().invert()
    const point = hit.point.clone().applyMatrix4(inverse)
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
    const normal = worldNormal.clone().transformDirection(inverse).normalize()
    this.hooks.onPort?.({
      componentId: hit.componentId,
      position: [point.x, point.y, point.z],
      normal: [normal.x, normal.y, normal.z]
    })
  }

  pickCablePort(hit) {
    if (!this.pending) {
      this.pending = { componentId: hit.componentId, portId: hit.portId }
      this.hooks.status?.('İkinci bağlantı noktasını seç.')
      this.applyFocus()
      this.requestRender()
      return
    }
    if (this.pending.portId === hit.portId && this.pending.componentId === hit.componentId) {
      this.pending = null
      this.hooks.status?.('Kablo iptal.')
      return
    }
    const ends = { a: this.pending, b: { componentId: hit.componentId, portId: hit.portId } }
    if (this.hooks.cableOk && !this.hooks.cableOk(ends)) return
    this.pending = null
    this.hooks.onCable?.(ends)
  }

  onWheel(event) {
    if (this.readCube(event)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const pixels = wheelPixels(event)
    if (!pixels) return
    if (this.mode === 'sema') {
      event.preventDefault()
      const ticks = Math.min(Math.abs(pixels) / 100, 1.4)
      const factor = Math.pow(pixels > 0 ? 0.92 : 1.08, ticks)
      this.ortho.zoom = Math.min(16, Math.max(0.2, this.ortho.zoom * factor))
      this.ortho.updateProjectionMatrix()
      this.requestRender()
      return
    }
    if (!this.orbit.enabled) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const scale = dollyScale(pixels)
    if (pixels > 0) this.orbit.dollyOut(scale)
    else this.orbit.dollyIn(scale)
    this.requestRender()
  }

  cubeBox(width, height) {
    const size = Math.round(Math.min(156, Math.max(104, Math.min(width, height) * 0.28)))
    return { x: width - size - 12, y: height - size - 34, size }
  }

  readCube(event) {
    const width = this.canvas.clientWidth || 1
    const height = this.canvas.clientHeight || 1
    const rect = this.canvas.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    const box = this.cubeBox(width, height)
    if (px < box.x || py < box.y || px > box.x + box.size || py > box.y + box.size) return null
    syncViewCube(this.activeCamera(), this.cube.camera)
    cullViewCube(this.cube.picks, this.cube.camera)
    const ndc = new THREE.Vector2(
      ((px - box.x) / box.size) * 2 - 1,
      -((py - box.y) / box.size) * 2 + 1
    )
    this.cubeRay.setFromCamera(ndc, this.cube.camera)
    const hits = this.cubeRay.intersectObjects(this.cube.picks, false).filter((hit) => hit.object.visible)
    const axis = hits.find((hit) => hit.object.userData.kind === 'axis')
    if (axis) return axis.object.userData.dir
    const closest = hits[0]
    if (!closest) return null
    const face = hits.find((hit) => {
      if (hit.object.userData.kind !== 'face') return false
      const local = hit.object.worldToLocal(hit.point.clone())
      return Math.abs(local.x) <= 0.32 && Math.abs(local.y) <= 0.32
    })
    return (face || closest).object.userData.dir || null
  }

  paintCube(event) {
    const dir = this.readCube(event)
    const key = dir ? dir.map((value) => value.toFixed(3)).join() : ''
    if (key === this.cubeKey) return Boolean(dir)
    this.cubeKey = key
    markCube(this.cube.picks, dir)
    this.requestRender()
    return Boolean(dir)
  }

  applyView(direction) {
    if (this.mode === 'sema') {
      this.schemaDir.set(direction[0], direction[1], direction[2]).normalize()
      this.placeSchema(this.schemaFocus.x, this.schemaFocus.z)
    } else {
      const place = cameraPlacement(
        [this.orbit.target.x, this.orbit.target.y, this.orbit.target.z],
        direction,
        Math.max(0.8, this.perspective.position.distanceTo(this.orbit.target))
      )
      this.perspective.up.set(place.up[0], place.up[1], place.up[2])
      this.perspective.position.set(place.position[0], place.position[1], place.position[2])
      this.perspective.lookAt(place.target[0], place.target[1], place.target[2])
      this.perspective.updateMatrixWorld(true)
      this.orbit.update()
    }
    this.requestRender()
  }

  renderCube(width, height) {
    const box = this.cubeBox(width, height)
    syncViewCube(this.activeCamera(), this.cube.camera)
    cullViewCube(this.cube.picks, this.cube.camera)
    const glY = height - box.y - box.size
    this.renderer.setScissorTest(true)
    this.renderer.setViewport(box.x, glY, box.size, box.size)
    this.renderer.setScissor(box.x, glY, box.size, box.size)
    const auto = this.renderer.autoClear
    this.renderer.autoClear = false
    this.renderer.clear(false, true, false)
    this.renderer.render(this.cube.scene, this.cube.camera)
    this.renderer.autoClear = auto
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, width, height)
    const look = new THREE.Vector3()
    this.activeCamera().getWorldDirection(look)
    this.hooks.onViewAngle?.(axisAngles([-look.x, -look.y, -look.z]))
  }

  portUnderPointer() {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    const root = this.mode === 'incele' ? this.inspectRoot : this.pickRoot
    return this.raycaster.intersectObject(root, true).find((hit) => hit.object.userData.kind === 'port') || null
  }

  portSurface(pivot) {
    const align = pivot.parent
    if (!align) return null
    return align.children.find((child) => !child.userData.pivot) || null
  }

  dragPortOnSurface(event) {
    const drag = this.surfaceDrag
    if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) < 3 && !drag.started) return
    if (!drag.started) {
      drag.started = true
      this.orbit.enabled = false
      this.hooks.onPoseStart?.()
    }
    this.raycaster.setFromCamera(this.pointer, this.activeCamera())
    const hit = this.raycaster.intersectObject(drag.visual, true).find((item) => item.face)
    if (!hit || !this.faceIsExterior(hit) || this.cameraEnclosed(hit.object)) return
    const align = drag.pivot.parent
    const inverse = align.matrixWorld.clone().invert()
    const point = hit.point.clone().applyMatrix4(inverse)
    const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
    const towardCamera = this.activeCamera().position.clone().sub(hit.point).normalize()
    if (worldNormal.dot(towardCamera) < 0) worldNormal.negate()
    const normal = worldNormal.clone().transformDirection(inverse).normalize()
    drag.pivot.position.copy(point)
    drag.pivot.quaternion.copy(portOrientation(normal, drag.roll))
    drag.pivot.updateMatrixWorld(true)
    this.syncCables()
    this.requestRender()
  }

  commitPose(target) {
    const group = target || this.transform.object
    if (!group) return
    if (group.userData.kind === 'plug') {
      const home = group.userData.home
      if (home) this.plugShift.set(`${group.userData.cableId}:${group.userData.end}`, group.position.clone().sub(home))
      this.syncCables()
      this.syncGizmo()
      this.requestRender()
      return
    }
    if (group.userData.pivot) {
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion).normalize()
      const roll = portRoll(group.quaternion, normal)
      group.quaternion.copy(portOrientation(normal, roll))
      this.hooks.onPortPose?.({
        componentId: group.userData.componentId,
        portId: group.userData.portId,
        position: [group.position.x, group.position.y, group.position.z],
        normal: [normal.x, normal.y, normal.z],
        roll
      })
      return
    }
    const id = group.userData.componentId
    const yaw = headingFromQuaternion(group.quaternion)
    group.rotation.set(0, yaw, 0)
    if (this.mode === 'sema') {
      this.hooks.onPose?.(id, { schema: { x: group.position.x, z: group.position.z, yaw } })
    } else {
      this.hooks.onPose?.(id, {
        position: [group.position.x, group.position.y, group.position.z],
        yaw
      })
    }
  }

  turnObject(hit) {
    if (!hit) return null
    if (this.mode !== 'yerlesim' && this.selection?.kind === 'port' && hit.kind === 'port' && hit.portId === this.selection.portId) {
      return this.pivots.get(`${hit.componentId}:${hit.portId}`) || null
    }
    if (this.selection?.kind === 'component' && (hit.kind === 'component' || hit.kind === 'port') && hit.componentId === this.selection.id) {
      return this.groups.get(hit.componentId) || null
    }
    if (!this.selection && hit.kind === 'component') return this.groups.get(hit.componentId) || null
    return null
  }

  screenAngle(event, object) {
    const center = object.getWorldPosition(new THREE.Vector3()).project(this.activeCamera())
    const rect = this.canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    return Math.atan2(y - center.y, x - center.x)
  }

  dragYaw(event) {
    const drag = this.yawDrag
    if (Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) < 3 && !drag.started) return
    if (!drag.started) {
      drag.started = true
      this.orbit.enabled = false
      this.hooks.onPoseStart?.()
    }
    const delta = wrapAngle(this.screenAngle(event, drag.object) - drag.start)
    if (drag.object.userData.pivot) {
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(drag.quat).normalize()
      drag.object.quaternion.copy(drag.quat)
      drag.object.rotateY(delta)
      const roll = softSnapAngle(portRoll(drag.object.quaternion, normal))
      drag.object.quaternion.copy(portOrientation(normal, roll))
    } else {
      drag.object.rotation.set(0, softSnapAngle(headingFromQuaternion(drag.quat) + delta), 0)
    }
    this.syncCables()
    this.requestRender()
  }

  clearGroup(group) {
    for (const child of [...group.children]) {
      this.disposeMaterials(child)
      child.removeFromParent()
    }
  }

  disposeMaterials(root) {
    root.traverse((object) => {
      if (object.isSprite) {
        if (object.material?.userData.ownedMap) object.material.map?.dispose()
        object.material?.dispose()
        return
      }
      if (!object.isMesh && !object.isLine) return
      if (object.geometry?.userData.owned) object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material?.dispose())
    })
  }
}
