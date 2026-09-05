/**
 * ترويسات الأمان.
 *
 * لم تكن في الردود ترويسةُ أمانٍ واحدة. واللوحةُ صفحةٌ فيها أزرارُ «أوقف
 * النظام» و«احذف مزوّدا» — فبلا `frame-ancestors` تُوضَع في `iframe`
 * شفّافٍ على صفحةٍ أخرى، وضغطةٌ يظنّها الزائرُ على زرٍّ بريء تقع على
 * الزرّ الذي تحته. وهذا هجومُ Clickjacking، ولا يحتاج ثغرةً في شيفرتنا.
 *
 * والسياسةُ **قائمةُ سماحٍ من العدم**: `default-src 'none'` ثمّ يُفتَح ما
 * يلزم بالاسم. فمصدرٌ جديد يُنسى ذكرُه يُمنع — لا يمرّ.
 */

/** ما تُسمح به الصفحةُ من خطوط Google. لا شيء غيره من الخارج. */
const FONT_CSS = 'https://fonts.googleapis.com'
const FONT_FILES = 'https://fonts.gstatic.com'

/**
 * ترويساتٌ تصلح لكلّ ردّ، JSON كان أو HTML.
 *
 * `Strict-Transport-Security` بسنةٍ وبالنطاقات الفرعيّة — **وبلا
 * `preload`.** والفرقُ ليس تفصيلا: الترويسةُ من نطاقٍ فرعيّ تلزم ذلك
 * النطاقَ وما تحته، ولا تلزم `basserh.com` ولا أشقّاءه. و`preload` لا
 * يُقبل إلا من الجذر، فذكرُه هنا لا يفعل شيئا ويوهم بالتزامٍ لم يُتَّخذ:
 * إدراجُ نطاقٍ في قائمة المتصفّحات قرارٌ يشمل كلّ ما تحته إلى الأبد،
 * ولا يُتَّخذ في ترويسةٍ عرَضا.
 */
export const BASE_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // بابٌ لا يُستعمل يُغلق: لا كاميرا ولا موقع ولا ميكروفون في لوحةٍ نصّيّة
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
}

/**
 * ترويساتُ صفحةِ HTML: السياسةُ ومنعُ التأطير ومنعُ التخزين.
 *
 * `no-store` مقصودة: صفحةُ اللوحة تحمل حالَ النظام وأسماءَ المصادر، فلا
 * تُترك في ذاكرة متصفّحٍ مشترك يفتحها من بعدك بزرّ «رجوع».
 *
 * و `X-Frame-Options` مكرّرةٌ عمدا مع `frame-ancestors`: الثانية هي
 * المعيار، والأولى يفهمها ما لا يفهم الثانية. وتكرارٌ يحمي خيرٌ من أناقةٍ
 * تترك بابا.
 */
export function htmlHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}' ${FONT_CSS}`,
    `font-src ${FONT_FILES}`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

  return {
    ...BASE_HEADERS,
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  }
}

/**
 * قيمةُ `nonce` لصفحةٍ واحدة.
 *
 * تُولَّد لكلّ ردٍّ على حدة. وثابتةٌ مشتركة تُبطل السياسةَ كلَّها: من عرفها
 * مرّةً حقن سطرا يمرّ في كلّ صفحةٍ بعدها.
 */
export function makeNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, '')
}
