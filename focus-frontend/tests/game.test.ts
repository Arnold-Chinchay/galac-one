import test from 'node:test'
import assert from 'node:assert/strict'
import { answer, rankOf, skip } from '../src/lib/game.ts'

const fresh = { xp: 0, answers: 0, streak: 0, best: 0, badges: [] as string[], fields: [] as string[], practiceRight: 0, alias: '' }

test('points grow with the streak and a skip resets it', () => {
  let g = fresh, total = 0
  for (let i = 0; i < 5; i++) { const r = answer(g, 'barnard', { practice: false }); g = r.game; total += r.gained }
  assert.equal(total, 10 + 11 + 12 + 13 + 14)
  assert.ok(g.badges.includes('first') && g.badges.includes('streak5'))
  g = skip(g)
  assert.equal(answer(g, 'barnard', { practice: false }).gained, 10)
})

test('ranks climb with points and badges are given once', () => {
  assert.equal(rankOf(0).name, 'Stargazer')
  assert.equal(rankOf(30).name, 'Tracker')
  assert.equal(rankOf(500).to, null)
  let g = fresh
  for (const f of ['a', 'b', 'c']) g = answer(g, f, { practice: false }).game
  assert.ok(g.badges.includes('explorer'))
  assert.deepEqual(answer(g, 'a', { practice: false }).unlocked, [])
})
