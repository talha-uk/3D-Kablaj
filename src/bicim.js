export function dosyaUygun(name) {
  const file = String(name || '').toLowerCase()
  return file.endsWith('.glb') || file.endsWith('.sldprt')
}
