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
import { PLATFORM_LABEL } from '../oauth/providers'
import type { Platform } from '../oauth/providers'

export type FailAction = 'requeue' | 'relink' | 'open' | 'confirm' | 'none'

export interface FailReason {
  readonly text: string
  /** ما يُفعَل: أعده إلى المعتمَد، أو أعد الربط، أو افتح المنشور، أو «قل ما وجدت» لتغريدةٍ لم يُعرَف جوابُها، أو لا شيء. */
  readonly action: FailAction
}

/** الرموزُ التي يكتبها الناشرُ قبل الإرسال — **ويحرس الاختبارُ أنّها كلُّها هنا**. */
export const REASONS: Readonly<Record<string, FailReason>> = {
  no_tokens: { text: 'لا إذن محفوظا لهذا الحساب — أعد ربطه ثمّ أعد المنشور', action: 'relink' },
  account_disconnected: { text: 'فُصل الحساب من اللوحة قبل موعده، فلم يُنشَر. اربطه من جديد ثمّ أعد المنشور', action: 'relink' },
  token_expired: { text: 'انتهى الإذن قبل الإرسال — جدّده ثمّ أعد المنشور', action: 'relink' },
  token_expired_retry: { text: 'انتهى الإذن وتعذّر تجديدُه الآن — يُعاد وحده بعد التجديد', action: 'none' },
  missing_publish_scope: { text: 'الحساب لم يمنح إذن النشر — أعد الربط ووافق عليه', action: 'relink' },
  missing_media_scope: { text: 'الحساب لم يمنح إذن رفع الوسائط — أعد الربط ووافق عليه', action: 'relink' },
  no_clip: { text: 'لا مقطع لهذا المنشور، والمنصّة لا تقبل نصًّا وحده — ولّد صورةً ثمّ حرّكها', action: 'requeue' },
  no_media: { text: 'Instagram لا تقبل منشورًا بلا صورة — ولّد صورةً له', action: 'requeue' },
  instagram_needs_media: { text: 'Instagram لا تقبل منشورًا بلا صورة — ولّد صورةً له', action: 'requeue' },
  instagram_needs_base_url: { text: 'أصل اللوحة غير مضبوط للطابور، فلا رابط تسحب منه Instagram الصورة', action: 'none' },
  no_media_bucket: { text: 'مخزن الوسائط غير موصول بالعامل — عطل في الضبط لا في المنشور', action: 'none' },
  not_approved: { text: 'لم يُعتمَد قبل موعده — اعتمده ثمّ جدوِله', action: 'open' },
  post_not_found: { text: 'حُذف المنشور قبل موعده', action: 'none' },
  unexpected_error: { text: 'عطل لم يُتوقَّع عندنا قبل الإرسال — وسببُه في سجلّ العامل', action: 'requeue' },
  // ‏سلسلةُ X (D-324): ما نُشر منها لا يُعاد، فالسببان يقولان ما يُفعَل باليد لا «أعده»
  thread_changed: { text: 'تغيّر نصّ السلسلة بعد أن نُشر أوّلُها على X — أعد نصَّها كما نُشر، أو احذف المنشورَ هناك واكتبها منشورًا جديدًا', action: 'open' },
  // ‏ومراجعة D-324: ما لم يُعرَف جوابُه يسوّيه المالكُ بما وجده على X («وجدتُها» برابطها أو «لم أجدها») ثمّ يعود معتمَدًا،
  // ‏والسلسلةُ على حسابٍ غيرِ حسابها تُعاد إلى المعتمَد فتُجدوَل على حسابها
  thread_unconfirmed: { text: 'تغريدةٌ من السلسلة أُرسلت ولم يُعرَف جوابُها — تحقّق على X ثمّ قل ما وجدت', action: 'confirm' },
  thread_account: { text: 'نُشر أوّلُ السلسلة من حسابٍ آخر على X — أعدها إلى المعتمَد وجدوِلها على حسابها', action: 'requeue' },
}

/** البادئةُ التي يكتبها الناشرُ قبل جواب المنصّة: «x: …» و«linkedin: …». */
const PLATFORM_PREFIX: ReadonlySet<string> = new Set(['x', 'linkedin', 'youtube', 'tiktok', 'instagram'])

/** أسماءُ المنصّات كما يقرؤها المالك — لا مفتاحُها في القاعدة («youtube»). */
const LABELS: Readonly<Record<string, string>> = PLATFORM_LABEL

/**
 * ‏جملُ HTTP الإنجليزيّة كما تردّها المنصّة («Internal Server Error») تُقال بالعربيّة (D-202)،
 * وما سواها يبقى كما جاء: نصُّ المنصّة دليلٌ لا يُخترَع بدلَه.
 */
const HTTP_PHRASES: Readonly<Record<string, string>> = {
  'internal server error': 'عطل في خادمها (500)',
  'bad gateway': 'عطل عابر في بوّابتها (502)',
  'service unavailable': 'خدمتُها متوقّفة مؤقّتًا (503)',
  'gateway timeout': 'انقضت مهلتُها قبل أن تجيب (504)',
  'too many requests': 'طلبات كثيرة في وقت قصير (429)',
  'unauthorized': 'رفضت الإذن (401)',
  'forbidden': 'منعت الطلب (403)',
  'not found': 'لم تجد ما طُلب (404)',
  'bad request': 'رفضت الطلب كما أُرسل (400)',
}

function says(detail: string): string {
  return HTTP_PHRASES[detail.replace(/[.\s]+$/, '').toLowerCase()] ?? detail
}

/**
 * يقرأ نصَّ الفشل كما حفظه الناشر: رمزٌ، أو رمزٌ ثمّ «:» وتفصيل، أو جملةٌ
 * عربيّةٌ كتبها الحارسُ نفسُه، أو جوابُ المنصّة.
 */
export function whyFailed(raw: string | null, platform: Platform | string): FailReason {
  if (raw === null || raw.trim() === '') {
    return { text: 'فشل بلا سبب مسجَّل', action: 'requeue' }
  }
  const text = raw.trim()
  const code = /^([a-z_]+)(?::\s*(.*))?$/s.exec(text)
  if (code !== null) {
    const known = REASONS[code[1]!]
    if (known !== undefined) {
      const detail = code[2]?.trim() ?? ''
      // ‏وتغريدةُ السلسلة المعلّقة تُسمّى برقمها وما وقع لها: جملتُها عربيّةٌ كتبها الناشر (مراجعة D-324)
      if (code[1] === 'thread_unconfirmed' && detail !== '') return { ...known, text: detail }
      // ‏والنطاقُ الناقص يُسمّى: «الحسابُ لم يمنح إذنَ النشر (w_member_social)»
      return detail !== '' && code[1]!.startsWith('missing_')
        ? { ...known, text: `${known.text} (${detail})` }
        : known
    }
  }
  const label = LABELS[platform] ?? platform
  /*
   * ‏**ونداءٌ ردّته المنصّةُ يُعاد** (D-176): الناشرُ يكتب «x: تعذّر رفع الوسيط (…)»،
   * وكانت جملةً عربيّةً فتُقال كما هي **بلا فعل** — فوقف المالكُ أمام منشورٍ فاشلٍ
   * لا يعرف لماذا ولا ما يفعل. فالبادئةُ اسمُ المنصّة تُرفع، ويُعرض «أعده إلى المعتمَد».
   */
  if (code !== null && PLATFORM_PREFIX.has(code[1]!) && (code[2]?.trim() ?? '') !== '') {
    return { text: `ردّته ${label}: ${says(code[2]!.trim())}`, action: 'requeue' }
  }
  // ‏جملةٌ عربيّةٌ كتبها حارسٌ عندنا (حسابُ الصفحة مثلًا) تُقال كما هي
  if (/[؀-ۿ]/.test(text)) return { text, action: 'none' }
  return { text: `ردّته ${label}: ${says(text)}`, action: 'requeue' }
}
