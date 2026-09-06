/**
 * يختبر **الترتيب** لا الوظيفة وحدها.
 *
 * ثلاثةُ أسئلةٍ لا يجيبها تشغيلٌ ناجح واحد:
 *
 *   · أيقع النداءُ المدفوع قبل الحارس أم بعده؟
 *   · أتُسجَّل الكلفةُ حين تفشل الكتابة بعدها؟
 *   · أتُسوَّد النسخةُ الواحدة مرّتين؟
 *
 * والقاعدةُ حقيقيّة في كلّ ما يلي — والشبكةُ وحدها مزيّفة. فقيدُ D-009
 * الذي يمنع `queued` بلا اعتماد يُقطَع فعلا لا يُفترَض.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { draftKey, draftPost, type DraftDeps } from './job'
import { PLATFORMS } from './prompt'
import { writeSetting } from '../settings'

let db: FakeDb
let calls: { url: string; body: unknown }[]

const OK = { text: 'ن'.repeat(300), rationale: 'زاويةُ الأثر لا زاويةُ الإعلان.' }

/** يزيّف Anthropic وحده — ولا نداءَ آخر في هذا المسار. */
function net(options: { draft?: unknown; status?: number; usage?: Record<string, number> } = {}) {
  calls = []
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const url = request !== null ? request.url : String(input)
    let body: unknown = null
    try {
      body = JSON.parse(String(request !== null ? await request.clone().text() : (init?.body ?? '{}')))
    } catch {
      body = null
    }
    calls.push({ url, body })

    if (!url.includes('api.anthropic.com')) throw new Error(`نداء غير متوقّع: ${url}`)
    if ((options.status ?? 200) !== 200) {
      return new Response(JSON.stringify({ error: { message: 'لا' } }), {
        status: options.status ?? 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(options.draft ?? OK) }],
        usage: options.usage ?? { input_tokens: 900, output_tokens: 400, cache_read_input_tokens: 100 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

/** مصدرٌ محلَّل: صفٌّ في `sources` وخلاصةٌ في `content_items` ببصمته. */
async function seed(hash = 'md5:abc'): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      "INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES (?, 'drive-1', 'تقرير الأثر', 'application/vnd.google-apps.document', ?)",
    )
    .bind(id, hash)
    .run()
  await db
    .prepare(
      'INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(),
      id,
      'خلاصةٌ عربية عن أثر الوقف في التعليم.',
      JSON.stringify({ hash, themes: ['الوقف', 'التعليم'] }),
      0.82,
    )
    .run()
  return id
}

function deps(fetchImpl: typeof fetch): DraftDeps {
  return {
    db,
    encKey: '',
    workerSecrets: { ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl,
  }
}

async function ledger(): Promise<{ provider: string; operation: string; total: number }[]> {
  const { results } = await db
    .prepare('SELECT provider, operation, total FROM cost_ledger')
    .all<{ provider: string; operation: string; total: number }>()
  return results
}

beforeEach(() => {
  db = fakeDb()
})

describe('المسار الكامل', () => {
  it('يكتب مسوّدةً بحالة draft، ويسجّل الكلفة والنموذج والمنصّة', async () => {
    const id = await seed()
    const out = await draftPost(deps(net()), id, 'linkedin')

    expect(out.kind).toBe('drafted')
    if (out.kind !== 'drafted') return
    expect(out.platform).toBe('linkedin')
    expect(out.length).toBe(300)

    const row = await db
      .prepare('SELECT status, platform, model, cost_usd, account_id, scheduled_at, approved_at, source_hash FROM posts WHERE id = ?')
      .bind(out.postId)
      .first<Record<string, unknown>>()
    expect(row?.['status']).toBe('draft')
    expect(row?.['platform']).toBe('linkedin')
    expect(row?.['model']).toBe('claude-opus-5')
    // المسوّدةُ تسبق الحساب والموعد والاعتماد — وذاك كلُّ معنى 0008
    expect(row?.['account_id']).toBeNull()
    expect(row?.['scheduled_at']).toBeNull()
    expect(row?.['approved_at']).toBeNull()
    expect(row?.['source_hash']).toBe('md5:abc')

    const book = await ledger()
    expect(book).toHaveLength(1)
    expect(book[0]?.provider).toBe('anthropic')
    expect(book[0]?.operation).toContain('draft:linkedin')
    expect(book[0]?.total).toBeGreaterThan(0)
  })

  it('يرسل وصفَ المنصّة لا وصفا عامّا — ولكلٍّ حدُّه', async () => {
    const id = await seed()
    await draftPost(deps(net({ draft: { text: 'ن'.repeat(200), rationale: '' } })), id, 'x')
    const sent = calls[0]?.body as { system?: { text: string }[] }
    expect(sent.system?.[0]?.text).toContain('منشور X')
    expect(sent.system?.[0]?.text).not.toContain('منشور LinkedIn')
  })
})

describe('D-008 · الكلفة قبل الكتابة', () => {
  it('يسجّل الكلفة حتّى حين يكون جوابُ النموذج غير صالح', async () => {
    const id = await seed()
    // نصٌّ فوق حدّ X: النداءُ وقع وحوسِب عليه، والكتابةُ وحدها تفشل
    const out = await draftPost(
      deps(net({ draft: { text: 'ن'.repeat(400), rationale: '' } })),
      id,
      'x',
    )
    expect(out.kind).toBe('failed')

    const book = await ledger()
    expect(book).toHaveLength(1)
    expect(book[0]?.total).toBeGreaterThan(0)

    const { results } = await db.prepare('SELECT id FROM posts').all()
    expect(results).toHaveLength(0)
  })

  it('لا يسجّل كلفةً حين يفشل النداءُ نفسه — لا نداءَ لا حساب', async () => {
    const id = await seed()
    const out = await draftPost(deps(net({ status: 500 })), id, 'x')
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(true)
    expect(await ledger()).toHaveLength(0)
  })
})

describe('لا تسويدَ مرّتين لنسخةٍ واحدة', () => {
  it('الطلبُ الثاني لا ينادي ولا يُنفق', async () => {
    const id = await seed()
    const first = await draftPost(deps(net()), id, 'linkedin')
    expect(first.kind).toBe('drafted')

    const second = await draftPost(deps(net()), id, 'linkedin')
    expect(second.kind).toBe('already')
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(1)
  })

  it('المنصّةُ الأخرى نداءٌ آخر — ونصٌّ لأحدهما لا يصلح للآخر', async () => {
    const id = await seed()
    await draftPost(deps(net()), id, 'linkedin')
    const x = await draftPost(deps(net({ draft: { text: 'ن'.repeat(200), rationale: '' } })), id, 'x')
    expect(x.kind).toBe('drafted')
    expect(await ledger()).toHaveLength(2)
  })

  it('نسخةٌ جديدة من المستند تُسوَّد من جديد بحقّ', async () => {
    const id = await seed()
    await draftPost(deps(net()), id, 'linkedin')
    expect(draftKey(id, 'linkedin', 'md5:abc')).not.toBe(draftKey(id, 'linkedin', 'md5:xyz'))
  })
})

describe('الحارس قبل النداء', () => {
  it('الإيقافُ يمنع، ولا يُرسَل شيء', async () => {
    const id = await seed()
    await writeSetting(db, 'paused', 'true', 'test')
    const out = await draftPost(deps(net()), id, 'linkedin')

    expect(out.kind).toBe('blocked')
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(0)
  })

  it('سقفُ الإنفاق اليوميّ يمنع قبل النداء لا بعده', async () => {
    const id = await seed()
    await writeSetting(db, 'daily_spend_cap_usd', '0.01', 'test')
    await db
      .prepare(
        "INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total) VALUES (?, 'anthropic', 'analyze:x', 1, 5, 5)",
      )
      .bind(crypto.randomUUID())
      .run()

    const out = await draftPost(deps(net()), id, 'linkedin')
    expect(out.kind).toBe('blocked')
    expect(calls).toHaveLength(0)
  })
})

describe('بلا خلاصةٍ لا مادّة', () => {
  it('مصدرٌ لم يُحلَّل لا يُكتب منه — ولا يُنادى له نموذج', async () => {
    const id = crypto.randomUUID()
    await db
      .prepare(
        "INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES (?, 'd', 'ملفّ', 'text/plain', 'md5:1')",
      )
      .bind(id)
      .run()

    const out = await draftPost(deps(net()), id, 'linkedin')
    expect(out.kind).toBe('not_analyzed')
    expect(calls).toHaveLength(0)
  })
})

describe('حدودُ المنصّتين', () => {
  it('X أقصر من LinkedIn حدّا وهدفا — ولا يُقصّ نصٌّ من أحدهما للآخر', () => {
    expect(PLATFORMS.x.hardLimit).toBeLessThan(PLATFORMS.linkedin.hardLimit)
    expect(PLATFORMS.x.target).toBeLessThan(PLATFORMS.x.hardLimit)
    expect(PLATFORMS.linkedin.target).toBeLessThan(PLATFORMS.linkedin.hardLimit)
  })
})
