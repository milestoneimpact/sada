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
async function runCron(count: number, cron = '3 3 * * *'): Promise<void> {
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

  it('سقف مستهلَك لا يُرسل شيئا — ولا رسالةً واحدة', async () => {
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

  it('الإيقاف يغلب المفتاح — قرار المالك لا يُنقَض بإعداد', async () => {
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
describe('موزّع الدورات', () => {
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
    await runCron(0, '3 3 * * *')
    expect(published).toEqual([post])
  })

  it('يرسله على دورة الربع أيضا', async () => {
    const post = await seedDue()
    await runCron(0, '*/15 * * * *')
    expect(published).toEqual([post])
  })

  it('**وعلى جدول لا يعرفه** — تغيير في wrangler.toml لا يوقف النشر صامتا', async () => {
    const post = await seedDue()
    await runCron(0, '*/7 * * * *')
    expect(published).toEqual([post])
  })

  it('ولا يرسله مرّتين حين تلتقي الدورتان في الثالثة فجرا', async () => {
    await seedDue()
    await runCron(0, '3 3 * * *')
    await runCron(0, '*/15 * * * *')
    expect(published).toHaveLength(1)
  })
})

describe('دورةُ تدوير TOKEN_ENC_KEY في المجدول (D-318)', () => {
  it('لا تعمل بلا المفتاح السابق، ومعه تعيد تشفيرَ ما عليه بالجديد', async () => {
    const { keyId, registerKeyring, toBase64 } = await import('./lib/crypto')
    const { resolveKey, saveKey } = await import('./lib/providers')
    const OLD = toBase64(crypto.getRandomValues(new Uint8Array(32)))
    const NEW = toBase64(crypto.getRandomValues(new Uint8Array(32)))
    registerKeyring({ TOKEN_ENC_KEY: OLD })
    await saveKey(db, OLD, 'anthropic', 'sk-ant-cron-0001', 'panel')
    const stored = (): string => (db.raw.prepare("SELECT key_enc FROM providers WHERE name = 'anthropic'").get() as { key_enc: string }).key_enc
    const before = stored()
    const tick = (extra: Record<string, unknown>): Promise<void> =>
      worker.scheduled({ cron: '0 0 1 1 *' } as ScheduledController, { ...env(0), ...extra } as never)

    await tick({ TOKEN_ENC_KEY: NEW })
    expect(stored()).toBe(before)

    await tick({ TOKEN_ENC_KEY: NEW, TOKEN_ENC_KEY_PREV: OLD })
    expect(stored().startsWith(`v2:${await keyId(NEW)}:`)).toBe(true)
    registerKeyring({ TOKEN_ENC_KEY: NEW })
    expect((await resolveKey(db, NEW, 'anthropic', undefined)).key).toBe('sk-ant-cron-0001')
  })
})

/**
 * ‏**تحقّق D-320 على main: نبضُ التجديد يسقط حين لا يجدّد.** كان سؤالُ المستحقّ يُبلَع عطلُه، وما استحقّ وسقط كلُّه عابرًا
 * ‏يُعدّ ثمّ يُنسى، فتنبض الدورةُ `ok` في الحالين: `/pulse` ‏200، وتنبيهُ «يسقط منذ…» للتجديد لا يقع أبدًا، والرموزُ تموت.
 */
describe('نبضُ التجديد (تحقّق D-320 على main)', () => {
  const renewBeat = () => db.raw.prepare("SELECT outcome FROM heartbeats WHERE job = 'renew'").get() as { outcome: string } | undefined

  it('سؤالُ المستحقّ يسقط: النبضُ failed', async () => {
    const { toBase64 } = await import('./lib/crypto')
    const broken = {
      ...db,
      prepare(query: string) {
        if (/FROM tokens t JOIN accounts a/.test(query)) throw new Error('D1_ERROR: no such column: t.renew_failures')
        return db.prepare(query)
      },
    }
    await worker.scheduled(
      { cron: '*/15 * * * *' } as ScheduledController,
      { ...env(0), DB: broken, TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))) } as never,
    )
    expect(renewBeat()?.outcome).toBe('failed')
  })

  it('وما استحقّ وسقط كلُّه عابرًا (سرُّ التطبيق غير مضبوط): النبضُ failed، وما لا مستحقَّ فيه ok', async () => {
    const { toBase64 } = await import('./lib/crypto')
    const { saveTokens } = await import('./lib/tokens')
    const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
    const tick = () => worker.scheduled({ cron: '*/15 * * * *' } as ScheduledController, { ...env(0), TOKEN_ENC_KEY: KEY } as never)
    await tick()
    expect(renewBeat()?.outcome).toBe('ok')
    db.raw.exec("INSERT INTO accounts (id, platform, kind, external_id, display_name) VALUES ('a1', 'linkedin', 'member', 'e1', 'عمر')")
    await saveTokens(db, KEY, 'a1', {
      accessToken: 'access', refreshToken: 'refresh', expiresAt: new Date(Date.now() + 600_000).toISOString(),
      refreshExpiresAt: null, scopes: 'openid profile w_member_social',
    })
    await tick()
    expect(renewBeat()?.outcome).toBe('failed')
  })
})

/**
 * ‏**النسخةُ الاحتياطيّة في الدورة اليوميّة** (D-321): تُؤخذ حين يمضي أسبوعٌ على آخر نسخة، إلى الدلو الخاصّ وحدَه؛ وبلا دلوٍ خاصٍّ
 * ‏نبضٌ `skipped` بسببه ولا شيءَ يُكتب في `MEDIA`.
 */
describe('النسخة الاحتياطيّة (D-321)', () => {
  const backupBeat = () => db.raw.prepare("SELECT outcome, detail FROM heartbeats WHERE job = 'backup'").get() as { outcome: string; detail: string } | undefined
  function bucket() {
    const objects = new Map<string, Uint8Array>()
    return {
      objects,
      async put(key: string, value: Uint8Array) { objects.set(key, value) },
      async list() { return { objects: [...objects.keys()].map((key) => ({ key })), truncated: false } },
      async delete(keys: string | string[]) { for (const k of [keys].flat()) objects.delete(k) },
      async get() { throw new Error('MEDIA لا يُقرأ ولا يُكتب في النسخة') },
    }
  }

  it('بلا دلوٍ خاصّ: نبضٌ skipped بسببه وبابِه، ولا يُكتب شيءٌ في دلو الوسائط', async () => {
    const { toBase64 } = await import('./lib/crypto')
    const media = bucket()
    const real = globalThis.fetch
    globalThis.fetch = drive(0)
    try {
      await worker.scheduled({ cron: '3 3 * * *' } as ScheduledController, { ...env(0), MEDIA: media, TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))) } as never)
    } finally {
      globalThis.fetch = real
    }
    expect(backupBeat()).toEqual({ outcome: 'skipped', detail: 'لا دلو خاصّ مربوط بعد — بابُه في «ما عليك»' })
    expect(media.objects.size).toBe(0)
  })

  it('بدلوٍ خاصّ: نسخةٌ واحدةٌ في الأسبوع، والدورةُ التالية في اليوم نفسِه لا تأخذ ثانية', async () => {
    const { toBase64 } = await import('./lib/crypto')
    const BACKUP = bucket()
    const extra = { BACKUP, TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))) }
    const real = globalThis.fetch
    globalThis.fetch = drive(0)
    try {
      await worker.scheduled({ cron: '3 3 * * *' } as ScheduledController, { ...env(0), ...extra } as never)
      expect(backupBeat()?.outcome).toBe('ok')
      expect([...BACKUP.objects.keys()]).toHaveLength(1)
      await worker.scheduled({ cron: '3 3 * * *' } as ScheduledController, { ...env(0), ...extra } as never)
      // ‏ودورةُ الربع لا تأخذ نسخةً أصلًا
      await worker.scheduled({ cron: '*/15 * * * *' } as ScheduledController, { ...env(0), ...extra } as never)
    } finally {
      globalThis.fetch = real
    }
    expect([...BACKUP.objects.keys()]).toHaveLength(1)
    expect((db.raw.prepare("SELECT count(*) AS n FROM backups WHERE status = 'ok'").get() as { n: number }).n).toBe(1)
  })
})

/**
 * ‏**الكنسُ اليوميّ على جدول المسح وحدَه** (D-322) — لا جدولٌ خامس في `wrangler.toml`، ولا كنسٌ كلَّ ربع ساعة.
 */
describe('الكنسُ اليوميّ (D-322)', () => {
  function seedOld(): void {
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, at, ip) VALUES
      ('org_owner', 'panel', 'settings.write', datetime('now', '-400 days'), '203.0.113.9'),
      ('org_owner', 'panel', 'session.open', datetime('now', '-40 days'), '203.0.113.9')`)
  }

  it('يدور مع المسح: ما فات سنةً يُمحى، وعنوانُ IP بعد شهرٍ يُقصَّر، وسطرُه في سجلّ النشاط', async () => {
    seedOld()
    await runCron(0, '3 3 * * *')
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'settings.write'").get()).toEqual({ n: 0 })
    expect(db.raw.prepare("SELECT ip FROM audit_log WHERE action = 'session.open'").get()).toEqual({ ip: '203.0.113.0' })
    const line = db.raw.prepare("SELECT actor, detail FROM audit_log WHERE action = 'retention.sweep'").get() as { actor: string; detail: string }
    expect(line.actor).toBe('cron')
    expect(line.detail).toContain('نشاط 1')
    expect(line.detail).toContain('IP 1')
  })

  it('ولا يدور على دورة الربع', async () => {
    seedOld()
    await runCron(0, '*/15 * * * *')
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'settings.write'").get()).toEqual({ n: 1 })
    expect(db.raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'retention.sweep'").get()).toEqual({ n: 0 })
  })
})
