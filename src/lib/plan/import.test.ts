/** خطّتُك من ملفّ (D-181): CSV يُقرأ صفًّا صفًّا، والموعدُ بتوقيت المالك، ولا يُجدوَل إلّا السليم. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import type { LinkedAccount } from '../channels'
import type { UploadRow } from '../media/uploads'
import { applyPlan, parseCsv, PLAN_TEMPLATE, readPlan, rowKey, zonedToUtc, type PlanFacts } from './import'

const NOW = new Date('2026-10-03T08:00:00Z')

const account = (over: Partial<LinkedAccount>): LinkedAccount => ({
  id: 'acc-li', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
  createdAt: '2026-09-01 00:00:00', expiresAt: '2026-12-01 00:00:00', ...over,
})
const upload = (over: Partial<UploadRow> = {}): UploadRow => ({
  id: 'up1', r2Key: 'upload/up1.mp4', name: 'قيادة المعالم.mp4', mime: 'video/mp4', bytes: 50_000_000,
  width: 1080, height: 1920, durationMs: 42_000, status: 'ready', createdAt: '2026-10-02 10:00:00', platforms: [], ...over,
})
const facts = (over: Partial<PlanFacts> = {}): PlanFacts => ({
  accounts: [account({}), account({ id: 'acc-yt', platform: 'youtube', displayName: 'قناة عمر' })],
  uploads: [upload()],
  now: NOW,
  zone: 'Asia/Riyadh',
  publishable: new Set(['linkedin', 'x', 'youtube', 'tiktok', 'instagram']),
  ...over,
})

describe('parseCsv', () => {
  it('الاقتباسُ والفاصلةُ والسطرُ داخله، ومضاعفُ الاقتباس، وBOM وCRLF، والسطرُ الفارغ', () => {
    const csv = '﻿date,text\r\n2026-10-12,"أوّلًا، ثمّ ""ثانيًا""\nسطرٌ ثانٍ"\r\n\r\n2026-10-13,بسيط\n'
    expect(parseCsv(csv)).toEqual([
      ['date', 'text'],
      ['2026-10-12', 'أوّلًا، ثمّ "ثانيًا"\nسطرٌ ثانٍ'],
      ['2026-10-13', 'بسيط'],
    ])
  })
})

describe('zonedToUtc', () => {
  it('الرياض +3 بلا صيف، ولندن تتبع صيفَها، والتاريخُ الذي لا وجودَ له يُردّ', () => {
    expect(zonedToUtc('2026-10-12', '09:30', 'Asia/Riyadh')!.toISOString()).toBe('2026-10-12T06:30:00.000Z')
    expect(zonedToUtc('2026-07-01', '12:00', 'Europe/London')!.toISOString()).toBe('2026-07-01T11:00:00.000Z')
    expect(zonedToUtc('2026-12-01', '12:00', 'Europe/London')!.toISOString()).toBe('2026-12-01T12:00:00.000Z')
    expect(zonedToUtc('2026-02-31', '10:00', 'Asia/Riyadh')).toBeNull()
    expect(zonedToUtc('12/10/2026', '10:00', 'Asia/Riyadh')).toBeNull()
  })
})

describe('readPlan', () => {
  it('النموذجُ نفسُه يُقرأ سليمًا: LinkedIn بلا مقطع، وYouTube بمقطعه وحسابه', () => {
    const read = readPlan(PLAN_TEMPLATE, facts())
    expect(read.fileProblems).toEqual([])
    expect(read.rows.map((r) => r.problems)).toEqual([[], []])
    expect(read.rows[0]).toMatchObject({ line: 2, platform: 'linkedin', whenUtc: '2026-10-12T06:30', accountId: 'acc-li' })
    expect(read.rows[1]).toMatchObject({ platform: 'youtube', uploadId: 'up1', accountId: 'acc-yt' })
  })

  it('العناوينُ بالعربيّة، والمنصّةُ بالعربيّة، والمنطقةُ في عمودها', () => {
    const csv = 'التاريخ,الوقت,المنصة,النص,المنطقة\n2026-10-12,09:30,لينكدإن,نصّ,Europe/London\n'
    const [row] = readPlan(csv, facts()).rows
    expect(row).toMatchObject({ platform: 'linkedin', zone: 'Europe/London', whenUtc: '2026-10-12T08:30', problems: [] })
  })

  it('كلُّ صفٍّ بمشكلاته كلِّها لا أوّلِها', () => {
    const csv = [
      'date,time,platform,text,video',
      '2026-10-01,09:00,linkedin,,',                                // مضى، ونصٌّ فارغ
      '2026-10-12,09:00,فيسبوك,نصّ,',                               // منصّةٌ لا نعرفها
      `2026-10-12,09:00,x,${'ن'.repeat(300)},`,                     // فوق حدّ X
      '2026-10-12,10:00,tiktok,نصّ,',                               // بلا مقطع، وبلا حساب
      '2026-10-12,11:00,youtube,نصّ,غير موجود.mp4',                  // مقطعٌ لا يوجد
      '2026-10-12,12:00,linkedin,نصّ,قيادة المعالم.mp4',             // LinkedIn لا تنشر المقطع
      '2026-10-12,13:00,linkedin,مكرّر,',
      '2026-10-12,13:00,linkedin,مكرّر,',
    ].join('\n')
    const rows = readPlan(csv, facts()).rows
    expect(rows[0]!.problems).toEqual(['الموعدُ مضى أو أقربُ من ربع ساعة', 'النصُّ فارغ'])
    expect(rows[1]!.problems[0]).toContain('منصّةٌ لا أعرفها')
    expect(rows[2]!.problems.some((p) => p.includes('X تقبل 280'))).toBe(true)
    expect(rows[3]!.problems).toEqual([
      'TikTok تحتاج مقطعًا — اكتب اسمَه كما في «فيديوهاتك»',
      'لا حسابَ متّصلًا على TikTok — اربطه أوّلًا',
    ])
    expect(rows[4]!.problems[0]).toContain('لا مقطعَ مرفوعًا باسم')
    expect(rows[5]!.problems[0]).toContain('LinkedIn لا تنشر المقطعَ')
    expect(rows[6]!.problems).toEqual([])
    expect(rows[7]!.problems).toEqual(['مكرّرٌ للسطر 8'])
  })

  it('الملفُّ كلُّه يُردّ: عنوانٌ ناقص، أو فارغ', () => {
    expect(readPlan('date,time,text\n2026-10-12,09:00,x', facts()).fileProblems[0]).toContain('platform / المنصة')
    expect(readPlan('', facts()).fileProblems).toEqual(['الملفُّ فارغ'])
  })
})

describe('applyPlan', () => {
  let db: FakeDb
  beforeEach(async () => {
    db = fakeDb()
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
  })

  it('يعتمد السليمَ ويجدوله بحسابه، ويتخطّى ذا المشكلة، والملفُّ نفسُه مرّتين لا يكرّر', async () => {
    const csv = 'date,time,platform,text\n2026-10-12,09:30,linkedin,أوّل\n2026-10-12,09:30,tiktok,بلا حساب\n'
    const read = readPlan(csv, facts())
    const first = await applyPlan(db, read.rows, 'panel:passkey', NOW)
    expect(first).toEqual([{ line: 2, result: 'scheduled' }])
    const row = db.raw.prepare(`SELECT status, approved_by, scheduled_at, account_id FROM posts`).get()
    expect(row).toEqual({ status: 'queued', approved_by: 'panel:passkey', scheduled_at: '2026-10-12 06:30:00', account_id: 'acc-li' })

    expect(await applyPlan(db, read.rows, 'panel:passkey', NOW)).toEqual([{ line: 2, result: 'exists', reason: 'مجدولٌ من قبل' }])
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(1)
  })

  it('وحسابٌ سقط بين المعاينة والاعتماد: يُعتمَد الصفُّ ولا يُجدوَل، ويُقال لماذا', async () => {
    db.raw.exec(`UPDATE accounts SET status = 'needs_reauth'`)
    const read = readPlan('date,time,platform,text\n2026-10-12,09:30,linkedin,نصّ\n', facts())
    const [out] = await applyPlan(db, read.rows, 'panel:token', NOW)
    expect(out).toMatchObject({ line: 2, result: 'failed' })
    expect(out!.reason).toContain('اعتُمد ولم يُجدوَل')
  })
})

describe('مراجعة D-182', () => {
  it('رقمُ السطر رقمُه في الجدول ولو فصلت بين الأسابيع صفوفٌ فارغة', () => {
    const csv = 'date,time,platform,text\n2026-10-12,09:30,linkedin,أوّل\n,,,\n2026-10-13,09:30,فيسبوك,ثانٍ\n'
    expect(readPlan(csv, facts()).rows.map((r) => r.line)).toEqual([2, 4])
  })

  it('المفتاحُ من الملفّ لا من منطقة المتصفّح: الملفُّ نفسُه من هاتفٍ بمنطقةٍ أخرى مفتاحٌ واحد', async () => {
    const csv = 'date,time,platform,text\n2026-10-12,9:30,linkedin,نصّ\n'
    const a = readPlan(csv, facts({ zone: 'Asia/Riyadh' })).rows[0]!
    const b = readPlan(csv.replace('9:30', '09:30'), facts({ zone: 'UTC' })).rows[0]!
    expect(a.whenUtc).not.toBe(b.whenUtc)
    expect(await rowKey(a)).toBe(await rowKey(b))
    // ‏ومنطقةٌ في عمودها تغيّر الموعدَ فتغيّر المفتاح
    const c = readPlan('date,time,platform,text,zone\n2026-10-12,09:30,linkedin,نصّ,Europe/London\n', facts()).rows[0]!
    expect(await rowKey(c)).not.toBe(await rowKey(a))
  })

  it('النصُّ نفسُه مجدولٌ في موعدٍ آخر يُردّ بموعده المحلّيّ، والموعدُ نفسُه ليس مكرّرًا', () => {
    const csv = 'date,time,platform,text\n2026-10-12,09:30,linkedin,نصّ\n'
    const twin = readPlan(csv, facts({ scheduled: [{ platform: 'linkedin', text: ' نصّ ', at: '2026-10-12 09:30:00' }] })).rows[0]!
    expect(twin.problems).toEqual(['النصُّ نفسُه مجدولٌ على LinkedIn في 2026-10-12 12:30 — اسحبه أوّلًا أو غيّر النصّ'])
    const same = readPlan(csv, facts({ scheduled: [{ platform: 'linkedin', text: 'نصّ', at: '2026-10-12 06:30:00' }] })).rows[0]!
    expect(same.problems).toEqual([])
  })

  it('صفحةُ شركةٍ على LinkedIn لا تُختار، ومحارفُ تالفة تُردّ، ووصفُ YouTube بالبايت', () => {
    const org = account({ id: 'acc-org', kind: 'org', displayName: 'الشركة' })
    const onlyOrg = readPlan('date,time,platform,text\n2026-10-12,09:30,linkedin,نصّ\n', facts({ accounts: [org] })).rows[0]!
    expect(onlyOrg.problems[0]).toContain('صفحةُ شركة')
    const both = readPlan('date,time,platform,text\n2026-10-12,09:30,linkedin,نصّ\n', facts({ accounts: [org, account({})] })).rows[0]!
    expect(both.accountId).toBe('acc-li')
    expect(readPlan('date,time,platform,text\n2026-10-12,09:30,linkedin,\uFFFD\uFFFD\n', facts()).rows[0]!.problems[0]).toContain('CSV UTF-8')
    const yt = readPlan(`date,time,platform,text,video\n2026-10-12,09:30,youtube,${'ع'.repeat(2600)},قيادة المعالم.mp4\n`, facts()).rows[0]!
    expect(yt.problems).toEqual(['النصُّ 5200 بايتًا وYouTube تقبل 5000 — والحرفُ العربيُّ بايتان'])
  })
})

describe('applyPlan بعد المراجعة (D-182)', () => {
  let db: FakeDb
  beforeEach(async () => {
    db = fakeDb()
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
  })
  const csv = 'date,time,platform,text\n2026-10-12,09:30,linkedin,أوّل\n2026-10-12,10:30,linkedin,ثانٍ\n'

  it('ما لم يُعرَض جاهزًا لا يُجدوَل، وما عُرض جاهزًا ثمّ صارت له مشكلةٌ يُردّ بها', async () => {
    const rows = readPlan(csv, facts()).rows
    const broken = [rows[0]!, { ...rows[1]!, problems: ['لا حسابَ متّصلًا على LinkedIn — اربطه أوّلًا'] }]
    expect(await applyPlan(db, broken, 'o', NOW, new Set([3]))).toEqual([
      { line: 3, result: 'failed', reason: 'لا حسابَ متّصلًا على LinkedIn — اربطه أوّلًا' },
    ])
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(0)
  })

  it('مكتوبٌ لم يُجدوَل يُجدوَل بإعادة الملفّ، والمرفوضُ يُكتب من جديد، والمنشورُ يُقال «نُشر»', async () => {
    const rows = readPlan(csv, facts()).rows
    db.raw.exec(`UPDATE accounts SET status = 'needs_reauth'`)
    expect((await applyPlan(db, rows, 'o', NOW))[0]).toMatchObject({ result: 'failed' })
    db.raw.exec(`UPDATE accounts SET status = 'active'`)
    expect(await applyPlan(db, rows, 'o', NOW)).toEqual([{ line: 2, result: 'scheduled' }, { line: 3, result: 'scheduled' }])
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(2)

    db.raw.exec(`UPDATE posts SET status = 'rejected' WHERE text = 'أوّل'`)
    db.raw.exec(`UPDATE posts SET status = 'published' WHERE text = 'ثانٍ'`)
    expect(await applyPlan(db, rows, 'o', NOW)).toEqual([
      { line: 2, result: 'scheduled' },
      { line: 3, result: 'exists', reason: 'نُشر من قبل' },
    ])
    expect(db.raw.prepare(`SELECT status FROM posts WHERE text = 'أوّل' ORDER BY status`).all()).toEqual([{ status: 'queued' }, { status: 'rejected' }])
  })
})
