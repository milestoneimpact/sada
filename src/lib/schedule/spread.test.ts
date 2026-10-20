/**
 * **الخطّةُ تُعرَض ثمّ تُنفَّذ — والمعروضُ هو المنفَّذ.**
 *
 * أخطرُ ما في التوزيع ليس حسابَ المواعيد، بل **أن يُعرض جدولٌ ويُنفَّذ
 * غيرُه**: المالكُ يوافق على ما رأى، فيقع ما لم يره. فالدالّةُ خالصةٌ
 * تُنادى مرّتين بالمدخلات نفسِها فتردّ الشيء نفسَه — وهذا ما يُختبَر
 * هنا قبل أيّ شيء.
 */
import { describe, expect, it } from 'vitest'
import {
  GAP_MAX_HOURS, GAP_MIN_HOURS, SPREAD_MAX, firstLine, planSpread,
  type SpreadDraft, type SpreadTarget,
} from './spread'

const NOW = new Date('2026-09-07T10:00:00Z')
const START = new Date('2026-09-08T06:00:00Z')

const TARGETS: readonly SpreadTarget[] = [
  { id: 'acc-li', platform: 'linkedin', label: 'عمر — LinkedIn' },
  { id: 'acc-x', platform: 'x', label: '@omar — X' },
]

function drafts(count: number, platform = 'linkedin'): SpreadDraft[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    platform,
    status: 'approved',
    text: `منشور رقم ${i}\nوسطر ثان لا يُعرَض`,
  }))
}

describe('التوزيع — والمعروض هو المنفَّذ', () => {
  it('نداءان بالمدخلات نفسِها يعطيان الخطّة نفسَها', () => {
    const a = planSpread(drafts(5), TARGETS, START, 24, NOW)
    const b = planSpread(drafts(5), TARGETS, START, 24, NOW)
    expect(b).toEqual(a)
  })

  it('والفاصل يُحترَم بالضبط — لا تقريب ولا انزلاق', () => {
    const { slots } = planSpread(drafts(4), TARGETS, START, 24, NOW)
    expect(slots.map((s) => s.when)).toEqual([
      '2026-09-08T06:00',
      '2026-09-09T06:00',
      '2026-09-10T06:00',
      '2026-09-11T06:00',
    ])
  })

  it('والترتيب ترتيب القائمة — فما رآه المالك أوّلا يخرج أوّلا', () => {
    const { slots } = planSpread(drafts(3), TARGETS, START, 6, NOW)
    expect(slots.map((s) => s.postId)).toEqual(['p0', 'p1', 'p2'])
  })
})

describe('ما لا يصلح يُقال ولا يُسقَط صامتا', () => {
  /*
   * **ومنشورٌ ينقصه وسيطُه يُقال في المعاينة** — لا يُعطى خانةً تردّها `schedulePost`
   * بعد الضغط، ولا يأخذ موعدَ غيره: الخانةُ التاليةُ لمن يصلح.
   */
  it('منشور ينقصه مقطعُه يُردّ بسببه ولا يأخذ خانة', () => {
    const list: SpreadDraft[] = [
      { id: 'tt', platform: 'linkedin', status: 'approved', text: 'بلا مقطع', lacking: 'TikTok تحتاج مقطعًا' },
      ...drafts(1, 'linkedin'),
    ]
    const { slots, skipped } = planSpread(list, TARGETS, START, 24, NOW)
    expect(slots.map((s) => [s.postId, s.when])).toEqual([['p0', '2026-09-08T06:00']])
    expect(skipped).toEqual([{ postId: 'tt', preview: 'بلا مقطع', reason: 'TikTok تحتاج مقطعًا' }])
  })

  it('منشور بلا قناة لمنصّته يُردّ بسببه', () => {
    const mixed: SpreadDraft[] = [
      ...drafts(1, 'linkedin'),
      { id: 'px', platform: 'x', status: 'approved', text: 'نصّ إكس' },
    ]
    const { slots, skipped } = planSpread(
      mixed,
      [TARGETS[0]!],
      START,
      24,
      NOW,
    )
    expect(slots).toHaveLength(1)
    expect(skipped).toHaveLength(1)
    expect(skipped[0]!.postId).toBe('px')
    expect(skipped[0]!.reason).toContain('لا قناة')
  })

  it('وغير المعتمَد لا يُوزَّع ولا يُشتكى منه — ليس مرشَّحا أصلا', () => {
    const mix: SpreadDraft[] = [
      { id: 'd1', platform: 'linkedin', status: 'draft', text: 'مسوّدة' },
      { id: 'd2', platform: 'linkedin', status: 'queued', text: 'مجدولة' },
      ...drafts(1),
    ]
    const { slots, skipped } = planSpread(mix, TARGETS, START, 24, NOW)
    expect(slots).toHaveLength(1)
    expect(skipped).toHaveLength(0)
  })

  it('و`edited` يُوزَّع كما يُوزَّع `approved`', () => {
    const one: SpreadDraft[] = [
      { id: 'e1', platform: 'linkedin', status: 'edited', text: 'عُدّل ثمّ اعتُمد' },
    ]
    expect(planSpread(one, TARGETS, START, 24, NOW).slots).toHaveLength(1)
  })

  it('وما فوق الحدّ يُقال عددُه ولا يُبتَر صامتا', () => {
    const { slots, skipped } = planSpread(drafts(SPREAD_MAX + 3), TARGETS, START, 1, NOW)
    expect(slots).toHaveLength(SPREAD_MAX)
    expect(skipped).toHaveLength(3)
    expect(skipped[0]!.reason).toContain(String(SPREAD_MAX))
  })
})

describe('ولا خانة في الماضي — فلا خطّة نصفُها مرفوض', () => {
  it('بداية مضت تُدفَع إلى ما بعد الآن', () => {
    const past = new Date('2026-09-01T06:00:00Z')
    const { slots } = planSpread(drafts(2), TARGETS, past, 24, NOW)
    for (const slot of slots) {
      expect(new Date(`${slot.when}:00Z`).getTime()).toBeGreaterThan(NOW.getTime())
    }
  })

  it('وفاصل خارج المدى يُقصّ إلى حدّه ويُرى في الخطّة', () => {
    const tight = planSpread(drafts(2), TARGETS, START, 0, NOW).slots
    expect(new Date(`${tight[1]!.when}:00Z`).getTime() - new Date(`${tight[0]!.when}:00Z`).getTime())
      .toBe(GAP_MIN_HOURS * 3_600_000)

    const wide = planSpread(drafts(2), TARGETS, START, 9999, NOW).slots
    expect(new Date(`${wide[1]!.when}:00Z`).getTime() - new Date(`${wide[0]!.when}:00Z`).getTime())
      .toBe(GAP_MAX_HOURS * 3_600_000)
  })

  it('والصيغة هي التي تقرؤها `parseWhen` — بلا تحويل بينهما', () => {
    for (const slot of planSpread(drafts(3), TARGETS, START, 7, NOW).slots) {
      expect(slot.when).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    }
  })
})

describe('السطر المعروض', () => {
  it('أوّل سطر لا النصّ كلُّه', () => {
    expect(firstLine('سطر أوّل\nوثان')).toBe('سطر أوّل')
  })

  it('ولا يُقصّ في وسط كلمة', () => {
    const long = `${'كلمة '.repeat(30)}`
    const cut = firstLine(long, 20)
    expect(cut.length).toBeLessThanOrEqual(21)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toContain('كل…')
  })

  it('ونصّ فارغ لا يرمي', () => {
    expect(firstLine('')).toBe('')
    expect(firstLine('\n\n')).toBe('')
  })
})
