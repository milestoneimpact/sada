/**
 * فحصُ زوج الأسرار — **قبل الربط، لا بعد أن يفشل.**
 *
 * ## المشكلة
 *
 * `invalid_client` يصل **بعد أن ينجح كلُّ شيءٍ قبله**: شاشةُ الإذن
 * مرّت، والمنصّةُ أعطت `code`. **ولا يُفرَّق عندها بين سرٍّ خاطئ
 * ومعرّفٍ خاطئ وعلّةٍ ثالثة** — فيلصق المالكُ السرَّ مرّةً بعد مرّةٍ
 * ولا يتعلّم شيئا.
 *
 * ## وفرضيّةٌ افتُرضت ثمّ قِيست فسقطت
 *
 * بُني هذا أوّلا على **RFC 6749 §5.2**: «الخادمُ يوثّق العميلَ أوّلا
 * ثمّ يتحقّق من المنحة». فيُرسَل رمزٌ باطلٌ ويُقرأ الخطأ.
 *
 * **وقياسُ LinkedIn نفى ذلك:**
 *
 * ```
 * grant_type=authorization_code, code=bogus, سرٌّ خاطئ
 *   → invalid_request: "authorization code not found"
 * grant_type=authorization_code, code=bogus, سرٌّ صحيح
 *   → invalid_request: "authorization code not found"   (لا فرق)
 * ```
 *
 * **فهو يفحص الرمزَ أوّلا، عكسَ المعيار** — والفحصُ بذلك المسار لا
 * يميّز شيئا. وهذه هي علّةُ الفرض حين لا يُقاس.
 *
 * ## والمسارُ الذي يميّز — مقيسا لا مفترَضا
 *
 * `client_credentials` **لا منحةَ فيه تُفحَص**، فلا يبقى إلّا توثيقُ
 * العميل. والمقيسُ من `www.linkedin.com/oauth/v2/accessToken`:
 *
 * | ما أُرسل | ما عاد |
 * |---|---|
 * | معرّفٌ صحيح + سرٌّ خاطئ | `invalid_client` · «Client authentication failed» |
 * | معرّفٌ لا وجودَ له | `invalid_client_id` · «The passed in client_id is invalid …» |
 *
 * **فالجوابان يفترقان** — ويُقال للمالك أيُّ الحقلين هو الخطأ، لا
 * «راجع الأسرار».
 *
 * ## وما لم يُقَس لا يُدَّعى
 *
 * Google **مقيسٌ كذلك**: يردّ `unsupported_grant_type` **قبل** أن يوثّق
 * العميل — فلا فحصَ له بهذا المسار، ويُقال ذلك.
 *
 * و X و TikTok **لم يُقاسا** (محجوبان عن بيئة القياس). فيُنادَيان
 * ويُصنَّف الجوابُ بمفردات المعيار وحدها، **وما لم يُعرَف يُقال «لم
 * يُحسَم»** — ولا يُبنى حكمٌ على قياسٍ لم يقع.
 */
import type { Platform, Provider } from './providers'
import type { ClientCredentials } from './exchange'

export type Verdict =
  /** السرُّ مرفوض — المعرّفُ معروفٌ عند المنصّة والسرُّ لا يوافقه. */
  | { readonly kind: 'bad_secret'; readonly code: string; readonly description?: string }
  /** المعرّفُ نفسُه لا تعرفه المنصّة — تطبيقٌ آخرُ أو حرفٌ ساقط. */
  | { readonly kind: 'bad_client_id'; readonly code: string; readonly description?: string }
  /** جاز التوثيق — والعلّةُ إن بقيت فليست في الزوج. */
  | { readonly kind: 'accepted'; readonly code: string; readonly description?: string }
  /** لا فحصَ لهذه المنصّة — ويُقال السببُ ولا يُدَّعى حكم. */
  | { readonly kind: 'unsupported'; readonly detail: string }
  /** لم يُفهَم الجواب — ولا يُدَّعى حكمٌ بلا دليل. */
  | { readonly kind: 'inconclusive'; readonly detail: string }

/**
 * أيُّ المنصّات يصلح لها هذا المسار — **بالقياس**.
 *
 * Google مقيسٌ أنّه يردّ `unsupported_grant_type` قبل التوثيق، فلا
 * يُنادى أصلا: نداءٌ يعود بجوابٍ لا يميّز **يوهم بأنّ فحصا وقع**.
 */
export const PROBE_UNAVAILABLE: Readonly<Partial<Record<Platform, string>>> = {
  youtube:
    'Google يردّ «unsupported_grant_type» قبل أن يوثّق العميل — ' +
    'فلا يميّز هذا الفحصُ عنده بين سرٍّ صحيحٍ وخاطئ. وضبطُه يُتحقَّق منه بالربط.',
}

/** سقوطُ توثيقٍ: السرُّ لا يوافق معرّفا تعرفه المنصّة. */
const SECRET_FAILURES: ReadonlySet<string> = new Set([
  'invalid_client',
  'unauthorized_client',
])

/** المعرّفُ نفسُه مجهول — وLinkedIn وحده يفرده باسم، وغيرُه قد لا يفرده. */
const ID_FAILURES: ReadonlySet<string> = new Set([
  'invalid_client_id',
  'invalid_client_credentials',
])

export async function verifyAppCredentials(
  provider: Provider,
  creds: ClientCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<Verdict> {
  const blocked = PROBE_UNAVAILABLE[provider.platform]
  if (blocked !== undefined) return { kind: 'unsupported', detail: blocked }

  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }
  if (provider.clientAuth === 'basic') {
    headers['Authorization'] = `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`
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
   * **جوابٌ ناجحٌ يعني أنّ الزوجَ سليم** — والمنصّةُ أعطت رمزَ تطبيق.
   *
   * ولا يُقرأ الجسدُ ولا يُخزَّن منه شيء: الغرضُ الحكمُ لا الرمز،
   * **ورمزٌ يصل من طريقٍ لم يُقصَد لا يُحفَظ** (D-005).
   */
  if (response.ok) return { kind: 'accepted', code: 'ok' }

  let code = 'unknown'
  let description: string | undefined
  try {
    const failure = (await response.json()) as { error?: unknown; error_description?: unknown }
    if (typeof failure.error === 'string' && failure.error.length > 0) code = failure.error
    if (typeof failure.error_description === 'string' && failure.error_description.length > 0) {
      description = failure.error_description.slice(0, 300)
    }
  } catch {
    return { kind: 'inconclusive', detail: `جوابٌ ليس JSON (${response.status})` }
  }

  if (code === 'unknown') {
    return { kind: 'inconclusive', detail: `جوابٌ بلا رمزِ خطأ (${response.status})` }
  }

  const kind = ID_FAILURES.has(code)
    ? 'bad_client_id'
    : SECRET_FAILURES.has(code)
      ? 'bad_secret'
      : /**
         * **وما عدا ذلك يُعدّ جوازا.**
         *
         * خطأٌ يتكلّم عن المنحة أو المنتَج (`unsupported_grant_type`
         * مثلا عند منصّةٍ لم تُقَس) يعني أنّ المنصّة **تجاوزت التوثيق**
         * ووصلت إلى ما بعده. وهو استدلالٌ لا قياس، فيُقال في الشاشة
         * نصُّ المنصّة كاملا ليحكم المالكُ بعينه.
         */
        'accepted'

  return description === undefined ? { kind, code } : { kind, code, description }
}
