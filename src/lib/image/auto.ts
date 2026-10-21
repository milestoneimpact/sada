/**
 * كم صورةً آليّةً بقيت اليوم لهذا العميل (D-255) — **في موضعٍ واحد** يقرؤه مسارُ الكتابة وطابورُ «ابدأ» (D-258).
 * صفرٌ إن كان الإعدادُ مطفأً أو صدى موقوفًا، والعدُّ لكلّ صورةٍ وُلّدت اليوم في المنظّمة آليّةً أو بزرّ.
 */
import type { Db } from '../tokens'
import { readSettings } from '../settings'

export async function autoImageRoom(db: Db, org: string): Promise<number> {
  const s = await readSettings(db)
  if (!s.autoImage || s.paused) return 0
  const used = (await db
    .prepare("SELECT COUNT(*) AS n FROM media WHERE org_id = ? AND created_at >= date('now') AND mime LIKE 'image/%'")
    .bind(org)
    .first<{ n: number }>()
    .catch(() => null))?.n ?? s.dailyImageCap
  return Math.max(0, s.dailyImageCap - used)
}
