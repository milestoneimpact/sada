/**
 * ترحيلُ 0061 (D-383 المرحلة ٢): النموذجُ الموحَّد وتعبئتُه الرجعيّة بلا فقد.
 *
 * يُبنى المخطَّطُ حتّى 0060، وتُزرع فيه خططٌ ومنشوراتُ حزمةٍ كما في الإنتاج، ثمّ يُطبَّق 0061 فوقها.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { latestPlan } from './job'

const DIR = new URL('../../../migrations/', import.meta.url)
const NAMES = readdirSync(DIR).filter((n) => n.endsWith('.sql')).sort()
const sql = (names: string[]): string => names.map((n) => readFileSync(new URL(n, DIR), 'utf8')).join('\n')
const BEFORE = sql(NAMES.filter((n) => n < '0061'))
const AFTER = sql(NAMES.filter((n) => n.startsWith('0061')))

type Row = Record<string, unknown>

function seeded(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(BEFORE)
  const plan = (id: string, week: string, span: string, status: string, model: string, items: unknown[], at: string): void => {
    db.prepare('INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, week, JSON.stringify({ rationale: 'ر', items }), model, status, 'org_a', span, at)
  }
  const item = (id: string | undefined, day: string, time: string, platform = 'x'): Row =>
    ({ ...(id === undefined ? {} : { id }), sourceId: 's1', platform, angle: 'زاوية', day, time, why: 'لأنّ' })
  plan('p_week', '2026-10-04', 'week', 'approved', 'claude', [item('it1', '2026-10-05', '09:00'), item(undefined, '2026-10-06', '10:00', 'linkedin')], '2026-10-01 00:00:00')
  plan('p_old', '2026-10-01', 'month', 'superseded', 'claude', [item('a', '2026-10-02', '09:00')], '2026-09-20 00:00:00')
  plan('p_oct', '2026-10-11', 'month', 'draft', 'import', [item('b', '2026-10-12', '09:00')], '2026-09-25 00:00:00')
  const post = (id: string, extra: Row): void => {
    const cols = ['id', 'platform', 'type', 'text', 'status', 'idempotency_key', 'org_id', ...Object.keys(extra).filter((k) => k !== 'platform')]
    const vals = [id, extra['platform'] ?? 'x', 'text', `نصّ ${id}`, 'draft', `k_${id}`, 'org_a', ...Object.entries(extra).filter(([k]) => k !== 'platform').map(([, v]) => v)]
    db.prepare(`INSERT INTO posts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...(vals as never[]))
  }
  post('w1', { plan_id: 'p_week', source_refs: '["item:it1"]' })
  post('n1', { package_item_no: '1', package_due: '2026-11-03 09:30', source_revision_id: 'r1' })
  post('n1l', { platform: 'linkedin', package_item_no: '1', package_due: '2026-11-03 10:00' })
  post('d1', { package_item_no: '1', package_due: '2026-12-01 09:00' })
  post('o5', { package_item_no: '5', package_due: '2026-10-20 08:00' })
  post('nodue', { package_item_no: '9' })
  db.exec(AFTER)
  return db
}

const all = (db: DatabaseSync, q: string, ...a: unknown[]): Row[] => db.prepare(q).all(...(a as never[])) as Row[]

describe('0061 · التعبئة الرجعيّة', () => {
  it('بنودُ كلّ خطّةٍ تُنسخ بمفتاحها وموعدها المحلّيّ', () => {
    const db = seeded()
    const rows = all(db, "SELECT item_key, platform, due_local, source_kind FROM plan_items WHERE plan_id = 'p_week' ORDER BY item_key")
    expect(rows).toEqual([
      { item_key: '#1', platform: 'linkedin', due_local: '2026-10-06 10:00', source_kind: 'wizard' },
      { item_key: 'it1', platform: 'x', due_local: '2026-10-05 09:00', source_kind: 'wizard' },
    ])
    expect(all(db, "SELECT source_kind FROM plan_items WHERE plan_id = 'p_oct' AND package_item_no IS NULL")).toEqual([{ source_kind: 'csv' }])
  })

  it('الشهرُ للخطّة الشهريّة الأحدث وحدها، والأسبوعيّةُ بلا شهر', () => {
    const db = seeded()
    const rows = all(db, "SELECT id, period FROM plans WHERE id IN ('p_week', 'p_old', 'p_oct') ORDER BY id")
    expect(rows).toEqual([{ id: 'p_oct', period: '2026-10' }, { id: 'p_old', period: null }, { id: 'p_week', period: null }])
  })

  it('منشوراتُ الحزمة تُجمع بشهر موعدها، ونوفمبر وديسمبر لا يتداخلان', () => {
    const db = seeded()
    const plans = all(db, "SELECT id, week_start, period, model FROM plans WHERE model = 'package' ORDER BY period")
    expect(plans.map((p) => p['period'])).toEqual(['2026-11', '2026-12'])
    expect(plans[0]!['week_start']).toBe('2026-11')
    const links = all(db, `SELECT s.id, i.plan_id, i.item_key, i.copy FROM posts s JOIN plan_items i ON i.id = s.plan_item_id
                            WHERE s.package_item_no IS NOT NULL ORDER BY s.id`)
    expect(links).toEqual([
      { id: 'd1', plan_id: 'plan_pkg_org_a_2026-12', item_key: 'pkg:1', copy: 'نصّ d1' },
      { id: 'n1', plan_id: 'plan_pkg_org_a_2026-11', item_key: 'pkg:1', copy: 'نصّ n1' },
      { id: 'n1l', plan_id: 'plan_pkg_org_a_2026-11', item_key: 'pkg:1', copy: 'نصّ n1l' },
      // ‏شهرٌ له خطّةٌ قائمة: البندُ يُضاف إليها ولا تُنشأ ثانية
      { id: 'o5', plan_id: 'p_oct', item_key: 'pkg:5', copy: 'نصّ o5' },
    ])
    expect(all(db, "SELECT source_kinds FROM plans WHERE id = 'p_oct'")).toEqual([{ source_kinds: '["csv","github"]' }])
    expect(all(db, "SELECT plan_item_id FROM posts WHERE id = 'nodue'")).toEqual([{ plan_item_id: null }])
  })

  it('مسوّدةُ الخطّة تشير إلى بندها بمرجع item:', () => {
    const db = seeded()
    expect(all(db, "SELECT plan_item_id FROM posts WHERE id = 'w1'")).toEqual([{ plan_item_id: 'pi_p_week_0' }])
  })

  it('بلا فقد: لا يتغيّر نصٌّ ولا حالٌ ولا موعدٌ ولا مفتاحٌ لمنشور', () => {
    const db = seeded()
    expect(all(db, 'SELECT count(*) AS n FROM posts')).toEqual([{ n: 6 }])
    expect(all(db, "SELECT text, status, idempotency_key, plan_id FROM posts WHERE id = 'n1'"))
      .toEqual([{ text: 'نصّ n1', status: 'draft', idempotency_key: 'k_n1', plan_id: null }])
  })

  it('شهرٌ واحدٌ لخطّةٍ واحدة لكلّ منظّمة', () => {
    const db = seeded()
    expect(() => db.prepare("UPDATE plans SET period = '2026-11' WHERE id = 'p_oct'").run()).toThrow(/UNIQUE/)
  })

  it('حذفُ خطّةٍ يحذف بنودَها ويُفرغ إشارةَ منشوراتها (seatPlan · بناءُ الخطّة)', () => {
    const db = seeded()
    db.prepare("DELETE FROM plans WHERE id = 'p_oct'").run()
    expect(all(db, "SELECT count(*) AS n FROM plan_items WHERE plan_id = 'p_oct'")).toEqual([{ n: 0 }])
    expect(all(db, "SELECT plan_item_id FROM posts WHERE id = 'o5'")).toEqual([{ plan_item_id: null }])
  })
})

describe('0061 · الجداول الجديدة', () => {
  it('الاستيرادُ نفسُه ببصمته مرّةً واحدة', () => {
    const db = fakeDb()
    const add = db.raw.prepare("INSERT INTO import_jobs (id, org_id, source_kind, content_hash, period) VALUES (?, 'org_a', 'github', 'h1', '2026-11')")
    add.run('j1')
    expect(() => add.run('j2')).toThrow(/UNIQUE/)
    expect(() => db.raw.prepare("INSERT INTO import_jobs (id, org_id, source_kind, content_hash, period) VALUES ('j3', 'org_a', 'csv', 'h1', '2026-11-01')").run()).toThrow(/CHECK/)
  })

  it('قواعدُ الجدولة بافتراضيّات التصميم', () => {
    const db = fakeDb()
    db.raw.prepare("INSERT INTO schedule_rules (org_id) VALUES ('org_a')").run()
    expect(db.raw.prepare("SELECT platform_caps_json, daily_total_cap, min_gap_minutes, quiet_start, quiet_end, jitter_minutes FROM schedule_rules").get())
      .toEqual({ platform_caps_json: '{"x":3,"linkedin":2}', daily_total_cap: 5, min_gap_minutes: 90, quiet_start: '23:00', quiet_end: '07:00', jitter_minutes: 7 })
  })

  it('سجلُّ التعديل يحفظ من ومتى وما قبله', () => {
    const db = fakeDb()
    db.raw.prepare("INSERT INTO plan_edits (id, org_id, target_kind, target_id, rev, actor, before_json) VALUES ('e1', 'org_a', 'post', 'p1', 1, 'u1', '{}')").run()
    expect(db.raw.prepare("SELECT actor, rev, at IS NOT NULL AS stamped FROM plan_edits").get()).toEqual({ actor: 'u1', rev: 1, stamped: 1 })
    expect(() => db.raw.prepare("INSERT INTO plan_edits (id, org_id, target_kind, target_id, rev, actor, before_json) VALUES ('e2', 'org_a', 'plan', 'x', 1, 'u1', '{}')").run()).toThrow(/CHECK/)
  })

  it('خطّةُ الحزمة المعبّأة لا تحلّ محلَّ «أحدث خطّة» قبل أن يتبدّل القارئ', async () => {
    const db = fakeDb()
    db.raw.prepare("INSERT INTO plans (id, week_start, plan_json, model, org_id, span) VALUES ('w', '2026-11-08', '{\"rationale\":\"\",\"items\":[]}', 'claude', 'org_a', 'week')").run()
    db.raw.prepare("INSERT INTO plans (id, week_start, plan_json, model, org_id, span, period) VALUES ('k', '2026-12', '{\"rationale\":\"\",\"items\":[]}', 'package', 'org_a', 'month', '2026-12')").run()
    expect((await latestPlan(db, 'org_a'))?.id).toBe('w')
  })
})

