import type { CommunityStats } from '../data/types'
import { Icon } from '../components/Icons'

const results = [
  ['Barnard’s Star', 'Proper motion 10.10 ± 0.12 ″/yr', 'Gaia DR3: 10.39 ″/yr (−2.9%, direction within 0.3°). The star saturates, so the centroid uses its wings.'],
  ['Epsilon Indi B', 'Proper motion 4.70 ± 0.06 ″/yr', 'Gaia DR3: 4.68 ″/yr (+0.4%), using frames beyond 2.4 µm.'],
  ['R Draconis', 'Period 238 days, about 1.1 mag', '260 frames, measured on the unsaturated halo. False-alarm probability about 1e-12.'],
  ['RW Aurigae', 'About 1 mag of variation, no clear period', '316 frames. Consistent with an irregular young star.'],
  ['WISE 0855', 'Found blind in a 0.2° field', 'The only very red source with a cold-dwarf spectrum (nothing at 2.5–3.5 µm, 11.6σ at 4.0–4.7 µm) and the only one that moves: (−10.4, +1.3) ± 1.3 ″/yr, p = 0.024.'],
]
const limits = [
  'Detection completeness, measured with 48 injected objects in the R Draconis field: 43% at signal-to-noise 5–7 per frame, 82–90% above 7. About 7 false moving candidates per field reach the queue; that is what the volunteers are for.',
  'Bright stars saturate. Their residuals are 12–14% of the flux, and their photometry uses the halo or the wings.',
  'The per-frame gain correction that makes frames comparable also underestimates the amplitude of variable stars by 30–40%.',
  'The motion of WISE 0855 is not corrected for parallax and spans under half a year of data. It still needs an independent catalogue check.',
  'A field with no candidates does not show that Planet X is absent. Planet X is hypothetical; this is a way to search, with measured limits.',
]
const sources: [string, string, string][] = [
  ['SPHEREx at IRSA', 'Mission archive, data releases DR1 and QR3.', 'https://irsa.ipac.caltech.edu/Missions/spherex.html'],
  ['SPHEREx on AWS Open Data', 'The public bucket the pipeline reads spectral images from.', 'https://registry.opendata.aws/spherex-qr/'],
  ['Gaia DR3', 'Reference positions and proper motions of the targets.', 'https://www.cosmos.esa.int/web/gaia/dr3'],
  ['Astropy, reproject, astroquery', 'FITS, coordinates, reprojection and archive access in the pipeline.', 'https://www.astropy.org/'],
  ['Source code', 'Pipeline, API and this site, MIT licence.', 'https://github.com/spacenaylamp-blip/galac-one'],
  ['Planet X and SPHEREx challenge', 'NASA Space Apps 2026.', 'https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/'],
]

const openData: [string, string, string][] = [
  ['barnard', 'Barnard’s Star', 'propermotion.json'], ['epsindib', 'Epsilon Indi B', 'propermotion.json'],
  ['wise0855', 'WISE 0855', 'redsearch.json'], ['rwaur', 'RW Aurigae', 'lightcurve.json'], ['rdra', 'R Draconis', 'lightcurve.json'],
]

export default function Method({ community, onClassify }: { community: CommunityStats | null; onClassify: () => void }) {
  return <div className="credits-page">
    <span className="eyebrow">METHOD, RESULTS AND LIMITS</span>
    <h1>Remove the colour.<br />Keep the change.</h1>
    <p className="credits-intro">SPHEREx images the sky through a filter whose colour varies across the detector. The same star is seen at a different wavelength on every visit, so two images of one field never match, and ordinary image subtraction fails. That is the obstacle between SPHEREx and a search for moving objects.</p>
    <div className="credits-grid">
      <article><span className="mono">01 / SPECTRAL SUBTRACTION</span><h2>A spectrum for every pixel.</h2><p>For each pixel we fit a smooth spectrum through all its visits, with one brightness scale per frame, and subtract it at each frame’s wavelength. On real stars the frame-to-frame scatter drops by a factor of 4.5; frames taken at the same wavelength went from 46% apart to 10%.</p></article>
      <article><span className="mono">02 / DETECTION</span><h2>Lines and repeats.</h2><p>Peaks in the residual frames are linked into straight tracks (moving objects) or repeats at one position (variable sources). Every field also receives synthetic moving objects, so its sensitivity is measured, not assumed.</p></article>
      <article><span className="mono">03 / PEOPLE</span><h2>A calibrated crowd.</h2><p>Each volunteer’s queue mixes real candidates with hidden test objects and empty-sky controls. Their answers on those give a reliability score. In our test, someone who marks everything as moving scores 0.58; someone who answers correctly scores 0.92.</p></article>
      <article><span className="mono">04 / COLD OBJECTS</span><h2>The Planet X case.</h2><p>A distant cold body is faint, very red and slow. We search wider fields for sources far redder than the stars, test their spectrum band by band, and test their motion against random splits of the frames.</p></article>
    </div>
    <section className="sources-section"><h2>What we measured</h2>
      <div className="sources-list results-list">{results.map(([name, value, note]) => <div key={name}><div><strong>{name} · {value}</strong><p>{note}</p></div></div>)}</div>
      <p>All of these come from SPHEREx frames alone; Gaia is used only as the reference to compare against.</p>
    </section>
    <section className="sources-section"><h2>Limits we know about</h2>
      <ul className="limits-list">{limits.map(l => <li key={l}>{l}</li>)}</ul>
    </section>
    <section className="sources-section"><h2>The crowd so far</h2>
      <div className="stat-row">
        <div><strong>{community?.users ?? '—'}</strong><span>volunteers</span></div>
        <div><strong>{community?.votes ?? '—'}</strong><span>classifications</span></div>
        <div><strong>{community?.candidates ?? '—'}</strong><span>candidates</span></div>
        <div><strong>{community?.tiles ?? '—'}</strong><span>fields</span></div>
      </div>
      {community?.leaderboard?.length ? <table className="result-table board"><thead><tr><th>Volunteer</th><th>Classifications</th><th>Reliability</th></tr></thead><tbody>{community.leaderboard.map((u, i) => <tr key={i}><td>{u.alias}</td><td>{u.n_votes}</td><td>{u.reliability === null ? '—' : Math.round(u.reliability * 100) + '%'}</td></tr>)}</tbody></table> : null}
      <button className="button primary" onClick={onClassify}>Add your classifications <Icon name="arrow" size={16} /></button>
    </section>
    <section className="sources-section"><h2>Open data</h2>
      <p>Everything on this site can be downloaded and checked. Deep images are FITS with a sky coordinate system (WCS); frame cubes are float16 with a JSON manifest; measurements and candidate lists are JSON.</p>
      <div className="open-data">
        <div className="open-data-row head"><span>Field</span><span>Candidates and votes</span><span>Deep image</span><span>Frames</span><span>Measurement</span></div>
        {openData.map(([id, title, measure]) => <div key={id} className="open-data-row"><strong>{title}</strong>
          <a href={`/api/tiles/${id}/candidates`} target="_blank" rel="noreferrer">JSON</a>
          <span><a href={`/tiles/${id}/deep/deep_lum.fits`}>FITS</a> · <a href={`/tiles/${id}/deep/deep_rgb.png`} target="_blank" rel="noreferrer">PNG</a></span>
          <a href={`/tiles/${id}/manifest.json`} target="_blank" rel="noreferrer">manifest</a>
          <a href={`/tiles/${id}/${measure}`} target="_blank" rel="noreferrer">{measure.replace('.json', '')}</a></div>)}
      </div>
      <p>API: <code>/api/tiles</code> lists the fields, <code>/api/tiles/&lt;id&gt;/candidates</code> gives every candidate with its track and vote counts, <code>/api/stats</code> the totals. Hidden test objects are mixed into the candidate lists on purpose; which ones they are stays private so that reliability scores remain valid.</p>
    </section>
    <section className="sources-section"><h2>Data and tools</h2>
      <div className="sources-list">{sources.map(([title, description, url]) => <a key={title} href={url} target="_blank" rel="noreferrer"><div><strong>{title}</strong><p>{description}</p></div><Icon name="external" size={18} /></a>)}</div>
      <p>Site built with React, TypeScript and Vite, served with the API from Cloudflare Workers, D1 and R2. Typography: Jost, Geist, Inter and IBM Plex Mono (SIL Open Font License). Title-screen planet: artist’s concept, Caltech/R. Hurt (IPAC); it is an illustration, not an observation. Naylamp Space is an independent team from Piura, Peru; this is not an official NASA or IRSA product.</p>
    </section>
    <section className="acknowledgement"><span className="eyebrow">SPHEREx ACKNOWLEDGEMENT</span><p>This publication makes use of data products from the Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer (SPHEREx), which is a joint project of the Jet Propulsion Laboratory and the California Institute of Technology, and is funded by the National Aeronautics and Space Administration.</p><a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">SPHEREx at IRSA <Icon name="external" size={13} /></a></section>
  </div>
}
