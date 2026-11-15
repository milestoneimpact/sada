import { describe, expect, it } from 'vitest'
import { readGuidelines } from './guidelines'
import { markdownTables } from './seat'

const SHEET = [
  'البند,X,LinkedIn',
  'الدور,شرارة سريعة وفكرة واحدة,عمق مهني ومصداقية',
  'الوقت,8:00 مساءً,9:00 صباحًا',
  'الطول,تغريدة أو سلسلة 4–7,150–250 كلمة',
  '"الممنوعات","الأسعار، التدقيقات، أرقام أثر غير موثّقة","نفسها"',
  'الهوية,تناوب النسخة الداكنة والفاتحة,نفس التناوب',
].join('\n')

describe('ورقةُ الإرشادات', () => {
  it('البندُ × المنصّة قواعدُ لكلّ منصّة، و«نفسها» تأخذ ما في الأولى', () => {
    const r = readGuidelines(SHEET)!
    expect(Object.keys(r)).toEqual(['X', 'LinkedIn'])
    expect(r['LinkedIn']).toContainEqual({ item: 'الطول', value: '150–250 كلمة' })
    expect(r['LinkedIn']).toContainEqual({ item: 'الممنوعات', value: 'الأسعار، التدقيقات، أرقام أثر غير موثّقة' })
    expect(r['LinkedIn']).toContainEqual({ item: 'الهوية', value: 'تناوب النسخة الداكنة والفاتحة' })
    expect(r['X']).toContainEqual({ item: 'الدور', value: 'شرارة سريعة وفكرة واحدة' })
  })
  it('جدولٌ بلا أعمدة منصّاتٍ ليس إرشادات', () => {
    expect(readGuidelines('التاريخ,الوقت,المنصة,النص\n2099-01-01,09:00,X,نص')).toBeNull()
  })
  it('كلُّ ورقةٍ جدولٌ على حدة، فلا تصير الإرشاداتُ منشورات', () => {
    const md = '## خطة الشهر\n| التاريخ | النص |\n|---|---|\n| 2099-01-01 | أ |\n\n## الإرشادات\n| البند | X |\n|---|---|\n| الدور | شرارة |'
    expect(markdownTables(md)).toEqual(['التاريخ,النص\n2099-01-01,أ', 'البند,X\nالدور,شرارة'])
  })
})

describe('«هذا ما فهمته» بقواعد الإرشادات', async () => {
  const { planPreviewScreen } = await import('../../routes/ui/planPreviewView')
  it('تُعرض القواعدُ لكلّ منصّة فوق الصفوف', () => {
    const page = planPreviewScreen({ key: 'k', csv: 'التاريخ,الوقت,المنصة,النص\n2099-01-01,09:00,X,أ', filled: {}, via: 'sheet', widened: true, cost: 0, rules: readGuidelines(SHEET) })
    expect(page).toContain('قواعد الكتابة من ورقة الإرشادات')
    expect(page).toContain('150–250 كلمة')
    expect(page.indexOf('قواعد الكتابة')).toBeLessThan(page.indexOf('الصفوف'))
  })
})
