/**
 * المنظّماتُ والمنظّمةُ النشطة (D-225) — **حسابُ الدخول الحاليّ يدير كلَّ المنظّمات**.
 *
 * قرارُ المالك: الآن حسابٌ واحدٌ يدير الكلّ، ثمّ مديرٌ لكلّ منظّمة، ثمّ حساباتٌ
 * إشرافيّةٌ للقراءة (وثيقةُ الرؤية §الوصول). فالجلسةُ التي يفتحها الدخولُ اليوم
 * — بالرمز أو بمفتاح المرور — **جلسةُ المشغّل**: ترى كلَّ المنظّمات وتبدّل بينها.
 *
 * والمنظّمةُ النشطةُ في صفّ الجلسة في KV لا في كعكةٍ ولا عنوان: لا يكتبها إلّا
 * الخادم، ولا يُقبَل معرّفٌ لا يوجد في `orgs`.
 */
import { atomically, type Db } from './tokens'
import { orgAllowed, whoNow } from './access'

/** منظّمةُ المالك الأوّل — القيمةُ الافتراضيّةُ لكلّ عمود `org_id` (0031). */
export const OWNER_ORG = 'org_owner'

export const ORG_KINDS = ['individual', 'team', 'agency', 'enterprise'] as const
export type OrgKind = (typeof ORG_KINDS)[number]

export const ORG_KIND_LABEL: Readonly<Record<OrgKind, string>> = {
  individual: 'فرد',
  team: 'فريق',
  agency: 'وكالة',
  enterprise: 'مؤسّسة',
}

export interface OrgRow {
  readonly id: string
  readonly name: string
  readonly kind: OrgKind
  readonly brands: number
}

/** المنظّمةُ النشطة في جلسة — وجلسةٌ بلا منظّمةٍ تعمل في منظّمة المالك. */
export function activeOrg(record: { readonly org?: string }): string {
  return record.org ?? OWNER_ORG
}

const asKind = (v: unknown): OrgKind => (ORG_KINDS as readonly unknown[]).includes(v) ? (v as OrgKind) : 'individual'

/** المنظّماتُ بترتيب إنشائها — **كلُّها للمالك، وشركاتُ المدعوّ وحدَها له** (D-271). */
export async function listOrgs(db: Db): Promise<OrgRow[]> {
  const { results } = await db
    .prepare(`SELECT o.id, o.name, o.kind,
                (SELECT COUNT(*) FROM brands b WHERE b.org_id = o.id) AS brands
              FROM orgs o ORDER BY o.created_at, o.id`)
    .all<{ id: string; name: string; kind: string; brands: number }>()
  const who = whoNow()
  return results
    .filter((r) => who === undefined || orgAllowed(who, r.id))
    .map((r) => ({ id: r.id, name: r.name, kind: asKind(r.kind), brands: Number(r.brands) }))
}

export async function orgExists(db: Db, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT 1 AS hit FROM orgs WHERE id = ?').bind(id).first<{ hit: number }>()
  return row !== null
}

/** حدُّ الاسم: يكفي اسمَ جهة، ولا يملأ الشاشة ولا الصفّ. */
export const ORG_NAME_MAX = 80

export type CreateOrgResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: 'name' | 'kind' }

/**
 * ينشئ منظّمةً **ومعها علامتُها الأولى باسمها** — فلا منظّمةَ بلا مكانٍ يُعمَل فيه.
 * والصفّان في دفعةٍ واحدة: لا منظّمةَ يتيمةٌ إن سقط الثاني.
 */
export async function createOrg(
  db: Db,
  input: { readonly name: string; readonly kind: string },
  newId: () => string = () => crypto.randomUUID(),
): Promise<CreateOrgResult> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (name.length === 0 || name.length > ORG_NAME_MAX) return { ok: false, reason: 'name' }
  if (!(ORG_KINDS as readonly string[]).includes(input.kind)) return { ok: false, reason: 'kind' }
  const id = `org_${newId()}`
  const brand = `brand_${newId()}`
  await atomically(db, [
    db.prepare('INSERT INTO orgs (id, name, kind) VALUES (?, ?, ?)').bind(id, name, input.kind),
    db.prepare('INSERT INTO brands (id, org_id, name) VALUES (?, ?, ?)').bind(brand, id, name),
  ])
  return { ok: true, id }
}

/**
 * مسارُ ملفٍّ في R2 للمنظّمة (D-236): ملفّاتُ المالك بمساراتها القائمة فلا يُنقَل
 * شيء، ولغيره تحت `org/<المنظّمة>/`. فتُحصى ملفّاتُ منظّمةٍ وتُحذَف بسابقةٍ واحدة.
 */
export function objectKey(org: string, path: string): string {
  return org === OWNER_ORG ? path : `org/${org}/${path}`
}

/** منظّمةُ منشور، وما لا يُعرَف فللمالك — للعامل الذي لا جلسةَ له. */
export async function orgOfPost(db: Db, postId: string): Promise<string> {
  const row = await db.prepare('SELECT org_id FROM posts WHERE id = ?').bind(postId).first<{ org_id: string }>()
  return row?.org_id ?? OWNER_ORG
}
