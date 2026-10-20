/**
 * الإنفاقُ والنتائجُ من طرفهما إلى طرفهما (ر-7 · ر-10) — القاعدةُ حقيقيّة،
 * والصفحةُ تُقرأ نصًّا كما يراها المتصفّح.
 *
 * كانت الرئيسيّةُ بلا رقمٍ لـ«هذا الشهر»، و«أين يذهب المال» بلا كلفة X والمجموعُ
 * فوقه يحسبها، و«النتائج» بلا رابطٍ واحد.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../lib/crypto'
import { recordCost } from '../lib/cost'
import { money } from '../lib/format'
import { writeSetting } from '../lib/settings'
import { runWeekly } from '../lib/report/job'
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
    DB: db,
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: TOKEN,
  }
})

async function login(): Promise<string> {
  const body = new FormData()
  body.set('token', TOKEN)
  const response = await app.request('/panel/login', { method: 'POST', body }, env)
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0]!
}

async function home(cookie: string): Promise<string> {
  return (await app.request('/panel', { headers: { Cookie: cookie } }, env)).text()
}

/** قيمةُ بطاقةٍ بوسمها لا باسمها — الاسمُ مكتوبٌ في شاشة الاختيار أيضًا. */
function tile(html: string, label: string): { value: string; note: string } | null {
  const m = new RegExp(`<div class="kv-k">${label}</div>\\s*<div class="kv-v">([^<]+)</div>[\\s\\S]*?<div class="note">([^<]+)</div>`)
    .exec(html)
  return m === null ? null : { value: m[1]!.trim(), note: m[2]!.trim() }
}

/** ما أُنفق هذا الشهر: نداءُ ذكاءٍ ونشرٌ على X وقراءةُ مقاييسه — وصفٌّ من الشهر الماضي. */
async function seedLedger(): Promise<void> {
  await recordCost(db, { provider: 'anthropic', operation: 'analyze', units: 1, unitCost: 0.8 })
  await recordCost(db, { provider: 'x', operation: 'post', units: 1, unitCost: 0.015 })
  await recordCost(db, { provider: 'x', operation: 'metrics', units: 12, unitCost: 0.001 })
  db.raw.exec(
    `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, at)
     VALUES ('old', 'anthropic', 'analyze', 1, 0.44, 0.44, datetime('now', 'start of month', '-1 hours'))`,
  )
}

describe('«هذا الشهر» في الرئيسيّة (ر-10)', () => {
  /**
   * **الشهرُ من أوّله لا ثلاثون يومًا متحرّكة.** كانت «إنفاق 30 يوما» وحدَها،
   * ووصفُها «المجموعُ الشهريّ»، فيدخل فيها صفُّ الشهر الماضي.
   */
  it('رابع البطاقات الافتراضيّة، ولا يجمع الشهر الماضي', async () => {
    await seedLedger()
    const cookie = await login()
    const html = await home(`${cookie}; sada_tz=UTC`)
    const month = tile(html, 'إنفاق هذا الشهر')
    expect(month).not.toBeNull()
    expect(month!.value).toBe('⁦0.827$⁩')
    expect(month!.note).toBe('منذ أوّل الشهر')
    expect(html).not.toContain('المجموع الشهريّ')
  })

  /**
   * ومنطقةُ المالك من كعكته (D-173)؛ وحين تغيب يُحسَب بتوقيت الرياض ويُقال (D-201).
   * فالصفُّ الذي قبل منتصف ليل UTC بساعة هو الثانيةُ فجرًا من أوّل الشهر بالرياض: داخلٌ فيه.
   */
  it('وبلا منطقة من المتصفّح يحسب بتوقيت الرياض ويقوله', async () => {
    await seedLedger()
    const month = tile(await home(await login()), 'إنفاق هذا الشهر')
    expect(month!.value).toBe('⁦1.27$⁩')
    expect(month!.note).toBe('منذ أوّل الشهر بتوقيت الرياض')
  })
})

describe('«أين يذهب المال» من الدفتر كلِّه (ر-10)', () => {
  /**
   * **والأعمدةُ تساوي المجموع.** كانت تُرسَم من مزوّدي الذكاء وحدهم، فغابت
   * كلفةُ X — وX ما يُحاسَب على كلّ طلب — والبطاقةُ فوقها تحسبها.
   */
  it('فيه X بكلفة نشره وقياسه، ومجموع الأعمدة رقم «30 يومًا»', async () => {
    await seedLedger()
    await writeSetting(db, 'dashboard_tiles', 'spend_today,spend_month,spend_30d', 'omar')
    const html = await home(await login())

    const names = [...html.matchAll(/<span class="bar-name">([^<]+)<\/span>/g)].map((m) => m[1])
    expect(names).toContain('X — النشر والقياس')
    const values = [...html.matchAll(/<span class="bar-val money">\u2066?([\d.]+)\$\u2069?<\/span>/g)].map((m) => Number(m[1]))
    const ledger = db.raw
      .prepare("SELECT sum(total) AS t FROM cost_ledger WHERE at >= datetime('now', '-30 days')")
      .get() as { t: number }
    expect(money(values.reduce((a, b) => a + b, 0))).toBe(money(ledger.t))
    expect(tile(html, 'إنفاق 30 يومًا')!.value).toBe(money(ledger.t))
  })

  /** والتعليقُ من المصدر نفسِه، والعددُ بـ`counted` (D-177): لا «1 مزوّدا نشطا · 6 نداءً». */
  it('وتعليق «30 يومًا» يعدّ طلبات الدفتر كلِّه بعربيّة صحيحة', async () => {
    await recordCost(db, { provider: 'anthropic', operation: 'analyze', units: 1, unitCost: 0.8 })
    await recordCost(db, { provider: 'x', operation: 'post', units: 1, unitCost: 0.015 })
    await recordCost(db, { provider: 'x', operation: 'metrics', units: 12, unitCost: 0.001 })
    await writeSetting(db, 'dashboard_tiles', 'spend_today,spend_30d', 'omar')
    const html = await home(await login())
    expect(tile(html, 'إنفاق 30 يومًا')!.note).toBe('3 طلبات إلى خدمتَين')
    // ‏والرئيسيّةُ وحدها: بطاقاتُها ومالُها ونبضُ دوراتها
    const start = html.indexOf('<section data-pane="overview"')
    const overview = html.slice(start, html.indexOf('</section>', start))
    expect(overview).not.toMatch(/\d+ (منشورا|مزوّدا|دورة|يوما|نداءً)(?![ء-ي])/)
    expect(overview).toContain('<h2>الإنفاق — 14 يومًا</h2>')
  })
})

describe('«النتائج» توصل (ر-7)', () => {
  /** أسبوعٌ بمنشورٍ واحدٍ على X قِيس في نافذة ‏٧٢ ساعة — بالصيغة التي تكتبها القاعدة. */
  function seedLonePost(): void {
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name)
       VALUES ('a-x', 'x', 'member', 'e', 'عمر');
       INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                          idempotency_key, approved_by, approved_at)
       VALUES ('p-lone', 'a-x', 'x', 'text', 'منشور الأسبوع الوحيد\nوسطرُه الثاني', '2026-08-24 10:00:00',
               'published', 'k-lone', 'omar', '2026-08-24 09:00:00');
       INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
       VALUES ('at-lone', 'p-lone', 'k-lone', 1, '{}', 'succeeded', '2026-08-24 10:00:00');
       INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares)
       VALUES ('p-lone', '72h', 1975, 44, 6, 8);`,
    )
  }

  /**
   * **منشورُ الاثنين يدخل أسبوعَه** (ر-7): كان الحدُّ بصيغة ISO فيُسقط ما نُشر
   * يومَ الاثنين. ثمّ المنشورُ الوحيدُ بسطره وأرقامه ورابطِ سجلّه، وصفُّ X يوصل
   * إلى منشوراته، والعنوانُ مدًى بأسماء الشهور.
   */
  it('المنشور الوحيد يُرى ويوصل، وصفّ منصّته يوصل إلى منشوراتها', async () => {
    seedLonePost()
    await runWeekly(db, new Date('2026-09-06T04:14:00Z'))
    const body = await (await app.request('/panel/report', { headers: { Cookie: await login() } }, env)).text()

    expect(body).toContain('أسبوع 24 إلى 30 أغسطس')
    expect(body).toContain('خرج منشور واحد، وقِيس.')
    expect(body).toContain('منشور الأسبوع الوحيد')
    expect(body).not.toContain('وسطرُه الثاني')
    expect(body).toContain('<b>1975</b>ظهور')
    expect(body).toContain('<b>58</b>تفاعل')
    expect(body).toContain('href="/panel/journey/p-lone">سجلُّه</a>')
    expect(body).toContain('href="/panel/channels/x">اعرض منشوراتها</a>')
    // ‏وبلا سقفِ ترويجٍ رابطٌ إلى حقله في الإعدادات، و«هذا الشهر» يفتح حدودَ الإنفاق
    expect(body).toContain('href="/panel#c3">ضع سقف الترويج الأسبوعيّ</a>')
    expect(body).toContain('هذا الشهر حتّى اليوم:')
    expect(body).toContain('href="/panel#c2">')
    expect(body).not.toMatch(/\d+ منشورا(?![ء-ي])/)
  })

  it('و«هذا الشهر» يُرسَم ولو لم يُكتب تقرير بعد', async () => {
    await recordCost(db, { provider: 'x', operation: 'post', units: 1, unitCost: 0.39 })
    const body = await (await app.request('/panel/report', {
      headers: { Cookie: `${await login()}; sada_tz=Asia%2FRiyadh` },
    }, env)).text()
    expect(body).toContain('لا تقرير بعد')
    expect(body).toMatch(/هذا الشهر حتّى اليوم:\s*<a class="tap" href="\/panel#c2">\u20660\.390\$\u2069<\/a><\/div>/)
  })
})
