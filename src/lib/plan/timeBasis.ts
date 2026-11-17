/**
 * **أساسُ وقت بنود الخطّة** (D-384): `plan_json.items[].day/time` بتوقيت المالك في كلّ مكان، والتحويلُ إلى UTC
 * عند الجدولة وحدها (`slotFor`، و`moveItem`). وما كُتب قبل الإصلاح بـ UTC (`plans.time_basis = 'utc'`، 0064) يُحوَّل
 * إلى توقيت المالك مرّةً واحدة عند أوّل قراءة، بتحديثٍ مشروطٍ لا يُعاد.
 */
import type { Db } from '../tokens'
import { localParts } from '../time/zone'
import { storedZone } from '../time/ownerZone'

const two = (n: number): string => String(n).padStart(2, '0')

/** يومٌ وساعةٌ بـ UTC إلى توقيت المنطقة — وما لا يُقرأ يبقى كما هو. */
export function utcToLocalSlot(day: string, time: string, zone: string | null): { day: string; time: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return { day, time }
  const at = new Date(day + 'T' + time + ':00Z')
  if (Number.isNaN(at.getTime())) return { day, time }
  const l = localParts(at, zone)
  return { day: String(l.year) + '-' + two(l.month) + '-' + two(l.day), time: two(l.hour) + ':' + two(l.minute) }
}

/** بنودُ خطّةٍ مخزونةٍ بـ UTC إلى توقيت المالك. */
export function localizeItems<T extends { readonly day: string; readonly time: string }>(items: readonly T[], zone: string | null): T[] {
  return items.map((i) => ({ ...i, ...utcToLocalSlot(i.day, i.time, zone) }))
}

/**
 * خطّةٌ بـ `time_basis = 'utc'` تُحوَّل وتُختم `local`. **متساوي القوّة**: الشرطُ في التحديث يجعل الثانيةَ لا شيء،
 * وخطّةٌ `local` لا تُقرأ ثانية. وعطلٌ (جدولٌ لم يُرحَّل) لا يكسر الصفحة.
 */
export async function localizePlan(db: Db, org: string, planId: string): Promise<void> {
  try {
    const row = await db.prepare("SELECT plan_json FROM plans WHERE id = ? AND org_id = ? AND time_basis = 'utc'")
      .bind(planId, org).first<{ plan_json: string }>()
    if (row === null) return
    const plan = JSON.parse(row.plan_json) as { items?: { day: string; time: string }[] }
    const zone = await storedZone(db)
    const next = { ...plan, items: localizeItems(plan.items ?? [], zone) }
    await db.prepare("UPDATE plans SET plan_json = ?, time_basis = 'local' WHERE id = ? AND org_id = ? AND time_basis = 'utc' AND plan_json = ?")
      .bind(JSON.stringify(next), planId, org, row.plan_json).run()
  } catch {
    // ‏قبل 0064 أو JSON فاسد: يبقى كما كان
  }
}
