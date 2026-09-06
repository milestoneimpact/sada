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

export interface OAuthState {
  readonly platform: 'linkedin' | 'x'
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
    (v['platform'] === 'linkedin' || v['platform'] === 'x') &&
    typeof v['verifier'] === 'string' &&
    typeof v['redirectUri'] === 'string' &&
    typeof v['createdAt'] === 'string' &&
    (v['scopes'] === undefined || typeof v['scopes'] === 'string')
  )
}
