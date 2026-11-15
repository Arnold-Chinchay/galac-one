// What the community has decided so far. Answers are weighted by each person's accuracy on hidden test objects,
// and an object needs a few people and a clear majority before it counts either way.
import { useEffect, useState } from 'react'
import { communityConsensus } from '../data/provider'
import type { Consensus } from '../data/provider'
import { curatedTargets } from '../data/targets'

const fieldName = (tile: string, fallback: string) => curatedTargets.find(t => t.tile_id === tile)?.title ?? fallback

const pct = (x: number | null) => x == null ? '' : `${Math.round(x * 100)}%`

export default function CommunityLeads({ onFocus }: { onFocus: (ra: number, dec: number) => void }) {
  const [c, setC] = useState<Consensus | null>(null)
  useEffect(() => { const a = new AbortController(); communityConsensus(a.signal).then(setC).catch(() => {}); return () => a.abort() }, [])
  if (!c) return null
  const leads = c.sky.n_lead + c.spots.n_lead, ruled = c.sky.n_rejected + c.spots.n_rejected
  return <section className="community-leads" aria-label="Community leads">
    <h3>Community leads</h3>
    <p className="cl-sum">{leads} confirmed · {ruled} ruled out · {c.sky.n_open + c.spots.n_open} still need answers</p>
    {leads === 0 ? <p className="cl-empty">Nothing confirmed yet. An object needs at least three answers and a clear majority, weighted by how accurate each person is on hidden test objects.</p>
      : <ul>
        {c.sky.leads.slice(0, 4).map(s => <li key={s.id}><button onClick={() => onFocus(s.ra, s.dec)}>
          <span className="cl-kind sky">Red dot</span><span>RA {s.ra.toFixed(2)}°, Dec {s.dec.toFixed(2)}°</span><small>{pct(s.share)} of {s.voters}</small></button></li>)}
        {c.spots.leads.slice(0, 4).map(s => <li key={s.id}><div>
          <span className="cl-kind">{s.label === 'moving' ? 'Moves' : 'Blinks'}</span><span>{fieldName(s.tile_id, s.field)}</span><small>{pct(s.share)} of {s.voters}</small></div></li>)}
      </ul>}
  </section>
}
