/**
 * قراءةُ المقاييس من المنصّتين.
 *
 * ## `null` ليست صفرا — وهذا أهمُّ ما في هذا الملفّ
 *
 * الصفرُ يقول: **قِيس فكان لا شيء**. و `null` تقول: **لا يُقاس أصلا**.
 * وخلطُهما يجعل لوحةً تعرض «٠ ظهور» على منشورٍ رآه ألف — فيُحكَم عليه
 * بالفشل وهو ناجح، ويُبنى على ذلك قرارُ نشرٍ خاطئ.
 *
 * وأعمدةُ `metrics` كلُّها تقبل الفراغ، وهذا مقصودٌ منذ `0001_init`.
 *
 * ## وما لا تعطيه المنصّة لا يُحسَب
 *
 * **LinkedIn لا يعطي عددَ الظهور لمنشور عضو.** الإحصاءاتُ الكاملة في
 * `organizationalEntityShareStatistics` وهي **لصفحات الشركات وحدها**،
 * وتحتاج موافقةَ Community Management API. فما يُقرأ لحسابٍ شخصيّ:
 * الإعجاباتُ والتعليقات — لا أكثر، **وتبقى البقيّةُ `null`.**
 *
 * و X يعطي `impression_count` **لمنشورات صاحب الرمز وحده** — وهو حالُنا.
 */
import { LINKEDIN_VERSION } from '../oauth/providers'
import { withTimeout } from '../net/timeout'

export interface PostMetrics {
  readonly impressions: number | null
  readonly reactions: number | null
  readonly comments: number | null
  readonly shares: number | null
  readonly clicks: number | null
}

export class MetricsError extends Error {
  override readonly name = 'MetricsError'
  constructor(
    message: string,
    readonly status: number,
    /** أيُعاد؟ عطلُ شبكةٍ يُعاد، ومنشورٌ محذوفٌ لا يُعاد أبدا. */
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

/** عددٌ أو `null` — ولا يُحوَّل غيابٌ إلى صفر. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * أصنافُ الأخطاء من الرمز لا من نصّ الرسالة — والصياغةُ تتغيّر بلا إعلان.
 *
 * و **404 ليست عطلا**: المنشورُ حُذف من المنصّة. فلا تُعاد المحاولة أبدا،
 * وإلّا دارت الدورةُ عليه كلَّ ستّ ساعاتٍ إلى الأبد.
 */
function classify(status: number): MetricsError {
  if (status === 404) return new MetricsError('المنشور غير موجود عند المنصّة', 404, false)
  if (status === 401 || status === 403) {
    return new MetricsError('الإذن مرفوض أو ينقصه نطاق القراءة', status, false)
  }
  if (status === 429) return new MetricsError('بلغ حدّ المنصّة', 429, true)
  if (status >= 500) return new MetricsError('المنصّة متعبة', status, true)
  return new MetricsError(`ردّت المنصّة ${status}`, status, status >= 500)
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetchImpl(url, { headers })
  } catch (error) {
    throw new MetricsError(
      `تعذّر الوصول: ${error instanceof Error ? error.message : 'عطل شبكة'}`,
      502,
      true,
    )
  }
  if (!response.ok) throw classify(response.status)
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    throw new MetricsError('جواب المنصّة ليس JSON', 502, true)
  }
}

/**
 * LinkedIn — `socialActions` على معرّف المنشور.
 *
 * ويُرمَّز الـ URN في المسار: فيه نقطتان (`urn:li:share:…`) وهي محرفٌ
 * محجوزٌ في المسار — **وبلا ترميزٍ يقطع الخادمُ المعرّفَ عند أوّل نقطتين**
 * فيردّ 404 على منشورٍ قائم.
 */
export async function fetchLinkedInMetrics(
  accessToken: string,
  postUrn: string,
  fetchImpl: typeof fetch = withTimeout(fetch, 15_000),
): Promise<PostMetrics> {
  const payload = await getJson(
    `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postUrn)}`,
    {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    fetchImpl,
  )

  const likes = payload['likesSummary'] as Record<string, unknown> | undefined
  const comments = payload['commentsSummary'] as Record<string, unknown> | undefined

  return {
    // لا ظهورَ لمنشور عضو — تبقى `null` ولا تُزوَّر صفرا
    impressions: null,
    reactions: num(likes?.['totalLikes']),
    // الاسمُ يختلف بين إصدارين، فيُقرأ الاثنان — وأوّلُ موجودٍ يُؤخذ
    comments: num(comments?.['aggregatedTotalComments']) ?? num(comments?.['totalFirstLevelComments']),
    shares: null,
    clicks: null,
  }
}

/**
 * X — `public_metrics` على معرّف المنشور.
 *
 * و«المشاركة» عندهم اثنتان: إعادةُ نشرٍ واقتباس. **فتُجمَعان** — والفصلُ
 * بينهما تفصيلٌ لا يغيّر قرارا، والجمعُ يقابل «shares» في المخطّط.
 */
export async function fetchXMetrics(
  accessToken: string,
  tweetId: string,
  fetchImpl: typeof fetch = withTimeout(fetch, 15_000),
): Promise<PostMetrics> {
  const payload = await getJson(
    `https://api.x.com/2/tweets/${encodeURIComponent(tweetId)}?tweet.fields=public_metrics`,
    { Authorization: `Bearer ${accessToken}` },
    fetchImpl,
  )

  // X يردّ 200 مع `errors` على منشورٍ محذوف — لا 404. فيُفحَص الجسد
  const data = payload['data'] as Record<string, unknown> | undefined
  if (data === undefined) {
    throw new MetricsError('المنشور غير موجود عند المنصّة', 404, false)
  }

  const m = data['public_metrics'] as Record<string, unknown> | undefined
  const retweets = num(m?.['retweet_count'])
  const quotes = num(m?.['quote_count'])
  const shares =
    retweets === null && quotes === null ? null : (retweets ?? 0) + (quotes ?? 0)

  return {
    impressions: num(m?.['impression_count']),
    reactions: num(m?.['like_count']),
    comments: num(m?.['reply_count']),
    shares,
    clicks: null,
  }
}
