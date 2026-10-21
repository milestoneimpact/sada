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
import { draftFromIdea, draftKey, draftPost, ideaKey, ideaProblem, normalizeIdea, type DraftDeps } from './job'
import { PLATFORMS, parseDraft, systemPrompt } from './prompt'
import { writeSetting } from '../settings'
import { writeRoute } from '../ai/routes'

let db: FakeDb
let calls: { url: string; body: unknown }[]

const OK = { text: 'ن'.repeat(300), rationale: 'زاوية الأثر لا زاوية الإعلان.' }

/** يزيّف Anthropic وحده — ولا نداءَ آخر في هذا المسار. */
function net(options: { draft?: unknown; status?: number; usage?: Record<string, number>; stop?: string } = {}) {
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
        stop_reason: options.stop ?? 'end_turn',
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
      'خلاصة عربية عن أثر الوقف في التعليم.',
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

  /**
   * **و`has_url` كان صفرا مكتوبا حرفا في `INSERT` (D-069).**
   *
   * و`ARCHITECTURE.md §٤` تقول منذ أوّل يوم إنّه «يُحسَب بالشيفرة لا
   * بالنموذج» — وكان يُحسَب عند النشر وحده، **بعد الاعتماد بأسابيع**.
   */
  it('و`has_url` يُحسَب من النصّ لا يُكتب صفرا', async () => {
    const id = await seed()
    const out = await draftPost(
      deps(net({ draft: { text: `${'ن'.repeat(200)} https://basserh.com`, rationale: 'ز' } })),
      id,
      'x',
    )
    expect(out.kind).toBe('drafted')
    if (out.kind !== 'drafted') return

    const row = await db
      .prepare('SELECT has_url FROM posts WHERE id = ?')
      .bind(out.postId)
      .first<{ has_url: number }>()
    expect(row?.has_url).toBe(1)
  })

  it('ونصّ بلا رابط يبقى صفرا', async () => {
    const id = await seed()
    const out = await draftPost(deps(net()), id, 'linkedin')
    if (out.kind !== 'drafted') throw new Error('لم تُكتب')
    const row = await db
      .prepare('SELECT has_url FROM posts WHERE id = ?')
      .bind(out.postId)
      .first<{ has_url: number }>()
    expect(row?.has_url).toBe(0)
  })

  it('يرسل وصف المنصّة لا وصفا عامّا — ولكلّ حدُّه', async () => {
    const id = await seed()
    await draftPost(deps(net({ draft: { text: 'ن'.repeat(200), rationale: '' } })), id, 'x')
    const sent = calls[0]?.body as { system?: { text: string }[] }
    expect(sent.system?.[0]?.text).toContain('منشور X')
    expect(sent.system?.[0]?.text).not.toContain('منشور LinkedIn')
  })
})

describe('D-008 · الكلفة قبل الكتابة', () => {
  it('يسجّل الكلفة حتّى حين يكون جواب النموذج غير صالح', async () => {
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
    // ‏وما دُفع يُعاد مع الفشل ليُقال في الإشعار (مراجعة D-190)
    if (out.kind === 'failed') expect(out.cost).toBeCloseTo(book[0]!.total, 9)

    const { results } = await db.prepare('SELECT id FROM posts').all()
    expect(results).toHaveLength(0)
  })

  /**
   * **وجوابٌ وصل ثمّ رُدّ يُسجَّل** (D-164). مبتورٌ عند `max_tokens` حوسِب
   * عليه كاملًا، وكان يعود `failed` قبل خطوة الكلفة فلا يراه الدفتر.
   */
  it('يسجّل كلفة الجواب المبتور ثمّ يعود failed — ولا مسوّدة', async () => {
    const id = await seed()
    const out = await draftPost(deps(net({ stop: 'max_tokens' })), id, 'linkedin')
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(true)

    const book = await ledger()
    expect(book).toHaveLength(1)
    expect(book[0]?.operation).toBe('draft:linkedin:claude-opus-5')
    expect(book[0]?.total).toBeGreaterThan(0)
    // ‏والمبتورُ كذلك: كلفتُه تُعاد من `writeOnce` مع الفشل
    if (out.kind === 'failed') expect(out.cost).toBeCloseTo(book[0]!.total, 9)
    expect((await db.prepare('SELECT id FROM posts').all()).results).toHaveLength(0)
  })

  it('وعلى لهجة التوافق كذلك: بتر بـlength يُكتب صفًّا', async () => {
    const id = await seed()
    await writeRoute(db, 'draft', 'gemini', 'gemini-2.5-flash', 'test')
    const compat = (async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          model: 'gemini-2.5-flash',
          choices: [{ message: { content: '{"text":"ن' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 700, completion_tokens: 300 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch
    const out = await draftPost({ ...deps(compat), workerSecrets: { GEMINI_API_KEY: 'g-test' } }, id, 'x')
    expect(out.kind).toBe('failed')
    const book = await ledger()
    expect(book).toHaveLength(1)
    expect(book[0]?.operation).toBe('draft:x:gemini-2.5-flash')
  })

  it('لا يسجّل كلفةً حين يفشل النداء نفسه — لا نداء لا حساب', async () => {
    const id = await seed()
    const out = await draftPost(deps(net({ status: 500 })), id, 'x')
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(true)
    // ‏لا نداءَ حوسِب عليه: لا كلفةَ تُقال
    if (out.kind === 'failed') expect(out.cost).toBeUndefined()
    expect(await ledger()).toHaveLength(0)
  })
})

describe('D-164 · المخطّط المحمول', () => {
  it('Anthropic يتلقّى مخطّط المسوّدة بلا minLength — والحدّ في parseDraft', async () => {
    const id = await seed()
    await draftPost(deps(net()), id, 'linkedin')
    const sent = calls[0]?.body as { output_config?: { format?: { schema?: { properties?: Record<string, Record<string, unknown>> } } } }
    const text = sent.output_config?.format?.schema?.properties?.['text']
    expect(text).toBeDefined()
    expect(text).not.toHaveProperty('minLength')
    expect(String(text?.['description'])).toContain('minLength: 40')
    // والحدُّ نفسُه قائمٌ عندنا: نصٌّ أقصرُ من أربعين يُردّ
    expect(parseDraft({ text: 'قصير', rationale: '' }, PLATFORMS.x).ok).toBe(false)
  })
})

describe('لا تسويد مرّتين لنسخة واحدة', () => {
  it('الطلب الثاني لا ينادي ولا يُنفق', async () => {
    const id = await seed()
    const first = await draftPost(deps(net()), id, 'linkedin')
    expect(first.kind).toBe('drafted')

    const second = await draftPost(deps(net()), id, 'linkedin')
    expect(second.kind).toBe('already')
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(1)
  })

  it('المنصّة الأخرى نداء آخر — ونصّ لأحدهما لا يصلح للآخر', async () => {
    const id = await seed()
    await draftPost(deps(net()), id, 'linkedin')
    const x = await draftPost(deps(net({ draft: { text: 'ن'.repeat(200), rationale: '' } })), id, 'x')
    expect(x.kind).toBe('drafted')
    expect(await ledger()).toHaveLength(2)
  })

  /*
   * **والمرفوضةُ لا تسدّ الطريق** (رحلة R-2): كان «اكتب مسوّدة» بعد الرفض يقول «✓ سُوّدت
   * هذه النسخة — لم يُنفَق شيء» ولا يكتب شيئًا، ولا صياغةَ أخرى إلّا بتعديل المستند.
   */
  it('بعد الرفض تُكتب صياغة أخرى — والمرفوضة تبقى بكلفتها، والنقرة الثالثة لا تُنفق', async () => {
    const id = await seed()
    const first = await draftPost(deps(net()), id, 'linkedin')
    expect(first.kind).toBe('drafted')
    if (first.kind !== 'drafted') return
    db.raw.prepare("UPDATE posts SET status = 'rejected' WHERE id = ?").run(first.postId)

    const second = await draftPost(deps(net()), id, 'linkedin')
    expect(second.kind).toBe('drafted')
    if (second.kind !== 'drafted') return
    expect(second.postId).not.toBe(first.postId)
    expect(calls).toHaveLength(1)
    // ‏كلفتان في الدفتر قبل المسوّدتين (D-008)، والمرفوضةُ صفٌّ باقٍ حرّر مفتاحَه
    expect(await ledger()).toHaveLength(2)
    const rows = db.raw
      .prepare('SELECT id, status, idempotency_key AS k FROM posts ORDER BY created_at, id')
      .all() as { id: string; status: string; k: string }[]
    const key = draftKey(id, 'linkedin', 'md5:abc')
    expect(rows.find((r) => r.id === first.postId)).toMatchObject({ status: 'rejected', k: `${key}:rejected:${first.postId}` })
    expect(rows.find((r) => r.id === second.postId)).toMatchObject({ status: 'draft', k: key })

    // ‏وحارسُ النقرة المزدوجة باقٍ: البديلةُ قائمةٌ فلا نداءَ ثالثًا
    const third = await draftPost(deps(net()), id, 'linkedin')
    expect(third).toEqual({ kind: 'already', postId: second.postId })
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(2)
  })

  it('ومرفوضة أُعيدت بـ «تراجَع» بين القراءة والكتابة تبقى بمفتاحها — ويُقال already', async () => {
    const id = await seed()
    const first = await draftPost(deps(net()), id, 'linkedin')
    if (first.kind !== 'drafted') throw new Error(first.kind)
    db.raw.prepare("UPDATE posts SET status = 'rejected' WHERE id = ?").run(first.postId)

    // ‏التراجعُ يقع والنداءُ جارٍ: يُقلَب الحالُ قبل أن تصل الكتابة
    const racing = (async (input: unknown, init?: RequestInit): Promise<Response> => {
      db.raw.prepare("UPDATE posts SET status = 'draft' WHERE id = ?").run(first.postId)
      return net()(input as RequestInfo, init)
    }) as unknown as typeof fetch
    const out = await draftPost(deps(racing), id, 'linkedin')
    expect(out).toEqual({ kind: 'already', postId: first.postId })
    const keys = db.raw.prepare('SELECT idempotency_key AS k FROM posts').all() as { k: string }[]
    expect(keys.map((r) => r.k)).toEqual([draftKey(id, 'linkedin', 'md5:abc')])
  })

  it('نسخة جديدة من المستند تُسوَّد من جديد بحقّ', async () => {
    const id = await seed()
    await draftPost(deps(net()), id, 'linkedin')
    expect(draftKey(id, 'linkedin', 'md5:abc')).not.toBe(draftKey(id, 'linkedin', 'md5:xyz'))
  })
})

describe('D-244 · مزوّدان على النسخة الواحدة', () => {
  it('المفتاح بلا مزوّد يبقى كما كان حرفا', () => {
    expect(draftKey('s1', 'linkedin', 'h')).toBe('draft:s1:linkedin:h')
    expect(draftKey('s1', 'linkedin', 'h', '')).toBe('draft:s1:linkedin:h')
  })

  it('مزوّدان يعطيان مفتاحين، والمزوّد نفسه مفتاحا واحدا', () => {
    const a = draftKey('s1', 'linkedin', 'h', 'anthropic')
    const b = draftKey('s1', 'linkedin', 'h', 'deepseek')
    expect(a).not.toBe(b)
    expect(draftKey('s1', 'linkedin', 'h', 'deepseek')).toBe(b)
    expect(a).not.toBe(draftKey('s1', 'linkedin', 'h'))
  })

  it('نسخة بمزوّد مختار تُكتب، والثانية بالمزوّد نفسه تُردّ ولا تنفق', async () => {
    const id = await seed()
    const first = await draftPost(deps(net()), id, 'linkedin', 'anthropic')
    expect(first.kind).toBe('drafted')
    const again = await draftPost(deps(net()), id, 'linkedin', 'anthropic')
    expect(again.kind).toBe('already')
    expect(await ledger()).toHaveLength(1)
    // ‏والكتابة بالتوجيه المحفوظ نسخة أخرى لا تُعدّ قائمة
    const routed = await draftPost(deps(net()), id, 'linkedin')
    expect(routed.kind).toBe('drafted')
  })

  it('ولا يمسّ الاختيار توجيه المالك', async () => {
    const id = await seed()
    await draftPost(deps(net()), id, 'linkedin', 'anthropic')
    const saved = db.raw
      .prepare("SELECT count(*) AS n FROM task_routes WHERE task = 'draft'")
      .get() as { n: number }
    expect(saved.n).toBe(0)
  })
})

describe('الحارس قبل النداء', () => {
  it('الإيقاف يمنع، ولا يُرسَل شيء', async () => {
    const id = await seed()
    await writeSetting(db, 'paused', 'true', 'test')
    const out = await draftPost(deps(net()), id, 'linkedin')

    expect(out.kind).toBe('blocked')
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(0)
  })

  it('سقف الإنفاق اليوميّ يمنع قبل النداء لا بعده', async () => {
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

describe('بلا خلاصة لا مادّة', () => {
  it('مصدر لم يُحلَّل لا يُكتب منه — ولا يُنادى له نموذج', async () => {
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

describe('حدود المنصّتين', () => {
  it('X أقصر من LinkedIn حدّا — ولا يُقصّ نصّ من أحدهما للآخر', () => {
    expect(PLATFORMS.x.hardLimit).toBeLessThan(PLATFORMS.linkedin.hardLimit)
  })

  /**
   * **ولا رقمَ مخترَعٌ في الوصف الحاكم** (D-090).
   *
   * كان يقول «في حدود ١١٠٠ إلى ١٤٠٠ محرف» — **ورقمٌ يُملى على النموذج
   * يُملأ**: يكتب ليبلغ العدّاد لا ليقول شيئا. والحدُّ التقنيُّ يُفرَض
   * في `parseDraft` لا يُرجى من النموذج.
   */
  it('ولا عدد محارف في وصف أيّ منهما — البنية تُملى لا الطول', () => {
    for (const spec of [PLATFORMS.x, PLATFORMS.linkedin]) {
      expect(spec.guide).not.toMatch(/\d{3,4}\s*محرف/)
      expect(spec.guide).not.toMatch(/[٠-٩]{3,4}/)
    }
  })

  it('والحدّ يبقى يُفرَض — نصّ فوقه يُردّ قبل أن يُعتمَد', () => {
    const over = parseDraft(
      { text: 'ن'.repeat(PLATFORMS.x.hardLimit + 1), rationale: 'ر' },
      PLATFORMS.x,
    )
    expect(over.ok).toBe(false)
  })
})

describe('من فكرة المالك (D-190)', () => {
  const IDEA = 'الحوكمة لا تبطئ القرار، تحميه'
  const system = (): string => {
    const body = calls[0]!.body as { system?: { text: string }[] }
    return body.system?.[0]?.text ?? ''
  }
  const user = (): string => {
    const body = calls[0]!.body as { messages?: { content: string }[] }
    return body.messages?.[0]?.content ?? ''
  }

  it('مسوّدة بحالة draft بلا مصدر، ومفتاحُها بصمة الفكرة ومنصّتُها، والكلفة قبلها باسم الفكرة', async () => {
    const out = await draftFromIdea(deps(net()), `  ${IDEA}  `, 'linkedin')
    expect(out.kind).toBe('drafted')
    if (out.kind !== 'drafted') return
    const key = await ideaKey(IDEA, 'linkedin')
    expect(key).toMatch(/^idea:[0-9a-f]{32}:linkedin$/)
    const row = db.raw.prepare('SELECT status, source_id, idempotency_key, model, cost_usd FROM posts WHERE id = ?').get(out.postId) as Record<string, unknown>
    expect(row).toMatchObject({ status: 'draft', source_id: null, idempotency_key: key, model: 'claude-opus-5' })
    expect(row['cost_usd']).toBe(out.cost)
    const rows = await ledger()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ provider: 'anthropic', operation: 'draft:linkedin:claude-opus-5' })
    expect(db.raw.prepare('SELECT ref_id FROM cost_ledger').get()).toEqual({ ref_id: key.slice(0, key.lastIndexOf(':')) })
    // ‏الفكرةُ بكلماتها مادّةُ الكتابة، ووصفُ المنصّة نفسُه، والقيدُ على ما لم يقله
    expect(user()).toContain(IDEA)
    expect(system()).toContain('فكرة المالك بكلماته')
    expect(system()).toContain(PLATFORMS.linkedin.guide.split('\n')[0]!)
    expect(system()).toContain('ولا قصّةً شخصيّة')
  })

  it('والفكرة نفسُها مرّةً ثانيةً لا تُنادي — ولو اختلف فراغُها — ولمنصّة أخرى تُنادي', async () => {
    await draftFromIdea(deps(net()), IDEA, 'linkedin')
    const again = await draftFromIdea(deps(net()), IDEA.replace(' ', '   '), 'linkedin')
    expect(again.kind).toBe('already')
    expect(calls).toHaveLength(0)
    const x = await draftFromIdea(deps(net({ draft: { text: 'ن'.repeat(200), rationale: 'ر' } })), IDEA, 'x')
    expect(x.kind).toBe('drafted')
    expect(await ledger()).toHaveLength(2)
  })

  it('والمرفوضة تُحرِّر مفتاحَها: الضغطة التالية تكتب بديلةً', async () => {
    const first = await draftFromIdea(deps(net()), IDEA, 'linkedin')
    if (first.kind !== 'drafted') throw new Error('لم تُكتب')
    db.raw.exec(`UPDATE posts SET status = 'rejected' WHERE id = '${first.postId}'`)
    const second = await draftFromIdea(deps(net()), IDEA, 'linkedin')
    expect(second.kind).toBe('drafted')
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(2)
  })

  it('الإيقاف يمنع النداء، وفكرة فارغة أو طويلة تُردّ قبله', async () => {
    await writeSetting(db, 'paused', 'true', 'test')
    expect(await draftFromIdea(deps(net()), IDEA, 'linkedin')).toMatchObject({ kind: 'blocked' })
    await writeSetting(db, 'paused', 'false', 'test')
    expect(await draftFromIdea(deps(net()), ' قا ', 'linkedin')).toMatchObject({ kind: 'failed', retryable: false })
    expect(await draftFromIdea(deps(net()), 'ف'.repeat(1001), 'linkedin')).toMatchObject({ kind: 'failed', retryable: false })
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(0)
    expect(ideaProblem('قيادة، ثقة')).toBeNull()
    expect(normalizeIdea(' أ\n\tب ')).toBe('أ ب')
  })

  it('ونصّ فوق حدّ X يُردّ بعد أن سُجّلت كلفتُه — ولا مسوّدة', async () => {
    const out = await draftFromIdea(deps(net({ draft: { text: 'ن'.repeat(400), rationale: 'ر' } })), IDEA, 'x')
    expect(out).toMatchObject({ kind: 'failed', retryable: true })
    expect(await ledger()).toHaveLength(1)
    expect(out.kind === 'failed' ? out.cost : null).toBeCloseTo((await ledger())[0]!.total, 9)
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(0)
  })

  it('ووصف المصدر كما كان حرفًا — الفكرة باب ثان لا تعديل للأوّل', () => {
    expect(systemPrompt(PLATFORMS.linkedin)).toContain('إلّا ما ورد في الخلاصة')
    expect(systemPrompt(PLATFORMS.linkedin)).not.toContain('فكرة المالك')
  })
})

describe('صوتُ العميل في موجّه الكتابة (D-257)', () => {
  it('موجزُ منظّمة المصدر يدخل الموجّه، والفارغُ لا يُضيف شيئًا', async () => {
    const id = await seed()
    await draftPost(deps(net()), id, 'linkedin')
    expect(JSON.stringify(calls[0]?.body)).not.toContain('صوت العميل')

    const { writeBrief } = await import('../brief')
    await writeBrief(db, 'org_owner', { tone: 'هادئة واثقة بلا مبالغة' })
    await draftPost(deps(net()), id, 'x')
    const sent = JSON.stringify(calls[0]?.body)
    expect(sent).toContain('صوت العميل')
    expect(sent).toContain('هادئة واثقة بلا مبالغة')
  })
})
