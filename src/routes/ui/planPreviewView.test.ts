/** «هذا ما فهمته» بوسومه (D-406): شارةٌ لكلّ صفّ، وشريطُ عددٍ لكلّ وسم، ولافتةُ الملفّ المستورد، وما غاب عن الملفّ. */
import { describe, expect, it } from 'vitest'
import { planPreviewScreen, tagBar } from './planPreviewView'

const csv = 'التاريخ,الوقت,المنصة,النص\n2099-01-04,09:00,LinkedIn,أ\n2099-01-05,13:00,X,ب\n2099-01-06,13:00,X,ج'
const base = { key: '00000000-0000-0000-0000-000000000000', csv, filled: {}, via: 'csv', widened: false, cost: 0 }

describe('وسومُ المعاينة', () => {
  it('لكلّ صفٍّ شارتُه بلونٍ ورمزٍ وكلمة، والشريطُ يعدّها ويسكت عن الصفر', () => {
    const seat = { tags: { '2': 'new', '3': 'modified', '4': 'published' } as const, removed: [{ platform: 'x', due: '2099-01-08 13:00', angle: 'د', guarded: true }], importedAt: null }
    const out = planPreviewScreen({ ...base, seat })
    expect(out).toContain('<th scope="col">عند البناء</th>')
    for (const w of ['جديد', 'معدَّل', 'منشور سابقًا', 'محذوف من الملفّ']) expect(out).toContain(w)
    expect(out).toContain('class="st-ic"')
    expect(tagBar(seat)).toContain('جديد 1')
    expect(tagBar(seat)).toContain('محذوف من الملفّ 1')
    expect(tagBar(seat)).not.toContain('مجدول سابقًا')
    expect(tagBar(seat)).toContain('aria-label="ما سيفعله البناء بصفوف ملفّك"')
    expect(out).toContain('في خطّتك وليس في الملفّ')
    expect(out).toContain('يبقى: منشورُه مجدولٌ أو منشور')
    expect(out).not.toContain('استُورد في')
  })

  it('الملفُّ نفسُه: لافتةٌ بتاريخ استيراده', () => {
    const out = planPreviewScreen({ ...base, seat: { tags: {}, removed: [], importedAt: '2099-01-01 08:00:00', importedLabel: 'الخميس 1 يناير 2099' } })
    expect(out).toContain('هذا الملفّ استُورد في الخميس 1 يناير 2099')
  })

  it('بلا معاينةٍ لا عمودَ ولا شريط', () => {
    expect(planPreviewScreen(base)).not.toContain('عند البناء')
  })
})

import { importsScreen } from './planMonthView'

describe('سجلُّ الاستيرادات', () => {
  it('إعادةُ الرفع بلا تغيير تُرى بعددها وآخرها، ورابطُ «قارن الإصدارات» لما له خطّة', () => {
    const out = importsScreen([{ id: 'j', sourceKind: 'csv', sourceRef: null, contentHash: 'abcdef0123456', period: '2099-01', status: 'applied', createdAt: '2099-01-01 08:00:00',
      summary: '2 مُسكَّن', planId: 'p1', reseen: 2, lastSeenAt: '2099-01-02 09:30:00' }], false)
    expect(out).toContain('أُعيد رفعُه بلا تغيير 2')
    expect(out).toContain('2099-01-02 09:30')
    expect(out).toContain('href="/panel/plan/versions?plan=p1"')
  })
})
