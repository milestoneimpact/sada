/**
 * **المصغَّرات** (D-335): لوحةُ الشهر والمكتبةُ وبطاقاتُ الخطّة كانت تحمل الصورةَ بحجمها كلِّه لتعرضها صغيرة.
 *
 * - **كلُّ صورةٍ تُصغَّر مرّةً واحدةً في عمرها** لكلّ مقاس، ثمّ تُحفظ في R2 تحت `thumb/<المقاس>/<المفتاح>` وتُسلَّم منه — فلا يتكرّر
 *   التحويلُ كلَّ شهر، وصورةٌ تُستعمل في منشوراتٍ كثيرة (D-334) لها مصغَّرةٌ واحدة.
 * - **مقاسان فقط** (قائمةٌ مغلقة): `160` للوحة الشهر، و`800` للبطاقة وبلاطة المكتبة. والصورةُ الكاملةُ للنشر وللتكبير.
 * - **سقفٌ شهريٌّ دون الحدّ المجّانيّ**: Cloudflare Images يعطي خمسةَ آلافِ تحويلٍ فريدٍ في الشهر، والسقفُ هنا `THUMB_CAP`. فلا يبلغ
 *   العدُّ ما يُحاسَب عليه على أيّ خطّة — **ولا نداءَ مدفوعًا**، فلا صفَّ في `cost_ledger` (D-008). والعدُّ يسبق النداء: محاولةٌ فشلت تُعدّ.
 * - **كلُّ عطلٍ يعود إلى الصورة الكاملة**: بلا ربطٍ، أو عند السقف، أو خطأُ الخدمة، أو نوعٌ لا يُصغَّر — `null`، والمسارُ يسلّم الأصلَ كما كان.
 */
export const THUMB_WIDTHS = [160, 800] as const
export type ThumbWidth = (typeof THUMB_WIDTHS)[number]

/** دون الخمسة آلاف المجّانيّة بهامش: العدُّ في KV ليس ذرّيًّا، وطلبان متزامنان قد يعدّان واحدًا. */
export const THUMB_CAP = 4000

/** ما يُصغَّر: الصورُ النقطيّةُ الثابتة. والمتحرّكةُ والمتّجهةُ والمقطعُ تُسلَّم كما هي. */
const SHRINKS = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** المقاسُ من العنوان — من القائمة المغلقة وحدَها، وما سواها `null` (الصورةُ الكاملة). */
export function thumbWidth(raw: string | undefined): ThumbWidth | null {
  const n = Number(raw)
  return THUMB_WIDTHS.find((w) => w === n) ?? null
}

export const thumbKey = (key: string, width: ThumbWidth): string => 'thumb/' + String(width) + '/' + key
const monthKey = (now: Date): string => 'thumbs:' + now.toISOString().slice(0, 7)

interface Bucket {
  get(key: string): Promise<{ readonly body: unknown; readonly size: number } | null>
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}
interface Counter {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>
}
/** ما يُستعمل من ربط Images — بشكله في `@cloudflare/workers-types`، ضيّقًا ليُزيَّف في الاختبار. */
export interface Shrinker {
  input(stream: never): {
    transform(t: { width: number; fit: 'scale-down' }): {
      output(o: { format: 'image/webp'; quality: number }): Promise<{ response(): Response }>
    }
  }
}

export interface ThumbDeps {
  readonly bucket: Bucket
  readonly kv: Counter
  /** ربطُ `IMAGES` — وغيابُه (بيئةٌ لم يُضبط فيها) يعني: المحفوظُ يُسلَّم، وما لم يُصغَّر يعود كاملًا. */
  readonly images?: Shrinker | undefined
  readonly now?: () => Date
}

/**
 * المصغَّرةُ بايتاتٍ — من R2 إن صُنعت، وإلّا تُصنع وتُحفظ. و`null`: سلِّم الأصل.
 *
 * **والمنظّمةُ فُحصت قبل الوصول إلى هنا**: `key` يأتي من صفٍّ قُرئ بـ`org_id`، ومفتاحُ المصغَّرة مشتقٌّ منه وحدَه.
 */
export async function thumbFor(deps: ThumbDeps, key: string, mime: string, width: ThumbWidth): Promise<{ readonly body: unknown; readonly size: number } | null> {
  if (!SHRINKS.has(mime)) return null
  const at = thumbKey(key, width)
  try {
    const kept = await deps.bucket.get(at)
    if (kept !== null) return kept
    if (deps.images === undefined) return null
    const month = monthKey((deps.now ?? (() => new Date()))())
    const used = Number(await deps.kv.get(month)) || 0
    if (used >= THUMB_CAP) return null
    // ‏العدُّ قبل النداء: ما حُسب علينا عند Cloudflare يُحسب هنا ولو فشل الحفظُ بعده. ويزول المفتاحُ بعد شهره
    await deps.kv.put(month, String(used + 1), { expirationTtl: 40 * 86_400 })
    const source = await deps.bucket.get(key)
    if (source === null) return null
    const made = await deps.images.input(source.body as never).transform({ width, fit: 'scale-down' }).output({ format: 'image/webp', quality: 80 })
    const bytes = await made.response().arrayBuffer()
    if (bytes.byteLength === 0) return null
    await deps.bucket.put(at, bytes, { httpMetadata: { contentType: 'image/webp' } })
    return { body: bytes, size: bytes.byteLength }
  } catch {
    // ‏خطأُ الخدمة (9422 عند الحدّ، أو صورةٌ لا تُقرأ) لا يُسقط الصفحة: الأصلُ يُسلَّم
    return null
  }
}
