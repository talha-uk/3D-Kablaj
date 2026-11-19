import { dosyaUygun } from './bicim.js'
import { View } from './scene.js'
import { mount } from './ui.js'
import { cableLengthCm, placeMeasurePoint, scaleFromEdges, scaleFromPair } from './olcu.js'
import {
  addCable,
  addGorev,
  gorevUyar,
  matchCable,
  measureOf,
  modelSolid,
  portGorev,
  portTypeOf,
  typeName,
  addParca,
  addComponent,
  addModel,
  addModelPort,
  addPort,
  duplicateComponent,
  movePort,
  emptyState,
  removeParca,
  removeCable,
  removeComponent,
  removeModel,
  removeModelPort,
  removePort,
  setComponentDeger,
  setComponentParca,
  setModelParca,
  setPortCins,
  setPortGorev,
  uid,
  updateCable,
  updateComponent,
  writeMeasure
} from './state.js'
import { downloadProject, loadProject, modelBuffer, rememberBuffer, saveProject, uploadModel } from './persist.js'

const params = new URLSearchParams(location.search)
const demo = params.has('demo')
let state = emptyState()
let past = []
let future = []
let uiState = { mode: 'yerlesim', tool: 'sec', cableType: 'guc', selection: null, inspectId: null, olcuHedef: null }
let poseMark = false
let measureUndo = false

const ui = mount({
  onMode: (mode) => {
    applyMode(mode)
    publish(false)
  },
  onTool: (tool) => {
    if (tool === 'kablo' && uiState.mode === 'incele') return
    if (tool === 'port' && uiState.mode !== 'incele') return
    if (tool === 'olcu' && uiState.mode !== 'incele') return
    const keepMeasure = tool === 'olcu'
    uiState = { ...uiState, tool, olcuHedef: keepMeasure ? uiState.olcuHedef : null }
    view.setTool(tool)
    publish(false)
  },
  onType: (cableType) => {
    uiState = { ...uiState, cableType }
    publish(false)
  },
  onUpload: (files) => { upload(files) },
  onInspect: (modelId) => {
    const solid = modelSolid(state.models.find((item) => item.id === modelId))
    const axis = ['merkez', 'en', 'boy', 'derinlik'].includes(uiState.olcuHedef)
    uiState = { ...uiState, inspectId: modelId, selection: null, olcuHedef: solid && axis ? null : uiState.olcuHedef }
    applyMode('incele')
    publish(false)
  },
  onPlace: (modelId) => place(modelId),
  onRemoveModel: (modelId) => commit(removeModel(state, modelId), 'Model silindi.'),
  onSelect: (selection) => select(selection),
  onHover: (hit) => view.setHover(hit),
  onRenameProject: (name) => commit({ ...state, name }, 'Proje adı değişti.'),
  onRenameComponent: (id, name) => commit(updateComponent(state, id, { name })),
  onScale: (id, scale) => {
    if (!Number.isFinite(scale) || scale <= 0) return
    commit(updateComponent(state, id, { scale }))
  },
  onDuplicate: (id) => {
    const next = duplicateComponent(state, id)
    const created = next.components[next.components.length - 1]
    uiState = { ...uiState, selection: { kind: 'component', id: created.id }, mode: 'yerlesim' }
    view.setMode('yerlesim')
    commit(next, 'Parça çoğaltıldı.')
  },
  onDeleteComponent: async (id) => {
    const ok = await ui.confirm('Parça silinsin mi?', 'Bu parçaya bağlı kablolar da kalkar.', 'Sil')
    if (!ok) return
    uiState = { ...uiState, selection: null }
    commit(removeComponent(state, id), 'Parça silindi.')
  },
  onRemovePort: (componentId, portId) => commit(removePort(state, componentId, portId), 'Port silindi.'),
  onRemoveModelPort: (modelId, portId) => commit(removeModelPort(state, modelId, portId), 'Port silindi.'),
  onPortCins: (portId, cins) => commit(setPortCins(state, portId, cins), cins === 'erkek' ? 'Port erkek.' : 'Port dişi.'),
  onPortGorev: (portId, gorev) => commit(setPortGorev(state, portId, gorev), gorev ? 'Port görevi yazıldı.' : 'Port görevi silindi.'),
  onAddGorev: async (portId) => {
    const name = await ui.askName('Görev', '')
    if (!name) return
    let next = addGorev(state, name)
    if (portId) next = setPortGorev(next, portId, name)
    commit(next, `${name} görevlere eklendi.`)
  },
  onRenameCable: (id, name) => commit(updateCable(state, id, { name })),
  onCableType: (id, type) => commit(updateCable(state, id, { type })),
  onDeleteCable: async (id) => {
    const ok = await ui.confirm('Kablo silinsin mi?', 'Bu kablo şemadan kalkar.', 'Sil')
    if (!ok) return
    uiState = { ...uiState, selection: null }
    commit(removeCable(state, id), 'Kablo silindi.')
  },
  onAddParca: async () => {
    const parca = await ui.askParca()
    if (!parca) return
    commit(addParca(state, parca), `${parca.ad} kütüphaneye kaydedildi.`)
  },
  onRemoveParca: async (id) => {
    const parca = (state.kutuphane || []).find((item) => item.id === id)
    if (!parca) return
    const ok = await ui.confirm('Parça silinsin mi?', `${parca.ad} kütüphaneden kalkar.`, 'Sil')
    if (!ok) return
    commit(removeParca(state, id), `${parca.ad} silindi.`)
  },
  onModelParca: (modelId, parcaId) => commit(setModelParca(state, modelId, parcaId), 'Modelin parçası kaydedildi.'),
  onComponentParca: (id, parcaId) => commit(setComponentParca(state, id, parcaId), 'Parça alanları açıldı.'),
  onComponentDeger: (id, alan, value) => commit(setComponentDeger(state, id, alan, value)),
  onNew: async () => {
    if (state.components.length === 0 && state.cables.length === 0) return
    const ok = await ui.confirm('Yeni düzenek?', 'Parçalar ve kablolar silinir. Modeller ve parça kütüphanesi kalır.', 'Sıfırla')
    if (!ok) return
    uiState = { ...uiState, selection: null, mode: 'yerlesim' }
    view.setMode('yerlesim')
    commit({
      ...emptyState(),
      models: state.models,
      kutuphane: state.kutuphane || [],
      gorevler: state.gorevler
    }, 'Yeni düzenek.')
  },
  onDownload: () => downloadProject(state),
  onOlcu: (modelId, olcu) => {
    if (!olcu.kenar?.merkez && ['merkez', 'en', 'boy', 'derinlik'].includes(uiState.olcuHedef)) {
      uiState = { ...uiState, olcuHedef: null }
    }
    applyMeasure(modelId, withAutoPoints(olcu), 'kenar')
  },
  onOlcuPair: (modelId, olcu) => {
    if (!olcu.cift?.a && !olcu.cift?.b && (uiState.olcuHedef === 'a' || uiState.olcuHedef === 'b')) {
      uiState = { ...uiState, olcuHedef: null }
    }
    applyMeasure(modelId, olcu, 'cift')
  },
  onOlcuHedef: (hedef) => {
    const pickingPair = uiState.olcuHedef === 'a' || uiState.olcuHedef === 'b'
    const next = hedef === 'mesafe'
      ? (pickingPair ? null : 'a')
      : (uiState.olcuHedef === hedef ? null : hedef)
    uiState = { ...uiState, olcuHedef: next, mode: 'incele', tool: 'olcu' }
    view.setMode('incele')
    view.setTool('olcu')
    publish(false)
  },
  fitOf: (modelId) => view.fitOf(modelId),
  cableLength: (cable) => cableLengthCm(state, cable, (id) => view.fitOf(id)),
  onOpen: async (file) => {
    try {
      const next = JSON.parse(await file.text())
      if (next.version !== 1) throw new Error('sürüm')
      uiState = { ...uiState, selection: null }
      commit(next, 'Proje açıldı.')
    } catch {
      ui.status('Bu dosya açılamadı.')
    }
  }
})

const view = new View(document.getElementById('sahne'), {
  modelBuffer,
  inspectModelId: () => uiState.inspectId || inspectFallback(),
  olcuHedef: () => uiState.olcuHedef,
  olcuSnap: () => {
    const model = state.models.find((item) => item.id === uiState.inspectId)
    return model?.olcu?.cift?.snap || 'yuzey'
  },
  olcuAnchor: () => {
    const model = state.models.find((item) => item.id === uiState.inspectId)
    const merkez = model?.olcu?.kenar?.merkez
    return Array.isArray(merkez) ? merkez : null
  },
  status: (text) => ui.status(text),
  onViewAngle: (angles) => ui.setAngles(angles),
  onSpeed: (text) => ui.setSpeed(text),
  onSelect: (selection) => select(selection),
  onPort: async (port) => {
    const count = state.components.find((item) => item.id === port.componentId)?.ports.length || 0
    const name = await ui.askName('Bağlantı noktası', `Uç ${count + 1}`)
    if (!name) return
    commit(addPort(state, port.componentId, {
      id: uid(),
      name,
      position: port.position,
      normal: port.normal
    }), 'Bağlantı noktası eklendi.')
  },
  onModelPort: async (port) => {
    const modelId = port.modelId || uiState.inspectId
    if (!modelId) return
    const type = await ui.askType()
    if (!type) return
    const model = state.models.find((item) => item.id === modelId)
    const count = (model?.ports || []).filter((item) => item.type === type).length + 1
    commit(addModelPort(state, modelId, {
      id: uid(),
      name: `${typeName(type)} ${count}`,
      type,
      cins: 'disi',
      position: port.position,
      normal: port.normal
    }), 'Port işaretlendi.')
  },
  onMeasurePoint: (point) => {
    const modelId = uiState.inspectId
    if (!modelId) return
    const model = state.models.find((item) => item.id === modelId)
    let olcu = placeMeasurePoint(measureOf(model), point)
    if (point.hedef === 'merkez') olcu = pullAxisCorners(olcu)
    if (!point.drag && point.hedef === 'merkez') olcu = withAutoPoints(olcu, olcu.kenar.merkez)
    const source = point.hedef === 'a' || point.hedef === 'b' ? 'cift' : 'kenar'
    if (point.drag) {
      previewMeasure(modelId, olcu, source)
      return
    }
    uiState = { ...uiState, olcuHedef: point.hedef === 'a' ? 'b' : null }
    applyMeasure(modelId, olcu, source)
  },
  onMeasureDragEnd: () => {
    if (uiState.olcuHedef === 'merkez' && uiState.inspectId) {
      const model = state.models.find((item) => item.id === uiState.inspectId)
      const current = measureOf(model)
      const olcu = withAutoPoints(current)
      if (olcu !== current) applyMeasure(uiState.inspectId, olcu, 'kenar')
    }
    if (measureUndo) ui.status('Ölçü güncellendi.')
    measureUndo = false
  },
  cableOk: (ends) => Boolean(cableMatch(ends)),
  onCable: (ends) => {
    const match = cableMatch(ends)
    if (!match) return
    commit(addCable(state, ends.a, ends.b, match.type, match.name), 'Kablo bağlandı.')
  },
  onPoseStart: () => {
    if (poseMark) return
    past.push(structuredClone(state))
    if (past.length > 40) past.shift()
    future = []
    poseMark = true
  },
  onPortPose: (pose) => {
    state = movePort(state, pose)
    poseMark = false
    publish(true)
  },
  onPose: (id, patch) => {
    const component = state.components.find((item) => item.id === id)
    if (!component) return
    const nextPatch = patch.schema ? { schema: { ...component.schema, ...patch.schema } } : patch
    state = updateComponent(state, id, nextPatch)
    poseMark = false
    publish(true)
  },
  onBend: (id, vias, schema) => {
    state = updateCable(state, id, schema
      ? { schemaVias: vias, schemaBend: [0, 0] }
      : { vias, bend: [0, 0, 0] })
    poseMark = false
    publish(true)
  }
})

function cableMatch(ends) {
  const a = portTypeOf(state, ends.a.componentId, ends.a.portId)
  const b = portTypeOf(state, ends.b.componentId, ends.b.portId)
  const match = matchCable(a, b)
  if (!match) {
    ui.status(a && b ? `${typeName(a)} ile ${typeName(b)} bağlanmaz.` : 'Uç türü belli değil.')
    return null
  }
  const left = portGorev(state, ends.a.componentId, ends.a.portId)
  const right = portGorev(state, ends.b.componentId, ends.b.portId)
  if (!gorevUyar(left, right)) {
    ui.status(left && right ? `${left} ile ${right} uyuşmaz.` : 'Görevi olan uca görevsiz kablo takılmaz.')
    return null
  }
  return match
}

function inspectFallback() {
  return state.components.find((item) => item.id === uiState.selection?.id)?.modelId
    || view.inspectRoot?.userData?.modelId
    || state.models[0]?.id
    || ''
}

function pinInspect() {
  if (uiState.mode !== 'incele' || uiState.inspectId) return
  const modelId = inspectFallback()
  if (modelId) uiState = { ...uiState, inspectId: modelId }
}

function select(selection) {
  pinInspect()
  const incele = uiState.mode === 'incele'
  uiState = { ...uiState, selection }
  if (selection?.kind === 'port' && uiState.tool !== 'kablo' && !incele && uiState.mode !== 'yerlesim') {
    uiState = { ...uiState, tool: 'tasi' }
    view.setTool('tasi')
  }
  view.setSelection(uiState.selection)
  publish(false)
}

function commit(next, message) {
  past.push(structuredClone(state))
  if (past.length > 40) past.shift()
  future = []
  state = next
  poseMark = false
  return publish(true, message)
}

function publish(save, message) {
  if (uiState.selection?.kind === 'component' && !state.components.some((item) => item.id === uiState.selection.id)) {
    uiState = { ...uiState, selection: null }
  }
  if (uiState.selection?.kind === 'port') {
    const id = uiState.selection.portId
    const exists = state.models.some((item) => (item.ports || []).some((port) => port.id === id))
      || state.components.some((item) => item.ports.some((port) => port.id === id))
    if (!exists) uiState = { ...uiState, selection: null }
  }
  if (uiState.selection?.kind === 'cable' && !state.cables.some((item) => item.id === uiState.selection.id)) {
    uiState = { ...uiState, selection: null }
  }
  view.setSelection(uiState.selection)
  const pending = view.setState(state)
  ui.render(state, uiState)
  if (save && !demo) saveProject(state)
  if (message) ui.status(message)
  return pending
}

async function upload(files) {
  const list = [...files].filter((file) => dosyaUygun(file.name))
  if (list.length === 0) {
    ui.status('GLB veya Solid (.sldprt) dosyası gerekli.')
    return
  }
  let next = state
  let boyut = ''
  try {
    for (const file of list) {
      const meta = await uploadModel(file)
      next = addModel(next, { id: meta.id, name: meta.name, file: meta.file, boyut: meta.boyut || null, birim: meta.birim || null })
      uiState = { ...uiState, inspectId: meta.id }
      if (meta.boyut) boyut = meta.boyut
    }
  } catch (error) {
    ui.status(error instanceof Error ? error.message : 'Dosya açılmadı.')
    return
  }
  const base = list.length === 1 ? 'Model yüklendi.' : `${list.length} model yüklendi.`
  commit(next, boyut ? `${base} ${boyut}` : base)
}

async function place(modelId) {
  const model = state.models.find((item) => item.id === modelId)
  if (!model) return
  const next = addComponent(state, modelId, model.name)
  const created = next.components[next.components.length - 1]
  const fit = view.fitOf(modelId)
  const reach = Math.max(fit?.dx || 0, fit?.dz || 0)
  if (reach > 1.2) {
    const step = reach + 2
    const index = next.components.length - 1
    const column = index % 5
    const row = Math.floor(index / 5)
    created.position = [column * step, 0, row * step]
    created.schema.x = column * step
    created.schema.z = row * step
  }
  uiState = { ...uiState, selection: { kind: 'component', id: created.id }, mode: 'yerlesim', tool: 'tasi', inspectId: modelId }
  view.setMode('yerlesim')
  view.setTool('tasi')
  await commit(next, 'Parça sahneye kondu. Eksenler açık.')
  view.frameComponent(created.id)
}

function applyMode(mode) {
  let tool = uiState.tool
  if (mode === 'incele' && tool === 'kablo') tool = 'sec'
  if (mode !== 'incele' && tool === 'port') tool = 'sec'
  if (mode !== 'incele' && tool === 'olcu') tool = 'sec'
  uiState = { ...uiState, mode, tool }
  view.setMode(mode)
  view.setTool(tool)
}

function pullAxisCorners(olcu) {
  const anchor = olcu?.kenar?.merkez
  if (!anchor) return olcu
  const kenar = { ...olcu.kenar }
  let changed = false
  for (const key of ['en', 'boy', 'derinlik']) {
    const prev = kenar[key]
    const snapped = view.nearestAxisCorner(anchor, key, prev || anchor)
    const same = snapped && prev
      && snapped[0] === prev[0]
      && snapped[1] === prev[1]
      && snapped[2] === prev[2]
    if (same || (!snapped && !prev)) continue
    kenar[key] = snapped
    changed = true
  }
  return changed ? { ...olcu, kenar } : olcu
}

function withAutoPoints(olcu, anchor = olcu?.kenar?.merkez) {
  if (!olcu?.otomatik || !Array.isArray(anchor)) return olcu
  const found = view.measureAutoPoints(anchor)
  if (!found) return olcu
  const kenar = { ...olcu.kenar }
  let changed = false
  for (const key of ['en', 'boy', 'derinlik']) {
    if (!found[key]) continue
    kenar[key] = found[key]
    changed = true
  }
  return changed ? { ...olcu, kenar } : olcu
}

function measureScale(modelId, olcu, source) {
  const fit = view.fitOf(modelId)
  const model = state.models.find((item) => item.id === modelId)
  let olcek = null
  if (source === 'cift' && Array.isArray(olcu.cift?.a) && Array.isArray(olcu.cift?.b)) {
    olcek = scaleFromPair(olcu.cift.a, olcu.cift.b, olcu.cift.cm, fit?.s)
  } else if (source === 'kenar') {
    olcek = scaleFromEdges(olcu.kenar, olcu, fit?.s)
  }
  return { model, olcek: olcek ?? model?.olcek ?? null }
}

function applyMeasure(modelId, olcu, source) {
  const { olcek } = measureScale(modelId, olcu, source)
  commit(writeMeasure(state, modelId, olcu, olcek), 'Ölçü güncellendi.')
}

function previewMeasure(modelId, olcu, source) {
  const model = state.models.find((item) => item.id === modelId)
  const before = JSON.stringify(model?.olcu || null)
  const { olcek } = measureScale(modelId, olcu, source)
  const next = writeMeasure(state, modelId, olcu, olcek)
  const after = JSON.stringify(next.models.find((item) => item.id === modelId)?.olcu || null)
  if (before === after) return
  if (!measureUndo) {
    past.push(structuredClone(state))
    if (past.length > 40) past.shift()
    future = []
    measureUndo = true
  }
  state = next
  publish(true)
}

function undo() {
  const previous = past.pop()
  if (!previous) return
  future.push(structuredClone(state))
  state = previous
  publish(true, 'Geri alındı.')
}

function redo() {
  const next = future.pop()
  if (!next) return
  past.push(structuredClone(state))
  state = next
  publish(true, 'Yeniden uygulandı.')
}

window.addEventListener('keydown', (event) => {
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
  if (typing) return
  if (event.key === 'Escape') {
    view.cancelCable()
    ui.status('Kablo seçimi iptal.')
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
  }
  if (event.key === 'Delete') {
    const selection = uiState.selection
    if (!selection) return
    event.preventDefault()
    uiState = { ...uiState, selection: null }
    if (selection.kind === 'component') commit(removeComponent(state, selection.id), 'Parça silindi.')
    if (selection.kind === 'cable') commit(removeCable(state, selection.id), 'Kablo silindi.')
    if (selection.kind === 'port') {
      const model = state.models.find((item) => (item.ports || []).some((port) => port.id === selection.portId))
      uiState = { ...uiState, selection: null }
      if (model) commit(removeModelPort(state, model.id, selection.portId), 'Port silindi.')
      else {
        const owner = state.components.find((item) => item.ports.some((port) => port.id === selection.portId))
        if (owner) commit(removePort(state, owner.id, selection.portId), 'Port silindi.')
      }
    }
  }
  if (event.key === '1' || event.key === '2' || event.key === '3') {
    applyMode(event.key === '1' ? 'incele' : event.key === '2' ? 'yerlesim' : 'sema')
    publish(false)
  }
  if (event.key.toLowerCase() === 'f') view.frame()
})

if (params.has('test')) window.__duzenek = { get state() { return state }, view, uiState: () => uiState }

async function boot() {
  if (!demo) {
    const saved = await loadProject()
    if (saved) state = saved
  } else {
    await loadDemo()
  }
  view.setMode(uiState.mode)
  publish(false, demo ? 'Örnek kutu yüklendi.' : 'Hazır.')
}

async function loadDemo() {
  const response = await fetch('/test-kutu.glb')
  const buffer = await response.arrayBuffer()
  const meta = { id: 'demo-kutu', name: 'Kutu', file: 'test-kutu.glb' }
  rememberBuffer(meta.id, buffer)
  state = addModel(emptyState(), meta)
  state = addComponent(state, meta.id, 'Kutu A')
  state = addComponent(state, meta.id, 'Kutu B')
  const [a, b] = state.components
  const portA = { id: uid(), name: 'Uç', position: [0.5, 0, 0], normal: [1, 0, 0] }
  const portB = { id: uid(), name: 'Uç', position: [-0.5, 0, 0], normal: [-1, 0, 0] }
  state = addPort(state, a.id, portA)
  state = addPort(state, b.id, portB)
  state = addCable(state, { componentId: a.id, portId: portA.id }, { componentId: b.id, portId: portB.id }, 'guc')
  state = addComponent(state, meta.id, 'Kutu C')
  uiState = { ...uiState, inspectId: meta.id, selection: { kind: 'component', id: a.id } }
}

boot()
