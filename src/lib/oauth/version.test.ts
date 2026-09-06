/**
 * عمرُ النسخة — **وحارسٌ يمنع الرقمَ والوثيقةَ أن يفترقا.**
 *
 * `PLATFORMS.md` تسمّي الرقمَ المثبَّت، و`providers.ts` تحمله. ونسختان
 * تفترقان تجعل الوثيقةَ تصف ما لا يجري — **وهي علّةُ D-069 بعينها**.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REVIEW_AFTER_MONTHS, versionAge } from './version'
import { LINKEDIN_VERSION } from './providers'

describe('العمرُ يُحسَب بالشهور', () => {
  it('نسخةُ الشهر نفسِه عمرُها صفر', () => {
    expect(versionAge('202609', new Date('2026-09-06T00:00:00Z'))?.months).toBe(0)
  })

  it('وشهرٌ مضى شهر', () => {
    expect(versionAge('202608', new Date('2026-09-06T00:00:00Z'))?.months).toBe(1)
  })

  /** **والسنةُ تُعبَر**: طرحُ الشهرين وحدَه يعطي سالبا عبر رأس السنة. */
  it('ويُعبَر رأسُ السنة بلا سالب', () => {
    expect(versionAge('202511', new Date('2026-02-01T00:00:00Z'))?.months).toBe(3)
  })

  it('وتبلغ الدورةُ عند عتبتها لا بعدها', () => {
    const at = versionAge('202512', new Date('2026-09-06T00:00:00Z'))
    expect(at?.months).toBe(REVIEW_AFTER_MONTHS)
    expect(at?.due).toBe(true)

    expect(versionAge('202601', new Date('2026-09-06T00:00:00Z'))?.due).toBe(false)
  })
})

describe('وصيغةٌ لا تُقرأ لا تُعدّ حديثة', () => {
  /**
   * **`null` تعني «لا يُعرَف» لا «سليمة»** (D-063). ورقمٌ لم يُفهَم
   * يُقال عنه ذلك، ولا يُطمأنّ إليه.
   */
  it.each(['', '2026', '20260', 'abcdef', '2026-06', '202613', '202600'])(
    'لا تُقرأ: %s',
    (bad) => {
      expect(versionAge(bad, new Date('2026-09-06T00:00:00Z'))).toBeNull()
    },
  )
})

describe('الرقمُ والوثيقةُ لا يفترقان', () => {
  /**
   * **حارسٌ لا زينة**: `PLATFORMS.md` هي التي يقرؤها المالكُ ليعرف ما
   * نُرسل، ورقمٌ فيها غيرُ الذي يُرسَل يجعله يراجع نسخةً لا نستعملها.
   */
  it('`PLATFORMS.md` تسمّي النسخةَ التي تحملها الشيفرة', () => {
    const doc = readFileSync(new URL('../../../docs/PLATFORMS.md', import.meta.url), 'utf8')
    expect(doc).toContain(`LinkedIn-Version: ${LINKEDIN_VERSION}`)
  })

  it('والنسخةُ المثبَّتةُ تُقرأ أصلا', () => {
    expect(versionAge(LINKEDIN_VERSION, new Date())).not.toBeNull()
  })
})
