// The game layer of Classify: points, streaks, ranks and badges, kept on this device. Nothing here changes
// what is sent to the server; it only rewards taking part. Right/wrong is never shown for real spots.
import { safeRead, safeWrite } from './storage.ts'

export interface Game { xp: number; answers: number; streak: number; best: number; badges: string[]; fields: string[]; practiceRight: number; alias: string }
const KEY = 'galac.game.v1'
const EMPTY: Game = { xp: 0, answers: 0, streak: 0, best: 0, badges: [], fields: [], practiceRight: 0, alias: '' }

export const RANKS: [number, string][] = [[0, 'Stargazer'], [10, 'Spotter'], [30, 'Tracker'], [75, 'Hunter'], [150, 'Planet X Seeker']]
export const BADGES: Record<string, { name: string; how: string }> = {
  first: { name: 'First look', how: 'Answer your first spot' },
  ten: { name: 'Ten spots', how: 'Answer 10 spots' },
  fifty: { name: 'Half a hundred', how: 'Answer 50 spots' },
  streak5: { name: 'On a roll', how: 'Answer 5 in a row without skipping' },
  explorer: { name: 'Explorer', how: 'Answer spots in 3 different fields' },
  cleared: { name: 'Field cleared', how: 'Answer every spot in a field' },
  sharp: { name: 'Sharp eye', how: 'Get 4 practice examples right' },
  follower: { name: 'Star follower', how: 'Send a star you followed yourself' },
}

export const loadGame = (): Game => ({ ...EMPTY, ...safeRead<Partial<Game>>(KEY, {}) })
export const saveGame = (g: Game) => safeWrite(KEY, g)

export function rankOf(xp: number) {
  let i = 0
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++
  const [from, name] = RANKS[i], next = RANKS[i + 1]
  return { name, level: i + 1, from, to: next?.[0] ?? null, nextName: next?.[1] ?? null, progress: next ? (xp - from) / (next[0] - from) : 1 }
}

/** One answer. Points grow with the streak (10 + 1 per answer in a row, capped at +10). */
export function answer(g: Game, field: string, opts: { practice: boolean; right?: boolean; cleared?: boolean }): { game: Game; gained: number; unlocked: string[] } {
  const streak = g.streak + 1, gained = 10 + Math.min(streak - 1, 10)
  const fields = g.fields.includes(field) || opts.practice ? g.fields : [...g.fields, field]
  const next: Game = { ...g, xp: g.xp + gained, answers: g.answers + 1, streak, best: Math.max(g.best, streak), fields,
    practiceRight: g.practiceRight + (opts.practice && opts.right ? 1 : 0) }
  const earned = new Set(g.badges), unlocked: string[] = []
  const give = (id: string, when: boolean) => { if (when && !earned.has(id)) { earned.add(id); unlocked.push(id) } }
  give('first', next.answers >= 1); give('ten', next.answers >= 10); give('fifty', next.answers >= 50)
  give('streak5', streak >= 5); give('explorer', fields.length >= 3); give('cleared', !!opts.cleared); give('sharp', next.practiceRight >= 4)
  return { game: { ...next, badges: [...earned] }, gained, unlocked }
}
export const skip = (g: Game): Game => ({ ...g, streak: 0 })
export function award(g: Game, id: string): { game: Game; unlocked: string[] } {
  return g.badges.includes(id) ? { game: g, unlocked: [] } : { game: { ...g, badges: [...g.badges, id] }, unlocked: [id] }
}
