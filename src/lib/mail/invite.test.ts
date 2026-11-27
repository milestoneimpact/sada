import { describe, expect, it } from 'vitest'
import { inviteMail } from './invite'

describe('بريد الدعوة (D-442)', () => {
  const m = inviteMail({ by: 'owner@x.com', role: 'viewer', spaces: ['متجر النخيل'], base: 'https://sada.basserh.com' })
  it('يقول من دعا وإلى أيّ مساحة', () => {
    expect(m.text).toContain('owner@x.com')
    expect(m.text).toContain('«متجر النخيل»')
    expect(m.subject).toContain('متجر النخيل')
  })
  it('يشرح دور «قارئ»', () => { expect(m.text).toContain('«قارئ»: يرى ولا يغيّر شيئًا') })
  it('الرابطُ في سطرٍ مستقلّ', () => { expect(m.text.split('\n')).toContain('https://sada.basserh.com/panel') })
  it('يذكر مدّة الصلاحية', () => { expect(m.text).toContain('10 دقائق') })
})
