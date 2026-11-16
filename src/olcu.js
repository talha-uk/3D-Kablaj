import { routePlacement, routeVia } from './route.js'

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
