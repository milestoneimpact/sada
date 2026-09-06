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
 * ما تردّه المنصّةُ حين **لا تملك منحةَ رموز التطبيقات** — مقيسٌ حرفا.
 *
 * جوابُ LinkedIn على `client_credentials` لتطبيقٍ بلا هذا المنتَج:
 *
 *     access_denied · "This application is not allowed to create
 *                      application tokens"
 *
 * **وهو خطأُ منتَجٍ لا خطأُ توثيق** — يقع قبل أن يُنظَر في السرّ أصلا.
 * فيعود بالنصّ نفسِه **لأيّ سرّ**، صحيحا كان أو خاطئا.
 *
 * وقد كان يُقرأ جوازا (D-076)، **فأعطى خُضرةً على سرٍّ ترفضه المنصّةُ
 * في منحة الرمز** — ودام ذلك ساعاتٍ صرفت البحثَ عن موضع العطب.
 *
 * فيُسمَّى هنا ليُقال للمالك ما يعنيه بدل أن يُعرَض نصّا خاما.
 */
export const NO_APP_TOKENS = 'not allowed to create application tokens'

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

  if (ID_FAILURES.has(code)) {
    return description === undefined
      ? { kind: 'bad_client_id', code }
      : { kind: 'bad_client_id', code, description }
  }
  if (SECRET_FAILURES.has(code)) {
    return description === undefined
      ? { kind: 'bad_secret', code }
      : { kind: 'bad_secret', code, description }
  }

  /*
   * **وما عدا ذلك «لا يُعرَف» — لا جواز** (D-076).
   *
   * كان يُعدّ جوازا باستدلال: «خطأٌ يتكلّم عن المنحة يعني أنّ المنصّة
   * تجاوزت التوثيق». **والاستدلالُ كذب على LinkedIn**: أعطى «تقت»
   * خضراءَ على زوجٍ ردّته المنصّةُ نفسُها في منحة `authorization_code`
   * — وقِيس ذلك حرفا: `invalid_client` من طرفيّةٍ مباشرة، بلا PKCE،
   * برمزٍ صحيح.
   *
   * **وخُضرةٌ كاذبة أسوأُ من لا فحص**: تصرف المالكَ عن الموضع الذي
   * فيه العطب — وكلّفت ساعاتٍ حرفا لا مجازا.
   *
   * فالجوازُ من **٢٠٠ وحدَها**: المنصّةُ أعطت رمزا فالزوجُ سليمٌ يقينا.
   * وما دونه يُقال «لا يُعرَف» ويُعرَض نصُّ المنصّة كما هو — **ولا
   * علامةَ صحٍّ على ما لم يُتحقَّق منه** (D-061).
   */
  // **والحالُ المقيسةُ تُسمَّى** بدل أن يُعرَض نصٌّ خامٌ يُترَك تفسيرُه للمالك
  if (description !== undefined && description.includes(NO_APP_TOKENS)) {
    return {
      kind: 'inconclusive',
      detail:
        'هذا التطبيقُ لا يملك منحةَ «رموز التطبيقات» عند المنصّة — ' +
        '**فالفحصُ لا يستطيع الحكمَ على زوجك أصلا**، لا سلبا ولا إيجابا. ' +
        'وهذا ليس عيبا في السرّ ولا في المعرّف. **والبرهانُ الوحيدُ نجاحُ الربط** — ' +
        'فاضغط «اربط» ودع المنصّةَ تحكم.',
    }
  }

  return {
    kind: 'inconclusive',
    detail:
      `المنصّةُ ردّت «${code}»${description === undefined ? '' : ` — ${description}`}. ` +
      'وهذا ليس حكما على الزوج: لا يقول إنّه سليمٌ ولا إنّه مرفوض. ' +
      'والبرهانُ الوحيدُ نجاحُ الربط.',
  }
}
