/**
 * حارس عنوان المزوّد.
 *
 * حين يُكتب العنوان من اللوحة، يصير الخادم يرسل **مفتاح المالك ونصّ
 * مستنداته** إلى ما كُتب. وخطأٌ مطبعيّ في المضيف يرسل ذلك إلى حيث لا
 * يريد — **ورقابةُ الحرف أرخص من استرجاع مفتاحٍ سُرّب.**
 *
 * وأخطر من الخطأ المطبعيّ عنوانٌ داخليّ: `169.254.169.254` تسأل خدمةَ
 * البيانات الوصفيّة عن اعتماداتِ البيئة نفسها، و`localhost` تدور على
 * الخادم. فالمنع هنا ليس تضييقا — هو ما يمنع طلبا خارجيّا من أن يصير
 * بابا إلى الداخل.
 */

import { withTimeout } from '../net/timeout'
export type UrlVerdict =
  | { readonly ok: true; readonly url: string; readonly host: string }
  | { readonly ok: false; readonly reason: string }

/** نطاقاتٌ لا يُنادى فيها مزوّدٌ خارجيّ بحال. */
const BLOCKED_HOSTS: readonly RegExp[] = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // خدمة البيانات الوصفيّة — أخطرها
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fd/i,
  /^\[?fe80:/i,
]

export function checkProviderUrl(raw: string): UrlVerdict {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'العنوان فارغ' }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'العنوان غير صالح — يبدأ بـ https://' }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'https وحدها — المفتاح لا يُرسل على اتّصال غير مشفَّر' }
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'لا اعتمادات في العنوان — المفتاح يُرسل في ترويسة' }
  }

  const host = url.hostname
  for (const blocked of BLOCKED_HOSTS) {
    if (blocked.test(host)) {
      return { ok: false, reason: `عنوان داخليّ (${host}) — المزوّد خارجيّ لا داخل الشبكة` }
    }
  }
  // مضيفٌ بلا نقطة ليس اسم نطاقٍ عامّ: `metadata` أو `db` أسماءُ داخلٍ
  if (!host.includes('.')) {
    return { ok: false, reason: `المضيف «${host}» ليس نطاقا عامّا` }
  }

  /**
   * **قالبٌ لم يُملأ.**
   *
   * عناوينُ بعض المزوّدين تحمل معرّفَ حسابٍ في المسار — Cloudflare
   * مثلا. ونموذجٌ جاهزٌ يملأ الحقل بـ `{ACCOUNT_ID}` **يُحفَظ صامتا**:
   * المضيفُ صحيحٌ والبروتوكول https، **فيمرّ الحارس** ثمّ يُرسَل
   * المفتاحُ إلى مسارٍ لا وجودَ له عند أوّل نداء.
   *
   * والقوسان لا يقعان في عنوانٍ صحيح، فردُّهما بلا ثمن.
   */
  if (/[{}]/.test(trimmed)) {
    return {
      ok: false,
      reason: 'في العنوان قالب لم يُملأ — استبدل ما بين القوسين بقيمته',
    }
  }

  // تُزال الشرطة الأخيرة فلا يصير المسار `//chat/completions`
  const normalized = `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  return { ok: true, url: normalized, host }
}

/**
 * عددُ التحويلات المسموح بها — **وثلاثةٌ سخاءٌ لا حاجة**.
 *
 * نطاقٌ يُحوّل إلى آخر، وذاك إلى مسارٍ مُوقَّع: اثنتان في أسوأ ما رأيت.
 * **والثالثةُ هامش**، وما زاد عليها سلسلةٌ لا يقصدها مزوّدٌ جادّ.
 */
const MAX_HOPS = 3

/**
 * نداءٌ خارجيٌّ **يُحرَس عند كلّ قفزة** (D-110).
 *
 * ## الثغرة التي وُجدت بالقراءة
 *
 * `checkProviderUrl` يفحص **العنوان الأوّل وحدَه**، و`fetch` يتبع التحويلَ
 * افتراضا. **فعنوانٌ عامٌّ يمرّ الحارسَ ثمّ يردّ ‏٣٠٢ إلى `169.254.169.254`
 * يصل إليها** — وهي بعينها الحالُ التي كُتب الحارسُ ليمنعها.
 *
 * وأثرُها يختلف بالموضع:
 *
 * | الموضع | ما يقع |
 * |---|---|
 * | `openaiCompat` · `models` | الردُّ **يُقرأ ويُعرَض في اللوحة** — كشفٌ تامّ |
 * | `alerts/outbox` | الحالُ وحدَها تُسجَّل — **كشفٌ أعمى**، وهو أهون لا مأمون |
 *
 * **ولا فرقَ في الحكم**: ما يمنعه الحارسُ في القفزة الأولى يمنعه في الثانية،
 * **وحارسٌ يُفحَص مرّةً في سلسلةٍ حارسٌ لمرّةٍ واحدة**.
 *
 * ## ولا تُرفَض التحويلاتُ كلُّها
 *
 * `http` إلى `https`، ونطاقٌ قديمٌ إلى جديد — **تحويلاتٌ يقصدها مزوّدٌ
 * جادّ**. فرفضُها يمنع الصحيحَ ليمنع الخطأ. **فتُتبَع يدا، ويُفحَص كلُّ
 * موضعٍ كما يُفحَص الأوّل.**
 */
export async function guardedFetch(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  let target = url
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    const verdict = checkProviderUrl(target)
    if (!verdict.ok) {
      throw new Error(
        hop === 0
          ? `العنوان مرفوض: ${verdict.reason}`
          : `تحويل إلى عنوان مرفوض بعد ${hop} قفزة: ${verdict.reason}`,
      )
    }

    // ‏`manual` يجعل الردَّ يعود بالتحويل بدل أن يُتبَع من تحتنا
    const res = await withTimeout(fetchImpl, 30_000)(verdict.url, { ...init, redirect: 'manual' })
    if (res.status < 300 || res.status > 399) return res

    const next = res.headers.get('location')
    if (next === null || next.trim() === '') {
      throw new Error(`تحويل ${res.status} بلا عنوان يُتبَع`)
    }
    /*
     * **والنسبيُّ يُحلّ على ما سبقه** — لا على الأصل.
     *
     * تحويلٌ إلى `/v2` من `https://a.co/v1` يعني `https://a.co/v2`.
     * وحلُّه على العنوان الأوّل بعد قفزتين يعطي مضيفا غيرَ الذي حوّل،
     * **فيُفحَص مضيفٌ ويُنادى آخر**.
     */
    try {
      target = new URL(next, verdict.url).toString()
    } catch {
      throw new Error('عنوان التحويل غير صالح')
    }
  }
  throw new Error(`تحويل يزيد على ${MAX_HOPS} قفزات — سلسلة لا يقصدها مزوّد`)
}
