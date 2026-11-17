function hypot(x, y, z = 0) {
  return Math.hypot(x, y, z)
}

function dedupe(points) {
  const out = []
  for (const point of points) {
    const prev = out[out.length - 1]
    if (prev && hypot(point[0] - prev[0], point[1] - prev[1], point[2] - prev[2]) < 1e-4) continue
    out.push(point)
  }
  return out.length >= 2 ? out : null
}

function normalOr(value, fallback) {
  const length = hypot(value[0], value[1], value[2])
  if (length < 1e-6) return fallback
  return [value[0] / length, value[1] / length, value[2] / length]
}

export function routePlacement(aPos, aNormal, bPos, bNormal, bend) {
  const an = normalOr(aNormal, [0, 1, 0])
  const bn = normalOr(bNormal, [0, 1, 0])
  const dist = hypot(bPos[0] - aPos[0], bPos[1] - aPos[1], bPos[2] - aPos[2])
  const lead = Math.min(0.12, Math.max(0.025, dist * 0.12))
  const start = [aPos[0] + an[0] * lead, aPos[1] + an[1] * lead, aPos[2] + an[2] * lead]
  const end = [bPos[0] + bn[0] * lead, bPos[1] + bn[1] * lead, bPos[2] + bn[2] * lead]
  const drop = Math.min(0.28, Math.max(0.02, dist * 0.16))
  const mid = [
    (start[0] + end[0]) / 2 + (bend?.[0] || 0),
    (start[1] + end[1]) / 2 - drop + (bend?.[1] || 0),
    (start[2] + end[2]) / 2 + (bend?.[2] || 0)
  ]
  return dedupe([aPos, start, mid, end, bPos])
}

function containsXZ(box, x, z) {
  return x >= box.minX && x <= box.maxX && z >= box.minZ && z <= box.maxZ
}

function segmentHitsRect(x1, z1, x2, z2, rect) {
  let t0 = 0
  let t1 = 1
  const dx = x2 - x1
  const dz = z2 - z1
  const checks = [
    [-dx, x1 - rect.minX],
    [dx, rect.maxX - x1],
    [-dz, z1 - rect.minZ],
    [dz, rect.maxZ - z1]
  ]
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-10) {
      if (q < 0) return false
    } else {
      const t = q / p
      if (p < 0) {
        if (t > t1) return false
        if (t > t0) t0 = t
      } else {
        if (t < t0) return false
        if (t < t1) t1 = t
      }
    }
  }
  return t0 <= t1
}

function pathClear(points, boxes) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (boxes.some((box) => segmentHitsRect(a[0], a[1], b[0], b[1], box))) return false
  }
  return true
}

function pathLen(points) {
  let length = 0
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  }
  return length
}

function leaveFoot(pos, normal, box, margin) {
  let nx = normal[0]
  let nz = normal[2]
  const len = Math.hypot(nx, nz)
  if (!box) {
    if (len < 1e-6) return [pos[0] + 0.18, pos[2]]
    return [pos[0] + (nx / len) * 0.18, pos[2] + (nz / len) * 0.18]
  }
  if (len < 1e-6) {
    const sides = [
      [box.minX - margin, pos[2]],
      [box.maxX + margin, pos[2]],
      [pos[0], box.minZ - margin],
      [pos[0], box.maxZ + margin]
    ]
    sides.sort((p, q) => (p[0] - pos[0]) ** 2 + (p[1] - pos[2]) ** 2 - ((q[0] - pos[0]) ** 2 + (q[1] - pos[2]) ** 2))
    return sides[0]
  }
  nx /= len
  nz /= len
  let t = 0.04
  for (let i = 0; i < 50; i += 1) {
    const x = pos[0] + nx * t
    const z = pos[2] + nz * t
    if (!containsXZ({ minX: box.minX - margin, maxX: box.maxX + margin, minZ: box.minZ - margin, maxZ: box.maxZ + margin }, x, z)) {
      return [x, z]
    }
    t += 0.05
  }
  return [pos[0] + nx * (margin + 0.2), pos[2] + nz * (margin + 0.2)]
}

function detour(exit, entry, boxes) {
  const gap = 0.1
  const gates = []
  for (const box of boxes) {
    gates.push(
      [box.minX - gap, box.minZ - gap],
      [box.maxX + gap, box.minZ - gap],
      [box.maxX + gap, box.maxZ + gap],
      [box.minX - gap, box.maxZ + gap],
      [box.minX - gap, (box.minZ + box.maxZ) / 2],
      [box.maxX + gap, (box.minZ + box.maxZ) / 2],
      [(box.minX + box.maxX) / 2, box.minZ - gap],
      [(box.minX + box.maxX) / 2, box.maxZ + gap]
    )
  }
  const candidates = [
    [exit, entry],
    [exit, [entry[0], exit[1]], entry],
    [exit, [exit[0], entry[1]], entry]
  ]
  for (const gate of gates) candidates.push([exit, gate, entry])
  for (let i = 0; i < gates.length; i += 1) {
    for (let j = 0; j < gates.length; j += 1) {
      if (i === j) continue
      candidates.push([exit, gates[i], gates[j], entry])
    }
  }
  let best = null
  let bestLen = Infinity
  for (const path of candidates) {
    if (!pathClear(path, boxes)) continue
    const length = pathLen(path)
    if (length < bestLen) {
      best = path
      bestLen = length
    }
  }
  return best || [exit, entry]
}

export function routeSchema(aPos, aNormal, bPos, bNormal, lift, bend, boxes = []) {
  const ax = aNormal[0]
  const az = aNormal[2]
  const bx = bNormal[0]
  const bz = bNormal[2]
  const al = Math.hypot(ax, az)
  const bl = Math.hypot(bx, bz)
  const an = al < 1e-6 ? [1, 0] : [ax / al, az / al]
  const bn = bl < 1e-6 ? [-1, 0] : [bx / bl, bz / bl]
  if (!boxes.length) {
    const lead = 0.18
    const origin = [aPos[0], lift, aPos[2]]
    const target = [bPos[0], lift, bPos[2]]
    const exit = [origin[0] + an[0] * lead, lift, origin[2] + an[1] * lead]
    const entry = [target[0] + bn[0] * lead, lift, target[2] + bn[1] * lead]
    const corner = [entry[0] + (bend?.[0] || 0), lift, exit[2] + (bend?.[1] || 0)]
    return dedupe([origin, exit, corner, entry, target])
  }
  const home = boxes.find((box) => containsXZ(box, aPos[0], aPos[2])) || null
  const away = boxes.find((box) => containsXZ(box, bPos[0], bPos[2])) || null
  const margin = 0.08
  const exit = leaveFoot(aPos, [an[0], 0, an[1]], home, margin)
  const entry = leaveFoot(bPos, [bn[0], 0, bn[1]], away, margin)
  const middle = detour(exit, entry, boxes)
  const flat = [[aPos[0], aPos[2]], ...middle, [bPos[0], bPos[2]]]
  return dedupe(flat.map(([x, z]) => [x, lift, z]))
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function insideBox(box, point, pad = 0) {
  return point[0] > box.min[0] - pad && point[0] < box.max[0] + pad
    && point[1] > box.min[1] - pad && point[1] < box.max[1] + pad
    && point[2] > box.min[2] - pad && point[2] < box.max[2] + pad
}

function segmentHits(a, b, box, pad) {
  for (let step = 0; step <= 10; step += 1) {
    const t = step / 10
    const point = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ]
    if (insideBox(box, point, pad)) return true
  }
  return false
}

function hitsAny(a, b, boxes, pad) {
  return boxes.some((box) => segmentHits(a, b, box, pad))
}

function pushOut(point, normal, boxes, pad) {
  let cursor = point
  for (let step = 0; step < 48; step += 1) {
    if (!boxes.some((box) => insideBox(box, cursor, pad))) return cursor
    cursor = add(cursor, scale(normal, 0.25))
  }
  return cursor
}

function sideDir(a, b) {
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return [1, 0, 0]
  return [-dz / len, 0, dx / len]
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function segmentsClose(a, b, c, d, gap) {
  for (let i = 0; i <= 6; i += 1) {
    const p = lerp(a, b, i / 6)
    for (let j = 0; j <= 6; j += 1) {
      const q = lerp(c, d, j / 6)
      if (hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < gap) return true
    }
  }
  return false
}

function nearCable(a, b, cables, gap) {
  for (const line of cables) {
    for (let i = 1; i < line.length; i += 1) {
      if (segmentsClose(a, b, line[i - 1], line[i], gap)) return true
    }
  }
  return false
}

function pathBlocked(points, boxes, cables, pad, gap) {
  for (let i = 1; i < points.length; i += 1) {
    if (hitsAny(points[i - 1], points[i], boxes, pad)) return true
    if (nearCable(points[i - 1], points[i], cables, gap)) return true
  }
  return false
}

function overPath(start, end, crown) {
  const upA = [start[0], Math.max(start[1], crown), start[2]]
  const upB = [end[0], Math.max(end[1], crown), end[2]]
  return dedupe([start, upA, upB, end])
}

export function plugReach(type) {
  if (type === 'ntype') return 2.36
  if (type === 'sma' || type === 'rf') return 1.74
  if (type === 'ag') return 2.2
  if (type === 'usb' || type === 'usb2' || type === 'usb3') return 1.8
  if (type === 'usbc') return 1.5
  if (type === 'guc') return 1.4
  return 0.7
}

export function routeClear(aPos, aNormal, bPos, bNormal, boxes = [], lane = 0, options = {}) {
  const an = normalOr(aNormal, [0, 1, 0])
  const bn = normalOr(bNormal, [0, 1, 0])
  const leadA = options.leadA ?? plugReach('diger')
  const leadB = options.leadB ?? plugReach('diger')
  const pad = options.pad ?? 0.35
  const gap = options.gap ?? 0.9
  const cables = options.cables || []
  let start = pushOut(add(aPos, scale(an, leadA)), an, boxes, pad)
  let end = pushOut(add(bPos, scale(bn, leadB)), bn, boxes, pad)
  const shift = add(scale(sideDir(start, end), lane * gap), [0, lane * gap * 0.35, 0])
  start = add(start, shift)
  end = add(end, shift)
  const blocked = (points) => pathBlocked(points, boxes, cables, pad, gap)
  const direct = dedupe([start, end])
  if (direct && !blocked(direct)) return direct
  let top = Math.max(start[1], end[1])
  for (const box of boxes) top = Math.max(top, box.max[1] + pad)
  const crowns = [0, 1, 2].map((step) => top + gap + lane * gap + step * gap)
  for (const crown of crowns) {
    const path = overPath(start, end, crown)
    if (path && !blocked(path)) return path
  }
  const side = sideDir(start, end)
  for (const sign of [1, -1]) {
    for (const mul of [1, 2, 3]) {
      const off = scale(side, sign * mul * gap)
      const aside = dedupe([start, add(start, off), add(end, off), end])
      if (aside && !blocked(aside)) return aside
    }
  }
  return overPath(start, end, crowns[crowns.length - 1])
}

export function routeVia(aPos, aNormal, bPos, bNormal, vias, lift = null, leads = {}) {
  const an = normalOr(aNormal, [0, 1, 0])
  const bn = normalOr(bNormal, [0, 1, 0])
  const leadA = leads.leadA ?? plugReach('diger')
  const leadB = leads.leadB ?? plugReach('diger')
  const start = add(aPos, scale(an, leadA))
  const end = add(bPos, scale(bn, leadB))
  const mids = (vias || []).map((via) => (
    lift == null ? via : [via[0], lift, via[1]]
  ))
  return dedupe([start, ...mids, end])
}

export function routeThrough(aPos, aNormal, bPos, bNormal, via) {
  const an = normalOr(aNormal, [0, 1, 0])
  const bn = normalOr(bNormal, [0, 1, 0])
  const dist = hypot(bPos[0] - aPos[0], bPos[1] - aPos[1], bPos[2] - aPos[2])
  const lead = Math.min(0.14, Math.max(0.04, dist * 0.12))
  const start = add(aPos, scale(an, lead))
  const end = add(bPos, scale(bn, lead))
  return dedupe([aPos, start, via, end, bPos])
}

// Dış çap, mm. Sahne santimetredir; yarıçap = çap / 20.
// sma: RG-316, 2,5 mm. rf: RG-58, 5,0 mm. ntype: RG-213, 10,3 mm.
// usb2: tipik USB 2.0 kılıfı 4,0 mm. usb3: 5,5 mm. usbc: tam donanımlı Type-C 4,5 mm.
// ag: Cat6 U/UTP, IEC 61156-5 sınıfı nominal 5,9 mm.
// guc: EN 50525-2-11 H05VV-F 3G0,75 nominal 6,7 mm.
export const CABLE_OD_MM = {
  sma: 2.5,
  rf: 5,
  ntype: 10.3,
  usb2: 4,
  usb: 4,
  usb3: 5.5,
  usbc: 4.5,
  ag: 5.9,
  guc: 6.7,
  diger: 4
}

export function cableRadius(type) {
  return (CABLE_OD_MM[type] || CABLE_OD_MM.diger) / 20
}
export const SCHEMA_LIFT = {
  sma: 0.008,
  rf: 0.008,
  ntype: 0.014,
  usb2: 0.02,
  usb: 0.02,
  usb3: 0.026,
  usbc: 0.03,
  ag: 0.032,
  guc: 0.038,
  diger: 0.044
}
