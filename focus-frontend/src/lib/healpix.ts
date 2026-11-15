// HEALPix nested pixel index for a sky position (the scheme the sky crawler names its regions with).
export function pixNest(order: number, raDeg: number, decDeg: number): number {
  const nside = 2 ** order, rad = Math.PI / 180
  const z = Math.sin(decDeg * rad), za = Math.abs(z)
  const tt = (((raDeg % 360) + 360) % 360) / 90
  let face: number, ix: number, iy: number
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt), t2 = nside * z * 0.75
    const jp = Math.floor(t1 - t2), jm = Math.floor(t1 + t2)
    const ifp = Math.floor(jp / nside), ifm = Math.floor(jm / nside)
    face = ifp === ifm ? (ifp | 4) : ifp < ifm ? ifp : ifm + 8
    ix = jm & (nside - 1); iy = nside - (jp & (nside - 1)) - 1
  } else {
    const ntt = Math.min(3, Math.floor(tt)), tp = tt - ntt
    const tmp = nside * Math.sqrt(3 * (1 - za))
    const jp = Math.min(nside - 1, Math.floor(tp * tmp)), jm = Math.min(nside - 1, Math.floor((1 - tp) * tmp))
    if (z >= 0) { face = ntt; ix = nside - jm - 1; iy = nside - jp - 1 } else { face = ntt + 8; ix = jp; iy = jm }
  }
  let bits = 0
  for (let b = 0; b < order; b++) bits += (((ix >> b) & 1) << (2 * b)) + (((iy >> b) & 1) << (2 * b + 1))
  return face * nside * nside + bits
}
