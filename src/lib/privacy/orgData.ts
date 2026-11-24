/**
 * **بياناتُ عميلٍ كلُّها: تُصدَّر ثمّ تُحذف** (D-322).
 *
 * كانت المنظّمةُ تُنشأ ولا تُحذف، ولا يخرج من صدى شيءٌ من بياناتها إلّا شاشةً شاشة. والعميلُ الذي يرحل — أو يطلب ما عندنا عنه —
 * لا جوابَ له. فصار:
 *
 * - **`exportOrg`**: ملفُّ JSON واحدٌ بكلّ صفوف المنظّمة، جدولًا جدولًا، **بلا رمزٍ ولا سرٍّ ولا عاملٍ ثانٍ**: لا `tokens`، ولا
 *   أعمدةُ التشفير في `providers` و`oauth_apps`، ولا مفاتيحُ المرور ولا رموزُ التطبيق ولا بصماتُ رموز الاسترداد، ولا قناةُ
 *   التنبيهات (عنوانُها اعتماد، D-318)، ولا عنوانُ IP ولا وسمُ المتصفّح من سجلّ النشاط. والملفّاتُ نفسُها (الصورُ والمقاطع
 *   والأصول) قائمةٌ بأسمائها وأبوابها في اللوحة، لا بايتاتٍ في الملفّ.
 * - **`deleteOrg`**: **بعد تصديرٍ في آخر يوم**، وكتابةِ اسمه بيد المالك، وفصلِ حساباته (الفصلُ يُبطل الإذنَ عند المنصّة، D-197)
 *   — كلُّ صفوفها في معاملةٍ واحدة، ثمّ تُرفع من دعوات الأعضاء، وتنتقل جلساتُها إلى منظّمة المالك، وتُقيَّد ملفّاتُها للمحو.
 *   **ولا تُحذف منظّمةُ المالك أبدًا** (`OWNER_ORG`)، والحارسُ يطلب دورَ المالك وتحقّقًا للتوّ (D-317) قبل أن يصل هنا.
 *
 * ## وما يبقى بعدها
 *
 * **`cost_ledger`** وحدَه: دفترُ المشغّل الماليّ (D-008) — مزوّدٌ وعمليّةٌ ووحداتٌ وكلفة، بلا نصٍّ ولا بريد. وسطرُ الحذف نفسُه في
 * سجلّ نشاط المالك. وما في نُسخ الاسترجاع يبقى حتّى تنقضي مدّتُها (تقوله `/privacy`).
 */
import { atomically, type Db, type DbStatement } from '../tokens'
import { OWNER_ORG } from '../tenancy'
import { moveSessionsFrom, type SessionStore } from '../session'
import { queuePrefixes } from './trash'

/** صيغةُ الملفّ — تُرفع حين يتبدّل شكلُه، والقارئُ يعرف ما يقرأ. */
export const EXPORT_FORMAT = 'sada-org-export'
export const EXPORT_VERSION = 1

/** كم يبقى التصديرُ شرطًا محقَّقًا للحذف. */
export const EXPORT_FRESH_HOURS = 24

/**
 * جداولُ المنظّمة بترتيب الحذف: الأبناءُ قبل آبائهم (`plan_versions` قبل `plans` بلا `CASCADE`، ومحاولاتُ النشر قبل منشوراتها).
 * **و`cost_ledger` ليس فيها عمدًا** (انظر أعلاه).
 */
const OWNED = [
  'publish_attempts', 'metrics', 'media_claims', 'promotion_suggestions', 'media', 'posts',
  'review_verdicts', 'review_links', 'plan_edits', 'plan_items', 'plan_versions', 'import_jobs', 'plans', 'schedule_rules', 'content_items', 'analysis_claims', 'sources',
  'token_alerts', 'tokens', 'accounts', 'uploads', 'asset_marks', 'library_files', 'drive_media', 'drive_media_folder',
  'repo_status_sync', 'package_changes', 'package_revisions', 'package_media', 'package_files', 'package_sources',
  'reports', 'settings', 'provider_checks', 'providers', 'task_routes', 'oauth_apps', 'alert_outbox', 'notice_reads', 'web_vitals',
  'audit_log', 'briefs', 'brands',
] as const

/** ما يُصدَّر — بترتيبٍ يقرؤه إنسان: العميلُ ثمّ عمله ثمّ أثرُه. */
const EXPORTED = [
  'brands', 'briefs', 'settings', 'accounts', 'sources', 'content_items', 'plans', 'plan_items', 'plan_versions', 'plan_edits', 'import_jobs', 'schedule_rules', 'review_links', 'review_verdicts', 'posts', 'publish_attempts',
  'metrics', 'media', 'promotion_suggestions', 'uploads', 'library_files', 'asset_marks', 'drive_media', 'drive_media_folder', 'package_sources', 'package_files', 'package_media', 'package_revisions', 'package_changes', 'repo_status_sync', 'reports', 'token_alerts', 'providers', 'task_routes',
  'cost_ledger', 'audit_log',
] as const

/** ما لا يُصدَّر أصلًا، وسببُه — يُكتب في الملفّ نفسِه فلا يُظنّ أنّه نُسي. */
const NOT_EXPORTED: Readonly<Record<string, string>> = {
  tokens: 'أذونات المنصّات مشفّرة — لا تخرج من صدى',
  oauth_apps: 'أسرار تطبيقات المنصّات — لا تخرج من صدى',
  passkeys: 'مفاتيح المرور — عوامل دخول لا بيانات عميل',
  totp: 'رمز التطبيق — عامل دخول',
  member_totp: 'رموز تطبيقات الأعضاء — عوامل دخول',
  recovery_codes: 'بصمات رموز الاسترداد — عوامل دخول',
  auth_attempts: 'عدّادات محاولات الدخول — أمن لا بيانات',
  analysis_claims: 'حجوز تحليل داخليّة',
  media_claims: 'حجوز توليد داخليّة',
  alert_outbox: 'صندوق تنبيهات القناة — نصوصها في سجلّ النشاط',
  notice_reads: 'ما قُرئ من إشعارات اللوحة',
  web_vitals: 'عيّنات سرعة الصفحات بلا هويّة',
  // ‏اختباراتُ المفاتيح (D-348) — والسببُ يُكتب في ملفّ التصدير، فبلا رقم قرار
  provider_checks: 'اختبارات مفاتيح خدمات الكتابة والصور: حالُ المشغّل لا بيانات عميل',
}

/** أعمدةٌ لا تخرج أبدًا، أيًّا كان جدولُها — **والنمطُ بعدها شبكةٌ لعمودٍ يُضاف غدًا باسمٍ يشبهها**. */
const NEVER_COLUMNS = new Set([
  'key_enc', 'key_iv', 'secret_enc', 'secret_iv', 'access_enc', 'access_iv', 'refresh_enc', 'refresh_iv', 'secret_cipher',
  'hint', 'fingerprint', 'public_key', 'credential_id', 'multipart_id', 'ip', 'ua',
  // ‏بصمةُ رابط العميل (D-353): لا تفتح شيئًا وحدَها، لكنّها اعتمادٌ لا بيانات
  'token_hash',
])
const NEVER_PATTERN = /(_enc|_iv|secret|cipher|password|passkey|totp|recovery)$/i

/** إعداداتٌ لا تخرج: عنوانُ قناة التنبيهات اعتمادٌ يُرسَل باسم المالك (D-318). */
const SECRET_SETTINGS = new Set(['alert_webhook'])

type Row = Record<string, unknown>

function clean(row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) if (!NEVER_COLUMNS.has(k) && !NEVER_PATTERN.test(k)) out[k] = v
  return out
}

export interface OrgExport {
  readonly format: typeof EXPORT_FORMAT
  readonly version: typeof EXPORT_VERSION
  readonly exported_at: string
  readonly org: Row
  readonly tables: Readonly<Record<string, readonly Row[]>>
  readonly members: readonly Row[]
  readonly files: readonly { readonly table: string; readonly id: string; readonly key: string; readonly mime: string | null; readonly bytes: number | null }[]
  readonly not_exported: Readonly<Record<string, string>>
}

/**
 * جداولُ النموذج الموحَّد (D-383 · 0061) بأسمائها: الملفُّ يحمل كلَّ أعمدتها، وبنودُ الخطّة وسجلُّ تعديلها بترتيب وقوعها.
 * ‏ولا قارئَ لها في الشاشات قبل المرحلة ٧، فالملفُّ أوّلُ من يقرؤها كاملةً.
 */
const UNIFIED_QUERY: Readonly<Record<string, string>> = {
  import_jobs: 'SELECT * FROM import_jobs WHERE org_id = ? ORDER BY created_at, id',
  plan_items: 'SELECT * FROM plan_items WHERE org_id = ? ORDER BY plan_id, due_local, item_key',
  plan_edits: 'SELECT * FROM plan_edits WHERE org_id = ? ORDER BY at, id',
  schedule_rules: 'SELECT * FROM schedule_rules WHERE org_id = ?',
}

/** ملفُّ المنظّمة — أو `null` لمنظّمةٍ لا وجودَ لها. */
export async function exportOrg(db: Db, org: string, now = new Date()): Promise<OrgExport | null> {
  const head = await db.prepare('SELECT id, name, kind, created_at FROM orgs WHERE id = ?').bind(org).first<Row>()
  if (head === null) return null
  const tables: Record<string, Row[]> = {}
  for (const table of EXPORTED) {
    const { results } = await db.prepare(UNIFIED_QUERY[table] ?? `SELECT * FROM ${table} WHERE org_id = ? ORDER BY rowid`).bind(org).all<Row>()
    tables[table] = results
      .filter((r) => table !== 'settings' || !SECRET_SETTINGS.has(String(r['key'])))
      .map(clean)
  }
  // ‏من يدخل هذا العميل (D-272): بريدُه ودورُه — بلا عاملٍ ولا مفتاح، **ولا قائمةُ شركاته الأخرى**: معرّفاتُ عملاء غيره لا تخرج في ملفّه
  const { results: people } = await db
    .prepare('SELECT email, role, orgs, created_at, last_seen_at, revoked_at FROM members ORDER BY created_at')
    .all<Row>()
  const members = people
    .filter((m) => String(m['orgs']) === '*' || String(m['orgs']).split(',').includes(org))
    .map(({ orgs, ...m }) => ({ ...m, all_clients: orgs === '*' }))
  const files: OrgExport['files'][number][] = []
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  for (const m of tables['media'] ?? []) files.push({ table: 'media', id: String(m['id']), key: String(m['r2_key']), mime: String(m['mime']), bytes: num(m['bytes']) })
  for (const u of tables['uploads'] ?? []) files.push({ table: 'uploads', id: String(u['id']), key: String(u['r2_key']), mime: String(u['mime']), bytes: num(u['bytes']) })
  for (const f of tables['library_files'] ?? []) files.push({ table: 'library_files', id: String(f['id']), key: String(f['r2_key']), mime: String(f['mime']), bytes: num(f['bytes']) })
  for (const s of tables['sources'] ?? []) {
    for (const col of ['file_key', 'text_key'] as const) {
      if (typeof s[col] === 'string') files.push({ table: 'sources', id: String(s['id']), key: String(s[col]), mime: col === 'text_key' ? 'text/markdown' : String(s['mime']), bytes: null })
    }
  }
  return {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, exported_at: now.toISOString(),
    org: head, tables, members, files, not_exported: NOT_EXPORTED,
  }
}

/** سوابقُ ملفّات منظّمةٍ غير منظّمة المالك في R2 (`objectKey` · `library/<org>/` · `sources/<org>/`). */
export function orgPrefixes(org: string): readonly string[] {
  return [`org/${org}/`, `library/${org}/`, `sources/${org}/`]
}

/** ما يمنع حذفَ منظّمةٍ الآن — جملةٌ تقول ما يُفعَل، أو `null` إن جاز. */
export async function deleteBlocker(db: Db, org: string, typed: string, now = new Date()): Promise<string | null> {
  if (org === OWNER_ORG) return 'منظّمتُك أنت لا تُحذف من هنا.'
  const head = await db.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first<{ name: string }>()
  if (head === null) return 'لم أجد هذا العميل.'
  if (typed.trim().replace(/\s+/g, ' ') !== head.name) return 'اكتب اسمَ العميل كما هو تمامًا لتأكيد الحذف.'
  const exported = await db
    .prepare("SELECT 1 AS hit FROM audit_log WHERE org_id = ? AND action = 'org.export' AND target = ? AND at >= datetime(?, ?) LIMIT 1")
    .bind(OWNER_ORG, org, now.toISOString().replace('T', ' ').slice(0, 19), `-${EXPORT_FRESH_HOURS} hours`)
    .first()
  if (exported === null) return 'صدّر بياناته أوّلًا (في آخر 24 ساعة) — الحذفُ لا يُردّ.'
  const linked = await db
    .prepare("SELECT COUNT(*) AS n FROM accounts WHERE org_id = ? AND status != 'revoked'")
    .bind(org).first<{ n: number }>()
  if ((linked?.n ?? 0) > 0) return `افصل حساباته أوّلًا (${linked!.n}) من «الحسابات» — الفصلُ يُبطل إذنَه عند المنصّة.`
  /*
   * ‏**وإنفاقُ اليوم يُعَدّ في السقف العامّ** (D-277 · D-006): جملُ السقف تقرأ الدفترَ على `org_id IN (SELECT id FROM orgs)`، فعميلٌ
   * ‏يُحذف في يومٍ أنفق فيه يسقط إنفاقُه من سقف ذلك اليوم ويُفتح بقدره بابُ إنفاق. واليومُ يوم القاعدة (`date('now')`) كالسقف نفسِه.
   */
  const spent = await db
    .prepare("SELECT 1 AS hit FROM cost_ledger WHERE org_id = ? AND at >= date('now') LIMIT 1")
    .bind(org).first()
  if (spent !== null) return 'أنفق اليوم، وإنفاقُه يُعَدّ في سقف اليوم — احذفه بعد الثالثة فجرًا بتوقيت الرياض (منتصف الليل UTC).'
  return null
}

export type DeleteOrgResult =
  | { readonly ok: true; readonly name: string; readonly rows: number; readonly members: number; readonly sessions: number }
  | { readonly ok: false; readonly reason: string }

/** كم صفًّا للمنظّمة في جداولها — يُقال في الإشعار والسجلّ. */
async function countRows(db: Db, org: string): Promise<number> {
  const sum = OWNED.map((t) => `(SELECT COUNT(*) FROM ${t} WHERE org_id = ?1)`).join(' + ')
  const row = await db.prepare(`SELECT ${sum} AS n`).bind(org).first<{ n: number }>()
  return Number(row?.n ?? 0)
}

/**
 * يحذف المنظّمة كلَّها — **بعد `deleteBlocker`** في المسار نفسِه. والصفوفُ معاملةٌ واحدة: إن سقطت جملةٌ لم يُحذف شيء.
 * وما بعدها (الأعضاء، والجلسات، وقيدُ الملفّات) لا يُسقط ما وقع: يُقال في السجلّ ويُصلَح من مكانه.
 */
export async function deleteOrg(deps: { readonly db: Db; readonly kv: SessionStore }, org: string, typed: string, now = new Date()): Promise<DeleteOrgResult> {
  const { db, kv } = deps
  const blocked = await deleteBlocker(db, org, typed, now)
  if (blocked !== null) return { ok: false, reason: blocked }
  const name = (await db.prepare('SELECT name FROM orgs WHERE id = ?').bind(org).first<{ name: string }>())?.name ?? org
  const rows = await countRows(db, org)
  const statements: DbStatement[] = OWNED.map((t) => db.prepare(`DELETE FROM ${t} WHERE org_id = ?`).bind(org))
  statements.push(db.prepare('DELETE FROM orgs WHERE id = ?').bind(org))
  await atomically(db, statements)

  // ‏الدعواتُ تُرفع منها المنظّمة، ومن لم يبقَ له غيرُها أُلغي دخولُه — كما يُلغي المالكُ عضوًا (علامةٌ لا حذف)
  let members = 0
  const { results: people } = await db
    .prepare("SELECT email, orgs FROM members WHERE revoked_at IS NULL AND orgs != '*'")
    .all<{ email: string; orgs: string }>()
  for (const m of people) {
    const list = m.orgs.split(',').filter((x) => x !== '')
    if (!list.includes(org)) continue
    const rest = list.filter((x) => x !== org)
    await db
      .prepare(rest.length === 0
        ? "UPDATE members SET orgs = ?, revoked_at = datetime('now') WHERE email = ?"
        : 'UPDATE members SET orgs = ? WHERE email = ?')
      .bind(rest.join(','), m.email)
      .run()
    members += 1
  }
  const sessions = await moveSessionsFrom(kv, org, OWNER_ORG, now)
    .catch((error: unknown) => { console.warn({ job: 'org-delete', sessions_failed: String(error) }); return 0 })
  await queuePrefixes(kv, org, orgPrefixes(org), now)
    .catch((error: unknown) => console.warn({ job: 'org-delete', purge_unqueued: org, error: String(error) }))
  return { ok: true, name, rows, members, sessions }
}
