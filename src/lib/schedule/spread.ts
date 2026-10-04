/**
 * توزيعُ المعتمَد على أيّامٍ — **خطّةٌ تُعرَض قبل أن تُنفَّذ** (D-089).
 *
 * ## العلّة المقيسة
 *
 * قال المالك: «تسهيل عمليّة الجدولة، حيث إنّ استخدامها صعب». وأثقلُ ما
 * فيها ليس الحقلَ الواحد — **بل تكرارُه**: عشرُ مسوّداتٍ معتمَدةٍ تعني
 * عشرَ استماراتٍ منفصلة، وفي كلٍّ منها وجهةٌ وموعدٌ يُكتب يدا. ومَن فعل
 * ذلك مرّةً لم يفعله ثانية — **فيبقى المعتمَدُ معتمَدا ولا يُنشَر**.
 *
 * ## والخطّةُ تُحسب هنا ولا تُنفَّذ هنا
 *
 * هذه الوحدة **دالّةٌ خالصة**: تأخذ مسوّداتٍ ووجهاتٍ وبدايةً وفاصلا،
 * وتردّ خانات. لا تكتب في القاعدة ولا تقرأ منها.
 *
 * **وذلك ما يجعل المعاينةَ صادقة**: الشاشةُ تعرض ما تردّه هذه الدالّة،
 * والتنفيذُ يناديها بالمدخلات نفسِها فيحصل على الخانات نفسِها. ولو حُسبت
 * الخطّةُ مرّتين بشيفرتين لعُرض جدولٌ ونُفّذ غيرُه — **وهو أسوأ من ألّا
 * تكون هناك معاينةٌ أصلا**.
 *
 * ## والتنفيذُ يمرّ بـ `schedulePost` نفسِها
 *
 * لا كتابةَ `queued` من هنا. الحارسُ الذي يمنع الجدولةَ إلى قناةٍ إذنُها
 * منتهٍ، والذي يمنع موعدا في الماضي، والذي يمنع منشورَ منصّةٍ في حساب
 * أخرى — **كلُّه في `schedulePost`**. ومسارٌ ثانٍ ينسخه ينسى شرطا
 * (D-019).
 *
 * ## وما لا يصلح يُقال، ولا يُسقَط صامتا
 *
 * منشورٌ لا قناةَ لمنصّته يُردّ في `skipped` بسببه. **ومالكٌ يرى ثمانيةً
 * وقد اعتمد عشرا يظنّ اثنين ضاعا** — فيُقال أيُّهما ولماذا.
 */

/** ما يكفي من المسوّدة لتوزَّع — بترتيبها كما تُعرَض. */
export interface SpreadDraft {
  readonly id: string
  readonly platform: string
  readonly status: string
  /** أوّلُ سطرٍ يُعرَض في المعاينة، فيعرف المالكُ أيَّ منشورٍ يجدول. */
  readonly text: string
  /**
   * ما ينقصه من وسيطٍ ليُنشَر (`missingMedia`) — أو `null`. **ويُقال في المعاينة سببًا**
   * لا يُترَك لـ `schedulePost` تردّه بعد الضغط: TikTok بلا مقطعٍ ليست «جاهزةً للتوزيع».
   */
  readonly lacking?: string | null
}

export interface SpreadTarget {
  readonly id: string
  readonly platform: string
  readonly label: string
}

export interface SpreadSlot {
  readonly postId: string
  readonly accountId: string
  readonly accountLabel: string
  readonly platform: string
  /** `YYYY-MM-DDTHH:MM` — الصيغةُ التي تقرؤها `parseWhen` بلا تحويل. */
  readonly when: string
  readonly preview: string
}

export interface SpreadSkip {
  readonly postId: string
  readonly preview: string
  readonly reason: string
}

export interface SpreadPlan {
  readonly slots: readonly SpreadSlot[]
  readonly skipped: readonly SpreadSkip[]
}

/** أقصى ما يُوزَّع في مرّة — **وحدٌّ يُقال خيرٌ من طابورٍ يُفاجئ**. */
export const SPREAD_MAX = 20

/** أضيقُ فاصلٍ بين منشورين — ساعةٌ واحدة. */
export const GAP_MIN_HOURS = 1

/** وأوسعُه — أسبوعٌ كامل. */
export const GAP_MAX_HOURS = 168

/**
 * أوّلُ سطرٍ يُعرَض — **ولا يُقصّ في وسط كلمة**.
 *
 * قصٌّ بعدد المحارف يقطع «الحوكمة» إلى «الحوك»، فيقرأ المالكُ نصفَ كلمةٍ
 * ويظنّ العطلَ في النصّ لا في العرض.
 */
export function firstLine(text: string, max = 70): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  if (line.length <= max) return line
  const cut = line.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

function stamp(at: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`
  )
}

/**
 * يبني الخطّة — **ولا يمسّ شيئا**.
 *
 * والترتيبُ هو ترتيبُ `drafts` كما وردت: المالكُ يرى القائمةَ مرتَّبةً
 * في اللوحة، **فيتوقّع أن يُوزَّع أوّلُها أوّلا**. وترتيبٌ داخليٌّ آخر
 * يجعل الخطّةَ تبدو عشوائيّة.
 */
export function planSpread(
  drafts: readonly SpreadDraft[],
  targets: readonly SpreadTarget[],
  start: Date,
  gapHours: number,
  now: Date,
): SpreadPlan {
  const slots: SpreadSlot[] = []
  const skipped: SpreadSkip[] = []

  // فاصلٌ خارج المدى يُقصّ إلى حدّه، ولا يُردّ الطلبُ كلُّه: المالكُ كتب
  // رقما، والقصُّ يُرى في الخطّة قبل أن تُنفَّذ
  const gap = Math.min(GAP_MAX_HOURS, Math.max(GAP_MIN_HOURS, Math.round(gapHours)))
  // بدايةٌ مضت تُدفَع إلى الآن: خانةٌ في الماضي ترفضها `schedulePost`
  // واحدةً واحدة، فتخرج خطّةٌ نصفُها مرفوض
  const from = start.getTime() > now.getTime() ? start : new Date(now.getTime() + 60_000)

  let index = 0
  for (const draft of drafts) {
    if (draft.status !== 'approved' && draft.status !== 'edited') continue
    const preview = firstLine(draft.text)

    if (slots.length >= SPREAD_MAX) {
      skipped.push({ postId: draft.id, preview, reason: `فوق حدِّ ${SPREAD_MAX} في المرّة` })
      continue
    }

    if (draft.lacking !== undefined && draft.lacking !== null) {
      skipped.push({ postId: draft.id, preview, reason: draft.lacking })
      continue
    }

    const fit = targets.find((t) => t.platform === draft.platform)
    if (fit === undefined) {
      skipped.push({ postId: draft.id, preview, reason: 'لا قناةَ مربوطةً لمنصّته' })
      continue
    }

    slots.push({
      postId: draft.id,
      accountId: fit.id,
      accountLabel: fit.label,
      platform: draft.platform,
      when: stamp(new Date(from.getTime() + index * gap * 3_600_000)),
      preview,
    })
    index += 1
  }

  return { slots, skipped }
}
