/**
 * حراسةُ المفاتيح (D-348): الاختبارُ يُحفظ بزمنه، والفجرُ يختبر المفعَّلَ ذا المفتاح وحده، والإشعارُ يُشتقّ من آخر فشلٍ
 * ويزول بأوّل نجاح، ومرجعُه ثابتٌ ما دام العطلُ نفسَه.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { dailyChecks, failingProviders, failingSince, testProviderKey } from './health'
import { getProvider, setEnabled, upsertProvider } from '../providers'
import { collectNotices, unreadNotices } from '../notices'
import { collectAlerts } from '../alerts/collect'

let db: FakeDb

/** مزوّدٌ يجيب بالرمز المعطى — والزمنُ مزيّفٌ ليُقاس. */
function net(status: number): typeof fetch {
  return (async () => new Response('{"data":[]}', { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
}
function clock(step: number): () => number {
  let t = Date.parse('2026-11-14T03:03:00Z')
  return () => (t += step)
}

beforeEach(async () => {
  db = fakeDb()
  await upsertProvider(db, { name: 'deepseek', label: 'DeepSeek', kind: 'openai_compat', baseUrl: 'https://api.deepseek.com/v1' }, 'test')
})

async function provider(name: string) {
  const p = await getProvider(db, name)
  if (p === null) throw new Error(`لا مزوّد ${name}`)
  return p
}

describe('testProviderKey', () => {
  it('يكتب صفًّا بنتيجته وزمنه ومصدره', async () => {
    const r = await testProviderKey(db, await provider('deepseek'), 'sk-x', 'panel', net(200), clock(412))
    expect(r).toMatchObject({ ok: true, ms: 412, source: 'panel' })
    const row = db.raw.prepare('SELECT provider, ok, ms, source FROM provider_checks').get()
    expect(row).toEqual({ provider: 'deepseek', ok: 1, ms: 412, source: 'panel' })
    expect((await provider('deepseek')).verifiedAt).not.toBeNull()
  })

  it('الرفضُ يُحفظ برمزه وشرحنا لا بنصّ المزوّد', async () => {
    const r = await testProviderKey(db, await provider('deepseek'), 'sk-x', 'panel', net(401), clock(90))
    expect(r.ok).toBe(false)
    expect(r.status).toBe(401)
    const row = db.raw.prepare('SELECT ok, status, detail FROM provider_checks').get() as { ok: number; status: number; detail: string }
    expect(row.ok).toBe(0)
    expect(row.status).toBe(401)
    expect(row.detail).not.toContain('data')
  })

  it('بلا مفتاح: صفٌّ فاشل، ولا نداء', async () => {
    let called = false
    const spy = (async () => { called = true; return new Response('') }) as unknown as typeof fetch
    const r = await testProviderKey(db, await provider('deepseek'), null, 'panel', spy)
    expect(r.ok).toBe(false)
    expect(called).toBe(false)
  })
})

describe('dailyChecks', () => {
  it('يختبر المفعَّلَ ذا المفتاح وحده', async () => {
    await upsertProvider(db, { name: 'groq', label: 'Groq', kind: 'openai_compat', baseUrl: 'https://api.groq.com/openai/v1' }, 'test')
    await upsertProvider(db, { name: 'off', label: 'Off', kind: 'openai_compat', baseUrl: 'https://x.test/v1' }, 'test')
    await setEnabled(db, 'off', false, 'test')
    const keys: Record<string, string> = { deepseek: 'sk-1', off: 'sk-3' }
    const done = await dailyChecks(db, async (p) => keys[p.name] ?? null, net(200))
    expect(done.map((c) => c.provider).sort()).toEqual(['deepseek'])
    expect(done.every((c) => c.source === 'daily')).toBe(true)
  })
})

describe('الإشعار والتنبيه', () => {
  it('فشلٌ يُنشئ إشعارًا وتنبيهًا بمرجعٍ ثابت، ونجاحٌ يمحوهما', async () => {
    const p = await provider('deepseek')
    let t = Date.parse('2026-11-14T03:00:00Z')
    const at = () => (t += 60_000)
    const first = await testProviderKey(db, p, 'sk', 'daily', net(401), at)
    await testProviderKey(db, p, 'sk', 'daily', net(401), at)
    const since = await failingSince(db, 'deepseek')
    // ‏المرجعُ من أوّل الفشل لا آخره: فجرٌ ثانٍ بالعطل نفسِه لا يُنشئ إشعارًا جديدًا
    expect(since).toBe(first.at)

    expect(await failingProviders(db)).toHaveLength(1)
    const notices = await collectNotices(db, 'org_owner', new Date(), { pulses: [], allowance: null })
    const n = notices.find((x) => x.kind === 'provider')
    expect(n?.ref).toBe(`provider:deepseek:${since}`)
    expect(n?.text).toContain('DeepSeek')
    expect(await unreadNotices(db, 'org_owner', [])).toBeGreaterThanOrEqual(1)

    const alerts = await collectAlerts(db, new Date(), 0)
    const a = alerts.find((x) => x.kind === 'provider')
    expect(a?.ref).toBe(`provider:deepseek:${since}`)
    expect(a?.body).not.toMatch(/sk[-_]/)

    // ‏ولا يُرى في منظّمة عميل
    const client = await collectNotices(db, 'org_client', new Date(), { pulses: [], allowance: null })
    expect(client.some((x) => x.kind === 'provider')).toBe(false)

    await testProviderKey(db, p, 'sk', 'panel', net(200), at)
    expect(await failingProviders(db)).toHaveLength(0)
    const after = await collectNotices(db, 'org_owner', new Date(), { pulses: [], allowance: null })
    expect(after.some((x) => x.kind === 'provider')).toBe(false)
  })

  it('المعطَّلُ لا يُنذر', async () => {
    const p = await provider('deepseek')
    await testProviderKey(db, p, 'sk', 'daily', net(401))
    await setEnabled(db, 'deepseek', false, 'test')
    expect(await failingProviders(db)).toHaveLength(0)
  })
})
