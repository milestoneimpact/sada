/**
 * «اعتمد الخطّة وجدولها» (D-382): مسوّداتُ الحزمة تُعتمد وتُجدوَل في `package_due` بساعة المالك، وما لا يصلح يُعدّ بسببه،
 * والضغطةُ الثانية لا تغيّر شيئًا.
 */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { dueToUtc, planPackageSchedule, schedulePackage } from './schedule'
import { scheduledSay } from '../../routes/panel/package'

const NOW = new Date('2026-11-16T10:00:00Z')
const TEXT_X = 'لوحة مؤشرات خضراء بالكامل لا تعني أنّ المشروع بخير، فالمؤشّر يقيس ما اخترنا أن نقيسه.'

function seed() {
  const db = fakeDb()
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-x', 'x', 'member', 'e1', 'صدى', 'active')`)
  const post = (id: string, platform: string, text: string, due: string, item: string): void => {
    db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id, package_item_no, copy_origin, package_due)
      VALUES (?, ?, 'text', ?, 'draft', ?, 'org_owner', ?, 'package', ?)`).run(id, platform, text, 'pkg:' + id, item, due)
  }
  post('p1', 'x', TEXT_X, '2026-11-26 09:00', '03')
  post('p2', 'x', TEXT_X + ' ثانية', '2026-11-28 20:00', '04')
  post('p3', 'x', '', '2026-11-27 09:00', '05')
  post('p4', 'x', TEXT_X + ' مضت', '2026-11-10 09:00', '06')
  post('p5', 'linkedin', TEXT_X + ' لينكدإن', '2026-11-26 09:00', '07')
  post('p6', 'x', TEXT_X + ' مقطع', '2026-11-29 09:00', '08')
  db.raw.exec(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, status, idempotency_key, duration_ms)
    VALUES ('m6', 'p6', 'k6', 'video/mp4', 5000000, 'pkg', 'package', 'ready', 'media:m6', 200000)`)
  return db
}

describe('اعتمد الخطّة وجدولها', () => {
  it('الموعدُ بساعة المالك إلى UTC', () => {
    expect(dueToUtc('2026-11-26 09:00', 'Asia/Riyadh')).toBe('2026-11-26T06:00')
    expect(dueToUtc('2026-11-26 09:00', 'Europe/London')).toBe('2026-11-26T09:00')
    expect(dueToUtc('غدًا', 'Asia/Riyadh')).toBeNull()
  })

  it('يُعدّ قبل الضغطة ما سيُجدوَل وما يُتخطّى ولماذا', async () => {
    const db = seed()
    const plan = await planPackageSchedule(db, 'org_owner', 'Asia/Riyadh', NOW)
    expect(plan.ready.map((s) => s.id)).toEqual(['p1', 'p2'])
    expect(plan.skipped).toEqual({ text: 1, past: 1, account: 1, page: 0, video: 1, time: 0, quiet: 0, gap: 0 })
  })

  it('يعتمد ويجدول بالطريق نفسِه، والضغطةُ الثانية لا تغيّر شيئًا', async () => {
    const db = seed()
    const out = await schedulePackage(db, 'org_owner', 'Asia/Riyadh', NOW, 'panel:email')
    expect(out.scheduled.map((s) => s.id)).toEqual(['p1', 'p2'])
    expect(out.failed).toEqual([])
    const row = db.raw.prepare("SELECT status, scheduled_at, approved_by, approved_at, account_id FROM posts WHERE id = 'p1'").get() as Record<string, unknown>
    expect(row).toMatchObject({ status: 'queued', scheduled_at: '2026-11-26 06:00:00', approved_by: 'panel:email', account_id: 'acc-x' })
    expect(row.approved_at).not.toBeNull()
    expect((db.raw.prepare("SELECT status FROM posts WHERE id = 'p3'").get() as { status: string }).status).toBe('draft')
    const again = await schedulePackage(db, 'org_owner', 'Asia/Riyadh', NOW, 'panel:email')
    expect(again.scheduled).toEqual([])
    expect(scheduledSay(out.scheduled, out.skipped, 0, 'Asia/Riyadh')).toMatch(/^جُدول منشوران من .+ إلى .+\. وتُخطّي 4: بلا نصّ 1/)
  })

  it('ما يرفضه schedulePost بعد الاعتماد يرجع مسوّدةً بلا اعتماد', async () => {
    const db = seed()
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-ig', 'instagram', 'member', 'e2', 'صدى', 'active')`)
    db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id, package_item_no, copy_origin, package_due)
      VALUES ('p7', 'instagram', 'image', ?, 'draft', 'pkg:p7', 'org_owner', '09', 'package', '2026-11-30 09:00')`).run(TEXT_X + ' صورة')
    const out = await schedulePackage(db, 'org_owner', 'Asia/Riyadh', NOW, 'panel:email')
    expect(out.failed.map((f) => f.id)).toEqual(['p7'])
    expect(db.raw.prepare("SELECT status, approved_by, approved_at FROM posts WHERE id = 'p7'").get())
      .toEqual({ status: 'draft', approved_by: null, approved_at: null })
  })
})
