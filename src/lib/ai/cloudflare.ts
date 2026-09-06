/**
 * عنوانُ Cloudflare — يُقرأ مرّةً ويُشتَقّ منه الثلاثة (D-081).
 *
 * ## العلّة المقيسة
 *
 * بطاقةُ Cloudflare في اللوحة تحمل عنوانا واحدا:
 *
 *     https://api.cloudflare.com/client/v4/accounts/{id}/ai/v1
 *
 * **وثلاثةُ أفعالٍ تحتاج ثلاثةَ مسارات، لا مسارا واحدا:**
 *
 * | الفعل | المسار الذي يقبله Cloudflare |
 * |---|---|
 * | نصّ | `…/ai/v1/chat/completions` |
 * | صورة | `…/ai/run/{model}` — **ولا يقبلها `‎/ai/v1` البتّة** |
 * | قائمة النماذج | `…/ai/models/search` |
 *
 * وكان «اختبر» ينادي `{base}/models` — أي `…/ai/v1/models` — **وهي
 * نهايةٌ لا يخدمها Workers AI**: طبقةُ توافقِ OpenAI عنده مقصورةٌ على
 * `chat/completions` و `embeddings` (وثيقةُ AI Gateway · REST API).
 * فردَّت خطأً، **فبدا المفتاحُ الصحيحُ مرفوضا** — وهو مقبول.
 *
 * ## والحلُّ اشتقاقٌ لا إعادةُ إدخال
 *
 * العنوانُ المحفوظ يبقى كما هو — **فلا يُطلَب من المالك أن يكتبه ثانية**
 * — ويُقرأ منه الجذعُ (`…/ai`) ومعرّفُ الحساب. ومنهما تُبنى المسارات
 * الثلاثة. ومن غيّر العنوان إلى الجذع مباشرةً عمل كذلك: القراءةُ تقبل
 * الشكلين.
 *
 * ## حدٌّ يُقال قبل أن يُكتشَف
 *
 * `api.cloudflare.com` **محجوبٌ عن بيئة التطوير هذه** (ردَّ الوسيطُ
 * `connect_rejected`)، فما هنا مبنيٌّ على وثيقة Cloudflare لا على نداءٍ
 * مقيس — **وأوّلُ ضغطةٍ على «اختبر» في الإنتاج هي التي تؤكّده**، كما قيل
 * في سائق Workers AI قبله. وشكلُ الجواب يُفحَص ولا يُفترَض: ما لا يُعرَف
 * يُردّ بدل أن يُخمَّن.
 */

/** المضيفُ الوحيد الذي يُعدّ عنوانَ Cloudflare — ولا يُخمَّن من الاسم. */
export const CF_HOST = 'api.cloudflare.com'

/** الجذع: `https://api.cloudflare.com/client/v4/accounts/{id}/ai` */
function aiRoot(accountId: string): string {
  return `https://${CF_HOST}/client/v4/accounts/${accountId}/ai`
}

/**
 * يقرأ معرّفَ الحساب من عنوانٍ محفوظ.
 *
 * ويقبل الشكلين — بلاحقة `‎/v1` وبدونها — ويعيد `null` لما ليس عنوانَ
 * Cloudflare أصلا. **والمضيفُ يُطابَق ولا يُستدَلّ عليه بالاسم**: مزوّدٌ
 * سمّاه المالكُ «cloudflare» وعنوانُه لغيرها ليس Cloudflare.
 */
export function cfAccountId(baseUrl: string | null | undefined): string | null {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') return null

  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    return null
  }
  if (url.hostname.toLowerCase() !== CF_HOST) return null

  // /client/v4/accounts/{id}/ai[/v1][/]
  const match = /^\/client\/v4\/accounts\/([^/]+)\/ai(?:\/v1)?\/?$/.exec(url.pathname)
  if (match === null) return null
  /*
   * **ويُفكّ الترميزُ قبل الفحص.** `new URL` تُرمّز القوسين في المسار
   * (`{` تصير `%7B`)، فقالبٌ لم يُملأ يمرّ فحصا يبحث عن القوس نفسِه —
   * ويُنادى حسابٌ اسمُه `%7BACCOUNT_ID%7D`. فما ليس حرفا لاتينيّا ولا
   * رقما ولا شرطةً يُردّ، والقوسُ أوّلُ ما يسقط به.
   */
  let accountId: string
  try {
    accountId = decodeURIComponent(match[1] ?? '')
  } catch {
    return null
  }
  return /^[A-Za-z0-9_-]{4,}$/.test(accountId) ? accountId : null
}

/**
 * نهايةُ قائمة النماذج.
 *
 * `per_page` أقصاه عندهم، **ونحن نطلب الأكبر عمدا**: قائمةٌ ناقصةٌ
 * تُخفي نموذجا موجودا، فيظنّ المالكُ أنّه غيرُ متاح — وذاك أسوأُ من
 * قائمةٍ طويلة.
 */
export function cfModelsUrl(accountId: string): string {
  return `${aiRoot(accountId)}/models/search?per_page=100`
}

/** نهايةُ `‎/ai/run` — وهي وحدها التي تولّد الصور. */
export function cfRunUrl(accountId: string, model: string): string {
  return `${aiRoot(accountId)}/run/${model}`
}
