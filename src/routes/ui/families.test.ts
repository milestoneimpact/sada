/** عائلاتُ الشاشات (D-342): كلُّ عضوٍ يرسم شريطَ عائلته بالترتيب نفسِه، والحاليُّ واحد. */
import { describe, expect, it } from 'vitest'
import { FAMILIES, familyTabs } from './families'
import { LATER_LABEL } from './tasksView'
import { TASKS_LATER, TASKS_PAGE } from '../../lib/owner'

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

  /** ‏و«تفتح قدرة» أختُ «المهامّ» بعدها، واسمُ لسانها اسمُ رأسها (دمجُ متابعة D-324 على main): لا يُستورَد هناك، فيُطابَق هنا. */
  it('«تفتح قدرة» في عائلة «ما عليك» بعد «المهامّ»، باسم رأسها', () => {
    const todo = FAMILIES['todo']!.members
    const at = todo.findIndex((m) => m.href === TASKS_LATER)
    expect(todo[at - 1]?.href).toBe(TASKS_PAGE)
    expect(todo[at]?.label).toBe(LATER_LABEL)
  })

  it('لا عنوانَ في عائلتين: الشريطُ لا يحتار', () => {
    const all = Object.values(FAMILIES).flatMap((f) => f.members.map((m) => m.href))
    expect(new Set(all).size).toBe(all.length)
  })
})
