/**
 * ما تطلبه كلُّ منصّة — **جدولٌ واحدٌ يُبنى من الثوابت القائمة ولا يكرّرها** (D-172).
 *
 * كانت القواعدُ ثوابتَ متفرّقةً في ستّة ملفّات: حدُّ النصّ في `draft/prompt`،
 * ومقاسُ الشريحة في `image/slide`، ومنصّاتُ المقاطع في الناشر، ومدّةُ المقطع
 * في `media/workersAi`، والرسمُ في `cost`، والقياسُ في `metrics/job`. **والشاشةُ
 * لا تذكر منها شيئا**، فيعرف المالكُ أنّ TikTok لا تقبل نصًّا وحده حين يُردّ
 * منشورُه لحظةَ النشر.
 *
 * فيُقرأ هنا كلُّ ثابتٍ من موضعه، ويُعرض شريطًا في صفحة المنصّة. **وثابتٌ
 * يتبدّل في موضعه يتبدّل هنا وحده**، واختبارٌ يطابق الاثنين.
 */
import { PLATFORMS } from '../draft/prompt'
import { SLIDE_SIZE } from '../image/slide'
import { MAX_SECONDS } from '../media/workersAi'
import { MEASURED } from '../metrics/job'
import { X_PRICE_PER_POST, X_PRICE_PER_POST_WITH_URL } from '../cost'
import { platformLabel, type Platform } from '../oauth/providers'
import { money } from '../format'

/**
 * منصّاتُ المقاطع — **تطلب مقطعا ولا تقبل نصّا وحده** (D-096).
 *
 * ولا نهايةَ نشرٍ نصّيّةٍ عند أيٍّ منهما أصلا. وكانت في `publisher.ts`،
 * فانتقلت إلى هنا ليقرأها الناشرُ والشاشةُ من موضعٍ واحد.
 */
export const CLIP_PLATFORMS: ReadonlySet<string> = new Set(['tiktok', 'youtube'])

export interface PlatformNeeds {
  readonly platform: Platform
  readonly label: string
  /** نوعُ الحساب الذي ينشر. */
  readonly account: string
  /** حدُّ النصّ كما يقوله المالكُ لنفسه. */
  readonly text: string
  readonly limit: number
  readonly media: {
    readonly kind: 'image' | 'clip'
    readonly required: boolean
    /** «1200×628 (1.91:1)» أو «9:16 حتّى 15ث». */
    readonly spec: string
    readonly width: number
    readonly height: number
  }
  /** ما يقع لحظةَ النشر: علنيٌّ فورا، أو يصل صندوقَ التطبيق، أو خاصّ. */
  readonly publish: string
  readonly cost: string
  readonly measure: string
  readonly measured: boolean
  /** أتُكتب لها مسوّدةٌ اليوم؟ — Instagram لا، حتّى موجتها. */
  readonly drafts: boolean
}

function ratio(w: number, h: number): string {
  const r = w / h
  if (Math.abs(r - 1.91) < 0.02) return '1.91:1'
  if (Math.abs(r - 16 / 9) < 0.02) return '16:9'
  if (Math.abs(r - 9 / 16) < 0.02) return '9:16'
  if (Math.abs(r - 4 / 5) < 0.02) return '4:5'
  return `${w}:${h}`
}

/**
 * و`isPublic` قرارُ المالك بعد إجازة المنصّة (D-190): YouTube وTikTok يصلان خاصَّين ما دام
 * تطبيقُه لم يُجَز، فإن قلب العلنيَّ قالت المحطّةُ ذلك ولم تبقَ «تنشره بيدك».
 */
export function platformNeeds(platform: Platform, isPublic = false): PlatformNeeds {
  const measured = MEASURED.has(platform)
  const measure = !measured
    ? 'لا يُقاس لهذه المنصّة بعد'
    : platform === 'linkedin'
      ? 'تفاعلٌ وتعليقات بعد 24س و72س و7ي — ولا ظهورَ لحساب العضو'
      : 'ظهورٌ وإعجابٌ وردودٌ ومشاركات بعد 24س و72س و7ي'

  if (platform === 'instagram') {
    return {
      platform, label: platformLabel(platform), account: 'حسابُ Business أو Creator',
      text: 'حتّى 2200 محرف، وخمسةُ وسومٍ على الأكثر', limit: 2200,
      media: { kind: 'image', required: true, spec: 'صورةٌ إلزاميّة 1080×1350 (4:5)', width: 1080, height: 1350 },
      publish: 'علنيٌّ فورَ موعده', cost: 'بلا رسم', measure, measured, drafts: false,
    }
  }

  const spec = PLATFORMS[platform]
  const size = SLIDE_SIZE[platform]
  const clip = CLIP_PLATFORMS.has(platform)
  return {
    platform,
    label: spec.label,
    account: platform === 'youtube' ? 'قناة' : platform === 'linkedin' ? 'حسابٌ شخصيّ — والصفحةُ لم تُبنَ' : 'حساب',
    text: platform === 'x'
      ? `حتّى ${spec.hardLimit} محرفٍ موزون`
      : platform === 'youtube'
        ? `السطرُ الأوّل عنوانٌ حتّى 100، وما بعده وصفٌ حتّى ${spec.hardLimit}`
        : `حتّى ${spec.hardLimit} محرف`,
    limit: spec.hardLimit,
    media: clip
      ? { kind: 'clip', required: true, spec: `مقطعٌ رأسيٌّ إلزاميّ ${ratio(size.width, size.height)} حتّى ${MAX_SECONDS}ث`, width: size.width, height: size.height }
      : { kind: 'image', required: false, spec: `اختياريّة ${size.width}×${size.height} (${ratio(size.width, size.height)})`, width: size.width, height: size.height },
    publish: clip && isPublic
      ? 'علنيٌّ فورَ موعده — بعد إجازة تطبيقك'
      : platform === 'tiktok'
        ? 'يصل صندوقَ تطبيقك ثمّ تنشره بيدك'
        : platform === 'youtube'
          ? 'يُرفع إلى قناتك خاصًّا ثمّ تنشره بيدك'
          : 'علنيٌّ فورَ موعده',
    cost: platform === 'x'
      ? `${money(X_PRICE_PER_POST)} للمنشور، و${money(X_PRICE_PER_POST_WITH_URL)} إن كان فيه رابط`
      : 'بلا رسم',
    measure,
    measured,
    drafts: true,
  }
}
