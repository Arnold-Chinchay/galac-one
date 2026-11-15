import { useId } from 'react'
import './CelestialBackdrop.css'

type Props = { variant: 'classify' | 'about' }

const stars = [
  [74, 120, 1], [199, 330, .8], [342, 78, 1.1], [472, 233, .7],
  [621, 110, .9], [785, 360, .8], [934, 89, 1.3], [1090, 262, .8],
  [1281, 145, 1], [1455, 405, 1.2], [1544, 82, .7], [88, 631, .8],
  [226, 807, 1.1], [405, 533, .7], [557, 914, 1], [694, 674, .8],
  [863, 846, 1.2], [1006, 589, .7], [1170, 935, .8], [1333, 722, 1.1],
  [1516, 931, .8], [122, 954, .7], [491, 726, .9], [1211, 459, .7],
]

// Two diffuse logarithmic arms give the galaxy a recognizable silhouette.
const spiralArm = Array.from({ length: 100 }, (_, i) => {
  const angle = i / 99 * Math.PI * 3.9
  const radius = 12 * Math.exp(angle * .25)
  return `${i ? 'L' : 'M'}${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`
}).join(' ')

export default function CelestialBackdrop({ variant }: Props) {
  const uid = useId().replace(/:/g, '')
  const id = (name: string) => `celestial-${uid}-${name}`
  const url = (name: string) => `url(#${id(name)})`

  return <div className={`celestial-backdrop celestial-backdrop--${variant}`} aria-hidden="true">
    <svg className="celestial-stars" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" focusable="false">
      {stars.map(([cx, cy, r], i) => <circle key={i} className={i % 5 === 0 ? 'celestial-star celestial-star--glint' : 'celestial-star'} cx={cx} cy={cy} r={r} style={{ animationDelay: `${i * -1.7}s` }} />)}
      <path className="celestial-star-cross" d="M1455 393v24m-12-12h24M342 70v16m-8-8h16M226 799v16m-8-8h16" />
    </svg>

    {variant === 'classify' ? <>
      <svg className="celestial-planet" viewBox="0 0 600 600" focusable="false">
        <defs>
          <radialGradient id={id('planet-body')} cx="74%" cy="62%" r="66%">
            <stop offset="0" stopColor="#31566f" />
            <stop offset=".56" stopColor="#142b40" />
            <stop offset="1" stopColor="#0a1422" />
          </radialGradient>
          <linearGradient id={id('planet-rim')} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#82aad6" stopOpacity=".2" />
            <stop offset=".6" stopColor="#82aad6" />
            <stop offset="1" stopColor="#78ecdb" stopOpacity=".8" />
          </linearGradient>
          <mask id={id('crescent')}>
            <circle cx="300" cy="300" r="218" fill="#fff" />
            <circle cx="251" cy="265" r="224" fill="#000" />
          </mask>
          <filter id={id('planet-soften')} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <circle cx="300" cy="300" r="218" fill={url('planet-body')} opacity=".6" />
        <circle cx="300" cy="300" r="218" fill={url('planet-rim')} mask={url('crescent')} opacity=".55" />
        <circle cx="300" cy="300" r="219" fill="none" stroke={url('planet-rim')} strokeWidth="6" mask={url('crescent')} filter={url('planet-soften')} />
        <circle cx="300" cy="300" r="218" fill="none" stroke={url('planet-rim')} strokeWidth="1.3" opacity=".65" />
      </svg>
      <svg className="celestial-comet" viewBox="0 0 360 100" focusable="false">
        <defs>
          <linearGradient id={id('comet-tail')}>
            <stop stopColor="#82aad6" stopOpacity="0" />
            <stop offset=".65" stopColor="#82aad6" stopOpacity=".22" />
            <stop offset="1" stopColor="#b2e5df" stopOpacity=".85" />
          </linearGradient>
          <filter id={id('comet-soften')} x="-10%" y="-100%" width="120%" height="300%">
            <feGaussianBlur stdDeviation="2.3" />
          </filter>
        </defs>
        <path d="M8 34 Q190 42 329 64" fill="none" stroke={url('comet-tail')} strokeWidth="9" filter={url('comet-soften')} />
        <path d="M8 34 Q190 42 329 64" fill="none" stroke={url('comet-tail')} strokeWidth="1" />
        <circle cx="329" cy="64" r="2.5" fill="#c8ece9" />
      </svg>
    </> : <>
      <svg className="celestial-galaxy celestial-galaxy--spiral" viewBox="0 0 720 500" focusable="false">
        <defs>
          <radialGradient id={id('galaxy-halo')}>
            <stop stopColor="#dfc49b" stopOpacity=".45" />
            <stop offset=".2" stopColor="#82aad6" stopOpacity=".19" />
            <stop offset=".65" stopColor="#82aad6" stopOpacity=".07" />
            <stop offset="1" stopColor="#82aad6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id('galaxy-core')}>
            <stop stopColor="#efdec1" stopOpacity=".85" />
            <stop offset=".15" stopColor="#d9c39e" stopOpacity=".5" />
            <stop offset="1" stopColor="#d9c39e" stopOpacity="0" />
          </radialGradient>
          <filter id={id('galaxy-soften')} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g transform="translate(360 250) rotate(-24) scale(1 .62)">
          <ellipse rx="300" ry="290" fill={url('galaxy-halo')} />
          <g fill="none" stroke="#82aad6" strokeLinecap="round" filter={url('galaxy-soften')}>
            <path d={spiralArm} strokeWidth="16" opacity=".45" />
            <path d={spiralArm} strokeWidth="16" opacity=".45" transform="rotate(180)" />
          </g>
          <g fill="none" stroke="#9abbd7" strokeWidth="2.4" opacity=".32">
            <path d={spiralArm} />
            <path d={spiralArm} transform="rotate(180)" />
          </g>
          <ellipse rx="68" ry="65" fill={url('galaxy-core')} />
          <circle r="4" fill="#ead6b5" opacity=".65" />
        </g>
      </svg>

      <svg className="celestial-galaxy celestial-galaxy--edge" viewBox="0 0 900 340" focusable="false">
        <defs>
          <radialGradient id={id('edge-disc')}>
            <stop stopColor="#cfbf9e" stopOpacity=".65" />
            <stop offset=".16" stopColor="#a9c4d5" stopOpacity=".4" />
            <stop offset=".5" stopColor="#82aad6" stopOpacity=".2" />
            <stop offset="1" stopColor="#82aad6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={id('edge-bulge')}>
            <stop stopColor="#e7d7b7" stopOpacity=".65" />
            <stop offset=".3" stopColor="#c0cbd2" stopOpacity=".25" />
            <stop offset="1" stopColor="#82aad6" stopOpacity="0" />
          </radialGradient>
          <filter id={id('edge-soften')} x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>
        <g transform="translate(450 170) rotate(-16)">
          <ellipse rx="420" ry="68" fill={url('edge-disc')} />
          <ellipse rx="104" ry="108" fill={url('edge-bulge')} />
          <path d="M-350 5 Q0-12 350 5" fill="none" stroke="#07121f" strokeWidth="8" opacity=".85" filter={url('edge-soften')} />
          <path d="M-310 12 Q0-2 310 12" fill="none" stroke="#94b7ce" strokeWidth="1.5" opacity=".2" />
        </g>
      </svg>

      <svg className="celestial-system" viewBox="0 0 640 640" focusable="false">
        <defs>
          <radialGradient id={id('system-sun')}>
            <stop stopColor="#d6b582" stopOpacity=".8" />
            <stop offset=".2" stopColor="#d6b582" stopOpacity=".2" />
            <stop offset="1" stopColor="#d6b582" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g transform="translate(320 320) rotate(-28) scale(1 .55)" fill="none" stroke="#82aad6" strokeWidth="1">
          <ellipse rx="84" ry="84" opacity=".6" />
          <ellipse rx="150" ry="150" opacity=".48" />
          <ellipse rx="222" ry="222" opacity=".38" />
          <ellipse rx="294" ry="294" opacity=".3" />
          <circle cx="-102" cy="110" r="6" fill="#82aad6" stroke="none" />
          <circle cx="204" cy="87" r="9" fill="#78ecdb" stroke="none" opacity=".65" />
          <circle cx="-270" cy="116" r="13" fill="#d6b582" stroke="none" opacity=".55" />
        </g>
        <circle cx="320" cy="320" r="45" fill={url('system-sun')} />
        <circle cx="320" cy="320" r="4" fill="#d6b582" opacity=".7" />
      </svg>
    </>}
  </div>
}
