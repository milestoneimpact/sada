/**
 * ساعاتُ الذروة (D-106) — **وأهمُّ ما يُحرَس هنا الصمت.**
 *
 * ميزةٌ تقترح ساعةً تُقاس بما تقوله حين **لا** تعرف: **اقتراحٌ مخترَعٌ
 * أسوأُ من حقلٍ خامّ** — الخامُّ يقول «قرّر أنت»، والمخترَعُ يقول «قِسنا
 * لك» وهو لم يقس.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { MIN_SAMPLES, readPeaks } from './peak'

let db: FakeDb

async function seed(
  rows: readonly { hour: number; reactions: number | null; platform?: string }[],
): Promise<void> {
  const accountId = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
       VALUES (?, 'linkedin', 'org', ?, 'صفحةُ صدى', 'active')`,
    )
    .bind(accountId, accountId).run()

  let n = 0
  for (const r of rows) {
    n += 1
    const postId = `${accountId.slice(0, 8)}-${n}`
    const hh = String(r.hour).padStart(2, '0')
    await db
      .prepare(
        `INSERT INTO posts (id, platform, account_id, type, text, status,
                            idempotency_key, approved_at, approved_by, scheduled_at)
         VALUES (?, ?, ?, 'text', 'نصّ', 'published', ?,
                 '2026-09-01T09:00:00Z', 'المالك', '2026-09-01T10:00:00Z')`,
      )
      .bind(postId, r.platform ?? 'linkedin', accountId, `k-${postId}`).run()
    await db
      .prepare(
        `INSERT INTO publish_attempts
           (id, post_id, idempotency_key, attempt_no, request_json, status, at)
         VALUES (?, ?, ?, 1, '{}', 'succeeded', ?)`,
      )
      .bind(crypto.randomUUID(), postId, `a-${postId}`, `2026-09-0${(n % 9) + 1} ${hh}:30:00`)
      .run()
    await db
      .prepare(
        `INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares)
         VALUES (?, '24h', NULL, ?, 0, 0)`,
      )
      .bind(postId, r.reactions).run()
  }
}

/**
 * ساعةٌ بثلاثةٍ — **وهو أدنى ما تُرشَّح به** (انظر `PER_HOUR`).
 *
 * وكُتبت أوّلا بمنشورين، **فأثبت الاختبارُ أنّ الوسيطَ لا يقاوم عندها
 * شيئا** فرُفع الحدُّ في الشيفرة إلى ثلاثة.
 */
const trio = (hour: number, a: number, b: number, c: number) => [
  { hour, reactions: a }, { hour, reactions: b }, { hour, reactions: c },
]

beforeEach(() => { db = fakeDb() })

describe('ساعاتُ الذروة — والصمتُ حين لا يُعرَف', () => {
  it('**ولا يُقترَح شيءٌ دون العيّنة الدنيا**', async () => {
    await seed([...trio(9, 10, 12, 11), ...trio(14, 3, 4, 3)])
    const p = await readPeaks(db, 'linkedin')
    expect(p.samples).toBe(6)
    expect(p.hours).toHaveLength(0)
    expect(p.why).not.toBeNull()
  })

  /** **والسببُ يُقال نصّا ويعدّ ما بقي** — لا «لا بيانات» صمّاء. */
  it('ويقول كم قِيس وكم يلزم', async () => {
    await seed([...trio(9, 10, 12, 11)])
    const p = await readPeaks(db, 'linkedin')
    expect(p.why).toContain('3')
    expect(p.why).toContain(String(MIN_SAMPLES))
  })

  it('وقاعدةٌ فارغةٌ تماما تصمت ولا ترمي', async () => {
    const p = await readPeaks(db, 'linkedin')
    expect(p.samples).toBe(0)
    expect(p.hours).toHaveLength(0)
  })

  it('وبلوغُ العيّنة يفتح الاقتراحَ ويرتّبه نازلا', async () => {
    await seed([...trio(19, 40, 44, 42), ...trio(9, 20, 22, 21), ...trio(14, 5, 6, 5)])
    const p = await readPeaks(db, 'linkedin')
    expect(p.samples).toBe(9)
    expect(p.why).toBeNull()
    expect(p.hours.map((h) => h.hour)).toEqual([19, 9, 14])
  })

  /**
   * **والوسيطُ لا المتوسّط.**
   *
   * منشورٌ واحدٌ انتشر يرفع متوسّطَ ساعته فيصير الاقتراحُ صدى **حادثةٍ
   * لا عادة**. وهنا ساعةُ ‏٣ فيها شاذّةٌ ‏٥٠٠ ومتوسّطُها يفوق ‏١٩،
   * **ووسيطُها لا يفوقها**.
   */
  it('**وشاذّةٌ واحدةٌ لا تصنع ذروة**', async () => {
    // ‏ساعةُ ‏٣ فيها انتشارةٌ ‏٥٠٠ ومتوسّطُها ‏١٦٧ — يفوق ‏١٩ بأضعاف.
    // ‏ووسيطُها ‏١، لأنّ الثالثَ يُحيط بالشاذّة فلا تُزيح المركز
    await seed([
      ...trio(19, 40, 44, 42), ...trio(9, 20, 22, 21), ...trio(14, 5, 6, 5),
      { hour: 3, reactions: 500 }, { hour: 3, reactions: 1 }, { hour: 3, reactions: 1 },
    ])
    const p = await readPeaks(db, 'linkedin')
    expect(p.hours[0]!.hour).toBe(19)
    expect(p.hours.map((h) => h.hour)).not.toContain(3)
  })

  /** **وساعةٌ بمنشورٍ واحدٍ لا تُرشَّح** — وسيطُ الواحد هو الواحد. */
  it('ولا تُرشَّح ساعةٌ لم تبلغ الثلاث', async () => {
    await seed([
      ...trio(19, 40, 44, 42), ...trio(9, 20, 22, 21), ...trio(14, 5, 6, 5),
      { hour: 7, reactions: 900 }, { hour: 23, reactions: 800 }, { hour: 23, reactions: 800 },
    ])
    const p = await readPeaks(db, 'linkedin')
    expect(p.hours.map((h) => h.hour)).not.toContain(7)
    expect(p.hours.map((h) => h.hour)).not.toContain(23)
  })

  /** **ولكلّ منصّةٍ ذروتُها** — وخلطُهما يعطي وسطا لا يصف أيّا منهما. */
  it('ولا تُخلَط منصّةٌ بمنصّة', async () => {
    await seed([...trio(19, 40, 44, 42), ...trio(9, 20, 22, 21), ...trio(14, 5, 6, 5)])
    await seed(Array.from({ length: 9 }, (_, i) => (
      { hour: i < 5 ? 2 : 21, reactions: 99, platform: 'x' as const }
    )))
    const li = await readPeaks(db, 'linkedin')
    const x = await readPeaks(db, 'x')
    expect(li.samples).toBe(9)
    expect(x.samples).toBe(9)
    expect(li.hours[0]!.hour).toBe(19)
    expect(x.hours.map((h) => h.hour).sort((a, b) => a - b)).toEqual([2, 21])
  })

  it('وجدولٌ لم يُرحَّل لا يرمي — تصمت ولا تسقط', async () => {
    await db.raw.prepare('DROP TABLE metrics').run()
    const p = await readPeaks(db, 'linkedin')
    expect(p.samples).toBe(0)
    expect(p.hours).toHaveLength(0)
  })
})
