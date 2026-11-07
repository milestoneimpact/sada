/**
 * ‏**النبضُ من الخارج** (D-320) — أتعمل الآلةُ الآن؟ سؤالٌ يجيبه مراقبٌ لا يعرف عن صدى شيئًا إلّا عنوانًا.
 *
 * ‏كان النبضُ (D-158) يُحكَم عليه حين يفتح المالكُ اللوحة وحدَها، والتنبيهاتُ تخرج من الـ Cron نفسِه: **فإن وقف الـ Cron وقف معه
 * ‏مَن يقول إنّه وقف**. فهنا حكمٌ واحدٌ يقرؤه اثنان: `/pulse` (‏200 أو ‏503 بلا تفصيل، يسأله مراقبٌ من خارج Cloudflare — M-47)،
 * ‏و`collectAlerts` («نبضٌ تأخّر» في قناة المالك ما دام الـ Cron الساعيُّ يدور).
 *
 * ‏**وثلاثةٌ تُحرَس لا سبعة**: الإرسالُ والتجديدُ في كلّ دورة — وتأخّرُهما يعني أنّ المنشوراتِ لا تخرج أو أنّ الأذوناتِ تموت —
 * ‏ومستهلكُ النشر، ولا موعدَ له: **يُحكَم عليه بما سُلّم إليه**. رسالةٌ حلّ موعدُها منذ نصف ساعةٍ ولم يدُر المستهلكُ بعدها
 * ‏مستهلكٌ متوقّف، وطابورٌ فارغٌ ليس تأخّرًا. والقياسُ والمسحُ والتقريرُ تأخّرُها يُرى في اللوحة ولا يوقف وعدًا.
 */
import type { Db } from '../tokens'
import { CADENCE, pulses, readHeartbeats, type Heartbeat, type Job, type PulseState } from './heartbeat'
import { dbNow } from '../schedule/job'
import { parseSqliteUtc } from '../format'

/** ‏ما يحرسه `/pulse`. */
export const PULSE_JOBS = ['dispatch', 'renew', 'publish'] as const satisfies readonly Job[]

/**
 * ‏**مهلةُ المستهلك**: نصفُ ساعةٍ بعد أن صار العملُ في يده ولم يدُر. ضعفُ دورة الإرسال كما يُحكَم على الدورات (`pulses`)،
 * ‏وأطولُ من استطلاع Instagram (خمسُ دقائق) ومن إعادات الطابور الثلاث (‏60 و‏300 و‏900 ثانية) — فلا يُنذَر ببطءٍ عاديّ.
 */
export const CONSUMER_GRACE_SECONDS = 30 * 60

export interface LateJob {
  readonly job: (typeof PULSE_JOBS)[number]
  readonly label: string
  readonly state: Exclude<PulseState, 'ok'>
  /** ‏آخرُ نبضٍ رآه، أو `null` لما لم يدُر قطّ. منه مفتاحُ التنبيه، فلا يُعاد لكلّ ساعةٍ من التأخّر نفسِه. */
  readonly lastAt: string | null
  /** ‏كم تأخّر بالثواني — من موعده للدورة، ومن أوّل ما سُلّم إليه للمستهلك. */
  readonly lateBy: number
  /** ‏كم مضى بالثواني: منذ آخر دورةٍ للدورة، ومنذ صار العملُ في يد المستهلك. */
  readonly waited: number
}

export interface PulseReport {
  readonly healthy: boolean
  readonly late: readonly LateJob[]
}

/**
 * ‏أقدمُ عملٍ صار في يد المستهلك ولم يدُر بعده (أو `null`): منشورٌ مجدولٌ خُتم «أُرسل»، أو أُرسلت له رسالةٌ مؤجَّلةٌ وحلّ موعدُها.
 * ‏وما خُتم يُحكَم عليه من ختمه، وما أُجّل من موعده.
 */
export async function consumerStall(db: Db, now: Date, publish: Heartbeat | null): Promise<{ since: string; lateBy: number } | null> {
  const cutoff = dbNow(new Date(now.getTime() - CONSUMER_GRACE_SECONDS * 1000))
  const row = await db
    .prepare(
      `SELECT min(coalesce(dispatched_at, scheduled_at)) AS since FROM posts
        -- ‏الآلةُ واحدةٌ لكلّ المنظّمات
        WHERE org_id IN (SELECT id FROM orgs) AND status = 'queued'
          AND (dispatched_at IS NOT NULL OR (enqueued_for IS NOT NULL AND enqueued_for = scheduled_at))
          AND coalesce(dispatched_at, scheduled_at) <= ?`,
    )
    .bind(cutoff)
    .first<{ since: string | null }>()
  const since = row?.since ?? null
  if (since === null) return null
  // ‏دار المستهلكُ بعد أن صار العملُ في يده: يعمل، ولو بقي المنشورُ ينتظر إعادة
  if (publish !== null && publish.at >= since) return null
  return { since, lateBy: Math.max(0, secondsSince(since, now) - CONSUMER_GRACE_SECONDS) }
}

function secondsSince(at: string | null, now: Date): number {
  const d = at === null ? null : parseSqliteUtc(at)
  return d === null ? 0 : Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000))
}

/**
 * ‏الحكمُ كلُّه. **وقاعدةٌ لا تُقرأ حكمٌ بأنّ الآلةَ لا تعمل**: `readHeartbeats` تعيد فراغًا حين تسقط، فيصير كلُّ شيءٍ «لم يدُر
 * ‏قطّ» — وهو ما يجب أن يقوله المراقبُ حينها.
 */
export async function pulseReport(db: Db, now: Date): Promise<PulseReport> {
  const beats = await readHeartbeats(db)
  const states = pulses(beats, now)
  const late: LateJob[] = []
  for (const job of ['dispatch', 'renew'] as const) {
    const p = states.find((s) => s.job === job)
    if (p === undefined || p.state === 'ok') continue
    late.push({ job, label: CADENCE[job].label, state: p.state, lastAt: p.beat?.at ?? null, lateBy: p.lateBy, waited: secondsSince(p.beat?.at ?? null, now) })
  }
  const publish = beats.find((b) => b.job === 'publish') ?? null
  const stall = await consumerStall(db, now, publish).catch(() => null)
  if (stall !== null) {
    late.push({ job: 'publish', label: CADENCE.publish.label, state: 'late', lastAt: publish?.at ?? null, lateBy: stall.lateBy, waited: secondsSince(stall.since, now) })
  }
  return { healthy: late.length === 0, late }
}
