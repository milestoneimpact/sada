/** «عندي خطّة» (D-287): كلُّ صيغةٍ جدول، والناقصُ يُكمَّل ويُقال، والسليمُ يُسكَّن بندًا ومسوّدة، وما يمنعه يُسمّى. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { fillGaps, markdownTables, rowsFromModel, seatPlan, toTable } from './seat'
import type { PlanFacts } from './import'

let db: FakeDb
const NOW = new Date('2099-01-01T08:00:00Z')
const facts = (): PlanFacts => ({ accounts: [], uploads: [], now: NOW, zone: 'Asia/Riyadh', publishable: new Set(['linkedin', 'x']) })

beforeEach(() => { db = fakeDb() })

describe('جدولٌ من كلّ صيغة', () => {
  it('جدولُ Markdown من Excel يصير CSV بلا سطر الفاصل، والخانةُ ذاتُ الفاصلة مقتبسة', () => {
    expect(markdownTables('| التاريخ | الوقت | المنصة | النص |\n|---|---|---|---|\n| 2099-01-04 | 09:00 | LinkedIn | first, then second |'))
      .toEqual(['التاريخ,الوقت,المنصة,النص\n2099-01-04,09:00,LinkedIn,"first, then second"'])
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
    expect(items.map((i) => [i.sourceId, i.day, i.time])).toEqual([['import:2', '2099-01-04', '09:00'], ['import:3', '2099-01-06', '13:00']]) // ‏بتوقيت المالك كما في الملفّ (D-384)؛ كانت 06:00 و10:00 بـ UTC
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

/** ‏**إصدارٌ لا حذف** (D-383 المرحلة ٣): كلُّ تسكينٍ مهمّةُ استيراد، والبصمةُ نفسُها لا تغيّر شيئًا، والمدى نفسُه يُحدَّث في مكانه. */
describe('التسكينُ بمهمّة استيرادٍ وإصدار (D-383)', () => {
  const CSV = ['التاريخ,الوقت,المنصة,النص', '2099-01-04,09:00,LinkedIn,الأولى', '2099-01-06,13:00,X,الثانية'].join('\n')

  it('شهرٌ تحمله خطّةُ الحزمة: صفوفُ الملفّ تنزل فيها ولا تُنشأ خطّةٌ بلا شهر', async () => {
    db.raw.exec(`INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, period, source_kinds)
      VALUES ('plan_pkg_org_owner_2099-01', '2099-01', '{"items":[]}', 'package', 'draft', 'org_owner', 'month', '2099-01', '["github"]')`)
    db.raw.exec(`INSERT INTO plan_items (id, org_id, plan_id, item_key, platform, due_local, source_kind, package_item_no)
      VALUES ('pi_g', 'org_owner', 'plan_pkg_org_owner_2099-01', 'pkg:01', 'x', '2099-01-10 20:00', 'github', '01')`)
    const csv = ['التاريخ,الوقت,المنصة,النص', '2099-01-04,09:00,LinkedIn,الأولى', '2099-01-20,13:00,X,الثانية'].join('\n')
    const out = await seatPlan(db, 'org_owner', csv, facts(), new Map(), null)
    expect(out.planId).toBe('plan_pkg_org_owner_2099-01')
    expect(db.raw.prepare('SELECT count(*) AS n FROM plans').get()).toEqual({ n: 1 })
    expect(db.raw.prepare("SELECT model, period, source_kinds FROM plans").get()).toEqual({ model: 'package', period: '2099-01', source_kinds: '["github","csv"]' })
    expect(db.raw.prepare("SELECT source_kind FROM plan_items ORDER BY due_local").all()).toEqual([{ source_kind: 'csv' }, { source_kind: 'github' }, { source_kind: 'csv' }])
    expect(db.raw.prepare("SELECT count(*) AS n FROM posts WHERE plan_id = 'plan_pkg_org_owner_2099-01'").get()).toEqual({ n: 2 })
  })

  it('الملفُّ نفسُه مرّتين: مهمّةٌ واحدة وخطّةٌ واحدة، والثانيةُ «لا تغيير»', async () => {
    const first = await seatPlan(db, 'org_owner', CSV, facts(), new Map(), null)
    expect(first.seated).toBe(2)
    const again = await seatPlan(db, 'org_owner', CSV.split('\n').reverse().join('\n').replace(/^(.*)\n(.*)\n(.*)$/, '$3\n$2\n$1'), facts(), new Map(), null)
    expect(again).toMatchObject({ planId: null, seated: 0, unchanged: true })
    expect(db.raw.prepare('SELECT source_kind, status, plan_id, period FROM import_jobs').all()).toEqual([{ source_kind: 'csv', status: 'applied', plan_id: first.planId, period: '2099-01' }])
    expect(db.raw.prepare('SELECT count(*) AS n FROM plans').get()).toEqual({ n: 1 })
    expect(db.raw.prepare('SELECT item_key, due_local, source_kind FROM plan_items ORDER BY due_local').all()).toMatchObject([
      { due_local: '2099-01-04 09:00', source_kind: 'csv' }, { due_local: '2099-01-06 13:00', source_kind: 'csv' },
    ])
    // ‏والمسوّدةُ تشير إلى بندها، ومفتاحُ منع تكرارها مفتاحُ البند (D-004)
    expect(db.raw.prepare('SELECT count(*) AS n FROM posts p JOIN plan_items i ON i.id = p.plan_item_id AND i.item_key = p.idempotency_key').get()).toEqual({ n: 2 })
  })

  it('ملفٌّ معدَّلٌ للمدى نفسِه: الخطّةُ نفسُها بإصدارٍ أعلى لا حذفٌ وإدراج، وما ثُبّت منها محفوظ', async () => {
    const first = await seatPlan(db, 'org_owner', CSV, facts(), new Map(), null)
    db.raw.prepare("UPDATE plans SET locked_at = datetime('now'), status = 'approved'").run()
    const changed = await seatPlan(db, 'org_owner', CSV + '\n2099-01-07,13:00,X,الثالثة', facts(), new Map(), null, null, false, { kind: 'text' })
    expect(changed.planId).toBe(first.planId)
    // ‏الصفّان اللذان لم يتغيّرا باقيان في الخطّة بمنشورَيهما (D-404)، والثالثُ جديد
    expect(changed).toMatchObject({ seated: 3, kept: 2, updated: 0 })
    expect(db.raw.prepare('SELECT count(*) AS n FROM plans').get()).toEqual({ n: 1 })
    expect(db.raw.prepare('SELECT version, status, locked_at, source_kinds FROM plans').get()).toEqual({ version: 2, status: 'draft', locked_at: null, source_kinds: '["text"]' })
    const snap = db.raw.prepare('SELECT version, plan_json, import_job_id FROM plan_versions').all() as { version: number; plan_json: string; import_job_id: string | null }[]
    expect(snap.map((v) => v.version)).toEqual([1])
    expect((JSON.parse(snap[0]!.plan_json) as { items: unknown[] }).items).toHaveLength(2)
    expect(snap[0]!.import_job_id).not.toBeNull()
    expect(db.raw.prepare('SELECT count(*) AS n FROM import_jobs').get()).toEqual({ n: 2 })
    // ‏ولا تُفصَل مسوّداتُ الصفوف الباقية عن خطّتها (D-404) — كانت تُفرَغ إشارتُها فتختفي
    expect(db.raw.prepare('SELECT count(*) AS n FROM posts WHERE plan_id IS NULL').get()).toEqual({ n: 0 })
    expect(db.raw.prepare('SELECT count(*) AS n FROM plan_items').get()).toEqual({ n: 3 })
    expect(db.raw.prepare('SELECT count(*) AS n FROM posts p JOIN plan_items i ON i.id = p.plan_item_id').get()).toEqual({ n: 3 })
  })
})

/** ‏**إعادةُ استيراد خطّةٍ معدَّلة تحميها** (D-404): ما لم يتغيّر يبقى، وما عُدّل يُحدَّث، وما جُدول أو نُشر لا يُفصَل ولا يُعاد نشره. */
describe('إعادةُ الاستيراد تحمي الخطّة (D-404)', () => {
  const A = '2099-01-04,09:00,LinkedIn,الأولى كما هي'
  const B = '2099-01-05,13:00,X,الثانية قبل التعديل'
  const C = '2099-01-06,13:00,X,الثالثة تُجدوَل'
  const HEAD = 'التاريخ,الوقت,المنصة,النص'
  const posts = () => db.raw.prepare('SELECT id, text, status, plan_id, plan_item_id, idempotency_key FROM posts ORDER BY text').all() as
    { id: string; text: string; status: string; plan_id: string | null; plan_item_id: string | null; idempotency_key: string }[]

  it('الصفُّ الذي لم يتغيّر يبقى بندُه ومنشورُه بمعرّفهما، والمعدَّلُ تُحدَّث مسوّدتُه في مكانها', async () => {
    const first = await seatPlan(db, 'org_owner', [HEAD, A, B].join('\n'), facts(), new Map(), null)
    const before = posts()
    const itemsBefore = db.raw.prepare('SELECT id FROM plan_items ORDER BY due_local').all()
    const again = await seatPlan(db, 'org_owner', [HEAD, A, B.replace('قبل التعديل', 'بعد التعديل')].join('\n'), facts(), new Map(), null)
    expect(again).toMatchObject({ planId: first.planId, seated: 2, kept: 1, updated: 1, skipped: [] })
    const after = posts()
    expect(after).toHaveLength(2)
    expect(after.map((p) => p.id).sort()).toEqual(before.map((p) => p.id).sort())
    expect(after.every((p) => p.plan_id === first.planId && p.plan_item_id !== null)).toBe(true)
    expect(after.find((p) => p.text === 'الأولى كما هي')!.idempotency_key).toBe(before.find((p) => p.text === 'الأولى كما هي')!.idempotency_key)
    const edited = after.find((p) => p.text === 'الثانية بعد التعديل')!
    expect(edited.idempotency_key).not.toBe(before.find((p) => p.text === 'الثانية قبل التعديل')!.idempotency_key)
    expect(db.raw.prepare('SELECT id FROM plan_items ORDER BY due_local').all()).toEqual(itemsBefore)
    expect(db.raw.prepare('SELECT copy FROM plan_items ORDER BY due_local').all()).toEqual([{ copy: 'الأولى كما هي' }, { copy: 'الثانية بعد التعديل' }])
  })

  it('المجدولُ والمنشورُ يبقيان على خطّتهما ولو غاب صفُّهما أو عُدّل، ولا يُكتب منشورٌ ثانٍ لهما', async () => {
    const first = await seatPlan(db, 'org_owner', [HEAD, A, B, C].join('\n'), facts(), new Map(), null)
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('ax', 'x', 'member', 'e1', 'عمر', 'active')`)
    db.raw.prepare("UPDATE posts SET status = 'queued', approved_at = '2099-01-01 08:00:00', approved_by = 'owner', account_id = 'ax', scheduled_at = '2099-01-06 10:00:00' WHERE text = 'الثالثة تُجدوَل'").run()
    db.raw.prepare("UPDATE posts SET status = 'published', approved_at = '2099-01-01 08:00:00', approved_by = 'owner', account_id = 'ax', scheduled_at = '2099-01-05 10:00:00' WHERE text = 'الثانية قبل التعديل'").run()
    const before = posts()
    // ‏الثانيةُ عُدّل نصُّها، والثالثةُ حُذفت من الملفّ
    const again = await seatPlan(db, 'org_owner', [HEAD, A, B.replace('قبل التعديل', 'بعد التعديل')].join('\n'), facts(), new Map(), null)
    expect(again.planId).toBe(first.planId)
    expect(again.skipped).toEqual([{ line: 3, reason: expect.stringContaining('عدّله من بطاقته') }])
    const after = posts()
    expect(after).toEqual(before)
    expect(after.every((p) => p.plan_id === first.planId)).toBe(true)
    // ‏وبنداهما باقيان فيراهما الشهرُ والخطّة
    const linked = db.raw.prepare('SELECT count(*) AS n FROM posts p JOIN plan_items i ON i.id = p.plan_item_id WHERE p.status IN (\'queued\', \'published\')').get()
    expect(linked).toEqual({ n: 2 })
    const plan = db.raw.prepare('SELECT plan_json FROM plans').get() as { plan_json: string }
    expect((JSON.parse(plan.plan_json) as { items: unknown[] }).items).toHaveLength(3)
  })

  it('صورةُ الإصدار السابق تُحفظ قبل كلّ استبدال ولو لم يُثبَّت', async () => {
    await seatPlan(db, 'org_owner', [HEAD, A].join('\n'), facts(), new Map(), null)
    expect(db.raw.prepare('SELECT count(*) AS n FROM plan_versions').get()).toEqual({ n: 0 })
    await seatPlan(db, 'org_owner', [HEAD, A, B].join('\n'), facts(), new Map(), null)
    const snap = db.raw.prepare('SELECT version, plan_json FROM plan_versions').all() as { version: number; plan_json: string }[]
    expect(snap.map((v) => v.version)).toEqual([1])
    expect((JSON.parse(snap[0]!.plan_json) as { items: unknown[] }).items).toHaveLength(1)
  })
})
