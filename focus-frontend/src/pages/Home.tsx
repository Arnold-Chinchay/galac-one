import { useState } from 'react'
import type { CommunityStats, Field } from '../data/types'
import { Icon } from '../components/Icons'
import SkyMap from '../components/SkyMap'

interface Props { targets: Field[]; community: CommunityStats | null; onOpen: (t: Field) => void; onClassify: (t?: Field) => void; onTraining: () => void }

// What SPHEREx data alone told us about each field, checked against Gaia where a reference exists.
const finding: Record<string, [string, string]> = {
  'Barnard’s Star': ['10.1″ per year', 'Its motion measured on SPHEREx frames alone, 3% from Gaia.'],
  'Epsilon Indi B': ['4.70″ per year', 'Tracked beyond 2.4 µm, 0.4% from Gaia.'],
  'WISE 0855': ['1 of 19', 'The only red source with a cold-brown-dwarf spectrum that also moves, found without being told where to look.'],
  'RW Aurigae': ['~1 magnitude', 'Brightness swings with no regular rhythm, as expected for a very young star.'],
  'R Draconis': ['238 days', 'The pulsation period recovered from SPHEREx brightness alone.'],
}

export default function Home({ targets, community, onOpen, onClassify, onTraining }: Props) {
  const [pickedTitle, setPickedTitle] = useState<string | null>(null)
  const picked = targets.find(t => t.title === pickedTitle) ?? null
  const marks = targets.map(t => ({ id: t.tile_id, title: t.title, ra: t.center.ra_deg, dec: t.center.dec_deg }))

  return <section className="sky-home">
    <SkyMap ra={180} dec={0} fovDeg={360} allSky height="100%" caption={false} marks={marks} inset={392}
      focus={picked ? { ra: picked.center.ra_deg, dec: picked.center.dec_deg } : null}
      deep={targets.filter(t => t.manifest_url).map(t => new URL(t.manifest_url!.replace('manifest.json', 'deep/'), location.origin).href)}
      onSelect={id => setPickedTitle(targets.find(x => x.tile_id === id)?.title ?? null)} />

    <aside className="sky-panel">
      {!picked ? <>
        <h1>See what <em>moves</em> in the infrared sky.</h1>
        <p>This is the whole sky as NASA’s SPHEREx telescope sees it. Click anywhere to zoom in. Where we stacked every SPHEREx exposure, the sky turns sharp. Pick one of the five fields we studied:</p>
        <ul className="field-list">{targets.map(t => <li key={t.tile_id}><button onClick={() => setPickedTitle(t.title)}>
          <span>{t.title}</span><small>{t.kind === 'moving' ? 'moves' : 'changes brightness'}</small><Icon name="arrow" size={15} />
        </button></li>)}</ul>
        <button className="button primary large" onClick={() => onClassify()}>Help find moving objects <Icon name="arrow" size={18} /></button>
        <button className="text-button" onClick={onTraining}>Practice first, with answers shown</button>
        <p className="sky-stats">{community ? `${community.candidates} candidates · ${community.votes} classifications so far` : 'Open to everyone. No account needed.'}</p>
      </> : <>
        <button className="text-button back" onClick={() => setPickedTitle(null)}><Icon name="back" size={15} />All fields</button>
        <h2>{picked.title}</h2>
        <p>{picked.description}</p>
        {finding[picked.title] && <div className="finding"><strong>{finding[picked.title][0]}</strong><span>{finding[picked.title][1]}</span></div>}
        {picked.status === 'ready' ? <div className="panel-actions">
          <button className="button primary" onClick={() => onOpen(picked)}>Look closer <Icon name="arrow" size={16} /></button>
          <button className="button secondary" onClick={() => onClassify(picked)}>Classify this field</button>
        </div> : <p className="fine-print">This field is not available right now.</p>}
      </>}
    </aside>
  </section>
}
