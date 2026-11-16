/**
 * الحزمةُ محوِّلٌ إلى خطّة الشهر (D-383 المرحلة ٤): كلُّ ملفّات 01-plan تُقرأ، و`vN` داخل الشهر وحده، والمفتاحُ يضمّ الشهر،
 * و«حُذف» لا يعبر الشهر، ومفتاحُ منع التكرار بلا رقم المراجعة، وما تغيّر يهبط في خطّة شهره.
 */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { mergeMonthPlans, periodOf, planFiles, type PackagePlan, type PlanEntry } from './plan'
import { diffSnapshots, type Snapshot, type SnapshotEntry } from './diff'
import { applyDecisions, decide, packageKey, packagePosts } from './apply'
import { landInMonthPlans } from './month'
import { readSource, saveSource } from './sync'

const row = (item: string, date: string, o: Partial<PlanEntry> = {}): PlanEntry => ({ item, platform: 'x', date, time: '20:00', idea: 'فكرة ' + item, format: 'نص', mediaHint: '', ...o })
const sheet = (entries: PlanEntry[]): PackagePlan => ({ entries, rules: null, days: entries.length, columns: ['التاريخ'], problems: [] })
const entry = (item: string, date: string, text = 'نصّ ' + item): SnapshotEntry => ({
  item, platform: 'x', date, time: '20:00', format: 'نص', idea: 'فكرة', text, media: null, mediaName: null, problems: [],
})
const snap = (entries: SnapshotEntry[]): Snapshot => ({ entries, copySha: 'c', planPath: null })

describe('كلُّ ملفّات الخطّة أشهرًا', () => {
  it('ملفّا نوفمبر وديسمبر يتعايشان، و`vN` يحسم داخل الشهر وحده، والصفُّ بلا تاريخ يُسقط بتحذير', () => {
    expect(planFiles(['01-plan/2026-12-plan-v1.xlsx', '01-plan/2026-11-plan-v2.xlsx', '01-plan/2026-11-plan-v1.xlsx', '02-copy/a.md']))
      .toEqual(['01-plan/2026-11-plan-v2.xlsx', '01-plan/2026-11-plan-v1.xlsx', '01-plan/2026-12-plan-v1.xlsx'])
    expect(periodOf('2026-11-22')).toBe('2026-11')
    expect(periodOf('الأحد')).toBeNull()
    const m = mergeMonthPlans([
      { path: '01-plan/2026-11-plan-v1.xlsx', plan: sheet([row('01', '2026-11-22', { time: '09:00' }), row('02', '2026-11-23')]) },
      { path: '01-plan/2026-11-plan-v2.xlsx', plan: sheet([row('01', '2026-11-22'), row('03', '2026-11-24'), row('04', '')]) },
      // ‏ديسمبر يبدأ ترقيمَه من 01، ونسختُه v1 لا تُغلب بـ v2 نوفمبر
      { path: '01-plan/2026-12-plan-v1.xlsx', plan: sheet([row('01', '2026-12-01'), row('02', '2026-12-02')]) },
    ])
    expect(m.periods).toEqual(['2026-11', '2026-12'])
    expect(m.files).toEqual({ '2026-11': '01-plan/2026-11-plan-v2.xlsx', '2026-12': '01-plan/2026-12-plan-v1.xlsx' })
    expect(m.plan.entries.map((e) => e.date.slice(0, 7) + ':' + e.item)).toEqual(['2026-11:01', '2026-11:03', '2026-12:01', '2026-12:02'])
    expect(m.plan.entries.find((e) => e.item === '01' && e.date.startsWith('2026-11'))!.time).toBe('20:00')
    expect(m.plan.problems.join(' ')).toMatch(/2026-11-plan-v2\.xlsx: 1 صفًّا بلا تاريخ/)
    expect(mergeMonthPlans([]).plan.problems).toEqual(['لا ملفّ خطّة في 01-plan'])
  })

  it('الملفُّ الممتدّ على شهرين يعطي كلَّ شهرٍ صفوفَه، وملفُّ شهرٍ أعلى نسخةً لا يمسّ الشهر الآخر', () => {
    const m = mergeMonthPlans([
      { path: '01-plan/span-v1.xlsx', plan: sheet([row('01', '2026-11-30'), row('02', '2026-12-01')]) },
      { path: '01-plan/dec-v3.xlsx', plan: sheet([row('05', '2026-12-05')]) },
    ])
    expect(m.files).toEqual({ '2026-11': '01-plan/span-v1.xlsx', '2026-12': '01-plan/dec-v3.xlsx' })
    expect(m.plan.entries.map((e) => e.item)).toEqual(['05', '01'])
  })
})

describe('الفرقُ بالشهر', () => {
  const nov = [entry('01', '2026-11-22'), entry('02', '2026-11-23')]
  const dec = [entry('01', '2026-12-01')]
  it('ديسمبر بترقيمٍ من 01 يُضاف ولا يستبدل نوفمبر', () => {
    const c = diffSnapshots(snap(nov), snap([...nov, ...dec]))
    expect(c.map((x) => [x.period, x.item, x.kind])).toEqual([['2026-12', '01', 'added']])
  })
  it('لا «حُذف» عابرٌ للشهر: دفعةٌ فيها ديسمبر وحده لا تحذف شيئًا من نوفمبر', () => {
    expect(diffSnapshots(snap([...nov, ...dec]), snap(dec))).toEqual([])
    const c = diffSnapshots(snap([...nov, ...dec]), snap([nov[0]!, ...dec]))
    expect(c.map((x) => [x.period, x.item, x.kind])).toEqual([['2026-11', '02', 'removed']])
  })
})

async function seeded() {
  const db = fakeDb()
  await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: 'social-media' })
  const source = (await readSource(db, 'org_owner'))!
  return { db, source }
}

async function push(db: ReturnType<typeof fakeDb>, sourceId: string, id: string, prev: Snapshot | null, next: Snapshot) {
  await db.prepare("INSERT INTO package_revisions (id, org_id, source_id, commit_sha, status, snapshot_json) VALUES (?, 'org_owner', ?, ?, 'analysed', ?)")
    .bind(id, sourceId, id + '-sha', JSON.stringify(next)).run()
  const decisions = decide(diffSnapshots(prev, next), await packagePosts(db, 'org_owner'))
  await applyDecisions({ db, org: 'org_owner', revisionId: id, copySha: 'c' }, decisions)
  return landInMonthPlans(db, 'org_owner', { revisionId: id, commit: id + '-sha' }, next, decisions)
}

describe('الحزمةُ في خطّة الشهر', () => {
  it('مفتاحُ منع التكرار بالشهر بلا رقم مراجعة، ونوفمبر وديسمبر خطّتان ببنودهما، والدفعةُ نفسُها لا تضيف استيرادًا', async () => {
    const { db, source } = await seeded()
    const nov = snap([entry('01', '2026-11-22'), entry('02', '2026-11-23')])
    await push(db, source.id, 'rev_n', null, nov)
    await db.prepare("UPDATE posts SET status = 'approved' WHERE package_item_no = '01' AND package_period = '2026-11'").run()
    const both = snap([...nov.entries, entry('01', '2026-12-01', 'ديسمبر 01')])
    const out = await push(db, source.id, 'rev_d', nov, both)
    expect(Object.keys(out.plans)).toEqual(['2026-11', '2026-12'])
    const posts = await db.prepare("SELECT idempotency_key AS k, status, text, package_period AS p, plan_item_id FROM posts WHERE package_item_no IS NOT NULL ORDER BY idempotency_key")
      .all<{ k: string; status: string; text: string; p: string; plan_item_id: string | null }>()
    expect(posts.results.map((r) => r.k)).toEqual([
      packageKey('org_owner', '2026-11', '01', 'x'), packageKey('org_owner', '2026-11', '02', 'x'), packageKey('org_owner', '2026-12', '01', 'x'),
    ])
    expect(posts.results[0]!.k).toBe('plan:org_owner:2026-11:01:x')
    // ‏معتمدُ نوفمبر لم يُمسّ ولم يصر «ينتظر المالك»
    expect(posts.results[0]).toMatchObject({ status: 'approved', text: 'نصّ 01' })
    expect(await db.prepare("SELECT count(*) AS n FROM package_changes WHERE disposition = 'awaiting_owner'").first<{ n: number }>()).toEqual({ n: 0 })
    expect(posts.results.every((r) => r.plan_item_id !== null)).toBe(true)
    const plans = await db.prepare("SELECT period, model, source_kinds FROM plans WHERE org_id = 'org_owner' ORDER BY period").all<{ period: string; model: string; source_kinds: string }>()
    expect(plans.results).toEqual([
      { period: '2026-11', model: 'package', source_kinds: '["github"]' }, { period: '2026-12', model: 'package', source_kinds: '["github"]' },
    ])
    const items = await db.prepare("SELECT p.period, i.item_key, i.due_local, i.copy, i.source_kind, i.source_revision_id FROM plan_items i JOIN plans p ON p.id = i.plan_id ORDER BY p.period, i.item_key")
      .all<Record<string, string>>()
    expect(items.results.map((r) => [r.period, r.item_key, r.due_local, r.source_kind])).toEqual([
      ['2026-11', 'pkg:01', '2026-11-22 20:00', 'github'], ['2026-11', 'pkg:02', '2026-11-23 20:00', 'github'], ['2026-12', 'pkg:01', '2026-12-01 20:00', 'github'],
    ])
    const jobs = (): Promise<{ n: number } | null> => db.prepare("SELECT count(*) AS n FROM import_jobs WHERE source_kind = 'github'").first<{ n: number }>()
    expect(await jobs()).toEqual({ n: 2 })
    await landInMonthPlans(db, 'org_owner', { revisionId: 'rev_d', commit: 'again' }, both, [])
    expect(await jobs()).toEqual({ n: 2 })
  })

  it('خطّةٌ مُستبدَلةٌ تحمل الشهر لا تأخذ بنودَ الحزمة: يُفكّ شهرُها وتُنشأ خطّةُ الحزمة', async () => {
    const { db, source } = await seeded()
    await db.prepare("INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, period) VALUES ('old', '2026-11-01', '{\"items\":[]}', 'm', 'superseded', 'org_owner', 'month', '2026-11')").run()
    const out = await push(db, source.id, 'rev_s', null, snap([entry('01', '2026-11-22')]))
    expect(out.plans['2026-11']).not.toBe('old')
    expect(await db.prepare("SELECT period FROM plans WHERE id = 'old'").first()).toEqual({ period: null })
    expect(await db.prepare("SELECT count(*) AS n FROM plan_items WHERE plan_id = ?").bind(out.plans['2026-11']).first()).toEqual({ n: 1 })
  })

  it('«حُذف» في ديسمبر يؤرشف مسوّدةَ ديسمبر وبندَها وحدهما، ونوفمبر برقمه نفسِه باقٍ', async () => {
    const { db, source } = await seeded()
    const both = snap([entry('01', '2026-11-22'), entry('01', '2026-12-01'), entry('02', '2026-12-02')])
    await push(db, source.id, 'rev_a', null, both)
    await push(db, source.id, 'rev_b', both, snap([entry('01', '2026-11-22'), entry('02', '2026-12-02')]))
    const s = await db.prepare("SELECT package_period AS p, status FROM posts WHERE package_item_no = '01' ORDER BY package_period").all<{ p: string; status: string }>()
    expect(s.results).toEqual([{ p: '2026-11', status: 'draft' }, { p: '2026-12', status: 'rejected' }])
    const items = await db.prepare("SELECT p.period, i.item_key FROM plan_items i JOIN plans p ON p.id = i.plan_id ORDER BY p.period, i.item_key").all<{ period: string; item_key: string }>()
    expect(items.results).toEqual([{ period: '2026-11', item_key: 'pkg:01' }, { period: '2026-12', item_key: 'pkg:02' }])
  })

  it('بندٌ عُدِّل في صدى لا يكتب فوقه دفعٌ تالٍ، وخطّةُ ملفٍّ للشهر نفسِه تحمل بنودَ الحزمة', async () => {
    const { db, source } = await seeded()
    await db.prepare("INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, period, source_kinds) VALUES ('p_csv', '2026-11-01', '{\"items\":[]}', 'import', 'draft', 'org_owner', 'month', '2026-11', '[\"csv\"]')").run()
    const a = snap([entry('01', '2026-11-22')])
    await push(db, source.id, 'rev_1', null, a)
    expect(await db.prepare("SELECT source_kinds FROM plans WHERE id = 'p_csv'").first()).toEqual({ source_kinds: '["csv","github"]' })
    await db.prepare("UPDATE plan_items SET edited_in_sada = 1, copy = 'بيدي' WHERE plan_id = 'p_csv'").run()
    await push(db, source.id, 'rev_2', a, snap([entry('01', '2026-11-22', 'نصٌّ جديد')]))
    expect(await db.prepare("SELECT copy, rev FROM plan_items WHERE plan_id = 'p_csv'").first()).toEqual({ copy: 'بيدي', rev: 1 })
  })
})
