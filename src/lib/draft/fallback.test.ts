/**
 * المزوّدُ الاحتياطيّ للكتابة (D-348): مفتاحٌ ثانٍ لـ Anthropic يكتب حين يُرفض الأوّلُ أو يبلغ حدَّه — مرّةً واحدة، بدفتره،
 * ولا يُجرَّب لخطأٍ لا يُصلحه غيرُه، ولا حين يُطلب مزوّدٌ بعينه للمقارنة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { toBase64 } from '../crypto'
import { saveKey, upsertProvider } from '../providers'
import { readRoutes, wantsFallback, writeRoute } from '../ai/routes'
import { writeOnce } from './writer'

let db: FakeDb
const encKey = toBase64(crypto.getRandomValues(new Uint8Array(32)))

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

beforeEach(async () => {
  db = fakeDb()
  await upsertProvider(db, { name: 'anthropic-2', label: 'Anthropic 2', kind: 'anthropic', model: 'claude-opus-5' }, 't')
  await saveKey(db, encKey, 'anthropic-2', 'sk-second', 't')
  await writeRoute(db, 'draft', 'anthropic', 'claude-opus-5', 't', 'anthropic-2')
})

describe('المزوّدُ الاحتياطيّ للكتابة (D-348)', () => {
  it('التوجيهُ يقرأ الاحتياط، وما يستحقّه: مفتاحٌ أو حدٌّ أو انشغال — لا طلبٌ مرفوض ولا جوابٌ حوسب عليه', async () => {
    expect((await readRoutes(db)).find((r) => r.task === 'draft')?.fallback).toBe('anthropic-2')
    for (const status of [401, 403, 429, 500, 502, 503, 529]) expect(wantsFallback({ status })).toBe(true)
    for (const status of [400, 404, 422]) expect(wantsFallback({ status })).toBe(false)
    expect(wantsFallback({ status: 502, spent: { inputTokens: 1 } })).toBe(false)
    expect(wantsFallback(new Error('x'))).toBe(false)
  })

  it('الأوّلُ يبلغ حدَّه (429): يكتب الاحتياطُ بمفتاحه، والدفترُ صفٌّ واحدٌ باسمه', async () => {
    const seen: string[] = []
    const out = await writeOnce({ db, encKey, workerSecrets: { ANTHROPIC_API_KEY: 'sk-first' }, fetchImpl: anthropic({ 'sk-first': 429 }, seen) }, call)
    expect(out.kind).toBe('written')
    expect(seen).toEqual(['sk-first', 'sk-second'])
    expect(ledger()).toEqual(['anthropic-2'])
  })

  it('مفتاحٌ مرفوض (401) ثمّ رفضٌ عند الاحتياط: فشلٌ يقول الاثنين — ولا ثالث', async () => {
    const seen: string[] = []
    const out = await writeOnce({ db, encKey, workerSecrets: { ANTHROPIC_API_KEY: 'sk-first' }, fetchImpl: anthropic({ 'sk-first': 401, 'sk-second': 401 }, seen) }, call)
    expect(out.kind).toBe('failed')
    expect(seen).toEqual(['sk-first', 'sk-second'])
    if (out.kind === 'failed') expect(out.reason).toContain('والاحتياطُ')
  })

  it('طلبٌ مرفوضٌ لمحتواه (400) لا يُعاد عند الاحتياط، ولا مزوّدٌ طُلب بعينه، ولا توجيهٌ بلا احتياط', async () => {
    const seen: string[] = []
    const deps = { db, encKey, workerSecrets: { ANTHROPIC_API_KEY: 'sk-first' }, fetchImpl: anthropic({ 'sk-first': 400 }, seen) }
    expect((await writeOnce(deps, call)).kind).toBe('failed')
    expect(seen).toEqual(['sk-first'])
    seen.length = 0
    // ‏مقارنةٌ طُلب فيها مزوّدٌ غيرُ الموجَّه: لا احتياطَ لها — تقول ما فعله ذاك المزوّدُ وحده
    await writeOnce({ ...deps, fetchImpl: anthropic({ 'sk-second': 429 }, seen) }, { ...call, provider: 'anthropic-2' })
    expect(seen).toEqual(['sk-second'])
    seen.length = 0
    await writeRoute(db, 'draft', 'anthropic', 'claude-opus-5', 't', null)
    await writeOnce({ ...deps, fetchImpl: anthropic({ 'sk-first': 429 }, seen) }, call)
    expect(seen).toEqual(['sk-first'])
  })

  it('لا مفتاحَ للأوّل: يكتب الاحتياطُ', async () => {
    const seen: string[] = []
    const out = await writeOnce({ db, encKey, workerSecrets: {}, fetchImpl: anthropic({}, seen) }, call)
    expect(out.kind).toBe('written')
    expect(seen).toEqual(['sk-second'])
  })
})
