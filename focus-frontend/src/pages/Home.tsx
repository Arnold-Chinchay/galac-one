import type { CommunityStats, Field } from '../data/types'
import { Icon } from '../components/Icons'
import HeroCompare from '../components/HeroCompare'
import SkyMap from '../components/SkyMap'

interface Props { targets: Field[]; community: CommunityStats | null; onOpen: (t: Field) => void; onExplore: () => void; onClassify: () => void; onTraining: () => void; onMethod: () => void }

const steps = [
  ['01', 'Subtract the colour', 'SPHEREx sees each patch of sky at a different wavelength every time. We fit a spectrum to every pixel and subtract it, so only real change is left.'],
  ['02', 'Find the candidates', 'A detector searches the residual frames for sources that drift in a straight line or brighten in place.'],
  ['03', 'Ask people, and grade them', 'Volunteers classify each candidate. Hidden test objects and empty-sky controls in the queue measure how reliable each volunteer is.'],
]

export default function Home({ targets, community, onOpen, onExplore, onClassify, onTraining, onMethod }: Props) {
  const showcase = targets.find(t => t.status === 'ready' && t.kind === 'moving')
  return <>
    <section className="hero">
      <div className="hero-shade" />
      <div className="hero-content">
        <div className="eyebrow hero-eyebrow"><span />NASA SPACE APPS 2026 · PLANET X AND SPHEREx</div>
        <h1>See what <em>moves</em><br />in the infrared sky.</h1>
        <p>SPHEREx photographs the whole sky in 102 colours, but it sees each star in a different colour on every visit.<br className="desktop-break" /> We remove the colour, keep the change, and ask people to judge it.</p>
        <div className="hero-actions">
          <button className="button primary large" onClick={onClassify}>Start classifying <Icon name="arrow" size={19} /></button>
          <button className="text-button" onClick={onTraining}><span className="play-outline"><Icon name="play" size={12} /></span>Practice with answers first</button>
        </div>
        <span className="hero-note">Open to everyone. No account needed.</span>
      </div>
      {showcase && <HeroCompare tileId={showcase.tile_id} />}
      <div className="hero-bottom">
        <span className="hero-bottom-label">REAL SPHEREx DATA,<br />MEASURED BY US</span>
        <div><strong>1.6 <small>million</small></strong><span>SPHEREx images indexed</span></div>
        <div><strong>{targets.filter(t => t.status === 'ready').length || 5} <small>of 5</small></strong><span>Challenge targets processed</span></div>
        <div><strong>{community ? community.candidates : '—'}</strong><span>Candidates to classify</span></div>
        <div><strong>{community ? community.votes : '—'}</strong><span>Classifications so far</span></div>
        <a href="#guided-targets">See the targets <Icon name="arrow" size={17} /></a>
      </div>
    </section>
    <section className="targets-section" id="guided-targets">
      <div className="section-heading"><div><span className="eyebrow">THE FIVE CHALLENGE TARGETS</span><h2>Five real fields on the SPHEREx sky.</h2></div><p>This is the real SPHEREx all-sky map. Click a marker or a card<br />to open that field, its images and what we measured.</p></div>
      <SkyMap ra={180} dec={0} fovDeg={360} allSky height={420} marks={targets.map(t => ({ id: t.tile_id, title: t.title, ra: t.center.ra_deg, dec: t.center.dec_deg }))} onSelect={id => { const t = targets.find(x => x.tile_id === id); if (t) onOpen(t) }} />
      <div className="target-grid">{targets.map((t, i) => <button className="target-card" key={t.tile_id} onClick={() => onOpen(t)}>
        <span className="target-number mono">0{i + 1}<Icon name="arrow" size={17} /></span>
        {t.manifest_url ? <img className="target-thumb" src={t.manifest_url.replace('manifest.json', 'deep/deep_rgb.png')} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden' }} /> : <div className={'target-visual target-visual-' + i}><span /><i /><b /></div>}
        <span className="target-kind">{t.kind === 'moving' ? 'FOLLOW THE MOVEMENT' : 'WATCH THE BRIGHTNESS'}</span>
        <h3>{t.title}</h3><p>{t.description}</p>
        <span className={'pending-dot' + (t.status === 'ready' ? ' ready' : '')}>{t.status === 'ready' ? `${t.frame_count ? t.frame_count + ' ' : ''}SPHEREx frames · ${t.release}` : 'Not available right now'}</span>
      </button>)}</div>
    </section>
    <section className="how-section">
      <span className="eyebrow">HOW IT WORKS</span>
      <h2>A detector made of<br />software and people.</h2>
      <div className="how-grid">{steps.map(([n, title, text]) => <div key={n}><span className="mono">{n}</span><h3>{title}</h3><p>{text}</p></div>)}</div>
      <button className="text-button method-link" onClick={onMethod}>Method, results and limits <Icon name="arrow" size={14} /></button>
    </section>
  </>
}
