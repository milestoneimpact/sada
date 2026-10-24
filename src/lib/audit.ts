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
import { OWNER_ORG } from './tenancy'
import { whoNow } from './access'
import { PROVIDERS } from './ai/registry'
import { platformLabel } from './oauth/providers'
import { isSettingKey, SETTING_LABEL } from './settings'

export interface AuditEntry {
  /** كيف دخل الفاعل. `panel` جلسةُ لوحة، `admin_token` نداءُ طرفيّة. */
  readonly actor: string
  /** اسمٌ ثابت يُبحث به — لا جملةٌ حرّة. */
  readonly action: string
  readonly target?: string | null
  readonly detail?: string | null
  /** المنظّمةُ التي وقع فيها الفعل؛ وفعلُ الحساب نفسِه (دخولٌ، عامل) لمنظّمة المالك (D-227). */
  readonly org?: string
}

/**
 * سقفُ النصّ الحرّ في الصفّ (D-161): سببُ رفضٍ قد يحمل مدخلاتِ طالبٍ مجهول
 * («نوعٌ غير متوقّع: …» بما أرسل)، وكلُّ فتحةٍ للّوحة تقرأ آخرَ خمسين صفًّا.
 * فكان مليونا بايتٍ في `clientDataJSON` يصيران صفًّا يُطبَع في كلّ فتحة.
 */
const MAX_TEXT = 300

function capped(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : value.slice(0, MAX_TEXT)
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
        `INSERT INTO audit_log (org_id, actor, action, target, detail, ip, ua, by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entry.org ?? OWNER_ORG,
        entry.actor,
        entry.action,
        capped(entry.target),
        capped(entry.detail),
        header(request, 'CF-Connecting-IP', 45),
        header(request, 'User-Agent', 160),
        // ‏من فعل (D-271): بريدُ صاحب الطلب، و`NULL` خارج طلبٍ مُصادَق (المهامُّ المجدولة) أو للمالك قبل الفريق
        whoNow()?.email ?? null,
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
  /** من فعل (D-271) — بريدُه، و`null` قبل الفريق أو خارج طلبٍ مُصادَق. */
  readonly byEmail?: string | null
}

/** آخرُ ما وقع. وجدولٌ لا يُقرأ لا يُسقط اللوحة: تُعاد قائمةٌ فارغة. */
export async function recentAudit(db: Db, limit = 50): Promise<AuditRow[]> {
  const capped = Math.max(1, Math.min(200, Math.trunc(limit)))
  try {
    const { results } = await db
      .prepare(
        `SELECT at, actor, action, target, detail, ip, by_email AS byEmail
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

/**
 * اسمُ الفعل بجانب مفتاحه — **في موضعٍ واحدٍ يقرؤه سجلُّ الأمان و«ما وقع
 * اليوم»** (D-127). والقاموسُ ناقصٌ عمدًا: ما ليس فيه يُعرَض بحرفه.
 */
export const ACTION_LABEL: Readonly<Record<string, string>> = {
  'session.open': 'فُتحت جلسة',
  'team.invite': 'دُعي عضو',
  'team.revoke': 'أُلغي دخول عضو',
  'report.mail.sent': 'أُرسل تقرير الشهر',
  'report.mail.unsent': 'لم يُرسَل تقرير الشهر',
  'session.pending': 'دخول ينتظر العامل الثاني',
  'csrf.reject': 'طلب بلا رمز نموذج',
  'passkey.denied': 'مفتاح مرور مرفوض',
  'passkey.rejected': 'رُفض تسجيل مفتاح',
  'passkey.add': 'سُجّل مفتاح مرور',
  'passkey.delete': 'حُذف مفتاح مرور',
  '2fa.passkey': 'عامل ثان بمفتاح مرور',
  '2fa.totp': 'عامل ثان برمز تطبيق',
  '2fa.recovery': 'دخول برمز استرداد',
  '2fa.denied': 'عامل ثان مرفوض',
  'totp.start': 'بدأ ضبط رمز التطبيق',
  'totp.confirm': 'أُكّد رمز التطبيق',
  'totp.remove': 'أُزيل رمز التطبيق',
  'recovery.issue': 'وُلّدت رموز استرداد',
  'session.close': 'أُغلقت جلسة',
  'session.revoke': 'أُبطلت جلسة',
  'session.revoke_all': 'أُبطلت كلّ الجلسات',
  'login.denied': 'محاولة دخول مرفوضة',
  'login.code.locked': 'الدخول بالرمز موقوف يوما',
  'brief.write': 'حُفظ موجز العميل',
  'plan.start': 'بدأت الخطّة',
  'settings.write': 'تغيير إعداد',
  'drive.scan': 'مسح Drive',
  'source.analyze': 'تحليل مصدر',
  'provider.upsert': 'إضافة مزوّد أو تعديله',
  'provider.key': 'تبديل مفتاح',
  'provider.verify': 'اختبار مفتاح',
  'provider.toggle': 'تفعيل أو تعطيل',
  'provider.delete': 'حذف مزوّد',
  'route.write': 'توجيه مهمّة',
  // أفعالُ الخطّة والوسائط كانت تُعرَض بحرفها (D-157)
  'plan.generate': 'تخطيط الأسبوع',
  'plan.approve': 'اعتماد خطّة',
  'media.generate': 'توليد صورة',
  'media.animate': 'تحريك صورة',
  'media.reject': 'رفض صورة',
  'draft.write': 'كتابة مسوّدة',
  'draft.decide': 'قرار على مسوّدة',
  'draft.approve_many': 'اعتماد دفعة',
  'draft.spread': 'توزيع المعتمَد',
  'draft.schedule': 'جدولة منشور',
  'draft.unschedule': 'إلغاء جدولة',
  'draft.undo_reject': 'تراجع عن رفض',
  'oauth_app.save': 'حفظ تطبيق منصّة',
  'oauth_app.verify': 'اختبار تطبيق منصّة',
  'oauth_app.delete': 'حذف تطبيق منصّة',
  'promotion.decide': 'قرار ترويج',
}

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

/**
 * «على ماذا» يُقرأ اسمًا لا مفتاحًا (D-125 · D-127).
 *
 * هدفُ الفعل في `audit_log` مفتاحٌ بحرفه: `anthropic` لمفتاح مزوّد،
 * و`linkedin` لحساب. **والمزوّدُ له اسمٌ بجانب تعريفه والمنصّةُ كذلك**،
 * فيُقرآن من هناك. وما ليس مزوّدًا ولا منصّةً — معرِّفُ مسوّدةٍ أو مفتاحُ
 * ضبط — يُعرَض بحرفه: القاموسُ ناقصٌ عمدًا.
 *
 * **ومفتاحُ الإعداد له اسمٌ بجانب مفتاحه أيضًا** (D-134): `dashboard_tiles`
 * قرأها المالكُ بحرفها في «ما وقع اليوم» يومَ اختار بطاقاتِه.
 */
export function targetLabel(target: string): string {
  if (isSettingKey(target)) return SETTING_LABEL[target]
  const provider = (PROVIDERS as Readonly<Record<string, { readonly name: string }>>)[target]
  return provider?.name ?? platformLabel(target)
}

