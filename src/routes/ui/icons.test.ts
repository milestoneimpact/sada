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
  it('ولا ثخانة ثانيةً في المجموعة', () => {
    const widths = new Set(
      ALL.flatMap(([, svg]) => [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => m[1])),
    )
    expect([...widths]).toEqual(['1.8'])
  })
})
