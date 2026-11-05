/**
 * الأيقونات (D-103) — **والمواصفةُ تُفرَض بالبناء، وهذا يُثبت أنّها فُرضت.**
 *
 * `icon()` تلبس الشكلَ المواصفةَ، **فأيقونةٌ تخالف لا تُكتب أصلا**.
 * وهذا الاختبارُ يقيس الناتج: لو بُدّلت `SPEC` غدا، أو كُتب وسمٌ بيدٍ في
 * هذا الملفّ، سقط هنا.
 *
 * **وحارسُ `audit_tokens` يكمله**: ذاك يمنع أيقونةً تُرسَم في ملفٍّ آخر،
 * وهذا يحرس ما في المصدر نفسِه.
 */
import { describe, expect, it } from 'vitest'
import { ICON } from './icons'

const direction = (svg: string): 'mirrors' | 'fixed' => (svg.includes('data-dir="mirrors"') ? 'mirrors' : 'fixed')

const ALL = Object.entries(ICON)

describe('مواصفة الأيقونات', () => {
  it('إحدى عشرة أيقونةً، ولا واحدة فارغة', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(11)
    for (const [name, svg] of ALL) {
      expect(svg, name).toMatch(/<svg[^>]*>.+<\/svg>/)
    }
  })

  it.each([
    ['شبكة ‏٢٤', 'viewBox="0 0 24 24"'],
    ['**ثخانة واحدة**', 'stroke-width="1.8"'],
    ['ولون يُورَث', 'stroke="currentColor"'],
    ['ونهايات مستديرة', 'stroke-linecap="round"'],
    ['ومفاصل مستديرة', 'stroke-linejoin="round"'],
    ['**ومخفيّة عن قارئ الشاشة**', 'aria-hidden="true"'],
  ])('%s في كلّها', (_name, part) => {
    for (const [name, svg] of ALL) expect(svg, name).toContain(part)
  })

  /**
   * **ولا تعبئةَ في أيقونة** — والفرقُ ليس ذوقا.
   *
   * أيقونةٌ ممتلئةٌ بين تسعٍ مرسومةٍ بالخطّ تُقرأ **حالةً مختارة** لا
   * شكلا مختلفا. والتعبئةُ محجوزةٌ لشعارات المنصّات في `logos.ts`.
   */
  it('**ولا تعبئة** — الوزن البصريّ يُقرأ حالةً لا شكلا', () => {
    for (const [name, svg] of ALL) expect(svg, name).toContain('fill="none"')
  })

  /**
   * **وثخانةٌ ثانيةٌ لا تمرّ.**
   *
   * قِيست قبل التوحيد فوُجدت ثلاثٌ: ‏١٫٨ في تسعٍ، و‏٢ في اثنتين، و‏١٫٩ في
   * واحدة. **ولا أحدَ يقصد ‏١٫٩** — هي أثرُ نسخٍ عن أقربِ ما وُجد.
   */
  /**
   * **ولكلّ أيقونةٍ اتّجاهٌ معلَن** (D-307): ما يدلّ على جهةٍ ينعكس من اليسار، وما يدلّ على شيءٍ يثبت.
   * أيقونةٌ جديدةٌ بلا قرارٍ هنا تسقط: «لم أفكّر» ليس اتّجاهًا.
   */
  it('ما يدلّ على جهةٍ ينعكس، وما يدلّ على شيءٍ يثبت — ولا أيقونةَ بلا قرار', () => {
    const MIRRORS = ['external', 'back', 'go', 'send'] as const
    const FIXED = [
      'overview', 'sources', 'posts', 'channels', 'providers', 'settings', 'tasks', 'report', 'plan', 'guide', 'add', 'chevron',
      'search', 'account', 'bell', 'more', 'like', 'heart', 'comment', 'repost', 'share', 'bookmark', 'views', 'globe', 'play', 'close',
    ] as const
    expect([...MIRRORS, ...FIXED].sort()).toEqual(Object.keys(ICON).sort())
    for (const k of MIRRORS) expect(direction(ICON[k]), k).toBe('mirrors')
    for (const k of FIXED) expect(direction(ICON[k]), k).toBe('fixed')
    expect(ICON.back).toContain('data-dir="mirrors"')
    expect(ICON.play).not.toContain('data-dir')
  })

  it('ولا ثخانة ثانيةً في المجموعة', () => {
    const widths = new Set(
      ALL.flatMap(([, svg]) => [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => m[1])),
    )
    expect([...widths]).toEqual(['1.8'])
  })
})
