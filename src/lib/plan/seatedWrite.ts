/**
 * **«اكتب المسكَّن من أفكاره»** (D-393) — بنودُ خطّةٍ سُكّنت «كما هي» نصُّها فكرتُها؛ تُكتب هنا منشوراتٍ في مكانها بقواعد
 * منصّتها المحفوظة مع الخطّة (`plans.choices_json.rules`، من ورقة «الإرشادات»)، بباب الكتابة نفسِه (`draftSeatedFromIdea`).
 *
 * لا جديدَ في الحرّاس: الإنفاقُ لمن يعتمد (D-318، `SPEND_PATHS`)، والدفترُ قبل النجاح (D-008)، والمفتاحُ لا يتغيّر (D-004).
 */
import type { Db } from '../tokens'
import { draftSeatedFromIdea, type DraftDeps, type DraftOutcome } from '../draft/job'
import { rulesSection } from './guidelines'
import { readChoices } from './prompt'

/** ما سكّنه «ابنِ كما هي» من الملفّ ولم يُكتب بعد. */
export const SEATED_RATIONALE = 'من خطّتك المرفوعة'

/** مسوّداتُ الخطّة التي نصُّها فكرتُها بعد — مسكَّنةٌ من ملفّ، لم يكتبها نموذجٌ ولم يعدّلها أحد. */
export async function seatedIdeaPosts(db: Db, org: string, planId: string): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT id FROM posts WHERE org_id = ? AND plan_id = ? AND status = 'draft' AND model = 'owner'
               AND rationale = ? AND plan_item_id IS NOT NULL AND coalesce(edited_in_sada, 0) = 0 ORDER BY created_at LIMIT 200`)
    .bind(org, planId, SEATED_RATIONALE).all<{ id: string }>()
    .catch(() => ({ results: [] as { id: string }[] }))
  return results.map((r) => r.id)
}

/** قواعدُ منصّة المنشور من خطّته، قسمًا جاهزًا للموجّه — وفارغٌ بلا قواعد. */
export async function rulesForPost(db: Db, org: string, postId: string): Promise<string> {
  const row = await db
    .prepare('SELECT p.platform, pl.choices_json FROM posts p JOIN plans pl ON pl.id = p.plan_id AND pl.org_id = p.org_id WHERE p.id = ? AND p.org_id = ?')
    .bind(postId, org).first<{ platform: string; choices_json: string | null }>()
  if (row === null) return ''
  return rulesSection(readChoices(row.choices_json).rules, row.platform)
}

/** يكتب مسوّدةً مسكَّنةً من فكرتها بقواعد خطّتها. */
export async function writeSeatedPost(deps: DraftDeps & { readonly org: string }, postId: string): Promise<DraftOutcome> {
  return draftSeatedFromIdea(deps, postId, await rulesForPost(deps.db, deps.org, postId))
}

/** رسالةُ الطابور: معرّفٌ لا نصّ. */
export interface SeatedWriteMessage {
  readonly seatedWrite: { readonly org: string; readonly postId: string; readonly planId: string }
}
