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
import { NOTE_MAX, composeSlide, generateForPost, imageKey, mediaFor, noteOf, rejectMedia, type Bucket, type ImageDeps } from './job'
import { imagePrompt, topicOf } from './prompt'
import { OVERLAY_OFF } from './slide'
import { writeSetting } from '../settings'
import { claimGeneration } from '../media/claim'
import { writeRoute } from '../ai/routes'
import { saveKey, upsertProvider } from '../providers'
import { toBase64 } from '../crypto'

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
    /*
     * **والوصفُ يُقرأ لا يُكتَب وحسب (D-070).**
     *
     * تعليقُ `0010` يقول لماذا: «صورةٌ لا يُعرف وصفُها لا تُعاد ولا
     * تُحسَّن». وكان العمودُ يُملأ في كلّ صفٍّ **ولا يُذكَر في أيّ
     * استعلامٍ يقرأ** — فلا يبلغ اللوحةَ ولا المالك.
     */
    expect(rows[0]?.prompt).not.toBe('')
    // **والمتوقَّعُ يُشتقُّ من نصّ المنشور نفسِه** لا يُكتب هنا: نسخةٌ
    // ثانيةٌ من النصّ في الاختبار تُصدّق ما بطل يومَ يتغيّر الفخّ
    const seeded = db.raw.prepare('SELECT text FROM posts WHERE id = ?').get(post) as { text: string }
    expect(rows[0]?.prompt).toBe(
      imagePrompt({ topic: topicOf(seeded.text), platform: 'linkedin' }),
    )

    expect((await ledger())[0]?.operation).toContain('image:linkedin')
  })

  it('المفتاحُ في ترويسة لا في العنوان — فلا يُسجَّل في وسيط', async () => {
    await generateForPost(deps(net()), await seedPost())
    expect(calls[0]?.url).not.toContain('AIza-test')
    expect(calls[0]?.headers['x-goog-api-key']).toBe('AIza-test')
  })

  /**
   * **والقيدُ بالإنجليزيّة وفي الطرفين** (D-083).
   *
   * كان بالعربيّة وفي الوسط. ونماذجُ الانتشار تُرجّح أوائلَ الوصف
   * وأواخرَه ويُبهَت الوسط، **ومنعٌ بلغةٍ لا يقرؤها المانَع قد يُقرأ
   * طلبا**: «لا حرفَ عربيّ» عربيّةً ترسم خربشةً تشبه العربيّة.
   */
  it('يطلب صورةً بلا حرف — بالإنجليزيّة، وفي أوّل الوصف وآخره', async () => {
    await generateForPost(deps(net()), await seedPost())
    const sent = calls[0]?.body as { contents?: { parts?: { text?: string }[] }[] }
    const prompt = sent.contents?.[0]?.parts?.[0]?.text ?? ''
    expect(prompt.startsWith('ABSOLUTELY NO text')).toBe(true)
    expect(prompt.trimEnd().endsWith('resembles writing.')).toBe(true)
    expect((prompt.match(/ABSOLUTELY NO text/g) ?? []).length).toBe(2)
  })

  /** **ولا عربيّةَ في وصفٍ لا يقرؤها** — إلّا سياقَ الاحتياط مُعلَّما. */
  it('والوصفُ إنجليزيٌّ كلُّه — فالنموذجُ لا يقرأ غيرها', async () => {
    await generateForPost(deps(net()), await seedPost())
    const sent = calls[0]?.body as { contents?: { parts?: { text?: string }[] }[] }
    const prompt = sent.contents?.[0]?.parts?.[0]?.text ?? ''
    // الأسلوبُ والتركيبُ والقياس: لا حرفَ عربيّ فيها
    for (const line of ['# Subject', '# Composition', '# Style', '# Format']) {
      expect(prompt).toContain(line)
    }
    expect(prompt).toContain('for context only')
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

  /**
   * **والقيدُ `UNIQUE` يقع متأخّرا (D-068).**
   *
   * الفحصُ فوقُ يقرأ صفّا لا يوجد قبل انتهاء النداء. فطلبان متزامنان
   * يقرآن «لا» كلاهما **ويدفعان كلاهما**، ثمّ يُردّ أحدُهما عند الكتابة
   * — والقيدُ منع الصفَّ المكرّر **بعد** أن وقع الدفعُ المكرّر.
   */
  it('ونداءٌ جارٍ يمنع الثانيَ قبل أن يُنفِق', async () => {
    const post = await seedPost()
    const row = db.raw.prepare('SELECT text FROM posts WHERE id = ?').get(post) as { text: string }
    const key = await imageKey(post, row.text)
    await claimGeneration(db, key, post, 'image', new Date('2026-09-08T09:00:00.000Z'))

    const out = await generateForPost(
      { ...deps(net()), now: () => new Date('2026-09-08T09:01:00.000Z') },
      post,
    )
    expect(out.kind).toBe('in_progress')
    expect(calls).toHaveLength(0)
    expect(await ledger()).toHaveLength(0)
  })

  /** **وفشلٌ يترك حجزَه يمنع إعادةَ المحاولة عشرَ دقائق.** */
  it('وفشلُ النداء يحرّر حجزَه فتُقبل الإعادة', async () => {
    const post = await seedPost()
    const first = await generateForPost(deps(net({ status: 500 })), post)
    expect(first.kind).toBe('failed')

    const second = await generateForPost(deps(net()), post)
    expect(second.kind).toBe('generated')
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

/**
 * **الاختيارُ يُطاع لا يُقرأ وحسب** (D-079).
 *
 * كان الاستيرادُ مثبَّتا على Gemini: يُقرأ توجيهُ المالك من اللوحة ثمّ
 * يُنادى Gemini على كلّ حال. فمن وجّه الصورَ إلى Cloudflare أُرسل اسمُ
 * نموذجِها إلى عنوان Google — **فردّت ٤٠٥**.
 */
describe('توجيهُ الصور يُطاع (D-079)', () => {
  it('ووجهةُ Cloudflare تُنادى عندها لا عند Google', async () => {
    await upsertProvider(db, {
      name: 'cloudflare', label: 'Cloudflare', kind: 'openai_compat',
      model: '@cf/black-forest-labs/flux-1-schnell',
    }, 'test')
    await writeRoute(db, 'image', 'cloudflare', '@cf/black-forest-labs/flux-1-schnell', 'test')

    const post = await seedPost()
    const seen: string[] = []
    const net = (async (url: unknown) => {
      seen.push(String(url))
      return new Response(JSON.stringify({ success: true, result: { image: 'AAECAw==' } }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch

    const out = await generateForPost(
      {
        db, bucket: bucket(), encKey: '',
        workerSecrets: { CF_AI_ACCOUNT_ID: 'acc-1', CF_AI_TOKEN: 'tok-1' },
        fetchImpl: net,
      },
      post,
    )

    expect(out.kind).toBe('generated')
    expect(seen[0]).toContain('api.cloudflare.com')
    expect(seen[0]).toContain('/ai/run/@cf/black-forest-labs/flux-1-schnell')
    // **ولا يُلمَس عنوانُ Google** — وهو ما كان يقع
    expect(seen.join(' ')).not.toContain('generativelanguage')
  })
})

/**
 * **الشريحة: النصُّ العربيُّ فوق الصورة** (D-085).
 *
 * وهي تحسينٌ لا شرط. **فكلُّ سببِ سقوطٍ يُبقي الصورةَ كما هي** — ومنشورٌ
 * بصورةٍ نظيفةٍ خيرٌ من منشورٍ بلا صورة، وهي قاعدةُ الموجز البصريّ (D-083).
 */
describe('الشريحةُ فوق الصورة — وكلُّ سقوطٍ يُبقي الصورة', () => {
  /** بايتاتُ اللقطة كما يعيدها المتصفّح — تُميَّز عن بايتات المولّد. */
  const SHOT = new Uint8Array([9, 9, 9, 9, 9, 9])
  const ENC = toBase64(crypto.getRandomValues(new Uint8Array(32)))

  /**
   * شبكةٌ بمسارين: مزوّدُ الكتابة يعطي الموجزَ والعنوان، ومزوّدُ الصورة
   * يعطي البايتات، ونهايةُ التصوير تعطي اللقطة.
   */
  function twoLane(options: { shotStatus?: number } = {}): typeof fetch {
    calls = []
    return (async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input)
      calls.push({ url, body: null, headers: {} })

      if (url.includes('browser-rendering/screenshot')) {
        if ((options.shotStatus ?? 200) !== 200) {
          return new Response('{}', { status: options.shotStatus ?? 500 })
        }
        return new Response(SHOT, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
      }
      if (url.includes('api.writer.test')) {
        return new Response(
          JSON.stringify({
            model: 'w-1',
            choices: [{
              message: {
                content: JSON.stringify({
                  subject: 'folded brass sheets',
                  headline: 'أثرٌ يُقاس',
                  kicker: 'Measured Impact',
                }),
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG_B64 } }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch
  }

  async function seedWriter(): Promise<void> {
    await upsertProvider(
      db,
      { name: 'writer', label: 'Writer', kind: 'openai_compat', baseUrl: 'https://api.writer.test/v1' },
      'test',
    )
    await saveKey(db, ENC, 'writer', 'sk-writer-key-long', 'test')
    await writeRoute(db, 'draft', 'writer', 'w-1', 'test')
  }

  function slideDeps(fetchImpl: typeof fetch, b: Bucket, secrets: Record<string, string>): ImageDeps {
    return { db, bucket: b, encKey: ENC, workerSecrets: { GEMINI_API_KEY: 'AIza-test', ...secrets }, fetchImpl }
  }

  const READY = { CF_AI_ACCOUNT_ID: 'acc', CF_BROWSER_TOKEN: 'cfut_browser' }

  it('يركّب النصَّ ويرفع **اللقطةَ** لا الصورةَ الخام', async () => {
    await seedWriter()
    const b = bucket()
    const out = await generateForPost(slideDeps(twoLane(), b, READY), await seedPost())
    expect(out.kind).toBe('generated')
    const stored = [...b.objects.values()][0]!
    expect([...stored]).toEqual([...SHOT])
    expect(calls.some((c) => c.url.includes('browser-rendering/screenshot'))).toBe(true)
  })

  it('و**كلفةُ اللقطة تُسجَّل** — نداءٌ مدفوعٌ لا يُخفى (D-008)', async () => {
    await seedWriter()
    await generateForPost(slideDeps(twoLane(), bucket(), READY), await seedPost())
    const ops = (await ledger()).map((e) => e.operation)
    expect(ops.some((o) => o.startsWith('slide:'))).toBe(true)
    expect(ops.some((o) => o.startsWith('image-brief:'))).toBe(true)
    expect(ops.some((o) => o.startsWith('image:'))).toBe(true)
  })

  it('وسقوطُ التصوير يُبقي الصورةَ الخام — لا منشورَ بلا صورة', async () => {
    await seedWriter()
    const b = bucket()
    const out = await generateForPost(
      slideDeps(twoLane({ shotStatus: 500 }), b, READY),
      await seedPost(),
    )
    expect(out.kind).toBe('generated')
    expect([...b.objects.values()][0]!.length).toBeGreaterThan(0)
    expect([...[...b.objects.values()][0]!]).not.toEqual([...SHOT])
    // ولا كلفةَ للقطةٍ لم تقع
    expect((await ledger()).some((e) => e.operation.startsWith('slide:'))).toBe(false)
  })

  it('و**بلا رمزِ المتصفّح لا نداءَ أصلا** — الغيابُ ليس عطلا', async () => {
    await seedWriter()
    await generateForPost(
      slideDeps(twoLane(), bucket(), { CF_AI_ACCOUNT_ID: 'acc' }),
      await seedPost(),
    )
    expect(calls.some((c) => c.url.includes('browser-rendering'))).toBe(false)
  })

  it('وبلا عنوانٍ في الموجز لا شريحة — ولا نصَّ يُخترَع', async () => {
    // لا مزوّدَ كتابةٍ ⇒ لا موجزَ ⇒ لا عنوان
    await generateForPost(slideDeps(twoLane(), bucket(), READY), await seedPost())
    expect(calls.some((c) => c.url.includes('browser-rendering'))).toBe(false)
  })

  it('وإطفاءُ التركيب من الإعدادات يُحترَم', async () => {
    await seedWriter()
    await writeSetting(db, 'image_overlay', 'false', 'test')
    await generateForPost(slideDeps(twoLane(), bucket(), READY), await seedPost())
    expect(calls.some((c) => c.url.includes('browser-rendering'))).toBe(false)
  })

  /**
   * **وكلُّ سقوطٍ يُقال** (D-088).
   *
   * الأسبابُ خمسةٌ لا تُفرَّق من الشاشة: رمزٌ غائب، وتركيبٌ مُطفأ، وموجزٌ
   * بلا عنوان، وصورةٌ فوق الحدّ، ولقطةٌ سقطت. فالمالكُ يرى صورةً بلا
   * نصّ **ويُصلِح في مكانٍ سليم**.
   */
  it('وسببُ السقوط يُعاد مع المخرَج — لا صمت', async () => {
    await seedWriter()
    const out = await generateForPost(
      slideDeps(twoLane(), bucket(), { CF_AI_ACCOUNT_ID: 'acc' }),
      await seedPost(),
    )
    expect(out.kind).toBe('generated')
    if (out.kind !== 'generated') return
    expect(out.note).toContain('CF_BROWSER_TOKEN')
  })

  it('وحين تُركَّب الشريحةُ فلا سبب — الفراغُ يعني أنّ كلَّ شيءٍ تمّ', async () => {
    await seedWriter()
    const out = await generateForPost(slideDeps(twoLane(), bucket(), READY), await seedPost())
    expect(out.kind).toBe('generated')
    if (out.kind !== 'generated') return
    expect(out.note).toBe('')
  })

  it('وسقوطُ التصوير يُسمّى — لا يُخلَط بالغياب', async () => {
    await seedWriter()
    const out = await generateForPost(
      slideDeps(twoLane({ shotStatus: 500 }), bucket(), READY),
      await seedPost(),
    )
    expect(out.kind).toBe('generated')
    if (out.kind !== 'generated') return
    expect(out.note).toContain('تعذّر تصويرُ الشريحة')
  })

  /**
   * **وما قيل يبقى مع الصورة** (D-162).
   *
   * كان السببُ والعنوانُ يُقالان في الوميض مرّةً ثمّ يُرميان: البطاقةُ بعد
   * التحديث لا تعرف أرُكّب النصُّ أم سقط. فالصفُّ يُسأل هنا لا المخرَج.
   */
  describe('والصفُّ يحفظ ما قيل عن الشريحة (D-162)', () => {
    it('رُكّب: السببُ فراغٌ والعنوانُ هو المرسوم', async () => {
      await seedWriter()
      const post = await seedPost()
      await generateForPost(slideDeps(twoLane(), bucket(), READY), post)
      const [row] = await mediaFor(db, [post])
      expect(row!.note).toBe('')
      expect(row!.headline).toBe('أثرٌ يُقاس')
    })

    it('وسقوطُ التركيب يُحفَظ كما قيل في الوميض — والعنوانُ المقترحُ معه', async () => {
      await seedWriter()
      const post = await seedPost()
      const out = await generateForPost(slideDeps(twoLane(), bucket(), { CF_AI_ACCOUNT_ID: 'acc' }), post)
      if (out.kind !== 'generated') throw new Error(out.kind)
      const [row] = await mediaFor(db, [post])
      expect(row!.note).toBe(out.note)
      expect(row!.note).toContain('CF_BROWSER_TOKEN')
      expect(row!.headline).toBe('أثرٌ يُقاس')
    })

    it('وبلا موجزٍ لا عنوانَ يُخترَع في الصفّ — NULL لا فراغ', async () => {
      const post = await seedPost()
      await generateForPost(slideDeps(twoLane(), bucket(), READY), post)
      const [row] = await mediaFor(db, [post])
      expect(row!.headline).toBeNull()
      expect(row!.note).toContain('بلا عنوانٍ في الموجز')
    })

    it('والإطفاءُ يُحفَظ بلفظه — فتقرؤه البطاقةُ قرارًا لا عطلا', async () => {
      await seedWriter()
      await writeSetting(db, 'image_overlay', 'false', 'test')
      const post = await seedPost()
      await generateForPost(slideDeps(twoLane(), bucket(), READY), post)
      const [row] = await mediaFor(db, [post])
      expect(row!.note!.endsWith(OVERLAY_OFF)).toBe(true)
    })

    it('وسببٌ يطول بلا حدٍّ يُقصّ عند الكتابة — والوميضُ يقول المقصوصَ نفسَه', async () => {
      await seedWriter()
      const lane = twoLane()
      const endless: typeof fetch = (async (input: unknown, init?: RequestInit) => {
        if (String(input instanceof Request ? input.url : input).includes('browser-rendering')) {
          throw new Error('ض'.repeat(2000))
        }
        return lane(input as RequestInfo, init)
      }) as typeof fetch
      const post = await seedPost()
      const out = await generateForPost(slideDeps(endless, bucket(), READY), post)
      if (out.kind !== 'generated') throw new Error(out.kind)
      const [row] = await mediaFor(db, [post])
      expect(row!.note!.length).toBe(300)
      expect(out.note).toBe(row!.note)
    })

    /**
     * **ويُقصّ سقوطُ الموجز لا ما بعده.**
     *
     * خطأُ الشبكة أوّلُ السبب وقد يطول بلا حدّ — ردُّ Anthropic على رصيدٍ لا
     * يكفي نحو 270 حرفًا بعد `anthropic: ` — **وما قرّره المالكُ أو ما بيده
     * في آخره**. كان القصُّ عند 300 من الذيل: فيُؤكَل «مُطفأٌ من الإعدادات»
     * فتقرأ البطاقةُ القرارَ عطلًا أصفر، أو يُؤكَل «اضبط CF_BROWSER_TOKEN»
     * كلُّه فلا يرى المالكُ الشيءَ الوحيدَ الذي يُصلحه.
     */
    function briefFails(length: number): typeof fetch {
      const lane = twoLane()
      return (async (input: unknown, init?: RequestInit) => {
        if (String(input instanceof Request ? input.url : input).includes('api.writer.test')) {
          throw new Error('e'.repeat(length))
        }
        return lane(input as RequestInfo, init)
      }) as typeof fetch
    }

    it('وموجزٌ سقط بخطأٍ طويل والتركيبُ مُطفأ: الإطفاءُ في الذيل كاملًا', async () => {
      await seedWriter()
      await writeSetting(db, 'image_overlay', 'false', 'test')
      const post = await seedPost()
      const out = await generateForPost(slideDeps(briefFails(400), bucket(), READY), post)
      if (out.kind !== 'generated') throw new Error(out.kind)
      const [row] = await mediaFor(db, [post])
      expect(row!.note!.length).toBeLessThanOrEqual(300)
      // وسقوطُ الموجز يبقى أوّلا (D-157) — مقصوصًا، لا محذوفًا
      expect(row!.note!.startsWith('تعذّر الموجزُ البصريّ')).toBe(true)
      expect(row!.note!.endsWith(`؛ ${OVERLAY_OFF}`)).toBe(true)
      expect(out.note).toBe(row!.note)
    })

    it('وموجزٌ سقط بخطأٍ طويل ولا مفتاح: «اضبط CF_BROWSER_TOKEN» يبقى بتمامه', async () => {
      await seedWriter()
      const post = await seedPost()
      const secrets = { CF_AI_ACCOUNT_ID: 'acc' }
      const out = await generateForPost(slideDeps(briefFails(400), bucket(), secrets), post)
      if (out.kind !== 'generated') throw new Error(out.kind)
      const [row] = await mediaFor(db, [post])
      // والسببُ يُسأل عنه `composeSlide` نفسُه — لا يُنسَخ حرفًا فيفترق
      const { reason } = await composeSlide(
        { db, bucket: bucket(), encKey: ENC, workerSecrets: secrets },
        { image: { bytes: new Uint8Array([1]), mime: 'image/png', model: 'm' }, platform: 'linkedin', headline: '', kicker: '' },
      )
      expect(reason).toContain('CF_BROWSER_TOKEN')
      expect(row!.note!.length).toBeLessThanOrEqual(300)
      expect(row!.note!.endsWith(`؛ ${reason}`)).toBe(true)
      expect(out.note).toBe(row!.note)
    })
  })
})

/**
 * **الرفضُ يُطلِق المفتاح** (D-087).
 *
 * شكا المالك: «لم تُولَّد أيُّ صورة». وكانت اللوحةُ تقول «وُلّدت صورةٌ
 * لهذا النصّ — لم يُنفق شيء» **ولا صورةَ تُعرض** — لأنّ صفَّ الصورة
 * المرفوضة يحتفظ بمفتاح عدم التكرار، فتخرج الخطوةُ ٢ قبل أيّ نداء.
 *
 * **فمن رفض صورةً لم يستطع توليدَ بديلٍ لها أبدا.**
 */
describe('المرفوضةُ لا تسدّ الطريق', () => {
  it('يولّد بديلا بعد الرفض — ولا يقول «وُلّدت»', async () => {
    const post = await seedPost()
    const first = await generateForPost(deps(net()), post)
    expect(first.kind).toBe('generated')

    // قبل الرفض: المفتاحُ محجوز، فلا نداءَ ثانٍ
    const blocked = await generateForPost(deps(net()), post)
    expect(blocked.kind).toBe('already')

    expect(await rejectMedia(db, (first as { mediaId: string }).mediaId)).toBe(true)

    // بعد الرفض: يُولَّد بديلٌ فعلا
    const again = await generateForPost(deps(net()), post)
    expect(again.kind).toBe('generated')
    expect((again as { mediaId: string }).mediaId).not.toBe((first as { mediaId: string }).mediaId)
  })

  it('و**الصفُّ المرفوضُ يبقى بكلفته** — الدفترُ لا يُمحى', async () => {
    const post = await seedPost()
    const first = await generateForPost(deps(net()), post)
    await rejectMedia(db, (first as { mediaId: string }).mediaId)
    await generateForPost(deps(net()), post)

    const { results } = await db
      .prepare('SELECT id, status FROM media WHERE post_id = ?')
      .bind(post)
      .all<{ id: string; status: string }>()
    expect(results).toHaveLength(2)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
  })

  it('ورفضٌ ثانٍ لصفٍّ مرفوضٍ يُردّ — ولا يُوسَم مفتاحُه مرّتين', async () => {
    const post = await seedPost()
    const first = await generateForPost(deps(net()), post)
    const id = (first as { mediaId: string }).mediaId
    expect(await rejectMedia(db, id)).toBe(true)
    expect(await rejectMedia(db, id)).toBe(false)

    const row = await db
      .prepare('SELECT idempotency_key FROM media WHERE id = ?')
      .bind(id)
      .first<{ idempotency_key: string }>()
    expect((row!.idempotency_key.match(/:rejected:/g) ?? []).length).toBe(1)
  })
})

/**
 * **والصفُّ الذي رُفض قبل D-087 يحمل مفتاحَه نظيفا** (D-088).
 *
 * D-087 غيّرت الكاتب: كلُّ رفضٍ **جديد** يوسم مفتاحَه. **ولم تُصلِح ما
 * وقع قبلها.** فصفٌّ رُفض في الأسبوع الماضي بقي مفتاحُه كما هو، والخطوةُ
 * ٢ تسأل عن المفتاح ولا تسأل عن الحال — فتجده، فتقول «وُلّدت صورةٌ لهذا
 * النصّ» **بلونٍ أخضر**، ولا صورة.
 *
 * وهو ما شكا منه المالك في X بالحرف: «يظهر أنّها تمّت، ولم تتمّ».
 *
 * **والحارسُ يُبنى على الحال لا على الاسم**: الاسمُ يُصلَح بترحيل،
 * والحالُ صحيحةٌ في كلّ صفٍّ منذ ‏0010.
 */
describe('صفٌّ رُفض قبل الوسم — ولا يكذب أخضر (D-088)', () => {
  it('لا يقول «وُلّدت» على صفٍّ مرفوضٍ مفتاحُه نظيف', async () => {
    const post = await seedPost({ platform: 'x' })
    const first = await generateForPost(deps(net()), post)
    expect(first.kind).toBe('generated')
    const id = (first as { mediaId: string }).mediaId

    // **رفضٌ بالكاتب القديم**: الحالُ تتغيّر والمفتاحُ يبقى — كما في كلّ
    // صفٍّ رُفض قبل D-087
    await db.prepare("UPDATE media SET status = 'rejected' WHERE id = ?").bind(id).run()
    const key = await imageKey(post, 'أكثرُ ما يُهدر في برامج الوقف ليس المال، بل الوقتُ بين القرار وأثره. وهذا ما يقيسه التقرير.')
    await db.prepare('DELETE FROM media_claims WHERE idempotency_key = ?').bind(key).run()

    const again = await generateForPost(deps(net()), post)
    expect(again.kind).toBe('generated')
    expect((again as { mediaId: string }).mediaId).not.toBe(id)
  })

  it('ويبقى الصفُّ القديمُ بكلفته — الدفترُ لا يُمحى', async () => {
    const post = await seedPost({ platform: 'x' })
    const first = await generateForPost(deps(net()), post)
    const id = (first as { mediaId: string }).mediaId
    await db.prepare("UPDATE media SET status = 'rejected' WHERE id = ?").bind(id).run()
    const key = await imageKey(post, 'أكثرُ ما يُهدر في برامج الوقف ليس المال، بل الوقتُ بين القرار وأثره. وهذا ما يقيسه التقرير.')
    await db.prepare('DELETE FROM media_claims WHERE idempotency_key = ?').bind(key).run()
    await generateForPost(deps(net()), post)

    const { results } = await db
      .prepare('SELECT id, status FROM media WHERE post_id = ?')
      .bind(post)
      .all<{ id: string; status: string }>()
    expect(results).toHaveLength(2)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
  })

  /**
   * **والإدراجُ المُعادُ هو الذي ينسى العمودَ الجديد** (D-162).
   *
   * مسارٌ نادرٌ لا يمرّ فيه أحدٌ حتّى يمرّ، وكان نسخةً حرفيّةً من الأوّل.
   * فإن افترقا كُتب صفٌّ بلا سببه، وقالت البطاقةُ عنه ما لم يُسجَّل.
   */
  it('والصفُّ المُعادُ بعد تحرير الاسم يحمل سببَه', async () => {
    const post = await seedPost({ platform: 'x' })
    const first = await generateForPost(deps(net()), post)
    const id = (first as { mediaId: string }).mediaId
    await db.prepare("UPDATE media SET status = 'rejected' WHERE id = ?").bind(id).run()
    const key = await imageKey(post, 'أكثرُ ما يُهدر في برامج الوقف ليس المال، بل الوقتُ بين القرار وأثره. وهذا ما يقيسه التقرير.')
    await db.prepare('DELETE FROM media_claims WHERE idempotency_key = ?').bind(key).run()

    const again = await generateForPost(deps(net()), post)
    if (again.kind !== 'generated') throw new Error(again.kind)
    const row = (await mediaFor(db, [post])).find((m) => m.id === again.mediaId)
    expect(row!.note).not.toBeNull()
    expect(row!.note).toBe(again.note)
  })
})

/**
 * **و`null` ليست فراغا** (D-162): صفٌّ أقدمُ من ‏0028 لم يُسجَّل عنه شيء،
 * و`String(null)` كانت ستطبع «بلا نصٍّ فوقها: null» على كلّ صورةٍ قديمة.
 */
describe('mediaFor يفرّق NULL عن الفراغ (D-162)', () => {
  it('صفٌّ بالأعمدة التسعة القديمة: note و headline كلاهما null', async () => {
    const post = await seedPost()
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, cost_usd, idempotency_key)
         VALUES ('old', ?, 'img/old.png', 'image/png', 10, 'p', 'm', 0, 'k-old')`,
      )
      .bind(post)
      .run()
    const [row] = await mediaFor(db, [post])
    expect(row!.note).toBeNull()
    expect(row!.headline).toBeNull()
  })
})

/**
 * D-157 · السببُ الذي يُصلحه المالك يُقال أوّلا.
 */
describe('ترتيبُ أسباب سقوط الشريحة (D-157)', () => {
  const ENC = toBase64(crypto.getRandomValues(new Uint8Array(32)))
  const image = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png', model: 'm' }

  it('بلا مفتاحٍ وبلا عنوان: يُقال المفتاحُ لا العنوان', async () => {
    const out = await composeSlide(
      { db, bucket: bucket(), encKey: ENC, workerSecrets: {} },
      { image, platform: 'linkedin', headline: '', kicker: '' },
    )
    expect(out.slide).toBeNull()
    expect(out.reason).toContain('CF_BROWSER_TOKEN')
    expect(out.reason).not.toContain('بلا عنوان')
  })

  it('والإعدادُ المطفأ يسبق المفتاح', async () => {
    await writeSetting(db, 'image_overlay', '0', 'test')
    const out = await composeSlide(
      { db, bucket: bucket(), encKey: ENC, workerSecrets: {} },
      { image, platform: 'linkedin', headline: '', kicker: '' },
    )
    expect(out.reason).toContain('مُطفأ')
  })

  it('وبالمفتاح وبلا عنوان: العنوانُ هو السبب', async () => {
    const out = await composeSlide(
      { db, bucket: bucket(), encKey: ENC, workerSecrets: { CF_AI_ACCOUNT_ID: 'a', CF_BROWSER_TOKEN: 't' } },
      { image, platform: 'linkedin', headline: '', kicker: '' },
    )
    expect(out.reason).toContain('بلا عنوان')
  })

  it('noteOf يقدّم سقوطَ الموجز على ما ترتّب عليه', () => {
    expect(noteOf({ brief: null, detail: 'لا مزوّدَ للكتابة' }, { reason: 'بلا عنوانٍ في الموجز' }))
      .toBe('لا مزوّدَ للكتابة؛ بلا عنوانٍ في الموجز')
    expect(noteOf({ brief: { headline: 'x' }, detail: '' }, { reason: 'الصورةُ فوق حدِّ الضمّ' }))
      .toBe('الصورةُ فوق حدِّ الضمّ')
    expect(noteOf({ brief: null, detail: 'سقط' }, { reason: '' })).toBe('')
  })

  /**
   * **والحدُّ يُقسَم ولا يُقصّ من الذيل** (D-162): السببُ الثاني كاملٌ دائمًا،
   * والأوّلُ يأخذ ما بقي — وقصُّه معلَّمٌ بـ«…» لا ذيلٌ مبتورٌ يُقرأ كاملا.
   */
  it('noteOf تحفظ السببَ الثاني كاملًا وتقصّ الأوّل إلى ما بقي من ‏300', () => {
    const reason = 'r'.repeat(10)
    // ‏288 + «؛ » + ‏10 = ‏300 تمامًا: يتّسع بلا قصّ
    const fits = noteOf({ brief: null, detail: 'd'.repeat(288) }, { reason })
    expect(fits).toBe(`${'d'.repeat(288)}؛ ${reason}`)
    // وحرفٌ واحدٌ فوقه: يُقصّ الأوّلُ ويُعلَّم، والثاني كما هو
    const over = noteOf({ brief: null, detail: 'd'.repeat(289) }, { reason })
    expect(over).toBe(`${'d'.repeat(287)}…؛ ${reason}`)
    expect(over).toHaveLength(NOTE_MAX)

    const off = noteOf({ brief: null, detail: 'e'.repeat(5000) }, { reason: OVERLAY_OFF })
    expect(off).toHaveLength(NOTE_MAX)
    expect(off.endsWith(`…؛ ${OVERLAY_OFF}`)).toBe(true)
  })

  it('وسببٌ وحدَه فوق الحدّ يُقصّ معلَّمًا — ولا يتّسع لسقوطٍ قبله', () => {
    const lone = noteOf({ brief: { headline: 'x' }, detail: '' }, { reason: 'ض'.repeat(2000) })
    expect(lone).toBe(`${'ض'.repeat(NOTE_MAX - 1)}…`)
    // لا مكانَ للأوّل: «؛» في الرأس بلا ما قبلها أسوأُ من إسقاطه
    const full = noteOf({ brief: null, detail: 'سقط' }, { reason: 'ض'.repeat(2000) })
    expect(full).toBe(lone)
  })
})
