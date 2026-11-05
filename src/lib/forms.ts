/**
 * **إرسالٌ رُدّ** (D-302 · Tullis وAlbert: معدّلُ الأخطاء مقياسٌ لا رأي).
 *
 * كان الإرسالُ المردود يُردّ ويُنسى: لا رقمَ يقول كم مرّةً اصطدم المالكُ بحقلٍ أو قيمةٍ لا تُقبَل. فكلُّ ردٍّ لعيبٍ في المُدخَل
 * (لا لعطلٍ في الخادم) يُكتب سطرًا في سجلّ النشاط: `form.reject` بمساره وحقله ومفتاح خطئه من الكتالوج، ويُعَدّ في «ما عليك».
 */
import type { Db } from './tokens'
import { record } from './audit'
import type { ErrorId } from './errors/catalog'

export async function recordReject(
  db: Db,
  input: { readonly org: string; readonly path: string; readonly field: string; readonly id: ErrorId },
  request?: Request,
): Promise<void> {
  await record(db, { actor: 'panel', action: 'form.reject', target: input.path, detail: `${input.field}: ${input.id}`, org: input.org }, request)
}

/** كم إرسالًا رُدّ في الأيّام الأخيرة — لمنظّمةٍ واحدة. */
export async function rejectsLately(db: Db, org: string, days = 7): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS n FROM audit_log WHERE org_id = ? AND action = 'form.reject' AND at >= datetime('now', ?)")
    .bind(org, `-${days} days`)
    .first<{ n: number }>()
  return row?.n ?? 0
}
