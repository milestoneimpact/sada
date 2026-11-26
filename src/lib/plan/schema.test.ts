/** فحصُ ملفّ الخطّة (D-408): القارئُ نفسُه، والمخطّطُ في `docs/` مطابق، وتنبيهاتُ الدليل بالعربيّة. */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkPlanFile, PLAN_SCHEMA } from './schema'
import { renderTemplate, weekRows } from './template'

describe('checkPlanFile', () => {
  it('المخطّطُ في docs/plan.schema.json هو PLAN_SCHEMA نفسُه', () => {
    expect(JSON.parse(readFileSync('docs/plan.schema.json', 'utf8'))).toEqual(JSON.parse(JSON.stringify(PLAN_SCHEMA)))
  })

  it('قالبُ أسبوعٍ معبّأٌ يسلم بصيغتيه', () => {
    const rows = weekRows('2026-12-06').map((r, i) => ({ ...r, text: `منشور ${i}` }))
    for (const f of ['md', 'csv'] as const) {
      const r = checkPlanFile('week.' + f, renderTemplate('2026-12-06', f, rows))
      expect(r.lines).toEqual([])
      expect(r.ok).toBe(true)
      expect(r.rows).toBe(rows.length)
    }
  })

  it('أخطاءُ القارئ بسطرها وعمودها، والشهرُ من اسم الملفّ', () => {
    const md = renderTemplate('2026-12', 'md', [{ day: '2027-01-02', time: '25:00', platform: 'x', text: 'أ', media: '', note: '' }])
    const r = checkPlanFile('plans/2026-12.md', md)
    expect(r.ok).toBe(false)
    expect(r.lines.join('\n')).toMatch(/السطر 7، العمود «اليوم»: 2027-01-02 خارج شهر الملفّ 2026-12/)
    expect(r.lines.join('\n')).toMatch(/العمود «الساعة»: «25:00» ليست ساعة/)
  })

  it('التكرارُ والوسومُ والأسعارُ تُنبَّه', () => {
    const json = JSON.stringify([
      { day: '2026-12-06', time: '09:00', platform: 'linkedin', text: 'نصٌّ واحد' },
      { day: '2026-12-07', time: '09:00', platform: 'linkedin', text: 'نصٌّ  واحد' },
      { day: '2026-12-07', time: '20:00', platform: 'x', text: '#أ #ب #ج #د' },
      { day: '2026-12-08', time: '20:00', platform: 'x', text: 'الباقة بـ 99 ريال' },
    ])
    const r = checkPlanFile('plan.json', json)
    expect(r.ok).toBe(false)
    expect(r.lines).toEqual([
      'الصفّ 2، العمود «النص»: يكرّر نصَّ الصفّ 1 على المنصّة نفسِها',
      'الصفّ 3، العمود «النص»: 4 وسومٍ والحدّ 3',
      'الصفّ 4، العمود «النص»: فيه سعرٌ أو مبلغ — الأسعارُ لا تُكتب في الخطّة',
    ])
  })

  it('‏JSON معطوبٌ أو حقلٌ غريب أو ملفٌّ بلا نصّ: سطرٌ عربيّ واحد', () => {
    expect(checkPlanFile('a.json', '{').lines[0]).toMatch(/^ليس JSON صالحًا/)
    expect(checkPlanFile('a.json', '[{"day":"2026-12-06","price":"1"}]').lines).toEqual(['الصفّ 1: حقولٌ لا يعرفها القالب: price'])
    expect(checkPlanFile('w.md', renderTemplate('2026-12-06', 'md', weekRows('2026-12-06'))).lines).toEqual(['لا صفَّ بنصّ — الملفّ لا يحمل منشورًا'])
  })
})
