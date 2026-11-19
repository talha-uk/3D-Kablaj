import * as THREE from 'three'

const MIN_LAP = 1.15
const FAIL_AT = 0.58
const BAND_AXIS = new THREE.Vector3(0, 0, 1)
const _tangent = new THREE.Vector3()

export function signalBand(radius) {
  const span = Math.max(Number(radius) || 0, 0.04)
  return { major: span * 1.02, tube: Math.max(span * 0.34, 0.02) }
}

export function orientBand(quaternion, tangent) {
  _tangent.copy(tangent)
  if (_tangent.lengthSq() < 1e-8) _tangent.set(0, 1, 0)
  _tangent.normalize()
  quaternion.setFromUnitVectors(BAND_AXIS, _tangent)
}

export function signalPace(type) {
  if (type === 'guc') return 6
  if (type === 'sma' || type === 'rpsma' || type === 'rf' || type === 'ntype') return 16
  if (type === 'ag') return 12
  return 11
}

export function signalLap(length, type) {
  const span = Math.max(Number(length) || 0, 0.4)
  return Math.max(span / signalPace(type), MIN_LAP)
}

export function signalColor(type, ok) {
  if (!ok) return 0xff4d3a
  if (type === 'guc') return 0xffb020
  if (type === 'ag') return 0x3ee08a
  if (type === 'usb' || type === 'usb2' || type === 'usb3' || type === 'usbc') return 0x4cc3ff
  if (type === 'sma' || type === 'rpsma' || type === 'rf' || type === 'ntype') return 0x8dff6a
  return 0xb6ffb0
}

export function signalPackets(type, length, ok) {
  if (!ok) return [{ dir: 1, phase: 0 }]
  const lap = signalLap(length, type)
  if (type === 'guc') {
    const count = length < 4 ? 1 : length < 12 ? 2 : 3
    const gap = Math.min(lap * 0.16, 0.22)
    return Array.from({ length: count }, (_, index) => ({ dir: 1, phase: index * gap }))
  }
  const phases = length > 18 ? [0, lap * 0.5] : [0]
  const packets = []
  for (const dir of [1, -1]) {
    for (const phase of phases) packets.push({ dir, phase })
  }
  return packets
}

function wrap(value, span) {
  if (!(span > 0)) return 0
  return ((value % span) + span) % span
}

function clampU(u) {
  return Math.min(0.999, Math.max(0.001, u))
}

export function signalSample({ time, length, type, dir = 1, phase = 0, ok = true }) {
  const lap = signalLap(length, type)
  const t = (Number(time) || 0) + (Number(phase) || 0)
  const sign = dir < 0 ? -1 : 1
  if (!ok) {
    const cycle = lap * 1.7
    const local = wrap(t, cycle)
    const climb = lap * FAIL_AT
    if (local <= climb) {
      const along = local / lap
      return { u: clampU(sign < 0 ? 1 - along : along), alpha: 1, arrive: false, along, lap }
    }
    const fade = 1 - Math.min(1, (local - climb) / (cycle - climb))
    const stall = sign < 0 ? 1 - FAIL_AT : FAIL_AT
    return { u: clampU(stall), alpha: Math.max(0, fade), arrive: false, along: FAIL_AT, lap }
  }
  const along = wrap(t, lap) / lap
  const u = sign < 0 ? 1 - along : along
  return { u: clampU(u), alpha: 1, arrive: along > 0.9, along, lap }
}
