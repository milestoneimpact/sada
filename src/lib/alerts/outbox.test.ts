/**
 * قناةُ التنبيهات (D-109) — **وأهمُّ ما يُحرَس هنا اثنان:**
 *
 * ١ · **لا سرَّ في المتن.** رسالةٌ تخرج مرّةً لا تُستردّ، **وسجلُّ القناة
 *     يبقى بعد أن يُحذَف السرّ** — سجلُّ Slack يُقرأ بعد سنة.
 * ٢ · **ولا يُرسَل حدثٌ مرّتين** (D-004). إشعارٌ يكثر يُطفَأ، **وحين
 *     يُطفَأ تسقط الثلاثةُ معه**.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { budgetAlert, looksSecret, MAX_TRIES, publishAlert, sendAlerts, tokenAlert } from './outbox'

let db: FakeDb
beforeEach(() => { db = fakeDb() })

const ok = (): typeof fetch =>
  vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch

const HOOK = 'https://hooks.example.com/t/abc'

describe('لا سرّ في المتن — والحدّ يُفرَض قبل النداء', () => {
  it.each([
    ['JWT', 'صدى — eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 انتهى'],
    ['Bearer', 'صدى — Bearer abc123xyz'],
    ['مفتاح مزوّد', 'صدى — sk-proj1234567890abcd'],
    ['اسم سرّ', 'صدى — تحقّق من client_secret'],
    ['ADMIN_TOKEN', 'صدى — ADMIN_TOKEN غير مضبوط'],
  ])('يمسك %s', (_l, body) => {
    expect(looksSecret(body)).toBe(true)
  })

  it('ولا يمسك متنا سليما', () => {
    expect(looksSecret(tokenAlert('صفحة صدى', 7, 'refresh', 'org_owner').body)).toBe(false)
    expect(looksSecret(publishAlert('p1', 'linkedin', 3, 'org_owner').body)).toBe(false)
    expect(looksSecret(budgetAlert('2026-09-09', 5, 5).body)).toBe(false)
  })

  /** **ولا يُعدّ فشلا يُعاد**: إعادةُ المحاولة تُعيد إرسالَ السرّ. */
  it('**ومتن يحمل سرّا لا يُنادى أصلا**', async () => {
    const f = ok()
    const r = await sendAlerts(db, HOOK, [{ kind: 'token', ref: 'x', body: 'Bearer zzz', org: 'org_owner' }], f)
    expect(f).not.toHaveBeenCalled()
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(0)
    const row = await db.prepare('SELECT error FROM alert_outbox WHERE ref = ?').bind('x')
      .first<{ error: string }>()
    expect(row!.error).toContain('سرّا')
  })
})

describe('نصّ تنبيه الإذن بعدده (D-184)', () => {
  it('يوم واحد، وسبعة أيّام، والصفر «انتهى» لا «خلال 0 يومًا»', () => {
    expect(tokenAlert('ح', 1, 'access', 'org_owner').body).toContain('ينتهي خلال يوم واحد.')
    expect(tokenAlert('ح', 7, 'access', 'org_owner').body).toContain('ينتهي خلال 7 أيّام.')
    const gone = tokenAlert('ح', 0, 'refresh', 'org_owner')
    expect(gone.body).toContain('إذن التجديد لحساب «ح» انتهى.')
    expect(gone.body).not.toMatch(/0 يوم/)
    expect(gone.ref).toBe('token:ح:refresh:0')
  })
})

describe('ولا يُرسَل حدث مرّتين (D-004)', () => {
  it('والثانية تُتخطّى بالقيد لا بالشيفرة', async () => {
    const a = tokenAlert('صفحة صدى', 7, 'refresh', 'org_owner')
    const f = ok()
    expect((await sendAlerts(db, HOOK, [a], f)).sent).toBe(1)
    const again = await sendAlerts(db, HOOK, [a], f)
    expect(again.sent).toBe(0)
    expect(again.skipped).toBe(1)
    expect(f).toHaveBeenCalledTimes(1)
  })

  /**
   * **والمفتاحُ من الحدث لا من وقت الإرسال** — وإلّا لم يُتعرَّف عليه.
   *
   * **والثلاثةُ كلُّها**: أوّلُ صياغةٍ لهذا الاختبار فحصت `tokenAlert`
   * وحدَها، **فزُرعت علّةٌ في `budgetAlert` فلم تسقط**. ونصفُ حارسٍ ليس
   * حارسا (D-073) — **وحارسٌ يمرّ على اثنين من ثلاثةٍ يُقرأ حارسا**.
   */
  it.each([
    ['token', () => tokenAlert('ح', 7, 'refresh', 'org_owner'), () => tokenAlert('ح', 1, 'refresh', 'org_owner')],
    ['publish', () => publishAlert('p1', 'linkedin', 3, 'org_owner'), () => publishAlert('p2', 'linkedin', 3, 'org_owner')],
    ['budget', () => budgetAlert('2026-09-09', 5, 5), () => budgetAlert('2026-09-10', 5, 5)],
  ])('ومفتاح %s يُبنى من الحدث نفسِه', (_k, same, other) => {
    expect(same().ref).toBe(same().ref)
    expect(same().ref).not.toBe(other().ref)
  })

  /** **وثلاثتُها لا تُرسَل مرّتين** — لا واحدةٌ منها. */
  it.each([
    ['token', () => tokenAlert('ح', 7, 'refresh', 'org_owner')],
    ['publish', () => publishAlert('p1', 'linkedin', 3, 'org_owner')],
    ['budget', () => budgetAlert('2026-09-09', 5, 5)],
  ])('و%s لا يخرج مرّتين', async (_k, make) => {
    const f = ok()
    expect((await sendAlerts(db, HOOK, [make()], f)).sent).toBe(1)
    expect((await sendAlerts(db, HOOK, [make()], f)).skipped).toBe(1)
    expect(f).toHaveBeenCalledTimes(1)
  })

  /** وفشلُ الشبكة يُسجَّل ولا يُقفَل: الدورةُ التالية تعيده. */
  it('وما فشل إرسالُه يُعاد في الدورة التالية', async () => {
    const a = budgetAlert('2026-09-09', 5, 5)
    const bad = vi.fn(async () => { throw new Error('انقطعت الشبكة') }) as unknown as typeof fetch
    expect((await sendAlerts(db, HOOK, [a], bad)).failed).toBe(1)
    const good = ok()
    expect((await sendAlerts(db, HOOK, [a], good)).sent).toBe(1)
  })
})

describe('والعنوان يُحرَس بحارس المزوّدين نفسِه', () => {
  it.each([
    ['http://localhost:8787/hook'],
    ['http://169.254.169.254/latest/meta-data'],
    ['http://10.0.0.5/hook'],
    ['http://192.168.1.1/hook'],
  ])('يردّ %s', async (url) => {
    const f = ok()
    const r = await sendAlerts(db, url, [budgetAlert('د', 1, 1)], f)
    expect(f).not.toHaveBeenCalled()
    expect(r.why).toContain('مرفوض')
  })

  /** **ولا صمتٌ يُظنّ نجاحا**: بلا عنوانٍ يُقال ذلك نصّا. */
  it('وبلا عنوان يقول ذلك ولا يصمت', async () => {
    const r = await sendAlerts(db, '', [budgetAlert('د', 1, 1)], ok())
    expect(r.why).toContain('لا عنوان')
    expect(r.sent).toBe(0)
  })
})

describe('والمتن يقول ما وقع ويُحيل إلى اللوحة', () => {
  it('ولا يحمل رابطا موقَّعا ولا معرّف جلسة', async () => {
    for (const a of [
      tokenAlert('صفحة صدى', 1, 'refresh', 'org_owner'),
      publishAlert('p1', 'linkedin', 3, 'org_owner'),
      budgetAlert('2026-09-09', 5.2, 5),
    ]) {
      expect(a.body).not.toMatch(/https?:\/\//)
      expect(a.body).toContain('صدى')
    }
  })

  it('ويُرسَل بحقل text — وهو ما يقرؤه Slack وDiscord', async () => {
    const f = vi.fn(async () => new Response('ok')) as unknown as typeof fetch
    await sendAlerts(db, HOOK, [budgetAlert('د', 1, 1)], f)
    const body = JSON.parse((f as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]![1]!.body as string)
    expect(typeof body.text).toBe('string')
  })

  it('وردّ غير ناجح يُسجَّل برمزه لا بـ«تعذّر»', async () => {
    const f = vi.fn(async () => new Response('no', { status: 404 })) as unknown as typeof fetch
    const r = await sendAlerts(db, HOOK, [budgetAlert('د', 1, 1)], f)
    expect(r.failed).toBe(1)
    const row = await db.prepare('SELECT status, error FROM alert_outbox').first<
      { status: number; error: string }>()
    expect(row!.status).toBe(404)
    expect(row!.error).toContain('404')
  })
})

/**
 * **والحارسُ يُفحَص عند كلّ قفزة** (D-110).
 *
 * فحصٌ للعنوان الأوّل وحدَه يُهزَم بـ‏٣٠٢: **عنوانٌ عامٌّ يمرّ الحارسَ ثمّ
 * يحوّل إلى `169.254.169.254`، و`fetch` يتبعه من تحتنا** — وهي بعينها
 * الحالُ التي كُتب الحارسُ ليمنعها.
 */
describe('ولا يُتبَع تحويل إلى الداخل', () => {
  it('**وردّ ٣٠٢ إلى عنوان داخليّ يُسجَّل عطلا ولا يُنادى**', async () => {
    const f = vi.fn(async () => new Response(null, {
      status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' },
    })) as unknown as typeof fetch
    const r = await sendAlerts(db, HOOK, [budgetAlert('2026-09-09', 5, 5)], f)
    expect(r.sent).toBe(0)
    expect(r.failed).toBe(1)
    const row = await db.prepare('SELECT error FROM alert_outbox').first<{ error: string }>()
    expect(row!.error).toMatch(/مرفوض/)
  })
})

/**
 * **ولا عنوانَ في نصّ عطلٍ يُخزَّن ويُعرَض** (D-110).
 *
 * عنوانُ القناة اعتمادٌ لا عنوان: رمزُ Slack في مساره، **ومن ملكه أرسل
 * باسمك**. ونصُّ العطل يُخزَّن في `alert_outbox.error` **ويُعرَض في اللوحة**.
 */
describe('ولا سرّ في نصّ عطل يُخزَّن', () => {
  it('**والعنوان يُمحى من نصّ العطل**', async () => {
    const f = vi.fn(async () => {
      throw new Error('تعذّر: https://hooks.slack.com/services/T00/B00/SECRET123')
    }) as unknown as typeof fetch
    await sendAlerts(db, HOOK, [budgetAlert('2026-09-09', 5, 5)], f)
    const row = await db.prepare('SELECT error FROM alert_outbox').first<{ error: string }>()
    expect(row!.error).not.toContain('SECRET123')
    expect(row!.error).not.toContain('hooks.slack.com')
    expect(row!.error).toContain('مُزال')
  })

  /** **وما ليس عنوانا يبقى مقروءا** — والمحوُ لا يمحو السبب. */
  it('ويبقى سبب العطل مقروءا', async () => {
    const f = vi.fn(async () => new Response('no', { status: 503 })) as unknown as typeof fetch
    await sendAlerts(db, HOOK, [budgetAlert('2026-09-09', 5, 5)], f)
    const row = await db.prepare('SELECT error FROM alert_outbox').first<{ error: string }>()
    expect(row!.error).toContain('503')
  })
})


/** ‏ردٌّ غير ناجح يُعاد بحدّ (D-270): كان يُكتب رمزُه ولا يُعاد أبدا. */
describe('ردّ غير ناجح يُعاد بحدّ (D-270)', () => {
  it('يُعاد حتّى يبلغ الحدّ ثمّ يُتخطّى', async () => {
    const a = budgetAlert('2026-09-10', 5, 5)
    const bad = vi.fn(async () => new Response('down', { status: 502 })) as unknown as typeof fetch
    for (let i = 0; i < MAX_TRIES; i += 1) expect((await sendAlerts(db, HOOK, [a], bad)).failed).toBe(1)
    expect((await sendAlerts(db, HOOK, [a], bad)).skipped).toBe(1)
    expect(bad).toHaveBeenCalledTimes(MAX_TRIES)
    const row = await db.prepare('SELECT tries FROM alert_outbox').first<{ tries: number }>()
    expect(row!.tries).toBe(MAX_TRIES)
  })

  it('وما نجح مرّةً لا يُعاد ولو دون الحدّ', async () => {
    const a = budgetAlert('2026-09-11', 5, 5)
    const bad = vi.fn(async () => new Response('down', { status: 502 })) as unknown as typeof fetch
    await sendAlerts(db, HOOK, [a], bad)
    const good = ok()
    expect((await sendAlerts(db, HOOK, [a], good)).sent).toBe(1)
    expect((await sendAlerts(db, HOOK, [a], good)).skipped).toBe(1)
    expect(good).toHaveBeenCalledTimes(1)
  })
})

/*
 * ‏‏D-317 · البند ٦: أحداثُ الأمان تُكتب صفًّا في القناة عند وقوعها (`security/events.ts`)، وتُرسلها الدورةُ كالثلاثة —
 * ‏ويُعاد ما لم ينجح بحدّ، ولا يُرسَل ما نجح مرّتين.
 */
describe('أحداثُ الأمان في القناة (D-317)', () => {
  it('صفٌّ كُتب عند الحدث يُرسَل مرّةً واحدة، وما ردّته القناةُ بفشلٍ يُعاد', async () => {
    const { collectAlerts } = await import('./collect')
    db.raw.prepare(`INSERT INTO alert_outbox (ref, kind, body, org_id) VALUES ('security:1', 'security', 'صدى — دخولٌ جديد إلى حسابك', 'org_owner')`).run()
    const first = await collectAlerts(db, new Date(), 0)
    expect(first.filter((a) => a.kind === 'security')).toEqual([
      { kind: 'security', ref: 'security:1', body: 'صدى — دخولٌ جديد إلى حسابك', org: 'org_owner' },
    ])
    const failing = vi.fn(async () => new Response('no', { status: 502 })) as unknown as typeof fetch
    expect((await sendAlerts(db, HOOK, first, failing)).failed).toBe(1)
    const again = await collectAlerts(db, new Date(), 0)
    expect(again.some((a) => a.ref === 'security:1')).toBe(true)
    const f = ok()
    expect((await sendAlerts(db, HOOK, again, f)).sent).toBe(1)
    expect((await collectAlerts(db, new Date(), 0)).some((a) => a.ref === 'security:1')).toBe(false)
  })
})
