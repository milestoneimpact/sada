/**
 * **تقريرُ الشهر إلى البريد آليًّا** (D-412): لكلّ عميلٍ فُتح له الخيار (`client_options.report_mail`، مطفأٌ افتراضًا) يُرسَل
 * تقريرُ الشهر الذي انقضى — **بالمسار نفسِه الذي يرسل به «أرسله إلى بريدي»** (D-268): `reportText` إلى بريد المالك
 * (`OWNER_EMAIL`)، لا إلى عنوانٍ يُكتب في نموذج. فالنصُّ ما في الصفحة وحدَه: أرقامٌ، ولا رمزَ ولا سرَّ ولا رابط.
 *
 * ‏- يدور في المسح اليوميّ: يومٌ تعثّر فيه البريدُ يُعاد في الغد.
 * ‏- الشهرُ يُحجَز قبل الإرسال (`report_mailed_month`) بشرطٍ ذرّيّ، فدورتان معًا لا ترسلانه مرّتين؛ وإرسالٌ لم يتمّ — أو تقريرٌ تعثّر بناؤه (D-413) — يُعيد الحجز.
 * ‏- عميلٌ يتعثّر لا يوقف غيره.
 */
import type { Db } from '../tokens'
import { sendText, type MailBinding } from '../mail/send'
import { OWNER_EMAIL } from '../ownerEmail'
import { platformLabel } from '../oauth/providers'
import { money } from '../format'
import { record } from '../audit'
import { monthlyReport, monthOf, reportText, shiftMonth } from './monthly'

export interface MailedReport {
  readonly org: string
  readonly month: string
  readonly sent: boolean
  readonly reason?: string
}

export async function mailMonthlyReports(db: Db, mail: MailBinding | undefined, now: Date, zone: string | null): Promise<MailedReport[]> {
  // ‏الشهرُ الذي انقضى **بمنطقة المالك** (مراجعة D-425): فجرُ الأوّل بـ UTC قد يكون آخرَ يومٍ في الشهر محلّيًّا
  const month = shiftMonth(monthOf(undefined, now, zone), -1)
  const { results } = await db.prepare(`SELECT c.org_id, c.report_mailed_month, o.name FROM client_options c JOIN orgs o ON o.id = c.org_id
      WHERE c.report_mail = 1 AND (c.report_mailed_month IS NULL OR c.report_mailed_month < ?) ORDER BY c.org_id`)
    .bind(month).all<{ org_id: string; report_mailed_month: string | null; name: string }>()
  const out: MailedReport[] = []
  for (const row of results) {
    let claimed: { org_id: string } | null = null
    try {
      claimed = await db.prepare(`UPDATE client_options SET report_mailed_month = ?1
          WHERE org_id = ?2 AND report_mail = 1 AND (report_mailed_month IS NULL OR report_mailed_month < ?1) RETURNING org_id`)
        .bind(month, row.org_id).first<{ org_id: string }>()
      if (claimed === null) continue
      const report = await monthlyReport(db, row.org_id, month, zone)
      const sent = await sendText(mail, OWNER_EMAIL, `صدى — تقرير ${month} · ${row.name}`,
        reportText(report, row.name, (p) => platformLabel(p as never), money))
      if (!sent.sent) {
        await db.prepare('UPDATE client_options SET report_mailed_month = ? WHERE org_id = ? AND report_mailed_month = ?')
          .bind(row.report_mailed_month, row.org_id, month).run()
      }
      await record(db, { actor: 'cron', action: sent.sent ? 'report.mail.sent' : 'report.mail.unsent', target: month,
        detail: sent.sent ? 'آليّ' : sent.reason, org: row.org_id })
      out.push(sent.sent ? { org: row.org_id, month, sent: true } : { org: row.org_id, month, sent: false, reason: sent.reason })
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 200) : 'تعذّر'
      // تعثّرُ بناء التقرير أو قراءته (D-413) يُعيد الحجزَ كإرسالٍ لم يتمّ، فيُعاد في الغد ويُسجَّل غيرَ مُرسَل.
      if (claimed !== null) {
        try {
          await db.prepare('UPDATE client_options SET report_mailed_month = ? WHERE org_id = ? AND report_mailed_month = ?')
            .bind(row.report_mailed_month, row.org_id, month).run()
          await record(db, { actor: 'cron', action: 'report.mail.unsent', target: month, detail: reason, org: row.org_id })
        } catch { /* القاعدةُ نفسُها متعثّرة: يبقى في سجلّ الدورة */ }
      }
      out.push({ org: row.org_id, month, sent: false, reason })
    }
  }
  return out
}
