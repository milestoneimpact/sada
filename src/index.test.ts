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
  }
}

/** `scheduled` يستعمل `fetch` العامّ، فيُبدَّل حول النداء وحده. */
async function runCron(count: number): Promise<void> {
  const real = globalThis.fetch
  globalThis.fetch = drive(count)
  try {
    await worker.scheduled({} as ScheduledController, env(count) as never)
  } finally {
    globalThis.fetch = real
  }
}

beforeEach(() => {
  db = fakeDb()
  sent = []
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
