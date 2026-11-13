/** عائلاتُ الشاشات (D-342): كلُّ عضوٍ يرسم شريطَ عائلته بالترتيب نفسِه، والحاليُّ واحد. */
import { describe, expect, it } from 'vitest'
import { FAMILIES, familyTabs } from './families'

describe('عائلاتُ الشاشات (D-342)', () => {
  it('كلُّ عضوٍ يرسم أخواتِه كلَّهنّ وحاليًّا واحدًا هو هو — وشاشةٌ بلا عائلةٍ بلا شريط', () => {
    for (const family of Object.values(FAMILIES)) {
      for (const member of family.members) {
        const strip = familyTabs(member.href)
        for (const other of family.members) expect(strip).toContain('href="' + other.href + '"')
        expect((strip.match(/aria-current="page"/g) ?? []).length).toBe(1)
        expect(strip).toContain('href="' + member.href + '" aria-current="page"')
      }
    }
    expect(familyTabs('/panel/accounts')).toBe('')
  })

  it('لا عنوانَ في عائلتين: الشريطُ لا يحتار', () => {
    const all = Object.values(FAMILIES).flatMap((f) => f.members.map((m) => m.href))
    expect(new Set(all).size).toBe(all.length)
  })
})
