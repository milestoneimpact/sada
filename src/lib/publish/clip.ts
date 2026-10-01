/**
 * المقطعُ قطعًا — **لا يُحمَل كلُّه في الذاكرة** (D-179).
 *
 * كان الناشرُ يقرأ المقطعَ كاملًا (`arrayBuffer()`) ثمّ يدفعه في طلبٍ واحد. وهذا
 * صحيحٌ لمقاطع صدى المولَّدة (‏١٥ ثانيةً بحدٍّ معلوم)، **وينكسر على مقطع المالك**:
 * ذاكرةُ العامل ‏128MB، ودقيقةٌ بـ ‏1080p تقارب ‏60MB، وTikTok يردّ قطعةً فوق ‏64MB.
 *
 * فالمقطعُ هنا حجمٌ ونوعٌ وقارئُ مدى: كلُّ سائقٍ يطلب القطعةَ التي يدفعها، ومن
 * R2 تُقرأ بمداها وحدَه (`range`) — فأكبرُ ما في الذاكرة قطعةٌ واحدة.
 */
import type { Upload } from './platforms'

export interface Clip {
  readonly size: number
  readonly mime: string
  /** البايتاتُ من `offset` بطول `length` — والطلبُ خارج الحجم خطأُ المنادي. */
  read(offset: number, length: number): Promise<Uint8Array>
}

/** دلوُ الوسائط كما يحتاجه الناشر — وR2 يوافقه، والاختبارُ يقلّده. */
export interface RangeBucket {
  get(
    key: string,
    options?: { range: { offset: number; length: number } },
  ): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>
  /** حجمُ الكائن بلا جسده — R2 يملكه، والدلوُ الذي لا يملكه يُقرأ كاملًا مرّة. */
  head?(key: string): Promise<{ size: number } | null>
}

/** مقطعٌ في الذاكرة — لما وصل بايتاتٍ أصلًا (الاختبار، وما قُرئ كاملًا). */
export function bytesClip(upload: Upload): Clip {
  return {
    size: upload.bytes.length,
    mime: upload.mime,
    read: async (offset, length) => upload.bytes.subarray(offset, offset + length),
  }
}

/**
 * مقطعٌ من الدلو — **بمداه لا كاملًا** حين يعرف الدلوُ حجمَه.
 *
 * و`null` حين غاب الكائن: المنادي يقول «لا بايتات» ولا يُرسل طلبًا.
 */
export async function bucketClip(bucket: RangeBucket, key: string, mime: string): Promise<Clip | null> {
  if (bucket.head === undefined) {
    const whole = await bucket.get(key)
    return whole === null ? null : bytesClip({ bytes: new Uint8Array(await whole.arrayBuffer()), mime })
  }
  const meta = await bucket.head(key)
  if (meta === null) return null
  return {
    size: meta.size,
    mime,
    read: async (offset, length) => {
      const part = await bucket.get(key, { range: { offset, length } })
      if (part === null) throw new Error(`clip: اختفى الكائنُ أثناء القراءة (${key})`)
      const bytes = new Uint8Array(await part.arrayBuffer())
      if (bytes.length === length) return bytes
      // ‏دلوٌ يتجاهل المدى يعيد الكائنَ كلَّه — فيُقصّ منه ما طُلب
      if (bytes.length >= offset + length) return bytes.subarray(offset, offset + length)
      throw new Error(`clip: قطعةٌ أقصرُ ممّا طُلب (${bytes.length} من ${length})`)
    },
  }
}

/** قطعُ TikTok: بين ‏5 و‏64MB، والأخيرةُ تمتصّ الباقي حتّى ‏128MB. */
export const TIKTOK_CHUNK = 32 * 1024 * 1024

/**
 * خطّةُ التقطيع عند TikTok — **من وثيقته لا من تخمين**:
 * ما دون القطعة يُدفَع كلُّه مرّة، وما فوقها `floor(size / chunk)` قطعةً والأخيرةُ أطول.
 */
export function tiktokChunks(size: number, chunk = TIKTOK_CHUNK): { chunkSize: number; count: number } {
  if (size <= chunk) return { chunkSize: size, count: 1 }
  return { chunkSize: chunk, count: Math.floor(size / chunk) }
}

/** قطعُ YouTube: مضاعفٌ لـ ‏256KB كما تطلب الجلسةُ المستأنَفة. */
export const YOUTUBE_CHUNK = 128 * 256 * 1024
