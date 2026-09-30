/**
 * سببُ الفشل بالعربيّة ومعه ما يُفعَل — **لا رمزُ خطأٍ يُقرأ في شاشة** (D-172).
 *
 * كانت شاشةُ المنصّة تكتب «آخرُ فشل: no_clip: …» أو «token_expired» كما
 * كتبها الناشرُ لسجلّه. والرمزُ يقول للمبرمج أين يبحث، ولا يقول للمالك
 * ماذا يفعل. فلكلّ رمزٍ هنا جملةٌ وفعل، **واختبارٌ يقرأ `publisher.ts`
 * ويسقط إن أُضيف حارسٌ برمزٍ لا جملةَ له**.
 *
 * وما ليس رمزا (جوابُ المنصّة نفسِها) يُقال كما جاء: «ردّته المنصّة: …»،
 * فذاك نصُّها لا نصُّنا، **وترجمتُه تخمين**.
 */
import type { Platform } from '../oauth/providers'

export type FailAction = 'requeue' | 'relink' | 'open' | 'none'

export interface FailReason {
  readonly text: string
  /** ما يُفعَل: أعده إلى المعتمَد، أو أعد الربط، أو افتح المنشور، أو لا شيء. */
  readonly action: FailAction
}

/** الرموزُ التي يكتبها الناشرُ قبل الإرسال — **ويحرس الاختبارُ أنّها كلُّها هنا**. */
export const REASONS: Readonly<Record<string, FailReason>> = {
  no_tokens: { text: 'لا إذنَ محفوظا لهذا الحساب — أعد ربطه ثمّ أعد المنشور', action: 'relink' },
  token_expired: { text: 'انتهى الإذنُ قبل الإرسال — جدّده ثمّ أعد المنشور', action: 'relink' },
  token_expired_retry: { text: 'انتهى الإذنُ وتعذّر تجديدُه الآن — يُعاد وحده بعد التجديد', action: 'none' },
  missing_publish_scope: { text: 'الحسابُ لم يمنح إذنَ النشر — أعد الربط ووافق عليه', action: 'relink' },
  missing_media_scope: { text: 'الحسابُ لم يمنح إذنَ رفع الوسائط — أعد الربط ووافق عليه', action: 'relink' },
  no_clip: { text: 'لا مقطعَ لهذا المنشور، والمنصّةُ لا تقبل نصًّا وحده — ولّد صورةً ثمّ حرّكها', action: 'requeue' },
  no_media: { text: 'Instagram لا تقبل منشورًا بلا صورة — ولّد صورةً له', action: 'requeue' },
  instagram_needs_media: { text: 'Instagram لا تقبل منشورًا بلا صورة — ولّد صورةً له', action: 'requeue' },
  instagram_needs_base_url: { text: 'أصلُ اللوحة غيرُ مضبوطٍ للطابور، فلا رابطَ تسحب منه Instagram الصورة', action: 'none' },
  no_media_bucket: { text: 'مخزنُ الوسائط غيرُ موصولٍ بالعامل — عطلٌ في الضبط لا في المنشور', action: 'none' },
  not_approved: { text: 'لم يُعتمَد قبل موعده — اعتمده ثمّ جدوِله', action: 'open' },
  post_not_found: { text: 'حُذف المنشورُ قبل موعده', action: 'none' },
  unexpected_error: { text: 'عطلٌ لم يُتوقَّع عندنا قبل الإرسال — وسببُه في سجلّ العامل', action: 'requeue' },
}

/**
 * يقرأ نصَّ الفشل كما حفظه الناشر: رمزٌ، أو رمزٌ ثمّ «:» وتفصيل، أو جملةٌ
 * عربيّةٌ كتبها الحارسُ نفسُه، أو جوابُ المنصّة.
 */
export function whyFailed(raw: string | null, platform: Platform | string): FailReason {
  if (raw === null || raw.trim() === '') {
    return { text: 'فشل بلا سببٍ مسجَّل', action: 'requeue' }
  }
  const text = raw.trim()
  const code = /^([a-z_]+)(?::\s*(.*))?$/s.exec(text)
  if (code !== null) {
    const known = REASONS[code[1]!]
    if (known !== undefined) {
      const detail = code[2]?.trim() ?? ''
      // ‏والنطاقُ الناقص يُسمّى: «الحسابُ لم يمنح إذنَ النشر (w_member_social)»
      return detail !== '' && code[1]!.startsWith('missing_')
        ? { ...known, text: `${known.text} (${detail})` }
        : known
    }
  }
  // ‏جملةٌ عربيّةٌ كتبها حارسٌ عندنا (حسابُ الصفحة مثلًا) تُقال كما هي
  if (/[؀-ۿ]/.test(text)) return { text, action: 'none' }
  const label = platform === 'x' ? 'X' : platform === 'linkedin' ? 'LinkedIn' : platform
  return { text: `ردّته ${label}: ${text}`, action: 'requeue' }
}
