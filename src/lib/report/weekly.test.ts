/**
 * التقريرُ الأسبوعيّ — والقاعدةُ حقيقيّة، والمقاييسُ تُزرع كما تُكتب.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import {
  buildWeekly, listReports, readReport, saveWeekly, summarize, topOf, weekBounds,
  type ReportPost,
} from './weekly'

let db: FakeDb

function seed(): void {
  db.raw.exec(
    `INSERT INTO accounts (id, platform, kind, external_id, display_name)
     VALUES ('a-li', 'linkedin', 'member', 'e1', 'عمر'),
            ('a-x',  'x',        'member', 'e2', 'عمر')`,
  )
}

/** منشورٌ نُشر فعلا: صفٌّ في `posts` ومحاولةٌ ناجحةٌ بوقتها. */
function published(id: string, platform: 'linkedin' | 'x', at: string): void {
  const account = platform === 'linkedin' ? 'a-li' : 'a-x'
  db.raw.exec(
    `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                        idempotency_key, approved_by, approved_at)
     VALUES ('${id}', '${account}', '${platform}', 'text', 'نصُّ ${id}', '${at}',
             'published', 'k-${id}', 'omar', '${at}')`,
  )
  db.raw.exec(
    `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no,
                                   request_json, status, at)
     VALUES ('at-${id}', '${id}', 'k-${id}', 1, '{}', 'succeeded', '${at}')`,
  )
}

function measured(
  id: string,
  window: '24h' | '72h' | '7d',
  values: { impressions?: number | null; reactions?: number | null },
): void {
  const imp = values.impressions === undefined || values.impressions === null
    ? 'NULL' : String(values.impressions)
  const react = values.reactions === undefined || values.reactions === null
    ? 'NULL' : String(values.reactions)
  db.raw.exec(
    `INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares)
     VALUES ('${id}', '${window}', ${imp}, ${react}, 0, 0)`,
  )
}

beforeEach(() => {
  db = fakeDb()
  seed()
})

describe('حدُّ الأسبوع', () => {
  /** الاثنينُ أوّلا: التقريرُ يُقرأ في أوّل يومِ عمل فيغطّي ما سبقه كاملا. */
  it('يبدأ الاثنين وينتهي بالاثنين الذي يليه', () => {
    // 2026-09-06 أحد
    const { from, to, id } = weekBounds(new Date('2026-09-06T09:00:00Z'))
    expect(from.toISOString()).toBe('2026-08-24T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-08-31T00:00:00.000Z')
    expect(id).toBe('2026-08-24')
  })

  it('واثنينٌ نفسُه يعطي الأسبوعَ الذي قبله لا الجاري', () => {
    const { from, to } = weekBounds(new Date('2026-08-31T00:30:00Z'))
    expect(from.toISOString()).toBe('2026-08-24T00:00:00.000Z')
    expect(to.toISOString()).toBe('2026-08-31T00:00:00.000Z')
  })

  it('وساعةُ اليوم لا تغيّر الحدّ', () => {
    const a = weekBounds(new Date('2026-09-02T00:00:01Z')).id
    const b = weekBounds(new Date('2026-09-02T23:59:59Z')).id
    expect(a).toBe(b)
  })
})

const FROM = new Date('2026-08-24T00:00:00Z')
const TO = new Date('2026-08-31T00:00:00Z')

describe('ما يدخل التقرير', () => {
  it('يقرأ وقتَ النشر من المحاولة الناجحة لا من حالة الصفّ', async () => {
    published('p1', 'x', '2026-08-25T10:00:00.000Z')
    const { report } = await buildWeekly(db, FROM, TO)
    expect(report.published).toBe(1)
  })

  /** حدُّ الأسبوع مغلقٌ من أوّله مفتوحٌ من آخره — فلا يُعدّ منشورٌ مرّتين. */
  it('ولا يُعدّ منشورٌ في أسبوعين', async () => {
    published('early', 'x', '2026-08-23T23:59:59.000Z')
    published('edge', 'x', '2026-08-24T00:00:00.000Z')
    published('late', 'x', '2026-08-31T00:00:00.000Z')
    const { report } = await buildWeekly(db, FROM, TO)
    expect(report.published).toBe(1)
  })

  it('ومسوّدةٌ لم تخرج لا تدخل — ولو كانت حالتُها تقول غير ذلك', async () => {
    db.raw.exec(
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status,
                          idempotency_key, approved_by, approved_at)
       VALUES ('ghost', 'a-x', 'x', 'text', 'ن', '2026-08-25T10:00:00Z', 'published',
               'k-ghost', 'omar', '2026-08-25T10:00:00Z')`,
    )
    const { report } = await buildWeekly(db, FROM, TO)
    expect(report.published).toBe(0)
  })
})

describe('و`null` ليست صفرا', () => {
  /**
   * **هذا هو الحدُّ الذي يحرسه التقريرُ كلُّه.**
   *
   * LinkedIn لا يعطي ظهورا لمنشور عضو. ومجموعٌ يعدّه صفرا يعرض «٠ ظهور»
   * — **ويُقرأ فشلا، وهو غيابُ قياس**.
   */
  it('مجموعُ ظهورٍ كلُّه غيرُ مقيسٍ يعود null لا صفرا', async () => {
    published('l1', 'linkedin', '2026-08-25T10:00:00.000Z')
    measured('l1', '24h', { impressions: null, reactions: 4 })
    const { report } = await buildWeekly(db, FROM, TO)
    const li = report.platforms.find((p) => p.platform === 'linkedin')!
    expect(li.impressions).toBeNull()
    expect(li.interactions).toBe(4)
  })

  it('ومجموعٌ جزئيٌّ يقول من كم صفّا جُمع', async () => {
    published('x1', 'x', '2026-08-25T10:00:00.000Z')
    published('x2', 'x', '2026-08-26T10:00:00.000Z')
    measured('x1', '24h', { impressions: 100, reactions: 5 })
    // x2 لم يُقَس بعد
    const { report } = await buildWeekly(db, FROM, TO)
    const x = report.platforms.find((p) => p.platform === 'x')!
    expect(x.published).toBe(2)
    expect(x.measured).toBe(1)
    expect(x.impressions).toBe(100)
    expect(x.impressionsFrom).toBe(1)
  })

  it('وما لم يُقَس يُقال نصّا ولا يُترك ليُستنتَج', async () => {
    published('x1', 'x', '2026-08-25T10:00:00.000Z')
    const { report } = await buildWeekly(db, FROM, TO)
    expect(report.notes.join(' ')).toContain('لم يُقَس بعد')
  })

  it('وأسبوعٌ بلا منشورٍ يقولها ولا يعرض أصفارا', async () => {
    const { report } = await buildWeekly(db, FROM, TO)
    expect(report.published).toBe(0)
    expect(report.platforms).toEqual([])
    expect(report.notes.join(' ')).toContain('لا منشورَ خرج')
  })
})

describe('الترتيبُ داخل النافذة', () => {
  const post = (
    id: string, window: '24h' | '72h' | '7d' | null,
    impressions: number | null, interactions: number | null,
  ): ReportPost => ({
    id, platform: 'x', text: id, publishedAt: '2026-08-25T10:00:00.000Z',
    window, impressions, interactions,
  })

  /**
   * **التفاعلُ يتراكم**، فمنشورُ سبعةِ أيّامٍ يغلب منشورَ يومٍ بعمره لا
   * بجودته. فلا يلتقيان في ترتيب.
   */
  it('لا يقارن نافذةً بنافذة', () => {
    const top = topOf([
      post('old', '7d', 1000, 90),
      post('a', '24h', 100, 50),
      post('b', '24h', 100, 10),
    ])
    // 7d فيها واحدٌ وحده، فيقع الترتيبُ في 24h
    expect(top?.window).toBe('24h')
    expect(top?.post.id).toBe('a')
  })

  it('وواحدٌ وحده ليس ترتيبا', () => {
    expect(topOf([post('a', '24h', 100, 50)])).toBeNull()
  })

  /** نسبةٌ تُحسب على ظهورٍ ناقصٍ تكافئ من لم يُقَس — فتُترك للعدد. */
  it('ويُرتَّب بالنسبة حين يكون لكلِّهم ظهور، وبالعدد حين ينقص', () => {
    const byRate = topOf([post('wide', '24h', 10000, 100), post('tight', '24h', 100, 20)])
    expect(byRate?.basis).toBe('rate')
    expect(byRate?.post.id).toBe('tight')

    const byCount = topOf([post('a', '24h', null, 100), post('b', '24h', 100, 20)])
    expect(byCount?.basis).toBe('count')
    expect(byCount?.post.id).toBe('a')
  })

  it('وغيرُ المقيس لا يدخل الترتيب', () => {
    expect(topOf([post('a', null, null, null), post('b', null, null, null)])).toBeNull()
  })
})

describe('الحفظُ شهادة', () => {
  /**
   * **التقريرُ يشهد على وقتٍ مضى.** ومقاييسُ تتراكم بعده تبدّل رقمه
   * بأثرٍ رجعيّ لو أُعيد الحساب — فلا يُعرَف أنُميت الحصادُ أم أُعيد.
   */
  it('أوّلُ كتابةٍ هي الشهادة، والثانيةُ لا تدهسها', async () => {
    const first = summarize([], FROM, TO, 1.5)
    expect(await saveWeekly(db, '2026-08-24', first)).toBe(true)

    const later = summarize([], FROM, TO, 99)
    expect(await saveWeekly(db, '2026-08-24', later)).toBe(false)

    const stored = await readReport(db, '2026-08-24')
    expect(stored?.body.spendUsd).toBe(1.5)
  })

  it('ويُقرأ بنسخته — فقارئٌ يجد رقما لا يعرفه يقول ذلك', async () => {
    await saveWeekly(db, '2026-08-24', summarize([], FROM, TO, 0))
    const stored = await readReport(db, '2026-08-24')
    expect(stored?.body.version).toBe(1)
  })

  it('وجسدٌ فاسدٌ يُسقَط وحده ولا يُسقط القائمة', async () => {
    await saveWeekly(db, '2026-08-24', summarize([], FROM, TO, 0))
    db.raw.exec(
      `INSERT INTO reports (id, from_at, to_at, body_json)
       VALUES ('2026-08-17', '2026-08-17T00:00:00Z', '2026-08-24T00:00:00Z', '{oops')`,
    )
    const list = await listReports(db)
    expect(list.map((r) => r.id)).toEqual(['2026-08-24'])
  })

  it('ولا تقريرَ بهذا المفتاح يعود null لا عطلا', async () => {
    expect(await readReport(db, 'لا-شيء')).toBeNull()
  })
})

describe('الإنفاق', () => {
  it('يُقرأ من الدفتر في مدّته وحدها', async () => {
    db.raw.exec(
      `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, at)
       VALUES ('c1', 'x', 'post', 1, 0.5, 0.5, '2026-08-25T10:00:00.000Z'),
              ('c2', 'x', 'post', 1, 9.0, 9.0, '2026-09-02T10:00:00.000Z')`,
    )
    const { report } = await buildWeekly(db, FROM, TO)
    expect(report.spendUsd).toBe(0.5)
  })
})
