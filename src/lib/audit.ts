/**
 * سجلّ التدقيق — من فعل ماذا ومتى.
 *
 * وقاعدتُه الأولى: **الكتابةُ لا تُسقط الفعل.** لو تعذّر الكتابةُ في
 * السجلّ فالإعدادُ الذي غُيّر قد غُيّر فعلا، وردٌّ بخطأٍ يجعل المالك يظنّ
 * أنّه لم يُغيَّر فيُعيده. فيُبلَع الخطأ ويُسجَّل في `console` — ونقصٌ في
 * السجلّ أهونُ من كذبٍ في الواجهة.
 *
 * وقاعدتُه الثانية: **لا سرٌّ في `detail` قطّ.** تلميحُ مفتاحٍ أو بصمةٌ
 * نعم؛ المفتاحُ نفسه لا. والسجلّ يُقرأ في اللوحة ويُصدَّر ويُنسخ.
 */
import type { Db } from './tokens'

export interface AuditEntry {
  /** كيف دخل الفاعل. `panel` جلسةُ لوحة، `admin_token` نداءُ طرفيّة. */
  readonly actor: string
  /** اسمٌ ثابت يُبحث به — لا جملةٌ حرّة. */
  readonly action: string
  readonly target?: string | null
  readonly detail?: string | null
}

function header(request: Request | undefined, name: string, max: number): string | null {
  const value = request?.headers.get(name) ?? null
  return value === null ? null : value.slice(0, max)
}

/** يكتب صفّا. لا يرمي أبدا — انظر التوثيق أعلاه. */
export async function record(
  db: Db,
  entry: AuditEntry,
  request?: Request,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_log (actor, action, target, detail, ip, ua)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entry.actor,
        entry.action,
        entry.target ?? null,
        entry.detail ?? null,
        header(request, 'CF-Connecting-IP', 45),
        header(request, 'User-Agent', 160),
      )
      .run()
  } catch (error) {
    console.warn({ job: 'audit', failed: entry.action, error: String(error) })
  }
}

export interface AuditRow {
  readonly at: string
  readonly actor: string
  readonly action: string
  readonly target: string | null
  readonly detail: string | null
  readonly ip: string | null
}

/** آخرُ ما وقع. وجدولٌ لا يُقرأ لا يُسقط اللوحة: تُعاد قائمةٌ فارغة. */
export async function recentAudit(db: Db, limit = 50): Promise<AuditRow[]> {
  const capped = Math.max(1, Math.min(200, Math.trunc(limit)))
  try {
    const { results } = await db
      .prepare(
        `SELECT at, actor, action, target, detail, ip
           FROM audit_log
          ORDER BY id DESC
          LIMIT ?`,
      )
      .bind(capped)
      .all<AuditRow>()
    return results
  } catch {
    return []
  }
}
