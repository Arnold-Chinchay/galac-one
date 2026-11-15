import type { Label } from '../data/types'

/** Small drawings of what each answer looks like over three photographs. */
export default function Pictogram({ label }: { label: Label | 'static' }) {
  const dot = (cx: number, cy: number, r = 3.2, o = 1) => <circle cx={cx} cy={cy} r={r} fill="#ffb454" opacity={o} />
  const frames = [0, 1, 2].map(i => <rect key={i} x={1 + i * 22} y={1} width={20} height={20} rx={3} fill="#0b1222" stroke="#2b4056" />)
  const marks = label === 'moving' ? <>{dot(7, 15)}{dot(33, 11)}{dot(59, 7)}</>
    : label === 'variable' ? <>{dot(11, 11, 1.8, .55)}{dot(33, 11, 4.4)}{dot(55, 11, 2.6, .8)}</>
    : label === 'artifact' ? <>{dot(33, 11, 3.6)}</>
    : label === 'static' ? <>{dot(11, 11)}{dot(33, 11)}{dot(55, 11)}</>
    : <><text x="33" y="15" textAnchor="middle" fontSize="11" fill="#8fa3bb">?</text></>
  return <svg className="pictogram" viewBox="0 0 66 22" aria-hidden="true">{frames}{marks}</svg>
}
