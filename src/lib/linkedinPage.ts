/**
 * ‏**صفحةُ LinkedIn — وجهةٌ ثانيةٌ بتطبيقٍ ثانٍ** (D-423 · M-03).
 *
 * ‏النشرُ باسم الشخص يجري بتطبيق LinkedIn الأوّل (`urn:li:person`، D-080). والنشرُ باسم الصفحة يحتاج
 * ‏**Community Management API**، ولا يُمنح هذا المنتجُ إلّا وحدَه على تطبيقه — فطلبه المالكُ على تطبيقٍ ثانٍ
 * ‏(«SADA Pages»). فلهذا التطبيق سرّان في Worker وحدَه (`LINKEDIN_ORG_CLIENT_ID` و`LINKEDIN_ORG_CLIENT_SECRET`)،
 * ‏**لا خزانةَ لهما ولا `wrangler.toml`** (CLAUDE.md)، وغيابُهما حالٌ تُقال لا عطل: «بانتظار موافقة LinkedIn».
 *
 * ‏والحسابُ يُحفظ في `accounts` بالمنصّة نفسِها (`linkedin`) ونوع `org`، ومعرّفُه رقمُ المنظّمة. **فلا ترحيل**:
 * ‏الجدولُ يحمل النوعَ منذ 0001، و`posts.platform` يبقى `linkedin`. والفرقُ يُقرأ من الحساب لا من المنصّة.
 */
import { withTimeout } from './net/timeout'
import { LINKEDIN_VERSION } from './oauth/providers'
import { hasScope } from './oauth/scopes'

/** نطاقُ النشر باسم الصفحة. */
export const LINKEDIN_ORG_SCOPE = 'w_organization_social'
/** نطاقُ قراءة منشورات الصفحة وتفاعلها — للتحليلات. */
export const LINKEDIN_ORG_READ_SCOPE = 'r_organization_social'
/** ما يطلبه التطبيقُ الثاني — هذان وحدهما. */
export const PAGE_SCOPES: readonly string[] = [LINKEDIN_ORG_SCOPE, LINKEDIN_ORG_READ_SCOPE]

/** سرّا التطبيق الثاني — اسمان لا قيمتان، وفي أسرار Worker وحدها. */
export const PAGE_SECRET_NAMES = ['LINKEDIN_ORG_CLIENT_ID', 'LINKEDIN_ORG_CLIENT_SECRET'] as const

/** قيمةُ المنصّة للصفحة في ملفّ الخطّة والمسارات والفرز. */
export const PAGE_PLATFORM = 'linkedin-page'

/** مسارُ العودة — يُبنى من `PUBLIC_BASE_URL` فلا يُخلَط نطاقان. */
export const PAGE_CALLBACK_PATH = '/oauth/linkedin-page/callback'

export const PAGE_SAY = {
  pending: 'بانتظار موافقة LinkedIn على Community Management API (M-03)',
  scope: 'إذنُ صفحة LinkedIn لا يشمل w_organization_social، فلا يُنشر باسمها. اربط الصفحة من «الحسابات» ← LinkedIn ← «اربط صفحة LinkedIn» بحساب مديرٍ لها (M-03). لم يُرسَل شيء.',
  badId: 'معرّفُ صفحة LinkedIn في الحساب ليس رقمَ منظّمة، فلا يُبنى urn:li:organization — أعد ربط الصفحة من «الحسابات».',
  none: 'لا صفحةَ تديرها على LinkedIn بهذا الحساب — والنشرُ باسم الصفحة لمديرها (ADMINISTRATOR) وحده.',
} as const

export interface PageApp { readonly clientId: string; readonly clientSecret: string }

/** سرّا التطبيق الثاني من بيئة Worker — أو `null` حين ينقص أحدهما. */
export function pageApp(env: Readonly<Record<string, unknown>>): PageApp | null {
  const id = env[PAGE_SECRET_NAMES[0]]
  const secret = env[PAGE_SECRET_NAMES[1]]
  if (typeof id !== 'string' || id.trim() === '' || typeof secret !== 'string' || secret.trim() === '') return null
  return { clientId: id.trim(), clientSecret: secret.trim() }
}

/** مؤلّفُ منشور الحساب على LinkedIn: الصفحةُ `urn:li:organization:`، والشخصُ `urn:li:person:` (D-080). */
export function linkedInAuthor(o: { readonly account_kind: string; readonly external_id: string }): string | null {
  if (o.account_kind === 'org') return /^\d{1,20}$/.test(o.external_id) ? `urn:li:organization:${o.external_id}` : null
  return o.external_id === '' ? null : `urn:li:person:${o.external_id}`
}

/** أينشر هذا الرمزُ باسم الصفحة؟ */
export function pageCanPublish(grantedRaw: string): boolean {
  return hasScope(grantedRaw, LINKEDIN_ORG_SCOPE)
}

interface DestinationLike { readonly platform: string; readonly kind: string; readonly displayName: string }

/** اسمُ الوجهة في الشاشة: «LinkedIn · حسابي» و«LinkedIn · صفحة <الاسم>» — وما عداهما «الاسم · المنصّة». */
export function destinationLabel(a: DestinationLike, platformName: string): string {
  if (a.platform === 'linkedin') return a.kind === 'org' ? `LinkedIn · صفحة ${a.displayName}` : 'LinkedIn · حسابي'
  return `${a.displayName} · ${platformName}`
}

/** مفتاحُ نسخة الوجهة الثانية — **مفتاحٌ لكلّ منشور** (D-004)، ومشتقٌّ فلا تُنشأ النسخةُ مرّتين. */
export function destinationKeyOf(baseKey: string, accountId: string): string {
  return `${baseKey}:dest:${accountId}`
}

export interface AdminOrg { readonly id: string; readonly name: string }

const ACLS_URL = 'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100'
const ORG_URL = (id: string): string => `https://api.linkedin.com/rest/organizations/${id}`
/** أقصى ما يُسأل عن اسمه — صفحاتٌ أكثرُ تُعرض بأرقامها. */
const NAME_LOOKUPS = 20

/**
 * ‏المنظّماتُ التي يديرها صاحبُ الرمز (`organizationAcls`، دور ADMINISTRATOR معتمَدًا)، ثمّ اسمُ كلٍّ منها.
 * ‏والاسمُ إن لم يُقرأ صار «صفحة <الرقم>» — الربطُ لا يسقط لاسم.
 */
export async function listAdminOrgs(
  accessToken: string,
  fetchImpl: typeof fetch = withTimeout(fetch, 15_000),
): Promise<AdminOrg[]> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'LinkedIn-Version': LINKEDIN_VERSION, 'X-Restli-Protocol-Version': '2.0.0' }
  const response = await fetchImpl(ACLS_URL, { headers })
  if (!response.ok) throw new Error(`organizationAcls: ${response.status}`)
  const body = (await response.json()) as { elements?: unknown }
  const ids: string[] = []
  for (const el of Array.isArray(body.elements) ? body.elements : []) {
    const e = el as { organization?: unknown; organizationTarget?: unknown; role?: unknown; state?: unknown }
    if (e.role !== undefined && e.role !== 'ADMINISTRATOR') continue
    if (e.state !== undefined && e.state !== 'APPROVED') continue
    const urn = typeof e.organization === 'string' ? e.organization : typeof e.organizationTarget === 'string' ? e.organizationTarget : ''
    const id = /^urn:li:organization:(\d{1,20})$/.exec(urn)?.[1]
    if (id !== undefined && !ids.includes(id)) ids.push(id)
  }
  const out: AdminOrg[] = []
  for (const [i, id] of ids.entries()) {
    let name = `صفحة ${id}`
    if (i < NAME_LOOKUPS) {
      try {
        const r = await fetchImpl(ORG_URL(id), { headers })
        if (r.ok) {
          const o = (await r.json()) as { localizedName?: unknown }
          if (typeof o.localizedName === 'string' && o.localizedName.trim() !== '') name = o.localizedName.trim()
        }
      } catch {
        // الاسمُ زينة: الرقمُ يكفي للنشر
      }
    }
    out.push({ id, name })
  }
  return out
}
