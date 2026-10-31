/**
 * كم صورةً آليّةً بقيت اليوم لهذا العميل (D-255) — **في موضعٍ واحد** يقرؤه مسارُ الكتابة وطابورُ «ابدأ» (D-258).
 * صفرٌ إن كان الإعدادُ مطفأً أو صدى موقوفًا، والعدُّ لكلّ صورةٍ وُلّدت اليوم في المنظّمة آليّةً أو بزرّ.
 */
import type { Db } from '../tokens'
import { readSettings } from '../settings'

export async function autoImageRoom(db: Db, org: string, wanted?: boolean): Promise<number> {
  const s = await readSettings(db)
  // ‏واختيارُ الخطّة يغلب الإعدادَ العامّ (D-282): «ولّد صورةً مع كلّ منشور» في الخطّة يُرسَم ولو كان الإعدادُ مطفأً،
  // ‏و«لا» فيها لا يُرسَم ولو كان مرفوعًا — والسقفُ اليوميُّ والإيقافُ فوق الاثنين
  if (wanted === false || s.paused || (wanted !== true && !s.autoImage)) return 0
  const used = (await db
    .prepare("SELECT COUNT(*) AS n FROM media WHERE org_id = ? AND created_at >= date('now') AND mime LIKE 'image/%'")
    .bind(org)
    .first<{ n: number }>()
    .catch(() => null))?.n ?? s.dailyImageCap
  return Math.max(0, s.dailyImageCap - used)
}
