// The same real SPHEREx frames, before and after spectral subtraction, played in step.
import { useEffect, useState } from 'react'
import { provider } from '../data/provider'
import type { Tile } from '../data/types'
import FrameCanvas from './FrameCanvas'

export default function HeroCompare({ tileId }: { tileId: string }) {
  const [tile, setTile] = useState<Tile | null>(null), [k, setK] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    provider.loadTile(tileId, controller.signal).then(t => { if (!controller.signal.aborted) setTile(t) }).catch(() => {})
    return () => controller.abort()
  }, [tileId])
  useEffect(() => {
    if (!tile || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setK(n => (n + 1) % tile.frames.length), 140)
    return () => clearInterval(id)
  }, [tile])
  const frame = tile?.frames[k]
  return <figure className="hero-compare" aria-label="Real SPHEREx frames before and after spectral subtraction">
    <div><div className="hero-frame">{tile && <FrameCanvas tile={tile} k={k} options={{ view: 'science' }} />}</div><figcaption><strong>What SPHEREx photographs</strong>Each photograph is in a different infrared colour, so every star flickers.</figcaption></div>
    <div><div className="hero-frame">{tile && <FrameCanvas tile={tile} k={k} options={{ view: 'residual', combine: 3 }} />}</div><figcaption><strong>What our method leaves</strong>The fixed sky is subtracted. Only what moved or changed still glows.</figcaption></div>
    <p className="mono">{tile && frame ? `${tile.manifest.title} · ${frame.observed_at_utc.slice(0, 10)} · ${frame.wavelength_um?.toFixed(2)} µm · frame ${k + 1}/${tile.frames.length}` : 'Loading real SPHEREx frames…'}</p>
  </figure>
}
