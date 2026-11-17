import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const require = createRequire(import.meta.url)
const okuyucu = '/home/talha/Desktop/3D Model Çevirici/node_modules/sldprt'

function sldprt() {
  try {
    return require('sldprt')
  } catch {
    if (existsSync(okuyucu)) return require(okuyucu)
    throw new Error('Solid okuyucu bulunamadı.')
  }
}

function f32(values) {
  const view = new Float32Array(values)
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength)
}

function normal(a, b, c) {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz)
  if (length < 1e-12) return null
  return [nx / length, ny / length, nz / length]
}

function mmText(mm) {
  if (mm >= 100) return String(Math.round(mm))
  const places = mm >= 10 ? 10 : 100
  const rounded = Math.round(mm * places) / places
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toFixed(mm >= 10 ? 1 : 2)
}

function glbFromMesh(model, name) {
  const position = []
  const normals = []
  let triangles = 0
  for (const face of model.faces || []) {
    for (const tri of face.triangles || []) {
      const a = face.vertices[tri[0]]
      const b = face.vertices[tri[1]]
      const c = face.vertices[tri[2]]
      if (!a || !b || !c) continue
      const n = normal(a, b, c)
      if (!n) continue
      for (const point of [a, b, c]) {
        position.push(point[0] * 100, point[1] * 100, point[2] * 100)
        normals.push(n[0], n[1], n[2])
      }
      triangles += 1
    }
  }
  if (!triangles) throw new Error('Bu Solid dosyasında gövde ağı yok.')
  const positionBuf = f32(position)
  const normalBuf = f32(normals)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < position.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = position[i + axis]
      if (value < min[axis]) min[axis] = value
      if (value > max[axis]) max[axis] = value
    }
  }
  const body = Buffer.concat([positionBuf, normalBuf])
  const count = triangles * 3
  const json = {
    asset: { version: '2.0', generator: '3D Kablaj' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{
      name,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        material: 0,
        mode: 4
      }]
    }],
    materials: [{
      name: 'parca',
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [0.75, 0.76, 0.78, 1],
        metallicFactor: 0.04,
        roughnessFactor: 0.62
      }
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBuf.length, target: 34962 },
      { buffer: 0, byteOffset: positionBuf.length, byteLength: normalBuf.length, target: 34962 }
    ],
    buffers: [{ byteLength: body.length }]
  }
  let text = JSON.stringify(json)
  while (Buffer.byteLength(text) % 4 !== 0) text += ' '
  const jsonBuf = Buffer.from(text)
  const pad = (4 - (body.length % 4)) % 4
  const padded = pad ? Buffer.concat([body, Buffer.alloc(pad)]) : body
  const total = 12 + 8 + jsonBuf.length + 8 + padded.length
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(total, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonBuf.length, 0)
  jsonHeader.writeUInt32LE(0x4e4f534a, 4)
  const bodyHeader = Buffer.alloc(8)
  bodyHeader.writeUInt32LE(padded.length, 0)
  bodyHeader.writeUInt32LE(0x004e4942, 4)
  const boyut = [0, 1, 2].map((axis) => mmText(Math.abs(max[axis] - min[axis]) * 10)).join(' × ') + ' mm'
  return { buf: Buffer.concat([header, jsonHeader, jsonBuf, bodyHeader, padded]), boyut }
}

export function solidGlb(bytes, name = 'solid') {
  const model = sldprt().meshModel(Buffer.from(bytes))
  return glbFromMesh(model, name)
}
