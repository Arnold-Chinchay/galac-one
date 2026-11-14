import type { Field } from './types'

/** Challenge targets. Centres are catalogue reference positions, used only to find the prepared field that covers each one. */
const target = (tile_id: string, title: string, ra_deg: number, dec_deg: number, kind: 'moving' | 'variable', description: string): Field =>
  ({ tile_id, title, center: { ra_deg, dec_deg, frame: 'ICRS' }, fov_arcsec: 246, release: 'DR1', status: 'pending', origin: 'spherex', kind, description })

export const curatedTargets: Field[] = [
  target('barnards-star', 'Barnard’s Star', 269.452083333333, 4.693361111111, 'moving', 'The fastest-moving star in the sky. Watch it cross the field.'),
  target('epsilon-indi-b', 'Epsilon Indi B', 331.044166666667, -56.782833333333, 'moving', 'A nearby brown dwarf pair, tracked beyond 2.4 µm.'),
  target('wise-0855', 'WISE 0855', 133.795129166667, -7.245147222222, 'moving', 'The coldest known brown dwarf: our stand-in for Planet X.'),
  target('rw-aurigae', 'RW Aurigae', 76.956541666667, 30.401444444444, 'variable', 'A young star whose brightness changes without a clear rhythm.'),
  target('r-draconis', 'R Draconis', 248.1676075, 66.754984166667, 'variable', 'A pulsating giant. Its light curve repeats every 238 days.'),
]
