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
import { budgetAlert, looksSecret, publishAlert, sendAlerts, tokenAlert } from './outbox'

let db: FakeDb
beforeEach(() => { db = fakeDb() })

const ok = (): typeof fetch =>
  vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch

const HOOK = 'https://hooks.example.com/t/abc'

describe('لا سرَّ في المتن — والحدُّ يُفرَض قبل النداء', () => {
  it.each([
    ['JWT', 'صدى — eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 انتهى'],
    ['Bearer', 'صدى — Bearer abc123xyz'],
    ['مفتاحُ مزوّد', 'صدى — sk-proj1234567890abcd'],
    ['اسمُ سرّ', 'صدى — تحقّق من client_secret'],
    ['ADMIN_TOKEN', 'صدى — ADMIN_TOKEN غير مضبوط'],
  ])('يمسك %s', (_l, body) => {
    expect(looksSecret(body)).toBe(true)
  })

  it('ولا يمسك متنا سليما', () => {
    expect(looksSecret(tokenAlert('صفحةُ صدى', 7, 'refresh').body)).toBe(false)
    expect(looksSecret(publishAlert('p1', 'linkedin', 3).body)).toBe(false)
    expect(looksSecret(budgetAlert('2026-09-09', 5, 5).body)).toBe(false)
  })

  /** **ولا يُعدّ فشلا يُعاد**: إعادةُ المحاولة تُعيد إرسالَ السرّ. */
  it('**ومتنٌ يحمل سرّا لا يُنادى أصلا**', async () => {
    const f = ok()
    const r = await sendAlerts(db, HOOK, [{ kind: 'token', ref: 'x', body: 'Bearer zzz' }], f)
    expect(f).not.toHaveBeenCalled()
    expect(r.failed).toBe(1)
    expect(r.sent).toBe(0)
    const row = await db.prepare('SELECT error FROM alert_outbox WHERE ref = ?').bind('x')
      .first<{ error: string }>()
    expect(row!.error).toContain('سرّا')
  })
})

describe('ولا يُرسَل حدثٌ مرّتين (D-004)', () => {
  it('والثانيةُ تُتخطّى بالقيد لا بالشيفرة', async () => {
    const a = tokenAlert('صفحةُ صدى', 7, 'refresh')
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
    ['token', () => tokenAlert('ح', 7, 'refresh'), () => tokenAlert('ح', 1, 'refresh')],
    ['publish', () => publishAlert('p1', 'linkedin', 3), () => publishAlert('p2', 'linkedin', 3)],
    ['budget', () => budgetAlert('2026-09-09', 5, 5), () => budgetAlert('2026-09-10', 5, 5)],
  ])('ومفتاحُ %s يُبنى من الحدث نفسِه', (_k, same, other) => {
    expect(same().ref).toBe(same().ref)
    expect(same().ref).not.toBe(other().ref)
  })

  /** **وثلاثتُها لا تُرسَل مرّتين** — لا واحدةٌ منها. */
  it.each([
    ['token', () => tokenAlert('ح', 7, 'refresh')],
    ['publish', () => publishAlert('p1', 'linkedin', 3)],
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

describe('والعنوانُ يُحرَس بحارس المزوّدين نفسِه', () => {
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
  it('وبلا عنوانٍ يقول ذلك ولا يصمت', async () => {
    const r = await sendAlerts(db, '', [budgetAlert('د', 1, 1)], ok())
    expect(r.why).toContain('لا عنوانَ')
    expect(r.sent).toBe(0)
  })
})

describe('والمتنُ يقول ما وقع ويُحيل إلى اللوحة', () => {
  it('ولا يحمل رابطا موقَّعا ولا معرّفَ جلسة', async () => {
    for (const a of [
      tokenAlert('صفحةُ صدى', 1, 'refresh'),
      publishAlert('p1', 'linkedin', 3),
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

  it('وردٌّ غيرُ ناجحٍ يُسجَّل برمزه لا بـ«تعذّر»', async () => {
    const f = vi.fn(async () => new Response('no', { status: 404 })) as unknown as typeof fetch
    const r = await sendAlerts(db, HOOK, [budgetAlert('د', 1, 1)], f)
    expect(r.failed).toBe(1)
    const row = await db.prepare('SELECT status, error FROM alert_outbox').first<
      { status: number; error: string }>()
    expect(row!.status).toBe(404)
    expect(row!.error).toContain('404')
  })
})
