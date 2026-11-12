/**
 * نبضُ التشغيل (D-158) — صفٌّ لكلّ دورةٍ يقول متى دارت آخرَ مرّةٍ وبماذا خرجت.
 *
 * **والكتابةُ لا تُسقط الدورة**: نبضٌ يفشل في الكتابة يُبلَع، فالدورةُ
 * أهمُّ من أثرها. وهو ما تفعله `record` في سجلّ التدقيق.
 */
import type { Db } from '../tokens'
import { parseSqliteUtc } from '../format'

export type Job = 'renew' | 'dispatch' | 'scan' | 'alerts' | 'metrics' | 'report' | 'publish' | 'backup'
export type Outcome = 'ok' | 'failed' | 'skipped'

export interface Heartbeat {
  readonly job: Job
  readonly at: string
  readonly outcome: Outcome
  readonly detail: string | null
  /** ‏أوّلُ نبضٍ ساقطٍ بعد آخر ما لم يسقط (مراجعة D-320) — `null` لما لم يسقط آخرَ مرّة. */
  readonly failedSince?: string | null
}

/**
 * ما يُتوقَّع لكلّ دورة — من `wrangler.toml` لا من الظنّ.
 *
 * `renew` و`dispatch` على كلّ تشغيل (كلَّ ربع ساعة، ومعها ‏:07 كلَّ ساعة).
 * `metrics` كلَّ ساعة. `scan` و`alerts` يوميًّا عند ‏03:00. `report` أسبوعيًّا
 * الاثنين ‏04:14. و`publish` عند الطلب: لا موعدَ له فلا يُحكَم بالتأخّر.
 * ‏و`backup` (D-321) يُسأل كلَّ يومٍ عند ‏03:03 ويأخذ نسخةً كلَّ سبعة أيّام، وينبض حين يحاول — أو `skipped` كلَّ يوم بلا دلوٍ خاصّ.
 */
export const CADENCE: Readonly<Record<Job, { readonly label: string; readonly everySeconds: number | null }>> = {
  renew: { label: 'تجديد الأذونات', everySeconds: 15 * 60 },
  dispatch: { label: 'إرسال المجدول', everySeconds: 15 * 60 },
  metrics: { label: 'قياس المنشورات', everySeconds: 60 * 60 },
  scan: { label: 'مسح Drive', everySeconds: 24 * 60 * 60 },
  alerts: { label: 'تنبيهات الانتهاء', everySeconds: 24 * 60 * 60 },
  report: { label: 'النتائج الأسبوعيّة', everySeconds: 7 * 24 * 60 * 60 },
  publish: { label: 'النشر في الموعد', everySeconds: null },
  backup: { label: 'النسخة الاحتياطيّة', everySeconds: 7 * 24 * 60 * 60 },
}

export const JOBS: readonly Job[] = ['renew', 'dispatch', 'publish', 'metrics', 'scan', 'alerts', 'report', 'backup']

/**
 * ‏**ومنذ متى تسقط** (مراجعة D-320): `failed_since` أوّلُ نبضٍ ساقطٍ بعد آخر ما لم يسقط، يبقى ما دامت تسقط، ويُمحى بأوّل ما لا
 * ‏يسقط (`ok` أو `skipped`). منه يُقال «تسقط منذ…» في قناة المالك مرّةً للسقوط كلِّه (`alerts/collect.ts`).
 */
export async function beat(db: Db, job: Job, outcome: Outcome, detail = ''): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO heartbeats (job, at, outcome, detail, failed_since)
         VALUES (?1, datetime('now'), ?2, ?3, CASE WHEN ?2 = 'failed' THEN datetime('now') END)
         ON CONFLICT(job) DO UPDATE SET
           at = excluded.at, outcome = excluded.outcome, detail = excluded.detail,
           failed_since = CASE
             WHEN excluded.outcome != 'failed' THEN NULL
             WHEN heartbeats.outcome = 'failed' THEN coalesce(heartbeats.failed_since, heartbeats.at)
             ELSE excluded.at END`,
      )
      .bind(job, outcome, detail === '' ? null : detail.slice(0, 200))
      .run()
  } catch (error) {
    console.error({ job: 'heartbeat', failed: String(error) })
  }
}

export async function readHeartbeats(db: Db): Promise<readonly Heartbeat[]> {
  try {
    const rows = await db
      .prepare('SELECT job, at, outcome, detail, failed_since FROM heartbeats')
      .all<{ job: string; at: string; outcome: string; detail: string | null; failed_since: string | null }>()
    return (rows.results ?? []).map((r) => ({
      job: r.job as Job,
      at: r.at,
      outcome: r.outcome as Outcome,
      detail: r.detail,
      failedSince: r.failed_since,
    }))
  } catch {
    return []
  }
}

export type PulseState = 'ok' | 'late' | 'failed' | 'never'

export interface Pulse {
  readonly job: Job
  readonly label: string
  readonly state: PulseState
  readonly beat: Heartbeat | null
  /** كم تأخّر عن موعده — بالثواني، وصفرٌ لما في موعده. */
  readonly lateBy: number
}

/**
 * الحكمُ على كلّ دورة: دارت في موعدها، أو تأخّرت (ضعفُ مدّتها وزيادة)،
 * أو سقطت، أو لم تدُر قطّ.
 *
 * **والتأخّرُ يُحسَب بضعف المدّة**: cron يتأخّر دقائقَ عادةً، ودورةٌ تغيب
 * دورةً كاملةً هي التي تعني أنّ العدّاءَ لم يُطلَق (M-23).
 */
export function pulses(beats: readonly Heartbeat[], now: Date): readonly Pulse[] {
  const byJob = new Map(beats.map((b) => [b.job, b]))
  return JOBS.map((job) => {
    const b = byJob.get(job) ?? null
    const c = CADENCE[job]
    if (b === null) return { job, label: c.label, state: 'never', beat: null, lateBy: 0 }
    const at = parseSqliteUtc(b.at)
    const age = at === null ? 0 : Math.max(0, Math.floor((now.getTime() - at.getTime()) / 1000))
    const lateBy = c.everySeconds === null ? 0 : Math.max(0, age - 2 * c.everySeconds)
    const state: PulseState = b.outcome === 'failed' ? 'failed' : lateBy > 0 ? 'late' : 'ok'
    return { job, label: c.label, state, beat: b, lateBy }
  })
}
