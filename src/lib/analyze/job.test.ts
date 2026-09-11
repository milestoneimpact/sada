/**
 * يختبر الترتيب لا الوظيفة وحدها: أنّ الكلفة تُسجَّل قبل الكتابة، وأنّ
 * ما لا يتغيّر لا يُدفع ثمنه مرّتين. القاعدة حقيقيّة، والشبكة وحدها مزيّفة.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { analysisCost, analyzeSource, type AnalyzeJobDeps } from './job'
import { MODEL } from './claude'
import { writeSetting } from '../settings'
import { toBase64 } from '../crypto'
import { saveKey } from '../providers'

/**
 * مفتاح RSA حقيقيّ يُولَّد مرّة.
 *
 * لا نصّ نائب: `accessToken` يوقّع JWT بـ RS256 فعلا، ومفتاحٌ زائف يجعل
 * الاختبار يفشل عند التوقيع لا عند ما نختبره. وتوليده هنا يعني أنّ مسار
 * التوقيع نفسه يُقطَع في كلّ تشغيل.
 */
async function makeServiceAccount(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)))
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64
  return JSON.stringify({
    client_email: 'sada@test.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`,
  })
}

let SA: string

const ANALYSIS = {
  summary: 'خلاصة عربية.',
  themes: ['الوقف'],
  worth_score: 0.8,
  worth_reason: 'رقمٌ من الميدان.',
  audience: 'المديرون',
  angles: ['زاوية'],
}

const DOC = 'application/vnd.google-apps.document'
let db: FakeDb
let calls: string[]

/** يزيّف سلسلة Google ثمّ Anthropic في `fetch` واحد. */
function net(options: { text?: string; anthropic?: unknown; anthropicStatus?: number } = {}) {
  calls = []
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const url = request !== null ? request.url : String(input)
    calls.push(url)

    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'g-token', expires_in: 3600 })
    }
    if (url.includes('/export')) {
      return new Response(options.text ?? 'نصّ المستند')
    }
    if (url.includes('api.anthropic.com')) {
      const body = options.anthropic ?? {
        id: 'msg_1', type: 'message', role: 'assistant', model: MODEL,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(ANALYSIS) }],
        usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500 },
      }
      return new Response(JSON.stringify(body), {
        status: options.anthropicStatus ?? 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    void init
    throw new Error(`نداء غير متوقّع: ${url}`)
  }) as unknown as typeof fetch
}

async function seedSource(mime = DOC, hash = 'md5:abc'): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO sources (id, drive_file_id, name, mime, content_hash)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, 'drive-1', 'تقرير الأثر', mime, hash)
    .run()
  return id
}

function deps(fetchImpl: typeof fetch): AnalyzeJobDeps {
  return { db, serviceAccountJson: SA, anthropicKey: 'sk-test', fetchImpl }
}

beforeAll(async () => {
  SA = await makeServiceAccount()
})

beforeEach(() => {
  db = fakeDb()
})

describe('حساب الكلفة', () => {
  it('يحاسب المخبّأ بعُشر الداخل لا بسعره', () => {
    const full = analysisCost({ inputTokens: 1000, outputTokens: 0, cachedInputTokens: 0 })
    const cached = analysisCost({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 1000 })
    expect(cached).toBeCloseTo(full / 10, 10)
  })

  it('المخرَج أغلى من المدخَل خمس مرّات', () => {
    const input = analysisCost({ inputTokens: 1000, outputTokens: 0, cachedInputTokens: 0 })
    const output = analysisCost({ inputTokens: 0, outputTokens: 1000, cachedInputTokens: 0 })
    expect(output).toBeCloseTo(input * 5, 10)
  })

  it('صفرُ استهلاك صفرُ كلفة', () => {
    expect(analysisCost({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 })).toBe(0)
  })
})

describe('المسار الكامل', () => {
  it('يحلّل ويكتب صفّا ويسجّل الكلفة', async () => {
    const sourceId = await seedSource()
    const out = await analyzeSource(deps(net()), sourceId)

    expect(out.kind).toBe('analyzed')
    if (out.kind === 'analyzed') {
      expect(out.worth).toBe(0.8)
      expect(out.cost).toBeGreaterThan(0)
    }

    const item = db.raw
      .prepare('SELECT summary, worth_score, themes_json FROM content_items WHERE source_id = ?')
      .get(sourceId) as { summary: string; worth_score: number; themes_json: string }
    expect(item.summary).toBe('خلاصة عربية.')
    expect(item.worth_score).toBe(0.8)

    const parsed = JSON.parse(item.themes_json) as Record<string, unknown>
    expect(parsed['themes']).toEqual(['الوقف'])
    expect(parsed['reason']).toBe('رقمٌ من الميدان.')
    // البصمة تُحفظ مع التحليل، فيُعرف لأيّ نسخةٍ هو
    expect(parsed['hash']).toBe('md5:abc')
  })

  it('يسجّل الكلفة على anthropic بمرجع المصدر', async () => {
    const sourceId = await seedSource()
    await analyzeSource(deps(net()), sourceId)
    const cost = db.raw
      .prepare('SELECT provider, operation, units, total, ref_id FROM cost_ledger')
      .get() as { provider: string; operation: string; units: number; total: number; ref_id: string }
    expect(cost.provider).toBe('anthropic')
    expect(cost.operation).toContain('claude-opus-5')
    expect(cost.units).toBe(1700) // 1000 + 500 + 200
    expect(cost.ref_id).toBe(sourceId)
    expect(cost.total).toBeGreaterThan(0)
  })
})

describe('لا يُدفع ثمن ما لم يتغيّر (D-008)', () => {
  it('المسح الثاني على البصمة نفسها لا ينادي Claude', async () => {
    const sourceId = await seedSource()
    await analyzeSource(deps(net()), sourceId)

    const second = net()
    const out = await analyzeSource(deps(second), sourceId)
    expect(out.kind).toBe('already')
    expect(calls.filter((u) => u.includes('anthropic'))).toHaveLength(0)

    const count = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(count.n).toBe(1)
  })

  it('تغيّر البصمة يعيد التحليل', async () => {
    const sourceId = await seedSource()
    await analyzeSource(deps(net()), sourceId)
    await db.prepare('UPDATE sources SET content_hash = ? WHERE id = ?').bind('md5:new', sourceId).run()

    const out = await analyzeSource(deps(net()), sourceId)
    expect(out.kind).toBe('analyzed')
    const count = db.raw.prepare('SELECT count(*) AS n FROM content_items').get() as { n: number }
    expect(count.n).toBe(2)
  })
})

/**
 * أهمّ ما في هذه الطبقة: أنّ الحدّ **يُفرَض** لا أنّه مكتوب.
 * فيُرصد `fetch` ويُثبَت أنّه لم يُستدعَ إطلاقا.
 */
describe('الإيقاف والسقفان يُفرضان قبل أيّ نداء', () => {
  function ledgerEntry(total: number): void {
    db.raw
      .prepare(
        `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total)
         VALUES (?, 'anthropic', 'analyze:claude-opus-5', 1000, ?, ?)`,
      )
      .run(crypto.randomUUID(), total / 1000, total)
  }

  it('الإيقاف يمنع — ولا يُلمس Drive فضلا عن Claude', async () => {
    const sourceId = await seedSource()
    await writeSetting(db, 'paused', 'true', 'test')

    const out = await analyzeSource(deps(net()), sourceId)
    expect(out.kind).toBe('blocked')
    if (out.kind === 'blocked') expect(out.reason).toContain('موقوف')
    // لا نداء شبكة إطلاقا: لا Google ولا Anthropic
    expect(calls).toHaveLength(0)
  })

  it('سقف العدد يمنع بعد بلوغه', async () => {
    const sourceId = await seedSource()
    await writeSetting(db, 'daily_analysis_cap', '1', 'test')
    ledgerEntry(0.001)

    const out = await analyzeSource(deps(net()), sourceId)
    expect(out.kind).toBe('blocked')
    if (out.kind === 'blocked') expect(out.reason).toContain('سقف التحليل')
    expect(calls).toHaveLength(0)
  })

  it('سقف المال يمنع ولو بقي في سقف العدد متّسع', async () => {
    const sourceId = await seedSource()
    await writeSetting(db, 'daily_analysis_cap', '100', 'test')
    await writeSetting(db, 'daily_spend_cap_usd', '0.5', 'test')
    ledgerEntry(0.9)

    const out = await analyzeSource(deps(net()), sourceId)
    expect(out.kind).toBe('blocked')
    if (out.kind === 'blocked') expect(out.reason).toContain('سقف الإنفاق')
    expect(calls).toHaveLength(0)
  })

  it('المنع لا يكتب في الدفتر ولا في التحليل', async () => {
    const sourceId = await seedSource()
    await writeSetting(db, 'paused', 'true', 'test')
    await analyzeSource(deps(net()), sourceId)

    const cost = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    const items = db.raw.prepare('SELECT count(*) AS n FROM content_items').get() as { n: number }
    expect(cost.n).toBe(0)
    expect(items.n).toBe(0)
  })

  it('رفعُ الإيقاف يعيد العمل فورا — بلا نشرٍ ولا إعادة تشغيل', async () => {
    const sourceId = await seedSource()
    await writeSetting(db, 'paused', 'true', 'test')
    expect((await analyzeSource(deps(net()), sourceId)).kind).toBe('blocked')

    await writeSetting(db, 'paused', 'false', 'test')
    expect((await analyzeSource(deps(net()), sourceId)).kind).toBe('analyzed')
  })

  it('«محلَّل بالفعل» لا يُمنع بسقف — ما لا يكلّف شيئا لا يُحاسَب', async () => {
    const sourceId = await seedSource()
    await analyzeSource(deps(net()), sourceId)

    await writeSetting(db, 'paused', 'true', 'test')
    const out = await analyzeSource(deps(net()), sourceId)
    expect(out.kind).toBe('already')
  })
})

describe('يُقبل معرّف Drive كما يُقبل معرّف الصفّ', () => {
  it('التحليل بمعرّف Drive يعمل — وهو ما يعيده تقرير المسح', async () => {
    const sourceId = await seedSource()
    const out = await analyzeSource(deps(net()), 'drive-1')
    expect(out.kind).toBe('analyzed')
    // والمخرَج يعيد معرّف الصفّ لا ما أُدخل، فلا يلتبس المرجعان
    expect(out.sourceId).toBe(sourceId)
  })

  it('«محلَّل بالفعل» يُكتشف عبر معرّف Drive أيضا', async () => {
    await seedSource()
    await analyzeSource(deps(net()), 'drive-1')
    const second = net()
    const out = await analyzeSource(deps(second), 'drive-1')
    expect(out.kind).toBe('already')
    expect(calls.filter((u) => u.includes('anthropic'))).toHaveLength(0)
  })
})

describe('ما يُتخطّى ولا يوقف شيئا', () => {
  it.each([
    ['PDF', 'application/pdf'],
    ['صورة', 'image/png'],
    ['عرض PowerPoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ])('%s يُتخطّى بسببٍ مفهوم ولا يكلّف شيئا', async (_name, mime) => {
    const sourceId = await seedSource(mime)
    const out = await analyzeSource(deps(net()), sourceId)
    expect(out.kind).toBe('skipped')
    if (out.kind === 'skipped') expect(out.reason.length).toBeGreaterThan(5)
    expect(calls.filter((u) => u.includes('anthropic'))).toHaveLength(0)
    const count = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(count.n).toBe(0)
  })

  it('المستند الفارغ يُتخطّى قبل النداء', async () => {
    const sourceId = await seedSource()
    const out = await analyzeSource(deps(net({ text: '   \n  ' })), sourceId)
    expect(out.kind).toBe('skipped')
    expect(calls.filter((u) => u.includes('anthropic'))).toHaveLength(0)
  })

  it('مصدرٌ غير موجود يُبلَّغ ولا يُعاد', async () => {
    const out = await analyzeSource(deps(net()), 'لا-وجود-له')
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(false)
  })
})

describe('حين يفشل النداء', () => {
  it('يُسجَّل في cost_ledger صفرُ صفوف — لم يقع نداءٌ محاسَب عليه', async () => {
    const sourceId = await seedSource()
    const out = await analyzeSource(
      deps(net({ anthropicStatus: 500, anthropic: { type: 'error', error: { type: 'x', message: 'x' } } })),
      sourceId,
    )
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(true)
    const count = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(count.n).toBe(0)
    const items = db.raw.prepare('SELECT count(*) AS n FROM content_items').get() as { n: number }
    expect(items.n).toBe(0)
  })

  it('طلبٌ فاسد لا يُعاد', async () => {
    const sourceId = await seedSource()
    const out = await analyzeSource(
      deps(net({ anthropicStatus: 400, anthropic: { type: 'error', error: { type: 'x', message: 'x' } } })),
      sourceId,
    )
    if (out.kind !== 'failed') throw new Error('توقّعنا فشلا')
    expect(out.retryable).toBe(false)
  })
})

/**
 * صورةٌ في Drive — **تُقرأ نصّا ثمّ تمضي في المسار نفسِه** (D-124).
 *
 * وكانت تُردّ «صورة — لا نص فيها تُقرأ منه»، **وعرضٌ مصوَّرٌ يحمل ما
 * يستحقّ النشر**.
 */
describe('قراءةُ الصور (D-124)', () => {
  const PNG = 'image/png'
  const SEEN = 'عرضٌ من أربع شرائح، عنوانُه «أثرُ البرامج»، وفيه جدولٌ وأرقامٌ ربعيّة تُقرأ.'

  /**
   * يُضبَط مزوّدُ رؤيةٍ حقيقيٌّ — **بمفتاحٍ مشفَّرٍ كما يُحفَظ فعلا**.
   *
   * ولا يُكتب `key_enc` حرفا: `resolveKey` تفكّه بـAES-GCM، **فقيمةٌ
   * مصنوعةٌ تُسقط الحلَّ لا تختبره**.
   */
  const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

  async function seedVision(): Promise<void> {
    await saveKey(db, KEY, 'gemini', 'gk-test', 'test')
  }

  /** شبكةٌ تخدم Drive وGemini وAnthropic. */
  function visionNet(options: { description?: string } = {}): typeof fetch {
    return (async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('oauth2.googleapis.com')) {
        return Response.json({ access_token: 'g', expires_in: 3600 })
      }
      // **`alt=media` لا `export`**: الصورةُ تُنزَّل كما هي
      if (url.includes('alt=media')) {
        return new Response(new Uint8Array([137, 80, 78, 71]).buffer)
      }
      if (url.includes('generativelanguage')) {
        return Response.json({
          choices: [{
            message: { content: options.description ?? SEEN },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 1500, completion_tokens: 80 },
          model: 'gemini-2.5-flash',
        })
      }
      if (url.includes('api.anthropic.com')) {
        return Response.json({
          id: 'msg_1', type: 'message', role: 'assistant', model: MODEL,
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify(ANALYSIS) }],
          usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0 },
        })
      }
      void init
      throw new Error(`نداء غير متوقّع: ${url}`)
    }) as unknown as typeof fetch
  }

  it('صورةٌ تُقرأ ثمّ تُحلَّل كأيّ نصّ', async () => {
    await seedVision()
    const sourceId = await seedSource(PNG)
    const out = await analyzeSource({ ...deps(visionNet()), encKey: KEY }, sourceId)

    expect(out.kind).toBe('analyzed')
    // **والفهمُ كُتب فعلا** — لا «تُخطّيت»
    const row = db.raw
      .prepare('SELECT summary FROM content_items WHERE source_id = ?')
      .get(sourceId) as { summary: string } | undefined
    expect(row?.summary).toBeDefined()
  })

  /** **والنداءُ يُسجَّل قبل أن يُعَدّ ناجحا** (D-008) — بمزوّده لا باسمٍ ثابت. */
  it('ونداءُ الرؤية يُسجَّل في الدفتر', async () => {
    await seedVision()
    const sourceId = await seedSource(PNG)
    await analyzeSource({ ...deps(visionNet()), encKey: KEY }, sourceId)

    const row = db.raw
      .prepare("SELECT operation, units FROM cost_ledger WHERE operation LIKE 'vision:%'")
      .get() as { operation: string; units: number } | undefined
    expect(row?.operation).toContain('gemini-2.5-flash')
    expect(row?.units).toBe(1580)
  })

  /**
   * **وبلا مزوّدِ رؤيةٍ تبقى كما كانت** — ولا تُنزَّل بايتاتُها.
   *
   * فلا نقلَ بلا فائدة، **والرسالةُ تقول ما يفعل المالك**.
   */
  it('وبلا مزوّدٍ تبقى غيرَ مدعومةٍ ولا تُنزَّل', async () => {
    const sourceId = await seedSource(PNG)
    let downloaded = false
    const net = (async (input: unknown): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('alt=media')) { downloaded = true }
      if (url.includes('oauth2.googleapis.com')) {
        return Response.json({ access_token: 'g', expires_in: 3600 })
      }
      throw new Error(`نداء غير متوقّع: ${url}`)
    }) as unknown as typeof fetch

    const out = await analyzeSource(deps(net), sourceId)
    expect(out.kind).toBe('skipped')
    if (out.kind === 'skipped') expect(out.reason).toContain('الرؤية')
    expect(downloaded).toBe(false)
  })

  /** **ووصفٌ قصيرٌ لا يُمرَّر**: التحليلُ يحكم على الفراغ وينفق ثمنَ حكمه. */
  it('ووصفٌ قصيرٌ يُردّ ولا يُحلَّل', async () => {
    await seedVision()
    const sourceId = await seedSource(PNG)
    const out = await analyzeSource(
      { ...deps(visionNet({ description: 'صورة.' })), encKey: KEY },
      sourceId,
    )
    expect(out.kind).toBe('failed')
    const row = db.raw
      .prepare('SELECT count(*) AS n FROM content_items WHERE source_id = ?')
      .get(sourceId) as { n: number }
    expect(row.n).toBe(0)
  })
})
