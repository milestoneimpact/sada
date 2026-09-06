/**
 * الخطّةُ الأسبوعيّة — **وما يُختبَر أنّها لا تخترع ولا تُنفق مرّتين.**
 *
 * وأخطرُ ما فيها بندٌ بمعرّفٍ مخترَع: يُعرَض على المالك، فيضغط «اكتب»،
 * فيفشل — ويظنّ العطلَ في النظام. فيُمسك عند القراءة لا عند العرض.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { approvePlan, eligible, latestPlan, planWeek, type PlanDeps } from './job'
import { parsePlan, weekStart } from './prompt'
import { writeSetting } from '../settings'

let db: FakeDb
let calls: { body: unknown }[]

const NOW = new Date('2026-09-09T08:00:00Z') // أربعاء
const WEEK = '2026-09-13' // الأحد التالي

function plan(items: unknown[], rationale = 'أسبوعٌ يبدأ بالأثقل وينتهي بالأخفّ.') {
  return { rationale, items }
}

function net(options: { payload?: unknown; status?: number } = {}) {
  calls = []
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    let body: unknown = null
    try {
      body = JSON.parse(String(request !== null ? await request.clone().text() : (init?.body ?? '{}')))
    } catch {
      body = null
    }
    calls.push({ body })
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
        content: [{ type: 'text', text: JSON.stringify(options.payload ?? plan([])) }],
        usage: { input_tokens: 2000, output_tokens: 600, cache_read_input_tokens: 0 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

async function seedSource(name: string, worth: number): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      "INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES (?, ?, ?, 'text/plain', 'md5:a')",
    )
    .bind(id, id, name)
    .run()
  await db
    .prepare(
      'INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), id, `خلاصةُ ${name}`, JSON.stringify({ themes: ['الوقف'] }), worth)
    .run()
  return id
}

function deps(fetchImpl: typeof fetch): PlanDeps {
  return {
    db,
    encKey: '',
    workerSecrets: { ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl,
    now: () => NOW,
  }
}

function item(sourceId: string, over: Record<string, unknown> = {}) {
  return {
    source_id: sourceId,
    platform: 'linkedin',
    angle: 'زاويةُ الوقت لا زاويةُ المبلغ',
    day: '2026-09-14',
    time: '09:00',
    why: 'الأقربُ إلى قرارٍ يُتّخذ.',
    ...over,
  }
}

beforeEach(() => {
  db = fakeDb()
})

describe('بدايةُ الأسبوع', () => {
  it('الأحدُ القادم — وأسبوعُ العمل في الرياض يبدأ الأحد', () => {
    expect(weekStart(new Date('2026-09-09T08:00:00Z'))).toBe('2026-09-13')
  })

  it('واليومَ نفسه إن كان أحدا', () => {
    expect(weekStart(new Date('2026-09-13T23:00:00Z'))).toBe('2026-09-13')
  })
})

describe('المسار الكامل', () => {
  it('يكتب الخطّة ويسجّل الكلفة', async () => {
    const a = await seedSource('تقرير الأثر', 0.9)
    const b = await seedSource('مراجعة المحفظة', 0.7)
    const out = await planWeek(deps(net({ payload: plan([item(a), item(b, { platform: 'x', day: '2026-09-16' })]) })))

    expect(out.kind).toBe('planned')
    if (out.kind !== 'planned') return
    expect(out.week).toBe(WEEK)
    expect(out.items).toBe(2)

    const stored = await latestPlan(db)
    expect(stored?.status).toBe('draft')
    expect(stored?.plan.items).toHaveLength(2)
    // مرتَّبةٌ بالموعد لا بترتيب النموذج
    expect(stored?.plan.items[0]?.day).toBe('2026-09-14')

    const { results } = await db.prepare('SELECT operation FROM cost_ledger').all<{ operation: string }>()
    expect(results[0]?.operation).toContain('plan:')
  })

  it('يعطي النموذجَ المصادرَ بمعرّفاتها ودرجاتِها', async () => {
    const a = await seedSource('تقرير الأثر', 0.9)
    await seedSource('مراجعة', 0.5)
    await planWeek(deps(net({ payload: plan([item(a)]) })))

    const sent = calls[0]?.body as { messages?: { content: string }[] }
    const user = sent.messages?.[0]?.content ?? ''
    expect(user).toContain(a)
    expect(user).toContain('0.90')
  })
})

describe('**لا مصدرَ يُخترَع**', () => {
  it('بندٌ بمعرّفٍ مجهولٍ يُسقَط وحده ولا تسقط الخطّة', async () => {
    const a = await seedSource('تقرير', 0.9)
    await seedSource('مراجعة', 0.6)
    const out = await planWeek(
      deps(net({ payload: plan([item(a), item('معرّفٌ-مخترَع')]) })),
    )

    expect(out.kind).toBe('planned')
    if (out.kind !== 'planned') return
    expect(out.items).toBe(1)
    expect(out.dropped).toBe(1)
  })

  it('وخطّةٌ كلُّها مخترَعةٌ تفشل — ولا تُكتب', async () => {
    await seedSource('تقرير', 0.9)
    await seedSource('مراجعة', 0.6)
    const out = await planWeek(deps(net({ payload: plan([item('لا-شيء')]) })))

    expect(out.kind).toBe('failed')
    expect(await latestPlan(db)).toBeNull()
  })

  it('ويوما خارج الأسبوع يُسقَط', () => {
    const known = new Set(['s1'])
    const read = parsePlan(
      plan([item('s1', { day: '2026-10-20' }), item('s1')]),
      known,
      WEEK,
    )
    expect(read.ok).toBe(true)
    if (read.ok) expect(read.dropped).toBe(1)
  })

  it('ومنصّةٌ لا نعرفها تُسقَط', () => {
    const read = parsePlan(plan([item('s1', { platform: 'snapchat' })]), new Set(['s1']), WEEK)
    expect(read.ok).toBe(false)
  })
})

describe('D-008 · الكلفة قبل القراءة', () => {
  it('تُسجَّل حتّى حين يكون الجوابُ غيرَ صالح', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planWeek(deps(net({ payload: { rationale: 'x', items: 'ليست مصفوفة' } })))

    expect(out.kind).toBe('failed')
    const { results } = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(results).toHaveLength(1)
  })

  it('ولا تُسجَّل حين يفشل النداءُ نفسه', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    expect((await planWeek(deps(net({ status: 500 })))).kind).toBe('failed')
    const { results } = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(results).toHaveLength(0)
  })
})

describe('الحارس قبل النداء', () => {
  it('الإيقافُ يمنع ولا يُرسَل شيء', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    await writeSetting(db, 'paused', 'true', 'test')

    expect((await planWeek(deps(net()))).kind).toBe('blocked')
    expect(calls).toHaveLength(0)
  })

  it('ومصدرٌ واحدٌ لا يصنع أسبوعا — ولا يُنادى له نموذج', async () => {
    await seedSource('وحيد', 0.9)
    const out = await planWeek(deps(net()))

    expect(out.kind).toBe('not_enough')
    expect(calls).toHaveLength(0)
  })
})

describe('خطّةُ الأسبوع الواحد', () => {
  it('توليدٌ ثانٍ يحلّ محلّ الأوّل ولا يتراكمان', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    await planWeek(deps(net({ payload: plan([item(a)]) })))
    await planWeek(deps(net({ payload: plan([item(a, { time: '11:00' })]) })))

    const { results } = await db.prepare('SELECT id FROM plans').all()
    expect(results).toHaveLength(1)
    expect((await latestPlan(db))?.plan.items[0]?.time).toBe('11:00')
    // وكلفتا النداءين في الدفتر: ما دُفع ثمنُه يُرى
    const ledger = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(ledger.results).toHaveLength(2)
  })
})

describe('الاعتماد', () => {
  it('إقرارٌ بالمنطق — ولا يكتب نصّا ولا يُنفق', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planWeek(deps(net({ payload: plan([item(a)]) })))
    if (out.kind !== 'planned') throw new Error('لم تُكتب')

    expect(await approvePlan(db, out.planId)).toBe(true)
    expect((await latestPlan(db))?.status).toBe('approved')

    // ولا منشورَ خرج منه
    const { results } = await db.prepare('SELECT id FROM posts').all()
    expect(results).toHaveLength(0)
  })

  it('ولا يُعتمد مرّتين', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planWeek(deps(net({ payload: plan([item(a)]) })))
    if (out.kind !== 'planned') throw new Error('لم تُكتب')
    expect(await approvePlan(db, out.planId)).toBe(true)
    expect(await approvePlan(db, out.planId)).toBe(false)
  })
})

describe('المصادر المؤهَّلة', () => {
  it('تُفرَز بالاستحقاق، وتُعدّ ما خرج منها', async () => {
    const low = await seedSource('ضعيف', 0.2)
    const high = await seedSource('قويّ', 0.95)
    await db
      .prepare(
        `INSERT INTO posts (id, platform, source_id, type, text, status, idempotency_key)
         VALUES (?, 'x', ?, 'text', 'نصّ', 'draft', ?)`,
      )
      .bind(crypto.randomUUID(), high, 'k-1')
      .run()

    const rows = await eligible(db)
    expect(rows.map((r) => r.id)).toEqual([high, low])
    expect(rows[0]?.used).toBe(1)
  })

  it('والمرفوضُ لا يُعدّ مستهلَكا', async () => {
    const s = await seedSource('a', 0.9)
    await db
      .prepare(
        `INSERT INTO posts (id, platform, source_id, type, text, status, idempotency_key)
         VALUES (?, 'x', ?, 'text', 'نصّ', 'rejected', ?)`,
      )
      .bind(crypto.randomUUID(), s, 'k-2')
      .run()
    expect((await eligible(db))[0]?.used).toBe(0)
  })
})
