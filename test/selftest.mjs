import * as THREE from 'three'
import { SCHEMA_TILT, aimAhead, axisAngles, cameraBasis, cameraPlacement, faceBasis, flyDelta, groundAxes, panFocus, pickView, schemaPose, turnLook } from '../src/fly.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { headingFromQuaternion, portOrientation, portRoll } from '../src/yaw.js'
import { softSnap, softSnapAngle } from '../src/snap.js'
import { focusFor } from '../src/focus.js'
import { routeClear, routePlacement, routeSchema, routeThrough } from '../src/route.js'
import { addCable, addComponent, addModel, addPort, cableShown, emptyState, matchCable, uid } from '../src/state.js'
import { cableLengthCm, decimalText, pairCm, portWorld, scaleFromBox, scaleFromEdges, scaleFromPair, snapEdgeCorner, snapModelCorner, snapReference } from '../src/olcu.js'
import { seenFrom } from '../src/viewcube.js'
import fs from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

let failed = 0
function check(name, ok) {
  if (!ok) {
    failed += 1
    console.error('FAIL', name)
  } else {
    console.log('ok', name)
  }
}

const state = emptyState()
const withModel = addModel(state, { id: 'm', name: 'Kutu', file: 'kutu.glb' })
let next = addComponent(withModel, 'm', 'A')
next = addComponent(next, 'm', 'B')
const [a, b] = next.components
const pa = { id: uid(), name: 'Uç', position: [0.5, 0, 0], normal: [1, 0, 0] }
const pb = { id: uid(), name: 'Uç', position: [-0.5, 0, 0], normal: [-1, 0, 0] }
next = addPort(next, a.id, pa)
next = addPort(next, b.id, pb)
next = addCable(next, { componentId: a.id, portId: pa.id }, { componentId: b.id, portId: pb.id }, 'guc')

const cableFocus = focusFor(next, { kind: 'cable', cableId: next.cables[0].id })
check('kablo odağı iki ucu tutar', cableFocus.components.has(a.id) && cableFocus.components.has(b.id) && cableFocus.cables.size === 1)

const portFocus = focusFor(next, { kind: 'port', componentId: a.id, portId: pa.id })
check('port odağı kendisini tutar', portFocus.portFocus && portFocus.ports.has(`${a.id}:${pa.id}`))
check('port odağı bağlı kabloyu tutar', portFocus.cables.has(next.cables[0].id))
check('port odağı öteki ucu tutar', portFocus.ports.has(`${b.id}:${pb.id}`))

const partFocus = focusFor(next, { kind: 'component', componentId: a.id })
check('parça odağı bağlı parçayı tutar', partFocus.components.has(b.id) && partFocus.cables.has(next.cables[0].id))

const hidden = focusFor({ ...next, hiddenTypes: ['guc'] }, { kind: 'component', componentId: a.id })
check('gizli tür odağa girmez', hidden.cables.size === 0 && hidden.components.size === 1)
check('aynı tür bağlanır', matchCable('sma', 'sma')?.type === 'sma')
check('SMA ile N bağlanır', matchCable('sma', 'ntype')?.name === 'RF SMA–N')
check('Ethernet ile Type-C bağlanır', matchCable('usbc', 'ag')?.name === 'Ethernet–Type-C')
check('USB 2 ile Type-C bağlanır', matchCable('usb2', 'usbc')?.type === 'usb2')
check('SMA ile Ethernet bağlanmaz', matchCable('sma', 'ag') === null)
check('güç yalnız güce gider', matchCable('guc', 'usbc') === null && matchCable('guc', 'guc')?.type === 'guc')
const mixed = addCable(next, { componentId: a.id, portId: pa.id }, { componentId: b.id, portId: pb.id }, 'rf', 'RF SMA–N')
mixed.components = mixed.components.map((item) => ({
  ...item,
  ports: item.ports.map((port) => ({ ...port, type: port.id === pa.id ? 'sma' : 'ntype' }))
}))
check('SMA–N kablosu N filtresi açıkken durur', cableShown({ ...mixed, hiddenTypes: ['sma'] }, mixed.cables.at(-1)))
check('iki uç da gizlenince kablo gider', !cableShown({ ...mixed, hiddenTypes: ['sma', 'ntype'] }, mixed.cables.at(-1)))

const placed = routePlacement([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0])
check('yerleşim kablosu sarkar', placed && placed[2][1] < 0)

const flat = routeSchema([0, 1, 0], [1, 0, 0], [2, 1, 1], [-1, 0, 0], 0.02, [0, 0])
check('şema kablosu aynı yükseklikte', flat && flat.every((point) => Math.abs(point[1] - 0.02) < 1e-6))
check('şema kablosu iki ucu bağlar', flat[0][0] === 0 && flat.at(-1)[0] === 2)
const schemaBlocked = routeSchema(
  [0.5, 0, 0], [1, 0, 0],
  [2.5, 0, 0], [-1, 0, 0],
  0.02, [0, 0],
  [
    { minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 },
    { minX: 1, maxX: 2, minZ: -0.4, maxZ: 0.4 },
    { minX: 2.5, maxX: 3.5, minZ: -0.5, maxZ: 0.5 }
  ]
)
const throughMiddle = schemaBlocked.slice(1, -1).some((point) => point[0] > 1.02 && point[0] < 1.98 && Math.abs(point[2]) < 0.38)
check('şema kablosu modelin dışından gider', schemaBlocked && !throughMiddle && schemaBlocked.some((point) => Math.abs(point[2]) >= 0.49))
const frontCam = [1, 1, 1]
check('öndeki yüz görünür', seenFrom([1, 0, 0], frontCam, 'face', [[1, 0, 0]]))
check('arkadaki yüz gizli', !seenFrom([-1, 0, 0], frontCam, 'face', [[-1, 0, 0]]))
check('arkadaki kenar gizli', !seenFrom(unitDir([-1, -1, 0]), frontCam, 'edge', [[-1, 0, 0], [0, -1, 0]]))
check('görünen yüzün köşesi durur', seenFrom(unitDir([1, -1, -1]), frontCam, 'corner', [[1, 0, 0], [0, -1, 0], [0, 0, -1]]))
check('arkadaki köşe gizli', !seenFrom(unitDir([-1, -1, -1]), frontCam, 'corner', [[-1, 0, 0], [0, -1, 0], [0, 0, -1]]))
check('sağ varken kırmızı ok durur', seenFrom([1, 0, 0], frontCam, 'axis'))
check('yüz gizlenince ok durur', seenFrom([1, 0, 0], [-1, 0.2, 0.2], 'axis') && seenFrom([0, 1, 0], [0.2, -1, 0.2], 'axis') && seenFrom([0, 0, 1], [0.2, 0.2, -1], 'axis'))

const blocked = routeClear([-2, 0, 0], [-1, 0, 0], [2, 0, 0], [1, 0, 0], [{ min: [-0.4, -0.4, -0.4], max: [0.4, 0.4, 0.4] }], 0)
const samples = []
for (let i = 1; i < blocked.length - 1; i += 1) samples.push(blocked[i])
const through = samples.some((point) => Math.abs(point[0]) < 0.4 && Math.abs(point[1]) < 0.4 && Math.abs(point[2]) < 0.4)
check('kablo engelin içinden geçmez', blocked && blocked.some((point) => point[1] > 0.4) && !through)
const via = routeThrough([0, 0, 0], [0, 1, 0], [2, 0, 0], [0, 1, 0], [1, 0.4, 0.5])
check('kıvrım noktası kablonun üstünde', via && via.some((point) => point[0] === 1 && point[1] === 0.4 && point[2] === 0.5))
const clear = routeClear([-2, 1, 0], [0, 1, 0], [2, 1, 0], [0, 1, 0], [], 1)
check('boş yolda ikinci kablo yükselir', clear && clear[2][1] > clear[0][1])

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100)
camera.up.set(0, 0, -1)
camera.position.set(0, 10, 0)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld(true)
const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
check('şema kamerasında sağ +X', right.x > 0.9 && Math.abs(right.z) < 0.1)
check('şema kamerasında yukarı -Z', up.z < -0.9 && Math.abs(up.x) < 0.1)

const look = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
look.position.set(0, 1, 5)
look.lookAt(0, 1, 0)
look.updateMatrixWorld(true)
const ahead = flyDelta(look, { forward: 1, strafe: 0 }, 1)
const aside = flyDelta(look, { forward: 0, strafe: 1 }, 1)
check('W bakılan yere gider', ahead.z < -0.9 && Math.abs(ahead.x) < 0.1)
check('D sağa gider', aside.x > 0.9 && Math.abs(aside.z) < 0.1)
const pitched = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
pitched.position.set(0, 0, 0)
pitched.lookAt(0, 1, -1)
pitched.updateMatrixWorld(true)
const climb = flyDelta(pitched, { forward: 1, strafe: 0 }, 1)
check('yukarı bakınca W yükselir', climb.y > 0.4 && climb.z < -0.4)
const risen = flyDelta(look, { forward: 0, strafe: 0, lift: 1 }, 1)
check('E dümdüz yukarı gider', risen.y > 0.9 && Math.abs(risen.x) < 0.1 && Math.abs(risen.z) < 0.1)
const plan = cameraBasis(camera, true)
check('şemada W ekranın yukarısı', plan.fwd.z < -0.9)
const nadir = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
nadir.up.set(0, 0, -1)
nadir.position.set(0, 8, 0)
nadir.lookAt(0, 0, 0)
nadir.updateMatrixWorld(true)
const drop = flyDelta(nadir, { forward: 1 }, 1)
check('tam üstten W alçalır', drop.y < -0.9 && Math.abs(drop.z) < 0.1)
const zenith = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
zenith.up.set(0, 0, -1)
zenith.position.set(0, -8, 0)
zenith.lookAt(0, 0, 0)
zenith.updateMatrixWorld(true)
const rise = flyDelta(zenith, { forward: 1 }, 1)
check('tam alttan W yükselir', rise.y > 0.9 && Math.abs(rise.z) < 0.1)
const frontAngles = axisAngles([0, 0, 1])
check('önden mavi 0, diğerleri 90', frontAngles[0] === 90 && frontAngles[1] === 90 && frontAngles[2] === 0)
const edgeAngles = axisAngles([1, 0, 1])
check('ön-sağ kenarı 45', edgeAngles[0] === 45 && edgeAngles[1] === 90 && edgeAngles[2] === 45)
check('şemada D ekranın sağı', plan.right.x > 0.9)

const still = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
still.position.set(3, 2.4, 4)
still.lookAt(0, 0.4, 0)
still.updateMatrixWorld(true)
const stay = still.position.clone()
const beforeDir = new THREE.Vector3()
still.getWorldDirection(beforeDir)
turnLook(still, 0.35, 0)
const rightDir = new THREE.Vector3()
still.getWorldDirection(rightDir)
check('sağa bakınca konum durur', still.position.distanceTo(stay) < 1e-8)
check('sağa bakınca yön +X kazanır', rightDir.x > beforeDir.x + 0.1)
const level = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
level.position.set(0, 1, 5)
level.lookAt(0, 1, 0)
level.updateMatrixWorld(true)
turnLook(level, 0, -0.3)
const upDir = new THREE.Vector3()
level.getWorldDirection(upDir)
check('yukarı bakınca yön yükselir', upDir.y > 0.2)
check('yukarı bakınca konum durur', level.position.distanceTo(new THREE.Vector3(0, 1, 5)) < 1e-8)

function fakeDom() {
  const doc = { addEventListener() {}, removeEventListener() {}, elementFromPoint() { return null } }
  return {
    style: {},
    ownerDocument: doc,
    clientHeight: 800,
    clientWidth: 800,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800 } }
  }
}
const rig = new THREE.PerspectiveCamera(45, 1, 0.02, 200)
rig.position.set(3, 2.4, 4)
rig.up.set(0, 1, 0)
const controls = new OrbitControls(rig, fakeDom())
controls.enableDamping = false
controls.enableRotate = false
controls.target.set(0, 0.4, 0)
controls.update()
const rigPos = rig.position.clone()
const rigDir = new THREE.Vector3()
rig.getWorldDirection(rigDir)
const dist = rig.position.distanceTo(controls.target)
turnLook(rig, 0.4, 0.15)
aimAhead(rig, controls.target, dist)
controls.update()
const afterDir = new THREE.Vector3()
rig.getWorldDirection(afterDir)
check('orbit güncellemesi konumu oynatmaz', rig.position.distanceTo(rigPos) < 1e-4)
check('orbit güncellemesi bakışı tutar', afterDir.dot(rigDir) < 0.98 && afterDir.y < rigDir.y)

function schemaCamera(direction) {
  const cam = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 100)
  const pose = schemaPose(0, 0, direction)
  cam.up.set(pose.up[0], pose.up[1], pose.up[2])
  cam.position.set(pose.position[0], pose.position[1], pose.position[2])
  cam.lookAt(pose.target[0], pose.target[1], pose.target[2])
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld(true)
  return cam
}
const flatCam = schemaCamera([0, 1, 0])
const flatRight = new THREE.Vector3().setFromMatrixColumn(flatCam.matrixWorld, 0)
const flatUp = new THREE.Vector3().setFromMatrixColumn(flatCam.matrixWorld, 1)
check('üstten şemada sağ +X', flatRight.x > 0.9)
check('üstten şemada yukarı -Z', flatUp.z < -0.9)
const angled = schemaCamera([0, Math.cos(SCHEMA_TILT), Math.sin(SCHEMA_TILT)])
const angRight = new THREE.Vector3().setFromMatrixColumn(angled.matrixWorld, 0)
const angUp = new THREE.Vector3().setFromMatrixColumn(angled.matrixWorld, 1)
check('açılı şemada sağ +X', angRight.x > 0.9 && Math.abs(angRight.y) < 0.1)
check('açılı şemada yukarı -Z tarafı', angUp.z < -0.2 && angUp.y > 0.2)
const low = new THREE.Vector3(0, 0.008, 0).project(angled)
const high = new THREE.Vector3(0, 0.044, 0).project(angled)
const lowTop = new THREE.Vector3(0, 0.008, 0).project(flatCam)
const highTop = new THREE.Vector3(0, 0.044, 0).project(flatCam)
const split = Math.hypot(high.x - low.x, high.y - low.y)
const stacked = Math.hypot(highTop.x - lowTop.x, highTop.y - lowTop.y)
check('açılı bakış üst üste kabloları ayırır', split > stacked + 0.004 && split > 0.008)
const axes = groundAxes(angled)
const slid = panFocus({ x: 0, z: 0 }, axes.right, axes.up, 10, 0, 0.1, 0.1)
check('açılı şemada sağa sürükleyince odak sola kayar', slid.x < -0.5 && Math.abs(slid.z) < 0.2)
const face = pickView([0.5, 0, 0.1], [1, 0, 0])
check('küp yüzü tek eksen', face[0] > 0.99 && Math.abs(face[1]) < 1e-6 && Math.abs(face[2]) < 1e-6)
const edge = pickView([0.5, 0.46, 0], [1, 0, 0])
check('küp kenarı iki eksen', edge[0] > 0.6 && edge[1] > 0.6 && Math.abs(edge[2]) < 1e-6)
const corner = pickView([0.5, 0.46, -0.47], [1, 0, 0])
check('küp köşesi üç eksen', corner[0] > 0.4 && corner[1] > 0.4 && corner[2] < -0.4)
const topPlace = cameraPlacement([1, 2, 3], [0, 1, 0], 4)
check('üst bakış hedefin üstünde', Math.abs(topPlace.position[0] - 1) < 1e-6 && Math.abs(topPlace.position[1] - 6) < 1e-6 && topPlace.up[2] === -1)
const topCam = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
topCam.up.set(topPlace.up[0], topPlace.up[1], topPlace.up[2])
topCam.position.set(topPlace.position[0], topPlace.position[1], topPlace.position[2])
topCam.lookAt(topPlace.target[0], topPlace.target[1], topPlace.target[2])
topCam.updateMatrixWorld(true)
const down = new THREE.Vector3()
topCam.getWorldDirection(down)
check('üst bakış aşağı bakar', down.y < -0.9)
const topFace = faceBasis([0, 1, 0])
check('üst yazısı -Z yönünde', topFace.y[2] < -0.9 && topFace.x[0] > 0.9)
const gizmo = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
gizmo.position.set(-down.x, -down.y, -down.z).multiplyScalar(2.8)
gizmo.up.setFromMatrixColumn(topCam.matrixWorld, 1)
gizmo.lookAt(0, 0, 0)
gizmo.updateMatrixWorld(true)
const nearFace = new THREE.Vector3(0, 0.5, 0).project(gizmo)
const farFace = new THREE.Vector3(0, -0.5, 0).project(gizmo)
check('küp kamerayla üst yüzü öne gelir', nearFace.z < farFace.z)
const mover = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
mover.position.set(0, 1, 5)
mover.lookAt(0, 1, 0)
mover.updateMatrixWorld(true)
turnLook(mover, 0.6, 0)
mover.updateMatrixWorld(true)
const lookDir = new THREE.Vector3()
mover.getWorldDirection(lookDir)
const follow = new THREE.PerspectiveCamera(32, 1, 0.1, 20)
follow.position.copy(lookDir).multiplyScalar(-2.8)
follow.up.setFromMatrixColumn(mover.matrixWorld, 1)
follow.lookAt(0, 0, 0)
follow.updateMatrixWorld(true)
const toCam = (point) => point.clone().applyMatrix4(follow.matrixWorldInverse)
const marker = lookDir.clone().normalize().multiplyScalar(-0.5)
const behind = lookDir.clone().normalize().multiplyScalar(0.5)
check('küp dönen kameranın baktığı yüzü öne alır', toCam(marker).z > toCam(behind).z + 0.5)
const orbitCam = new THREE.PerspectiveCamera(45, 1, 0.02, 200)
orbitCam.position.set(3, 2, 4)
const topControls = new OrbitControls(orbitCam, fakeDom())
topControls.target.set(0, 0.4, 0)
topControls.enableRotate = false
topControls.update()
const placedTop = cameraPlacement([0, 0.4, 0], [0, 1, 0], 5)
orbitCam.up.set(placedTop.up[0], placedTop.up[1], placedTop.up[2])
orbitCam.position.set(placedTop.position[0], placedTop.position[1], placedTop.position[2])
orbitCam.lookAt(placedTop.target[0], placedTop.target[1], placedTop.target[2])
orbitCam.updateMatrixWorld(true)
topControls.update()
const afterTop = new THREE.Vector3()
orbitCam.getWorldDirection(afterTop)
const screenUp = new THREE.Vector3().setFromMatrixColumn(orbitCam.matrixWorld, 1)
check('küpten üst bakış aşağı kalır', afterTop.y < -0.8)
check('küpten üst bakışta ekran -Z', screenUp.z < -0.8)
for (const angle of [0, 0.4, -1.2, 2.7, -3]) {
  const turned = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0))
  const back = headingFromQuaternion(turned)
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle))
  check(`yaw ${angle} korunur`, Math.abs(Math.atan2(Math.sin(back - wrapped), Math.cos(back - wrapped))) < 1e-5)
}
const axis = new THREE.Vector3(0.2, 0.9, -0.3).normalize()
const spun = portOrientation(axis, 0.8)
const read = portRoll(spun, axis)
check('port dönüşü korunur', Math.abs(Math.atan2(Math.sin(read - 0.8), Math.cos(read - 0.8))) < 1e-4)
check('ızgara yakını yapışır', softSnap(1.1) === 1)
check('ızgara uzağı serbest', softSnap(1.4) === 1.4)
check('ufak açı yapışır', softSnapAngle(Math.PI / 90) === 0)
check('ara açı serbest', Math.abs(softSnapAngle(Math.PI / 18) - Math.PI / 18) < 1e-9)

const glb = boxGlb()
fs.mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
fs.writeFileSync(new URL('../public/test-kutu.glb', import.meta.url), glb)
check('örnek glb yazıldı', glb.byteLength > 100)
const parsed = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '')
check('glb sahneye çıkar', parsed.scene.children.length === 1)

const body = [{ position: [0, 0, 0] }, { position: [10, 0, 0] }, { position: [0, 4, 0] }, { position: [0, 0, 8] }]
const fitS = 1 / 11
const bodyScale = scaleFromBox(body, { en: 10, boy: 4, derinlik: 8 }, fitS)
check('gövde 10 cm, SMA payı ölçeğe girmez', Math.abs(bodyScale - 11) < 1e-6)
check('ölçüye harf girilmez', decimalText('12a,5b.3') === '12.53')
const side = [
  [[0, 0, 0], [0, 2, 0], [0, 2, 2]],
  [[0, 0, 0], [0, 2, 2], [0, 0, 2]]
]
const top = [[[0, 2, 0], [2, 2, 0], [0, 2, 2]]]
const firstCorner = snapReference([...side, ...top], [0, 0.2, 0.2], [1, 0, 0], 'kose')
check('köşe aynı yüze yapışır', firstCorner && firstCorner.position[1] === 0 && firstCorner.position[2] === 0)
const secondCorner = snapReference([...side, ...top], [0, 1.8, 1.7], [1, 0, 0], 'kose', { plane: firstCorner.plane, y: firstCorner.y })
check('ikinci köşe aynı yükseklikte', secondCorner && secondCorner.position[1] === 0 && secondCorner.position[2] === 2)
const otherFace = snapReference([...side, ...top], [0.2, 2, 0.4], [0, 1, 0], 'yuzey', { plane: firstCorner.plane, y: firstCorner.y })
check('başka yüzey kabul edilmez', otherFace === null)
const levelPoint = snapReference(side, [0, 1.4, 1.1], [1, 0, 0], 'yuzey', { plane: firstCorner.plane, y: 0 })
check('yüzey noktası yüksekliği korunur', levelPoint && Math.abs(levelPoint.position[1]) < 1e-6 && Math.abs(levelPoint.position[2] - 1.1) < 1e-6)
check('ölçü ondalığı tek nokta', decimalText('1.2.3') === '1.23')
check('ölçeklenmiş gövde 10 cm', Math.abs(pairCm([0, 0, 0], [10, 0, 0], fitS, bodyScale) - 10) < 1e-6)
check('SMA ucu 11 cm de kalır', Math.abs(pairCm([0, 0, 0], [11, 0, 0], fitS, bodyScale) - 11) < 1e-6)
const withStub = [...body, { position: [11, 0, 0] }]
check('çıkıntı noktası kutuyu büyütür', Math.abs(scaleFromBox(withStub, { en: 10 }, fitS) - 10) < 1e-6)
check('iki nokta 10 cm aynı ölçeği verir', Math.abs(scaleFromPair([0, 0, 0], [10, 0, 0], 10, fitS) - 11) < 1e-6)
const cornerFaces = [
  [[0, 0, 0], [2, 0, 0], [2, 3, 0]],
  [[0, 0, 0], [2, 3, 0], [0, 3, 0]],
  [[0, 0, 0], [2, 0, 0], [2, 0, 4]],
  [[0, 0, 0], [2, 0, 4], [0, 0, 4]],
  [[0, 0, 0], [0, 3, 0], [0, 3, 4]],
  [[0, 0, 0], [0, 3, 4], [0, 0, 4]]
]
const center = snapModelCorner(cornerFaces, [0.2, 0.15, 0.1])
check('merkez en yakın köşe', center && center[0] === 0 && center[1] === 0 && center[2] === 0)
const edgeEnd = snapEdgeCorner(cornerFaces, [1, 0, 0], [0, 0, 0])
check('kenar ortası öbür köşeye gider', edgeEnd && edgeEnd[0] === 2 && edgeEnd[1] === 0 && edgeEnd[2] === 0)
const diagonal = snapEdgeCorner(cornerFaces, [2, 3, 0], [0, 0, 0])
check('çapraz köşe kenar sayılmaz', diagonal && !(diagonal[0] === 2 && diagonal[1] === 3))
const splitFace = [
  [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [2, 0, 0], [2, 1, 0]],
  [[1, 0, 0], [2, 1, 0], [0, 1, 0]]
]
const splitCorner = snapModelCorner(splitFace, [1.2, 0.05, 0])
check('bölünmüş kenarın ara noktası köşe değil', splitCorner && !(splitCorner[0] === 1 && splitCorner[1] === 0))
const fullEdge = snapEdgeCorner(splitFace, [1, 0, 0], [0, 0, 0])
check('bölünmüş kenarın tamamı ölçülür', fullEdge && fullEdge[0] === 2 && fullEdge[1] === 0 && fullEdge[2] === 0)
const edgeScale = scaleFromEdges(
  { merkez: [0, 0, 0], en: [10, 0, 0], boy: [0, 4, 0] },
  { en: 10, boy: 4 },
  fitS
)
check('ortak kenarlar aynı ölçeği verir', Math.abs(edgeScale - 11) < 1e-6)
const group = new THREE.Group()
group.position.set(1, 2, 3)
group.rotation.y = 0.4
group.scale.setScalar(2)
const align = new THREE.Group()
align.position.set(0.1, 0.2, 0.3)
align.scale.setScalar(0.5)
group.add(align)
const olcuMark = new THREE.Object3D()
olcuMark.position.set(4, 5, 6)
align.add(olcuMark)
group.updateWorldMatrix(true, true)
const expected = portWorld(
  { position: [1, 2, 3], yaw: 0.4, scale: 2 },
  { s: 0.5, x: 0.1, y: 0.2, z: 0.3 },
  [4, 5, 6]
)
check('ölçü dünya konumu', olcuMark.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...expected)) < 1e-5)
const measured = {
  version: 1,
  models: [{
    id: 'm',
    olcek: 11,
    ports: [{ id: 'pa', position: [0, 0, 0], normal: [1, 0, 0] }, { id: 'pb', position: [10, 0, 0], normal: [-1, 0, 0] }]
  }],
  components: [
    { id: 'a', modelId: 'm', position: [0, 0, 0], yaw: 0, scale: 11, ports: [] },
    { id: 'b', modelId: 'm', position: [0, 0, 0], yaw: 0, scale: 11, ports: [] }
  ],
  cables: [{ id: 'c', a: { componentId: 'a', portId: 'pa' }, b: { componentId: 'b', portId: 'pb' }, vias: [] }]
}
const length = cableLengthCm(measured, measured.cables[0], () => ({ s: fitS, x: 0, y: 0, z: 0 }))
check('kablo santimetreye oturur', length > 9 && length < 14)

function unitDir(values) {
  const length = Math.hypot(...values)
  return values.map((value) => value / length)
}

function boxGlb() {
  const faces = [
    [[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [1, 0, 0]],
    [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [-1, 0, 0]],
    [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [0, 1, 0]],
    [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [0, -1, 0]],
    [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5], [0, 0, 1]],
    [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5], [0, 0, -1]]
  ]
  const positions = []
  const normals = []
  const indices = []
  for (const face of faces) {
    const base = positions.length / 3
    const normal = face[4]
    for (let i = 0; i < 4; i += 1) {
      positions.push(...face[i])
      normals.push(...normal)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const bin = Buffer.alloc(648)
  for (let i = 0; i < positions.length; i += 1) bin.writeFloatLE(positions[i], i * 4)
  for (let i = 0; i < normals.length; i += 1) bin.writeFloatLE(normals[i], 288 + i * 4)
  for (let i = 0; i < indices.length; i += 1) bin.writeUInt16LE(indices[i], 576 + i * 2)
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Kutu' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'kutu', pbrMetallicRoughness: { baseColorFactor: [0.62, 0.66, 0.7, 1], metallicFactor: 0.2, roughnessFactor: 0.6 } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 288, target: 34962 },
      { buffer: 0, byteOffset: 288, byteLength: 288, target: 34962 },
      { buffer: 0, byteOffset: 576, byteLength: 72, target: 34963 }
    ],
    buffers: [{ byteLength: 648 }]
  })
  const jsonBuf = Buffer.from(json)
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)])
  const binPad = (4 - (bin.length % 4)) % 4
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)])
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length
  const out = Buffer.alloc(total)
  out.writeUInt32LE(0x46546c67, 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(total, 8)
  out.writeUInt32LE(jsonChunk.length, 12)
  out.writeUInt32LE(0x4e4f534a, 16)
  jsonChunk.copy(out, 20)
  const binStart = 20 + jsonChunk.length
  out.writeUInt32LE(binChunk.length, binStart)
  out.writeUInt32LE(0x004e4942, binStart + 4)
  binChunk.copy(out, binStart + 8)
  return out
}

if (failed) {
  console.error(failed, 'hata')
  process.exit(1)
}
console.log('selftest geçti')
