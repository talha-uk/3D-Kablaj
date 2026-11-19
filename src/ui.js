import { modelSolid } from './state.js'
import { decimalText, pairCm } from './olcu.js'
import { cableCins, cableLinked, componentName, componentPorts, matchCable, measureOf, parcaKaydi, portCins, portHasGender, portName, portTypeOf, typeName } from './state.js'
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
  const tabs = bindTabs(document.getElementById('gorunum-sekme'), hooks.onMode)
  bindToolbar(document.querySelector('[role="toolbar"]'))
  const durum = document.getElementById('durum')
  const bos = document.getElementById('bos')
  const hiyerarsi = document.getElementById('hiyerarsi')
  const gorunum = document.getElementById('gorunum')
  const secili = document.getElementById('secili')
  const projeAd = document.getElementById('proje-ad')
  const dosya = document.getElementById('dosya')
  const jsonDosya = document.getElementById('json-dosya')
  const kutuphane = document.getElementById('kutuphane')
  const ekran = document.getElementById('ekran')

  document.getElementById('yukle').addEventListener('click', () => dosya.click())
  document.getElementById('parca-ekle').addEventListener('click', () => hooks.onAddParca?.())
  const parcaDialog = document.getElementById('parca')
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    parcaDialog.addEventListener('click', (event) => {
      if (event.target !== parcaDialog) return
      const rect = parcaDialog.getBoundingClientRect()
      const inside = rect.top <= event.clientY && event.clientY <= rect.bottom
        && rect.left <= event.clientX && event.clientX <= rect.right
      if (!inside) parcaDialog.close()
    })
  }
  parcaDialog.querySelector('form').addEventListener('submit', (event) => {
    if (event.submitter?.value !== 'ok') return
    const filled = [...parcaDialog.querySelectorAll('input[name="alan"]')].some((input) => input.value.trim())
    if (filled) {
      document.getElementById('parca-hata').textContent = ''
      return
    }
    event.preventDefault()
    const hata = document.getElementById('parca-hata')
    hata.textContent = 'En az bir alan yaz. Örneğin dBm veya MHz.'
    parcaDialog.querySelector('input[name="alan"]')?.focus()
  })
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
      if (event.target.closest('#gorunum')) return
      hooks.onUpload?.(event.dataTransfer.files)
    })
  }
  gorunum.addEventListener('dragover', (event) => {
    const types = [...event.dataTransfer.types]
    if (!types.includes('Files') && !types.includes('application/x-kablaj-model')) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    gorunum.classList.add('birak')
  })
  gorunum.addEventListener('dragleave', () => gorunum.classList.remove('birak'))
  gorunum.addEventListener('drop', (event) => {
    event.preventDefault()
    event.stopPropagation()
    gorunum.classList.remove('birak')
    ekran.classList.remove('birak')
    const modelId = event.dataTransfer.getData('application/x-kablaj-model')
    if (modelId) {
      hooks.onPlace?.(modelId)
      return
    }
    hooks.onUpload?.(event.dataTransfer.files)
  })

  function render(state, ui) {
    if (document.activeElement !== projeAd) projeAd.value = state.name
    for (const item of document.querySelectorAll('[data-tool]')) {
      const tool = item.dataset.tool
      const inceleOff = tool === 'kablo' || tool === 'sec' || tool === 'tasi' || tool === 'dondur'
      item.hidden = (ui.mode === 'incele' && inceleOff)
        || (ui.mode !== 'incele' && tool === 'port')
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
      : 'Modeli hiyerarşiden sahneye sürükle.'
    drawHierarchy(state, ui)

    const active = document.activeElement
    const typing = secili.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)
    if (!typing) fillInspector(state, ui)
  }

  function parcaFields(state, parcaId, { values = null, onPick, onValue } = {}) {
    const form = document.createElement('form')
    form.className = 'alan-form'
    form.addEventListener('submit', (event) => event.preventDefault())
    const fieldset = document.createElement('fieldset')
    const legend = document.createElement('legend')
    legend.textContent = 'Parça'
    const selectLabel = document.createElement('label')
    selectLabel.textContent = 'Kayıt'
    const select = document.createElement('select')
    select.name = 'parca'
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = 'Yok'
    select.append(empty)
    for (const item of state.kutuphane || []) {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.ad
      select.append(option)
    }
    select.value = (state.kutuphane || []).some((item) => item.id === parcaId) ? parcaId : ''
    select.addEventListener('change', () => onPick?.(select.value))
    selectLabel.append(select)
    fieldset.append(legend, selectLabel)
    const parca = (state.kutuphane || []).find((item) => item.id === select.value)
    if (parca && values) {
      parca.alanlar.forEach((alan, index) => {
        const id = `deger-${index}-${alan.replace(/\s+/g, '-')}`
        const label = document.createElement('label')
        label.htmlFor = id
        label.textContent = alan
        const input = document.createElement('input')
        input.id = id
        input.name = alan
        input.type = 'text'
        input.autocomplete = 'off'
        input.spellcheck = false
        input.setAttribute('autocorrect', 'off')
        input.setAttribute('autocapitalize', 'none')
        input.value = values[alan] || ''
        input.addEventListener('change', () => onValue?.(alan, input.value.trim()))
        label.append(input)
        fieldset.append(label)
      })
    }
    form.append(fieldset)
    return form
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
      form.append(nameLabel)
      form.append(parcaFields(state, component.parcaId, {
        values: component.degerler || {},
        onPick: (parcaId) => hooks.onComponentParca?.(component.id, parcaId),
        onValue: (alan, value) => hooks.onComponentDeger?.(component.id, alan, value)
      }))
      const model = state.models.find((item) => item.id === component.modelId)
      const modelIds = new Set((model?.ports || []).map((port) => port.id))
      const ports = document.createElement('ul')
      for (const port of componentPorts(state, component)) {
        const row = document.createElement('li')
        row.className = 'satir-oge'
        const pick = { kind: 'port', componentId: component.id, portId: port.id }
        const name = button(portLabel(port), () => hooks.onSelect?.(pick))
        name.setAttribute('aria-pressed', chosenPort?.portId === port.id && chosenPort?.componentId === component.id ? 'true' : 'false')
        name.addEventListener('pointerenter', () => hooks.onHover?.(pick))
        name.addEventListener('pointerleave', () => hooks.onHover?.(null))
        const remove = modelIds.has(port.id)
          ? () => hooks.onRemoveModelPort?.(component.modelId, port.id)
          : () => hooks.onRemovePort?.(component.id, port.id)
        row.append(name, button('Sil', remove))
        if (chosenPort?.portId === port.id && chosenPort?.componentId === component.id) row.append(gorevField(port))
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
      const flow = document.createElement('p')
      flow.className = 'not'
      flow.textContent = cableLinked(aType, bType, cable.type)
        ? 'Sinyal kablo boyunca karşı uca ulaşıyor.'
        : 'Sinyal yarı yolda sönüyor.'
      secili.append(form, length, flow, button('Sil', () => hooks.onDeleteCable?.(cable.id)))
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
    const parca = (state.kutuphane || []).find((item) => item.id === model.parcaId)
    const picked = parcaFields(state, model.parcaId, {
      onPick: (parcaId) => hooks.onModelParca?.(model.id, parcaId)
    })
    const hint = document.createElement('p')
    hint.className = 'not'
    hint.textContent = parca
      ? `Sahneye her koyuşta ${parca.alanlar.join(', ')} sorulur.`
      : 'Kütüphaneden bir parça seç. Sahneye her koyuşta o alanlar gelir.'
    picked.append(hint)
    secili.append(picked)
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

  function portLabel(port) {
    return port.gorev ? `${port.name} · ${port.gorev}` : port.name
  }

  function gorevField(port) {
    const wrap = document.createElement('div')
    wrap.className = 'alan-form'
    const id = `gorev-${port.id}`
    const noteId = `gorev-not-${port.id}`
    const label = document.createElement('label')
    label.htmlFor = id
    label.textContent = 'Görev'
    const input = document.createElement('input')
    input.id = id
    input.name = 'gorev'
    input.type = 'text'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.setAttribute('autocorrect', 'off')
    input.setAttribute('autocapitalize', 'none')
    input.setAttribute('aria-describedby', noteId)
    input.value = port.gorev || ''
    input.addEventListener('change', () => hooks.onPortGorev?.(port.id, input.value.trim()))
    label.append(input)
    const note = document.createElement('p')
    note.id = noteId
    note.className = 'not'
    note.textContent = 'GPS, 2.4/5.8 GHz, Rx, Tx'
    wrap.append(label, note)
    return wrap
  }

  function genderField(port) {
    const field = document.createElement('fieldset')
    field.className = 'uc'
    const legend = document.createElement('legend')
    legend.textContent = 'Uç'
    field.append(legend)
    const current = portCins(port)
    for (const [value, label] of [['disi', 'Dişi'], ['erkek', 'Erkek']]) {
      const lab = document.createElement('label')
      const input = document.createElement('input')
      input.type = 'radio'
      input.name = `cins-${port.id}`
      input.value = value
      input.checked = current === value
      input.addEventListener('change', () => {
        if (input.checked) hooks.onPortCins?.(port.id, value)
      })
      lab.append(input, document.createTextNode(` ${label}`))
      field.append(lab)
    }
    const note = document.createElement('p')
    note.className = 'not'
    note.textContent = cableCins(port) === 'erkek'
      ? 'Kablo bu yuvaya erkek uçla gelir.'
      : 'Kablo bu yuvaya dişi uçla gelir.'
    field.append(note)
    return field
  }

  function portList(model, chosenPort) {
    const ports = document.createElement('ul')
    for (const port of model.ports || []) {
      const row = document.createElement('li')
      row.className = 'satir-oge'
      const pick = { kind: 'port', componentId: 'incele', portId: port.id }
      const name = button(portLabel(port), () => hooks.onSelect?.(pick))
      name.setAttribute('aria-pressed', chosenPort?.portId === port.id ? 'true' : 'false')
      name.addEventListener('pointerenter', () => hooks.onHover?.(pick))
      name.addEventListener('pointerleave', () => hooks.onHover?.(null))
      row.append(name, button('Sil', () => hooks.onRemoveModelPort?.(model.id, port.id)))
      if (chosenPort?.portId === port.id) {
        row.append(gorevField(port))
        if (portHasGender(port.type)) row.append(genderField(port))
      }
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
    const removeMerkez = button('Kaldır', () => {
      save({ kenar: { merkez: null, en: null, boy: null, derinlik: null } })
    })
    removeMerkez.setAttribute('aria-label', 'Merkez noktasını kaldır')
    removeMerkez.disabled = !kenar.merkez
    merkez.append(merkezRenk, merkezAd, merkezBtn, removeMerkez)
    const autoLabel = document.createElement('label')
    autoLabel.className = 'olcu-oto'
    autoLabel.htmlFor = 'olcu-otomatik'
    const auto = document.createElement('input')
    auto.type = 'checkbox'
    auto.id = 'olcu-otomatik'
    auto.checked = Boolean(olcu.otomatik)
    auto.addEventListener('change', () => save({ otomatik: auto.checked }))
    const autoText = document.createElement('span')
    autoText.textContent = 'Merkeze göre otomatik'
    autoLabel.append(auto, autoText)
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
    if (!modelSolid(model)) box.append(disclosure('olcu', 'Ölçü', merkez, autoLabel, group))
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
    if (fit && cift.a && cift.b) {
      const live = document.createElement('p')
      live.className = 'olcu-aralik'
      const now = pairCm(cift.a, cift.b, fit.s, 1)
      live.textContent = `İki nokta arası ${now.toFixed(1)} cm`
      pairBody.push(live)
    }
    box.append(disclosure('cift', 'İki nokta', ...pairBody))
    return box
  }

  const treeOpen = new Map()
  let shown = null

  function drawHierarchy(state, ui) {
    shown = { state, ui }
    hiyerarsi.replaceChildren()
    const modelRows = state.models.map((model) => treeItem({
      id: `model:${model.id}`,
      label: model.boyut ? `${model.name} · ${model.boyut}` : model.name,
      depth: 1,
      kind: 'model',
      selected: ui.inspectId === model.id && ui.mode === 'incele',
      modelId: model.id,
      onActivate: () => hooks.onInspect?.(model.id),
      extra: state.components.some((item) => item.modelId === model.id)
        ? null
        : removeButton(() => hooks.onRemoveModel?.(model.id))
    }))
    if (!modelRows.length) modelRows.push(noteItem('GLB veya .sldprt dosyasını buraya bırak.', 1))
    const sceneRows = state.components.map((component) => {
      const children = []
      for (const port of componentPorts(state, component)) {
        const chosen = ui.selection?.kind === 'port'
          && ui.selection.portId === port.id
          && ui.selection.componentId === component.id
        children.push(treeItem({
          id: `port:${component.id}:${port.id}`,
          label: portLabel(port),
          depth: 2,
          kind: 'port',
          selected: Boolean(chosen),
          onActivate: () => hooks.onSelect?.({ kind: 'port', componentId: component.id, portId: port.id }),
          hover: { kind: 'port', componentId: component.id, portId: port.id }
        }))
      }
      for (const cable of state.cables.filter((item) => item.a.componentId === component.id || item.b.componentId === component.id)) {
        const other = cable.a.componentId === component.id ? cable.b : cable.a
        const pair = matchCable(
          portTypeOf(state, cable.a.componentId, cable.a.portId),
          portTypeOf(state, cable.b.componentId, cable.b.portId)
        )
        const bad = portTypeOf(state, cable.a.componentId, cable.a.portId)
          && portTypeOf(state, cable.b.componentId, cable.b.portId)
          && !pair
        const cm = hooks.cableLength?.(cable)
        children.push(treeItem({
          id: `cable:${component.id}:${cable.id}`,
          label: `${cable.name} → ${componentName(state, other.componentId)}${cm == null ? '' : ` · ${cm.toFixed(1)} cm`}${bad ? ' · uyumsuz' : ''}`,
          depth: 2,
          kind: 'kablo',
          selected: ui.selection?.kind === 'cable' && ui.selection.id === cable.id,
          onActivate: () => hooks.onSelect?.({ kind: 'cable', id: cable.id }),
          hover: { kind: 'cable', cableId: cable.id }
        }))
      }
      return treeItem({
        id: `parca:${component.id}`,
        label: component.name,
        depth: 1,
        kind: 'parca',
        selected: ui.selection?.kind === 'component' && ui.selection.id === component.id,
        onActivate: () => hooks.onSelect?.({ kind: 'component', id: component.id }),
        hover: { kind: 'component', componentId: component.id },
        children
      })
    })
    if (!sceneRows.length) sceneRows.push(noteItem('Modeli sahneye sürükle.', 1))
    const libraryRows = (state.kutuphane || []).map((parca) => treeItem({
      id: `kutup:${parca.id}`,
      label: `${parca.ad} · ${parca.alanlar.join(', ')}`,
      depth: 1,
      kind: 'kutup',
      onActivate: () => hooks.onUseParca?.(parca.id),
      extra: removeButton(() => hooks.onRemoveParca?.(parca.id))
    }))
    if (!libraryRows.length) libraryRows.push(noteItem('+ ile ad ve alan kaydet. Örneğin dBm, MHz.', 1))
    hiyerarsi.append(
      treeItem({ id: 'grup:kutuphane', label: 'Parça kütüphanesi', depth: 0, kind: 'grup', children: libraryRows }),
      treeItem({ id: 'grup:modeller', label: 'Modeller', depth: 0, kind: 'grup', children: modelRows }),
      treeItem({ id: 'grup:sahne', label: 'Sahne', depth: 0, kind: 'grup', children: sceneRows })
    )
  }

  function noteItem(text, depth) {
    const li = document.createElement('li')
    li.className = 'not agac-bos'
    li.style.paddingInlineStart = `${0.7 + depth * 0.9}rem`
    li.textContent = text
    return li
  }

  function removeButton(onClick) {
    const item = button('Sil', onClick)
    item.className = 'agac-sil'
    return item
  }

  function treeItem({ id, label, depth, kind, selected, modelId, onActivate, hover, extra, children = [] }) {
    const hasChildren = children.length > 0
    const open = hasChildren ? (treeOpen.has(id) ? treeOpen.get(id) : true) : false
    const li = document.createElement('li')
    li.setAttribute('role', 'treeitem')
    if (selected) li.setAttribute('aria-selected', 'true')
    if (hasChildren) li.setAttribute('aria-expanded', open ? 'true' : 'false')
    const row = document.createElement('div')
    row.className = 'agac-satir'
    if (selected) row.classList.add('secili')
    row.style.paddingInlineStart = `${0.3 + depth * 0.9}rem`
    const twist = document.createElement('button')
    twist.type = 'button'
    twist.className = 'agac-ok'
    twist.tabIndex = -1
    if (!hasChildren) {
      twist.disabled = true
      twist.setAttribute('aria-hidden', 'true')
    } else {
      twist.setAttribute('aria-expanded', open ? 'true' : 'false')
      twist.setAttribute('aria-label', open ? 'Daralt' : 'Genişlet')
      twist.addEventListener('click', (event) => {
        event.stopPropagation()
        treeOpen.set(id, !open)
        if (shown) drawHierarchy(shown.state, shown.ui)
      })
    }
    const icon = document.createElement('span')
    icon.className = `agac-ikon ${kind}`
    icon.setAttribute('aria-hidden', 'true')
    const name = button(label, () => onActivate?.())
    name.className = 'agac-ad'
    if (hover) {
      name.addEventListener('pointerenter', () => hooks.onHover?.(hover))
      name.addEventListener('pointerleave', () => hooks.onHover?.(null))
    }
    row.append(twist, icon, name)
    if (extra) row.append(extra)
    if (modelId) {
      row.draggable = true
      row.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('application/x-kablaj-model', modelId)
        event.dataTransfer.effectAllowed = 'copy'
      })
    }
    li.append(row)
    if (hasChildren && open) {
      const list = document.createElement('ul')
      list.setAttribute('role', 'group')
      list.append(...children)
      li.append(list)
    }
    return li
  }

  const bakis = [...document.querySelectorAll('#bakis span')]

  return {
    render,
    setAngles(angles) {
      angles.forEach((angle, index) => {
        if (bakis[index]) bakis[index].textContent = `${angle}°`
      })
    },
    setSpeed(text) {
      const node = document.getElementById('hiz')
      if (node) node.textContent = text
    },
    status(text) {
      durum.textContent = text
    },
    askType() {
      return ask(document.getElementById('port-tur'), () => {}).then((value) => (
        value && value !== 'cancel' ? value : null
      ))
    },
    askParca() {
      const dialog = document.getElementById('parca')
      const list = document.getElementById('parca-alanlar')
      const addRow = () => {
        const row = document.createElement('div')
        row.className = 'parca-alan'
        const id = `alan-${crypto.randomUUID()}`
        const label = document.createElement('label')
        label.htmlFor = id
        label.textContent = 'Alan'
        const input = document.createElement('input')
        input.id = id
        input.name = 'alan'
        input.type = 'text'
        input.autocomplete = 'off'
        input.spellcheck = false
        input.setAttribute('autocorrect', 'off')
        input.setAttribute('autocapitalize', 'none')
        input.enterKeyHint = 'next'
        const remove = button('Sil', () => {
          if (list.children.length === 1) {
            input.value = ''
            input.focus()
            return
          }
          row.remove()
        })
        label.append(input)
        row.append(label, remove)
        list.append(row)
        return input
      }
      document.getElementById('parca-alan-ekle').onclick = () => addRow().focus()
      return ask(dialog, () => {
        document.getElementById('parca-hata').textContent = ''
        document.getElementById('parca-ad').value = ''
        list.replaceChildren()
        addRow()
      }).then((value) => {
        if (value !== 'ok') return null
        const alanlar = [...list.querySelectorAll('input[name="alan"]')].map((input) => input.value)
        return parcaKaydi(document.getElementById('parca-ad').value, alanlar)
      })
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
