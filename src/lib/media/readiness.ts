/**
 * نقاطُ الجاهزيّة تحت زرَّي «ولّد صورة» و«حرّكها فيديو» (D-163).
 *
 * ## لماذا
 *
 * كان سببُ الردّ يُقرأ **بعد الضغط**: موقوفٌ، أو سقفٌ بلغ، أو مزوّدٌ معطَّل،
 * أو بلا مفتاح — في رسالةٍ تظهر مرّةً وتختفي. وأسوأُ منه سببُ الصورة بلا
 * عنوان: يُقرأ **بعد الدفع**، ونداءُ الصورة ونداءُ الموجز قد حوسِب عليهما.
 *
 * فتُقال الأسبابُ قبل الضغط، نقطةً لكلّ بابٍ يمرّ به النداء، **بترتيب ما يقع
 * عند الضغط**، وأوّلُ ساقطةٍ حكمٌ ورابطٌ إلى موضع إصلاحها — قاعدةُ سلّم المنصّة
 * نفسُها (D-158).
 *
 * ## ولا يُحكَم هنا
 *
 * هذه الوحدةُ **تسمّي ولا تقرّر**: الحكمُ من `imageProviderGate` و`slideGate`
 * و`videoFace` و`checkAllowance` و`videoCapGate` — الدوالِّ التي يحكم بها
 * النداءُ نفسُه. فنقطةٌ تقول «جاهز» والدالّةُ تردّ لا تقع إلّا إن افترقت
 * الحقائقُ لا الحكم.
 *
 * واستيراداتُها أنواعٌ وحدها: لا تجرّ سائقًا ولا دفترًا إلى من يرسمها.
 *
 * ## وما لا نقطةَ له
 *
 * **العنوانُ والحجم** لا يُعرَفان قبل النداء: الموجزُ يُكتب عند الضغط، والصورةُ
 * تُوزَن بعد أن تعود. فنقطةُ «النصُّ فوقها» التامّةُ تَعِد بالبيئة لا بالنصّ،
 * ورسالةُ ما بعد التوليد تبقى الحكمَ الأخير فيهما.
 */
import type { Blocker, VideoCapGate } from '../limits'
import type { RungState } from '../platform/readiness'
import type { ImageRefusal, SlideGate } from '../image/gate'
import type { VideoFace } from './video'

export type DotKey = 'limits' | 'provider' | 'overlay' | 'key' | 'clips' | 'browser' | 'writer'

export interface Dot {
  readonly key: DotKey
  readonly title: string
  readonly state: RungState
  /** ما وقع — ستُّ كلماتٍ فأقلّ، تُقرأ بجانب الزرّ لا في فقرة. */
  readonly note: string
  /** رابطٌ واحدٌ إلى موضع الإصلاح — وحيث لا يصلحها رابطٌ يُترَك. */
  readonly action?: { readonly label: string; readonly href: string }
}

/** سطرا اللوح — يُحسَبان مرّةً لكلّ عرضٍ ويُرسَمان تحت كلّ بطاقة. */
export interface MediaReady {
  /** الإنفوجرافيك — **وهو الافتراض** (D-174). */
  readonly infographic: MediaLine
  readonly image: MediaLine
  readonly video: MediaLine
}

export interface MediaLine {
  readonly dots: readonly Dot[]
  /** أوّلُ ساقطةٍ، وإلّا أوّلُ ما ينتظرك — وهي ما يُكتب سببُها بجانب الزرّ. */
  readonly next: Dot | null
  /**
   * أتُردّ الضغطةُ يقينًا؟ — **ساقطةٌ واحدةٌ تكفي**، ولا تسقط إلّا نقطةٌ يردّ
   * بابُها النداءَ كلَّه. وما يُنقص الصورةَ ولا يمنعها («النصُّ فوقها») ينتظرك
   * ولا يسقط، فلا يُعطِّل زرًّا يعمل.
   */
  readonly blocked: boolean
}

const LIMITS = { label: 'افتح الحدود', href: '#limits' } as const
const PROVIDERS = { label: 'افتح المزوّدين', href: '#providers' } as const
const TASKS = { label: 'ما عليك', href: '/panel/tasks' } as const

/**
 * سببُ الحارس في ستّ كلماتٍ فأقلّ — **شاملٌ للأنواع الخمسة**.
 *
 * و`blockerReason` تبقى نصَّ ما بعد الضغط كما هو: جملةٌ فيها الأرقام. وهذه
 * تُقرأ بجانب زرٍّ صغير، والرقمُ في لوح الحدود لمن يريده.
 */
function blockerNote(b: Blocker, label: string): string {
  switch (b.kind) {
    case 'paused':
      return 'موقوف بقرارك'
    case 'analysis_cap':
      return 'بلغ سقف التحليل اليوميّ'
    case 'spend_cap':
      return 'بلغ سقف الإنفاق اليوميّ'
    case 'provider_cap':
      return `بلغ ${label} سقفَه اليوميّ`
    case 'provider_disabled':
      return `${label} معطَّل بقرارك`
    case 'video_cap':
      return b.cap === 0 ? 'سقف المقاطع صفر بقرارك' : 'بلغ سقف المقاطع اليوميّ'
  }
}

/**
 * نقطةُ الحدود — **الإيقافُ والسقفان**، وهي `checkAllowance` نفسُها.
 *
 * وسقفُ **التحليل** يحجب الصورةَ والمقطع كما يحجب التحليل: الحارسُ العامّ
 * واحدٌ للنداءات المدفوعة كلِّها. فتقوله النقطةُ كما هو، ولو قُرئ غريبًا.
 */
function limitsDot(blocker: Blocker | null): Dot {
  if (blocker === null) return { key: 'limits', title: 'الحدود', state: 'done', note: 'مفتوحة اليوم' }
  const provider = blocker.kind === 'provider_cap' || blocker.kind === 'provider_disabled'
  return {
    key: 'limits',
    title: 'الحدود',
    state: 'failed',
    note: blockerNote(blocker, provider ? blocker.provider : ''),
    action: provider ? PROVIDERS : LIMITS,
  }
}

function providerDot(label: string, refusal: ImageRefusal | null): Dot {
  const failed = (note: string): Dot => ({ key: 'provider', title: 'المزوّد', state: 'failed', note, action: PROVIDERS })
  if (refusal === null) return { key: 'provider', title: 'المزوّد', state: 'done', note: label }
  switch (refusal.kind) {
    case 'missing':
      return failed('المزوّد الموجَّه غير موجود')
    case 'cannot_image':
      return failed(`${label} لا يولّد صورًا`)
    case 'blocked':
      return failed(blockerNote(refusal.blocker, label))
    case 'no_key':
      return failed(`لا مفتاح لـ ${label}`)
    case 'no_account':
      return failed('لا معرّف حساب لـ Cloudflare')
  }
}

/**
 * نقطةُ «النصُّ فوقها» — **ولا تُرسَم حين يُطفئه المالك**: الإطفاءُ قرارٌ
 * لا عطل، ولوحُ الحدود يقوله. وما ينقص منها **ينتظرك ولا يسقط**: الصورةُ
 * تخرج بلا عنوان، والزرُّ يعمل.
 *
 * والموجزُ بعد البيئة لا قبلها، بترتيب `composeSlide`: من لم يضبط المفتاحَ
 * بعدُ لا يُقال له «لا مزوّدَ يصوغ العنوان» فيصلح ما لا يُصلح شيئًا.
 */
function overlayDot(slide: SlideGate, briefReady: boolean): Dot | null {
  const title = 'النصّ فوقها'
  if (slide.state === 'off') return null
  if (slide.state === 'unset') {
    return slide.missing.includes('key')
      ? { key: 'overlay', title, state: 'now', note: 'بلا مفتاح المتصفّح', action: TASKS }
      : { key: 'overlay', title, state: 'now', note: 'بلا معرّف حساب Cloudflare', action: TASKS }
  }
  if (!briefReady) {
    return { key: 'overlay', title, state: 'now', note: 'لا مزوّد يصوغ العنوان', action: PROVIDERS }
  }
  return { key: 'overlay', title, state: 'done', note: 'يُركَّب العنوان' }
}

function lineOf(dots: readonly Dot[]): MediaLine {
  const failed = dots.find((d) => d.state === 'failed')
  const now = dots.find((d) => d.state === 'now')
  return { dots, next: failed ?? now ?? null, blocked: failed !== undefined }
}

export interface ImageReadinessInput {
  /** حكمُ `checkAllowance` كما قُرئ للّوح. */
  readonly blocker: Blocker | null
  /** اسمُ مزوّد الصورة كما يراه المالك، وحكمُ `imageProviderGate` عليه. */
  readonly provider: { readonly label: string; readonly refusal: ImageRefusal | null }
  readonly slide: SlideGate
  /** أيمرّ مزوّدُ الكتابة بحارسه ومعه مفتاح؟ — هو الذي يكتب الموجزَ والعنوان. */
  readonly briefReady: boolean
}

/** سطرُ «ولّد صورة» — بترتيب `generateForPost`: الحدودُ ثمّ المزوّدُ ثمّ الشريحة. */
export function imageReadiness(i: ImageReadinessInput): MediaLine {
  const overlay = overlayDot(i.slide, i.briefReady)
  return lineOf([
    limitsDot(i.blocker),
    providerDot(i.provider.label, i.provider.refusal),
    ...(overlay === null ? [] : [overlay]),
  ])
}

/**
 * سطرُ «ولّد إنفوجرافيك» (D-174) — بترتيب فرعه في `generateForPost`: الحدودُ ثمّ
 * المتصفّح ثمّ الصياغة.
 *
 * **والمتصفّحُ وحدَه يسقط**: بلا مفتاحه لا لقطة. والصياغةُ تنتظرك ولا تسقط: بلا
 * مزوّد كتابةٍ يُستخرج المحتوى من النصّ بقواعدَ حتميّة، فالزرُّ يعمل والصورةُ من النصّ.
 */
export function infographicReadiness(i: {
  readonly blocker: Blocker | null
  readonly browser: { readonly key: boolean; readonly account: boolean }
  readonly briefReady: boolean
}): MediaLine {
  const browser: Dot = !i.browser.key
    ? { key: 'browser', title: 'المتصفّح', state: 'failed', note: 'بلا مفتاح المتصفّح', action: TASKS }
    : !i.browser.account
      ? { key: 'browser', title: 'المتصفّح', state: 'failed', note: 'بلا معرّف حساب Cloudflare', action: TASKS }
      : { key: 'browser', title: 'المتصفّح', state: 'done', note: 'يصوّر الصفحة' }
  const writer: Dot = i.briefReady
    ? { key: 'writer', title: 'الصياغة', state: 'done', note: 'نموذج الكتابة يستخرج المحتوى' }
    : { key: 'writer', title: 'الصياغة', state: 'now', note: 'المحتوى من النصّ مباشرةً', action: PROVIDERS }
  return lineOf([limitsDot(i.blocker), browser, writer])
}

/**
 * النقطةُ التي تحكم على مزوّد المهمّة في جدول التوجيه — **الصورةُ من نقطة
 * مزوّدها، والمقطعُ من نقطة مفتاحه**، وما عداهما لا نقطةَ له.
 *
 * كان الجدولُ يعيد الحكمَ بشرطٍ من عنده (`face !== 'none'`)، فقال «جاهز» لرابط
 * Worker وحده والنقطةُ تحت الزرّ تقول «تنتظرك» — **والشرطُ المنسوخُ يفترق عن
 * أصله عند أوّل فرعٍ لا يعرفه**. فيُقرأ الحالُ من النقطة نفسِها، ولا يُعاد.
 */
export function routeDot(ready: MediaReady, task: string): Dot | undefined {
  if (task === 'image') return ready.image.dots.find((d) => d.key === 'provider')
  if (task === 'video') return ready.video.dots.find((d) => d.key === 'key')
  return undefined
}

function keyDot(face: VideoFace): Dot {
  const title = 'المفتاح'
  switch (face) {
    case 'env':
      return { key: 'key', title, state: 'done', note: 'من أسرار Worker' }
    case 'card':
      return { key: 'key', title, state: 'done', note: 'من بطاقة Cloudflare' }
    // **ينتظرك ولا يسقط**: الرابطُ يبلغ حسابَ الـ Worker وحده، ولا يُعرَف من
    // هنا أهو حسابُ Workers AI — فلا يُعطَّل زرٌّ قد يعمل
    case 'binding':
      return { key: 'key', title, state: 'now', note: 'برابط Worker وحده', action: PROVIDERS }
    case 'none':
      return { key: 'key', title, state: 'failed', note: 'لا مفتاح لـ Workers AI', action: PROVIDERS }
  }
}

/**
 * نقطةُ «المقاطع» — **حكمُ `videoCapGate` نفسُه** (D-168)، وهو ما تحكم به
 * `animateForPost` قبل الحجز.
 *
 * والتامّةُ تقول كم بقي — والرقمُ في `title` لمن يمرّ عليها — والساقطةُ ترسل
 * إلى الحدود حيث يُرفَع السقف. **وتسقط لأنّ بابَها يردّ النداءَ كلَّه**.
 */
function clipsDot(gate: VideoCapGate): Dot {
  const title = 'المقاطع'
  if (gate.blocker === null) {
    return { key: 'clips', title, state: 'done', note: `بقي ${gate.cap - gate.used} من ${gate.cap} اليوم` }
  }
  return { key: 'clips', title, state: 'failed', note: blockerNote(gate.blocker, ''), action: LIMITS }
}

/**
 * سطرُ «حرّكها فيديو» — بترتيب `animateForPost`: الوجهُ ثمّ الحدودُ ثمّ المقاطع.
 *
 * **ولا نقطةَ للسعر**: `animateForPost` تكتب صفرًا موسومًا في كلّ مرّة، ولا
 * مسارَ في الشيفرة يكتب سعرًا — فنقطتُه تنتظر إلى الأبد ولا يُطفئها فعلٌ من
 * المالك، **وتنبيهٌ دائمٌ يُتعلَّم تجاهلُه**. ورسالةُ ما بعد التحريك تقوله.
 * **وما يحرس المالَ المجهولَ هو العدد** (D-168): نقطةُ «المقاطع» يُطفئها
 * المالكُ من الحدود، فهي حدٌّ لا تنبيه.
 */
export function videoReadiness(i: {
  readonly face: VideoFace
  readonly blocker: Blocker | null
  /** حكمُ `videoCapGate` كما قُرئ للّوح — لا يُعاد هنا. */
  readonly clips: VideoCapGate
}): MediaLine {
  return lineOf([keyDot(i.face), limitsDot(i.blocker), clipsDot(i.clips)])
}
