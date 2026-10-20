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
    (v['org'] === undefined || typeof v['org'] === 'string')
  )
}
