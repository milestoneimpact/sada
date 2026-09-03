/**
 * مفتاح عدم التكرار (D-004).
 *
 * Queue يعيد المحاولة عند أي فشل عابر — انقطاع شبكة، مهلة، إعادة تشغيل.
 * وX يحاسب على كل طلب، لا على كل منشور. فبلا مفتاح ثابت يُنشر المنشور
 * مرتين ويُدفع ثمنه مرتين.
 *
 * المفتاح يُثبَّت قبل أول طلب ولا يتغير بعده: هو عمود `NOT NULL UNIQUE` في
 * `posts`، ويُحسب هنا وقت إنشاء المنشور لا وقت إرساله.
 */

/** نطاق المحاولة: يفصل نشرا أوليا عن إعادة نشر مقصودة لاحقا. */
export type AttemptScope = 'publish' | `retry:${number}`

const encoder = new TextEncoder()

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * `sha256(post.id + ':' + attempt_scope)` كما في ARCHITECTURE.md §٤.
 * دالة صرفة: المدخل نفسه يعطي المفتاح نفسه دائما، وهو شرط الفائدة كلها.
 */
export async function idempotencyKey(
  postId: string,
  scope: AttemptScope = 'publish',
): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${postId}:${scope}`))
  return hex(new Uint8Array(digest))
}

/**
 * هل يحوي النص رابطا؟ (D-003)
 *
 * يُحسب بالشيفرة لا بالنموذج: منشور برابط على X يكلف 0.200 دولار بدل
 * 0.015 — ثلاثة عشر ضعفا — فلا يُترك تقديره لنموذج لغوي.
 *
 * يلتقط `http(s)://` و `www.` والنطاق المجرد بامتداد معروف. والاحتياط
 * مقصود: عدّ ما ليس رابطا رابطا يُظهر تكلفة أعلى قبل الاعتماد، وعكسه
 * يُنفق بلا علم.
 */
const URL_PATTERN =
  /(https?:\/\/\S+)|(\bwww\.\S+)|(\b[a-z0-9-]+\.(com|net|org|io|co|sa|me|ai|app|dev|xyz|link)\b)/i

export function containsUrl(text: string): boolean {
  return URL_PATTERN.test(text)
}
