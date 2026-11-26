/**
 * ‏**منشورٌ إلى وجهتين: منشوران** (D-423).
 *
 * ‏`posts.account_id` حسابٌ واحد، و`idempotency_key` لكلّ منشور (D-004). فاختيارُ «LinkedIn · حسابي» و«LinkedIn · صفحة …»
 * ‏معًا لا يُرسل المنشورَ مرّتين بمفتاحٍ واحد: **تُنسخ نسخةٌ لكلّ وجهةٍ زائدة** بمفتاحٍ مشتقٍّ من الأصل والحساب
 * ‏(`destinationKeyOf`)، فلا تُنشأ مرّتين لضغطتين، وتُجدوَل كلٌّ بـ `schedulePost` نفسِها بحرّاسها (D-019).
 *
 * ‏**وسقوطُ واحدةٍ لا يوقف الأخرى**: لكلٍّ نتيجتُها، والطابورُ يرسل كلًّا وحدها، والناشرُ يحكم على كلٍّ بحسابها.
 * ‏ونسخةٌ لم تُجدوَل تُمحى إن أُنشئت الآن — لا يبقى على اللوح منشورٌ لم يطلبه أحد.
 */
import type { Db } from '../tokens'
import { destinationKeyOf } from '../linkedinPage'
import { schedulePost, type ScheduleResult } from './job'

export interface DestinationResult {
  readonly accountId: string
  readonly postId: string
  readonly result: ScheduleResult
}

/** ‏نسخةُ المنشور لوجهةٍ أخرى — بنصّه ونوعه واعتماده ووسيطه الجاهز، وبمفتاحها. تعيد معرّفَها، وأأُنشئت الآن. */
export async function cloneForDestination(db: Db, postId: string, accountId: string, org: string): Promise<{ id: string; created: boolean } | { reason: string }> {
  const post = await db
    .prepare('SELECT id, status, idempotency_key FROM posts WHERE id = ? AND org_id = ?')
    .bind(postId, org)
    .first<{ id: string; status: string; idempotency_key: string }>()
  if (post === null) return { reason: 'لا منشور بهذا المعرّف' }
  const key = destinationKeyOf(post.idempotency_key, accountId)
  const twin = await db.prepare('SELECT id FROM posts WHERE idempotency_key = ? AND org_id = ?').bind(key, org).first<{ id: string }>()
  if (twin !== null) return { id: twin.id, created: false }
  if (post.status !== 'approved' && post.status !== 'edited') return { reason: `حالتُه «${post.status}» — والجدولة للمعتمَد وحده` }
  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO posts (id, org_id, brand_id, platform, source_id, source_hash, model, cost_usd, type, text, media_json, source_refs,
                          rationale, has_url, status, idempotency_key, approved_by, approved_at, original_text, copy_origin, edited_in_sada)
       SELECT ?1, org_id, brand_id, platform, source_id, source_hash, model, 0, type, text, media_json, source_refs,
              rationale, has_url, status, ?2, approved_by, approved_at, original_text, copy_origin, edited_in_sada
         FROM posts WHERE id = ?3 AND org_id = ?4`,
    )
    .bind(id, key, postId, org)
    .run()
  // ‏والوسيطُ الجاهزُ يُنسخ بمفتاحه — معرّفُه عند المنصّة لا يُنسخ: الحسابُ غيرُ الحساب
  await db
    .prepare(
      `INSERT INTO media (id, post_id, org_id, brand_id, r2_key, mime, bytes, prompt, model, cost_usd, status, idempotency_key, note, headline, width, height, upload_id, duration_ms)
       SELECT lower(hex(randomblob(16))), ?1, org_id, brand_id, r2_key, mime, bytes, prompt, model, 0, status, idempotency_key || ':dest:' || ?2, note, headline, width, height, upload_id, duration_ms
         FROM media WHERE post_id = ?3 AND org_id = ?4 AND status = 'ready'`,
    )
    .bind(id, accountId, postId, org)
    .run()
  return { id, created: true }
}

/**
 * ‏يجدول المنشورَ على وجهةٍ أو أكثر: الأولى على المنشور نفسِه، وكلُّ زائدةٍ على نسختها. تُعاد نتيجةٌ لكلّ وجهةٍ بترتيبها.
 */
export async function scheduleDestinations(
  db: Db,
  postId: string,
  accountIds: readonly string[],
  when: string,
  now: Date,
  org: string,
  holdSeconds = 0,
): Promise<DestinationResult[]> {
  const unique = [...new Set(accountIds.filter((a) => a !== ''))]
  const [first, ...rest] = unique.length === 0 ? [''] : unique
  const out: DestinationResult[] = []
  // ‏النسخُ قبل الأصل: الأصلُ بعد جدولته «queued»، والنسخةُ تُؤخذ من معتمَد
  for (const accountId of rest) {
    const clone = await cloneForDestination(db, postId, accountId, org)
    if ('reason' in clone) { out.push({ accountId, postId, result: { ok: false, reason: clone.reason } }); continue }
    const result = await schedulePost(db, clone.id, accountId, when, now, org, holdSeconds)
    if (!result.ok && clone.created) {
      await db.prepare('DELETE FROM media WHERE post_id = ? AND org_id = ?').bind(clone.id, org).run()
      await db.prepare('DELETE FROM posts WHERE id = ? AND org_id = ?').bind(clone.id, org).run()
    }
    out.push({ accountId, postId: clone.id, result })
  }
  out.unshift({ accountId: first!, postId, result: await schedulePost(db, postId, first!, when, now, org, holdSeconds) })
  return out
}

/**
 * ‏**«تراجَع» يشمل نُسخَ الوجهات** (مراجعة D-423): الجدولةُ الواحدةُ صنعت نسخةً لكلّ وجهةٍ زائدة (`<المفتاح>:dest:`) بالموعد
 * ‏نفسِه. فتُمحى كلُّ نسخةٍ ما زالت في الطابور لم تُرسَل بموعد ذلك الإشعار، ووسيطُها. وما أُرسل يُعدّ ولا يُمسّ.
 */
export async function withdrawCopies(db: Db, postId: string, org: string, at: string): Promise<{ withdrawn: number; stuck: number }> {
  const post = await db.prepare('SELECT idempotency_key FROM posts WHERE id = ? AND org_id = ?').bind(postId, org).first<{ idempotency_key: string }>()
  if (post === null) return { withdrawn: 0, stuck: 0 }
  const prefix = post.idempotency_key + ':dest:'
  const { results } = await db
    .prepare('SELECT id, status, dispatched_at FROM posts WHERE org_id = ? AND substr(idempotency_key, 1, ?) = ? AND scheduled_at = ?')
    .bind(org, prefix.length, prefix, at)
    .all<{ id: string; status: string; dispatched_at: string | null }>()
  let withdrawn = 0
  let stuck = 0
  for (const r of results) {
    if (r.status !== 'queued' || r.dispatched_at !== null) { stuck += 1; continue }
    await db.prepare('DELETE FROM media WHERE post_id = ? AND org_id = ?').bind(r.id, org).run()
    await db.prepare("DELETE FROM posts WHERE id = ? AND org_id = ? AND status = 'queued' AND dispatched_at IS NULL").bind(r.id, org).run()
    withdrawn += 1
  }
  return { withdrawn, stuck }
}
