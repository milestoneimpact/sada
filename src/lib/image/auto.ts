/**
 * كم صورةً آليّةً بقيت اليوم لهذا العميل (D-255) — **في موضعٍ واحد** يقرؤه مسارُ الكتابة وطابورُ «ابدأ» (D-258).
 * صفرٌ إن كان الإعدادُ مطفأً أو صدى موقوفًا، والعدُّ لكلّ صورةٍ وُلّدت اليوم في المنظّمة آليّةً أو بزرّ — ولو حُذف منشورُها.
 */
import type { Db } from '../tokens'
import { readSettings } from '../settings'

export async function autoImageRoom(db: Db, org: string, wanted?: boolean): Promise<number> {
  // ‏وسقفُ الصور الفعّالُ لهذا العميل (D-295): العامُّ أو ما كتبه لنفسه
  const s = await readSettings(db, org)
  // ‏واختيارُ الخطّة يغلب الإعدادَ العامّ (D-282): «ولّد صورةً مع كلّ منشور» في الخطّة يُرسَم ولو كان الإعدادُ مطفأً،
  // ‏و«لا» فيها لا يُرسَم ولو كان مرفوعًا — والسقفُ اليوميُّ والإيقافُ فوق الاثنين
  if (wanted === false || s.paused || (wanted !== true && !s.autoImage)) return 0
  /*
   * ‏**وما وُلّد لمنشورٍ حُذف يبقى في العدّ** (مراجعة D-322): العدُّ من صفوف `media` اليوم، و«احذفها» (`privacy/trash.ts`) يحذف صفوفَ
   * ‏المسوّدة، فكانت كلُّ مسوّدةٍ تُحذف تفتح بابَ صورةٍ مدفوعةٍ أخرى في يومها. فيُجمع إليها قيدُ الدفتر (D-008) لكلّ صورةٍ أو لقطةِ
   * ‏إنفوجرافيك وُلّدت اليوم لمنشورٍ لا صفَّ له — والقيدُ يبقى بعد الحذف، ويسقط من العدّ حين يعود المنشورُ بـ«تراجَع» فلا يُعدّ مرّتين.
   */
  const used = (await db
    .prepare(`SELECT (SELECT COUNT(*) FROM media WHERE org_id = ?1 AND created_at >= date('now') AND mime LIKE 'image/%')
                   + (SELECT COUNT(*) FROM cost_ledger c WHERE c.org_id = ?1 AND c.at >= date('now')
                        AND (c.operation LIKE 'image:%' OR (c.operation LIKE 'infographic:%' AND c.provider = 'cloudflare-browser'))
                        AND c.ref_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = c.ref_id AND p.org_id = ?1)) AS n`)
    .bind(org)
    .first<{ n: number }>()
    .catch(() => null))?.n ?? s.dailyImageCap
  return Math.max(0, s.dailyImageCap - used)
}
