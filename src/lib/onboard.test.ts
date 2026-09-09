/**
 * اليومُ الأوّل (D-108) — **وأهمُّ ما يُحرَس أنّ لا حالَ يُخزَّن.**
 *
 * درسُ D-073: **جدولٌ مكتوبٌ بيدٍ شاخ وقال «مطلوبة الآن» و‏٤٢ تشغيلَ
 * نشرٍ ناجحا تقول غيرَ ذلك**. فلا خطوةَ هنا تحمل علمَ «تمّت» — كلُّها
 * تُحسَب من حقائقَ تُقرأ مع الصفحة.
 */
import { describe, expect, it } from 'vitest'
import { onboarding, type OnboardFacts } from './onboard'

const EMPTY: OnboardFacts = {
  sources: 0, analyzed: 0, liveAccounts: 0, hasPlan: false, decided: 0, drafts: 0,
}
const f = (over: Partial<OnboardFacts>): OnboardFacts => ({ ...EMPTY, ...over })

describe('اليومُ الأوّل — والحالُ يُشتَقّ لا يُخزَّن', () => {
  it('نظامٌ فارغٌ تماما: لا خطوةَ تمّت، والأولى هي المطلوبة', () => {
    const o = onboarding(EMPTY)
    expect(o.done).toBe(0)
    expect(o.hidden).toBe(false)
    expect(o.next!.id).toBe('drive')
  })

  /**
   * **ولا علامةَ صحٍّ على ما لم يُتحقَّق منه** (D-061).
   *
   * «وُضع معرّفُ المجلّد» ليست «قُرئ المجلّد». **ومعرّفٌ لمجلّدٍ لا
   * يُقرأ يُعلَّم صحّا كذبا** — فالدليلُ مصدرٌ وُجد فعلا.
   */
  it('**واتّصالُ Drive دليلُه ملفٌّ قُرئ لا معرّفٌ كُتب**', () => {
    const o = onboarding(f({ sources: 3 }))
    const drive = o.steps.find((s) => s.id === 'drive')!
    expect(drive.done).toBe(true)
    expect(drive.proof).toContain('3')
  })

  it('وما لم يقع يقول ما ينقص لا «تعذّر»', () => {
    const o = onboarding(f({ sources: 4 }))
    expect(o.steps.find((s) => s.id === 'scan')!.proof).toContain('4')
    expect(o.steps.find((s) => s.id === 'scan')!.done).toBe(false)
  })

  /**
   * **وأوّلُ ما لم يتمّ لا أوّلُ ما في القائمة.**
   *
   * من أتمّ الأولى والثالثةَ يُطلَب منه الثانيةُ — **لا الأولى التي
   * أتمّها**، ولا الثالثةُ وقد تمّت.
   */
  it('**والمطلوبُ أوّلُ ما لم يتمّ**', () => {
    const o = onboarding(f({ sources: 2, analyzed: 1 }))
    expect(o.next!.id).toBe('channel')
    expect(o.done).toBe(2)
  })

  it('وتختفي حين تتمّ الخمس — ولا تبقى تُقرأ عطلا', () => {
    const o = onboarding(f({
      sources: 5, analyzed: 3, liveAccounts: 1, hasPlan: true, decided: 1, drafts: 4,
    }))
    expect(o.done).toBe(5)
    expect(o.hidden).toBe(true)
    expect(o.next).toBeNull()
  })

  /** **ولا خطوةَ تحمل حالا يُخزَّن**: الحقائقُ نفسُها تعطي الجوابَ نفسَه. */
  it('**ونكوصُ الحقائق ينكص بالخطوة**', () => {
    const full = f({ sources: 5, analyzed: 3, liveAccounts: 1, hasPlan: true, decided: 1 })
    expect(onboarding(full).hidden).toBe(true)
    // ‏رُفعت القناةُ — فترجع الخطوةُ إلى «لم تتمّ» بلا أن يمسح أحدٌ علما
    expect(onboarding({ ...full, liveAccounts: 0 }).hidden).toBe(false)
    expect(onboarding({ ...full, liveAccounts: 0 }).next!.id).toBe('channel')
  })

  /** **والترتيبُ ليس ذوقا**: لا مسوّدةَ بلا تحليل، ولا تحليلَ بلا مصدر. */
  it('وترتيبُ الخطوات ترتيبُ التبعيّة', () => {
    expect(onboarding(EMPTY).steps.map((s) => s.id))
      .toEqual(['drive', 'channel', 'scan', 'plan', 'decide'])
  })

  it('ولكلّ خطوةٍ ما يقع إن تُركت — لا وصفٌ لما تفعله', () => {
    for (const s of onboarding(EMPTY).steps) {
      expect(s.why.length).toBeGreaterThan(20)
      expect(s.go.length).toBeGreaterThan(0)
    }
  })
})
