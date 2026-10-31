/**
 * الخطّةُ الأسبوعيّة — **وما يُختبَر أنّها لا تخترع ولا تُنفق مرّتين.**
 *
 * وأخطرُ ما فيها بندٌ بمعرّفٍ مخترَع: يُعرَض على المالك، فيضغط «اكتب»،
 * فيفشل — ويظنّ العطلَ في النظام. فيُمسك عند القراءة لا عند العرض.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { approvePlan, eligible, ideaOf, latestPlan, planSpan, type PlanDeps } from './job'
import {
  CALL_CAP, EMPTY_CHOICES, MAX_ITEMS, maxItems, parsePlan, planSchema, readChoices, spanDays, systemPrompt, userPrompt, weekStart,
} from './prompt'
import { writeSetting } from '../settings'
import { writeRoute } from '../ai/routes'

let db: FakeDb
let calls: { body: unknown }[]

const NOW = new Date('2026-09-09T08:00:00Z') // أربعاء
const WEEK = '2026-09-13' // الأحد التالي

function plan(items: unknown[], rationale = 'أسبوع يبدأ بالأثقل وينتهي بالأخفّ.') {
  return { rationale, items }
}

function net(options: { payload?: unknown; status?: number; stop?: string } = {}) {
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
        stop_reason: options.stop ?? 'end_turn',
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
    .bind(crypto.randomUUID(), id, `خلاصة ${name}`, JSON.stringify({ themes: ['الوقف'] }), worth)
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
    angle: 'زاوية الوقت لا زاوية المبلغ',
    day: '2026-09-14',
    time: '09:00',
    why: 'الأقرب إلى قرار يُتّخذ.',
    ...over,
  }
}

beforeEach(() => {
  db = fakeDb()
})

describe('بداية الأسبوع', () => {
  it('الأحد القادم — وأسبوع العمل في الرياض يبدأ الأحد', () => {
    expect(weekStart(new Date('2026-09-09T08:00:00Z'))).toBe('2026-09-13')
  })

  it('واليوم نفسه إن كان أحدا', () => {
    expect(weekStart(new Date('2026-09-13T23:00:00Z'))).toBe('2026-09-13')
  })
})

describe('المسار الكامل', () => {
  it('يكتب الخطّة ويسجّل الكلفة', async () => {
    const a = await seedSource('تقرير الأثر', 0.9)
    const b = await seedSource('مراجعة المحفظة', 0.7)
    const out = await planSpan(deps(net({ payload: plan([item(a), item(b, { platform: 'x', day: '2026-09-16' })]) })))

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

  it('يعطي النموذج المصادر بمعرّفاتها ودرجاتِها', async () => {
    const a = await seedSource('تقرير الأثر', 0.9)
    await seedSource('مراجعة', 0.5)
    await planSpan(deps(net({ payload: plan([item(a)]) })))

    const sent = calls[0]?.body as { messages?: { content: string }[] }
    const user = sent.messages?.[0]?.content ?? ''
    expect(user).toContain(a)
    expect(user).toContain('0.90')
  })
})

describe('**لا مصدر يُخترَع**', () => {
  it('بند بمعرّف مجهول يُسقَط وحده ولا تسقط الخطّة', async () => {
    const a = await seedSource('تقرير', 0.9)
    await seedSource('مراجعة', 0.6)
    const out = await planSpan(
      deps(net({ payload: plan([item(a), item('معرّف-مخترَع')]) })),
    )

    expect(out.kind).toBe('planned')
    if (out.kind !== 'planned') return
    expect(out.items).toBe(1)
    expect(out.dropped).toBe(1)
  })

  it('وخطّة كلُّها مخترَعة تفشل — ولا تُكتب', async () => {
    await seedSource('تقرير', 0.9)
    await seedSource('مراجعة', 0.6)
    const out = await planSpan(deps(net({ payload: plan([item('لا-شيء')]) })))

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

  it('ومنصّة لا نعرفها تُسقَط', () => {
    const read = parsePlan(plan([item('s1', { platform: 'snapchat' })]), new Set(['s1']), WEEK)
    expect(read.ok).toBe(false)
  })
})

describe('D-008 · الكلفة قبل القراءة', () => {
  it('تُسجَّل حتّى حين يكون الجواب غير صالح', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planSpan(deps(net({ payload: { rationale: 'x', items: 'ليست مصفوفة' } })))

    expect(out.kind).toBe('failed')
    const { results } = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(results).toHaveLength(1)
  })

  it('ولا تُسجَّل حين يفشل النداء نفسه', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    expect((await planSpan(deps(net({ status: 500 })))).kind).toBe('failed')
    const { results } = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(results).toHaveLength(0)
  })
})

describe('الحارس قبل النداء', () => {
  it('الإيقاف يمنع ولا يُرسَل شيء', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    await writeSetting(db, 'paused', 'true', 'test')

    expect((await planSpan(deps(net()))).kind).toBe('blocked')
    expect(calls).toHaveLength(0)
  })

  it('ومصدر واحد لا يصنع أسبوعا — ولا يُنادى له نموذج', async () => {
    await seedSource('وحيد', 0.9)
    const out = await planSpan(deps(net()))

    expect(out.kind).toBe('not_enough')
    expect(calls).toHaveLength(0)
  })
})

describe('خطّة الأسبوع الواحد', () => {
  it('توليد ثان يحلّ محلّ الأوّل ولا يتراكمان', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    await planSpan(deps(net({ payload: plan([item(a)]) })))
    await planSpan(deps(net({ payload: plan([item(a, { time: '11:00' })]) })))

    const { results } = await db.prepare('SELECT id FROM plans').all()
    expect(results).toHaveLength(1)
    expect((await latestPlan(db))?.plan.items[0]?.time).toBe('11:00')
    // وكلفتا النداءين في الدفتر: ما دُفع ثمنُه يُرى
    const ledger = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(ledger.results).toHaveLength(2)
  })
})

describe('الاعتماد', () => {
  it('إقرار بالمنطق — ولا يكتب نصّا ولا يُنفق', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planSpan(deps(net({ payload: plan([item(a)]) })))
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
    const out = await planSpan(deps(net({ payload: plan([item(a)]) })))
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

  it('والمرفوض لا يُعدّ مستهلَكا', async () => {
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

/**
 * **عقدُ الحقول في الموجّه** (D-157). المخطّطُ يصل إلى Anthropic وحدَه؛ مزوّدٌ
 * openai_compat لا يعرف حقولَ البند إلّا من نصّ الموجّه، وكان النصُّ يذكر
 * `rationale` و`items` فقط — فثلاثُ محاولاتٍ على staging دُفعت ثمّ سقطت.
 */
describe('D-157 — عقد الحقول والقارئ المتسامح', () => {
  it('الموجّه يسمّي الحقول الستّة وصيغَها', () => {
    const text = systemPrompt()
    for (const field of ['source_id', 'platform', 'angle', 'day', 'time', 'why']) expect(text).toContain(`\`${field}\``)
    expect(text).toContain('YYYY-MM-DD')
    expect(text).toContain('HH:MM')
  })

  it('ورسالة المستخدم تسرد أيّام الأسبوع السبعة بحرفها', () => {
    const text = userPrompt([], '2026-09-13')
    for (const d of ['2026-09-13', '2026-09-16', '2026-09-19']) expect(text).toContain(d)
    expect(text).not.toContain('2026-09-20')
  })

  it('والقارئ يقبل sourceId وساعةً بلا صفر بادئ، ولا يقبل منصّةً مجهولة', () => {
    const known = new Set(['src:a'])
    const read = parsePlan(
      { rationale: 'r', items: [
        { sourceId: 'src:a', platform: ' LinkedIn ', angle: 'زاوية كافية الطول', day: '2026-09-14', time: '9:00', why: '' },
        { source_id: 'src:a', platform: 'tiktok', angle: 'زاوية كافية الطول', day: '2026-09-15', time: '09:00' },
      ] },
      known,
      '2026-09-13',
    )
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.plan.items).toHaveLength(1)
    expect(read.plan.items[0]?.time).toBe('09:00')
    expect(read.plan.items[0]?.platform).toBe('linkedin')
    expect(read.dropped).toBe(1)
  })

  it('والنداء يحمل العقد في رسالة النظام', async () => {
    const a = await seedSource('تقرير', 0.9)
    await seedSource('مراجعة', 0.5)
    await planSpan(deps(net({ payload: plan([item(a)]) })))
    // رسالةُ النظام في Anthropic مصفوفةُ كتلٍ نصّيّة
    const sent = calls[0]?.body as { system?: string | { text?: string }[] }
    const system = Array.isArray(sent.system) ? sent.system.map((b) => b.text ?? '').join('\n') : (sent.system ?? '')
    expect(system).toContain('`source_id`')
  })
})

describe('لماذا أُسقط ما أُسقط (D-157)', () => {
  it('يُحصى بالسبب لا بالعدد وحده', () => {
    const read = parsePlan(
      { rationale: 'r', items: [
        { source_id: 'nope', platform: 'x', angle: 'زاوية كافية الطول', day: '2026-09-14', time: '09:00' },
        { source_id: 'src:a', platform: 'tiktok', angle: 'زاوية كافية الطول', day: '2026-09-14', time: '09:00' },
        { source_id: 'src:a', platform: 'x', angle: 'قصير', day: '2026-09-14', time: '09:00' },
        { source_id: 'src:a', platform: 'x', angle: 'زاوية كافية الطول', day: '2026-10-14', time: '09:00' },
        { source_id: 'src:a', platform: 'x', angle: 'زاوية كافية الطول', day: '2026-09-15', time: '09:00' },
      ] },
      new Set(['src:a']),
      '2026-09-13',
    )
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.dropped).toBe(4)
    expect(read.droppedWhy).toContain('مصدر لا نعرفه')
    expect(read.droppedWhy).toContain('منصّة غير مطلوبة')
    expect(read.droppedWhy).toContain('زاوية أقصر')
    expect(read.droppedWhy).toContain('يوم خارج المدى')
  })
})

/**
 * **المخطّطُ المحمول، والسقفُ في القارئ، والكلفةُ المتأخّرة** (D-164).
 *
 * ثلاثةٌ تُختبَر معًا لأنّها وجهٌ واحد: حين يُطوى `maxItems` وصفًا لا يبقى
 * السقفُ إلّا في `parsePlan`، وحين يُرَدّ جوابٌ وصل لا يبقى أثرُه إلّا في
 * الدفتر.
 */
describe('D-164 · المخطّط المحمول', () => {
  /** كلُّ مفتاحٍ في الشجرة — لا نصُّها: الوصفُ يحمل «minLength: 10» حرفًا. */
  function keysDeep(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(keysDeep)
    if (typeof value !== 'object' || value === null) return []
    return Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)])
  }

  it('Anthropic يتلقّى المخطّط بلا minLength ولا maxItems ولا minItems', async () => {
    const a = await seedSource('تقرير', 0.9)
    await seedSource('مراجعة', 0.5)
    await planSpan(deps(net({ payload: plan([item(a)]) })))

    const sent = calls[0]?.body as { output_config?: { format?: { schema?: unknown } } }
    const keys = keysDeep(sent.output_config?.format?.schema)
    expect(keys).toContain('additionalProperties')
    for (const banned of ['minLength', 'maxItems', 'minItems']) expect(keys).not.toContain(banned)
  })
})

describe('D-164 · سقف الستّة في القارئ', () => {
  /** ثمانيةُ بنودٍ صالحة، والأخيران في ترتيب النموذج **أبكرُها موعدًا**. */
  function eight() {
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-13', '2026-09-13']
    return days.map((day, i) => item('s1', { day, time: `0${i + 1}:00`, angle: `زاوية البند رقم ${i + 1} في الترتيب` }))
  }

  it('ثمانية صالحة تصير ستّة، والاثنان يُحصَيان بسببهما', () => {
    const read = parsePlan(plan(eight()), new Set(['s1']), WEEK)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.plan.items).toHaveLength(MAX_ITEMS)
    expect(read.dropped).toBe(2)
    expect(read.droppedWhy).toBe('بند بعد السادس ×2')
  })

  it('**والقصّ على ترتيب النموذج لا على الموعد** — السابع في الأولويّة يُسقَط ولو كان الأحد', () => {
    const read = parsePlan(plan(eight()), new Set(['s1']), WEEK)
    if (!read.ok) throw new Error('لم تُقرأ')
    const kept = read.plan.items.map((i) => i.angle)
    for (let n = 1; n <= 6; n += 1) expect(kept).toContain(`زاوية البند رقم ${n} في الترتيب`)
    expect(read.plan.items.some((i) => i.day === '2026-09-13')).toBe(false)
    // والفرزُ بالموعد بعد القصّ لا قبله
    expect(read.plan.items[0]?.day).toBe('2026-09-14')
  })

  it('والفاسد لا يُعدّ في الستّة — السقف على الصالح وحده', () => {
    const items = [item('مخترَع'), ...eight().slice(0, 6)]
    const read = parsePlan(plan(items), new Set(['s1']), WEEK)
    if (!read.ok) throw new Error('لم تُقرأ')
    expect(read.plan.items).toHaveLength(6)
    expect(read.droppedWhy).toBe('مصدر لا نعرفه')
  })
})

describe('D-164 · جواب وصل ثمّ رُدّ يُكتب في الدفتر', () => {
  async function book(): Promise<{ operation: string; units: number }[]> {
    const { results } = await db.prepare('SELECT operation, units FROM cost_ledger').all<{ operation: string; units: number }>()
    return results
  }

  it('Anthropic مبتور عند max_tokens: صفّ واحد ثمّ failed يُعاد', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planSpan(deps(net({ stop: 'max_tokens' })))

    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(true)
    expect(await book()).toEqual([{ operation: 'plan:claude-opus-5', units: 2600 }])
    expect(await latestPlan(db)).toBeNull()
  })

  it('وAnthropic رافض: صفّ واحد، ولا يُعاد', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planSpan(deps(net({ stop: 'refusal' })))

    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(false)
    expect(await book()).toHaveLength(1)
  })

  /** لهجةُ التوافق عبر Gemini المدمَج — مزوّدٌ بعنوانه من الترحيل 0005. */
  function compat(choice: Record<string, unknown>): typeof fetch {
    calls = []
    return (async (_url: unknown, init?: RequestInit): Promise<Response> => {
      calls.push({ body: JSON.parse(String(init?.body ?? '{}')) })
      return new Response(
        JSON.stringify({ model: 'gemini-2.5-flash', choices: [choice], usage: { prompt_tokens: 1500, completion_tokens: 400 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch
  }

  function compatDeps(fetchImpl: typeof fetch): PlanDeps {
    return { ...deps(fetchImpl), workerSecrets: { GEMINI_API_KEY: 'g-test' } }
  }

  it('وعلى لهجة التوافق: المبتور بـlength يُكتب صفًّا ثمّ failed', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    await writeRoute(db, 'plan', 'gemini', 'gemini-2.5-flash', 'test')
    const out = await planSpan(compatDeps(compat({ message: { content: '{"rationale":"' }, finish_reason: 'length' })))

    expect(out.kind).toBe('failed')
    expect(await book()).toEqual([{ operation: 'plan:gemini-2.5-flash', units: 1900 }])
  })

  it('والنجاح على لهجة التوافق صفّ واحد كذلك — والطلب json_object كما كان', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    await writeRoute(db, 'plan', 'gemini', 'gemini-2.5-flash', 'test')
    const out = await planSpan(
      compatDeps(compat({ message: { content: JSON.stringify(plan([item(a)])) }, finish_reason: 'stop' })),
    )

    expect(out.kind).toBe('planned')
    // Gemini بلا سعرٍ مضبوط: صفرٌ مع وحداتٍ — ما تقوله اللوحةُ «بلا سعرٍ مضبوط»
    if (out.kind === 'planned') expect({ cost: out.cost, units: out.units }).toEqual({ cost: 0, units: 1900 })
    expect(await book()).toHaveLength(1)
    expect((calls[0]?.body as { response_format?: unknown }).response_format).toEqual({ type: 'json_object' })
  })
})

describe('خطّةٌ لكلّ عميل، أسبوعًا أو شهرًا (D-256)', () => {
  it('الشهرُ يقبل بندًا في أسبوعه الثالث ويُكتب شهرًا، والأسبوعُ يُسقطه', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const later = item(a, { day: '2026-09-28' })
    const month = await planSpan({ ...deps(net({ payload: plan([item(a), later]) })), span: 'month' })
    expect(month).toMatchObject({ kind: 'planned', items: 2, dropped: 0 })
    expect((await latestPlan(db))?.span).toBe('month')
    // ‏والموجّهُ يقول إنّه شهر
    expect(JSON.stringify(calls[0]?.body)).toContain('شهرٌ من أربعة أسابيع')

    const week = await planSpan(deps(net({ payload: plan([item(a), later]) })))
    expect(week).toMatchObject({ kind: 'planned', items: 1, dropped: 1 })
    // ‏وخطّةُ الأسبوع لا تمحو خطّةَ الشهر
    expect((await db.prepare('SELECT span FROM plans ORDER BY span').all<{ span: string }>()).results.map((r) => r.span)).toEqual(['month', 'week'])
  })

  it('عميلان لكلٍّ خطّتُه للأسبوع نفسِه، ومصادرُ كلٍّ له وحده', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    db.raw.exec("INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'عميل', 'agency')")
    // ‏العميلُ الثاني بلا مصادر: لا يُخطَّط له من مصادر المالك
    expect(await planSpan({ ...deps(net({ payload: plan([item(a)]) })), org: 'org_b' })).toMatchObject({ kind: 'not_enough' })
    db.raw.exec("UPDATE sources SET org_id = 'org_b'; UPDATE content_items SET org_id = 'org_b'")
    await planSpan({ ...deps(net({ payload: plan([item(a)]) })), org: 'org_b' })
    expect(await latestPlan(db, 'org_b')).not.toBeNull()
    expect(await latestPlan(db)).toBeNull()
    // ‏والاعتمادُ من منظّمةٍ أخرى لا يقع
    const id = (await latestPlan(db, 'org_b'))!.id
    expect(await approvePlan(db, id)).toBe(false)
    expect(await approvePlan(db, id, 'org_b')).toBe(true)
  })
})

/**
 * **الخطّةُ محورَ المنصّة** (D-282): المدى من أربعة، والقنواتُ المختارةُ هي المقبولة، والفكرةُ مصدرٌ بمعرّفها،
 * والشهران نداءان بصفّين في الدفتر، والاختياراتُ تُحفظ وتُقرأ.
 */
describe('الخطّةُ محورَ المنصّة (D-282)', () => {
  it('الموجّهُ يسمّي القنواتِ المختارةَ وإيقاعَها و`kind`، ولا يذكر قناةً لم تُختر', () => {
    const text = systemPrompt({ channels: ['linkedin', 'tiktok'], cadence: { linkedin: 3, tiktok: 1 } })
    expect(text).toContain('`linkedin` أو `tiktok`')
    expect(text).toContain('linkedin: 3 في الأسبوع')
    expect(text).toContain('`kind`')
    expect(text).toContain('يحتاج مقطعًا')
    expect(text).not.toContain('`x`')
    // ‏ومخطّطُ القنوات هو المختارُ لا غير
    const schema = planSchema(['x', 'instagram'], 8) as unknown as { properties: { items: { maxItems: number; items: { properties: { platform: { enum: string[] } } } } } }
    expect(schema.properties.items.items.properties.platform.enum).toEqual(['x', 'instagram'])
    expect(schema.properties.items.maxItems).toBe(8)
  })

  it.each([['week', 7], ['2weeks', 14], ['month', 28], ['2months', 56]] as const)('رسالةُ %s تسرد %i يومًا، والسقفُ بالإيقاع', (span, days) => {
    expect(spanDays(span)).toBe(days)
    const text = userPrompt([], '2026-11-01', span, { cadence: { linkedin: 2, x: 1 } })
    expect(text).toContain('2026-11-01')
    const last = new Date(Date.UTC(2026, 10, 1 + days - 1)).toISOString().slice(0, 10)
    const after = new Date(Date.UTC(2026, 10, 1 + days)).toISOString().slice(0, 10)
    expect(text).toContain(last)
    expect(text).not.toContain(after)
    expect(maxItems(span, { linkedin: 2, x: 1 })).toBe(Math.min(CALL_CAP, (3 * days) / 7))
    expect(text).toContain(`حتّى ${maxItems(span, { linkedin: 2, x: 1 })}`)
  })

  it('القارئُ يقبل القنواتِ المختارةَ وحدها، ويفرض نوعَ البند بمنصّته، ويقبل `idea:`', () => {
    const read = parsePlan(
      { rationale: 'r', items: [
        { source_id: 'idea:1', platform: 'tiktok', kind: 'text', angle: 'زاوية كافية الطول', day: '2026-11-02', time: '09:00' },
        { source_id: 'src:a', platform: 'instagram', angle: 'زاوية كافية الطول', day: '2026-11-03', time: '09:00' },
        { source_id: 'src:a', platform: 'linkedin', kind: 'image', angle: 'زاوية كافية الطول', day: '2026-11-04', time: '09:00' },
        { source_id: 'src:a', platform: 'x', angle: 'زاوية كافية الطول', day: '2026-11-05', time: '09:00' },
      ] },
      new Set(['src:a', 'idea:1']),
      '2026-11-01', 'week', { channels: ['tiktok', 'instagram', 'linkedin'] },
    )
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.plan.items.map((i) => [i.sourceId, i.platform, i.kind])).toEqual([
      ['idea:1', 'tiktok', 'video'], ['src:a', 'instagram', 'image'], ['src:a', 'linkedin', 'image'],
    ])
    expect(read.droppedWhy).toBe('منصّة غير مطلوبة')
  })

  it('الشهران نداءان بصفّين في الدفتر، وتُدمج بنودُهما خطّةً واحدة باختياراتها', async () => {
    const a = await seedSource('a', 0.9)
    const b = await seedSource('b', 0.6)
    // ‏الشبكةُ تردّ بنداءٍ أوّلَ في الشهر الأوّل وثانٍ في الثاني: اليومُ يُقرأ من رسالة النداء
    let n = 0
    const fetchImpl = (async (input: unknown, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(input instanceof Request ? await input.clone().text() : init?.body)) as { messages: { content: string }[] }
      const start = /يبدأ (\d{4}-\d{2}-\d{2})/.exec(body.messages[0]?.content ?? '')?.[1] ?? ''
      n += 1
      return new Response(JSON.stringify({
        id: `msg_${n}`, type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(plan([item(n === 1 ? a : b, { day: start, platform: n === 1 ? 'linkedin' : 'instagram' })], `شهر ${n}`)) }],
        usage: { input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch
    const out = await planSpan({
      ...deps(fetchImpl), span: '2months', startDay: '2026-11-01', channels: ['linkedin', 'instagram'],
      cadence: { linkedin: 2, instagram: 1 }, sources: [a, b], ideas: ['فكرةٌ عن الوقف'], autoImage: true,
    })
    expect(out).toMatchObject({ kind: 'planned', items: 2, calls: 2, week: '2026-11-01' })
    expect(n).toBe(2)
    expect((await db.prepare("SELECT count(*) AS n FROM cost_ledger WHERE operation LIKE 'plan:%'").first<{ n: number }>())?.n).toBe(2)
    const stored = await latestPlan(db)
    expect(stored?.span).toBe('2months')
    expect(stored?.plan.items.map((i) => i.day)).toEqual(['2026-11-01', '2026-11-29'])
    expect(stored?.plan.rationale).toBe('شهر 1 ثمّ شهر 2')
    expect(stored?.choices).toEqual({
      channels: ['linkedin', 'instagram'], cadence: { linkedin: 2, instagram: 1 }, sources: [a, b], ideas: ['فكرةٌ عن الوقف'], assets: [], autoImage: true, startDay: '2026-11-01',
    })
    // ‏والفكرةُ تُقرأ من اختياراتها بمعرّف بندها
    expect(ideaOf('idea:1', stored!.choices)).toBe('فكرةٌ عن الوقف')
    expect(ideaOf('idea:2', stored!.choices)).toBeNull()
    expect(ideaOf(a, stored!.choices)).toBeNull()
  })

  it('المصادرُ المختارةُ وحدها تصل إلى النموذج، والفكرةُ تدخل مصدرًا بمعرّف idea:', async () => {
    const a = await seedSource('المختار', 0.9)
    await seedSource('المتروك', 0.8)
    await planSpan({ ...deps(net({ payload: plan([item(a)]) })), sources: [a], ideas: ['فكرةٌ بكلمات المالك'] })
    const sent = JSON.stringify(calls[0]?.body)
    expect(sent).toContain('المختار')
    expect(sent).not.toContain('المتروك')
    expect(sent).toContain('id: idea:1')
    expect(sent).toContain('فكرةٌ بكلمات المالك')
    // ‏وبندٌ من الفكرة يُقبل
    const out = await planSpan({ ...deps(net({ payload: plan([item('idea:1', { platform: 'x' })]) })), sources: [a], ideas: ['فكرةٌ بكلمات المالك'] })
    expect(out).toMatchObject({ kind: 'planned', items: 1, dropped: 0 })
  })

  it('اختياراتٌ قديمةٌ أو فاسدة تُقرأ بافتراضاتها الآمنة', () => {
    expect(readChoices('{bad')).toEqual(EMPTY_CHOICES)
    expect(readChoices({ channels: ['x', 'threads', 'x'], cadence: { x: 99, nope: 1 }, sources: 'all', autoImage: 'yes', startDay: 'غدًا' }))
      .toEqual({ ...EMPTY_CHOICES, channels: ['x'], cadence: { x: 28 } })
  })
})
