import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pixNest } from '../src/lib/healpix.ts'

test('nested HEALPix index matches astropy-healpix', () => {
  assert.equal(pixNest(5, 170.972, 10.919), 6955)
  assert.equal(pixNest(7, 170.972, 10.919), 111291)
  const ref: [number, number, number][] = [[184.256, 5.692, 6917], [342.167, -70.888, 11340], [51.897, 30.466, 214], [341.514, 4.375, 4805],
    [112.259, -19.91, 9983], [152.398, 35.23, 1338], [297.973, -23.179, 12192], [147.312, -5.336, 6790]]
  for (const [ra, dec, p] of ref) assert.equal(pixNest(5, ra, dec), p)
})
