// GALAC ONE wordmark: GALAC in sepia, ONE in blue, the O drawn as an open orbit with a star on it.
import { useLayoutEffect, useRef, useState } from 'react'

const SEPIA = '#CDAE82', BLUE = '#82AAD6', STAR = '#F4E7D1'
export const TAGLINE = ['EXPLORE', 'OBSERVE', 'DISCOVER']

function Letters() {
  return <>
    <g fill={SEPIA} stroke={SEPIA}>
      <path d="M50.89 15.37 A25.5 25.5 0 1 0 55.5 30" fill="none" strokeWidth="9" />
      <path d="M60 30 H32" fill="none" strokeWidth="9" />
      <polygon stroke="none" transform="translate(74 0)" points="0,60 20,0 28,0 48,60 38.51,60 24,16.47 9.49,60" />
      <polygon stroke="none" transform="translate(136 0)" points="0,0 9,0 9,51 34,51 34,60 0,60" />
      <polygon stroke="none" transform="translate(184 0)" points="0,60 20,0 28,0 48,60 38.51,60 24,16.47 9.49,60" />
      <path transform="translate(246 0)" d="M49.53 13.61 A25.5 25.5 0 1 0 49.53 46.39" fill="none" strokeWidth="9" />
    </g>
    <circle cx="98" cy="47" r="4.6" fill={STAR} />
    <circle cx="208" cy="47" r="4.6" fill={STAR} />
    <g fill={BLUE} stroke={BLUE}>
      <path transform="translate(332 0)" d="M53.11 19.22 A25.5 25.5 0 1 1 40.78 6.89" fill="none" strokeWidth="9" />
      <polygon stroke="none" transform="translate(406 0)" points="0,60 0,0 10,0 39,44.5 39,0 48,0 48,60 38,60 9,15.5 9,60" />
      <g stroke="none" transform="translate(468 0)">
        <rect x="0" y="0" width="9" height="60" /><rect x="0" y="0" width="36" height="9" />
        <rect x="0" y="25.5" width="29" height="9" /><rect x="0" y="51" width="36" height="9" />
      </g>
    </g>
    <circle cx="380.03" cy="11.97" r="3.6" fill={STAR} />
  </>
}

/** The name alone, for the header and footer. */
export function Wordmark({ height = 22 }: { height?: number }) {
  return <svg className="wordmark" viewBox="-5 -5 514 70" height={height} role="img" aria-label="GALAC ONE"><Letters /></svg>
}

/** The name with the tagline between two rules, as on the title screen. */
export function Logo({ className }: { className?: string }) {
  const text = useRef<SVGTextElement>(null)
  const [gap, setGap] = useState<[number, number] | null>(null)
  // The rules stop just short of the tagline, whose width depends on the loaded font.
  useLayoutEffect(() => {
    const place = () => { const b = text.current?.getBBox(); if (b && b.width) setGap([b.x - 18, b.x + b.width + 18]) }
    place()
    document.fonts?.ready.then(place)
  }, [])
  const right = 4 + 504 * 1.45
  return <svg className={className} viewBox="0 0 740 165" role="img" aria-label={`GALAC ONE — ${TAGLINE.join(', ').toLowerCase()}`}>
    <g transform="translate(4 8) scale(1.45)"><Letters /></g>
    {gap && <line x1={4} x2={gap[0]} y1={141} y2={141} stroke={SEPIA} strokeWidth="1.5" />}
    <text ref={text} className="tagline" x="369.5" y="149" textAnchor="middle" fontSize="22" letterSpacing="7" fill={STAR}>
      {TAGLINE[0]}<tspan fill={BLUE}> • </tspan>{TAGLINE[1]}<tspan fill={BLUE}> • </tspan>{TAGLINE[2]}
    </text>
    {gap && <line x1={gap[1]} x2={right} y1={141} y2={141} stroke={BLUE} strokeWidth="1.5" />}
  </svg>
}

/** The open-orbit O on its own: the icon. */
export function Mark({ size = 28 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="-6 -6 63 63" aria-hidden="true">
    <path d="M53.11 19.22 A25.5 25.5 0 1 1 40.78 6.89" fill="none" stroke={BLUE} strokeWidth="9" />
    <circle cx="48.03" cy="11.97" r="4.4" fill={STAR} />
  </svg>
}
