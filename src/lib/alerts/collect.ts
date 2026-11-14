/**
 * جمعُ ما يستحقّ أن يُوقظ المالك (D-109).
 *
 * **ثلاثةٌ في العمل ورابعُها أمانُ الحساب** (D-317) **وخامسُها نبضٌ تأخّر** (D-320) — ولا يُقرأ منها إلّا ما وقع فعلا:
 *
 * - إذنٌ يقترب: من `token_alerts` الذي يُكتَب أصلا (0016).
 * - نشرٌ فشل نهائيّا: منشورٌ حالُه `failed` — **والطابورُ فرغ منه**.
 * - سقفُ إنفاقٍ بُلغ: من `cost_ledger` مقابلَ الإعداد.
 * - حدثُ أمان: صفٌّ كُتب في `alert_outbox` عند وقوعه ولم يُرسَل بعد.
 * - نبضٌ تأخّر: دورةُ الإرسال أو التجديد تسقط منذ نصف ساعة، أو مستهلكُ النشر لم يأخذ ما سُلّم إليه (`ops/pulse.ts`).
 *
 * **ولا يُخترَع حدثٌ لتكتمل القائمة** — قاعدةُ D-104 نفسُها في موضعٍ آخر.
 */
import { budgetAlert, heartbeatAlert, MAX_TRIES, providerAlert, publishAlert, tokenAlert, type Alert } from './outbox'
import { failingProviders, failingSince } from '../ai/health'
import type { Db } from '../tokens'
import { alertable, pulseReport } from '../ops/pulse'

/**
 * **نافذةُ «نشرٌ فشل»** (D-322) — منشورٌ فشل في آخر ثلاثين يومًا وحدَه.
 *
 * كان يُقرأ كلُّ منشورٍ فاشلٍ منذ أوّل يوم، كلَّ ساعة، **و«لا يُرسَل مرّتين» قائمٌ على صفّه في `alert_outbox`** (`publish:<معرّف>`).
 * فلمّا صار الصندوقُ يُكنَس بعد تسعين يومًا (`privacy/retention.ts`) كان تنبيهُ منشورٍ فشل قبل مئة يومٍ يعود إلى القناة في الساعة
 * التالية لكنسه. فالجمعُ أقصرُ من الكنس، **والاختبارُ يحرس أنّه يبقى أقصر**. ووقتُ الفشل آخرُ محاولةٍ له، وإلّا آخرُ ما يُعرف من وقته.
 */
export const PUBLISH_ALERT_DAYS = 30

/** اليومُ بصيغة القاعدة — والسقفُ يوميٌّ فمفتاحُه يومٌ لا لحظة. */
function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export async function collectAlerts(
  db: Db, now: Date, spendCap: number,
): Promise<readonly Alert[]> {
  const out: Alert[] = []

  // ── ١ · إذنٌ يقترب ─────────────────────────────────────────────────
  // **والصفُّ مكتوبٌ أصلا** (0016): هذا يقرؤه ولا يعيد حسابَه، فلا
  // يفترق عدّادان
  const { results: tokens } = await db
    .prepare(
      `SELECT a.display_name AS name, t.kind, t.threshold, t.org_id
         FROM token_alerts t JOIN accounts a ON a.id = t.account_id AND a.org_id = t.org_id
        WHERE t.at >= datetime('now', '-2 days')`,
    )
    .all<{ name: string; kind: string; threshold: number; org_id: string }>()
    .catch(() => ({ results: [] as { name: string; kind: string; threshold: number; org_id: string }[] }))
  for (const t of tokens) out.push(tokenAlert(t.name, t.threshold, t.kind, t.org_id))

  // ── ٢ · نشرٌ فشل نهائيّا ───────────────────────────────────────────
  // **ونهائيٌّ لا محاولةٌ فشلت**: الطابورُ يعيد، وتنبيهٌ عند كلّ محاولةٍ
  // يُطفَأ في يومه. والحالُ `failed` هي التي تقول «فرغ منه الطابور»
  const { results: failed } = await db
    .prepare(
      `SELECT p.id, p.platform, p.org_id, COUNT(pa.id) AS tries
         FROM posts p LEFT JOIN publish_attempts pa ON pa.post_id = p.id AND pa.org_id = p.org_id
        WHERE p.status = 'failed'
        GROUP BY p.id
       HAVING COALESCE(MAX(pa.at), p.dispatched_at, p.scheduled_at, p.created_at) >= datetime('now', ?)`,
    )
    .bind(`-${PUBLISH_ALERT_DAYS} days`)
    .all<{ id: string; platform: string; org_id: string; tries: number }>()
    .catch(() => ({ results: [] as { id: string; platform: string; org_id: string; tries: number }[] }))
  for (const f of failed) out.push(publishAlert(f.id, f.platform, f.tries, f.org_id))

  // ── ٣ · سقفُ الإنفاق ───────────────────────────────────────────────
  // **ولا يُنبَّه على سقفٍ لم يُوضَع**: صفرٌ يعني «بلا سقف» لا «سقفُه صفر»
  if (spendCap > 0) {
    const day = dayOf(now)
    const spent = await db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS s FROM cost_ledger
          WHERE at >= ? AND at < datetime(?, '+1 day')
            -- ‏السقفُ عامّ لكلّ المنظّمات
            AND org_id IN (SELECT id FROM orgs)`,
      )
      .bind(day, day)
      .first<{ s: number }>()
      .catch(() => null)
    if (spent !== null && spent.s >= spendCap) {
      out.push(budgetAlert(day, spent.s, spendCap))
    }
  }

  // ── ٤ · أمانُ الحساب (D-317) ───────────────────────────────────────
  // ‏صفوفٌ كُتبت عند الحدث بحالٍ فارغة؛ وما لم ينجح يُعاد حتّى `MAX_TRIES`، وما فات يومين لا يُرسَل متأخّرًا
  const { results: security } = await db
    .prepare(
      `SELECT ref, body, org_id FROM alert_outbox
        WHERE kind = 'security' AND org_id IN (SELECT id FROM orgs)
          AND (status IS NULL OR status < 200 OR status >= 300) AND tries < ?
          AND at >= datetime('now', '-2 days')
        ORDER BY at LIMIT 50`,
    )
    .bind(MAX_TRIES)
    .all<{ ref: string; body: string; org_id: string }>()
    .catch(() => ({ results: [] as { ref: string; body: string; org_id: string }[] }))
  for (const s of security) out.push({ kind: 'security', ref: s.ref, body: s.body, org: s.org_id })

  // ── ٥ · نبضٌ تأخّر أو سقوطٌ متّصل (D-320) ─────────────────────────
  // ‏**ما لا يراه أحدٌ حتّى يفتح اللوحة**: ركودُ المستهلك، ودورةُ إرسالٍ أو تجديدٍ تسقط منذ نصف ساعة (`alertable`). ودورةٌ
  // ‏واحدةٌ تسقط تُرى في اللوحة والسجلّ، و«لم تدُر قطّ» يقوله `/pulse` لمراقبه. **وكان «المتأخّرُ وحدَه»** (مراجعة D-320): هذا
  // ‏يُحسَب في `scheduled()` بعد دورتي التجديد والإرسال، فعمرُ نبضيهما ثوانٍ ولا يتأخّران — والإرسالُ يسقط كلَّ ربع ساعةٍ بلا كلمة
  const pulse = await pulseReport(db, now).catch(() => null)
  for (const late of pulse?.late ?? []) if (alertable(late)) out.push(heartbeatAlert(late))

  // ── ٦ · مفتاحُ مزوّدٍ سقط (D-348) ──────────────────────────────────
  // ‏من آخر اختبارٍ لمزوّدٍ مفعَّل، والمرجعُ من أوّل الفشل بعد آخر نجاح: فلا يتكرّر كلَّ ساعةٍ ولا كلَّ فجر
  for (const f of await failingProviders(db)) {
    const since = await failingSince(db, f.provider)
    if (since !== null) out.push(providerAlert(f.label, f.provider, since, f.detail))
  }

  return out
}
