import { routePlacement, routeVia } from './route.js'

export function decimalText(value) {
  const cleaned = String(value ?? '').replace(',', '.').replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length <= 1) return parts[0]
  return `${parts[0]}.${parts.slice(1).join('')}`
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function lengthOf(v) {
  return Math.hypot(v[0], v[1], v[2])
}

function norm(v) {
  const length = lengthOf(v) || 1
  return scale(v, 1 / length)
}

function vertexKey(v) {
  return v.map((value) => Math.round(value * 1e5) / 1e5).join(',')
}

function sameHeight(v, y) {
  return y == null || Math.abs(v[1] - y) < 1e-3
}

function boundaryEdges(triangles) {
  const map = new Map()
  for (const tri of triangles) {
    const edges = [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]
    for (const [a, b] of edges) {
      const key = [vertexKey(a), vertexKey(b)].sort().join('|')
      const item = map.get(key) || { a, b, count: 0 }
      item.count += 1
      map.set(key, item)
    }
  }
  return [...map.values()].filter((edge) => edge.count === 1)
}

function closestOnSegment(point, a, b) {
  const ab = sub(b, a)
  const denom = dot(ab, ab) || 1
  const t = Math.max(0, Math.min(1, dot(sub(point, a), ab) / denom))
  return add(a, scale(ab, t))
}

function onPlane(point, normal, d) {
  return sub(point, scale(normal, dot(normal, point) - d))
}

function levelTo(point, normal, y) {
  if (y == null || Math.abs(point[1] - y) < 1e-4) return point
  const grad = sub([0, 1, 0], scale(normal, dot([0, 1, 0], normal)))
  if (Math.abs(grad[1]) < 1e-6) return Math.abs(point[1] - y) < 1e-3 ? point : null
  return add(point, scale(grad, (y - point[1]) / grad[1]))
}

function insideTriangle(point, tri) {
  const [a, b, c] = tri
  const v0 = sub(b, a)
  const v1 = sub(c, a)
  const v2 = sub(point, a)
  const d00 = dot(v0, v0)
  const d01 = dot(v0, v1)
  const d11 = dot(v1, v1)
  const d20 = dot(v2, v0)
  const d21 = dot(v2, v1)
  const den = d00 * d11 - d01 * d01 || 1
  const v = (d11 * d20 - d01 * d21) / den
  const w = (d00 * d21 - d01 * d20) / den
  const u = 1 - v - w
  return u >= -1e-3 && v >= -1e-3 && w >= -1e-3
}

function nearest(point, candidates) {
  let best = null
  let bestDist = Infinity
  for (const candidate of candidates) {
    if (!candidate) continue
    const dist = lengthOf(sub(candidate, point))
    if (dist < bestDist) {
      best = candidate
      bestDist = dist
    }
  }
  return best
}

function snapCorner(edges, point, y) {
  const seen = new Set()
  const vertices = []
  for (const edge of edges) {
    for (const vertex of [edge.a, edge.b]) {
      const key = vertexKey(vertex)
      if (seen.has(key) || !sameHeight(vertex, y)) continue
      seen.add(key)
      vertices.push(vertex)
    }
  }
  return nearest(point, vertices)
}

function snapEdge(edges, point, y) {
  const candidates = []
  for (const edge of edges) {
    const ay = edge.a[1]
    const by = edge.b[1]
    if (y == null) {
      candidates.push(closestOnSegment(point, edge.a, edge.b))
    } else if (Math.abs(ay - y) < 1e-3 && Math.abs(by - y) < 1e-3) {
      candidates.push(closestOnSegment(point, edge.a, edge.b))
    } else if ((ay - y) * (by - y) <= 1e-6 && Math.abs(by - ay) > 1e-8) {
      const t = Math.max(0, Math.min(1, (y - ay) / (by - ay)))
      candidates.push(add(edge.a, scale(sub(edge.b, edge.a), t)))
    }
  }
  return nearest(point, candidates)
}

function snapSurface(triangles, point, normal, d, y) {
  const leveled = levelTo(onPlane(point, normal, d), normal, y)
  if (!leveled) return null
  if (triangles.some((tri) => insideTriangle(leveled, tri))) return leveled
  return snapEdge(boundaryEdges(triangles), leveled, y)
}

const FLAT = 0.96

function triangleNormal(tri) {
  const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))
  const length = lengthOf(n)
  if (length < 1e-10) return null
  return scale(n, 1 / length)
}

// Keskin veya açık kenarlar. Düz yüzde üçgen köşegeni kenar sayılmaz.
export function featureEdges(triangles) {
  const map = new Map()
  for (const tri of triangles) {
    const normal = triangleNormal(tri)
    if (!normal) continue
    for (const [a, b] of [[tri[0], tri[1]], [tri[1], tri[2]], [tri[2], tri[0]]]) {
      const key = [vertexKey(a), vertexKey(b)].sort().join('|')
      const item = map.get(key) || { a, b, normals: [] }
      item.normals.push(normal)
      map.set(key, item)
    }
  }
  const edges = []
  for (const item of map.values()) {
    let sharp = item.normals.length < 2
    for (let i = 0; i < item.normals.length && !sharp; i += 1) {
      for (let j = i + 1; j < item.normals.length; j += 1) {
        if (dot(item.normals[i], item.normals[j]) < FLAT) sharp = true
      }
    }
    if (sharp) edges.push({ a: item.a, b: item.b })
  }
  return edges
}

function cornerGraph(triangles) {
  const adj = new Map()
  const node = (vertex) => {
    const key = vertexKey(vertex)
    let item = adj.get(key)
    if (!item) {
      item = { vertex, neighbors: [] }
      adj.set(key, item)
    }
    return item
  }
  for (const edge of featureEdges(triangles)) {
    const a = node(edge.a)
    const b = node(edge.b)
    const bk = vertexKey(edge.b)
    if (a.neighbors.some((item) => item.key === bk)) continue
    a.neighbors.push({ key: bk, vertex: edge.b })
    b.neighbors.push({ key: vertexKey(edge.a), vertex: edge.a })
  }
  const cornerKeys = new Set()
  for (const [key, item] of adj) {
    if (item.neighbors.length === 2) {
      const left = norm(sub(item.neighbors[0].vertex, item.vertex))
      const right = norm(sub(item.neighbors[1].vertex, item.vertex))
      if (dot(left, right) < -0.985) continue
    }
    cornerKeys.add(key)
  }
  return { adj, cornerKeys }
}

function cornerVertices(graph) {
  return [...graph.cornerKeys].map((key) => graph.adj.get(key).vertex)
}

function chainsFrom(graph, startKey) {
  const start = graph.adj.get(startKey)
  if (!start || !graph.cornerKeys.has(startKey)) return []
  const ends = []
  for (const next of start.neighbors) {
    const seen = new Set([startKey])
    let prev = startKey
    let current = next.key
    let guard = 0
    while (current && !seen.has(current) && guard < 10000) {
      guard += 1
      seen.add(current)
      if (graph.cornerKeys.has(current)) {
        ends.push(graph.adj.get(current).vertex)
        break
      }
      const step = graph.adj.get(current)?.neighbors.find((item) => item.key !== prev)
      if (!step) break
      prev = current
      current = step.key
    }
  }
  return ends
}

// Tıklanan yere en yakın gerçek köşe. Düz kenarın ara noktası köşe değildir.
export function snapModelCorner(triangles, point) {
  return nearest(point, cornerVertices(cornerGraph(triangles)))
}

// Merkez köşeden giden kenarın öbür köşesi. Mesafe kenarın tamamıdır.
export function snapEdgeCorner(triangles, point, anchor) {
  if (!anchor) return null
  const graph = cornerGraph(triangles)
  let key = vertexKey(anchor)
  if (!graph.cornerKeys.has(key)) {
    const snapped = nearest(anchor, cornerVertices(graph))
    if (!snapped) return null
    key = vertexKey(snapped)
  }
  const end = nearest(point, chainsFrom(graph, key))
  if (!end || vertexKey(end) === key) return null
  return end
}

// mode: kose, kenar, yuzey. lock ikinci noktayı ilk yüzeye bağlar. Yükseklik serbesttir.
export function snapReference(triangles, point, normal, mode, lock = null) {
  const n = norm(normal)
  const d = dot(n, point)
  if (lock?.plane) {
    const pn = norm(lock.plane.normal)
    if (Math.abs(dot(pn, n)) < 0.999) return null
    if (Math.abs(dot(pn, point) - lock.plane.d) > 1e-3) return null
  }
  const useN = lock?.plane ? norm(lock.plane.normal) : n
  const useD = lock?.plane ? lock.plane.d : d
  const faces = triangles.filter((tri) => {
    const tn = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])))
    if (Math.abs(dot(tn, useN)) < 0.999) return false
    return tri.every((vertex) => Math.abs(dot(useN, vertex) - useD) < 1e-3)
  })
  if (!faces.length) return null
  const edges = boundaryEdges(faces)
  const snapped = mode === 'kose'
    ? snapCorner(edges, point, null)
    : mode === 'kenar'
      ? snapEdge(edges, point, null)
      : snapSurface(faces, point, useN, useD, null)
  if (!snapped) return null
  return { position: snapped, plane: { normal: useN, d: useD }, y: snapped[1] }
}

export function axisSpans(points) {
  const span = { x: 0, y: 0, z: 0 }
  if (!points?.length) return span
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const point of points) {
    const position = point.position || point
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], position[i])
      max[i] = Math.max(max[i], position[i])
    }
  }
  span.x = max[0] - min[0]
  span.y = max[1] - min[1]
  span.z = max[2] - min[2]
  return span
}

function ratios(points, size, fitS) {
  if (!(fitS > 0)) return []
  const span = axisSpans(points)
  const out = []
  if (size?.en > 0 && span.x > 1e-6) out.push(size.en / (fitS * span.x))
  if (size?.boy > 0 && span.y > 1e-6) out.push(size.boy / (fitS * span.y))
  if (size?.derinlik > 0 && span.z > 1e-6) out.push(size.derinlik / (fitS * span.z))
  return out
}

// Nokta kutusu santimetreye gelsin. Kutunun dışındaki çıkıntı paya girmez.
export function scaleFromBox(points, size, fitS) {
  const list = ratios(points, size, fitS)
  if (!list.length) return null
  return list.reduce((sum, value) => sum + value, 0) / list.length
}

export function scaleFromPair(a, b, cm, fitS) {
  const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  if (!(cm > 0) || !(fitS > 0) || distance < 1e-6) return null
  return cm / (fitS * distance)
}

// Ortak merkez köşeden giden kenarlar. Dolu eksenlerin ölçeği ortalanır.
export function scaleFromEdges(kenar, size, fitS) {
  const pairs = [
    ['en', kenar?.en],
    ['boy', kenar?.boy],
    ['derinlik', kenar?.derinlik]
  ]
  const list = []
  for (const [key, point] of pairs) {
    if (!Array.isArray(kenar?.merkez) || !Array.isArray(point)) continue
    const scale = scaleFromPair(kenar.merkez, point, size?.[key], fitS)
    if (scale) list.push(scale)
  }
  if (!list.length) return null
  return list.reduce((sum, value) => sum + value, 0) / list.length
}

export function pairCm(a, b, fitS, scale) {
  const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  return fitS * (scale || 1) * distance
}

export function portWorld(component, fit, position) {
  const scale = component.scale || 1
  let x = (fit.x + fit.s * position[0]) * scale
  let y = (fit.y + fit.s * position[1]) * scale
  let z = (fit.z + fit.s * position[2]) * scale
  const yaw = component.yaw || 0
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const xr = x * c + z * s
  const zr = -x * s + z * c
  return [xr + (component.position?.[0] || 0), y + (component.position?.[1] || 0), zr + (component.position?.[2] || 0)]
}

export function yawNormal(normal, yaw = 0) {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return [normal[0] * c + normal[2] * s, normal[1], -normal[0] * s + normal[2] * c]
}

export function pathLength(points) {
  let length = 0
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  }
  return length
}

export function cableLengthCm(state, cable, fitOf) {
  const left = state.components.find((item) => item.id === cable.a.componentId)
  const right = state.components.find((item) => item.id === cable.b.componentId)
  if (!left || !right) return null
  const leftModel = state.models.find((item) => item.id === left.modelId)
  const rightModel = state.models.find((item) => item.id === right.modelId)
  if (!leftModel?.olcek || !rightModel?.olcek) return null
  const leftFit = fitOf(left.modelId)
  const rightFit = fitOf(right.modelId)
  if (!leftFit || !rightFit) return null
  const leftPort = findPort(state, left, cable.a.portId)
  const rightPort = findPort(state, right, cable.b.portId)
  if (!leftPort || !rightPort) return null
  const a = portWorld(left, leftFit, leftPort.position)
  const b = portWorld(right, rightFit, rightPort.position)
  const an = yawNormal(leftPort.normal || [0, 1, 0], left.yaw || 0)
  const bn = yawNormal(rightPort.normal || [0, 1, 0], right.yaw || 0)
  const points = cable.vias?.length
    ? routeVia(a, an, b, bn, cable.vias, null)
    : routePlacement(a, an, b, bn, [0, 0, 0])
  return points ? pathLength(points) : null
}

function findPort(state, component, portId) {
  const model = state.models.find((item) => item.id === component.modelId)
  return [...(model?.ports || []), ...(component.ports || [])].find((port) => port.id === portId) || null
}
