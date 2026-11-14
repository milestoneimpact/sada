/**
 * **مددُ الاحتفاظ والكنّاسُ اليوميّ** (D-322) — ما يُبقيه صدى ومتى يُمحى، **في موضعٍ واحدٍ تقرؤه الصفحةُ العامّة والكنّاس**.
 *
 * كان سجلُّ النشاط وصندوقُ التنبيهات وتنبيهاتُ الأذونات بلا مدّة: تنمو ما بقي صدى، وعنوانُ IP في كلّ صفٍّ كاملًا إلى الأبد،
 * والسياسةُ العامّة تقول «حتّى يحذفها المشغّل» ولا بابَ يحذف. فصارت المددُ هنا أرقامًا، وصفحةُ `/privacy` تُرسَم منها
 * (`routes/legal.ts`) فلا تفترق الكلمةُ عن الفعل، والكنّاسُ يدور مع المسح اليوميّ (`3 3 * * *`) بلا جدولٍ جديد.
 *
 * ## وما لا يُمَسّ
 *
 * - **`publish_attempts`** تبقى ما بقي منشورُها: D-004 يقوم على صفوفها الناجحة، ومحفّزا 0047 (D-320) يقرآنها قبل كلّ محاولة.
 *   فلا مدّةَ لها هنا، وتذهب مع منشورها حين يُحذف (`trash.ts`).
 * - **`cost_ledger`** دفترُ المشغّل الماليّ (D-008)، بلا نصٍّ ولا بريد — يبقى.
 *
 * ## والجملُ لكلّ منظّمةٍ باسمها
 *
 * حارسُ تعدّد المستأجرين (`audit_tenancy.mjs`) يردّ جملةً على جدول عملٍ لا تسمّي `org_id`. والكنّاسُ يمرّ على كلّ منظّمةٍ في `orgs`
 * بجملتها — فلا جملةَ «للكلّ» تفتح بابًا لا تُغلقه. وما لا منظّمةَ له (`auth_attempts`) جملةٌ واحدة.
 */
import { inBatches, type Db } from '../tokens'

/** المددُ بالأيّام — **وكلُّ رقمٍ هنا يُقال في `/privacy` كما هو**. */
export const RETENTION = {
  /** سجلُّ النشاط كلُّه: سنةٌ تكفي لسؤال «من فعل هذا في الربع الماضي؟» وتُغلق النموَّ بلا حدّ. */
  auditDays: 365,
  /** «إرسالٌ رُدّ» (`form.reject`، D-302): يُعَدّ في أسبوعه، وتسعون يومًا تكفي لمقارنة شهرٍ بشهرين. */
  formRejectDays: 90,
  /** عنوانُ IP في سجلّ النشاط يُقصَّر بعد ثلاثين يومًا: الشبكةُ تبقى للتحقيق، والجهازُ بعينه لا. */
  ipDays: 30,
  /** تنبيهٌ وصل إلى قناة المالك. */
  outboxDeliveredDays: 90,
  /** تنبيهٌ لم يصل: يبقى أطولَ ليُرى العطلُ، ثمّ يُمحى. */
  outboxUndeliveredDays: 180,
  /** «إذنٌ يقترب من انتهائه» (0016): يُقرأ في يومين، ويبقى نصفَ سنةٍ أثرًا. */
  tokenAlertDays: 180,
  /** عدّاداتُ محاولات الدخول (D-317) — أسماؤها تحمل البريدَ وعنوانَ IP، وأطولُ نوافذها يوم. */
  authAttemptDays: 2,
} as const

/**
 * عنوانُ IP مقصَّرًا (D-322): IPv4 إلى شبكته (`/24`: آخرُ رقمٍ صفر)، وIPv6 إلى أوّل ثلاث مجموعات (`/48`). وما لا يُعرَف شكلُه
 * `null` — يُمحى لا يُخمَّن. **ويعيد المقصَّرَ كما هو** فلا يتبدّل بكنسٍ ثانٍ.
 */
export function truncateIp(raw: string | null): string | null {
  if (raw === null) return null
  const ip = raw.trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '').toLowerCase()
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (v4 !== null) return v4.slice(1, 5).every((n) => Number(n) <= 255) ? `${v4[1]}.${v4[2]}.${v4[3]}.0` : null
  if (!ip.includes(':') || !/^[0-9a-f:.]+$/.test(ip)) return null
  // ‏IPv4 داخل IPv6 (‏`::ffff:203.0.113.7`) عنوانُ IPv4: يُكتب مقصَّرًا بشكله ذاك، فلا يعود إليه كنسٌ ثانٍ
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip)
  if (mapped !== null) return truncateIp(mapped[1]!)
  if (/\d+\.\d+/.test(ip)) return null
  const halves = ip.split('::')
  if (halves.length > 2) return null
  const head = halves[0] === '' ? [] : halves[0]!.split(':')
  const tail = halves.length === 1 || halves[1] === '' ? [] : halves[1]!.split(':')
  const fill = 8 - head.length - tail.length
  if ((halves.length === 1 && fill !== 0) || fill < 0) return null
  const groups = [...head, ...Array<string>(halves.length === 1 ? 0 : fill).fill('0'), ...tail]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return `${groups.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::`
}

export interface SweepReport {
  readonly audit: number
  readonly formRejects: number
  readonly ips: number
  readonly outbox: number
  readonly tokenAlerts: number
  readonly authAttempts: number
}

/** كم صفًّا من IPv6 أو مجهولِ الشكل يُقصَّر في الدورة — وما زاد يُكمَل في الليلة التالية (حدُّ نداءات الاستدعاء، D-320). */
export const IP_ROWS_PER_RUN = 2000

const ago = (days: number): string => `-${days} days`

async function changes(p: Promise<unknown>): Promise<number> {
  const out = (await p) as { meta?: { changes?: number }; changes?: number | bigint } | null
  return Number(out?.meta?.changes ?? out?.changes ?? 0)
}

/**
 * **الكنسُ اليوميّ** — لكلّ منظّمةٍ ما فات مدّتَه. ولا يرمي إلّا إن لم تُقرأ المنظّماتُ أصلًا: جملةٌ تسقط في منظّمةٍ لا تُوقف
 * الباقي، وتُعاد في الليلة التالية.
 */
export async function sweepRetention(db: Db): Promise<SweepReport> {
  const { results: orgs } = await db.prepare('SELECT id FROM orgs ORDER BY id').all<{ id: string }>()
  let audit = 0, formRejects = 0, ips = 0, outbox = 0, tokenAlerts = 0
  for (const { id: org } of orgs) {
    const safe = (p: Promise<unknown>): Promise<number> => changes(p).catch((error: unknown) => {
      console.warn({ job: 'retention', org, failed: String(error) })
      return 0
    })
    formRejects += await safe(db
      .prepare("DELETE FROM audit_log WHERE org_id = ? AND action = 'form.reject' AND at < datetime('now', ?)")
      .bind(org, ago(RETENTION.formRejectDays)).run())
    audit += await safe(db
      .prepare("DELETE FROM audit_log WHERE org_id = ? AND at < datetime('now', ?)")
      .bind(org, ago(RETENTION.auditDays)).run())
    // ‏IPv4 في جملةٍ واحدة: الأرقامُ الأخيرةُ تُنزَع ويُكتب صفر — ‏«203.0.113.7» ← «203.0.113.0»، والمقصَّرُ لا يُمَسّ
    ips += await safe(db
      .prepare(`UPDATE audit_log SET ip = rtrim(ip, '0123456789') || '0'
                 WHERE org_id = ? AND at < datetime('now', ?) AND ip IS NOT NULL
                   AND ip NOT GLOB '*[^0-9.]*' AND length(ip) - length(replace(ip, '.', '')) = 3
                   AND ip NOT LIKE '%.0'`)
      .bind(org, ago(RETENTION.ipDays)).run())
    ips += await truncateOthers(db, org).catch((error: unknown) => {
      console.warn({ job: 'retention', org, failed: String(error) })
      return 0
    })
    outbox += await safe(db
      .prepare(`DELETE FROM alert_outbox WHERE org_id = ?
                  AND ((status BETWEEN 200 AND 299 AND at < datetime('now', ?)) OR at < datetime('now', ?))`)
      .bind(org, ago(RETENTION.outboxDeliveredDays), ago(RETENTION.outboxUndeliveredDays)).run())
    // ‏ويبقى أحدثُ صفّ عتبة السبعة شاهدًا لبند البوّابة (`anyWeekAlert`): «وقع تنبيهٌ قبل أسبوعٍ يومًا ما» لا يعود «لم يقع»
    tokenAlerts += await safe(db
      .prepare(`DELETE FROM token_alerts WHERE org_id = ?1 AND at < datetime('now', ?2)
                  AND id IS NOT (SELECT MAX(id) FROM token_alerts WHERE threshold >= 7 AND org_id IN (SELECT id FROM orgs))`)
      .bind(org, ago(RETENTION.tokenAlertDays)).run())
  }
  // ‏عدّاداتُ الدخول بلا منظّمة (D-317): نافذتُها يومٌ على الأكثر، فما بدأ قبل يومين ميّتٌ لا يحدّ أحدًا
  const authAttempts = await changes(db
    .prepare("DELETE FROM auth_attempts WHERE window_start < datetime('now', ?)")
    .bind(ago(RETENTION.authAttemptDays)).run()).catch(() => 0)
  return { audit, formRejects, ips, outbox, tokenAlerts, authAttempts }
}

/**
 * IPv6 وما لا يُعرَف شكلُه — صفحاتٌ بحدٍّ، وكلُّ صفٍّ بما يعيده `truncateIp`. **والمقصَّرُ شكلُه واحد**: ثلاثُ مجموعاتٍ ثمّ «::»
 * (أربعُ نقطتين)؛ وما ينتهي بـ«::» بأكثرَ منها (`2001:db8:85a3:8d3::`) عنوانُ جهازٍ لم يُقصَّر بعد.
 */
async function truncateOthers(db: Db, org: string): Promise<number> {
  let done = 0
  let after = 0
  while (done < IP_ROWS_PER_RUN) {
    const { results } = await db
      .prepare(`SELECT id, ip FROM audit_log
                 WHERE org_id = ? AND id > ? AND at < datetime('now', ?) AND ip IS NOT NULL
                   AND (ip GLOB '*[^0-9.]*' OR length(ip) - length(replace(ip, '.', '')) != 3)
                   AND NOT (ip LIKE '%::' AND length(ip) - length(replace(ip, ':', '')) = 4)
                 ORDER BY id LIMIT 500`)
      .bind(org, after, ago(RETENTION.ipDays))
      .all<{ id: number; ip: string }>()
    if (results.length === 0) break
    after = results[results.length - 1]!.id
    await inBatches(db, results.map((r) =>
      db.prepare('UPDATE audit_log SET ip = ? WHERE id = ? AND org_id = ?').bind(truncateIp(r.ip), r.id, org)))
    done += results.length
  }
  return done
}
