// One candidate at a time: a close-up loop of the spot the detector flagged, a few visual aids, and one plain question.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Candidate, CommunityStats, Field, Label, Tile, UserStats } from '../data/types'
import type { StoredVote } from '../lib/storage'
import { safeRead, safeWrite } from '../lib/storage'
import { timeColour } from '../lib/render'
import { Icon } from '../components/Icons'
import FrameCanvas from '../components/FrameCanvas'

const CHOICES: { label: Label; title: string; hint: string }[] = [
  { label: 'moving', title: 'It moves', hint: 'The dot is in a different place over time' },
  { label: 'variable', title: 'It blinks in place', hint: 'Same place, but brighter or fainter' },
  { label: 'artifact', title: 'It’s a glitch', hint: 'Shows up once, or has an odd shape' },
  { label: 'unsure', title: 'Not sure', hint: 'A useful answer too' },
]
const ANSWER: Record<Label, string> = {
  moving: 'it moves: the dot changes place along a line.',
  variable: 'it blinks in place: same spot, changing brightness.',
  artifact: 'it’s a glitch: it appears in one photograph and is gone in the next.',
  unsure: 'unclear.',
}
const INTRO_KEY = 'galac.classify-intro.v1'

/** Small drawings of what each answer looks like over three photographs. */
function Pictogram({ label }: { label: Label }) {
  const dot = (cx: number, cy: number, r = 3.2, o = 1) => <circle cx={cx} cy={cy} r={r} fill="#ffb454" opacity={o} />
  const frames = [0, 1, 2].map(i => <rect key={i} x={1 + i * 22} y={1} width={20} height={20} rx={3} fill="#0b1222" stroke="#2b4056" />)
  const marks = label === 'moving' ? <>{dot(7, 15)}{dot(33, 11)}{dot(59, 7)}</>
    : label === 'variable' ? <>{dot(11, 11, 1.8, .55)}{dot(33, 11, 4.4)}{dot(55, 11, 2.6, .8)}</>
    : label === 'artifact' ? <>{dot(33, 11, 3.6)}</>
    : <><text x="33" y="15" textAnchor="middle" fontSize="11" fill="#8fa3bb">?</text></>
  return <svg className="pictogram" viewBox="0 0 66 22" aria-hidden="true">{frames}{marks}</svg>
}

function Intro({ onPractice, onStart }: { onPractice: () => void; onStart: () => void }) {
  const steps: [string, string, ReactNode][] = [
    ['Watch', 'Each loop shows the same small patch of sky, photographed by SPHEREx over days or months. A computer flagged a glowing dot in it.', <Pictogram label="moving" />],
    ['Decide', 'Does the dot move, blink in place, or show up only once? You do not need to know any astronomy.', <Pictogram label="variable" />],
    ['Count', 'Many people answer each spot. Some spots are hidden tests with a known answer, so the project can measure how reliable every answer is.', <Pictogram label="artifact" />],
  ]
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="intro-title" className="classify-intro">
    <span className="eyebrow">HOW IT WORKS · 30 SECONDS</span>
    <h2 id="intro-title">Help a computer tell real objects from noise.</h2>
    <ol>{steps.map(([title, text, pic], i) => <li key={title}><span className="step-n">{i + 1}</span>{pic}<div><strong>{title}</strong><p>{text}</p></div></li>)}</ol>
    <div className="intro-actions">
      <button className="button primary" onClick={onPractice}>Practice with answers first <Icon name="arrow" size={16} /></button>
      <button className="text-button" onClick={onStart}>Start with real data</button>
    </div>
  </section></div>
}

interface Props {
  tile: Tile; candidate?: Candidate; candidateNumber: number; training: boolean
  votes: StoredVote[]; selectedVote?: StoredVote; stats: UserStats | null; community: CommunityStats | null
  targets: Field[]; syncing: boolean
  onVote: (l: Label) => void; onNext: () => void; onField: (t: Field) => void; onTraining: () => void
  onRealData: () => void; onExplore: () => void; onRetry: () => void
}

export default function ClassifyPage(p: Props) {
  const { tile, candidate, training } = p
  const [intro, setIntro] = useState(() => !safeRead<boolean>(INTRO_KEY, false))
  const [view, setView] = useState<'residual' | 'science'>('residual')
  const [k, setK] = useState(0), [playing, setPlaying] = useState(true), [delay, setDelay] = useState(450)
  const closeIntro = () => { safeWrite(INTRO_KEY, true); setIntro(false) }

  // Frames to loop: those where the detector saw the dot; a lone detection gets its neighbours so it can be seen to vanish.
  const seq = useMemo(() => {
    if (!candidate) return []
    const at = new Map(tile.frames.map((f, i) => [f.frame_id, i]))
    const hit = candidate.positions.filter(q => q.detected).map(q => at.get(q.frame_id)!).filter(i => i !== undefined)
    const pick = hit.length >= 3 ? hit : [...new Set(hit.flatMap(i => [i - 3, i - 2, i - 1, i, i + 1, i + 2, i + 3]))]
    return pick.filter(i => i >= 0 && i < tile.frames.length).sort((a, b) => a - b)
  }, [tile, candidate])
  const pos = useMemo(() => new Map(candidate?.positions.map(q => [q.frame_id, q])), [candidate])
  const hits = useMemo(() => candidate?.positions.filter(q => q.detected) ?? [], [candidate])
  const crop = useMemo(() => {
    const pts = hits.length ? hits : candidate?.positions.slice(0, 1) ?? []
    if (!pts.length) return null
    const cx = pts.reduce((s, q) => s + q.x_px, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y_px, 0) / pts.length
    const reach = Math.max(...pts.map(q => Math.hypot(q.x_px - cx, q.y_px - cy)))
    return { cx, cy, half: Math.min(18, Math.max(8, Math.ceil(reach) + 5)) }
  }, [candidate, hits])

  useEffect(() => { setK(0); setPlaying(true) }, [candidate?.candidate_id])
  useEffect(() => { const n = tile.candidates.length; if (n > 0 && p.votes.length >= n && !training) setPlaying(false) }, [p.votes.length, tile, training])
  useEffect(() => {
    if (!playing || seq.length < 2) return
    const id = setInterval(() => setK(n => (n + 1) % seq.length), delay)
    return () => clearInterval(id)
  }, [playing, seq.length, delay])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select') || intro) return
      if (e.code === 'Space') { e.preventDefault(); setPlaying(v => !v) }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPlaying(false); setK(n => (n + 1) % Math.max(1, seq.length)) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); setK(n => (n - 1 + seq.length) % Math.max(1, seq.length)) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [seq.length, intro])

  const done = new Set(p.votes.map(v => v.candidate_id))
  const fields = p.targets.filter(t => t.status === 'ready')
  const total = tile.candidates.length, finished = tile.candidates.filter(c => done.has(c.candidate_id)).length
  const fi = seq[Math.min(k, seq.length - 1)], frame = fi !== undefined ? tile.frames[fi] : undefined
  const here = frame ? pos.get(frame.frame_id) : undefined
  const side = crop ? crop.half * 2 + 1 : 1, ox = crop ? Math.round(crop.cx) - crop.half : 0, oy = crop ? Math.round(crop.cy) - crop.half : 0
  const toBox = (x: number, y: number) => [x - ox + .5, y - oy + .5]
  const first = hits[0], last = hits[hits.length - 1]
  const frameOf = (id?: string) => tile.frames.findIndex(f => f.frame_id === id)
  const days = first && last ? (Date.parse(tile.frames[frameOf(last.frame_id)].observed_at_utc) - Date.parse(tile.frames[frameOf(first.frame_id)].observed_at_utc)) / 86400000 : 0
  const shiftArcsec = first && last ? Math.hypot(last.x_px - first.x_px, last.y_px - first.y_px) * (tile.manifest.pixel_scale_arcsec || 0) : 0
  const t0 = first ? Date.parse(tile.frames[frameOf(first.frame_id)].observed_at_utc) : 0
  const span = Math.max(1, days * 86400000)
  const answered = p.selectedVote, right = training && answered && candidate?.suggested_label === answered.label
  // A field is complete once every spot has this person's answer: stop the loop and show what they did instead.
  const complete = total > 0 && finished >= total
  const tally = CHOICES.map(c => ({ ...c, n: p.votes.filter(v => v.label === c.label).length }))
  const others = fields.filter(t => t.tile_id !== tile.manifest.tile_id)

  // Ring size follows the crop so it reads the same on a small or a wide close-up.
  const ring = (x: number, y: number, dashed = false) => <circle cx={x} cy={y} r={Math.max(1.3, side * .07)} fill="none" stroke="#78ecdb"
    strokeWidth={side * .008} strokeDasharray={dashed ? `${side * .025} ${side * .02}` : undefined} />
  const still = (label: string, id?: string) => {
    const i = frameOf(id), q = id ? pos.get(id) : undefined
    return <figure className="evidence">
      <div className="evidence-img">{crop && i >= 0 && <FrameCanvas tile={tile} k={tile.frames[i].cube_index ?? i} options={{ view: 'residual', crop }} label={label} />}
        {q && <svg viewBox={`0 0 ${side} ${side}`}>{ring(...toBox(q.x_px, q.y_px) as [number, number])}</svg>}</div>
      <figcaption><strong>{label}</strong>{i >= 0 ? tile.frames[i].observed_at_utc.slice(0, 10) : '—'}</figcaption>
    </figure>
  }

  return <div className="classify2">
    {intro && <Intro onPractice={() => { closeIntro(); if (!training) p.onTraining() }} onStart={() => { closeIntro(); if (training) p.onRealData() }} />}
    <nav className="field-chips" aria-label="Fields to classify">
      <button className={training ? 'active practice' : 'practice'} onClick={p.onTraining}><Icon name="play" size={12} />Practice</button>
      {fields.map(t => <button key={t.tile_id} className={!training && tile.manifest.tile_id === t.tile_id ? 'active' : ''} onClick={() => p.onField(t)}>{t.title}</button>)}
      <button className="text-button how" onClick={() => setIntro(true)}><Icon name="help" size={14} />How it works</button>
    </nav>

    <div className="classify2-grid">
      <section className="stage" aria-label="Close-up of the flagged spot">
        <div className="stage-head">
          <div><span className="eyebrow">{training ? 'PRACTICE · SYNTHETIC SKY WITH ANSWERS' : `${tile.manifest.title.toUpperCase()} · REAL SPHEREx DATA`}</span>
            <strong>{complete && !training ? `All ${total} spots done` : `Spot ${p.candidateNumber} of ${total}`}</strong></div>
          <div className="segmented small">
            <button className={view === 'residual' ? 'active' : ''} onClick={() => setView('residual')} title="Each photograph minus what this patch of sky normally looks like">Changes only</button>
            <button className={view === 'science' ? 'active' : ''} onClick={() => setView('science')} title="The photographs as SPHEREx took them">Raw photos</button>
          </div>
        </div>
        <div className="progress" aria-label={`${finished} of ${total} spots done in this field`}><i style={{ width: `${total ? finished / total * 100 : 0}%` }} /></div>
        {complete && !training ? <div className="field-done">
          <span className="done-mark"><Icon name="check" size={28} /></span>
          <h3>All {total} spots in {tile.manifest.title} have your answer.</h3>
          <p>Thank you. Your answers are combined with everyone else’s; the hidden tests among them measure how reliable each answer is.</p>
          <div className="tally">{tally.map(c => <div key={c.label}><Pictogram label={c.label} /><strong>{c.n}</strong><span>{c.title}</span></div>)}</div>
          {others.length > 0 && <><p className="next-label">Keep going in another field:</p>
            <div className="next-fields">{others.map(t => <button key={t.tile_id} className="button secondary compact" onClick={() => p.onField(t)}>{t.title} <Icon name="arrow" size={13} /></button>)}</div></>}
        </div> : !candidate || !crop ? <div className="stage-empty">The detector found nothing to review in this field. Pick another one above.</div> : <>
          <div className="loop">
            {frame && <FrameCanvas tile={tile} k={frame.cube_index ?? fi} options={{ view, crop }} label={`Close-up, photograph ${k + 1} of ${seq.length}`} />}
            <svg viewBox={`0 0 ${side} ${side}`} aria-hidden="true">
              {here && ring(...toBox(here.x_px, here.y_px) as [number, number], !here.detected)}
            </svg>
            <span className="loop-scale">{(side * (tile.manifest.pixel_scale_arcsec || 6.15) / 60).toFixed(1)}′ across · north up</span>
          </div>
          <div className="loop-bar">
            <button className="play-button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}><Icon name={playing ? 'pause' : 'play'} size={16} /></button>
            <input type="range" min={0} max={Math.max(0, seq.length - 1)} value={Math.min(k, seq.length - 1)} aria-label="Photograph" onChange={e => { setPlaying(false); setK(+e.target.value) }} />
            <span className="mono">{k + 1}/{seq.length} · {frame?.observed_at_utc.slice(0, 10)}</span>
            <select aria-label="Speed" value={delay} onChange={e => setDelay(+e.target.value)}><option value={800}>Slow</option><option value={450}>Normal</option><option value={200}>Fast</option></select>
          </div>
          <p className="loop-caption">{view === 'residual'
            ? <>Dark is the normal sky. <b className="warm">Bright</b> is something that was not there before. The ring follows where the computer saw the dot{seq.length > hits.length ? '; it is dashed on photographs where it saw nothing' : ''}.</>
            : <>The photographs as taken. Stars flicker because each photograph is in a different infrared colour; switch to “Changes only” to remove that.</>}</p>

          <div className="evidence-row">
            {still('First seen', first?.frame_id)}
            {still('Last seen', last?.frame_id)}
            <figure className="evidence">
              <div className="evidence-img trail">
                <FrameCanvas tile={tile} k={0} options={{ view: 'colour', crop }} label="All photographs combined" />
                <svg viewBox={`0 0 ${side} ${side}`}>
                  {first && last && hits.length > 1 && <line x1={toBox(first.x_px, first.y_px)[0]} y1={toBox(first.x_px, first.y_px)[1]} x2={toBox(last.x_px, last.y_px)[0]} y2={toBox(last.x_px, last.y_px)[1]} stroke="#ffffff55" strokeWidth={.15} />}
                  {hits.map((q, i) => { const [x, y] = toBox(q.x_px, q.y_px); const f = tile.frames[frameOf(q.frame_id)]; return <circle key={i} cx={x} cy={y} r={.55} fill={timeColour((Date.parse(f.observed_at_utc) - t0) / span)} stroke="#000" strokeWidth={.08} /> })}
                </svg>
              </div>
              <figcaption><strong>Trail</strong>each dot is a sighting, <span className="trail-key"><i />early to late</span></figcaption>
            </figure>
          </div>
          <p className="facts">Seen in <b>{hits.length}</b> photographs{days >= 1 ? <> over <b>{days.toFixed(0)} days</b></> : ''}. From first to last sighting it shifted <b>{shiftArcsec.toFixed(0)}″</b>{shiftArcsec > 15 ? ', more than two pixels' : ', less than a pixel or two (noise can do that)'}. Dots lined up from blue to red mean motion; a jumble in one place means it stayed put.</p>
        </>}
      </section>

      <aside className="ask">
        {complete && !training ? <div className="ready"><strong>Field complete.</strong> Pick another field above or below, or practise again.</div> : <>
        <h2>What is the glowing dot doing?</h2>
        <div className="choices">{CHOICES.map((c, i) => <button key={c.label} disabled={!candidate} onClick={() => p.onVote(c.label)}
          className={'choice ' + (answered?.label === c.label ? 'chosen ' : '') + (training && answered && candidate?.suggested_label === c.label ? 'correct' : '')}>
          <Pictogram label={c.label} /><span><strong>{c.title}</strong><small>{c.hint}</small></span><kbd>{i + 1}</kbd>
        </button>)}</div>
        </>}

        {training && answered && candidate?.suggested_label && <div className={'verdict ' + (right ? 'right' : 'wrong')}>
          <strong>{right ? 'Correct!' : 'Not quite.'}</strong> This one {ANSWER[candidate.suggested_label]}
          {complete ? <button className="button primary compact" onClick={p.onRealData}>Classify real data <Icon name="arrow" size={14} /></button>
            : <button className="button primary compact" onClick={p.onNext}>Next example <Icon name="arrow" size={14} /></button>}
        </div>}
        {training && finished >= total && total > 0 && <div className="ready"><strong>You’re ready.</strong> Real SPHEREx spots are messier than these, and that is exactly why people help.
          <button className="button primary" onClick={p.onRealData}>Classify real data <Icon name="arrow" size={16} /></button></div>}
        {!training && answered && !complete && <div className={'vote-status ' + (answered.status === 'pending' ? 'warning' : '')}>
          <Icon name={answered.status === 'pending' ? 'info' : 'check'} size={16} />{answered.status === 'submitted' ? 'Answer saved. Thank you!' : 'Saving…'}
          {answered.status === 'pending' && answered.error && <button className="text-button small" disabled={p.syncing} onClick={p.onRetry}>Retry</button>}
        </div>}

        <div className="ask-actions">
          {!complete && <button className="button secondary" disabled={!candidate} onClick={p.onNext}>{answered ? 'Next spot' : 'Skip'} <Icon name="arrow" size={14} /></button>}
          {!training && <button className="text-button" onClick={p.onExplore}>Open the whole field</button>}
        </div>

        <div className="ask-stats">
          {!training && p.stats && p.stats.n_votes > 0 ? <div><strong>{p.stats.reliability === null ? '—' : Math.round(p.stats.reliability * 100) + '%'}</strong><span>your reliability, from hidden tests</span></div>
            : <div><strong>{finished}</strong><span>{training ? 'examples done' : 'answers in this field'}</span></div>}
          <div><strong>{p.community?.votes ?? '—'}</strong><span>answers from everyone</span></div>
        </div>
        <p className="fine-print">{training
          ? 'Practice examples come from a synthetic sky processed by the same pipeline. Nothing here is sent anywhere.'
          : 'We never say whether one answer was right: some spots are hidden tests. Answers are anonymous. Keys: 1–4 answer, Space play/pause, ← → step, Enter next.'}</p>
      </aside>
    </div>
  </div>
}
