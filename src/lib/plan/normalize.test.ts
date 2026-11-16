/** المُطبِّعُ الواحد (D-383 المرحلة ٣): البصمةُ نفسُها تعني لا تغيير، والشهرُ من التواريخ. */
import { describe, expect, it } from 'vitest'
import { readPlan, type PlanFacts } from './import'
import { normalizeImport } from './normalize'

const NOW = new Date('2099-01-01T08:00:00Z')
const facts = (): PlanFacts => ({ accounts: [], uploads: [], now: NOW, zone: 'Asia/Riyadh', publishable: new Set(['linkedin', 'x']) })
const rows = (csv: string) => readPlan(csv, facts()).rows.filter((r) => r.whenUtc !== null)

describe('normalizeImport', () => {
  const A = ['التاريخ,الوقت,المنصة,النص', '2099-01-04,09:00,LinkedIn,الأولى', '2099-02-06,13:00,X,الثانية'].join('\n')

  it('ترتيبُ السطور وصيغةُ التاريخ لا يغيّران البصمة، وتغييرُ النصّ يغيّرها', async () => {
    const a = await normalizeImport(rows(A), 'draft')
    const reordered = await normalizeImport(rows(['التاريخ,الوقت,المنصة,النص', '2099-02-06,13:00,X,الثانية', '2099-1-4,9:00,LinkedIn,الأولى'].join('\n')), 'draft')
    expect(reordered.contentHash).toBe(a.contentHash)
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/)
    const edited = await normalizeImport(rows(A.replace('الثانية', 'الثانية معدّلة')), 'draft')
    expect(edited.contentHash).not.toBe(a.contentHash)
    // ‏والفكرةُ غيرُ المسوّدة: الملفُّ نفسُه بنوع تسكينٍ آخر استيرادٌ آخر
    expect((await normalizeImport(rows(A), 'idea')).contentHash).not.toBe(a.contentHash)
  })

  it('الشهرُ من التواريخ المحلّيّة، والموعدُ المحلّيّ كما كُتب', async () => {
    const a = await normalizeImport(rows(A), 'draft')
    expect(a.periods).toEqual(['2099-01', '2099-02'])
    expect(a.items.map((i) => [i.dueLocal, i.period])).toEqual([['2099-01-04 09:00', '2099-01'], ['2099-02-06 13:00', '2099-02']])
    expect(a.items[0]!.key).toMatch(/^plan:[0-9a-f]{32}$/)
  })
})
