/**
 * **الفريق** (D-272) — من دُعي إلى صدى، وبأيّ دور، وعلى أيّ شركة.
 *
 * - **المالكُ ليس صفًّا**: بريدُه ثابتٌ في الشيفرة (D-245)، فلا يُلغى ولا يُنزَّل من لوحة.
 * - **الدعوةُ بريدٌ ودورٌ وشركات** (`*` للكلّ). والإلغاءُ علامةٌ لا حذف، فيبقى في التدقيق من كان.
 * - **والدخولُ برمز البريد نفسِه**: `whoCanReceive` تقبل المالكَ أو مدعوًّا قائمًا، ولا تقول لغيرهما شيئًا (لا تعداد).
 */
import type { Db } from './tokens'
import { isOwnerEmail, normalizeEmail, OWNER_EMAIL, type Role } from './ownerEmail'

export type MemberRole = Exclude<Role, 'owner'>
export const MEMBER_ROLES: readonly MemberRole[] = ['admin', 'publisher', 'editor', 'viewer']

/** اسمُ الدور وما يملكه — سطرٌ يُقرأ في ثانية. */
export const ROLE_LABEL: Readonly<Record<Role, { readonly name: string; readonly can: string }>> = {
  owner: { name: 'المالك', can: 'كلُّ شيء، والفريقُ والأمان' },
  admin: { name: 'مدير', can: 'كلُّ شيءٍ في شركاته، إلّا الفريقَ والأمانَ ومفاتيحَ المزوّدين' },
  publisher: { name: 'ناشر', can: 'يكتب ويعتمد ويجدول' },
  editor: { name: 'محرّر', can: 'يعدّل المسوّدات ويرتّب الخطّة ويكتب نصوص المقطع بيده، ولا يعتمد ولا ينشر ولا يبدأ ما يُدفَع ثمنُه' },
  viewer: { name: 'قارئ', can: 'يرى ولا يغيّر شيئًا' },
}

export interface Member {
  readonly email: string
  readonly role: MemberRole
  /** `'*'` لكلّ الشركات، أو قائمةُ معرّفات. */
  readonly orgs: '*' | readonly string[]
  readonly invitedBy: string
  readonly createdAt: string
  readonly lastSeenAt: string | null
}

export interface Who {
  readonly email: string
  readonly role: Role
  readonly orgs: '*' | readonly string[]
}

export const OWNER_WHO: Who = { email: OWNER_EMAIL, role: 'owner', orgs: '*' }

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

function parseOrgs(raw: string): '*' | string[] {
  return raw === '*' ? '*' : raw.split(',').filter((x) => x !== '')
}

function rowToMember(r: Record<string, string | null>): Member {
  return {
    email: String(r['email']),
    role: String(r['role']) as MemberRole,
    orgs: parseOrgs(String(r['orgs'] ?? '*')),
    invitedBy: String(r['invited_by'] ?? ''),
    createdAt: String(r['created_at'] ?? ''),
    lastSeenAt: r['last_seen_at'] ?? null,
  }
}

/**
 * مدعوٌّ قائمٌ بهذا البريد، أو `null` — والملغى `null`.
 *
 * **وقاعدةٌ لا تردّ ترمي، لا تقول «لا أحد»** (مراجعة D-317). كان الخطأ يُبلَع فيصير `null`، و`/panel/login` يجعل
 * «لا أحد» دورَ «قارئ» فيحسب منه أنّ العاملَ الثانيَ لا يلزم: عثرةٌ واحدةٌ في D1 فتحت لمديرٍ بلا عاملٍ جلسةً كاملة.
 * فمن يقرّر على الجواب يقرّر على جواب: «لا أحد» أو «القاعدةُ لم تردّ»، ولكلٍّ ردُّه.
 */
export async function activeMember(db: Db, raw: string): Promise<Member | null> {
  const row = await db
    .prepare('SELECT * FROM members WHERE email = ? AND revoked_at IS NULL')
    .bind(normalizeEmail(raw))
    .first<Record<string, string | null>>()
  return row === null ? null : rowToMember(row)
}

/** **من يُرسَل إليه رمزُ الدخول** — المالكُ أو مدعوٌّ قائم. والسؤالُ في موضعٍ واحد (D-245). ويرمي إن لم تردّ القاعدة. */
export async function whoCanReceive(db: Db, raw: string): Promise<Who | null> {
  const email = normalizeEmail(raw)
  if (isOwnerEmail(email)) return OWNER_WHO
  const m = await activeMember(db, email)
  return m === null ? null : { email: m.email, role: m.role, orgs: m.orgs }
}

export async function listMembers(db: Db): Promise<Member[]> {
  const { results } = await db
    .prepare('SELECT * FROM members WHERE revoked_at IS NULL ORDER BY created_at')
    .bind()
    .all<Record<string, string | null>>()
    .catch(() => ({ results: [] as Record<string, string | null>[] }))
  return results.map(rowToMember)
}

export type InviteResult = { readonly ok: true; readonly email: string } | { readonly ok: false; readonly reason: string }

/**
 * دعوةٌ أو تعديلُ دعوة — **البريدُ مفتاحُها**، فدعوةُ بريدٍ مدعوٍّ تعدّل دورَه وشركاتِه، ودعوةُ ملغًى تعيده.
 * والشركاتُ تُصدَّق من `orgs` لا من النموذج.
 */
export async function inviteMember(
  db: Db,
  input: { readonly email: string; readonly role: string; readonly orgs: '*' | readonly string[]; readonly by: string },
): Promise<InviteResult> {
  const email = normalizeEmail(input.email)
  if (!EMAIL.test(email)) return { ok: false, reason: 'اكتب بريدًا صحيحًا.' }
  if (email === OWNER_EMAIL) return { ok: false, reason: 'هذا بريدُ المالك — له كلُّ شيءٍ دون دعوة.' }
  if (!(MEMBER_ROLES as readonly string[]).includes(input.role)) return { ok: false, reason: 'اختر دورًا من القائمة.' }
  let orgs = '*'
  if (input.orgs !== '*') {
    if (input.orgs.length === 0) return { ok: false, reason: 'اختر شركةً واحدةً على الأقلّ، أو «كلّ الشركات».' }
    const marks = input.orgs.map(() => '?').join(',')
    const { results } = await db.prepare(`SELECT id FROM orgs WHERE id IN (${marks})`).bind(...input.orgs).all<{ id: string }>()
    if (results.length !== new Set(input.orgs).size) return { ok: false, reason: 'شركةٌ غيرُ موجودة في القائمة.' }
    orgs = results.map((r) => r.id).join(',')
  }
  await db
    .prepare(
      `INSERT INTO members (email, role, orgs, invited_by) VALUES (?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET role = excluded.role, orgs = excluded.orgs,
         invited_by = excluded.invited_by, revoked_at = NULL`,
    )
    .bind(email, input.role, orgs, input.by)
    .run()
  return { ok: true, email }
}

export async function revokeMember(db: Db, raw: string): Promise<boolean> {
  const r = await db
    .prepare("UPDATE members SET revoked_at = datetime('now') WHERE email = ? AND revoked_at IS NULL RETURNING email")
    .bind(normalizeEmail(raw))
    .first<{ email: string }>()
  return r !== null
}

export async function touchMember(db: Db, email: string): Promise<void> {
  await db.prepare("UPDATE members SET last_seen_at = datetime('now') WHERE email = ?").bind(email).run().catch(() => undefined)
}
