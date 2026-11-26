/**
 * قالبُ الخطّة الشهريّة (D-390): يُولَّد بأيّام الشهر، ويُقرأ ذهابًا وإيابًا بالقارئ القائم (`readPlan` وقارئ الحزمة)،
 * وأخطاؤه بالسطر والعمود بالعربيّة.
 */
import { describe, expect, it } from 'vitest'
import { issueText, looksMarkdown, markdownToCsv, monthRows, readTemplate, renderTemplate, templateReadme, type TemplateRow } from './template'
import { readPlan, type PlanFacts } from './import'
import { normalizeImport } from './normalize'
import { mergeMonthPlans, planFiles, planFromTemplate } from '../package/plan'
import { classifyPath } from '../package/classify'
import { snapshot } from '../package/diff'
import { toTable } from './seat'

const facts: PlanFacts = {
  accounts: [
    { id: 'a-li', platform: 'linkedin', status: 'active', displayName: 'ل', externalId: 'urn:li:person:1', kind: 'member' } as never,
    { id: 'a-x', platform: 'x', status: 'active', displayName: 'س', externalId: '1', kind: 'member' } as never,
  ],
  uploads: [], now: new Date('2026-11-24T00:00:00Z'), zone: 'Asia/Riyadh', publishable: new Set(['linkedin', 'x']),
}

const filled = (period: string): TemplateRow[] => monthRows(period).map((r, i) => (i % 3 === 0 ? { ...r, text: `منشور ${i} | فيه «اقتباس» و"علامة"، وفاصلة`, media: i === 0 ? 'media/a.png' : '' } : r))

describe('توليدُ القالب', () => {
  it('ديسمبر: كلُّ يومٍ X مساءً، وأيّامُ العمل LinkedIn صباحًا، والنصُّ فارغ', () => {
    const rows = monthRows('2026-12')
    expect(new Set(rows.map((r) => r.day)).size).toBe(31)
    expect(rows.filter((r) => r.platform === 'x').every((r) => r.time === '20:00')).toBe(true)
    // ‏1 ديسمبر 2026 ثلاثاء، و4 ديسمبر جمعة: لا LinkedIn
    expect(rows.filter((r) => r.day === '2026-12-01').map((r) => r.platform)).toEqual(['linkedin', 'x'])
    expect(rows.filter((r) => r.day === '2026-12-04').map((r) => r.platform)).toEqual(['x'])
    expect(rows.every((r) => r.text === '')).toBe(true)
    expect(monthRows('2027-02')).toHaveLength(28 + 20)
    const md = renderTemplate('2026-12', 'md')
    expect(looksMarkdown(md)).toBe(true)
    expect(md).toContain('| اليوم | الساعة | المنصة | النص | الملف | ملاحظة |')
    expect(templateReadme()).toMatch(/plans\/YYYY-MM\.md/)
  })

  it('القالبُ الفارغ يُقرأ بلا خطأ، وكلُّ صفوفه «تُركت»', () => {
    const r = readTemplate(renderTemplate('2026-12', 'md'), 'md', '2026-12')
    expect(r.issues).toEqual([])
    expect(r.rows).toEqual([])
    expect(r.skipped).toBe(monthRows('2026-12').length)
  })
})

describe('ذهابًا وإيابًا', () => {
  for (const format of ['md', 'csv'] as const) {
    it(`${format}: الصفوفُ المملوءة تعود كما كُتبت، بالقالب وبالقارئ القائم`, async () => {
      const rows = filled('2026-12')
      const text = renderTemplate('2026-12', format, rows)
      const back = readTemplate(text, format, '2026-12')
      expect(back.issues).toEqual([])
      const want = rows.filter((r) => r.text !== '')
      expect(back.rows.map(({ line: _l, ...r }) => r)).toEqual(want)
      // ‏والقارئُ القائم (`readPlan`) يقرؤه كما هو: الجدولُ CSV بأرقام سطوره
      const csv = format === 'md' ? markdownToCsv(text) : text
      const read = readPlan(csv, facts)
      expect(read.fileProblems).toEqual([])
      const used = read.rows.filter((r) => r.text !== '')
      expect(used.map((r) => [r.local, r.platform, r.text])).toEqual(want.map((r) => [`${r.day} ${r.time}`, r.platform, r.text]))
      expect(used.every((r) => r.problems.length === 0)).toBe(true)
      expect(used[0]!.mediaHint).toBe('media/a.png')
      const n = await normalizeImport(used, 'draft')
      expect(n.periods).toEqual(['2026-12'])
      // ‏وأرقامُ السطور هي سطورُ الملفّ نفسِه
      const lines = text.replace(/^﻿/, '').split(/\r?\n/)
      for (const r of back.rows) expect(lines[r.line - 1]).toContain(r.day)
    })
  }

  it('قارئُ الحزمة: `plans/YYYY-MM.md` خطّةٌ يغلب xlsx شهرِه، وملفُّ الحال ليس منها، والنصُّ يدخل اللقطة', () => {
    expect(classifyPath('plans/2026-12.md').role).toBe('plan')
    expect(classifyPath('plans/2026-12.csv').role).toBe('plan')
    expect(classifyPath('plans/2026-12.status.json').role).toBe('ignored')
    expect(classifyPath('plans/README.md').role).toBe('ignored')
    expect(planFiles(['01-plan/dec-v3.xlsx', 'plans/2026-12.csv', 'plans/2026-12.md', 'plans/2026-12.status.json']))
      .toEqual(['plans/2026-12.md', 'plans/2026-12.csv', '01-plan/dec-v3.xlsx'])
    const plan = planFromTemplate(renderTemplate('2026-12', 'md', filled('2026-12')), 'plans/2026-12.md')
    expect(plan.problems).toEqual([])
    const m = mergeMonthPlans([{ path: 'plans/2026-12.md', plan }])
    expect(m.files).toEqual({ '2026-12': 'plans/2026-12.md' })
    const snap = snapshot({ plan: m.plan, copy: { items: new Map(), unparsed: [] } as never, copySha: null, planPath: 'plans/2026-12.md', picks: [], variants: {} })
    expect(snap.entries.length).toBe(plan.entries.length)
    expect(snap.entries.every((e) => e.text !== null && e.text.startsWith('منشور'))).toBe(true)
    expect(new Set(snap.entries.map((e) => e.item + e.platform)).size).toBe(snap.entries.length)
    expect(snap.entries[0]!.item).toMatch(/^d\d{2}(-\d+)?$/)
  })
})

describe('أخطاءٌ بالسطر والعمود', () => {
  const md = [
    '# خطّة 2026-12',
    '',
    '| اليوم | الساعة | المنصة | النص | الملف | ملاحظة |',
    '|---|---|---|---|---|---|',
    '| 2026-12-01 | 09:00 | linkedin | سليم | | |',
    '| 2026-12-02 | 25:00 | x | ساعة خاطئة | | |',
    '| 2026-13-02 | 09:00 | x | تاريخ خاطئ | | |',
    '| 2027-01-02 | 09:00 | x | خارج الشهر | | |',
    '| 2026-12-03 | 09:00 | فيسبوك | منصّة | | |',
    `| 2026-12-04 | 20:00 | x | ${'ط'.repeat(300)} | | |`,
    '| 2026-12-05 | 20:00 | x |  | | يُترك |',
  ].join('\n')

  it('كلُّ خطأٍ بسطره في الملفّ وعموده بالعربيّة، والصفُّ بلا نصٍّ يُترك بلا خطأ', () => {
    const r = readTemplate(md, 'md', '2026-12')
    expect(r.rows.map((x) => x.line)).toEqual([5])
    expect(r.skipped).toBe(1)
    expect(r.issues.map(issueText)).toEqual([
      'السطر 6، العمود «الساعة»: «25:00» ليست ساعة — اكتبها مثل 09:30 بتوقيتك',
      'السطر 7، العمود «اليوم»: «2026-13-02» ليس تاريخًا — اكتبه مثل 2026-12-03',
      'السطر 8، العمود «اليوم»: 2027-01-02 خارج شهر الملفّ 2026-12',
      'السطر 9، العمود «المنصة»: «فيسبوك» لا أعرفها — linkedin أو linkedin-page أو x',
      'السطر 10، العمود «النص»: 300 محرفًا وX تقبل 280',
    ])
  })

  it('عمودٌ ناقص يُقال بسطر العنوان', () => {
    const r = readTemplate('| اليوم | الساعة | النص |\n|---|---|---|\n| 2026-12-01 | 09:00 | س |', 'md')
    expect(r.issues.map(issueText)).toEqual(['السطر 1: أعمدة ناقصة في العنوان: المنصة'])
  })

  it('«من ملفّ»: القالبُ md يُقرأ بلا نموذجٍ ولا كلفة، والخاطئُ يُردّ بأخطائه قبل المعاينة', async () => {
    const deps = { db: null as never, writer: null as never }
    const bad = await toTable(deps, { name: '2026-12.md', bytes: new TextEncoder().encode(md) })
    expect(bad.kind).toBe('error')
    expect(bad.kind === 'error' && bad.reason).toContain('السطر 6، العمود «الساعة»')
    const good = await toTable(deps, { name: '2026-12.md', bytes: new TextEncoder().encode(renderTemplate('2026-12', 'md', filled('2026-12'))) })
    expect(good.kind === 'table' && good.cost).toBe(0)
    const csv = await toTable(deps, { name: '2026-12.csv', bytes: new TextEncoder().encode(renderTemplate('2026-12', 'csv', filled('2026-12'))) })
    expect(csv.kind).toBe('table')
  })
})

describe('قالبا الأسبوع واليوم (D-408)', () => {
  it('الأسبوع سبعةُ أيّامٍ متتالية تعبر الشهر، وLinkedIn أيّامَ العمل وحدها', async () => {
    const { weekRows, dayRows, nextSunday, addDays } = await import('./template')
    const rows = weekRows('2026-12-27')
    expect([...new Set(rows.map((r) => r.day))]).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(rows.filter((r) => r.platform === 'linkedin').length).toBe(5)
    expect(dayRows('2026-12-04').map((r) => r.platform)).toEqual(['x'])
    expect(nextSunday('2026-11-26')).toBe('2026-11-29')
    expect(nextSunday('2026-11-29')).toBe('2026-12-06')
    expect(addDays('2026-02-30', 0)).not.toBe('2026-02-30')
    expect(renderTemplate('2026-12-27', 'md', rows, 'خطّة أسبوع 2026-12-27')).toMatch(/^# خطّة أسبوع 2026-12-27/)
    const { shortTemplate } = await import('./template')
    const w = shortTemplate('week', '2026-12-27', 'md')
    expect(w.name).toBe('week-2026-12-27.md')
    expect(w.body).toMatch(/^# خطّة أسبوع 2026-12-27/)
    const d = shortTemplate('day', '2026-12-04', 'csv')
    expect(d.name).toBe('day-2026-12-04.csv')
    expect(readTemplate(d.body, 'csv').issues).toEqual([])
  })
  it('README يذكر دليلَ الوكيل وفحصَ الملفّ', () => {
    expect(templateReadme()).toMatch(/PLAN-AGENT-GUIDE\.md/)
    expect(templateReadme()).toMatch(/يعبر حدَّ شهرين يُقسَم على ملفّين/)
    expect(templateReadme()).toMatch(/npm run plan:check/)
  })
})
