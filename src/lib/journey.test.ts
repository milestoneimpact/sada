/**
 * رحلةُ المنشور (D-104).
 *
 * **وأهمُّ ما يُثبَت هنا اثنان**: أنّ كلَّ محطّةٍ مشتقّةٌ من صفٍّ حقيقيّ —
 * **فلا محطّةَ تُخترَع لتكتمل الصورة** — وأنّ «لا يُقاس» لا تُعرَض صفرا.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../test/fakes'
import { readJourney } from './journey'

let db: FakeDb
beforeEach(() => { db = fakeDb() })

async function seedPost(status = 'draft'): Promise<string> {
  const sourceId = crypto.randomUUID()
  await db
    .prepare(
      "INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES (?, ?, 'تقرير الأثر', 'text/plain', 'md5:a')",
    )
    .bind(sourceId, sourceId).run()
  const accountId = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
       VALUES (?, 'linkedin', 'org', 'x', 'صفحةُ صدى', 'active')`,
    )
    .bind(accountId).run()

  /*
   * **وقيودُ D-009 تُحترَم في البذرة كما في الإنتاج.**
   *
   * `posts` تشترط على `queued` و`published` اعتمادا ووقتا وحسابا. وبذرةٌ
   * تلتفّ عليها بجدولٍ مرخًّى **تختبر مخطّطا لا وجود له**.
   */
  const decided = status !== 'draft'
  const live = status === 'published' || status === 'queued'
  const postId = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO posts (id, platform, account_id, source_id, model, cost_usd, type,
                          text, status, idempotency_key, rationale,
                          approved_at, approved_by, scheduled_at)
       VALUES (?, 'linkedin', ?, ?, 'claude-opus-5', 0.012, 'text', ?, ?, ?, 'الوقفُ موسمُه',
               ?, ?, ?)`,
    )
    .bind(
      postId, accountId, sourceId, 'ن'.repeat(300), status, `k-${postId}`,
      decided ? '2026-09-01T09:00:00Z' : null,
      decided ? 'المالك' : null,
      live ? '2026-09-01T10:00:00Z' : null,
    )
    .run()
  return postId
}

describe('رحلةُ المنشور', () => {
  it('معرّفٌ لا وجودَ له يعطي null — لا رحلةً فارغة', async () => {
    expect(await readJourney(db, 'لا-شيء')).toBeNull()
  })

  it('**ولا محطّةَ تُخترَع**: مسوّدةٌ لم تُنشَر لا محطّةَ نشرٍ لها', async () => {
    const j = await readJourney(db, await seedPost())
    expect(j).not.toBeNull()
    const kinds = j!.stations.map((s) => s.kind)
    expect(kinds).toContain('source')
    expect(kinds).toContain('draft')
    expect(kinds).not.toContain('publish')
    expect(kinds).not.toContain('metrics')
    expect(kinds).not.toContain('schedule')
  })

  it('والكتابةُ تحمل نموذجَها وكلفتَها — وقد وقعت', async () => {
    const j = await readJourney(db, await seedPost())
    const draft = j!.stations.find((s) => s.kind === 'draft')!
    expect(draft.model).toBe('claude-opus-5')
    expect(draft.cost).toBeCloseTo(0.012)
    expect(draft.detail).toContain('الوقف')
  })

  it('والقرارُ يُسمّى بلسان المالك لا باسم العمود', async () => {
    const j = await readJourney(db, await seedPost('rejected'))
    const decision = j!.stations.find((s) => s.kind === 'decision')!
    expect(decision.title).toBe('رفضتَها')
    expect(decision.state).toBe('failed')
  })

  /**
   * **و«لا يُقاس» ليست صفرا** (D-048 · D-058).
   *
   * LinkedIn لا يعطي الظهورَ لمنشور عضو، فالعمودُ `null`. **وعرضُها صفرا
   * يقول «نُشرت فلم يرها أحد»** — وهو اتّهامٌ للمنشور بما لا يُعرَف عنه.
   */
  it('**والظهورُ null لا يُعرَض صفرا**', async () => {
    const postId = await seedPost('published')
    await db
      .prepare(
        `INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares)
         VALUES (?, '24h', NULL, 4, 1, 0)`,
      )
      .bind(postId).run()

    const j = await readJourney(db, postId)
    const m = j!.stations.find((s) => s.kind === 'metrics')!
    expect(m.detail).not.toContain('ظهور')
    expect(m.detail).toContain('تفاعل 4')
    // والصفرُ يُعرَض: «قِيس فكان لا شيء» خبرٌ، بخلاف «لا يُقاس»
    expect(m.detail).toContain('مشاركة 0')
  })

  it('ونافذةٌ لا تعطي شيئا تقول ذلك ولا تُعرَض فارغة', async () => {
    const postId = await seedPost('published')
    await db
      .prepare(
        `INSERT INTO metrics (post_id, window, impressions, reactions, comments, shares)
         VALUES (?, '24h', NULL, NULL, NULL, NULL)`,
      )
      .bind(postId).run()
    const j = await readJourney(db, postId)
    expect(j!.stations.find((s) => s.kind === 'metrics')!.detail).toContain('لا تُقاس')
  })

  /**
   * **والمحاولاتُ كلُّها تُعرَض لا آخرُها.**
   *
   * منشورٌ نجح من الثالثة قصّتُه في الأولَيَين، **وهي التي تُقرأ حين
   * يُسأل «لماذا تأخّر»**.
   */
  it('وكلُّ محاولةِ نشرٍ محطّةٌ — لا آخرُها وحدَها', async () => {
    const postId = await seedPost('published')
    for (const [n, status] of [[1, 'failed'], [2, 'failed'], [3, 'succeeded']] as const) {
      await db
        .prepare(
          `INSERT INTO publish_attempts
             (id, post_id, idempotency_key, attempt_no, request_json, status, platform_post_id)
           VALUES (?, ?, ?, ?, '{}', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(), postId, `k-${postId}-${n}`, n, status,
          status === 'succeeded' ? 'urn:li:1' : null,
        )
        .run()
    }
    const j = await readJourney(db, postId)
    const pub = j!.stations.filter((s) => s.kind === 'publish')
    expect(pub).toHaveLength(3)
    expect(pub[0]!.state).toBe('failed')
    expect(pub[2]!.state).toBe('done')
    expect(pub[2]!.detail).toBe('urn:li:1')
  })

  /**
   * **و«أُرسلت» ليست فشلا.**
   *
   * `sent` طلبٌ غادر ولم يعد جوابُه. **وصبغُها بلون العطل يقول إنّ شيئا
   * انكسر** — ولم ينكسر. والفرقُ بين «لم تنجح» و«لم يُعرَف بعد» هو
   * الفرقُ بين قرارٍ وانتظار.
   */
  it('و«أُرسلت» تنتظر ولا تُعدّ عطلا', async () => {
    const postId = await seedPost('queued')
    await db
      .prepare(
        `INSERT INTO publish_attempts
           (id, post_id, idempotency_key, attempt_no, request_json, status)
         VALUES (?, ?, ?, 1, '{}', 'sent')`,
      )
      .bind(crypto.randomUUID(), postId, `k-${postId}-1`).run()
    const j = await readJourney(db, postId)
    const pub = j!.stations.find((s) => s.kind === 'publish')!
    expect(pub.state).toBe('pending')
    // ‏واسمُ العمود لا يُعرَض حرفا: `sent` ليست كلمةً يقرأها مالك
    expect(pub.detail).not.toContain('sent')
  })

  /**
   * **والمجموعُ من الدفتر لا من جمع المحطّات** (D-008).
   *
   * الدفترُ يُكتَب **قبل** أن يُعدَّ النداءُ ناجحا، فنداءٌ دُفع ثمنُه ثمّ
   * فشل يبقى فيه **ولا محطّةَ له**. **والفرقُ هو ما دُفع بلا أثر.**
   */
  it('والمجموعُ من cost_ledger — ويشمل ما دُفع بلا أثر', async () => {
    const postId = await seedPost()
    for (const total of [0.012, 0.04, 0.03]) {
      await db
        .prepare(
          `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id)
           VALUES (?, 'anthropic', 'draft', 1, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), total, total, postId).run()
    }
    const j = await readJourney(db, postId)
    // ٠٫٠٨٢ من الدفتر، بينما محطّةُ الكتابة وحدَها ٠٫٠١٢
    expect(j!.spent).toBeCloseTo(0.082)
    const stationSum = j!.stations.reduce((s, x) => s + (x.cost ?? 0), 0)
    expect(j!.spent).toBeGreaterThan(stationSum)
  })

  it('وجدولٌ لم يُرحَّل لا يرمي — الرحلةُ تُقرأ ناقصةً لا تسقط', async () => {
    const postId = await seedPost()
    await db.raw.prepare('DROP TABLE metrics').run()
    const j = await readJourney(db, postId)
    expect(j).not.toBeNull()
    expect(j!.stations.some((s) => s.kind === 'draft')).toBe(true)
  })
})
