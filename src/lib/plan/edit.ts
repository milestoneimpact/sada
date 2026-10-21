/**
 * تعديلُ بندٍ في الخطّة قبل كتابته (D-259 · AGENCY-PLAN و-٤) — **يومُه ومنصّتُه**، بالسحب في اللوحة أو بالقائمة.
 *
 * والتحقّقُ هنا لا في المتصفّح: اليومُ داخلَ مدى الخطّة (أسبوعٌ أو شهر)، والمنصّةُ من قائمةٍ مغلقة، والخطّةُ لعميلِ الجلسة
 * وغيرُ مستبدَلة. **والفهرسُ ثابت**: البنودُ لا تُرتَّب عند الحفظ، فبطاقةٌ في الصفحة لا يتبدّل بندُها تحتها.
 */
import type { Db } from '../tokens'
import { spanDays, type PlanSpan } from './prompt'
import { findAsset } from '../library'

export const PLAN_PLATFORMS = ['linkedin', 'x'] as const
export type PlanPlatform = (typeof PLAN_PLATFORMS)[number]

export type EditResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export function dayWithin(day: string, start: string, span: PlanSpan): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const d = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
  return Number.isInteger(d) && d >= 0 && d < spanDays(span)
}

export async function editPlanItem(
  db: Db,
  org: string,
  planId: string,
  index: number,
  change: { readonly day?: string; readonly platform?: string; readonly time?: string; readonly asset?: string },
): Promise<EditResult> {
  const row = await db
    .prepare("SELECT plan_json, week_start, span, status FROM plans WHERE id = ? AND org_id = ?")
    .bind(planId, org)
    .first<{ plan_json: string; week_start: string; span: string; status: string }>()
  if (row === null || row.status === 'superseded') return { ok: false, reason: 'لا خطّة بهذا المعرّف' }
  const plan = JSON.parse(row.plan_json) as { items: Record<string, unknown>[] }
  const item = Number.isInteger(index) ? plan.items[index] : undefined
  if (item === undefined) return { ok: false, reason: 'لا بند بهذا الرقم' }
  const span: PlanSpan = row.span === 'month' ? 'month' : 'week'
  if (change.day !== undefined) {
    if (!dayWithin(change.day, row.week_start, span)) return { ok: false, reason: 'اليوم خارج مدى الخطّة' }
    item['day'] = change.day
  }
  if (change.platform !== undefined) {
    if (!(PLAN_PLATFORMS as readonly string[]).includes(change.platform)) return { ok: false, reason: 'منصّة لا تُخطَّط' }
    item['platform'] = change.platform
  }
  if (change.time !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(change.time)) return { ok: false, reason: 'ساعة غير صالحة' }
    item['time'] = change.time
  }
  // ‏محتوى البند (D-260): «ولّد» يمحو الأصل، و«من المكتبة» يحفظ مرجعَه — ومصدرُ Drive يصير موضوعَ الكتابة نفسَه
  if (change.asset !== undefined) {
    if (change.asset === '') delete item['asset']
    else {
      const asset = await findAsset(db, org, change.asset)
      if (asset === null) return { ok: false, reason: 'لا ملفّ بهذا المرجع في أصول العميل' }
      if (asset.origin === 'drive') { item['sourceId'] = asset.ref.slice(2); delete item['asset'] }
      else item['asset'] = asset.ref
    }
  }
  await db.prepare('UPDATE plans SET plan_json = ? WHERE id = ? AND org_id = ?').bind(JSON.stringify(plan), planId, org).run()
  return { ok: true }
}

/**
 * **حذفُ بند** — والفهرسُ يتبدّل بعده، فالصفحةُ تُعاد بعد الحذف ولا تبقى بطاقاتُها القديمة. والخطّةُ المستبدَلة لا تُمسّ.
 */
export async function removePlanItem(db: Db, org: string, planId: string, index: number): Promise<EditResult> {
  const row = await db
    .prepare('SELECT plan_json, status FROM plans WHERE id = ? AND org_id = ?')
    .bind(planId, org)
    .first<{ plan_json: string; status: string }>()
  if (row === null || row.status === 'superseded') return { ok: false, reason: 'لا خطّة بهذا المعرّف' }
  const plan = JSON.parse(row.plan_json) as { items: unknown[] }
  if (!Number.isInteger(index) || index < 0 || index >= plan.items.length) return { ok: false, reason: 'لا بند بهذا الرقم' }
  plan.items.splice(index, 1)
  await db.prepare('UPDATE plans SET plan_json = ? WHERE id = ? AND org_id = ?').bind(JSON.stringify(plan), planId, org).run()
  return { ok: true }
}
