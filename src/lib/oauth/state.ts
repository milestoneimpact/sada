/**
 * حالة الطلب بين `start` و `callback`.
 *
 * تُخزن في KV بعمر قصير، وتُستهلك مرة واحدة: يُحذف المفتاح قبل أن تُستعمل
 * قيمته. فمحاولة إعادة استعمال نفس `code` و `state` تجد لا شيء وترفض.
 *
 * وهذا هو الحاجز أمام CSRF على مسار OAuth: من لا يملك `state` الذي أصدرناه
 * لا يستطيع أن يربط حسابه بمكان صاحب الجلسة.
 */

/** ما يكفي KV من واجهة، حتى تُختبر الوحدة بمخزن في الذاكرة. */
export interface StateStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

import { PLATFORM_IDS, type Platform } from './providers'

export interface OAuthState {
  /**
   * **والمنصّةُ تُشتَقّ ولا تُكتب ثانيةً** (D-121).
   *
   * كانت مكتوبةً هنا اتّحادا يدويّا، **فبقيت أربعا حين صارت خمسا** —
   * وهي علّةُ `SETTING_KEYS` في D-110 بعينها: نوعٌ في موضعٍ وقائمةٌ في
   * موضع، فيفترقان صامتين.
   */
  readonly platform: Platform
  /** معرف PKCE — موجود لـ X دائما، ولـ LinkedIn أيضا لأن المسار واحد. */
  readonly verifier: string
  readonly redirectUri: string
  readonly createdAt: string
  /**
   * ما طُلب من نطاقاتٍ في **هذه** الدورة، مفصولةً بمسافة.
   *
   * ودورةٌ تطلب الهويّةَ وحدها (D-045) تفترق عن الكاملة، **والفرقُ
   * يُحفظ مع الحالة لا يُستنتَج بعدها**: ما يُسجَّل في القاعدة عند
   * غياب `scope` في الجواب يُبنى عليه، والحارسُ يقرأ من القاعدة —
   * فمن سجّل الكاملةَ مكان الهويّة كتب أنّ الحسابَ ينشر وهو لا ينشر.
   *
   * واختياريٌّ لأنّ حالةً محفوظةً قبل هذا التغيير لا تحمله: تُقرأ ولا
   * تُرفَض، ويُفترَض عندها الكامل — وهو ما كان يقع فعلا قبله.
   */
  readonly scopes?: string
  /**
   * المنظّمةُ التي بدأت الدورة (D-229). **وتُحفَظ مع الحالة لأنّ العودةَ
   * بلا جلسة**: كعكةُ `SameSite=Strict` لا تعبر التحويلَ من المنصّة.
   * واختياريٌّ كـ`scopes`: حالةٌ قديمةٌ بلا منظّمةٍ تُنسَب إلى المالك.
   */
  readonly org?: string
  /**
   * **بصمةُ كعكة المتصفّح الذي بدأ** (D-318) — SHA-256 لقيمةٍ عشوائيّةٍ في كعكة `__Host-` قصيرة. والعودةُ لا تُكمل إلّا
   * من متصفّحٍ يحمل القيمة: رابطُ موافقةٍ يُرسَل إلى شخصٍ آخر لا يربط حسابَه في منظّمة من أرسله.
   * واختياريٌّ في النوع لحالةٍ حُفظت قبله — **وغيابُه يُردّ عند العودة** لا يُفترَض.
   */
  readonly binding?: string
}

/**
 * اسمُ كعكة الربط بالمتصفّح (D-318): `__Host-` فلا نطاقَ لها ولا مسارَ غيرُ `/`، ولا تُكتب إلّا على https.
 * **ولكلّ منصّةٍ كعكتُها**: ربطُ LinkedIn وX في لسانين معًا لا يكتب أحدُهما فوق الآخر فيُردّ الأوّلُ «من متصفّحٍ آخر».
 */
export function bindingCookieName(platform: string): string {
  return `__Host-sada-oauth-${platform.replace(/[^a-z]/g, '')}`
}

/** بصمةُ قيمة الكعكة — ما يُخزَّن في الحالة، فمن قرأ KV لا يملك الكعكة. */
export async function bindingHash(nonce: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`oauth-binding:${nonce}`)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * الكعكةُ عند البدء: `HttpOnly` فلا يقرؤها سكربت، و`SameSite=Lax` لأنّ العودةَ من المنصّة تنقّلٌ من موقعٍ آخر (و`Strict`
 * لا تعبره، كما لا تعبره كعكةُ الجلسة)، وعمرُها عمرُ الحالة.
 */
export function bindingCookie(platform: string, nonce: string): string {
  return `${bindingCookieName(platform)}=${nonce}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_SECONDS}`
}

/** تُمحى عند العودة نجحت أم لا: الدورةُ انتهت. */
export function clearedBindingCookie(platform: string): string {
  return `${bindingCookieName(platform)}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`
}

/** أيحمل هذا المتصفّحُ كعكةَ الدورة؟ — بمقارنةٍ ثابتة الزمن، وغيابُ أحدهما «لا». */
export async function sameBrowser(saved: OAuthState, nonce: string | null): Promise<boolean> {
  if (saved.binding === undefined || nonce === null || nonce === '') return false
  const presented = await bindingHash(nonce)
  if (presented.length !== saved.binding.length) return false
  let diff = 0
  for (let i = 0; i < presented.length; i += 1) diff |= presented.charCodeAt(i) ^ saved.binding.charCodeAt(i)
  return diff === 0
}

export class StateError extends Error {
  override readonly name = 'StateError'
}

/** عشر دقائق: أطول من أي دورة موافقة بشرية، وأقصر من أن تُترك مفتوحة. */
export const STATE_TTL_SECONDS = 600

const PREFIX = 'oauth:state:'

export async function saveState(
  store: StateStore,
  state: string,
  value: OAuthState,
): Promise<void> {
  await store.put(PREFIX + state, JSON.stringify(value), {
    expirationTtl: STATE_TTL_SECONDS,
  })
}

/**
 * يقرأ الحالة ويحذفها في النفس نفسه. الحذف أولا حتى لا يمر طلبان
 * متزامنان بالقيمة نفسها.
 */
export async function consumeState(
  store: StateStore,
  state: string,
): Promise<OAuthState> {
  if (state.length === 0) throw new StateError('state مفقود')
  const key = PREFIX + state
  const raw = await store.get(key)
  await store.delete(key)
  if (raw === null) {
    throw new StateError('state غير معروف أو منتهي أو مستعمل من قبل')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new StateError('state تالف')
  }
  if (!isOAuthState(parsed)) throw new StateError('state ناقص الحقول')
  return parsed
}

function isOAuthState(value: unknown): value is OAuthState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    // **والفحصُ من القائمة الحيّة**: منصّةٌ تُضاف غدا تدخل النوعَ
    // والفحصَ معا، أو لا تدخل أيّهما
    typeof v['platform'] === 'string' &&
    (PLATFORM_IDS as readonly string[]).includes(v['platform']) &&
    typeof v['verifier'] === 'string' &&
    typeof v['redirectUri'] === 'string' &&
    typeof v['createdAt'] === 'string' &&
    (v['scopes'] === undefined || typeof v['scopes'] === 'string') &&
    (v['org'] === undefined || typeof v['org'] === 'string') &&
    (v['binding'] === undefined || typeof v['binding'] === 'string')
  )
}
