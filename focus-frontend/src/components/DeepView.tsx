import { useEffect, useRef, useState } from 'react'

export interface DeepMeta {
  shape: [number, number]; pix_arcsec: number; oversample: number
  bands: Record<string, { lam_um: [number, number]; n_frames: number; single_frame_noise: number; deep_noise: number; noise_gain: number }>
}

interface Props { baseUrl: string; boxArcsec?: number; height?: number }

/** Deep colour image of the wide field: every SPHEREx exposure of the area, aligned and stacked per wavelength band. */
export default function DeepView({ baseUrl, boxArcsec, height = 520 }: Props) {
  const [meta, setMeta] = useState<DeepMeta | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    setMeta(null); setFailed(false); setZoom(1); setPan({ x: 0, y: 0 })
    fetch(baseUrl + 'deep.json').then(r => r.ok ? r.json() : Promise.reject()).then(setMeta).catch(() => setFailed(true))
  }, [baseUrl])

  if (failed) return null
  if (!meta) return <div className="deep-view loading" style={{ height }}>Loading the deep image…</div>
  const [H, W] = meta.shape
  const sizeArcmin = (W * meta.pix_arcsec) / 60
  const box = boxArcsec ? (boxArcsec / meta.pix_arcsec) / W : 0
  const gains = Object.values(meta.bands).map(b => b.noise_gain)
  const frames = Object.values(meta.bands).reduce((n, b) => n + b.n_frames, 0)

  return <figure className="deep-view">
    <div className="deep-stage" style={{ height }}
      onWheel={e => { e.preventDefault(); setZoom(z => Math.min(12, Math.max(1, z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))) }}
      onDoubleClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
      onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; (e.target as Element).setPointerCapture?.(e.pointerId) }}
      onPointerMove={e => { const d = drag.current; if (d) setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) }) }}
      onPointerUp={() => { drag.current = null }}>
      <div className="deep-layer" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <img src={baseUrl + 'deep_rgb.png'} alt="Deep colour image of the field" draggable={false} />
        {box > 0 && <span className="deep-box" style={{ width: box * 100 + '%', height: box * 100 + '%' }} />}
      </div>
      <div className="deep-zoom">
        <button onClick={() => setZoom(z => Math.min(12, z * 1.5))} aria-label="Zoom in">+</button>
        <button onClick={() => setZoom(z => Math.max(1, z / 1.5))} aria-label="Zoom out">−</button>
      </div>
    </div>
    <figcaption>
      <strong>{sizeArcmin.toFixed(0)}′ × {sizeArcmin.toFixed(0)}′ of sky, {frames} SPHEREx exposures combined.</strong>{' '}
      Colours are real infrared bands: blue 0.7–1.6 µm, green 1.6–3 µm, red 3–5 µm. Stacking lowers the noise
      {' '}{Math.round(Math.min(...gains))}–{Math.round(Math.max(...gains))}× compared with one exposure.
      {meta.oversample > 1 && <> Each exposure lands on the sky slightly shifted, so we drizzle them onto pixels {meta.pix_arcsec.toFixed(1)}″ wide, twice as fine as SPHEREx’s own: in Barnard’s field the stars came out about a third narrower.</>}
      {box > 0 && ' The square marks the frames shown in the time viewer.'} Scroll to zoom, drag to move, double-click to reset.
    </figcaption>
  </figure>
}
