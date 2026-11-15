// Field picker for Classify. The list grows on its own as the sky search publishes new fields, so it is grouped,
// searchable and scrolls inside its own panel instead of being one long native list.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Field } from '../data/types'
import { Icon } from './Icons'

const isSky = (f: Field) => f.tile_id.startsWith('sky')
const isCold = (f: Field) => /cold/i.test(f.title)
/** "New cold-dwarf colours · RA 133.76 Dec -7.24" -> "RA 133.76°, Dec −7.24°" */
const where = (f: Field) => `RA ${f.center.ra_deg.toFixed(2)}°, Dec ${f.center.dec_deg >= 0 ? '+' : '−'}${Math.abs(f.center.dec_deg).toFixed(2)}°`
const short = (f: Field) => isSky(f) ? where(f) : f.title

interface Props {
  fields: Field[]
  current: string | null          // tile id, or null for practice
  onPractice: () => void
  onPick: (f: Field) => void
}

export default function FieldPicker({ fields, current, onPractice, onPick }: Props) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), [coldOnly, setColdOnly] = useState(false)
  const box = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false) } }
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc, true)
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc, true) }
  }, [open])

  const plain = (s: string) => s.toLowerCase().replace(/[’'°,]/g, '')
  const match = (f: Field) => !q || plain(f.title + ' ' + where(f) + ' ' + f.tile_id).includes(plain(q))
  const challenge = useMemo(() => fields.filter(f => !isSky(f) && match(f)), [fields, q])
  const sky = useMemo(() => fields.filter(f => isSky(f) && match(f) && (!coldOnly || isCold(f))), [fields, q, coldOnly])
  const nSky = fields.filter(isSky).length, nCold = fields.filter(f => isSky(f) && isCold(f)).length
  const selected = fields.find(f => f.tile_id === current)
  const pick = (f: Field) => { setOpen(false); setQ(''); onPick(f) }

  const row = (f: Field) => <li key={f.tile_id}><button role="option" aria-selected={f.tile_id === current} className={f.tile_id === current ? 'on' : ''} onClick={() => pick(f)}>
    <span className="fp-name">{short(f)}</span>
    {isSky(f) ? <span className={'fp-tag ' + (isCold(f) ? 'cold' : '')}>{isCold(f) ? 'Cold-dwarf colours' : 'Red source'}</span>
      : f.frame_count ? <span className="fp-meta">{f.frame_count} photos</span> : null}
    {f.tile_id === current && <Icon name="check" size={15} />}
  </button></li>

  return <div className="field-picker" ref={box}>
    <span className="fp-label">Field</span>
    <button className="fp-current" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <span>{current === null ? 'Practice (answers shown)' : selected ? short(selected) : 'Choose a field'}</span>
      {selected && isSky(selected) && <i className="fp-dot" title="New from the sky search" />}
      <Icon name="chevron" size={14} />
    </button>
    {open && <div className="fp-panel" role="dialog" aria-label="Choose a field">
      <label className="fp-search"><Icon name="search" size={15} /><input ref={search} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or position" /></label>
      <div className="fp-list" role="listbox">
        {!q && <ul><li><button role="option" aria-selected={current === null} className={current === null ? 'on' : ''} onClick={() => { setOpen(false); onPractice() }}>
          <span className="fp-name">Practice</span><span className="fp-meta">answers shown</span>{current === null && <Icon name="check" size={15} />}
        </button></li></ul>}
        {challenge.length > 0 && <><h4>Challenge fields <small>{challenge.length}</small></h4><p className="fp-note">Known objects picked for the challenge: good for learning what real motion looks like.</p><ul>{challenge.map(row)}</ul></>}
        <h4>New from the sky search <small>{nSky}</small>
          {nCold > 0 && <button className={'fp-filter ' + (coldOnly ? 'on' : '')} onClick={() => setColdOnly(v => !v)}>Cold only · {nCold}</button>}</h4>
        {nSky > 0 && <p className="fp-note">Cut automatically around the most promising red sources. Nobody has checked them yet.</p>}
        {sky.length ? <ul>{sky.map(row)}</ul>
          : <p className="fp-empty">{nSky ? 'Nothing matches.' : 'The automatic sky search adds a field here around each promising red source it finds. Check back soon.'}</p>}
      </div>
    </div>}
  </div>
}
