/** «عندي خطّة» (D-287): كلُّ صيغةٍ جدول، والناقصُ يُكمَّل ويُقال، والسليمُ يُسكَّن بندًا ومسوّدة، وما يمنعه يُسمّى. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { fillGaps, markdownTableToCsv, rowsFromModel, seatPlan, toTable } from './seat'
import type { PlanFacts } from './import'

let db: FakeDb
const NOW = new Date('2099-01-01T08:00:00Z')
const facts = (): PlanFacts => ({ accounts: [], uploads: [], now: NOW, zone: 'Asia/Riyadh', publishable: new Set(['linkedin', 'x']) })

beforeEach(() => { db = fakeDb() })

describe('جدولٌ من كلّ صيغة', () => {
  it('جدولُ Markdown من Excel يصير CSV بلا سطر الفاصل، والخانةُ ذاتُ الفاصلة مقتبسة', () => {
    expect(markdownTableToCsv('| التاريخ | الوقت | المنصة | النص |\n|---|---|---|---|\n| 2099-01-04 | 09:00 | LinkedIn | first, then second |'))
      .toBe('التاريخ,الوقت,المنصة,النص\n2099-01-04,09:00,LinkedIn,"first, then second"')
  })
  it('جوابُ النموذج يُقرأ متسامحًا: سياجٌ ونصٌّ حوله، والصفُّ بلا نصٍّ يُسقَط', () => {
    expect(rowsFromModel('```json\n{"rows":[{"date":"2099-01-04","time":null,"platform":"x","text":"نص"},{"text":""}]}\n```'))
      .toEqual([{ date: '2099-01-04', time: '', platform: 'x', text: 'نص' }])
    expect(rowsFromModel('لا شيء')).toEqual([])
  })
  it('CSV كما هو بلا كلفة، وصيغةٌ لا تُقرأ تُردّ، وPDF بلا قارئٍ يُقال بسببه', async () => {
    const deps = { db, writer: { db, encKey: '', workerSecrets: {} } }
    expect(await toTable(deps, { name: 'خطة.csv', bytes: new TextEncoder().encode('a,b') })).toEqual({ kind: 'table', csv: 'a,b', cost: 0, via: 'csv' })
    expect(await toTable(deps, { name: 'خطة.exe', bytes: new Uint8Array([1]) })).toMatchObject({ kind: 'error' })
    expect(await toTable(deps, { name: 'خطة.pdf', bytes: new Uint8Array([1]) })).toMatchObject({ kind: 'error', reason: expect.stringContaining('Workers AI') })
  })
})

describe('الناقصُ يُكمَّل ويُقال', () => {
  it('يومٌ فارغٌ يلي ما قبله، وساعةٌ فارغةٌ افتراضُ المنصّة، والخانةُ المقتبسةُ لا تُشَقّ', async () => {
    const csv = 'التاريخ,الوقت,المنصة,النص\n2099-01-05,,LinkedIn,"text, with comma"\n,10:00,X,ثانٍ'
    const out = await fillGaps(db, 'org_owner', csv, '2099-01-04', 'Asia/Riyadh')
    expect(out.csv).toBe('التاريخ,الوقت,المنصة,النص\n2099-01-05,09:00,LinkedIn,"text, with comma"\n2099-01-06,10:00,X,ثانٍ')
    expect([...out.filled.entries()]).toEqual([[2, 'الساعةُ أرجحُ ساعات المنصّة'], [3, 'اليومُ من صدى']])
  })
})

describe('التسكين', () => {
  const CSV = [
    'التاريخ,الوقت,المنصة,النص',
    '2099-01-04,09:00,LinkedIn,قيادةُ القيمة لا تُقاس بالمخرجات بل بالمعالم، وثلاثةُ أرقامٍ من تقرير الأثر.',
    '2099-01-06,13:00,X,سؤالٌ واحد قبل أيّ تمويل: ما الأثرُ الذي تقيسه؟',
    '2099-01-07,13:00,Mastodon,منصّةٌ لا يعرفها صدى',
    '2020-01-01,13:00,X,موعدٌ مضى',
  ].join('\n')

  it('السليمُ بندٌ ومسوّدةٌ بنصّه في خطّةٍ بأصغر مدًى يحمله، وما يمنعه يُسمّى بسطره — ولا يُجدوَل شيء', async () => {
    const out = await seatPlan(db, 'org_owner', CSV, facts(), new Map([[3, 'الساعةُ أرجحُ ساعات المنصّة']]), null)
    expect(out.seated).toBe(2)
    expect(out.skipped.map((s) => s.line)).toEqual([4, 5])
    const plan = db.raw.prepare("SELECT week_start, span, model, status, plan_json FROM plans").get() as { week_start: string; span: string; model: string; status: string; plan_json: string }
    expect(plan).toMatchObject({ week_start: '2099-01-04', span: 'week', model: 'import', status: 'draft' })
    const items = (JSON.parse(plan.plan_json) as { items: { sourceId: string; day: string; time: string; note?: string }[] }).items
    expect(items.map((i) => [i.sourceId, i.day, i.time])).toEqual([['import:2', '2099-01-04', '06:00'], ['import:3', '2099-01-06', '10:00']])
    expect(items[1]!.note).toContain('الساعةُ أرجحُ ساعات المنصّة')
    expect(db.raw.prepare("SELECT status, source_refs FROM posts ORDER BY source_refs").all()).toEqual([
      { status: 'draft', source_refs: '["import:2"]' }, { status: 'draft', source_refs: '["import:3"]' },
    ])
    // ‏والملفُّ نفسُه مرّتين لا يصنع مسوّداتٍ مكرّرة
    const again = await seatPlan(db, 'org_owner', CSV, facts(), new Map(), null)
    expect(again.seated).toBe(0)
    expect(again.skipped.filter((s) => s.reason === 'مُسكَّنٌ من قبل')).toHaveLength(2)
  })
})

/** ‏**وسلسلةُ X في خطّةٍ مرفوعة** (D-324): بندُها `thread` ومسوّدتُها بنوعها، كما يكتبهما الموجّهُ و«اعتمد». */
describe('سلسلة X تُسكَّن بنوعها (D-324)', () => {
  it('نصُّ X بسطر --- بندٌ thread ومسوّدةٌ thread، وتغريدةٌ واحدة text', async () => {
    const csv = [
      'التاريخ,الوقت,المنصة,النص',
      '2099-01-04,09:00,X,"الأولى من السلسلة.\n---\nالثانية تردّ عليها."',
      '2099-01-05,09:00,X,تغريدة واحدة بلا فاصل',
    ].join('\n')
    const out = await seatPlan(db, 'org_owner', csv, facts(), new Map(), null)
    expect(out.seated).toBe(2)
    const plan = db.raw.prepare('SELECT plan_json FROM plans').get() as { plan_json: string }
    expect((JSON.parse(plan.plan_json) as { items: { kind: string }[] }).items.map((i) => i.kind)).toEqual(['thread', 'text'])
    expect(db.raw.prepare('SELECT type FROM posts ORDER BY source_refs').all()).toEqual([{ type: 'thread' }, { type: 'text' }])
  })
})
