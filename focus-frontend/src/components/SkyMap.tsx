import { useEffect, useRef, useState } from 'react'

/** SPHEREx DR1 all-sky map served by IRSA (HiPS, CORS open). */
export const SPHEREX_HIPS = 'https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube'

export interface SkyMark { id: string; title: string; ra: number; dec: number }
interface Props {
  ra: number; dec: number; fovDeg: number; allSky?: boolean; height?: number
  marks?: SkyMark[]; box?: { ra: number; dec: number; sizeDeg: number }; onSelect?: (id: string) => void
}

let loader: Promise<any> | null = null
const rad = Math.PI / 180
const sep = (ra1: number, de1: number, ra2: number, de2: number) =>
  Math.acos(Math.min(1, Math.sin(de1 * rad) * Math.sin(de2 * rad) + Math.cos(de1 * rad) * Math.cos(de2 * rad) * Math.cos((ra1 - ra2) * rad))) / rad
const loadAladin = () => (loader ??= import('aladin-lite').then(async m => { const A = m.default; await A.init; return A }))

export default function SkyMap({ ra, dec, fovDeg, allSky, height = 300, marks, box, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const select = useRef(onSelect)
  select.current = onSelect
  const marksKey = marks?.map(m => m.id).join(',')

  useEffect(() => {
    let alive = true, al: any = null
    setState('loading')
    loadAladin().then(A => {
      if (!alive || !el.current) return
      al = A.aladin(el.current, {
        survey: SPHEREX_HIPS, fov: fovDeg, target: `${ra} ${dec}`, cooFrame: 'ICRS', projection: allSky ? 'AIT' : 'SIN',
        showReticle: false, showLayersControl: false, showProjectionControl: false, showFrame: false,
        showCooGridControl: false, showSimbadPointerControl: false, showFullscreenControl: true,
        showZoomControl: true, showContextMenu: false, showStatusBar: false, showCooLocation: false, showCooGrid: !!allSky,
        gridOptions: { color: '#ffd38a', opacity: 0.18, showLabels: false, thickness: 1 },
      })
      const hips = A.HiPS(SPHEREX_HIPS, { name: 'SPHEREx DR1 all-sky', imgFormat: 'png', cooFrame: 'equatorial', maxOrder: 5 })
      al.setBaseImageLayer(hips)
      try { hips.setColormap('inferno', { stretch: 'asinh' }) } catch { /* older builds: keep grey */ }
      if (box) {
        const ov = A.graphicOverlay({ color: '#f5a524', lineWidth: 2 })
        al.addOverlay(ov)
        const h = box.sizeDeg / 2, c = Math.cos(box.dec * Math.PI / 180)
        ov.add(A.polygon([[box.ra + h / c, box.dec - h], [box.ra - h / c, box.dec - h], [box.ra - h / c, box.dec + h], [box.ra + h / c, box.dec + h]]))
      }
      if (marks?.length) {
        const cat = A.catalog({ name: 'Challenge targets', sourceSize: 20, color: '#f5a524', shape: 'circle',
          displayLabel: true, labelColumn: 'title', labelColor: '#ffd38a', labelFont: '600 13px system-ui' })
        al.addCatalog(cat)
        cat.addSources(marks.map(m => A.source(m.ra, m.dec, { id: m.id, title: m.title })))
        al.on('click', (e: any) => {
          if (e?.isDragging || typeof e?.ra !== 'number') return
          const tol = Math.max(0.3, (al.getFov?.()[0] ?? fovDeg) * 0.03)
          let best: SkyMark | null = null, bestD = tol
          for (const m of marks) {
            const d = sep(e.ra, e.dec, m.ra, m.dec)
            if (d < bestD) { bestD = d; best = m }
          }
          if (best) select.current?.(best.id)
        })
      }
      setState('ready')
    }).catch(() => { if (alive) setState('error') })
    return () => {
      alive = false
      try { al?.destroy?.() } catch { /* already gone */ }
      if (el.current) el.current.innerHTML = ''
    }
  }, [ra, dec, fovDeg, allSky, box?.ra, box?.dec, box?.sizeDeg, marksKey])

  return <figure className="skymap">
    <div ref={el} className="skymap-canvas" style={{ height }} />
    {state !== 'ready' && <div className="skymap-status">{state === 'loading' ? 'Loading the SPHEREx sky map…' : 'The sky map could not be loaded right now.'}</div>}
    <figcaption>SPHEREx DR1 all-sky map (IRSA). Drag to move, scroll to zoom.{box ? ' The orange square is the field shown in the viewer.' : ''}</figcaption>
  </figure>
}
