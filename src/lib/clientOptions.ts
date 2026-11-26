/**
 * **خيارا العميل للوكالة** (D-412 · 0071): موافقةُ العميل قبل النشر، وتقريرُ الشهر إلى البريد آليًّا. صفٌّ لكلّ منظّمة،
 * **وغيابُه — أو قاعدةٌ لا تُقرأ في الثاني — يعني الخيارين مطفأين**، فلا يتبدّل سلوكُ عميلٍ لم يُفتح له خيار.
 *
 * ‏والموافقةُ خطأُها في الاتّجاه الآمن: قاعدةٌ لا تُقرأ عند الجدولة تُمسك (`approvalRequired` يُفترض قائمًا)، لأنّ نشرَ ما لم
 * ‏يوافق عليه عميلٌ طلب الموافقة أسوأُ من تأخيره دورة.
 */
import type { Db } from './tokens'

export interface ClientOptions {
  readonly approvalRequired: boolean
  readonly reportMail: boolean
}

export const NO_OPTIONS: ClientOptions = { approvalRequired: false, reportMail: false }

export async function readClientOptions(db: Db, org: string): Promise<ClientOptions> {
  const row = await db.prepare('SELECT approval_required, report_mail FROM client_options WHERE org_id = ?')
    .bind(org).first<{ approval_required: number; report_mail: number }>()
  return row === null ? NO_OPTIONS : { approvalRequired: row.approval_required === 1, reportMail: row.report_mail === 1 }
}

/** ‏للجدولة: قاعدةٌ لا تُقرأ تُمسك ولا تفتح. */
export async function approvalRequired(db: Db, org: string): Promise<boolean> {
  try {
    return (await readClientOptions(db, org)).approvalRequired
  } catch {
    return true
  }
}

export async function writeClientOptions(db: Db, org: string, o: ClientOptions): Promise<void> {
  await db.prepare(`INSERT INTO client_options (org_id, approval_required, report_mail, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT (org_id) DO UPDATE SET approval_required = excluded.approval_required, report_mail = excluded.report_mail,
        updated_at = excluded.updated_at`)
    .bind(org, o.approvalRequired ? 1 : 0, o.reportMail ? 1 : 0).run()
}
