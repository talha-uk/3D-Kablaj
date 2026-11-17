import { decimalText, pairCm } from './olcu.js'
import { componentName, componentPorts, matchCable, measureOf, portName, portTypeOf, typeName } from './state.js'
import { bindTabs, bindToolbar } from './keys.js'

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
  const bos = document.getElementById('bos')
  const modeller = document.getElementById('modeller')
  const parcalar = document.getElementById('parcalar')
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
      const inceleOff = tool === 'kablo' || tool === 'sec' || tool === 'tasi' || tool === 'dondur'
      item.hidden = (ui.mode === 'incele' && inceleOff)
        || (ui.mode === 'sema' && tool === 'port')
        || (ui.mode !== 'incele' && tool === 'olcu')
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
    tabs.setMode(ui.mode)

    const showEmpty = ui.mode === 'incele' ? !ui.inspectId : state.components.length === 0
    bos.hidden = !showEmpty
    bos.textContent = ui.mode === 'incele'
      ? 'Soldan bir model seç. Port işaretle veya ölçü noktası sağ paneli açar.'
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

    parcalar.replaceChildren()
    if (state.components.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'not'
      empty.textContent = 'Henüz parça yok.'
      parcalar.append(empty)
    }
    for (const component of state.components) {
      const block = document.createElement('li')
      const model = state.models.find((item) => item.id === component.modelId)
      const title = button(component.name, () => hooks.onSelect?.({ kind: 'component', id: component.id }))
      const pickedPart = selectedComponent(state, ui)?.id === component.id
      title.setAttribute('aria-pressed', pickedPart ? 'true' : 'false')
      title.addEventListener('pointerenter', () => hooks.onHover?.({ kind: 'component', componentId: component.id }))
      title.addEventListener('pointerleave', () => hooks.onHover?.(null))
      block.append(title)
      if (model && model.name !== component.name) {
        const kind = document.createElement('p')
        kind.className = 'not'
        kind.textContent = model.name
        block.append(kind)
      }
      const ports = componentPorts(state, component)
      if (ports.length) {
        const line = document.createElement('p')
        line.className = 'not'
        line.textContent = ports.map((port) => port.name).join(', ')
        block.append(line)
      }
      const linked = state.cables.filter((cable) => cable.a.componentId === component.id || cable.b.componentId === component.id)
      if (linked.length) {
        const list = document.createElement('ul')
        for (const cable of linked) {
          const other = cable.a.componentId === component.id ? cable.b : cable.a
          const pair = matchCable(
            portTypeOf(state, cable.a.componentId, cable.a.portId),
            portTypeOf(state, cable.b.componentId, cable.b.portId)
          )
          const bad = portTypeOf(state, cable.a.componentId, cable.a.portId)
            && portTypeOf(state, cable.b.componentId, cable.b.portId)
            && !pair
          const row = document.createElement('li')
          const cm = hooks.cableLength?.(cable)
          const name = button(
            `${cable.name} → ${componentName(state, other.componentId)} ${portName(state, other.componentId, other.portId)}${cm == null ? '' : ` · ${cm.toFixed(1)} cm`}${bad ? ' · uyumsuz' : ''}`,
            () => hooks.onSelect?.({ kind: 'cable', id: cable.id })
          )
          name.setAttribute('aria-pressed', ui.selection?.kind === 'cable' && ui.selection.id === cable.id ? 'true' : 'false')
          name.addEventListener('pointerenter', () => hooks.onHover?.({ kind: 'cable', cableId: cable.id }))
          name.addEventListener('pointerleave', () => hooks.onHover?.(null))
          row.append(name)
          list.append(row)
        }
        block.append(list)
      }
      parcalar.append(block)
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
    if (ui.mode === 'incele') {
      appendInspect(state, ui, chosenPort)
      return
    }
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
      scale.max = '1000'
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
      const cm = hooks.cableLength?.(cable)
      const length = document.createElement('p')
      length.className = 'not'
      length.textContent = cm == null ? 'Boy: ölçü yok' : `Boy: ${cm.toFixed(1)} cm`
      secili.append(form, length, button('Sil', () => hooks.onDeleteCable?.(cable.id)))
      return
    }
    appendInspect(state, ui, chosenPort)
  }

  function appendInspect(state, ui, chosenPort) {
    if (ui.mode !== 'incele' || !ui.inspectId) return
    const model = state.models.find((item) => item.id === ui.inspectId)
    if (!model) return
    const name = document.createElement('p')
    name.className = 'secili-ad'
    name.textContent = model.name
    secili.append(name)
    if (ui.tool === 'port') secili.append(portList(model, chosenPort))
    if (ui.tool === 'olcu') secili.append(measurePanel(state, ui, model))
  }

  const sectionOpen = new Map()

  function disclosure(id, title, ...nodes) {
    const details = document.createElement('details')
    details.className = 'bolum'
    details.open = sectionOpen.has(id) ? sectionOpen.get(id) : true
    details.addEventListener('toggle', () => {
      sectionOpen.set(id, details.open)
    })
    const summary = document.createElement('summary')
    summary.textContent = title
    details.append(summary, ...nodes)
    return details
  }

  function bindDecimal(input) {
    input.type = 'text'
    input.inputMode = 'decimal'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.addEventListener('beforeinput', (event) => {
      if (!event.data) return
      if (!/^[0-9.,]$/.test(event.data)) {
        event.preventDefault()
        return
      }
      const start = input.selectionStart ?? input.value.length
      const end = input.selectionEnd ?? input.value.length
      const next = decimalText(input.value.slice(0, start) + event.data + input.value.slice(end))
      const current = decimalText(input.value)
      if ((next.match(/\./g) || []).length > 1 || next === current && /[.,]/.test(event.data)) event.preventDefault()
    })
    input.addEventListener('input', () => {
      const next = decimalText(input.value)
      if (input.value !== next) input.value = next
    })
  }

  function readDecimal(value) {
    const text = decimalText(value)
    if (!text || text === '.') return null
    const next = Number(text)
    return Number.isFinite(next) && next > 0 ? next : null
  }

  function cmInput(label, value, onValue, id) {
    const wrap = document.createElement('label')
    wrap.htmlFor = id
    wrap.textContent = label
    const input = document.createElement('input')
    input.id = id
    bindDecimal(input)
    input.value = value ?? ''
    input.addEventListener('change', () => onValue(readDecimal(input.value)))
    wrap.append(input)
    return wrap
  }

  function portList(model, chosenPort) {
    const ports = document.createElement('ul')
    for (const port of model.ports || []) {
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
    return disclosure('portlar', 'Portlar', ports)
  }

  function measurePanel(state, ui, model) {
    const olcu = measureOf(model)
    const fit = hooks.fitOf?.(model.id)
    const box = document.createElement('div')
    box.className = 'alan-form'
    const kenar = olcu.kenar
    const save = (patch) => hooks.onOlcu?.(model.id, { ...olcu, ...patch })
    const hedefButton = (hedef, label) => {
      const item = button(label, () => hooks.onOlcuHedef?.(hedef))
      item.setAttribute('aria-pressed', ui.olcuHedef === hedef ? 'true' : 'false')
      return item
    }
    const merkez = document.createElement('div')
    merkez.className = 'olcu-satir olcu-merkez'
    const merkezRenk = document.createElement('span')
    merkezRenk.className = 'olcu-renk'
    merkezRenk.style.background = '#f5f5f4'
    merkezRenk.setAttribute('aria-hidden', 'true')
    const merkezAd = document.createElement('span')
    merkezAd.textContent = 'Merkez'
    const merkezBtn = hedefButton('merkez', 'Nokta')
    merkezBtn.setAttribute('aria-label', 'Merkez belirle')
    merkez.append(merkezRenk, merkezAd, merkezBtn)
    const axes = [
      ['en', 'En', 'olcu-en', '#e10600'],
      ['boy', 'Boy', 'olcu-boy', '#16a34a'],
      ['derinlik', 'Derinlik', 'olcu-derinlik', '#2563eb']
    ]
    const group = document.createElement('div')
    group.className = 'eksenler'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', 'En, boy ve derinlik')
    for (const [key, label, id, color] of axes) {
      const row = document.createElement('div')
      row.className = 'olcu-satir'
      const swatch = document.createElement('span')
      swatch.className = 'olcu-renk'
      swatch.style.background = color
      swatch.setAttribute('aria-hidden', 'true')
      const name = document.createElement('label')
      name.htmlFor = id
      name.textContent = label
      const pick = hedefButton(key, 'Nokta')
      pick.setAttribute('aria-label', `${label} noktası`)
      const unit = document.createElement('span')
      unit.className = 'olcu-cm'
      const input = document.createElement('input')
      input.id = id
      bindDecimal(input)
      input.value = olcu[key] ?? ''
      input.addEventListener('change', () => save({ [key]: readDecimal(input.value) }))
      const cm = document.createElement('span')
      cm.textContent = 'cm'
      cm.setAttribute('aria-hidden', 'true')
      unit.append(input, cm)
      row.append(swatch, name, pick, unit)
      group.append(row)
    }
    box.append(disclosure('olcu', 'Ölçü', merkez, group))
    const cift = {
      a: Array.isArray(olcu.cift?.a) ? olcu.cift.a : null,
      b: Array.isArray(olcu.cift?.b) ? olcu.cift.b : null,
      cm: olcu.cift?.cm ?? null,
      color: olcu.cift?.color || '#2f8f4e',
      snap: olcu.cift?.snap || 'yuzey',
      plane: olcu.cift?.plane || null,
      y: olcu.cift?.y ?? null
    }
    const modes = document.createElement('div')
    modes.className = 'olcu-mod'
    modes.setAttribute('role', 'group')
    modes.setAttribute('aria-label', 'Referans')
    for (const [id, label] of [['kose', 'Köşe'], ['kenar', 'Kenar'], ['yuzey', 'Yüzey']]) {
      const item = button(label, () => hooks.onOlcuPair?.(model.id, { ...olcu, cift: { ...cift, snap: id } }))
      item.setAttribute('aria-pressed', cift.snap === id ? 'true' : 'false')
      modes.append(item)
    }
    const distance = button('Mesafe ölç', () => hooks.onOlcuHedef?.('mesafe'))
    distance.className = 'olcu-mesafe'
    distance.setAttribute('aria-pressed', ui.olcuHedef === 'a' || ui.olcuHedef === 'b' ? 'true' : 'false')
    const remove = button('Kaldır', () => {
      hooks.onOlcuPair?.(model.id, {
        ...olcu,
        cift: { ...cift, a: null, b: null, plane: null, y: null }
      })
    })
    remove.disabled = !cift.a && !cift.b
    const actions = document.createElement('div')
    actions.className = 'olcu-cift-eylem'
    actions.append(distance, remove)
    const pairBody = [modes, actions]
    if (fit && cift.a && cift.b && model.olcek) {
      const live = document.createElement('p')
      live.className = 'olcu-aralik'
      const now = pairCm(cift.a, cift.b, fit.s, model.olcek)
      live.textContent = `İki nokta arası ${now.toFixed(1)} cm`
      pairBody.push(live)
    }
    box.append(disclosure('cift', 'İki nokta', ...pairBody))
    return box
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

  const bakis = [...document.querySelectorAll('#bakis span')]

  return {
    render,
    setAngles(angles) {
      angles.forEach((angle, index) => {
        if (bakis[index]) bakis[index].textContent = `${angle}°`
      })
    },
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
