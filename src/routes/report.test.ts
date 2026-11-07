/**
 * شاشةُ التقرير — من طرفها إلى طرفها.
 *
 * **وأكثرُ ما يُفحَص هنا ليس ما تعرضه، بل ما ترفض أن تعرضه**: مبلغا
 * بلا سقف، وصفرا مكان فراغ، وزرَّ إنفاق.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { writeSetting } from '../lib/settings'
import { COOKIE } from '../lib/session'
import { runWeekly } from '../lib/report/job'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { successCard } from './ui/reportView'

const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

let db: FakeDb
let env: Record<string, unknown>
let csrf = ''

beforeEach(() => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: db,
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: TOKEN,
  }
  db.raw.exec(
    `INSERT INTO accounts (id, platform, kind, external_id, display_name)
     VALUES ('a-x', 'x', 'member', 'e', 'عمر')`,
  )
})

async function login(): Promise<string> {
  const response = await emailLogin(app, env)
  const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
  const page = await app.request('/panel', { headers: { Cookie: cookie } }, env)
  csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? ''
  return cookie
}

/** أسبوعٌ فيه خمسةُ منشوراتٍ مقيسة، أحدُها متفوّق. */
function seedWeek(): void {
  const at = (day: number): string => `2026-08-2${day}T10:00:00.000Z`
  const counts = [10, 10, 10, 10, 90]
  counts.forEach((n, i) => {
    const id = `p${i}`
    db.raw.exec(
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                          idempotency_key, approved_by, approved_at)
       VALUES ('${id}', 'a-x', 'x', 'text', 'نصّ المنشور ${i}', '${at(4 + i)}',
               'published', 'k-${id}', 'omar', '${at(4 + i)}')`,
    )
    db.raw.exec(
      `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no,
                                     request_json, status, at)
       VALUES ('at-${id}', '${id}', 'k-${id}', 1, '{}', 'succeeded', '${at(4 + i)}')`,
    )
    db.raw.exec(
      `INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares)
       VALUES ('${id}', '24h', NULL, ${n}, 0, 0)`,
    )
  })
}

const MONDAY = new Date('2026-09-06T04:14:00Z')

describe('الباب', () => {
  it('لا يُفتَح بلا جلسة', async () => {
    const response = await app.request('/panel/report', {}, env)
    expect(response.status).toBe(401)
    // ‏صفحةُ دخولٍ تعود إلى التقرير — و«انتهت الجلسة» لمن سقطت جلستُه وحده (ر-11)
    expect(await response.text()).toContain('name="next" id="login-next" value="/panel/report"')
  })

  it('وأسبوع بلا تقرير يقولها ولا يخترع أرقاما', async () => {
    const cookie = await login()
    const body = await (await app.request('/panel/report', { headers: { Cookie: cookie } }, env)).text()
    expect(body).toContain('لا تقرير بعد')
    expect(body).toContain('فجر كلّ اثنين')
  })

  it('وتقرير أسبوع لا وجود له يعود 404 لا صفحةً فارغة', async () => {
    const cookie = await login()
    const response = await app.request('/panel/report/1999-01-04', { headers: { Cookie: cookie } }, env)
    expect(response.status).toBe(404)
  })
})

describe('ما يُعرَض', () => {
  it('يعرض ما خرج وما قِيس، والنافذة التي وقع فيها الترتيب', async () => {
    seedWeek()
    await runWeekly(db, MONDAY)
    const cookie = await login()
    const body = await (await app.request('/panel/report', { headers: { Cookie: cookie } }, env)).text()

    // ‏والعنوانُ مدًى بأسماء الشهور وآخرُه الأحد (خطّة التصميم ٥٫٨): لا «2026-08-24 — 2026-08-31»
    expect(body).toContain('أسبوع 24 إلى 30 أغسطس')
    expect(body).not.toContain('2026-08-24 — 2026-08-31')
    // **والنافذةُ باسمها لا بمفتاح CHECK** (D-124): كان الاختبارُ يثبّت «24h»
    expect(body).toContain('الأوّل في نافذة 24 ساعة')
    expect(body).not.toContain('نافذة 24h')
    expect(body).toContain('نصّ المنشور 4')
    // **صفوفٌ لا بطاقاتٌ في بطاقة** (D-140): كلُّ منصّةٍ صفٌّ في «ما خرج»
    expect(body).toContain('<div class="slices">')
    expect(body).toMatch(/<div class="slice">\s*<div class="plat-logo">/)
  })

  /**
   * **الحدُّ الذي تحرسه الشاشةُ كلُّها.**
   *
   * الظهورُ غيرُ مقيسٍ هنا. وعرضُه صفرا يُقرأ «لم يره أحد» — وهو ليس
   * ذلك، **بل واجهةٌ صامتة**. فيُعرَض «—» ومعه سببُه.
   */
  it('والظهور غير المقيس يُعرَض فراغا لا صفرا', async () => {
    seedWeek()
    await runWeekly(db, MONDAY)
    const cookie = await login()
    const body = await (await app.request('/panel/report', { headers: { Cookie: cookie } }, env)).text()

    expect(body).toContain('لا تعطيه المنصّة')
    expect(body).not.toContain('<b>0</b>ظهور')
  })

  /** والنسبةُ لم تُستعمَل لأنّ الظهورَ ناقص — ويُقال، لا يُترك ليُخمَّن. */
  it('ويقول بم رُتِّب ولماذا لم تُستعمَل النسبة', async () => {
    seedWeek()
    await runWeekly(db, MONDAY)
    const cookie = await login()
    const body = await (await app.request('/panel/report', { headers: { Cookie: cookie } }, env)).text()
    expect(body).toContain('بعدد التفاعل')
    expect(body).toContain('تكافئ من لم يُقَس')
  })
})

describe('التوصية — تقترح ولا تُنفق', () => {
  it('بلا سقف لا مبلغ يُعرَض، ويُقال لماذا', async () => {
    seedWeek()
    await runWeekly(db, MONDAY)
    const cookie = await login()
    const body = await (await app.request('/panel/report', { headers: { Cookie: cookie } }, env)).text()

    expect(body).toContain('لا سقف موضوع')
    expect(body).toContain('رقم بلا مصدر')
    expect(body).not.toContain('أقبل')
  })

  it('وبسقف تُعرَض بمبلغها وسببها وزرَّي بتّ', async () => {
    seedWeek()
    await writeSetting(db, 'weekly_promo_cap_usd', '20', 'omar')
    await runWeekly(db, MONDAY)
    const cookie = await login()
    const body = await (await app.request('/panel/report', { headers: { Cookie: cookie } }, env)).text()

    expect(body).toContain('تنتظر بتّك')
    expect(body).toContain('أقبل')
    expect(body).toContain('أرفض')
    expect(body).toContain('تسجيل رأي لا أمر إنفاق')
  })

  /**
   * **النموذجُ يحمل رمزَه** (D-150). كان `reportScreen` يرسم «أقبل/أرفض» بلا
   * `_csrf` فيردّه `guardPost` كلَّ مرّة — زرٌّ ظاهرٌ لا يعمل. والفحصُ على كلّ
   * نموذجِ POST في الشاشتين لا على واحد.
   */
  it('**كلّ نموذج في شاشتَي التقرير يحمل `_csrf` الجلسة**', async () => {
    seedWeek()
    await writeSetting(db, 'weekly_promo_cap_usd', '20', 'omar')
    await runWeekly(db, MONDAY)
    const cookie = await login()
    const week = (db.raw.prepare('SELECT id FROM reports').get() as { id: string }).id
    for (const path of ['/panel/report', `/panel/report/${week}`]) {
      const response = await app.request(path, { headers: { Cookie: cookie } }, env)
      expect(response.status, path).toBe(200)
      const html = await response.text()
      const forms = html.match(/<form\b[^>]*\bmethod="post"[^>]*>[\s\S]*?<\/form>/gi) ?? []
      expect(forms.length, path).toBeGreaterThan(0)
      for (const form of forms) expect(form, path).toContain(`name="_csrf" value="${csrf}"`)
      expect(html, path).toContain('action="/panel/report/promote"')
    }
  })

  /** **قبولٌ لا يُنفق** — ولا صفَّ يدخل دفترَ التكلفة (D-006 · D-008). */
  it('والقبول يسجَّل ولا يُنفق دولارا', async () => {
    seedWeek()
    await writeSetting(db, 'weekly_promo_cap_usd', '20', 'omar')
    await runWeekly(db, MONDAY)
    const cookie = await login()

    const before = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    const form = new FormData()
    form.set('post_id', 'p4')
    form.set('decision', 'accepted')
    form.set('_csrf', csrf)
    const response = await app.request(
      '/panel/report/promote',
      { method: 'POST', body: form, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(303)

    const after = db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get() as { n: number }
    expect(after.n).toBe(before.n)

    const row = db.raw
      .prepare('SELECT human_decision FROM promotion_suggestions WHERE post_id = ?')
      .get('p4') as { human_decision: string }
    expect(row.human_decision).toBe('accepted')
  })

  it('وبتّ لا نعرفه يُردّ ولا يُحفَظ', async () => {
    seedWeek()
    await writeSetting(db, 'weekly_promo_cap_usd', '20', 'omar')
    await runWeekly(db, MONDAY)
    const cookie = await login()

    const form = new FormData()
    form.set('post_id', 'p4')
    form.set('decision', 'spend_now')
    form.set('_csrf', csrf)
    const response = await app.request(
      '/panel/report/promote',
      { method: 'POST', body: form, headers: { Cookie: cookie } },
      env,
    )
    expect(response.status).toBe(400)
  })

  it('وبلا رمز CSRF لا يُبَتّ', async () => {
    seedWeek()
    await writeSetting(db, 'weekly_promo_cap_usd', '20', 'omar')
    await runWeekly(db, MONDAY)
    await login()

    const form = new FormData()
    form.set('post_id', 'p4')
    form.set('decision', 'accepted')
    const response = await app.request(
      '/panel/report/promote',
      { method: 'POST', body: form, headers: { Cookie: `${COOKIE}=${crypto.randomUUID()}` } },
      env,
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})

describe('رابط التقرير في اللوحة', () => {
  it('يظهر، ويحمل عدد ما ينتظر البتّ', async () => {
    seedWeek()
    await writeSetting(db, 'weekly_promo_cap_usd', '20', 'omar')
    await runWeekly(db, MONDAY)
    const cookie = await login()
    const body = await (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
    expect(body).toContain('href="/panel/report"')
    expect(body).toContain('<span class="count">1</span>')
  })
})

/**
 * ‏**مقاييسُ النجاح على «النتائج»** (D-324): الثلاثةُ من PLAN.md §٧ — اعتمادٌ بلا تعديل، وفي موعده، وكلفةُ المنشور — هذا
 * ‏الشهر، **والفراغُ «لم يُقَس»** لا ‏0٪. كانت معرَّفةً في الخطّة ولا تُرى في المنتج.
 */
describe('مقاييس النجاح (D-324)', () => {
  it('ثلاثُ بلاطاتٍ بأهدافها، وشهرٌ بلا شيءٍ يقول «لم يُقَس»', async () => {
    const cookie = await login()
    const html = await (await app.request('/panel/report', { headers: { Cookie: cookie } }, env)).text()
    const card = html.slice(html.indexOf('id="success"'), html.indexOf('</section>', html.indexOf('id="success"')))
    expect(card).toContain('مقاييس النجاح هذا الشهر')
    expect(card).toContain('اعتماد بلا تعديل')
    expect(card).toContain('نُشر في موعده')
    expect(card).toContain('كلفة المنشور')
    expect(card.match(/لم يُقَس/g)?.length).toBe(3)
    expect(card).not.toMatch(/class="kv-v">0٪/)
  })

  it('وبأرقام الشهر: نسبةٌ بمقامها، وكلفةٌ بما نُشر', async () => {
    const now = new Date()
    const day = (h: number): string => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.max(2, Math.min(now.getUTCDate(), 27)), h)).toISOString().slice(0, 19).replace('T', ' ')
    db.raw.exec(`INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, model, approved_by, approved_at, scheduled_at, cost_usd, created_at)
      VALUES ('s1', 'a-x', 'x', 'text', 'نصّ', 'published', 'k-s1', 'claude-opus-5', 'omar', '${day(8)}', '${day(9)}', 0.02, '${day(7)}'),
             ('s2', 'a-x', 'x', 'text', 'نصّ', 'rejected', 'k-s2', 'claude-opus-5', 'omar', NULL, NULL, 0.02, '${day(7)}')`)
    db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at, platform_post_id)
      VALUES ('at1', 's1', 'k-s1', 1, '{}', 'succeeded', '${day(9).replace(':00:00', ':05:00')}', 't1')`)
    db.raw.exec(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id, at)
      VALUES ('c1', 'x', 'create_post', 1, 0.015, 0.015, 's1', '${day(9)}')`)
    const cookie = await login()
    const html = await (await app.request('/panel/report', { headers: { Cookie: cookie } }, env)).text()
    const card = html.slice(html.indexOf('id="success"'), html.indexOf('</section>', html.indexOf('id="success"')))
    expect(card).toContain('50٪')
    expect(card).toContain('1 من 2')
    expect(card).toContain('100٪')
    expect(card).toContain('0.035$')
  })
})

/** ‏**والعددُ بعربيّةٍ صحيحة** (D-177 · D-324): «متوسّط 9 منشورات» لا «9 منشورًا»، و«منشورَين» للاثنين. */
describe('بلاطةُ كلفة المنشور تعدّ بالعربيّة (D-324)', () => {
  const m = (posts: number) => successCard({
    clean: { n: 0, of: 0 }, onTime: { n: 0, of: 0 }, cost: { posts, direct: 0.1 * posts, all: 0.2 * posts }, utc: false,
  })
  it('واحدٌ واثنان ومن ثلاثةٍ إلى عشرة وما فوقها', () => {
    expect(m(1)).toContain('متوسّط منشور واحد:')
    expect(m(2)).toContain('متوسّط منشورَين:')
    expect(m(9)).toContain('متوسّط 9 منشورات:')
    expect(m(12)).toContain('متوسّط 12 منشورًا:')
  })
})
