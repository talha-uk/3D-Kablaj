import { View } from './scene.js'
import { mount } from './ui.js'
import { cableLengthCm, scaleFromBox, scaleFromPair } from './olcu.js'
import {
  addCable,
  matchCable,
  measureOf,
  portTypeOf,
  typeName,
  addComponent,
  addModel,
  addModelPort,
  addPort,
  duplicateComponent,
  movePort,
  emptyState,
  removeCable,
  removeComponent,
  removeModel,
  removeModelPort,
  removePort,
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

const ui = mount({
  onMode: (mode) => {
    pinInspect()
    applyMode(mode)
    publish(false)
  },
  onTool: (tool) => {
    if (tool === 'kablo' && uiState.mode === 'incele') return
    if (tool === 'port' && uiState.mode === 'sema') return
    if (tool === 'olcu' && uiState.mode !== 'incele') return
    uiState = { ...uiState, tool }
    view.setTool(tool)
    publish(false)
  },
  onType: (cableType) => {
    uiState = { ...uiState, cableType }
    publish(false)
  },
  onUpload: (files) => { upload(files) },
  onInspect: (modelId) => {
    uiState = { ...uiState, inspectId: modelId, selection: null }
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
  onRenameCable: (id, name) => commit(updateCable(state, id, { name })),
  onCableType: (id, type) => commit(updateCable(state, id, { type })),
  onDeleteCable: async (id) => {
    const ok = await ui.confirm('Kablo silinsin mi?', 'Bu kablo şemadan kalkar.', 'Sil')
    if (!ok) return
    uiState = { ...uiState, selection: null }
    commit(removeCable(state, id), 'Kablo silindi.')
  },
  onNew: async () => {
    if (state.components.length === 0 && state.cables.length === 0) return
    const ok = await ui.confirm('Yeni düzenek?', 'Parçalar ve kablolar silinir. Yüklenen modeller kalır.', 'Sıfırla')
    if (!ok) return
    uiState = { ...uiState, selection: null, mode: 'yerlesim' }
    view.setMode('yerlesim')
    commit({ ...emptyState(), models: state.models }, 'Yeni düzenek.')
  },
  onDownload: () => downloadProject(state),
  onOlcu: (modelId, olcu) => applyMeasure(modelId, olcu, 'kutu'),
  onOlcuPair: (modelId, olcu) => applyMeasure(modelId, olcu, 'cift'),
  onOlcuHedef: (hedef) => {
    uiState = { ...uiState, olcuHedef: uiState.olcuHedef === hedef ? null : hedef, mode: 'incele' }
    view.setMode('incele')
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
  status: (text) => ui.status(text),
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
      position: port.position,
      normal: port.normal
    }), 'Port işaretlendi.')
  },
  onMeasurePoint: (point) => {
    const modelId = uiState.inspectId
    if (!modelId) return
    const model = state.models.find((item) => item.id === modelId)
    const olcu = measureOf(model)
    if (point.hedef === 'a' || point.hedef === 'b') {
      const cift = {
        a: Array.isArray(olcu.cift?.a) ? olcu.cift.a : null,
        b: Array.isArray(olcu.cift?.b) ? olcu.cift.b : null,
        cm: olcu.cift?.cm ?? null,
        color: olcu.cift?.color || '#2f8f4e'
      }
      cift[point.hedef] = point.position
      olcu.cift = cift
      uiState = { ...uiState, olcuHedef: point.hedef === 'a' ? 'b' : null }
      applyMeasure(modelId, olcu, 'cift')
      return
    }
    olcu.points = [...olcu.points, { id: uid(), position: point.position }]
    applyMeasure(modelId, olcu, 'kutu')
  },
  cableOk: (ends) => {
    const a = portTypeOf(state, ends.a.componentId, ends.a.portId)
    const b = portTypeOf(state, ends.b.componentId, ends.b.portId)
    if (matchCable(a, b)) return true
    const left = typeName(a)
    const right = typeName(b)
    ui.status(a && b ? `${left} ile ${right} bağlanmaz.` : 'Uç türü belli değil.')
    return false
  },
  onCable: (ends) => {
    const match = matchCable(
      portTypeOf(state, ends.a.componentId, ends.a.portId),
      portTypeOf(state, ends.b.componentId, ends.b.portId)
    )
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
  uiState = { ...uiState, selection }
  if (selection?.kind === 'port' && uiState.tool !== 'kablo') {
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
  const list = [...files].filter((file) => file.name.toLowerCase().endsWith('.glb'))
  if (list.length === 0) {
    ui.status('GLB dosyası gerekli.')
    return
  }
  let next = state
  for (const file of list) {
    const meta = await uploadModel(file)
    next = addModel(next, { id: meta.id, name: meta.name, file: meta.file })
    uiState = { ...uiState, inspectId: meta.id }
  }
  commit(next, list.length === 1 ? 'Model yüklendi.' : `${list.length} model yüklendi.`)
}

async function place(modelId) {
  const model = state.models.find((item) => item.id === modelId)
  if (!model) return
  const next = addComponent(state, modelId, model.name)
  const created = next.components[next.components.length - 1]
  uiState = { ...uiState, selection: { kind: 'component', id: created.id }, mode: 'yerlesim', tool: 'tasi', inspectId: modelId }
  view.setMode('yerlesim')
  view.setTool('tasi')
  await commit(next, 'Parça sahneye kondu. Eksenler açık.')
  view.frameComponent(created.id)
}

function applyMode(mode) {
  let tool = uiState.tool
  if (mode === 'incele' && tool === 'kablo') tool = 'sec'
  if (mode === 'sema' && tool === 'port') tool = 'sec'
  if (mode !== 'incele' && tool === 'olcu') tool = 'sec'
  uiState = { ...uiState, mode, tool }
  view.setMode(mode)
  view.setTool(tool)
}

function applyMeasure(modelId, olcu, source) {
  const fit = view.fitOf(modelId)
  const model = state.models.find((item) => item.id === modelId)
  let olcek = null
  if (source === 'cift' && Array.isArray(olcu.cift?.a) && Array.isArray(olcu.cift?.b)) {
    olcek = scaleFromPair(olcu.cift.a, olcu.cift.b, olcu.cift.cm, fit?.s)
  } else {
    olcek = scaleFromBox(olcu.points, olcu, fit?.s)
  }
  commit(writeMeasure(state, modelId, olcu, olcek ?? model?.olcek ?? null), 'Ölçü güncellendi.')
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
