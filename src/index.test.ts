/**
 * يختبر `scheduled` — المسار الذي يعمل بلا أحد ينظر.
 *
 * وأهمّ ما فيه أنّ الحدّ يُقصّ **قبل** الإرسال: حدٌّ يُطبَّق بعد الإنفاق
 * ليس حدّا.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduledController } from '@cloudflare/workers-types'
import worker from './index'
import { writeSetting } from './lib/settings'
import { fakeDb, type FakeDb } from './test/fakes'
import { toBase64 } from './lib/crypto'
import { saveTokens } from './lib/tokens'
import { scopeSet } from './lib/oauth/scopes'

let db: FakeDb
let sent: { body: { sourceId: string } }[]
let SA: string

/** مفتاح RSA حقيقيّ — فيُقطَع مسار توقيع JWT فعلا لا محاكاته. */
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)))
  SA = JSON.stringify({
    client_email: 'sada@test.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)?.join('\n') ?? b64}\n-----END PRIVATE KEY-----\n`,
  })
})

/** يزيّف Drive: مجلدٌ فيه `count` مستندا لم يُرَ من قبل. */
function drive(count: number): typeof fetch {
  return (async (input: unknown): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'g', expires_in: 3600 })
    }
    if (url.includes('/drive/v3/files')) {
      return Response.json({
        files: Array.from({ length: count }, (_, i) => ({
          id: `drive-${i}`,
          name: `مستند ${i}`,
          mimeType: 'application/vnd.google-apps.document',
          md5Checksum: `hash-${i}`,
        })),
      })
    }
    throw new Error(`نداء غير متوقّع: ${url}`)
  }) as unknown as typeof fetch
}

function env(count: number): Record<string, unknown> {
  return {
    SADA_ENV: 'staging',
    DB: db,
    DRIVE_FOLDER_ID: 'folder-1',
    GOOGLE_SA_JSON: SA,
    GENERATE_QUEUE: {
      async sendBatch(messages: { body: { sourceId: string } }[]) {
        sent.push(...messages)
      },
    },
    // طابورُ النشر: يُلتقَط منه ما أُرسل، فيُقطَع أنّ الموزّع أرسل فعلا
    PUBLISH_QUEUE: {
      async sendBatch(messages: { body: { postId: string } }[]) {
        for (const m of messages) published.push(m.body.postId)
      },
    },
  }
}

let published: string[] = []

/**
 * `scheduled` يستعمل `fetch` العامّ، فيُبدَّل حول النداء وحده.
 *
 * والجدولُ يُمرَّر كما يمرّره Cloudflare: الموزّع يفرّق بالجدول، ونداءٌ
 * بمتحكّمٍ فارغ يختبر فرعا لا يقع في الإنتاج.
 */
async function runCron(count: number, cron = '0 3 * * *'): Promise<void> {
  const real = globalThis.fetch
  globalThis.fetch = drive(count)
  try {
    await worker.scheduled({ cron } as ScheduledController, env(count) as never)
  } finally {
    globalThis.fetch = real
  }
}

beforeEach(() => {
  db = fakeDb()
  sent = []
  published = []
})

describe('المسح اليوميّ', () => {
  it('يمسح ولا يُدرج شيئا والمفتاح مطفأ — وهو الافتراض', async () => {
    await runCron(3)
    const rows = db.raw.prepare('SELECT count(*) AS n FROM sources').get() as { n: number }
    expect(rows.n).toBe(3)
    expect(sent).toHaveLength(0)
  })

  it('الإيقاف يمنع المسح نفسه — لا مصادر تُكتب', async () => {
    await writeSetting(db, 'paused', 'true', 'test')
    await runCron(3)
    const rows = db.raw.prepare('SELECT count(*) AS n FROM sources').get() as { n: number }
    expect(rows.n).toBe(0)
    expect(sent).toHaveLength(0)
  })
})

describe('الإدراج الآليّ — والحدّ يُقصّ قبل الإرسال', () => {
  beforeEach(async () => {
    await writeSetting(db, 'auto_enqueue', 'true', 'test')
  })

  it('يُدرج ما تغيّر حين يتّسع السقف', async () => {
    await writeSetting(db, 'daily_analysis_cap', '10', 'test')
    await runCron(3)
    expect(sent).toHaveLength(3)
    expect(sent[0]!.body.sourceId).toBeTypeOf('string')
  })

  it('**يقصّ على المتبقّي لا على ما وجد** — ولا يُرسل الفائض إلى الطابور', async () => {
    await writeSetting(db, 'daily_analysis_cap', '2', 'test')
    await runCron(7)
    // سبعةٌ تنتظر، والسقف اثنان: يُرسل اثنان لا سبعة
    expect(sent).toHaveLength(2)
  })

  it('يحسب ما استُهلك اليوم — فلا يبدأ من الصفر في كلّ مسح', async () => {
    await writeSetting(db, 'daily_analysis_cap', '5', 'test')
    db.raw
      .prepare(
        `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total)
         VALUES (?, 'anthropic', 'analyze:claude-opus-5', 1, 0.1, 0.1)`,
      )
      .run(crypto.randomUUID())
    db.raw
      .prepare(
        `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total)
         VALUES (?, 'anthropic', 'analyze:claude-opus-5', 1, 0.1, 0.1)`,
      )
      .run(crypto.randomUUID())
    await runCron(9)
    // خمسة سقفا، واستُهلك اثنان: يبقى ثلاثة
    expect(sent).toHaveLength(3)
  })

  it('سقفٌ مستهلَك لا يُرسل شيئا — ولا رسالةً واحدة', async () => {
    await writeSetting(db, 'daily_analysis_cap', '1', 'test')
    db.raw
      .prepare(
        `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total)
         VALUES (?, 'anthropic', 'analyze:claude-opus-5', 1, 0.1, 0.1)`,
      )
      .run(crypto.randomUUID())
    await runCron(5)
    expect(sent).toHaveLength(0)
  })

  it('المسح الثاني لا يعيد إدراج ما لم يتغيّر', async () => {
    await writeSetting(db, 'daily_analysis_cap', '50', 'test')
    await runCron(3)
    expect(sent).toHaveLength(3)
    sent = []
    await runCron(3)
    expect(sent).toHaveLength(0)
  })

  it('الإيقاف يغلب المفتاح — قرارُ المالك لا يُنقَض بإعداد', async () => {
    await writeSetting(db, 'paused', 'true', 'test')
    await runCron(3)
    expect(sent).toHaveLength(0)
  })
})

/**
 * موزّعُ الدورات (D-037).
 *
 * ما يُختبَر هنا ليس أنّ الإرسال يعمل — ذاك مقطوعٌ في `schedule/job.test.ts`
 * — بل **أنّه لا يتوقّف حين يتبدّل جدولٌ في `wrangler.toml`**. وهو أخطر
 * ما في الموزّع: نشرٌ يسقط بلا صوت، ووعدٌ للمالك بموعدٍ لا يجيء.
 */
describe('موزّعُ الدورات', () => {
  async function seedDue(): Promise<string> {
    const account = crypto.randomUUID()
    await db
      .prepare(
        "INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES (?, 'linkedin', 'member', 'x1', 'عمر')",
      )
      .bind(account)
      .run()
    const post = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO posts (id, platform, account_id, type, text, status, scheduled_at,
                            idempotency_key, approved_by, approved_at)
         VALUES (?, 'linkedin', ?, 'text', 'نصّ المنشور', 'queued', '2020-01-01 00:00:00', ?, 'omar', '2020-01-01 00:00:00')`,
      )
      .bind(post, account, `k-${post}`)
      .run()
    return post
  }

  it('يرسل المستحقّ على جدول المسح — فالدورتان تلتقيان ولا تتعطّلان', async () => {
    const post = await seedDue()
    await runCron(0, '0 3 * * *')
    expect(published).toEqual([post])
  })

  it('يرسله على دورة الربع أيضا', async () => {
    const post = await seedDue()
    await runCron(0, '*/15 * * * *')
    expect(published).toEqual([post])
  })

  it('**وعلى جدولٍ لا يعرفه** — تغييرٌ في wrangler.toml لا يوقف النشر صامتا', async () => {
    const post = await seedDue()
    await runCron(0, '*/7 * * * *')
    expect(published).toEqual([post])
  })

  it('ولا يرسله مرّتين حين تلتقي الدورتان في الثالثة فجرا', async () => {
    await seedDue()
    await runCron(0, '0 3 * * *')
    await runCron(0, '*/15 * * * *')
    expect(published).toHaveLength(1)
  })
})

/**
 * توصيلُ طابور النشر — **وما لا يُمرَّر لا يُنادى** (D-123).
 *
 * السائقُ يُختبَر بـ`deps` تُبنى في الاختبار، **فيمرّ وهو غيرُ موصولٍ في
 * الإنتاج**: بُني سائقُ Instagram وله عشرةُ اختباراتٍ خضراء، **و`index.ts`
 * لا يمرّر `baseUrl`** — فكلُّ نشرٍ عليها يُردّ `instagram_needs_base_url`.
 *
 * **فيُنادى المعالجُ الحقيقيُّ من المُصدَّر الافتراضيّ**، ويُفحَص أنّ
 * النداءَ بلغ نهايةَ Meta **وفي جسمه رابطُنا الموقَّع** — لا أنّه «لم
 * يسقط».
 */
describe('طابورُ النشر يمرّر ما يلزم (D-123)', () => {
  const ENC = toBase64(crypto.getRandomValues(new Uint8Array(32)))

  async function seedInstagram(): Promise<string> {
    const account = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name)
         VALUES (?, 'instagram', 'member', '17841', '@basserh')`,
      )
      .bind(account)
      .run()
    await saveTokens(db, ENC, account, {
      accessToken: 'tok',
      refreshToken: null,
      expiresAt: '2030-01-01T00:00:00Z',
      refreshExpiresAt: null,
      scopes: scopeSet('instagram').join(' '),
    })
    const post = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO posts (id, platform, account_id, type, text, status, scheduled_at,
                            idempotency_key, approved_by, approved_at)
         VALUES (?, 'instagram', ?, 'image', 'نصّ', 'queued', '2020-01-01 00:00:00',
                 ?, 'omar', '2020-01-01 00:00:00')`,
      )
      .bind(post, account, `k-${post}`)
      .run()
    await db
      .prepare(
        `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
         VALUES (?, ?, 'm/a.png', 'image/png', 9, 'وصف', 'nano', ?)`,
      )
      .bind(crypto.randomUUID(), post, `media:${post}`)
      .run()
    return post
  }

  it('يمرّر baseUrl فيبلغ النداءُ Meta برابطنا', async () => {
    const post = await seedInstagram()
    const calls: { url: string; body: string }[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      calls.push({ url, body: String(init?.body ?? '') })
      return url.includes('media_publish')
        ? Response.json({ id: 'ig-9' })
        : Response.json({ id: 'container-9' })
    }) as typeof fetch

    try {
      await worker.queue(
        {
          queue: 'sada-publish-staging',
          messages: [{ body: { postId: post }, ack() {}, retry() {} }],
        } as never,
        {
          ...env(0),
          TOKEN_ENC_KEY: ENC,
          PUBLIC_BASE_URL: 'https://sada2.basserh.com',
          MEDIA: {
            async get() { return { async arrayBuffer() { return new ArrayBuffer(9) } } },
          },
        } as never,
      )
    } finally {
      globalThis.fetch = realFetch
    }

    // **والنداءُ بلغ نهايةَ الحاوية** — لا رُدَّ قبل أن يُنادى شيء
    const container = calls.find((c) => c.url.includes('/media'))
    expect(container, JSON.stringify(calls.map((c) => c.url))).toBeDefined()
    // **وفي جسمه رابطُنا الموقَّع**: هو الذي كان يسقط بلا baseUrl
    expect(decodeURIComponent(container?.body ?? '')).toContain('https://sada2.basserh.com/m/')
    // ونُشر فعلا
    const row = db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(post) as { status: string }
    expect(row.status).toBe('published')
  })
})
