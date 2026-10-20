/**
 * الخطّةُ الأسبوعيّة — **وما يُختبَر أنّها لا تخترع ولا تُنفق مرّتين.**
 *
 * وأخطرُ ما فيها بندٌ بمعرّفٍ مخترَع: يُعرَض على المالك، فيضغط «اكتب»،
 * فيفشل — ويظنّ العطلَ في النظام. فيُمسك عند القراءة لا عند العرض.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { approvePlan, eligible, latestPlan, planWeek, type PlanDeps } from './job'
import { MAX_ITEMS, parsePlan, systemPrompt, userPrompt, weekStart } from './prompt'
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

  it('يعطي النموذج المصادر بمعرّفاتها ودرجاتِها', async () => {
    const a = await seedSource('تقرير الأثر', 0.9)
    await seedSource('مراجعة', 0.5)
    await planWeek(deps(net({ payload: plan([item(a)]) })))

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
    const out = await planWeek(
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

  it('ومنصّة لا نعرفها تُسقَط', () => {
    const read = parsePlan(plan([item('s1', { platform: 'snapchat' })]), new Set(['s1']), WEEK)
    expect(read.ok).toBe(false)
  })
})

describe('D-008 · الكلفة قبل القراءة', () => {
  it('تُسجَّل حتّى حين يكون الجواب غير صالح', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planWeek(deps(net({ payload: { rationale: 'x', items: 'ليست مصفوفة' } })))

    expect(out.kind).toBe('failed')
    const { results } = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(results).toHaveLength(1)
  })

  it('ولا تُسجَّل حين يفشل النداء نفسه', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    expect((await planWeek(deps(net({ status: 500 })))).kind).toBe('failed')
    const { results } = await db.prepare('SELECT id FROM cost_ledger').all()
    expect(results).toHaveLength(0)
  })
})

describe('الحارس قبل النداء', () => {
  it('الإيقاف يمنع ولا يُرسَل شيء', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    await writeSetting(db, 'paused', 'true', 'test')

    expect((await planWeek(deps(net()))).kind).toBe('blocked')
    expect(calls).toHaveLength(0)
  })

  it('ومصدر واحد لا يصنع أسبوعا — ولا يُنادى له نموذج', async () => {
    await seedSource('وحيد', 0.9)
    const out = await planWeek(deps(net()))

    expect(out.kind).toBe('not_enough')
    expect(calls).toHaveLength(0)
  })
})

describe('خطّة الأسبوع الواحد', () => {
  it('توليد ثان يحلّ محلّ الأوّل ولا يتراكمان', async () => {
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
  it('إقرار بالمنطق — ولا يكتب نصّا ولا يُنفق', async () => {
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
    await planWeek(deps(net({ payload: plan([item(a)]) })))
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
    expect(read.droppedWhy).toContain('منصّة غير مدعومة')
    expect(read.droppedWhy).toContain('زاوية أقصر')
    expect(read.droppedWhy).toContain('يوم خارج الأسبوع')
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
    await planWeek(deps(net({ payload: plan([item(a)]) })))

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
    const out = await planWeek(deps(net({ stop: 'max_tokens' })))

    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(true)
    expect(await book()).toEqual([{ operation: 'plan:claude-opus-5', units: 2600 }])
    expect(await latestPlan(db)).toBeNull()
  })

  it('وAnthropic رافض: صفّ واحد، ولا يُعاد', async () => {
    await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    const out = await planWeek(deps(net({ stop: 'refusal' })))

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
    const out = await planWeek(compatDeps(compat({ message: { content: '{"rationale":"' }, finish_reason: 'length' })))

    expect(out.kind).toBe('failed')
    expect(await book()).toEqual([{ operation: 'plan:gemini-2.5-flash', units: 1900 }])
  })

  it('والنجاح على لهجة التوافق صفّ واحد كذلك — والطلب json_object كما كان', async () => {
    const a = await seedSource('a', 0.9)
    await seedSource('b', 0.6)
    await writeRoute(db, 'plan', 'gemini', 'gemini-2.5-flash', 'test')
    const out = await planWeek(
      compatDeps(compat({ message: { content: JSON.stringify(plan([item(a)])) }, finish_reason: 'stop' })),
    )

    expect(out.kind).toBe('planned')
    // Gemini بلا سعرٍ مضبوط: صفرٌ مع وحداتٍ — ما تقوله اللوحةُ «بلا سعرٍ مضبوط»
    if (out.kind === 'planned') expect({ cost: out.cost, units: out.units }).toEqual({ cost: 0, units: 1900 })
    expect(await book()).toHaveLength(1)
    expect((calls[0]?.body as { response_format?: unknown }).response_format).toEqual({ type: 'json_object' })
  })
})
