/** حالُ بناء الخطّة (D-332): يُقرأ بحدوده، والمنقطعُ يُعرَض فشلًا لا دورانًا إلى الأبد. */
import { describe, expect, it } from 'vitest'
import { readBuild, running, shownBuild, STALE_MS, writeBuild, type BuildStore } from './build'

function store(): BuildStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return { map, async get(k) { return map.get(k) ?? null }, async put(k, v) { map.set(k, v) } }
}

describe('حالُ بناء الخطّة', () => {
  it('يُكتب ويُقرأ لمنظّمته وحدَها، والفاسدُ والناقصُ لا يُقرآن', async () => {
    const kv = store()
    await writeBuild(kv, 'org_a', { id: 'b1', state: 'planning', done: 1, total: 4, startedAt: '2026-11-12T08:00:00Z' })
    expect(await readBuild(kv, 'org_a')).toEqual({ id: 'b1', state: 'planning', done: 1, total: 4, startedAt: '2026-11-12T08:00:00Z' })
    expect(await readBuild(kv, 'org_b')).toBeNull()
    kv.map.set('plan-build:org_c', '{bad')
    expect(await readBuild(kv, 'org_c')).toBeNull()
    kv.map.set('plan-build:org_d', JSON.stringify({ id: 'x', state: 'nonsense', done: -3, total: 0, startedAt: '2026-11-12T08:00:00Z' }))
    expect(await readBuild(kv, 'org_d')).toMatchObject({ state: 'queued', done: 0, total: 1 })
  })

  it('الجاري جارٍ حتّى ربع ساعة، وبعدها يُعرَض فشلًا بسببه — والمكتملُ والفاشلُ كما هما', () => {
    const started = '2026-11-12T08:00:00Z'
    const at = (ms: number): Date => new Date(Date.parse(started) + ms)
    const job = { id: 'b', state: 'planning' as const, done: 0, total: 2, startedAt: started }
    expect(running(job, at(60_000))).toBe(true)
    expect(running(job, at(STALE_MS + 1))).toBe(false)
    expect(running(null, at(0))).toBe(false)
    expect(shownBuild(job, at(60_000))).toBe(job)
    expect(shownBuild(job, at(STALE_MS + 1))).toMatchObject({ state: 'failed' })
    expect(shownBuild(job, at(STALE_MS + 1)).note).toContain('انقطع البناء')
    const done = { ...job, state: 'done' as const }
    expect(shownBuild(done, at(STALE_MS * 4))).toBe(done)
  })
})
