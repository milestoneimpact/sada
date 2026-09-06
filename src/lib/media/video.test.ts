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
import { animateForPost } from './video'

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
