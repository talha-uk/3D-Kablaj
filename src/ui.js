import { componentName, componentPorts, matchCable, portName, portTypeOf, typeName } from './state.js'
import { bindTabs, bindToolbar } from './keys.js'

const HINT = {
  sec: 'Parçaya veya kabloya tıkla. Boş alanda sürükleyince kamera yerinde kalır, yalnız bakış yönü değişir.',
  tasi: 'Parçayı oklarla taşı. Herhangi bir portu tutup modelin yüzeyinde kaydır.',
  dondur: 'Modeli yeşil halkadan çevir. Port seçiliyken portu tutup çevirirsin, halka portu gömmez.',
  port: 'Yerleşimde veya incelede yüzeye tıkla. RF SMA, RF N, USB 2.0, USB 3.0, USB Type-C, Ethernet veya Güç.',
  kablo: 'Önce bir port, sonra öteki. Aynı tür bağlanır. SMA–N, Ethernet–Type-C ve USB ara kablosu da olur.'
}

function button(label, onClick) {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = label
  element.addEventListener('click', onClick)
  return element
}

function ask(dialog, prepare) {
  return new Promise((resolve) => {
    prepare(dialog)
    const done = () => {
      dialog.removeEventListener('close', done)
      const value = dialog.returnValue
      dialog.returnValue = ''
      resolve(value)
    }
    dialog.addEventListener('close', done)
    dialog.showModal()
  })
}

export function mount(hooks) {
  const tabs = bindTabs(document.querySelector('[role="tablist"]'), hooks.onMode)
  bindToolbar(document.querySelector('[role="toolbar"]'))
  const durum = document.getElementById('durum')
  const ipucu = document.getElementById('ipucu')
  const bos = document.getElementById('bos')
  const modeller = document.getElementById('modeller')
  const secilen = document.getElementById('secilen')
  const secilenNe = document.getElementById('secilen-ne')
  const secilenAd = document.getElementById('secilen-ad')
  const bagli = document.getElementById('bagli')
  const secili = document.getElementById('secili')
  const projeAd = document.getElementById('proje-ad')
  const dosya = document.getElementById('dosya')
  const jsonDosya = document.getElementById('json-dosya')
  const kutuphane = document.getElementById('kutuphane')
  const ekran = document.getElementById('ekran')
  const acili = document.getElementById('acili')

  document.getElementById('yukle').addEventListener('click', () => dosya.click())
  dosya.addEventListener('change', () => {
    hooks.onUpload?.(dosya.files)
    dosya.value = ''
  })
  document.getElementById('ac').addEventListener('click', () => jsonDosya.click())
  jsonDosya.addEventListener('change', () => {
    const file = jsonDosya.files?.[0]
    jsonDosya.value = ''
    if (file) hooks.onOpen?.(file)
  })
  document.getElementById('indir').addEventListener('click', () => hooks.onDownload?.())
  document.getElementById('yeni').addEventListener('click', () => hooks.onNew?.())
  projeAd.addEventListener('change', () => hooks.onRenameProject?.(projeAd.value.trim() || 'Adsız düzenek'))
  acili.addEventListener('click', () => hooks.onSchemaTilt?.())

  document.querySelector('[aria-label="Araç"]').addEventListener('click', (event) => {
    const target = event.target.closest('[data-tool]')
    if (!target || target.hidden || target.getAttribute('aria-disabled') === 'true') return
    hooks.onTool?.(target.dataset.tool)
  })

  for (const zone of [kutuphane, ekran]) {
    zone.addEventListener('dragover', (event) => {
      if (![...event.dataTransfer.types].includes('Files')) return
      event.preventDefault()
      zone.classList.add('birak')
    })
    zone.addEventListener('dragleave', () => zone.classList.remove('birak'))
    zone.addEventListener('drop', (event) => {
      event.preventDefault()
      zone.classList.remove('birak')
      hooks.onUpload?.(event.dataTransfer.files)
    })
  }

  function render(state, ui) {
    if (document.activeElement !== projeAd) projeAd.value = state.name
    for (const item of document.querySelectorAll('[data-tool]')) {
      const tool = item.dataset.tool
      item.hidden = (ui.mode === 'incele' && tool === 'kablo') || (ui.mode === 'sema' && tool === 'port')
      item.setAttribute('aria-pressed', tool === ui.tool ? 'true' : 'false')
      item.setAttribute('aria-disabled', 'false')
    }
    if (!('focusGroup' in HTMLElement.prototype)) {
      const tools = [...document.querySelectorAll('[role="toolbar"] button')]
      const visible = tools.filter((item) => !item.hidden)
      for (const item of tools) if (item.hidden) item.tabIndex = -1
      if (visible.length && !visible.some((item) => item.tabIndex === 0)) {
        visible.forEach((item, index) => { item.tabIndex = index === 0 ? 0 : -1 })
      }
    }
    acili.hidden = ui.mode !== 'sema'
    acili.setAttribute('aria-pressed', ui.schemaTilt ? 'true' : 'false')
    ipucu.textContent = ui.mode === 'sema'
      ? (ui.schemaTilt
        ? 'Açılı bakış açık. Üst üste binen kablolar ayrılır. Boş alanda sürükleyince şema kayar.'
        : 'Üstten bakış. Açılı bakış üst üste kabloları ayırır. Boş alanda sürükleyince şema kayar.')
      : (HINT[ui.tool] || HINT.sec)
    tabs.setMode(ui.mode)

    const showEmpty = ui.mode === 'incele' ? !ui.inspectId : state.components.length === 0
    bos.hidden = !showEmpty
    bos.textContent = ui.mode === 'incele'
      ? 'Porta tıkla. Yeni port için Port işaretle, sonra yüzeye tıkla.'
      : 'Modeli incele, port işaretle, sahneye koy, kablo yerleştir.'

    modeller.replaceChildren()
    for (const model of state.models) {
      const row = document.createElement('li')
      row.className = 'satir-oge'
      const name = button(model.name, () => hooks.onInspect?.(model.id))
      name.setAttribute('aria-pressed', ui.inspectId === model.id ? 'true' : 'false')
      row.append(
        name,
        button('Sahneye koy', () => hooks.onPlace?.(model.id))
      )
      if (!state.components.some((item) => item.modelId === model.id)) {
        row.append(button('Sil', () => hooks.onRemoveModel?.(model.id)))
      }
      modeller.append(row)
    }
    if (state.models.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'not'
      empty.textContent = 'Henüz model yok.'
      modeller.append(empty)
    }

    const picked = selectedComponent(state, ui)
    secilen.hidden = !picked
    bagli.replaceChildren()
    if (picked) {
      const model = state.models.find((item) => item.id === picked.modelId)
      secilenNe.textContent = model?.name || picked.name
      const same = !model || model.name === picked.name
      secilenAd.hidden = same
      secilenAd.textContent = same ? '' : picked.name
      const linked = state.cables.filter((cable) => cable.a.componentId === picked.id || cable.b.componentId === picked.id)
      if (linked.length === 0) {
        const empty = document.createElement('li')
        empty.className = 'not'
        empty.textContent = 'Bağlı kablo yok.'
        bagli.append(empty)
      }
      for (const cable of linked) {
        const other = cable.a.componentId === picked.id ? cable.b : cable.a
        const pair = matchCable(
          portTypeOf(state, cable.a.componentId, cable.a.portId),
          portTypeOf(state, cable.b.componentId, cable.b.portId)
        )
        const bad = portTypeOf(state, cable.a.componentId, cable.a.portId)
          && portTypeOf(state, cable.b.componentId, cable.b.portId)
          && !pair
        const row = document.createElement('li')
        const name = button(
          `${cable.name} → ${componentName(state, other.componentId)} ${portName(state, other.componentId, other.portId)}${bad ? ' · uyumsuz' : ''}`,
          () => hooks.onSelect?.({ kind: 'cable', id: cable.id })
        )
        name.setAttribute('aria-pressed', ui.selection?.kind === 'cable' && ui.selection.id === cable.id ? 'true' : 'false')
        name.addEventListener('pointerenter', () => hooks.onHover?.({ kind: 'cable', cableId: cable.id }))
        name.addEventListener('pointerleave', () => hooks.onHover?.(null))
        row.append(name)
        bagli.append(row)
      }
    }

    const active = document.activeElement
    const typing = secili.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)
    if (!typing) fillInspector(state, ui)
  }

  function fillInspector(state, ui) {
    secili.replaceChildren()
    const chosenPort = ui.selection?.kind === 'port' ? ui.selection : null
    const component = ui.selection?.kind === 'component'
      ? state.components.find((item) => item.id === ui.selection.id)
      : chosenPort && chosenPort.componentId !== 'incele'
        ? state.components.find((item) => item.id === chosenPort.componentId)
        : null
    if (component) {
      const form = document.createElement('div')
      form.className = 'alan-form'
      const nameLabel = document.createElement('label')
      nameLabel.textContent = 'Ad'
      const name = document.createElement('input')
      name.value = component.name
      name.addEventListener('change', () => hooks.onRenameComponent?.(component.id, name.value.trim() || component.name))
      nameLabel.append(name)
      const scaleLabel = document.createElement('label')
      scaleLabel.textContent = 'Ölçek'
      const scale = document.createElement('input')
      scale.type = 'number'
      scale.min = '0.1'
      scale.max = '20'
      scale.step = '0.1'
      scale.value = String(component.scale || 1)
      scale.addEventListener('change', () => hooks.onScale?.(component.id, Number(scale.value)))
      scaleLabel.append(scale)
      form.append(nameLabel, scaleLabel)
      const model = state.models.find((item) => item.id === component.modelId)
      const modelIds = new Set((model?.ports || []).map((port) => port.id))
      const ports = document.createElement('ul')
      for (const port of componentPorts(state, component)) {
        const row = document.createElement('li')
        row.className = 'satir-oge'
        const pick = { kind: 'port', componentId: component.id, portId: port.id }
        const name = button(port.name, () => hooks.onSelect?.(pick))
        name.setAttribute('aria-pressed', chosenPort?.portId === port.id && chosenPort?.componentId === component.id ? 'true' : 'false')
        name.addEventListener('pointerenter', () => hooks.onHover?.(pick))
        name.addEventListener('pointerleave', () => hooks.onHover?.(null))
        const remove = modelIds.has(port.id)
          ? () => hooks.onRemoveModelPort?.(component.modelId, port.id)
          : () => hooks.onRemovePort?.(component.id, port.id)
        row.append(name, button('Sil', remove))
        ports.append(row)
      }
      const actions = document.createElement('div')
      actions.className = 'eylem'
      actions.append(
        button('Çoğalt', () => hooks.onDuplicate?.(component.id)),
        button('Sil', () => hooks.onDeleteComponent?.(component.id))
      )
      secili.append(form, ports, actions)
      return
    }
    if (ui.selection?.kind === 'cable') {
      const cable = state.cables.find((item) => item.id === ui.selection.id)
      if (!cable) return
      const form = document.createElement('div')
      form.className = 'alan-form'
      const nameLabel = document.createElement('label')
      nameLabel.textContent = 'Ad'
      const name = document.createElement('input')
      name.value = cable.name
      name.addEventListener('change', () => hooks.onRenameCable?.(cable.id, name.value.trim() || cable.name))
      nameLabel.append(name)
      const aType = portTypeOf(state, cable.a.componentId, cable.a.portId)
      const bType = portTypeOf(state, cable.b.componentId, cable.b.portId)
      const match = matchCable(aType, bType)
      const kind = document.createElement('p')
      kind.textContent = match
        ? match.name
        : aType && bType
          ? `${typeName(aType)} ile ${typeName(bType)} bağlanmaz.`
          : typeName(cable.type)
      form.append(nameLabel, kind)
      secili.append(form, button('Sil', () => hooks.onDeleteCable?.(cable.id)))
      return
    }
    if (ui.mode === 'incele' && ui.inspectId) {
      const model = state.models.find((item) => item.id === ui.inspectId)
      const head = document.createElement('p')
      head.textContent = model ? `${model.name} portları` : 'Portlar'
      const ports = document.createElement('ul')
      for (const port of model?.ports || []) {
        const row = document.createElement('li')
        row.className = 'satir-oge'
        const pick = { kind: 'port', componentId: 'incele', portId: port.id }
        const name = button(port.name, () => hooks.onSelect?.(pick))
        name.setAttribute('aria-pressed', chosenPort?.portId === port.id ? 'true' : 'false')
        name.addEventListener('pointerenter', () => hooks.onHover?.(pick))
        name.addEventListener('pointerleave', () => hooks.onHover?.(null))
        row.append(name, button('Sil', () => hooks.onRemoveModelPort?.(model.id, port.id)))
        ports.append(row)
      }
      if (!(model?.ports || []).length) {
        const empty = document.createElement('li')
        empty.className = 'not'
        empty.textContent = 'Yüzeye tıklayıp tür seç.'
        ports.append(empty)
      }
      secili.append(head, ports)
      return
    }
    const note = document.createElement('p')
    note.className = 'not'
    note.textContent = ui.mode === 'incele'
      ? 'Porta tıklayınca seçilir. Model görünür kalır.'
      : 'Sahneden bir parça seç.'
    secili.append(note)
  }

  function selectedComponent(state, ui) {
    if (ui.selection?.kind === 'component') {
      return state.components.find((item) => item.id === ui.selection.id) || null
    }
    if (ui.selection?.kind === 'port' && ui.selection.componentId && ui.selection.componentId !== 'incele') {
      return state.components.find((item) => item.id === ui.selection.componentId) || null
    }
    return null
  }

  return {
    render,
    status(text) {
      durum.textContent = text
    },
    askType() {
      return ask(document.getElementById('port-tur'), () => {}).then((value) => (
        value && value !== 'cancel' ? value : null
      ))
    },
    askName(title, value) {
      const dialog = document.getElementById('ad')
      return ask(dialog, () => {
        dialog.querySelector('h2').textContent = title
        const input = dialog.querySelector('input')
        input.value = value
        input.select()
      }).then((value) => (value === 'ok' ? dialog.querySelector('input').value.trim() : null))
    },
    confirm(title, text, ok) {
      const dialog = document.getElementById('onay')
      return ask(dialog, () => {
        dialog.querySelector('h2').textContent = title
        document.getElementById('onay-metin').textContent = text
        document.getElementById('onay-ok').textContent = ok
      }).then((value) => value === 'ok')
    }
  }
}
