/**
 * **«اعتمد الخطّة وجدولها»** (D-381) — مسوّداتُ الحزمة كلُّها بضغطةٍ واحدة في مواعيدها من الحزمة.
 *
 * `package_due` يُكتب في `apply.ts` بساعة المالك («2026-11-26 09:00») ولا شيءَ كان يحوّله إلى `scheduled_at`.
 * هنا يُقرأ بمنطقة المالك (`localToUtc`) ويُحوَّل إلى صيغة التخزين (`YYYY-MM-DDTHH:MM` بـ UTC)، ثمّ **الطريقُ
 * نفسُه الذي في صفحة المنشورات**: `decide` للاعتماد (`approved_by` و`approved_at`) ثمّ `schedulePost` بحرّاسها.
 * لا طريقَ نشرٍ موازٍ، ولا طلبَ خارجيَّ ولا كلفةَ عند الجدولة: الطابورُ يخرج بها في موعدها بمفاتيحها (D-004).
 *
 * والضغطةُ الثانية لا تغيّر شيئًا: المجدولُ (`queued`) لا يُختار ثانيةً.
 */
import type { Db } from '../tokens'
import { decide } from '../draft/store'
import { schedulePost } from '../schedule/job'
import { localToUtc } from '../time/local'
import { isLinkedInPage, listAccounts } from '../channels'
import { videoMisfit, type VideoTarget } from '../publish/video'

export type SkipReason = 'text' | 'past' | 'account' | 'video' | 'time'

export const SKIP_SAY: Readonly<Record<SkipReason, string>> = {
  text: 'بلا نصّ',
  past: 'موعدُه مضى',
  account: 'لا حساب متّصلًا لمنصّته',
  video: 'مقطعُه لا يناسب حدود المنصّة',
  time: 'موعدُه غير مفهوم',
}

export interface PackageSlot {
  readonly id: string
  readonly platform: string
  /** UTC بصيغة التخزين `YYYY-MM-DDTHH:MM`. */
  readonly at: string
  readonly account: string
  readonly draft: boolean
}

export interface PackageSchedulePlan {
  readonly ready: readonly PackageSlot[]
  readonly skipped: Readonly<Record<SkipReason, number>>
}

/** «2026-11-26 09:00» بساعة المالك إلى UTC، و`null` لما لا يُفهم. */
export function dueToUtc(due: string | null, zone: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec((due ?? '').trim())
  if (m === null) return null
  const at = localToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), zone)
  return at === null ? null : at.toISOString().slice(0, 16)
}

const VIDEO_TARGETS: readonly string[] = ['x', 'linkedin']

/** ما سيُجدوَل وما يُتخطّى ولماذا — يقرؤه التأكيدُ قبل الضغطة والتنفيذُ نفسُه. */
export async function planPackageSchedule(db: Db, org: string, zone: string | null, now: Date): Promise<PackageSchedulePlan> {
  const skipped: Record<SkipReason, number> = { text: 0, past: 0, account: 0, video: 0, time: 0 }
  const { results } = await db
    .prepare(
      `SELECT id, platform, status, text, package_due FROM posts
        WHERE org_id = ? AND package_item_no IS NOT NULL AND status IN ('draft', 'approved', 'edited')
        ORDER BY package_due, platform, id`,
    )
    .bind(org)
    .all<{ id: string; platform: string; status: string; text: string | null; package_due: string | null }>()
    .catch(() => ({ results: [] as { id: string; platform: string; status: string; text: string | null; package_due: string | null }[] }))
  if (results.length === 0) return { ready: [], skipped }
  const accounts = await listAccounts(db, org)
  const nowKey = now.toISOString().slice(0, 16)
  const ready: PackageSlot[] = []
  for (const p of results) {
    if ((p.text ?? '').trim() === '') { skipped.text += 1; continue }
    const at = dueToUtc(p.package_due, zone)
    if (at === null) { skipped.time += 1; continue }
    if (at <= nowKey) { skipped.past += 1; continue }
    const account = accounts.find((a) => a.platform === p.platform && a.status === 'active' && !isLinkedInPage(a))
    if (account === undefined) { skipped.account += 1; continue }
    if (VIDEO_TARGETS.includes(p.platform)) {
      const { results: videos } = await db
        .prepare(
          `SELECT m.bytes, COALESCE(m.duration_ms, u.duration_ms) AS duration_ms FROM media m LEFT JOIN uploads u ON u.id = m.upload_id
            WHERE m.post_id = ? AND m.org_id = ? AND m.status = 'ready' AND m.mime LIKE 'video/%'`,
        )
        .bind(p.id, org)
        .all<{ bytes: number; duration_ms: number | null }>()
      if (videos.some((v) => videoMisfit(p.platform as VideoTarget, v.bytes, v.duration_ms) !== null)) { skipped.video += 1; continue }
    }
    ready.push({ id: p.id, platform: p.platform, at, account: account.id, draft: p.status === 'draft' })
  }
  return { ready, skipped }
}

export interface PackageScheduleResult extends PackageSchedulePlan {
  readonly scheduled: readonly PackageSlot[]
  readonly failed: readonly { readonly id: string; readonly reason: string }[]
}

/** الاعتمادُ ثمّ الجدولة، منشورًا منشورًا — وواحدٌ يتعثّر لا يوقف البقيّة. */
export async function schedulePackage(db: Db, org: string, zone: string | null, now: Date, by: string): Promise<PackageScheduleResult> {
  const plan = await planPackageSchedule(db, org, zone, now)
  const scheduled: PackageSlot[] = []
  const failed: { id: string; reason: string }[] = []
  for (const slot of plan.ready) {
    if (slot.draft) {
      const row = await db.prepare('SELECT text FROM posts WHERE id = ? AND org_id = ?').bind(slot.id, org).first<{ text: string }>()
      const approved = await decide(db, org, slot.id, { kind: 'approve', text: row?.text ?? '' }, by)
      if (!approved.ok) { failed.push({ id: slot.id, reason: approved.reason }); continue }
    }
    const done = await schedulePost(db, slot.id, slot.account, slot.at, now, org)
    if (done.ok) scheduled.push(slot)
    else failed.push({ id: slot.id, reason: done.reason })
  }
  return { ...plan, scheduled, failed }
}
