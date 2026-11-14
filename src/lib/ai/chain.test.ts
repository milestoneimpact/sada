/**
 * سلسلةُ المفاتيح (D-349): الترتيب (بترتيبي · الأرخص أوّلًا)، والانتقالُ عند التعذّر مرّةً لكلّ حلقة، وتخطّي المعلَّم، وسقفُ الثلاث،
 * وما لا ينتقل، والدفترُ باسم كلّ مفتاح — والتنبيهُ بالمفتاح المرفوض.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { toBase64 } from '../crypto'
import { saveKey, upsertProvider } from '../providers'
import { readRoutes, writeRoute } from './routes'
import { candidates, clearHealth, markDown, nextFrom, orderChain, readHealth } from './chain'
import { writeOnce } from '../draft/writer'
import { collectNotices } from '../notices'

let db: FakeDb
const encKey = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const now = new Date('2099-01-01T10:00:00Z')

/** Anthropic مزيَّف: يردّ بحسب المفتاح — `status` لكلّ مفتاح، وما سواه 200 بنصٍّ صالح. */
function anthropic(statusByKey: Record<string, number>, seen: string[]): typeof fetch {
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    const key = request.headers.get('x-api-key') ?? ''
    seen.push(key)
    const status = statusByKey[key] ?? 200
    if (status !== 200) return new Response(JSON.stringify({ error: { message: 'لا' } }), { status, headers: { 'Content-Type': 'application/json' } })
    return new Response(JSON.stringify({
      id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify({ text: 'منشور' }) }], usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof fetch
}

const call = { system: 's', user: 'u', schema: { type: 'object' }, operation: 'draft:test', refId: 'src-1' }
const ledger = (): string[] => (db.raw.prepare('SELECT provider FROM cost_ledger ORDER BY rowid').all() as { provider: string }[]).map((r) => r.provider)
const deps = (statusByKey: Record<string, number>, seen: string[]) =>
  ({ db, encKey, workerSecrets: { ANTHROPIC_API_KEY: 'sk-first' }, fetchImpl: anthropic(statusByKey, seen) })

beforeEach(async () => {
  db = fakeDb()
  for (const [name, key, price] of [['anthropic-2', 'sk-second', 3], ['anthropic-3', 'sk-third', 1]] as const) {
    await upsertProvider(db, { name, label: name, kind: 'anthropic', model: 'claude-opus-5', priceIn: price, priceOut: price }, 't')
    await saveKey(db, encKey, name, key, 't')
  }
  await writeRoute(db, 'draft', 'anthropic', 'claude-opus-5', 't', { chain: ['anthropic-2', 'anthropic-3'], order: 'mine' })
})

describe('سلسلةُ المفاتيح (D-349)', () => {
  it('التوجيهُ يقرأ السلسلةَ والترتيب، والفهمُ «الأرخصُ أوّلًا» افتراضًا والخطّةُ والكتابةُ «بترتيبي»', async () => {
    const routes = await readRoutes(db)
    expect(routes.find((r) => r.task === 'draft')).toMatchObject({ chain: ['anthropic-2', 'anthropic-3'], order: 'mine' })
    expect(routes.find((r) => r.task === 'analyze')?.order).toBe('cheap')
    expect(routes.find((r) => r.task === 'plan')?.order).toBe('mine')
  })

  it('«الأرخصُ أوّلًا»: السعرُ صعودًا، والصفرُ أوّلًا، وما لا سعرَ له آخرًا، والتعادلُ يُبقي المكتوب', () => {
    const p = (n: string, price: number | null) => ({ n, priceIn: price, priceOut: price === null ? null : 0 })
    expect(orderChain([p('a', 5), p('b', null), p('c', 0), p('d', 1), p('e', 1)], 'cheap').map((x) => x.n)).toEqual(['c', 'd', 'e', 'a', 'b'])
    expect(orderChain([p('a', 5), p('c', 0)], 'mine').map((x) => x.n)).toEqual(['a', 'c'])
  })

  it('الأوّلُ عند الحدّ (429): تكتب الحلقةُ الثانية، ويُعلَّم الأوّلُ فلا يُجرَّب في النداء التالي، والدفترُ باسم من كتب', async () => {
    const seen: string[] = []
    expect((await writeOnce(deps({ 'sk-first': 429 }, seen), call)).kind).toBe('written')
    expect(seen).toEqual(['sk-first', 'sk-second'])
    expect((await readHealth(db, new Date())).get('anthropic')?.why).toBe('limit')
    seen.length = 0
    await writeOnce(deps({}, seen), call)
    expect(seen).toEqual(['sk-second'])
    expect(ledger()).toEqual(['anthropic-2', 'anthropic-2'])
  })

  it('مفتاحٌ مرفوضٌ ثمّ حدٌّ ثمّ انشغال: ثلاثُ محاولاتٍ لا أكثر، وفشلٌ يقول الثلاثة — والمرفوضُ تنبيهٌ للمالك', async () => {
    const seen: string[] = []
    const out = await writeOnce(deps({ 'sk-first': 401, 'sk-second': 429, 'sk-third': 529 }, seen), call)
    expect(out.kind).toBe('failed')
    expect(seen).toEqual(['sk-first', 'sk-second', 'sk-third'])
    if (out.kind === 'failed') expect(out.reason.split(' — ثمّ ')).toHaveLength(3)
    const notes = await collectNotices(db, 'org_owner', new Date(), { pulses: [], allowance: null })
    expect(notes.find((n) => n.kind === 'key')?.text).toContain('رُفض مفتاح')
  })

  it('ما لا ينتقل: طلبٌ مرفوضٌ لمحتواه يتوقّف عند الأوّل — والمقارنةُ بمزوّدٍ بعينه وحدَه', async () => {
    const seen: string[] = []
    expect((await writeOnce(deps({ 'sk-first': 400 }, seen), call)).kind).toBe('failed')
    expect(seen).toEqual(['sk-first'])
    seen.length = 0
    await writeOnce(deps({ 'sk-third': 429 }, seen), { ...call, provider: 'anthropic-3' })
    expect(seen).toEqual(['sk-third'])
  })

  it('«الأرخصُ أوّلًا» على الكتابة: الأرخصُ يكتب أوّلًا — والمعلَّمون آخرًا لا محذوفين، ومفتاحٌ جديدٌ يرفع العلم', async () => {
    await writeRoute(db, 'draft', 'anthropic', 'claude-opus-5', 't', { order: 'cheap' })
    // ‏المدمَجُ بلا سعرٍ مضبوط: آخرًا. والثالثُ (1) قبل الثاني (3)
    expect((await candidates(db, 'draft', now)).map((c) => c.provider.name)).toEqual(['anthropic-3', 'anthropic-2', 'anthropic'])
    await markDown(db, 'anthropic-3', 'key', now)
    expect((await candidates(db, 'draft', now)).map((c) => c.provider.name)).toEqual(['anthropic-2', 'anthropic', 'anthropic-3'])
    await clearHealth(db, 'anthropic-3')
    expect((await candidates(db, 'draft', now))[0]?.provider.name).toBe('anthropic-3')
  })

  it('سببُ الانتقال من الخطأ: مفتاحٌ وحدٌّ وانشغال — لا محتوى ولا ما حوسب عليه', () => {
    expect(nextFrom({ status: 401 })).toBe('key')
    expect(nextFrom({ status: 429 })).toBe('limit')
    expect(nextFrom({ status: 529 })).toBe('busy')
    expect(nextFrom({ status: 422 })).toBeNull()
    expect(nextFrom({ status: 502, spent: { inputTokens: 1 } })).toBeNull()
    expect(nextFrom(new Error('x'))).toBeNull()
  })
})
