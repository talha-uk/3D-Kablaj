export const BICIM = {
  glb: { ad: 'GLB', uzanti: '.glb', accept: '.glb,model/gltf-binary' },
  solid: { ad: 'Solid', uzanti: '.sldprt', accept: '.sldprt,.SLDPRT' }
}

export function bicimKaydi(bicim) {
  return BICIM[bicim] || BICIM.glb
}

export function dosyaUygun(name, bicim) {
  const uzanti = bicimKaydi(bicim).uzanti
  return String(name || '').toLowerCase().endsWith(uzanti)
}
