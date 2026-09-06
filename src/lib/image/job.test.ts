/**
 * توليدُ الصور — **والترتيبُ هو ما يُختبَر.**
 *
 * ثلاثةُ أسئلةٍ لا يجيبها تشغيلٌ ناجح واحد:
 *
 *   · أيقع النداءُ المدفوع قبل الحارس أم بعده؟
 *   · أتُسجَّل الكلفةُ حين يفشل ما بعدها؟
 *   · **أيبقى صفٌّ يشير إلى بايتاتٍ لم تُرفَع؟**
 *
 * والثالثُ هو الأخطر: صفٌّ يكذب يجعل المالك يعتمد منشورا بصورةٍ لم يرها.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { generateForPost, imageKey, mediaFor, rejectMedia, type Bucket, type ImageDeps } from './job'
import { imagePrompt, topicOf } from './prompt'
import { writeSetting } from '../settings'

let db: FakeDb
let calls: { url: string; body: unknown; headers: Record<string, string> }[]

/** بايتاتُ PNG صغيرةٌ صالحة، مرمَّزةٌ base64 كما يعيدها المزوّد. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function bucket(options: { failPut?: boolean } = {}): Bucket & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    async put(key, value) {
      if (options.failPut === true) throw new Error('R2 مغلق')
      objects.set(key, value instanceof Uint8Array ? value : new Uint8Array(value))
      return undefined
    },
    async get(key) {
      const found = objects.get(key)
      return found === undefined
        ? null
        : { async arrayBuffer() { return found.buffer as ArrayBuffer } }
    },
    async delete(key) {
      objects.delete(key)
    },
  }
}

function net(
  options: { payload?: unknown; status?: number; b64?: string } = {},
): typeof fetch {
  calls = []
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    )
    let body: unknown = null
    try {
      body = JSON.parse(String(init?.body ?? '{}'))
    } catch {
      body = null
    }
    calls.push({ url, body, headers })

    if ((options.status ?? 200) !== 200) {
      return new Response(JSON.stringify({ error: { message: 'لا' } }), {
        status: options.status ?? 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const payload = options.payload ?? {
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: options.b64 ?? PNG_B64 } }],
          },
        },
      ],
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

async function seedPost(options: { status?: string; text?: string; platform?: string } = {}): Promise<string> {
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at)
       VALUES (?, ?, 'text', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      options.platform ?? 'linkedin',
      options.text ?? 'أكثرُ ما يُهدر في برامج الوقف ليس المال، بل الوقتُ بين القرار وأثره. وهذا ما يقيسه التقرير.',
      options.status ?? 'draft',
      `k-${id}`,
      options.status === 'approved' ? 'panel:token' : null,
      options.status === 'approved' ? '2026-09-08T07:00:00Z' : null,
    )
    .run()
  return id
}

function deps(fetchImpl: typeof fetch, b: Bucket = bucket()): ImageDeps {
  return {
    db,
    bucket: b,
    encKey: '',
    workerSecrets: { GEMINI_API_KEY: 'AIza-test' },
    fetchImpl,
  }
}

async function ledger(): Promise<{ operation: string; total: number }[]> {
  const { results } = await db
    .prepare('SELECT operation, total FROM cost_ledger')
    .all<{ operation: string; total: number }>()
  return results
}

beforeEach(() => {
  db = fakeDb()
})

describe('المسار الكامل', () => {
  it('يرفع إلى R2 ويكتب الصفّ ويسجّل الكلفة', async () => {
    const post = await seedPost()
    const b = bucket()
    const out = await generateForPost(deps(net(), b), post)

    expect(out.kind).toBe('generated')
    if (out.kind !== 'generated') return
    expect(out.bytes).toBeGreaterThan(0)
    expect(b.objects.has(out.key)).toBe(true)
    expect(out.key).toMatch(/^img\//)

    const rows = await mediaFor(db, [post])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('ready')
    expect(rows[0]?.mime).toBe('image/png')

    expect((await ledger())[0]?.operation).toContain('image:linkedin')
  })

  it('المفتاحُ في ترويسة لا في العنوان — فلا يُسجَّل في وسيط', async () => {
    await generateForPost(deps(net()), await seedPost())
    expect(calls[0]?.url).not.toContain('AIza-test')
    expect(calls[0]?.headers['x-goog-api-key']).toBe('AIza-test')
  })

  it('يطلب صورةً بلا حرف — وهو أوّلُ قيدٍ في الوصف', async () => {
    await generateForPost(deps(net()), await seedPost())
    const sent = calls[0]?.body as { contents?: { parts?: { text?: string }[] }[] }
    const prompt = sent.contents?.[0]?.parts?.[0]?.text ?? ''
    expect(prompt).toContain('لا حرفَ ولا كلمةَ ولا رقمَ في الصورة')
  })
})

describe('**بايتاتٌ يتيمةٌ أرخص من صفٍّ يكذب**', () => {
  it('حين يفشل الرفع لا يُكتب صفّ', async () => {
    const post = await seedPost()
    const out = await generateForPost(deps(net(), bucket({ failPut: true })), post)

    expect(out.kind).toBe('failed')
    // ولا صفَّ يشير إلى بايتاتٍ لم تصل
    expect(await mediaFor(db, [post])).toHaveLength(0)
    // والكلفةُ مسجّلةٌ رغم ذلك: النداءُ وقع وحوسِب عليه
    expect(await ledger()).toHaveLength(1)
  })

  it('وكلُّ صفٍّ مكتوبٍ له بايتاتٌ فعلا', async () => {
    const post = await seedPost()
    const b = bucket()
    await generateForPost(deps(net(), b), post)
    for (const row of await mediaFor(db, [post])) {
      expect(b.objects.has(row.key)).toBe(true)
    }
  })
})

describe('D-008 · الكلفة قبل ما بعدها', () => {
  it('تُسجَّل حتّى حين تتجاوز الصورةُ سقفَ الحجم', async () => {
    const post = await seedPost()
    // صورةٌ فوق خمسة ميغابايت
    const huge = btoa('x'.repeat(6 * 1024 * 1024))
    const out = await generateForPost(deps(net({ b64: huge })), post)

    expect(out.kind).toBe('failed')
    expect(await ledger()).toHaveLength(1)
    expect(await mediaFor(db, [post])).toHaveLength(0)
  })

  it('ولا تُسجَّل حين يفشل النداءُ نفسه — لا نداءَ لا حساب', async () => {
    const out = await generateForPost(deps(net({ status: 500 })), await seedPost())
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(true)
    expect(await ledger()).toHaveLength(0)
  })

  it('ومنعُ السياسة لا يُعاد — فلا يُدفع ثمنُ رفضٍ مؤكّد', async () => {
    const out = await generateForPost(
      deps(net({ payload: { promptFeedback: { blockReason: 'SAFETY' } } })),
      await seedPost(),
    )
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.retryable).toBe(false)
  })

  it('وجوابٌ نصّيٌّ مكان الصورة يُنقَل كما هو', async () => {
    const out = await generateForPost(
      deps(net({ payload: { candidates: [{ content: { parts: [{ text: 'لا أستطيع رسم هذا' }] } }] } })),
      await seedPost(),
    )
    expect(out.kind).toBe('failed')
    if (out.kind === 'failed') expect(out.reason).toContain('لا أستطيع رسم هذا')
  })
})

describe('لا توليدَ مرّتين', () => {
  it('النقرةُ الثانية لا تنادي ولا تُنفق', async () => {
    const post = await seedPost()
    const b = bucket()
    const first = await generateForPost(deps(net(), b), post)
    expect(first.kind).toBe('generated')

    const second = await generateForPost(deps(net(), b), post)
    expect(second.kind).toBe('already')
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(1)
  })

  it('ونصٌّ عدّله المالك يعطي مفتاحا جديدا', async () => {
    const post = await seedPost()
    expect(await imageKey(post, 'نصّ')).not.toBe(await imageKey(post, 'نصّ آخر'))
  })
})

describe('الحارس قبل النداء', () => {
  it('الإيقافُ يمنع، ولا يُرسَل شيء', async () => {
    await writeSetting(db, 'paused', 'true', 'test')
    const out = await generateForPost(deps(net()), await seedPost())

    expect(out.kind).toBe('blocked')
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(0)
  })

  it('ما نُشر أو جُدول لا تُضاف إليه صورة', async () => {
    // ويُبلَغ الطابورُ بحسابٍ وموعدٍ حقيقيّين: القاعدةُ ترفض غيرَ ذلك
    // (D-037) — وقد ردّت هذا الاختبار حين اختصرتُ
    const account = crypto.randomUUID()
    await db
      .prepare(
        "INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES (?, 'linkedin', 'member', 'e1', 'عمر')",
      )
      .bind(account)
      .run()

    for (const status of ['queued', 'published']) {
      const post = await seedPost({ status: 'approved' })
      await db
        .prepare(
          "UPDATE posts SET status = ?, account_id = ?, scheduled_at = '2026-09-09 09:00:00' WHERE id = ?",
        )
        .bind(status, account, post)
        .run()
      const out = await generateForPost(deps(net()), post)
      expect(out.kind).toBe('failed')
      if (out.kind === 'failed') expect(out.reason).toContain(status)
      expect(calls).toHaveLength(0)
    }
  })
})

describe('الرفض', () => {
  it('يُعلَّم rejected ولا تُحذف بايتاتُه — وما دُفع ثمنُه يُرى', async () => {
    const post = await seedPost()
    const b = bucket()
    const out = await generateForPost(deps(net(), b), post)
    if (out.kind !== 'generated') throw new Error('لم تُولَّد')

    expect(await rejectMedia(db, out.mediaId)).toBe(true)
    const rows = await mediaFor(db, [post])
    expect(rows[0]?.status).toBe('rejected')
    expect(b.objects.has(out.key)).toBe(true)
    expect(await ledger()).toHaveLength(1)
  })

  it('ولا يُرفض مرّتين', async () => {
    const post = await seedPost()
    const out = await generateForPost(deps(net()), post)
    if (out.kind !== 'generated') throw new Error('لم تُولَّد')
    expect(await rejectMedia(db, out.mediaId)).toBe(true)
    expect(await rejectMedia(db, out.mediaId)).toBe(false)
  })
})

describe('الوصف', () => {
  it('يأخذ الجملةَ الأولى لا النصَّ كلَّه — فلا تزدحم الصورة', () => {
    const long = `${'الجملةُ الأولى تحمل الفكرة كلَّها'}. ${'ن'.repeat(2000)}`
    expect(topicOf(long).length).toBeLessThanOrEqual(220)
    expect(topicOf(long)).toContain('الجملةُ الأولى')
  })

  it('ولكلّ منصّةٍ نسبتُها', () => {
    const li = imagePrompt({ topic: 'الوقف', platform: 'linkedin' })
    const x = imagePrompt({ topic: 'الوقف', platform: 'x' })
    expect(li).toContain('1.91:1')
    expect(x).toContain('16:9')
  })
})
