/**
 * تحريكُ الصورة — القاعدةُ حقيقيّةٌ بقيودها، والرابطُ والشبكةُ مزيّفان.
 *
 * وما يُثبَت هنا أربعة: أنّ **الحارسَ قبل النداء**، وأنّ المقطعَ لا
 * يُولَّد مرّتين (وهو أغلى ما يُنادى)، وأنّ **R2 قبل الصفّ**، وأنّ
 * الرابطَ الموقَّع الممرَّرَ للمزوّد **يفتح الصورةَ المصدرَ وحدها**.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { toBase64 } from '../crypto'
import { writeSetting } from '../settings'
import { verifyMediaToken } from './link'
import { VIDEO_MODELS, type AiBinding } from './workersAi'
import { animateForPost, bindingFor, DEFAULT_PROMPT, pickBinding, videoFace, videoKey } from './video'
import { saveKey, upsertProvider } from '../providers'
import { claimGeneration } from './claim'
import { writeRoute } from '../ai/routes'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const BASE = 'https://sada2.basserh.com'

let db: FakeDb
let puts: string[]

function bucket(fail = false): { put(k: string, v: ArrayBuffer | Uint8Array): Promise<unknown> } {
  return {
    async put(k) {
      if (fail) throw new Error('R2 مغلق')
      puts.push(k)
      return null
    },
  }
}

function ai(
  reply: unknown | (() => never),
): AiBinding & { calls: { model: string; input: Record<string, unknown> }[] } {
  const calls: { model: string; input: Record<string, unknown> }[] = []
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input })
      if (typeof reply === 'function') return (reply as () => never)()
      return reply
    },
  }
}

const OK_VIDEO = { state: 'Completed', result: { video: 'https://cf.example/v.mp4' } }

const pull = (n = 2048): typeof fetch =>
  (async () =>
    new Response(new Uint8Array(n), { headers: { 'Content-Type': 'video/mp4' } })) as
    unknown as typeof fetch

function seedPost(id = 'p1'): void {
  db.raw
    .prepare(
      `INSERT INTO posts (id, platform, type, text, status, idempotency_key)
       VALUES (?, 'linkedin', 'image', 'نصّ', 'approved', ?)`,
    )
    .run(id, `k-${id}`)
}

function seedMedia(o: {
  id: string
  postId?: string
  mime: string
  status?: 'ready' | 'rejected'
}): void {
  db.raw
    .prepare(
      `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model,
                          status, idempotency_key)
       VALUES (?, ?, ?, ?, 100, 'وصف', 'نموذج', ?, ?)`,
    )
    .run(o.id, o.postId ?? 'p1', `k/${o.id}`, o.mime, o.status ?? 'ready', `idem-${o.id}`)
}

const deps = (a: AiBinding | undefined, f = pull(), b = bucket()) => ({
  db, bucket: b, ai: a, encKey: KEY, baseUrl: BASE, fetchImpl: f,
})

beforeEach(() => {
  db = fakeDb()
  puts = []
})

describe('الحارسُ قبل النداء', () => {
  it('بلا رابطِ Workers AI يُقال ولا يُسقَط الطلب', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    const out = await animateForPost(deps(undefined), 'p1')
    expect(out).toMatchObject({ kind: 'blocked' })
  })

  /** الإيقافُ قرارُ المالك الصريح، ولا يُنقَض بأيّ شيء (D-019). */
  it('والنظامُ الموقوف يمنع قبل أن يُنفَق', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    await writeSetting(db, 'paused', 'true', 'omar')
    const a = ai(OK_VIDEO)
    const out = await animateForPost(deps(a), 'p1')

    expect(out.kind).toBe('blocked')
    expect(a.calls).toHaveLength(0)
    const n = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(n.n).toBe(0)
  })

  it('وبلا صورةٍ معتمَدةٍ لا تحريك', async () => {
    seedPost()
    const a = ai(OK_VIDEO)
    const out = await animateForPost(deps(a), 'p1')
    expect(out).toMatchObject({ kind: 'blocked' })
    expect(a.calls).toHaveLength(0)
  })

  /** ما رُفض حُكم عليه، وتحريكُه إنفاقٌ على ما لن يُنشَر. */
  it('وصورةٌ مرفوضةٌ لا تُحرَّك', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png', status: 'rejected' })
    const a = ai(OK_VIDEO)
    expect(await animateForPost(deps(a), 'p1')).toMatchObject({ kind: 'blocked' })
    expect(a.calls).toHaveLength(0)
  })
})

describe('التوليد', () => {
  it('يولّد ويكتب البايتاتِ ثمّ الصفّ', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    const out = await animateForPost(deps(ai(OK_VIDEO)), 'p1')

    expect(out).toMatchObject({ kind: 'generated', bytes: 2048 })
    expect(puts).toHaveLength(1)
    const row = db.raw
      .prepare(`SELECT mime, model, bytes FROM media WHERE mime LIKE 'video/%'`)
      .get() as { mime: string; model: string; bytes: number }
    expect(row).toMatchObject({ mime: 'video/mp4', model: VIDEO_MODELS.fromImage, bytes: 2048 })
  })

  it('ويطلب رأسيّا ٩:١٦ بخمسَ عشرةَ ثانية', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    const a = ai(OK_VIDEO)
    await animateForPost(deps(a), 'p1')
    expect(a.calls[0]!.input['ratio']).toBe('9:16')
    expect(a.calls[0]!.input['duration']).toBe(15)
    expect(a.calls[0]!.model).toBe(VIDEO_MODELS.fromImage)
  })

  /**
   * **الرابطُ الممرَّرُ يفتح الصورةَ المصدرَ وحدها.**
   *
   * ولو مُرّر معرّفٌ عارٍ لفُتح الدلوُ لمن يخمّن. ولو وُقّع لمعرّفٍ آخر
   * لسحب المزوّدُ صورةً غيرَ التي اعتمدها المالك.
   */
  it('والرابطُ موقَّعٌ ويفتح الصورةَ المصدرَ وحدها', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    const a = ai(OK_VIDEO)
    await animateForPost(deps(a), 'p1')

    const url = String(a.calls[0]!.input['image'])
    expect(url.startsWith(`${BASE}/m/`)).toBe(true)
    const token = url.slice(`${BASE}/m/`.length)
    expect(await verifyMediaToken(KEY, token)).toEqual({ ok: true, mediaId: 'img' })
  })

  /** الفيديو أغلى ما يُنادى: مقطعٌ قائمٌ لا يُعاد توليدُه. */
  it('ولا يولّد مرّتين لمنشورٍ واحد', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    await animateForPost(deps(ai(OK_VIDEO)), 'p1')

    const a = ai(OK_VIDEO)
    const out = await animateForPost(deps(a), 'p1')
    expect(out.kind).toBe('already')
    expect(a.calls).toHaveLength(0)
    const n = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(n.n).toBe(1)
  })
})

/**
 * **الحجزُ قبل الإنفاق (D-068).**
 *
 * الفحصُ في «ولا يولّد مرّتين» يقرأ صفَّ `media` — **ولا يوجد إلّا بعد
 * دقائق**: التوليدُ ثمّ السحبُ ثمّ الرفع. فنقرةٌ ثانيةٌ في تلك الدقائق
 * كانت تجد «لا مقطع» وتبدأ توليدا ثانيا **وتدفع ثمنَه**.
 *
 * وما يُثبَت هنا أنّ الثانيةَ **لا تنادي ولا تُسجَّل لها كلفة**.
 */
describe('الحجزُ قبل الإنفاق (D-068)', () => {
  it('ونداءٌ جارٍ يمنع الثانيَ قبل أن يُنفِق', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })

    // نداءٌ سابقٌ حجز ولم يفرغ بعد
    const key = await videoKey('p1', DEFAULT_PROMPT)
    await claimGeneration(db, key, 'p1', 'video', new Date('2026-09-08T09:00:00.000Z'))

    const a = ai(OK_VIDEO)
    const out = await animateForPost(
      { ...deps(a), now: () => new Date('2026-09-08T09:02:00.000Z') },
      'p1',
    )

    expect(out.kind).toBe('in_progress')
    expect(a.calls).toHaveLength(0)
    const n = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(n.n).toBe(0)
  })

  /**
   * **وفشلٌ يترك حجزَه يمنع إعادةَ المحاولة ثلاثين دقيقة** — فالمالكُ
   * يرى «جارٍ» على نداءٍ مات.
   */
  it('وفشلُ التوليد يحرّر حجزَه فتُقبل الإعادة', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })

    const failing = ai(undefined)
    const first = await animateForPost(deps(failing), 'p1')
    expect(first.kind).toBe('failed')

    const second = await animateForPost(deps(ai(OK_VIDEO)), 'p1')
    expect(second.kind).toBe('generated')
  })

  /**
   * **ومفتاحُ R2 ليس مفتاحَ عدم التكرار.** كان الواحدُ يؤدّي الدورين
   * وفيه `uuid` — فعمودٌ `UNIQUE` لا يمنع شيئا.
   */
  it('ومفتاحُ الصفّ مشتقٌّ من المحتوى لا من الصدفة', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    await animateForPost(deps(ai(OK_VIDEO)), 'p1')

    const row = db.raw
      .prepare(`SELECT idempotency_key AS k, r2_key AS r FROM media WHERE mime LIKE 'video/%'`)
      .get() as { k: string; r: string }
    expect(row.k).toBe(await videoKey('p1', DEFAULT_PROMPT))
    expect(row.r).not.toBe(row.k)
  })
})

describe('الدفتر', () => {
  /**
   * **ولا يُخترَع سعر.** سعرُ الفيديو يُقرأ من لوحة Cloudflare ولم
   * يُقرأ بعد، فيُسجَّل صفرٌ **موسوم** — ودفترٌ يقول «لم يُسعَّر» أصدقُ
   * من رقمٍ يُظنّ حقيقةً وهو تخمين.
   */
  it('يُسجّل صفرا موسوما لا رقما مخمَّنا', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    await animateForPost(deps(ai(OK_VIDEO)), 'p1')

    const row = db.raw
      .prepare('SELECT provider, operation, total FROM cost_ledger')
      .get() as { provider: string; operation: string; total: number }
    expect(row.provider).toBe('cloudflare')
    expect(row.operation).toContain('price_unverified')
    expect(row.total).toBe(0)
  })

  /** التكلفةُ قبل النجاح (D-008): نداءٌ وقع يُحسَب ولو فشل بعده. */
  it('ويُسجَّل ولو فشل التوليدُ بعده', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    const out = await animateForPost(
      deps(ai(() => { throw new Error('3040 Out of capacity') })),
      'p1',
    )
    expect(out).toMatchObject({ kind: 'failed', retryable: true })
    const n = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(n.n).toBe(1)
  })
})

describe('الفشلُ لا يترك صفّا يكذب', () => {
  /** صفٌّ يشير إلى بايتاتٍ لا وجودَ لها يكذب، وبايتاتٌ بلا صفٍّ تيتم. */
  it('R2 يفشل فلا يُكتب صفٌّ', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    const out = await animateForPost(deps(ai(OK_VIDEO), pull(), bucket(true)), 'p1')

    expect(out).toMatchObject({ kind: 'failed', retryable: true })
    const n = db.raw
      .prepare(`SELECT count(*) AS n FROM media WHERE mime LIKE 'video/%'`)
      .get() as { n: number }
    expect(n.n).toBe(0)
  })

  it('والسحبُ يفشل فلا بايتاتٍ ولا صفّ', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    const dead = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
    const out = await animateForPost(deps(ai(OK_VIDEO), dead), 'p1')

    expect(out).toMatchObject({ kind: 'failed', retryable: true })
    expect(puts).toHaveLength(0)
  })

  it('وحالةٌ غيرُ مكتملةٍ تُعدّ قابلةً للإعادة', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    const out = await animateForPost(deps(ai({ state: 'Running' })), 'p1')
    expect(out).toMatchObject({ kind: 'failed', retryable: true })
  })
})

describe('اختيارُ الوجه — والرابطُ يُفضَّل متى بلغ', () => {
  const binding: AiBinding = { async run() { return {} } }

  /** مَن جمع الحسابين حذف السرَّ من نظامه. */
  it('بلا حسابٍ ثانٍ يُختار الرابط — ولا سرَّ يُدوَّر', () => {
    expect(pickBinding({ AI: binding })).toBe(binding)
  })

  /** والرابطُ يبلغ حسابَ الـ Worker وحده، فحسابٌ آخر يوجب REST. */
  it('وبحسابٍ ثانٍ ورمزٍ يُختار REST ولو وُجد الرابط', () => {
    const picked = pickBinding({
      AI: binding, CF_AI_ACCOUNT_ID: 'acc', CF_AI_TOKEN: 'tok',
    })
    expect(picked).toBeDefined()
    expect(picked).not.toBe(binding)
  })

  it('وضبطٌ ناقصٌ يعود إلى الرابط — ولا يُنادى بنصفِ ضبط', () => {
    expect(pickBinding({ AI: binding, CF_AI_ACCOUNT_ID: 'acc' })).toBe(binding)
    expect(pickBinding({ AI: binding, CF_AI_TOKEN: 'tok' })).toBe(binding)
    // وفراغٌ بمسافاتٍ ليس ضبطا
    expect(pickBinding({ AI: binding, CF_AI_ACCOUNT_ID: '  ', CF_AI_TOKEN: ' ' })).toBe(binding)
  })

  it('وبلا شيءٍ لا وجه', () => {
    expect(pickBinding({})).toBeUndefined()
  })
})

/**
 * **توجيهُ الفيديو يُطاع** (D-091).
 *
 * كان `alibaba/hh1-i2v` مثبَّتا في الشيفرة، **فاختيارُ المالك في اللوحة
 * يُكتب في `task_routes` ولا يصل إلى النداء**. وهي علّةُ D-079 نفسُها في
 * مكانٍ لم يُفتَّش: يُقرأ ولا يُطاع.
 *
 * وهو **أغلى ما يُنادى في النظام** — فأن يُختار نموذجُه أولى لا أدنى.
 */
describe('توجيهُ الفيديو يُطاع لا يُقرأ وحسب (D-091)', () => {
  it('النموذجُ المكتوبُ في اللوحة هو المُنادى', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    await writeRoute(db, 'video', 'cloudflare', '@cf/other/model-v2', 'panel')

    const link = ai(OK_VIDEO)
    const out = await animateForPost(deps(link), 'p1')
    expect(out.kind).toBe('generated')
    expect(link.calls[0]!.model).toBe('@cf/other/model-v2')
  })

  it('ويُسجَّل في الدفتر ما نُودي به — لا اسمٌ ثابت', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    await writeRoute(db, 'video', 'cloudflare', '@cf/other/model-v2', 'panel')

    await animateForPost(deps(ai(OK_VIDEO)), 'p1')
    const row = await db
      .prepare("SELECT operation FROM cost_ledger WHERE operation LIKE 'video:%'")
      .first<{ operation: string }>()
    expect(row?.operation).toContain('@cf/other/model-v2')
  })

  it('ويُكتب في صفّ الوسيط كذلك — فيُعرَف بأيّ نموذجٍ وُلّد', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })
    await writeRoute(db, 'video', 'cloudflare', '@cf/other/model-v2', 'panel')

    const out = await animateForPost(deps(ai(OK_VIDEO)), 'p1')
    expect(out.kind).toBe('generated')
    if (out.kind !== 'generated') return
    const row = await db
      .prepare('SELECT model FROM media WHERE id = ?')
      .bind(out.mediaId)
      .first<{ model: string }>()
    expect(row?.model).toBe('@cf/other/model-v2')
  })

  it('وبلا توجيهٍ مكتوبٍ يُنادى افتراضُ الشيفرة — لا فراغ', async () => {
    seedPost()
    seedMedia({ id: 'img', mime: 'image/png' })

    const link = ai(OK_VIDEO)
    await animateForPost(deps(link), 'p1')
    expect(link.calls[0]!.model).toBe(VIDEO_MODELS.fromImage)
  })
})

describe('الوجهُ من بطاقة المزوّد حين تغيب البيئة (D-157)', () => {
  const seen: string[] = []
  const net = (async (url: unknown) => {
    seen.push(String(url))
    return new Response(JSON.stringify({ success: true, result: OK_VIDEO }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch

  it('وصفُ المقطع الافتراضيّ إنجليزيّ — النموذجُ لا يقرأ العربيّة', () => {
    expect(/[\u0600-\u06FF]/.test(DEFAULT_PROMPT)).toBe(false)
    expect(DEFAULT_PROMPT).toContain('no text')
  })

  it('البيئةُ أوّلا', async () => {
    seen.length = 0
    const b = await bindingFor({ CF_AI_ACCOUNT_ID: 'env-acc', CF_AI_TOKEN: 'env-tok' }, db, KEY, net)
    await b!.run('@cf/m', {})
    expect(seen[0]).toContain('/accounts/env-acc/')
  })

  it('ثمّ مفتاحُ البطاقة ومعرّفُ حسابها من عنوانها', async () => {
    seen.length = 0
    await upsertProvider(db, {
      name: 'cloudflare', label: 'Cloudflare', kind: 'openai_compat',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/card-acc/ai/v1',
    }, 'test')
    await saveKey(db, KEY, 'cloudflare', 'card-token-long-enough', 'test')
    const b = await bindingFor({}, db, KEY, net)
    expect(b).toBeDefined()
    await b!.run('@cf/m', {})
    expect(seen[0]).toContain('/accounts/card-acc/')
  })

  it('ولا بطاقةَ ولا بيئة: يبقى env.AI أو لا شيء', async () => {
    const binding = ai(OK_VIDEO)
    expect(await bindingFor({ AI: binding }, db, KEY, net)).toBe(binding)
    expect(await bindingFor({}, db, KEY, net)).toBeUndefined()
  })

  /**
   * **والبيئةُ تغلب البطاقةَ ولو حضرتا معًا** (D-163). اختبارُ «البيئةُ أوّلا»
   * أعلاه يعمل على قاعدةٍ بلا بطاقة، فقلبُ الأسبقيّة لا يُسقطه — وهذا يُسقطه.
   */
  it('والبطاقةُ حاضرةٌ بمفتاحها: البيئةُ تُنادى لا البطاقة', async () => {
    seen.length = 0
    await upsertProvider(db, {
      name: 'cloudflare', label: 'Cloudflare', kind: 'openai_compat',
      baseUrl: 'https://api.cloudflare.com/client/v4/accounts/card-acc/ai/v1',
    }, 'test')
    await saveKey(db, KEY, 'cloudflare', 'card-token-long-enough', 'test')
    const b = await bindingFor({ CF_AI_ACCOUNT_ID: 'env-acc', CF_AI_TOKEN: 'env-tok' }, db, KEY, net)
    await b!.run('@cf/m', {})
    expect(seen[0]).toContain('/accounts/env-acc/')
  })

  it('وحين تكفي البيئة لا يُسأل جدولُ المزوّدين أصلًا — ولا يُفكّ مفتاحُ الخزنة', async () => {
    const asked: string[] = []
    const spy = { prepare: (sql: string) => { asked.push(sql); return db.prepare(sql) } }
    await bindingFor({ CF_AI_ACCOUNT_ID: 'env-acc', CF_AI_TOKEN: 'env-tok' }, spy, KEY, net)
    expect(asked.filter((q) => q.includes('providers'))).toHaveLength(0)
    await bindingFor({ CF_AI_TOKEN: 'env-tok' }, spy, KEY, net)
    expect(asked.filter((q) => q.includes('providers')).length).toBeGreaterThan(0)
  })
})

describe('videoFace — الوجهُ نقيًّا، يناديه bindingFor ولوحُ المسوّدات (D-163)', () => {
  const card = { enabled: true, hasKey: true, urlAccount: true }
  it.each([
    ['البيئةُ كاملةً تغلب البطاقة', { envAccount: true, envToken: true, card, binding: true }, 'env'],
    ['بطاقةٌ بمفتاحٍ وحسابٍ في عنوانها', { envAccount: false, envToken: false, card, binding: true }, 'card'],
    ['وبلا حسابٍ في عنوانها يكفيها حسابُ البيئة',
      { envAccount: true, envToken: false, card: { ...card, urlAccount: false }, binding: false }, 'card'],
    ['بلا حسابٍ هنا ولا هناك: الرابط',
      { envAccount: false, envToken: true, card: { ...card, urlAccount: false }, binding: true }, 'binding'],
    ['بطاقةٌ معطَّلة: الرابط', { envAccount: false, envToken: false, card: { ...card, enabled: false }, binding: true }, 'binding'],
    ['بطاقةٌ بلا مفتاحٍ ولا رابط: لا وجه',
      { envAccount: false, envToken: false, card: { ...card, hasKey: false }, binding: false }, 'none'],
    ['لا بطاقة ولا رابط: لا وجه', { envAccount: false, envToken: false, card: null, binding: false }, 'none'],
  ] as const)('%s', (_, input, face) => {
    expect(videoFace(input)).toBe(face)
  })
})
