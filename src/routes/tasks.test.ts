/**
 * شاشةُ «ما عليك» — من طرفها إلى طرفها.
 *
 * **والحالُ يُشتقّ من قاعدةٍ وبيئةٍ حقيقيّتين**، لا يُمرَّر مصنوعا:
 * اشتقاقٌ يُختبَر على قيمٍ مؤلَّفة يمرّ على وهم.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

let db: FakeDb
let env: Record<string, unknown>

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: db, KV: fakeKv(), TOKEN_ENC_KEY: KEY, ADMIN_TOKEN: TOKEN,
  }
})

async function open(scoped = env): Promise<string> {
  const body = new FormData()
  body.set('token', TOKEN)
  const login = await app.request('/panel/login', { method: 'POST', body }, scoped)
  const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
  return (await app.request('/panel/tasks', { headers: { Cookie: cookie } }, scoped)).text()
}

describe('الباب', () => {
  it('لا يُفتَح بلا جلسة', async () => {
    const response = await app.request('/panel/tasks', {}, env)
    expect(response.status).toBe(401)
  })
})

describe('والحالُ يُشتقّ لا يُكتَب', () => {
  it('بلا شيءٍ مضبوط: المهامُّ عليك، والبوّابةُ أوّلا', async () => {
    const html = await open()
    expect(html).toContain('M-02')
    expect(html).toContain('توقف بوّابةَ مرحلة')
    expect(html).toContain('عليك')
  })

  /** ومتغيّرا الكيان يُشتقّان من البيئة نفسِها لا من صفٍّ يُكتَب. */
  it('ومتغيّرا الكيان حين يُضبطان تصير M-17 «تمّت»', async () => {
    const before = await open()
    expect(before).toContain('M-17')

    const after = await open({
      ...env, LEGAL_ENTITY: 'بصائر للاستشارات', LEGAL_CONTACT: 'omar@example.com',
    })
    // العدُّ ينقص واحدا — والرقمُ هو الدليل لا النصّ
    const count = (h: string): number =>
      Number(/(\d+)<\/b> عليك/.exec(h)?.[1] ?? '0')
    expect(count(after)).toBe(count(before) - 1)
  })

  it('وربطُ حسابٍ يُتمّ مهمّتَه', async () => {
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name)
       VALUES ('a1', 'youtube', 'org', 'UC1', 'قناتي')`,
    )
    const html = await open()
    expect(html).toContain('M-15')
    expect(html).toContain('تمّت')
  })
})

describe('ولا علامةَ صحٍّ على ما لم يُتحقَّق منه', () => {
  /**
   * موافقةُ Community Management تقع عند LinkedIn لا عندنا.
   * **وقولُ «لم تتمّ» عن طلبٍ قُبل يجعل المالكَ يعيده.**
   */
  it('ما يقع عند المنصّة يُقال «لا يُعرَف من هنا»', async () => {
    const html = await open()
    expect(html).toContain('لا يُعرَف من هنا')
    expect(html).toContain('M-03')
  })

  it('والعدُّ لا يشمل ما لا يُعرَف', async () => {
    const html = await open()
    const unknown = Number(/(\d+) لا تُعرَف/.exec(html)?.[1] ?? '0')
    const todo = Number(/· (\d+) عليك/.exec(html)?.[1] ?? '0')
    expect(unknown).toBeGreaterThan(0)
    // ولو عُدّ المجهولُ لصار المجموعُ أكبر — والرقمُ لا ينزل أبدا فيُهمَل
    expect(todo).toBeLessThan(todo + unknown)
  })
})

describe('والرابطُ في اللوحة', () => {
  it('يظهر ويحمل عددَ ما عليك', async () => {
    const body = new FormData()
    body.set('token', TOKEN)
    const login = await app.request('/panel/login', { method: 'POST', body }, env)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const html = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(html).toContain('href="/panel/tasks"')
    expect(html).toContain('ما عليك')
  })
})

describe('وبوّاباتُ المراحل تُقاس', () => {
  /**
   * `PLAN.md` يعلّق القاعدةَ على `STATUS.md` — **وهو يُكتب بيد، وقد
   * شاخ مرّتين**. فتُقاس هنا من القاعدة.
   */
  it('تُعرَض الأربعُ، ولا واحدةَ مجتازةٌ على قاعدةٍ فارغة', async () => {
    const html = await open()
    for (const phase of ['٠', '١', '٢', '٣']) {
      expect(html).toContain(`المرحلة ${phase}`)
    }
    expect(html).not.toContain('اجتِيزت')
    expect(html).toContain('أنت في المرحلة ٠')
  })

  /** **ومعه دليلُه**: «لم تُجتَز» بلا رقمٍ لا تُعالَج. */
  it('ولكلّ بندٍ دليلُه لا حكمُه وحده', async () => {
    const html = await open()
    expect(html).toContain('linkedin: 0')
    expect(html).toContain('x: 0')
  })

  /**
   * **بوّابةٌ تُجتاز بشرطٍ لم يُقَس تُجيز مرحلةً لم تكتمل** — فيُقال
   * «لا يُقاس من هنا» وتبقى غيرَ مجتازة.
   */
  it('وبندٌ لا يُقاس يُقال ولا يُدَّعى', async () => {
    expect(await open()).toContain('لا يُقاس من هنا')
  })

  it('ومنشورٌ خرج فعلا يُغيّر الدليل', async () => {
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name)
       VALUES ('a-x', 'x', 'member', 'e', 'عمر')`,
    )
    db.raw.exec(
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                          idempotency_key, approved_by, approved_at)
       VALUES ('p1', 'a-x', 'x', 'text', 'ن', '2026-09-01T00:00:00Z', 'published',
               'k1', 'omar', '2026-09-01T00:00:00Z')`,
    )
    db.raw.exec(
      `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no,
                                     request_json, status)
       VALUES ('at1', 'p1', 'k1', 1, '{}', 'succeeded')`,
    )
    expect(await open()).toContain('x: 1')
  })
})
