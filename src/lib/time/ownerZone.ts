/**
 * منطقةُ المالك **كما عرفها آخرُ متصفّحٍ أرسلها** (D-200) — احتياطٌ للكعكة لا بديلٌ عنها.
 *
 * كانت الكعكةُ `sada_tz` وحدَها مصدرَ المنطقة (D-173)، فأوّلُ طلبٍ في متصفّحٍ لم يكتبها بعد،
 * أو بعد انقضاء يومها، يُري المالكَ أوقاتَه بـ UTC ويقول له «لم تصل منطقتُك». والمالكُ واحد،
 * ومنطقتُه عُرفت من قبل. فتُحفظ في `settings` (مفتاحُ `owner_tz`، بلا ترحيل: الجدولُ يقبل
 * مفتاحًا جديدًا) **كلّما وصلت كعكةٌ تخالف المحفوظ**، وتُقرأ حين تغيب.
 *
 * **والكعكةُ تغلب دائمًا**: مالكٌ سافر يرى منطقتَه الجديدة من أوّل تحميل، وتُكتب فوق القديمة —
 * فلا تكذب المنطقةُ المحفوظة كما خشيت D-106، لأنّها لا تُقرأ إلّا حيث لا شيءَ غيرُها.
 * وليست في `SETTING_KEYS`: لا يضبطها نموذجٌ في اللوحة، ولا تدخل في قرارِ أمنٍ ولا إنفاق.
 */
import type { Db } from '../tokens'
import { OWNER_ORG } from '../tenancy'
import { validZone, zoneOf } from './zone'

export const ZONE_SETTING = 'owner_tz'

/** المنطقةُ المحفوظة إن كانت صالحة — وأيُّ عطلٍ في القراءة يعني «لا شيء» لا انكسارَ الصفحة. */
export async function storedZone(db: Db): Promise<string | null> {
  try {
    // إعدادٌ عامّ: يسكن منظّمةَ المالك (D-277)
    const row = await db
      .prepare('SELECT value FROM settings WHERE key = ? AND org_id = ?')
      .bind(ZONE_SETTING, OWNER_ORG)
      .first<{ value: string }>()
    return validZone(row?.value ?? null)
  } catch {
    return null
  }
}

/**
 * منطقةُ هذا الطلب: الكعكةُ إن صلحت (وتُحفظ إن خالفت المحفوظ)، وإلّا المحفوظة، وإلّا `null`
 * — **وهذه وحدَها أوّلُ زيارةٍ حقًّا**: لا كعكةَ ولا منطقةَ عُرفت قطّ.
 */
export async function ownerZone(db: Db, cookieHeader: string | null): Promise<string | null> {
  const fromCookie = zoneOf(cookieHeader)
  const stored = await storedZone(db)
  if (fromCookie === null) return stored
  if (fromCookie !== stored) {
    try {
      await db.prepare(
        `INSERT INTO settings (key, value, updated_by, updated_at, org_id)
         -- إعدادٌ عامّ: يسكن منظّمةَ المالك — والمفتاحُ (org_id, key) منذ 0042
         VALUES (?, ?, 'browser', datetime('now'), ?)
         ON CONFLICT(org_id, key) DO UPDATE SET value = excluded.value, updated_by = 'browser', updated_at = datetime('now')`,
      ).bind(ZONE_SETTING, fromCookie, OWNER_ORG).run()
    } catch {
      // ‏كتابةٌ فشلت لا تُسقط الصفحة: الكعكةُ في يدنا لهذا الطلب
    }
  }
  return fromCookie
}
