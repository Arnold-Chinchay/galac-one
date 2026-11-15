import { useId } from 'react'
import './MethodDiagrams.css'

type DiagramKind = 'spectrum' | 'detection' | 'crowd' | 'cold'

const descriptions: Record<DiagramKind, { title: string; caption: string }> = {
  spectrum: {
    title: 'Schematic of observations at different wavelengths, a fitted static spectrum and a remaining residual.',
    caption: 'Fit the static spectrum. Reveal what remains.',
  },
  detection: {
    title: 'Schematic comparing a moving source, whose detections form a track, with a variable source at a fixed position.',
    caption: 'A track across the sky, or a change in one place.',
  },
  crowd: {
    title: 'Schematic of real candidates, hidden tests and blank controls entering a volunteer queue, with known tests used to calibrate reliability.',
    caption: 'Known tests help calibrate the crowd’s answers.',
  },
  cold: {
    title: 'Illustration of a hypothetical distant cold object, slow motion and a spectrum brighter at longer wavelengths.',
    caption: 'Look for a faint, very red and slowly moving source.',
  },
}

function SpectrumDiagram() {
  return <>
    <text x="26" y="24" className="diagram-label">FIT THE STATIC SKY</text>
    <text x="316" y="24" className="diagram-label">RESIDUAL</text>
    <g className="diagram-grid">
      <path d="M28 52H271M28 96H271M28 140H271M70 45V140M122 45V140M174 45V140M226 45V140" />
      <path d="M320 52H414M320 96H414M320 140H414" />
    </g>
    <path className="diagram-axis" d="M28 42V140H273M320 42V140H416" />
    <path className="diagram-fit" d="M34 126C62 120 76 83 102 84S141 119 170 105S218 53 264 59" />
    <path className="diagram-fit-echo" d="M34 126C62 120 76 83 102 84S141 119 170 105S218 53 264 59" />
    <g className="diagram-observations">
      <circle cx="45" cy="122" r="4" fill="#82aad6" /><circle cx="78" cy="96" r="4" fill="#91bfd2" />
      <circle cx="113" cy="89" r="4" fill="#92d2cb" /><circle cx="146" cy="113" r="4" fill="#c3d6b5" />
      <circle cx="188" cy="87" r="4" fill="#d6c497" /><circle cx="225" cy="62" r="4" fill="#d9b18c" />
      <circle cx="255" cy="59" r="4" fill="#e2a394" />
    </g>
    <path className="diagram-arrow" d="M284 94H306M300 88L306 94L300 100" />
    <path className="diagram-residual" d="M325 125L337 124L345 126L354 124L363 126L372 125L381 124L390 125L407 125" />
    <path className="diagram-residual-signal" d="M346 125C351 125 353 83 359 83S368 125 374 125" />
    <circle className="diagram-signal-glow" cx="359" cy="83" r="4.5" />
    <text x="28" y="163" className="diagram-note">wavelength →</text>
    <text x="320" y="163" className="diagram-note">change remains</text>
  </>
}

function DetectionDiagram() {
  return <>
    <text x="25" y="24" className="diagram-label">MOVING SOURCE</text>
    <text x="246" y="24" className="diagram-label">VARIABLE SOURCE</text>
    <rect className="diagram-field" x="24" y="39" width="169" height="111" rx="8" />
    <rect className="diagram-field" x="246" y="39" width="169" height="111" rx="8" />
    <g className="diagram-grid"><path d="M66 40V149M108 40V149M150 40V149M25 76H192M25 113H192M288 40V149M330 40V149M372 40V149M247 76H414M247 113H414" /></g>
    <g className="diagram-field-stars">
      <circle cx="44" cy="59" r="1.5" /><circle cx="167" cy="126" r="1.5" /><circle cx="92" cy="52" r="1" /><circle cx="61" cy="101" r="1" />
      <circle cx="269" cy="59" r="1.5" /><circle cx="389" cy="126" r="1.5" /><circle cx="311" cy="52" r="1" /><circle cx="282" cy="101" r="1" />
    </g>
    <path className="diagram-track" d="M49 126L88 105L126 84L166 62" />
    <g className="diagram-detections">
      <circle cx="49" cy="126" r="5" opacity=".35" /><circle cx="88" cy="105" r="5" opacity=".55" />
      <circle cx="126" cy="84" r="5" opacity=".75" /><circle cx="166" cy="62" r="5" />
    </g>
    <circle className="diagram-moving-signal" cx="49" cy="126" r="3" />
    <text x="219" y="99" textAnchor="middle" className="diagram-note">or</text>
    <circle className="diagram-variable-halo" cx="331" cy="95" r="21" />
    <circle className="diagram-variable-ring" cx="331" cy="95" r="12" />
    <circle className="diagram-variable-core" cx="331" cy="95" r="5" />
    <text x="25" y="173" className="diagram-note">linked positions</text>
    <text x="246" y="173" className="diagram-note">fixed position</text>
  </>
}

function Volunteer({ x, y }: { x: number; y: number }) {
  return <g className="diagram-volunteer" transform={`translate(${x} ${y})`}>
    <circle r="18" /><circle cy="-4" r="4" /><path d="M-8 9C-8 1 8 1 8 9" />
  </g>
}

function CrowdDiagram() {
  return <>
    <text x="23" y="24" className="diagram-label">A MIXED QUEUE</text>
    <text x="180" y="24" className="diagram-label">VOLUNTEERS</text>
    <text x="322" y="24" className="diagram-label">CALIBRATION</text>
    <g className="diagram-queue-card"><rect x="24" y="42" width="108" height="30" rx="5" /><rect x="24" y="86" width="108" height="30" rx="5" /><rect x="24" y="130" width="108" height="30" rx="5" /></g>
    <circle className="diagram-real-dot" cx="41" cy="57" r="3" />
    <path className="diagram-test-symbol" d="M37 101H45M41 97V105" />
    <circle className="diagram-control-symbol" cx="41" cy="145" r="4" />
    <text x="54" y="61" className="diagram-card-label">Real</text>
    <text x="54" y="105" className="diagram-card-label">Test</text>
    <text x="54" y="149" className="diagram-card-label">Blank</text>
    <g className="diagram-connections"><path d="M132 57H150V101H187M132 101H187M132 145H150V101M223 57H257V101H323M223 101H323M223 145H257V101M169 101V57H187M169 101V145H187" /></g>
    <path className="diagram-answer-flow" d="M223 101H323" />
    <Volunteer x={205} y={57} /><Volunteer x={205} y={101} /><Volunteer x={205} y={145} />
    <circle className="diagram-calibration-ring" cx="358" cy="101" r="32" />
    <path className="diagram-calibration-arc" d="M338 125A31 31 0 1 1 383 83" />
    <path className="diagram-calibration-check" d="M347 101L355 109L370 93" />
    <text x="323" y="158" className="diagram-note">reliability</text>
  </>
}

function ColdDiagram({ gradientId }: { gradientId: string }) {
  return <>
    <defs>
      <radialGradient id={gradientId} cx="28%" cy="20%" r="90%"><stop offset="0" stopColor="#547b9b" /><stop offset=".44" stopColor="#1b344b" /><stop offset="1" stopColor="#07111d" /></radialGradient>
    </defs>
    <text x="25" y="24" className="diagram-label">FAINT + SLOW</text>
    <text x="251" y="24" className="diagram-label">VERY RED</text>
    <g className="diagram-field-stars"><circle cx="32" cy="62" r="1.4" /><circle cx="185" cy="47" r="1" /><circle cx="174" cy="148" r="1.5" /><circle cx="65" cy="157" r="1" /></g>
    <ellipse className="diagram-cold-orbit" cx="113" cy="97" rx="90" ry="39" transform="rotate(-24 113 97)" />
    <g className="diagram-cold-object"><circle cx="112" cy="94" r="35" fill={`url(#${gradientId})`} /><path className="diagram-cold-rim" d="M83 113A35 35 0 0 1 137 70" /></g>
    <path className="diagram-slow-trail" d="M164 69L177 60L188 51" />
    <circle className="diagram-cold-traveller" cx="177" cy="60" r="3.5" />
    <path className="diagram-axis" d="M246 46V139H414" />
    <g className="diagram-grid"><path d="M247 61H413M247 100H413" /></g>
    <g className="diagram-cold-bands">
      <rect x="260" y="132" width="18" height="7" rx="2" fill="#82aad6" /><rect x="290" y="126" width="18" height="13" rx="2" fill="#9bbbc5" />
      <rect x="320" y="111" width="18" height="28" rx="2" fill="#c0c4b1" /><rect x="350" y="88" width="18" height="51" rx="2" fill="#d5b28c" />
      <rect x="380" y="58" width="18" height="81" rx="2" fill="#e2a08f" />
    </g>
    <text x="26" y="173" className="diagram-note">a distant cold object</text>
    <text x="247" y="163" className="diagram-note">shorter</text><text x="346" y="163" className="diagram-note">longer λ →</text>
  </>
}

export default function MethodDiagram({ kind }: { kind: DiagramKind }) {
  const id = useId()
  const { title, caption } = descriptions[kind]
  return <figure className={`method-diagram method-diagram-${kind}`}>
    <svg viewBox="0 0 440 192" role="img" aria-label={title}>
      {kind === 'spectrum' ? <SpectrumDiagram /> : kind === 'detection' ? <DetectionDiagram /> : kind === 'crowd' ? <CrowdDiagram /> : <ColdDiagram gradientId={`cold-illustration-${id}`} />}
    </svg>
    <figcaption><span>SCHEMATIC</span><span>{caption}</span></figcaption>
  </figure>
}
