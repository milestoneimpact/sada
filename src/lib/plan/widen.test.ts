import { describe, expect, it } from 'vitest'
import { widenPlan } from './widen'
import { parseCsvRecords } from './import'

describe('الخطّةُ العريضة', () => {
  it('صفُّ اليوم يُفرَد منشورًا لكلّ منصّةٍ لها صيغة، بوقتها', () => {
    const csv = [
      'اليوم,التاريخ,الإطار,العنوان / الفكرة,X: الصيغة,X: الوقت,LinkedIn: الصيغة,LinkedIn: الوقت,الحالة',
      '1,2099-03-01,قيادة,"الأثر قبل المخرجات, دائمًا",سلسلة,09:00,مقال,10:30,مسودة',
      '2,2099-03-02,حوكمة,سؤال التمويل,-,,منشور,11:00,',
      '3,2099-03-03,,,تغريدة,08:00,,,',
    ].join('\n')
    const w = widenPlan(csv)
    expect(w.widened).toBe(true)
    expect(w.platforms).toEqual(['X', 'LinkedIn'])
    const rows = parseCsvRecords(w.csv).map((r) => r.cells)
    expect(rows[0]).toEqual(['التاريخ', 'الوقت', 'المنصة', 'النص'])
    expect(rows.slice(1)).toEqual([
      ['2099-03-01', '09:00', 'X', 'الأثر قبل المخرجات, دائمًا (الصيغة: سلسلة)'],
      ['2099-03-01', '10:30', 'LinkedIn', 'الأثر قبل المخرجات, دائمًا (الصيغة: مقال)'],
      ['2099-03-02', '11:00', 'LinkedIn', 'سؤال التمويل (الصيغة: منشور)'],
    ])
  })
  it('الجدولُ بعمود المنصّة يمرّ كما هو', () => {
    const csv = 'التاريخ,الوقت,المنصة,النص\n2099-03-01,09:00,X,نص'
    expect(widenPlan(csv)).toEqual({ csv, widened: false, platforms: [] })
  })
  it('رقمُ المادّة والملفُّ يمرّان مع كلّ منشورٍ من يومه، والصيغةُ شكلُه (D-363)', () => {
    const csv = [
      'التاريخ,رقم المادة,الملف,العنوان / الفكرة,X: الصيغة,X: الوقت,LinkedIn: الصيغة,LinkedIn: الوقت',
      '2099-03-01,01,04-media/01-افتتاح/,افتتاح,صورة + نص,09:00,فيديو مربع,10:00',
    ].join('\n')
    const rows = parseCsvRecords(widenPlan(csv).csv).map((r) => r.cells)
    expect(rows[0]).toEqual(['التاريخ', 'الوقت', 'المنصة', 'النص', 'رقم المادة', 'الملف', 'الشكل'])
    expect(rows[1]).toEqual(['2099-03-01', '09:00', 'X', 'افتتاح (الصيغة: صورة + نص)', '01', '04-media/01-افتتاح/', 'صورة + نص'])
    expect(rows[2]!.slice(4)).toEqual(['01', '04-media/01-افتتاح/', 'فيديو مربع'])
  })
})
