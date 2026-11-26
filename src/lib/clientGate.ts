/**
 * **حارسُ موافقة العميل** (D-412): لعميلٍ فُتح له «لا يُنشر قبل موافقته» لا يُجدوَل منشورٌ حتّى يقول فيه «موافق» برابط الموافقة
 * (D-353). والمطابقةُ بالمراجعة نفسِها التي يراها العميل (`reviewModel` وبصمةُ البند `itemKey`)، فما وافق عليه هو ما يُجدوَل.
 *
 * ‏- بصمةُ البند تحمل يومه وساعته: **بندٌ نُقل بعد الموافقة يُطلب له رأيٌ جديد** — وافق العميلُ على موعدٍ لا على كلّ موعد.
 * ‏- آخرُ رأيٍ يغلب: «أطلب تعديلًا» بعد «موافق» تُمسك.
 * ‏- منشورٌ خارج الخطّة لا يراه العميل في رابطه، فلا يُجدوَل لهذا العميل.
 *
 * ‏يُستورد من `schedulePost` استيرادًا عند الحاجة: المراجعةُ تستورد الجدولةَ، فلا حلقة.
 */
import type { Db } from './tokens'
import { planForId } from './plan/job'
import { reviewModel } from './plan/review'
import { verdictsFor } from './clientReview'

export async function clientApprovalHold(db: Db, org: string, postId: string): Promise<string | null> {
  const own = await db.prepare('SELECT id, plan_id, idempotency_key FROM posts WHERE id = ? AND org_id = ?').bind(postId, org)
    .first<{ id: string; plan_id: string | null; idempotency_key: string }>().catch(() => null)
  // ‏**ونسخةُ الوجهة الثانية يُحكم عليها برأي أصلها** (مراجعة D-425): لا تحمل `plan_id` عمدًا — لو حملته لجدولها «جدوِل الخطّة»
  // ‏على أوّل حسابٍ للمنصّة ونُشر المنشورُ مرّتين على الحساب نفسِه. فأصلُها يُعرف بمفتاحها المشتقّ (`destinationKeyOf`)
  const cut = own === null || own.plan_id !== null ? -1 : own.idempotency_key.lastIndexOf(':dest:')
  const post = cut < 0 ? own : await db.prepare('SELECT id, plan_id FROM posts WHERE idempotency_key = ? AND org_id = ?')
    .bind(own!.idempotency_key.slice(0, cut), org).first<{ id: string; plan_id: string | null }>().catch(() => null)
  if (post === null || post.plan_id === null) return 'هذا العميلُ يوافق قبل النشر، وهذا المنشورُ خارج الخطّة فلا يراه في رابط الموافقة'
  const plan = await planForId(db, org, post.plan_id)
  if (plan === null) return 'هذا العميلُ يوافق قبل النشر، وخطّةُ هذا المنشور لم تعد قائمة'
  const [model, verdicts] = await Promise.all([reviewModel(db, org, plan), verdictsFor(db, org, plan.id)])
  const card = model.cards.find((c) => c.post?.id === post.id)
  if (card === undefined) return 'هذا العميلُ يوافق قبل النشر، ولا بندَ لهذا المنشور في خطّته'
  const verdict = verdicts.get(card.key)
  if (verdict === undefined) return 'هذا العميلُ يوافق قبل النشر، ولم يوافق على هذا المنشور بعد — أرسل له رابط الموافقة'
  if (verdict.verdict !== 'approve') return 'طلب العميلُ تعديل هذا المنشور — عدّله ثمّ اطلب موافقته ثانيةً'
  return null
}
