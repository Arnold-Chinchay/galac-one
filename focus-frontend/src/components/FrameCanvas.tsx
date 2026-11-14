import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { Tile } from '../data/types'
import { drawFrame } from '../lib/render'
import type { RenderOptions } from '../lib/render'

export default function FrameCanvas({ tile, k, options, className, style, label }: { tile: Tile; k: number; options: RenderOptions; className?: string; style?: CSSProperties; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { view, smooth, combine, mask, crop } = options
  useEffect(() => { if (ref.current) drawFrame(ref.current, tile, k, options) }, [tile, k, view, smooth, combine, mask, crop?.cx, crop?.cy, crop?.half])
  return <canvas ref={ref} className={className} style={style} role="img" aria-label={label} />
}
