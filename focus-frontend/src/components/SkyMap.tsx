import { useEffect, useRef, useState } from 'react'

/** SPHEREx DR1 all-sky map served by IRSA (HiPS, CORS open). */
export const SPHEREX_HIPS = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube'

export interface SkyMark { id: string; title: string; ra: number; dec: number }
interface Props {
  ra: number; dec: number; fovDeg: number; allSky?: boolean; height?: number | string
  marks?: SkyMark[]; box?: { ra: number; dec: number; sizeDeg: number }; onSelect?: (id: string) => void
  /** Field to fly to; changing it animates the view. */
  focus?: { ra: number; dec: number } | null
  caption?: boolean
  /** Our deep HiPS layers (stacked SPHEREx exposures), drawn over the all-sky map. */
  mosaics?: string[]
  /** Pixels on the right covered by a panel; fly-to targets land in the visible part. */
  inset?: number
  /** Closest zoom allowed, degrees; defaults to MIN_FOV (the public map's limit). */
  minFov?: number
  /** Text of the button that returns to the starting view. */
  resetLabel?: string
}

// The public map stops at 12.9″ pixels; below a degree it turns to blocks except where our deep images sit.
export const MIN_FOV = 0.2
const FOCUS_FOV = 0.7
let loader: Promise<any> | null = null
const rad = Math.PI / 180
const sep = (ra1: number, de1: number, ra2: number, de2: number) =>
  Math.acos(Math.min(1, Math.sin(de1 * rad) * Math.sin(de2 * rad) + Math.cos(de1 * rad) * Math.cos(de2 * rad) * Math.cos((ra1 - ra2) * rad))) / rad
const loadAladin = () => (loader ??= import('aladin-lite').then(async m => { const A = m.default; await A.init; return A }))

export default function SkyMap({ ra, dec, fovDeg, allSky, height = 300, marks, box, onSelect, focus, caption = true, mosaics, inset = 0, minFov = MIN_FOV, resetLabel = 'Whole sky' }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [zoomed, setZoomed] = useState(false)
  const select = useRef(onSelect)
  select.current = onSelect
  const marksKey = marks?.map(m => m.id).join(',')
  const deepKey = mosaics?.join(',')

  useEffect(() => {
    let alive = true, al: any = null
    setState('loading')
    loadAladin().then(A => {
      if (!alive || !el.current) return
      al = A.aladin(el.current, {
        survey: SPHEREX_HIPS, fov: fovDeg, target: `${ra} ${dec}`, cooFrame: 'ICRS', log: false, projection: allSky ? 'AIT' : 'SIN',
        showReticle: false, showLayersControl: false, showProjectionControl: false, showFrame: false,
        showCooGridControl: false, showSimbadPointerControl: false, showFullscreenControl: false,
        showZoomControl: true, showContextMenu: false, showStatusBar: false, showCooLocation: false, showCooGrid: !!allSky,
        gridOptions: { color: '#ffd38a', opacity: 0.18, showLabels: false, thickness: 1 },
      })
      map.current = al
      const hips = A.HiPS(SPHEREX_HIPS, { name: 'SPHEREx DR1 all-sky', imgFormat: 'png', cooFrame: 'equatorial', maxOrder: 5 })
      al.setBaseImageLayer(hips)
      // False colour reads well for the whole sky; close up, grey sits better next to our true-colour mosaics.
      let grey = false
      const tint = (fov: number) => {
        const want = fov < 6
        if (want === grey) return
        grey = want
        try { hips.setColormap(want ? 'grayscale' : 'inferno', { stretch: 'asinh' }); hips.setCuts(want ? 105 : 0, 255) } catch { /* older builds */ }
        if (allSky) { try { if (want) al.hideCooGrid(); else al.showCooGrid() } catch { /* no grid API */ } }
      }
      try { hips.setColormap('inferno', { stretch: 'asinh' }) } catch { /* older builds: keep grey */ }
      // Our stacks remove the sky background, so from far away they would paint the map black as coverage grows.
      // They come in fully only close up, where their detail matters; from afar they are a faint tint showing where we stacked.
      const deeps: any[] = []
      const fade = (fov: number) => {
        const o = fov <= 4 ? 1 : fov >= 30 ? 0.25 : 1 - 0.75 * (fov - 4) / 26
        deeps.forEach(d => { try { d.setOpacity(o) } catch { /* older builds */ } })
      }
      mosaics?.forEach((url, i) => {
        const deep = A.HiPS(url, { name: 'mosaic-' + i, imgFormat: 'png' })
        // The stacks keep the sky black; lift the faint end so dim sources show up close in.
        try { deep.setGamma?.(0.7) } catch { /* older builds */ }
        al.setOverlayImageLayer(deep, 'mosaic-' + i)
        deeps.push(deep)
      })
      fade(fovDeg)
      if (box) {
        const ov = A.graphicOverlay({ color: '#f5a524', lineWidth: 2 })
        al.addOverlay(ov)
        const h = box.sizeDeg / 2, c = Math.cos(box.dec * Math.PI / 180)
        ov.add(A.polygon([[box.ra + h / c, box.dec - h], [box.ra - h / c, box.dec - h], [box.ra - h / c, box.dec + h], [box.ra + h / c, box.dec + h]]))
      }
      if (marks?.length) {
        const cat = A.catalog({ name: 'Challenge targets', sourceSize: 22, color: '#f5a524', shape: 'circle',
          displayLabel: true, labelColumn: 'title', labelColor: '#ffd38a', labelFont: '600 14px system-ui' })
        al.addCatalog(cat)
        cat.addSources(marks.map(m => A.source(m.ra, m.dec, { id: m.id, title: m.title })))
      }
      al.on('zoomChanged', (f: any) => {
        const fov = Array.isArray(f) ? f[0] : typeof f === 'number' ? f : al.getFov()[0]
        if (fov < minFov * 0.98) al.setFoV(minFov)
        tint(fov)
        fade(fov)
        setZoomed(fov < fovDeg * 0.9)
      })
      // A click flies toward the point and zooms in; a click near a field opens it.
      al.on('click', (e: any) => {
        if (e?.isDragging || typeof e?.ra !== 'number') return
        const fov = al.getFov()[0]
        let best: SkyMark | null = null, bestD = Math.max(0.4, fov * 0.04)
        for (const m of marks ?? []) {
          const d = sep(e.ra, e.dec, m.ra, m.dec)
          if (d < bestD) { bestD = d; best = m }
        }
        if (best) { select.current?.(best.id); return }
        al.animateToRaDec(e.ra, e.dec, 0.7)
        al.zoomToFoV(Math.max(minFov, fov / 2.5), 0.7)
        setZoomed(true)
      })
      setState('ready')
    }).catch(() => { if (alive) setState('error') })
    return () => {
      alive = false; map.current = null
      try { al?.destroy?.() } catch { /* already gone */ }
      if (el.current) el.current.innerHTML = ''
    }
  }, [ra, dec, fovDeg, allSky, box?.ra, box?.dec, box?.sizeDeg, marksKey, deepKey])

  useEffect(() => {
    const al = map.current
    if (!al || !focus) return
    const w = el.current?.clientWidth || 1
    const shift = w > 700 ? (inset / 2) / w * FOCUS_FOV : 0
    al.animateToRaDec(focus.ra - shift / Math.cos(focus.dec * rad), focus.dec, 1)
    al.zoomToFoV(FOCUS_FOV, 1)
    setZoomed(true)
  }, [focus?.ra, focus?.dec, state])

  function reset() {
    const al = map.current
    if (!al) return
    al.animateToRaDec(ra, dec, 0.8)
    al.zoomToFoV(fovDeg, 0.8)
    setZoomed(false)
  }

  return <figure className="skymap">
    <div ref={el} className="skymap-canvas" style={{ height }} />
    {state !== 'ready' && <div className="skymap-status">{state === 'loading' ? 'Loading the SPHEREx sky map…' : 'The sky map could not be loaded right now.'}</div>}
    {state === 'ready' && zoomed && <button className="skymap-reset" onClick={reset}>{resetLabel}</button>}
    {caption && <figcaption>SPHEREx all-sky map (IRSA). Click to zoom in, drag to move.{box ? ' The orange square is the field shown in the viewer.' : ''}</figcaption>}
  </figure>
}
