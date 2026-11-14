// Plain-language caption for whatever picture is on screen.
import type { Frame, Tile } from '../data/types'
import type { View } from '../lib/render'
import { timeColour } from '../lib/render'

function WavelengthBar({ um }: { um: number }) {
  // Log scale from violet light (0.4 µm) to the red end of SPHEREx (5 µm).
  const at = (v: number) => (Math.log(v) - Math.log(0.4)) / (Math.log(5) - Math.log(0.4)) * 100
  return <div className="wave-bar" role="img" aria-label={`This exposure was taken at ${um.toFixed(2)} micrometres, in the infrared`}>
    <div className="wave-track"><i className="wave-visible" style={{ width: `${at(0.7)}%` }} /><i className="wave-marker" style={{ left: `${at(um)}%` }} /></div>
    <div className="wave-labels"><span>what eyes see</span><span style={{ left: `${at(0.75)}%` }}>infrared, invisible to us →</span></div>
  </div>
}

export default function Explain({ view, frame, tile, combine }: { view: View; frame: Frame; tile: Tile; combine: number }) {
  const arcmin = (tile.manifest.fov_arcsec / 60).toFixed(0), n = tile.frames.length, um = frame.wavelength_um
  const first = tile.frames[0]?.observed_at_utc.slice(0, 10), last = tile.frames.at(-1)?.observed_at_utc.slice(0, 10)
  return <div className="explain">
    <strong>What am I looking at?</strong>
    {view === 'science' && <>
      <p>One photograph by the SPHEREx space telescope of a patch of sky about {arcmin} arcminutes wide, roughly one-eighth the width of the full Moon. Each glowing blob is a star or a galaxy. The colours are not real: brighter means more infrared light.</p>
      {um && <><p>This photograph was taken in light of {um.toFixed(2)} µm, {(um / 0.7).toFixed(1)} times redder than the reddest light an eye can see. The next one will be at a different wavelength, which is why the stars seem to flicker when you press play.</p><WavelengthBar um={um} /></>}
    </>}
    {view === 'residual' && <>
      <p>The same photograph after subtracting what this patch of sky normally looks like at that wavelength. Dark means nothing changed. <b className="warm">Amber</b> is brighter than usual, <b className="cool">blue</b> is fainter than usual.</p>
      <p>A real moving object shows up as an amber dot that sits in a slightly different place each time. {combine > 1 ? `You are seeing ${combine} neighbouring exposures added together, which makes faint things about ${Math.sqrt(combine).toFixed(1)} times easier to see.` : 'Raise “Combine exposures” to add neighbouring photographs together and pull faint things out of the noise.'}</p>
    </>}
    {view === 'colour' && <p>All {n} photographs of this field, taken between {first} and {last}, combined into one colour picture. Blue is the shortest infrared light (0.75–1.6 µm), green the middle (1.6–3 µm) and red the longest (3–5 µm). Ordinary stars look blue-white; cool objects such as brown dwarfs look red. Combining them removes most of the noise of a single photograph.</p>}
    {view === 'motion' && <>
      <p>Every significant brightening found in the {n} photographs, drawn in a single picture and coloured by date.</p>
      <div className="time-legend"><span>{first}</span><i style={{ background: `linear-gradient(90deg,${[0, .2, .4, .6, .8, 1].map(timeColour).join(',')})` }} /><span>{last}</span></div>
      <p>A streak that changes colour along its length is something that moved. A spot of mixed colours changed brightness in place. A speck of one colour appeared once: usually a cosmic-ray hit. Very bright stars leave smudges because their subtraction is never perfect.</p>
    </>}
  </div>
}
