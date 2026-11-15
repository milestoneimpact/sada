/**
 * **ما تعذّرت كتابتُه من بنود الخطّة** (PL-23).
 *
 * كان مستهلكُ الكتابة يُقرّ الفشلَ الذي لا تصلحه الإعادة (مفتاحٌ رُفض، سقفٌ بلغ، مصدرٌ غاب) ويسكت، وما استنفد إعاداته
 * يذهب إلى طابور الأعطال ويُقرّ هناك صامتًا. فتبقى المراجعةُ تقول «صدى يكتب الباقي الآن» إلى الأبد. صار كلُّ فشلٍ نهائيّ
 * صفًّا في سجلّ النشاط بسببه، تقرؤه المراجعةُ فتقول «تعذّرت كتابته: السبب» ومعه «أعد كتابة ما تعذّر». ولا ترحيل.
 */
import type { Db } from '../tokens'

export const DRAFT_FAILED = 'plan.draft.failed'

/** مرجعُ البند في السجلّ: معرّفُه، أو مصدرُه ومنصّتُه لبندٍ قبل D-329. */
export function draftRef(itemId: string | undefined, sourceId: string, platform: string): string {
  return itemId !== undefined && itemId !== '' ? 'item:' + itemId : sourceId + ':' + platform
}

export async function recordDraftFailure(db: Db, org: string, planId: string, ref: string, reason: string): Promise<void> {
  await db.prepare('INSERT INTO audit_log (org_id, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .bind(org, 'system', DRAFT_FAILED, planId + '|' + ref, reason.slice(0, 300)).run()
    .catch((error: unknown) => console.warn({ job: 'plan-draft-failed-record', failed: String(error) }))
}

/** آخرُ سببٍ لكلّ بندٍ في الخطّة — ولا يهمّ ما سبق إعادةَ الكتابة: البطاقةُ المكتوبة لا تقرؤه. */
export async function draftFailures(db: Db, org: string, planId: string): Promise<ReadonlyMap<string, string>> {
  const rows = await db.prepare(`SELECT target, detail FROM audit_log WHERE org_id = ? AND action = ? AND target LIKE ? ORDER BY id DESC LIMIT 500`)
    .bind(org, DRAFT_FAILED, planId + '|%')
    .all<{ target: string; detail: string | null }>().then((r) => r.results).catch(() => [])
  const out = new Map<string, string>()
  for (const r of rows) {
    const ref = r.target.slice(planId.length + 1)
    if (!out.has(ref)) out.set(ref, r.detail ?? 'سببٌ لم يُكتب')
  }
  return out
}
