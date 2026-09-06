/**
 * فحصُ زوج الأسرار — **قبل الربط، لا بعد أن يفشل.**
 *
 * ## المشكلة التي وُجد لها
 *
 * `invalid_client` يصل **بعد أن ينجح كلُّ شيءٍ قبله**: شاشةُ الإذن
 * مرّت، والمنصّةُ أعطت `code`. **ولا يُفرَّق عندها بين سرٍّ خاطئ وعلّةٍ
 * في الطلب** — والمالكُ يُعيد لصقَ السرّ مرّةً بعد مرّةٍ بلا جواب.
 *
 * ## والحيلةُ ترتيبٌ في المعيار لا خدعة
 *
 * RFC 6749 §5.2: **الخادمُ يوثّق العميلَ أوّلا، ثمّ يتحقّق من المنحة.**
 *
 * | ما يعود | ماذا يعني |
 * |---|---|
 * | `invalid_client` · `unauthorized_client` | **سقط التوثيق** — الزوجُ مرفوض |
 * | `invalid_grant` أو أيُّ شيءٍ آخر | **جاز التوثيق** — ووصل إلى الرمز فردَّه |
 *
 * فنُرسل **رمزا باطلا عمدا**. إن ردّه بـ`invalid_grant` فالزوجُ سليم،
 * وإن ردّه بـ`invalid_client` **فالزوجُ هو العطل** — ويُقال بلا أن
 * يمرّ المالكُ بدورة إذنٍ كاملة.
 *
 * ## ولا يُنتَج رمزُ وصولٍ بحال
 *
 * الرمزُ المرسَل **عشوائيٌّ لا يمكن أن يكون منحةً صالحة**، فأقصى ما
 * يقع أن تُردّ. ولا تكلفة: نهاياتُ الرمز مجّانيّةٌ عند الأربع، فلا صفَّ
 * في `cost_ledger` (D-008 يوجب التسجيل على **المدفوع**).
 */
import type { Provider } from './providers'
import type { ClientCredentials } from './exchange'

export type Verdict =
  /** الزوجُ مرفوض — وهذا هو الجواب الحاسم. */
  | { readonly kind: 'rejected'; readonly code: string; readonly description?: string }
  /** جاز التوثيقُ ورُدّ الرمزُ الباطل — وهو المنتظَر، والزوجُ سليم. */
  | { readonly kind: 'accepted'; readonly code: string; readonly description?: string }
  /** لم يُفهَم الجواب — ولا يُدَّعى حكمٌ لا دليلَ عليه. */
  | { readonly kind: 'inconclusive'; readonly detail: string }

/** ما يُعدّ سقوطا في توثيق العميل. وما عداه يعني أنّ التوثيق جاز. */
const AUTH_FAILURES: ReadonlySet<string> = new Set([
  'invalid_client',
  'unauthorized_client',
])

/**
 * رمزٌ لا يمكن أن يكون منحةً صالحة.
 *
 * **ولا يُبنى عشوائيّا في كلّ نداء**: قيمةٌ ثابتةٌ مميّزةٌ تظهر في سجلّ
 * المنصّة فيُعرَف أنّها فحصٌ من صدى لا محاولةَ اقتحام.
 */
export const PROBE_CODE = 'sada-credential-probe-not-a-real-grant'

export async function verifyAppCredentials(
  provider: Provider,
  creds: ClientCredentials,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Verdict> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: PROBE_CODE,
    redirect_uri: redirectUri,
  })
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }
  if (provider.clientAuth === 'basic') {
    headers['Authorization'] = `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`
    body.set('client_id', creds.clientId)
  } else {
    body.set(provider.clientIdParam ?? 'client_id', creds.clientId)
    body.set('client_secret', creds.clientSecret)
  }

  let response: Response
  try {
    response = await fetchImpl(provider.tokenUrl, { method: 'POST', headers, body })
  } catch (error) {
    // عطلُ شبكةٍ ليس حكما على الزوج — ولا يُقال «سليم» ولا «مرفوض»
    return { kind: 'inconclusive', detail: `تعذّر الوصول: ${String(error).slice(0, 120)}` }
  }

  /**
   * **٢٠٠ هنا خطأٌ برمجيّ لا نجاح.**
   *
   * رمزٌ باطلٌ لا يُبدَّل. فجوابٌ ناجح يعني أنّ المنصّة قبلت ما لا
   * يُقبَل — ولا يُبنى عليه حكم، **ولا يُقرأ الجسدُ فيه** لئلّا يُخزَّن
   * رمزٌ وصلَ من طريقٍ لم يُقصَد.
   */
  if (response.ok) {
    return { kind: 'inconclusive', detail: 'ردَّت المنصّةُ بنجاحٍ على رمزٍ باطل' }
  }

  let code = 'unknown'
  let description: string | undefined
  try {
    const failure = (await response.json()) as { error?: unknown; error_description?: unknown }
    if (typeof failure.error === 'string' && failure.error.length > 0) code = failure.error
    if (typeof failure.error_description === 'string' && failure.error_description.length > 0) {
      description = failure.error_description.slice(0, 300)
    }
  } catch {
    return {
      kind: 'inconclusive',
      detail: `جوابٌ ليس JSON (${response.status})`,
    }
  }

  if (code === 'unknown') {
    return { kind: 'inconclusive', detail: `جوابٌ بلا رمزِ خطأ (${response.status})` }
  }

  const kind = AUTH_FAILURES.has(code) ? 'rejected' : 'accepted'
  return description === undefined ? { kind, code } : { kind, code, description }
}
