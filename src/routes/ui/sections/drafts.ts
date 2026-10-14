/**
 * قسمُ المسوّدات — حيث يقع القرار.
 *
 * ## المربّعُ قابلٌ للتحرير دائما
 *
 * لا «اعرض» ثمّ «عدّل» في شاشةٍ ثانية: النصُّ الذي يراه المالك هو النصُّ
 * الذي يُرسَل. فلا فرقَ بين ما قُرئ وما اعتُمد، ولا زرَّ اعتمادٍ يتجاهل
 * تحريرا وقع في المربّع.
 *
 * ## والعدّادُ يعدّ ما تقبله المنصّة لا ما نستهدفه
 *
 * الهدفُ توجيهٌ للنموذج، والحدُّ رفضٌ من المنصّة. فيُلوَّن العدّاد عند
 * الحدّ وحده — تحذيرٌ عند تجاوز الهدف، وخطأٌ عند تجاوز الحدّ. ومنشورٌ
 * أطولُ من الهدف بقليل يُنشر، وأطولُ من الحدّ بمحرفٍ لا يُنشر.
 *
 * ## ولا زرَّ نشرٍ هنا
 *
 * الاعتمادُ يفتح البابَ ولا يعبره: `approved_at` شرطُ الطابور في القاعدة
 * (D-009)، والطابورُ نفسه ينتظر قناةً مربوطة. **وزرٌّ يقول «انشر» ثمّ لا
 * ينشر أسوأ من غيابه.**
 */
import type { DraftRow } from '../../../lib/draft/store'
import { postLength } from '../../../lib/draft/length'
import { reviewText, type ReviewNote } from '../../../lib/draft/review'
import { PLATFORMS, type PlatformSpec } from '../../../lib/draft/prompt'
import type { PublishPlatform } from '../../../lib/oauth/providers'
import { CAPTION_LIMIT, PRIVATE_ONLY } from '../../../lib/media/uploads'
import { IDEA_MAX } from '../../../lib/draft/job'
import type { LinkState } from '../../../lib/channels'
import { button } from '../components/button'
import { menu, menuAction, menuItem } from '../components/menu'
import { field } from '../components/field'
import { linkLine, pickLine } from '../reach'
import { INFO_SIZE } from '../../../lib/image/infographic'
import { CLIP_PLATFORMS } from '../../../lib/platform/needs'
import { missingMedia } from '../../../lib/schedule/media'
import { escapeHtml } from '../escape'
import { whenTag } from '../time'
import { whenField } from '../when'
import type { Peaks } from '../../../lib/schedule/peak'
import { kb, money, parseSqliteUtc, relativeTime } from '../../../lib/format'
import { momentLabel, PRESETS } from '../../../lib/time/local'
import { clock, FALLBACK_ZONE, zoneNote } from '../../../lib/time/zone'
/*
 * **وشعارُ المنصّة من مصدره الواحد** (D-103 · D-123).
 *
 * كان هنا قاموسُ `MARK` بشعارَي LinkedIn وX **منسوخَين حرفا من
 * `logos.ts`** — نسخةٌ ثانيةٌ تفترق عن الأولى عند أوّل تصحيح، ولا تعرف
 * منصّةً تُضاف بعدهما: مسوّدةُ TikTok أو YouTube كانت تُرسَم بلا شعار.
 */
import { LOGOS } from '../logos'
import { ICON } from '../icons'
import { changedCount, diffLines } from '../../../lib/draft/diff'
import { platformLabel } from '../../../lib/oauth/providers'
import { fileName, glyph, RUNG_MARK } from '../parts'
import { count, statusBadge, type Tone } from '../components/badge'
import { emptyState } from '../components/empty'
import { whyFailed } from '../../../lib/publish/reasons'
import { OVERLAY_OFF, SLIDE_SIZE } from '../../../lib/image/slide'
import type { MediaLine, MediaReady } from '../../../lib/media/readiness'

const STATUS: Readonly<Record<string, { cls: Tone; glyph: string; text: string }>> = {
  draft: { cls: 'idle', glyph: '○', text: 'تنتظر قرارك' },
  approved: { cls: 'ok', glyph: '●', text: 'معتمَدة' },
  edited: { cls: 'ok', glyph: '●', text: 'معتمَدة بعد تعديل' },
  rejected: { cls: 'bad', glyph: '✕', text: 'مرفوضة' },
  queued: { cls: 'warn', glyph: '◔', text: 'مجدولة' },
  published: { cls: 'ok', glyph: '✓', text: 'نُشرت' },
  failed: { cls: 'bad', glyph: '▲', text: 'فشل النشر' },
}

/**
 * حبّةُ الحال — **و`queued` حالان لا حال**: ينتظر ساعته، أو غادر. وشارةٌ تقول «مجدولة» فوق
 * شريطٍ يقول «غادرت» تناقضٌ يُقرأ عطلا. والبطاقةُ والمحرّرُ يقرآنها من هنا (D-198).
 */
export function statusOf(d: DraftRow): { readonly cls: Tone; readonly glyph: string; readonly text: string } {
  return d.status === 'queued' && d.dispatchedAt !== null
    ? { cls: 'warn', glyph: '↑', text: 'في الطريق' }
    : (STATUS[d.status] ?? STATUS['draft']!)
}


/**
 * مواصفةُ البطاقة لكلّ منصّة منشور — **`PLATFORMS` للتي تُكتب لها مسوّدة، وInstagram
 * بجوارها لا فيها**.
 *
 * Instagram لا تُكتب لها مسوّدةٌ من مصدر: لا تقبل نصًّا بلا وسيط، فلا مكانَ لها في
 * قائمة «اكتب مسوّدة». لكنّ منشورَها يصل من «فيديوهاتك» ومن الخطّة، **فيُعرَض باسمه
 * ويُجدوَل إلى حسابه**: الاسمُ من `platformLabel`، والحدُّ حدُّ `captionProblem` نفسُه.
 * وكانت البطاقةُ تقرأ `PLATFORMS[d.platform]` فتعرضه «LinkedIn» بحدّ ‏3000.
 */
interface CardSpec {
  readonly id: PublishPlatform
  readonly label: string
  readonly hardLimit: number
}

export function specOf(p: PublishPlatform): CardSpec {
  return p === 'instagram' ? { id: p, label: platformLabel(p), hardLimit: CAPTION_LIMIT.instagram } : PLATFORMS[p]
}

/** طولُ النصّ كما تعدّه منصّتُه — وInstagram بالمحرف كما يعدّ `captionProblem`. */
export function lengthOf(d: DraftRow): number {
  return d.platform === 'instagram' ? d.text.length : postLength(d.text, d.platform)
}

/** أنواعُ الوسائط الجاهزة لمنشور — ما يسأل عنه `missingMedia` كما يسأله الناشر. */
export function readyMimes(d: DraftRow, media: readonly MediaView[]): string[] {
  return media.filter((m) => m.postId === d.id && m.status === 'ready').map((m) => m.mime)
}
const LINE = 26
const PAD = 28

/**
 * مواعيدُ بضغطةٍ واحدة — **بتوقيت المالك لا بالـ UTC** (D-089).
 *
 * ## العلّة المقيسة
 *
 * قال المالك: «تسهيل عمليّة الجدولة، حيث إنّ استخدامها صعب». وقُرئ
 * الشريطُ فوُجد فيه حقلٌ واحد `datetime-local` **بلا أيّ اقتراح**:
 * يُكتب التاريخُ والساعةُ والدقيقةُ يدا، في كلّ مسوّدةٍ على حدة.
 *
 * **والموعدُ بالـ UTC والمالكُ في الرياض** — فبينهما ثلاثُ ساعات. فمن
 * أراد «التاسعةَ صباحا» كتب `06:00`، **ويحوّل ذهنيّا في كلّ مرّة**.
 * وخطأُ ساعةٍ هنا منشورٌ يخرج في وقتٍ لا يقرؤه أحد.
 *
 * ## والحلُّ لا يمسّ الخادم
 *
 * الخادمُ يقرأ الـ UTC ولا يعرف منطقةَ أحد — **وهذا صواب**: منطقةٌ
 * تُخزَّن في إعدادٍ تُنسى فتكذب بعد سفرٍ أو تحوّلٍ صيفيّ. فالتحويلُ في
 * المتصفّح، حيث المنطقةُ معروفةٌ يقينا وتُقرأ لحظتَها.
 *
 * فالأزرارُ تحسب لحظةً **محلّيّة** ثمّ تكتبها في الصندوق **UTC**،
 * ومرآةٌ تحته تقرأ ما في الصندوق وتقوله بتوقيت المالك. **فالرقمان
 * حاضران معا**، ولا يُصدَّق أحدُهما على حساب الآخر.
 */
const QUICK: readonly { kind: string; label: string }[] = [
  { kind: 'hour', label: 'بعد ساعة' },
  { kind: 'tonight', label: 'الليلة 8م' },
  { kind: 'tomorrow', label: 'غدا 9ص' },
  { kind: 'sunday', label: 'الأحد 9ص' },
]

/**
 * ‏«انقلها إلى» على بطاقة المجدولة نفسِها، خارجَ الطيّة (D-200) — **ضغطةٌ واحدة تغيّر الموعد** بلا فتح المحرّر.
 * ‏كلُّ زرٍّ يرسل `preset` إلى `reschedule`، فيحسبه الخادمُ بتوقيت المالك كما يحسب أزرارَ المحرّر،
 * ‏والموعدُ وحدَه يتغيّر (`reschedulePost`) فلا سحبَ ولا جدولةَ من جديد. ولـ«موعدٍ آخر» المحرّرُ كما كان.
 */
function quickMove(id: string): string {
  const buttons = PRESETS.map((p) =>
    `<button class="btn btn-secondary btn-sm" type="submit" name="preset" value="${p.kind}">${escapeHtml(p.label)}</button>`).join('')
  return `<form class="pc-line" method="POST" action="/panel/drafts/reschedule" data-busy="جارٍ…"
      role="group" aria-label="انقل الموعد إلى">
      <input type="hidden" name="id" value="${escapeHtml(id)}">
      <span class="ago">انقلها إلى</span>${buttons}</form>`
}

/**
 * شريطُ الجدولة — ولا يظهر إلّا حيث يعمل.
 *
 * ثلاثةُ أحوالٍ لا حالان: معتمَدٌ بلا قناةٍ لمنصّته **يقول لماذا** ولا
 * يعرض نموذجا معطَّلا؛ ومعتمَدٌ بقناةٍ يعرض وجهةً وموعدا؛ ومجدولٌ يعرض
 * موعده — وزرَّ سحبٍ ما دام لم يغادر.
 *
 * ونموذجٌ معطَّلٌ بلا تفسير أسوأ من غيابه: يجعل المالك يشكّ في ضبطه لا
 * في نقص قناته.
 */
function scheduler(
  d: DraftRow,
  targets: readonly Target[],
  earliest: string,
  now: Date,
  pageOnly: readonly string[],
  peaks: Peaks | undefined,
  media: readonly MediaView[],
  zone: string | null,
): string {
  const approved = d.status === 'approved' || d.status === 'edited'
  // ‏والشريطُ مرساةٌ بحاله كلّها: «اعتمد» و«اسحب الموعد» و«أعده إلى المعتمَد» تعود إليه
  // ‏لا إلى رأس اللوح — فيقع النظرُ على الخطوة التالية لا على ما قبلها بآلاف البكسلات
  const anchor = `id="s-${escapeHtml(d.id)}"`

  /*
   * **والفاشلُ يقول سببَه وما يُفعَل في بطاقته** (رحلة R-8). كانت تقول «فشل النشر» بلا
   * سببٍ ولا زرّ، والإعادةُ في صفحة المنصّة وحدَها. فالسببُ من `whyFailed` — جملةُ
   * صفحة المنصّة نفسُها — والفعلُ فعلُها: «أعد الربط» حيث سقط الإذن، و«أعده إلى
   * المعتمَد» حيث تصلح الإعادة؛ ثمّ يعود المالكُ إلى هذا الشريط نموذجَ جدولة.
   */
  if (d.status === 'failed') {
    const why = whyFailed(d.failure ?? null, d.platform)
    return `<div class="card card-inset sched" ${anchor}>
      <p class="np-why"><span class="np-why-ic">${glyph('▲')}</span>${escapeHtml(why.text)}</p>
      <span class="grow"></span>
      ${why.action === 'relink'
        ? `<a class="btn btn-primary btn-sm" href="/oauth/${escapeHtml(d.platform)}/start">أعد الربط</a>`
        : ''}
      ${why.action === 'none' ? '' : requeueForm(d.id, why.action !== 'relink')}
    </div>`
  }

  if (d.status === 'queued') {
    const gone = d.dispatchedAt !== null
    return `<div class="card card-inset sched ${gone ? 'gone' : 'set'}" ${anchor}>
      ${statusBadge(gone ? 'warn' : 'ok', gone ? '↑' : '◔', gone ? 'غادرت إلى الطابور' : 'مجدولة')}
      <span class="when mono">${whenTag(d.scheduledAt)}</span>
      ${d.accountName === null ? '' : `<span class="chip">${escapeHtml(d.accountName)}</span>`}
      <span class="grow"></span>
      ${gone
        ? '<span class="ago">ولا تُستردّ من هناك</span>'
        : `<form class="inline" method="POST" action="/panel/drafts/unschedule"
             data-confirm="سحبُ الموعد يعيدها معتمَدةً بلا موعد. أتمضي؟" data-busy="جارٍ…">
             <input type="hidden" name="id" value="${escapeHtml(d.id)}">
             <button class="btn btn-secondary btn-sm" type="submit">اسحب الموعد</button></form>`}
    </div>`
  }

  if (!approved) return ''

  /*
   * **ومنشورٌ يعرف الناشرُ أنّه سيردّه لا يُعرض له نموذجُ جدولة** — بالجملة نفسِها
   * التي تردّ بها `schedulePost`. كان TikTok بلا مقطعٍ يُجدوَل فيُقال «مجدولة»، ثمّ
   * يفشل عند موعده بـ `no_clip`.
   */
  const lacking = missingMedia(d.platform, readyMimes(d, media))
  if (lacking !== null) {
    return `<div class="card card-inset sched none" ${anchor}>
      ${statusBadge('warn', '!', CLIP_PLATFORMS.has(d.platform) ? 'لا مقطعَ بعد' : 'لا صورةَ ولا مقطعَ بعد')}
      <span class="ago">${escapeHtml(lacking)}. واعتُمد النصّ ويبقى.</span>
    </div>`
  }

  const fit = targets.filter((t) => t.platform === d.platform)
  if (fit.length === 0) {
    // **والسببُ يُقال كما هو**: «لا قناة» حيث القناةُ مربوطةٌ صفحةً كذبٌ
    // يرسل المالكَ يربط ما هو مربوط
    if (pageOnly.includes(d.platform)) {
      return `<div class="card card-inset sched none" ${anchor}>
        ${statusBadge('warn', '!', `الصفحةُ مربوطة — والنشرُ باسمها لم يُبنَ`)}
        <span class="ago">اعتُمد النصّ ويبقى. واربط <b>حسابَك الشخصيّ</b> لتنشر الآن،
          أو انتظر موافقةَ <span class="mono">Community Management API</span> (M-03).</span>
        <span class="grow"></span>
        <a class="btn btn-secondary btn-sm" href="/panel/tasks">ما عليك</a>
      </div>`
    }
    return `<div class="card card-inset sched none" ${anchor}>
      ${statusBadge('warn', '!', `لا قناةَ ${escapeHtml(specOf(d.platform).label)} مربوطة`)}
      <span class="ago">اعتُمد النصّ، ويبقى حتّى تُربَط قناتُه — ولا يضيع.</span>
      <span class="grow"></span>
      <a class="btn btn-secondary btn-sm" href="#channels">اربط قناة</a>
    </div>`
  }

  /*
   * ‏**والظاهرُ سطرٌ واحد** (D-199): الحسابُ إن تعدّد، وأزرارُ الموعد بتوقيت المالك، و«جدوِل». والحقلُ
   * ‏الحرُّ في طيّة «موعدٌ آخر» بتوقيته (`local` تقرؤه `readWhen` بمنطقة كعكته)، فلا يرى المالكُ حقلَ
   * ‏‹mm/dd/yyyy› ولا كلمةَ UTC ما لم يطلبهما. والمرآةُ تقول ما اختاره الزرّ.
   */
  const id = d.id.slice(0, 8)
  const account = fit.length === 1
    ? `<input type="hidden" name="account" value="${escapeHtml(fit[0]!.id)}">`
    : `<div class="field"><label for="ac-${id}">الحساب</label>
      <select id="ac-${id}" name="account">${fit
        .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`)
        .join('')}</select></div>`
  return `<form class="card card-inset sched" ${anchor} method="POST" action="/panel/drafts/schedule" data-busy="جارٍ…">
    <input type="hidden" name="id" value="${escapeHtml(d.id)}">
    ${account}
    <div class="quick" data-quick="wh-${id}">
      ${QUICK.map(
        (q) =>
          `<button class="btn btn-secondary btn-sm" type="button" data-preset="${q.kind}">${escapeHtml(q.label)}</button>`,
      ).join('')}
      <span class="grow"></span>
      ${fit.length === 1 ? `<span class="ago">على <bdi>${escapeHtml(fit[0]!.label)}</bdi></span>` : ''}
      <button class="btn btn-primary btn-sm" type="submit">جدوِل</button>
      <span class="mirror" data-mirror="wh-${id}"></span>
    </div>
    <details class="sched-more"><summary>موعدٌ آخر</summary>
      <div class="field"><label for="wh-${id}">${zone === null ? 'اليوم والساعة بتوقيت الرياض' : 'اليوم والساعة بتوقيتك'}</label>
        <input id="wh-${id}" name="local" type="datetime-local" data-when data-local data-zone="${escapeHtml(zone ?? FALLBACK_ZONE)}"
          min="${escapeHtml(earliest)}"></div>
      <input type="hidden" name="tz" value="${escapeHtml(zone ?? FALLBACK_ZONE)}">
      ${peakLine(peaks, zone, now)}
    </details>
  </form>`
}

/** «أعده إلى المعتمَد» — بلا `return`: النجاحُ يعود إلى شريط جدولة البطاقة نفسِها. */
export function requeueForm(id: string, primary: boolean): string {
  return `<form class="inline" method="POST" action="/panel/drafts/requeue" data-busy="جارٍ…">
    <input type="hidden" name="id" value="${escapeHtml(id)}">
    <button class="btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm" type="submit">أعده إلى المعتمَد</button></form>`
}

/**
 * سطرُ الذروة تحت حقل الموعد (D-106) — **أو سببُ الصمت**.
 *
 * **ولا زرَّ يملأ الحقل بالذروة.** الاقتراحُ خبرٌ عن الماضي، والقرارُ
 * للمالك: زرٌّ يكتبها **يجعل المقيسَ أمرا**، وساعةُ ذروةٍ لا تعرف أنّ
 * غدا عيدٌ أو أنّ للمالك موعدا. **فيُقال ما قِيس، ويُترَك الحقل.**
 *
 * والساعةُ تُقال بوسمها فتصير سطرين كسائر المواعيد — **فلا رقمٌ بلا
 * منطقةٍ في شاشةٍ كلُّها بمنطقتين**.
 */
function peakLine(peaks: Peaks | undefined, zone: string | null, now: Date): string {
  if (peaks === undefined) return ''
  if (peaks.hours.length === 0) {
    return peaks.why === null
      ? ''
      : `<p class="hint peak"><b>لا اقتراحَ للموعد</b> — ${escapeHtml(peaks.why)}.
           <span class="ago">واقتراحٌ لم يُقَس أسوأُ من حقلٍ خامّ.</span></p>`
  }
  const said = peaks.hours
    .map((h) => `<span class="chip mono" title="وسيطُ التفاعل ${h.median} في ${h.posts} منشورات"
      >${clock(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h.hour)), zone)}</span>`)
    .join('')
  return `<p class="hint peak"><b>أعلى تفاعلٍ قِيس</b> عند ${said}
    <span class="ago">${zone === null ? 'بتوقيت الرياض · ' : ''}من ${peaks.samples} منشوراتٍ نُشرت وقِيست — خبرٌ لا أمر.</span></p>`
}

/**
 * ما على الصورة — **أو لماذا لا شيءَ عليها** (D-162).
 *
 * كان يُقال في الوميض مرّةً بعد «ولّد صورة» ثمّ يختفي، والمعاينةُ وحدَها لا
 * تقول أرُكّب العنوانُ أم سقط. فيعتمد المالكُ صورةً بلا عنوانٍ وهو لا يدري،
 * أو يرفضها ويدفع ثمنَ توليدٍ ثانٍ على أملِ أن يظهر النصّ.
 *
 * **وأربعةُ أحوالٍ لا ثلاثة:**
 *
 * - `null` — صفٌّ أقدمُ من الحفظ: **لا سطر**، فلا يُدّعى ما لم يُسجَّل.
 * - `''` — رُكّب: «على الصورة» والعنوانُ نفسُه، **وهو القراءةُ الموثوقة**:
 *   عنوانٌ رُسم لعرض ‏1200 يصغر في معاينة الجوّال حتّى يُتبيَّن بجهد. وبلا
 *   عنوانٍ لا سطر: لا يُقال «عليها» ولا شيء.
 * - الإطفاءُ من الإعدادات — **قرارٌ لا عطل**: رقاقةٌ ساكنة، وبطاقةُ الإعدادات
 *   تقول ذلك بلفظها. ويُطابَق بآخر السبب لأنّ سقوطَ الموجز يسبقه بـ«؛».
 * - كلُّ سببٍ سواه — تحذير، ومعه العنوانُ المقترح إن وُجد.
 *
 * **والسببُ «عند التوليد» لا الآن**: مفتاحٌ ضُبط بعدها لا يرسم على صورةٍ
 * رُفعت، وسطرٌ يقول «اضبط المفتاح» لمن ضبطه كاذبٌ إن لم يُؤرَّخ.
 */
/** أشكالُ الإنفوجرافيك بأسمائها — تُقرأ تحت الصورة. */
const INFO_KIND: Readonly<Record<string, string>> = {
  pillars: 'أعمدة', layers: 'طبقات', steps: 'خطوات', stats: 'أرقام', bars: 'أعمدةٌ بيانيّة', compare: 'مقارنة', quote: 'فكرةٌ واحدة',
}

function slideLine(m: MediaView): string {
  if (m.model.startsWith('infographic:')) {
    // ‏والإنفوجرافيك يُقال بشكله ومن أين جاء محتواه — لا «على الصورة» ولا تحذير
    const kind = INFO_KIND[m.model.slice('infographic:'.length)] ?? ''
    return `<div class="pic-foot">
        ${statusBadge('ok', '●', `إنفوجرافيك${kind === '' ? '' : ` · ${escapeHtml(kind)}`}`)}
        <span class="ago">${m.note === null || m.note === ''
          ? 'المحتوى من نصّ المنشور بصياغة نموذج الكتابة، ولا رقمَ فيه لا يرد في النصّ.'
          : escapeHtml(m.note)}</span>
      </div>`
  }
  if (m.note === null) return ''
  if (m.note === '') {
    return m.headline === null
      ? ''
      : `<div class="pic-foot">
           ${statusBadge('ok', '●', 'على الصورة')}
           <span class="ago">«${escapeHtml(m.headline)}»</span>
         </div>`
  }
  const off = m.note.endsWith(OVERLAY_OFF)
  const offered = m.headline === null ? '' : ` — والعنوانُ المقترح «${escapeHtml(m.headline)}»`
  return `<div class="pic-foot">
      ${off ? statusBadge('idle', '○', 'بلا نصٍّ فوقها') : statusBadge('warn', '!', 'بلا نصٍّ فوقها')}
      <span class="ago">عند التوليد: ${escapeHtml(m.note)}${offered}</span>
    </div>`
}

/**
 * لوحُ الصورة.
 *
 * ثلاثةُ أحوال: بلا صورةٍ فزرُّ توليد، وبصورةٍ فمعاينةٌ وزرُّ رفض،
 * ومرفوضةٌ فأثرٌ يبقى بكلفته.
 *
 * **والصورةُ تُعرض بحجمها الحقيقيّ لا مصغَّرةً بعشرين بكسلا**: المالك
 * يقرّر عليها، وقرارٌ على مربّعٍ صغير ليس قرارا.
 *
 * **وتحت الزرّين سطرُ جاهزيّة** (D-163): ما ستقوله الدالّةُ بعد الضغط يُقال
 * قبله. وزرٌّ تسقط نقطتُه يُعطَّل وسببُه بجانبه — لا زرٌّ يُضغَط فيُردّ.
 */
export function imagePane(d: DraftRow, media: readonly MediaView[], lines: ReadyLines, caption: string = INFO_CAPTION): string {
  const open = d.status === 'draft' || d.status === 'approved' || d.status === 'edited'
  const mine = media.filter((m) => m.postId === d.id)
  // الصورةُ والمقطعُ صفّان في `media` يفترقان بالنوع — لا جدولَ ثانٍ
  const ready = mine.find((m) => m.status === 'ready' && !m.mime.startsWith('video/'))
  const clip = mine.find((m) => m.status === 'ready' && m.mime.startsWith('video/'))

  /*
   * **مقطعُ المالك يُعرض هو، ولا زرَّ توليدٍ بجانبه** (D-182). كان المنشورُ من
   * «فيديوهاتك» يُرسم «بلا صورة» وزرُّ «ولّد إنفوجرافيك» أساسيٌّ عليه — وصورةٌ تُولَّد
   * له كانت تصير أحدثَ وسيطه فتُنشر على Instagram مكانَ الـ Reel.
   */
  const owned = mine.find((m) => m.status === 'ready' && m.model === 'upload' && m.mime.startsWith('video/'))
  if (owned !== undefined) {
    const dims = owned.width !== null && owned.height !== null
      ? ` width="${owned.width}" height="${owned.height}"` : ''
    return `<div class="pic">
      <video src="/panel/media/${escapeHtml(owned.id)}" controls preload="metadata" playsinline${dims}></video>
      <div class="pic-foot">
        ${statusBadge('ok', '●', 'مقطعُك كما رفعتَه')}
        <span class="chip mono">${kb(owned.bytes)}</span>
        ${owned.width !== null && owned.height !== null
          ? `<span class="chip mono">${owned.width}×${owned.height}</span>` : ''}
        <span class="ago">يُنشر كما هو — والنصُّ أعلاه وصفُه.</span>
      </div>
    </div>`
  }

  if (ready !== undefined) {
    const info = ready.model.startsWith('infographic:')
    // والنصُّ المرسومُ في الصورة مكانُه `alt`: قارئُ الشاشة لا يرى البكسلات
    const alt = info && ready.headline !== null
      ? `إنفوجرافيك: ${ready.headline}`
      : ready.note === '' && ready.headline !== null
        ? `صورةٌ مولَّدة وعليها: ${ready.headline}`
        : 'صورةٌ مولَّدة تصاحب المنشور'
    // ‏والأبعادُ المحفوظةُ تحجز المكانَ بنسبته الحقيقيّة (D-174)، وإلّا فمقاسُ الشريحة
    const slide = d.platform === 'instagram' ? INFO_SIZE.instagram : SLIDE_SIZE[d.platform]
    const w = ready.width ?? slide.width
    const h = ready.height ?? slide.height
    const regen = (style: 'infographic' | 'illustration', label: string, blocked: boolean): string =>
      `<form class="inline" method="POST" action="/panel/media/regenerate" data-busy="جارٍ التوليد…">
         <input type="hidden" name="id" value="${escapeHtml(d.id)}">
         <input type="hidden" name="media" value="${escapeHtml(ready.id)}">
         <input type="hidden" name="style" value="${style}">
         <button class="btn btn-secondary btn-sm" type="submit"${blocked ? ' disabled' : ''}
           title="تُرفَض هذه بعد أن يمرّ التوليدُ بحرّاسه، فلا يبقى المنشورُ بلا صورة">${label}</button></form>`
    return `<div class="pic">
      <img src="/panel/media/${escapeHtml(ready.id)}" alt="${escapeHtml(alt)}" data-media
        loading="lazy" width="${w}" height="${h}">
      <div class="pic-foot">
        <span class="chip mono">${kb(ready.bytes)}</span>
        <span class="chip mono">${ready.cost === 0 ? '—' : money(ready.cost)}</span>
        ${ready.prompt === ''
          ? ''
          : `<span class="chip" title="${escapeHtml(ready.prompt)}">الوصف</span>`}
        <span class="grow"></span>
        ${open
          ? `${clip === undefined
              // **ولا زرَّ تحريكٍ على صورةٍ لها مقطع**: كانت الضغطةُ تُردّ «لهذا
              // المنشور مقطعٌ من قبل» — زرٌّ يُعرَض ليُقال إنّه لا يفعل شيئا
              ? `<form class="inline" method="POST" action="/panel/media/animate"
                   data-busy="جارٍ التحريك…">
               <input type="hidden" name="id" value="${escapeHtml(d.id)}">
               <button class="btn btn-secondary btn-sm" type="submit"${lines.videoBlocked ? ' disabled' : ''}>حرّكها فيديو</button></form>`
              : ''}
             ${info
               ? `${regen('infographic', 'ولّد إنفوجرافيك بديلًا', lines.infoBlocked)}${regen('illustration', 'بدّلها صورةً فنّيّة', lines.imageBlocked)}`
               : `${regen('illustration', 'ولّد صورةً بديلة', lines.imageBlocked)}${regen('infographic', 'بدّلها إنفوجرافيك', lines.infoBlocked)}`}
             <form class="inline" method="POST" action="/panel/media/reject" data-busy="جارٍ…">
               <input type="hidden" name="id" value="${escapeHtml(ready.id)}">
               <button class="btn btn-secondary btn-sm" type="submit">ارفض الصورة</button></form>`
          : ''}
      </div>
      ${slideLine(ready)}
      ${open && clip === undefined ? lines.video : ''}
      ${clip === undefined
        ? ''
        : `<div class="pic-foot">
             ${statusBadge('ok', '●', `مقطعٌ رأسيّ 15ث`)}
             <span class="chip mono">${kb(clip.bytes)}</span>
             <span class="ago">يصلح لـ Shorts و Reels و TikTok — وهي كلُّها رأسيّة.</span>
           </div>`}
    </div>`
  }

  const rejected = mine.filter((m) => m.status === 'rejected').length
  if (!open) return ''

  // ‏و`i-` مرساةُ محطّة «الصورة» في الرئيسيّة: تنزل إلى الزرّ لا إلى رأس البطاقة (ر-3)
  return `<div class="pic none" id="i-${escapeHtml(d.id)}">
    ${statusBadge('idle', '○', `${
      rejected === 0 ? 'بلا صورة' : `رُفضت ${rejected} — وتبقى في الدفتر`}`)}
    <span class="ago">${caption}</span>
    <span class="grow"></span>
    <form class="inline" method="POST" action="/panel/media/generate" data-busy="جارٍ الرسم…">
      <input type="hidden" name="id" value="${escapeHtml(d.id)}">
      <input type="hidden" name="style" value="infographic">
      <button class="btn btn-primary btn-sm" type="submit"${lines.infoBlocked ? ' disabled' : ''}>ولّد إنفوجرافيك</button></form>
    ${lines.info}
    <details class="art">
      <summary>أو صورةٌ فنّيّة</summary>
      <div class="art-row">
        <span class="ago">${lines.caption}</span>
        <form class="inline" method="POST" action="/panel/media/generate" data-busy="جارٍ التوليد…">
          <input type="hidden" name="id" value="${escapeHtml(d.id)}">
          <input type="hidden" name="style" value="illustration">
          <button class="btn btn-secondary btn-sm" type="submit"${lines.imageBlocked ? ' disabled' : ''}>ولّد صورةً فنّيّة</button></form>
        ${lines.image}
      </div>
    </details>
  </div>`
}

/** ما يُبنى مرّةً للّوح كلِّه — والبطاقاتُ تأخذه ولا تحسبه. */
export interface ReadyLines {
  /** سطرُ الإنفوجرافيك (D-174) — وهو الزرُّ الأوّل. */
  readonly info: string
  readonly infoBlocked: boolean
  readonly image: string
  readonly video: string
  readonly imageBlocked: boolean
  readonly videoBlocked: boolean
  /** وصفُ الصورة الفنّيّة في طيّتها — يتبع حالَ الشريحة لا نصًّا ثابتًا. */
  readonly caption: string
}

/**
 * سطرُ الجاهزيّة (D-163) — **نقطةٌ لكلّ بابٍ يمرّ به النداء**، وأوّلُ
 * ساقطةٍ (أو أوّلُ ما ينتظرك) سببٌ ورابطٌ بجانبها.
 *
 * والنقطةُ لونٌ ورمزٌ وكلمة (D-043)، وحالُها وما وقع في `title` لمن يمرّ
 * عليها. **وكلُّ ما يُكتب مهرَّب**: اسمُ المزوّد يكتبه المالكُ من اللوحة.
 *
 * والرابطُ `a.tap` لا `a.btn`: لا يزاحم زرَّ التوليد في وزنه، والزرُّ هو
 * الفعل — والرابطُ طريقٌ إلى موضع الإصلاح.
 */
function readyLine(line: MediaLine): string {
  const dots = line.dots
    .map((dot) => {
      const mark = RUNG_MARK[dot.state]
      return statusBadge(mark.cls, mark.g, escapeHtml(dot.title),
        `title="${escapeHtml(`${mark.label} — ${dot.note}`)}"`)
    })
    .join('')
  const next = line.next
  const why = next === null
    ? ''
    : `<span class="ago">${escapeHtml(next.note)}</span>${next.action === undefined
        ? ''
        : `<a class="tap" href="${escapeHtml(next.action.href)}">${escapeHtml(next.action.label)}</a>`}`
  return `<p class="hint ready">${dots}${why}</p>`
}

/**
 * **يُبنى مرّةً قبل البطاقات** لا في كلّ واحدةٍ منها: الحالُ حالُ اللوح لا
 * حالُ المسوّدة — المزوّدُ والحدودُ والبيئةُ واحدةٌ للستّين بطاقة.
 *
 * و«بلا حرف» كان ثابتًا بجانب الزرّ **ولو رُفع التركيب** فيقول السطرُ الواحدُ
 * كلامين متعاكسين. فيتبع الوصفُ نقطةَ «النصُّ فوقها»: غائبةٌ حين يُطفأ، وتامّةٌ
 * حين يُركَّب، وتنتظرك حين ينقصها شيء.
 */
export function readyLines(ready: MediaReady): ReadyLines {
  const overlay = ready.image.dots.find((dot) => dot.key === 'overlay')
  return {
    info: readyLine(ready.infographic),
    infoBlocked: ready.infographic.blocked,
    image: readyLine(ready.image),
    video: readyLine(ready.video),
    imageBlocked: ready.image.blocked,
    videoBlocked: ready.video.blocked,
    // ‏والصورةُ الفنّيّةُ تُرسم من موجزٍ يترجم النصّ، ولا تُرسم بوصفٍ عامّ إن سقط (D-174)
    caption: overlay === undefined
      ? 'مشهدٌ من موجزٍ يترجم النصّ، <b>بلا حرف</b>: النصُّ في المنشور حيث يُقرأ.'
      : overlay.state === 'done'
        ? 'مشهدٌ من موجزٍ يترجم النصّ، <b>وفوقه عنوانٌ من كلمتين أو ثلاث</b>.'
        : 'مشهدٌ من موجزٍ يترجم النصّ، <b>بلا عنوانٍ فوقه بعد</b> — وما ينقصه تحت الزرّ.',
  }
}

/** وصفُ الزرّ الأوّل (D-174): الإنفوجرافيك من النصّ نفسِه، ولا رقمَ من خارجه. */
const INFO_CAPTION = '<b>إنفوجرافيك من نصّ المنشور</b>: عنوانُه وأبعادُه وأرقامُه كما كُتبت، ولا يُخترَع فيه رقم.'

/**
 * سِلالُ الفرز — **ستٌّ لا سبع**.
 *
 * `approved` و `edited` حالان في القاعدة **وسؤالٌ واحدٌ عند المالك**:
 * «اعتُمدت، وتنتظر موعدا». والفرقُ بينهما (أعُدّلت قبل الاعتماد؟) يُقرأ
 * على البطاقة، **ولا يستحقّ تبويبا يقسم القائمة نصفين بلا سبب**.
 *
 * **و`failed` لا تُخلَط بـ `published`** (رحلة R-8، الخطّة 5.6 و8.2): كانتا معًا تحت
 * «غادرت»، فالمنشورُ الفاشلُ — وفيه فعلٌ باقٍ — بين منشوراتٍ نُشرت ولا فعلَ فيها.
 */
function bucketOf(d: DraftRow): string {
  if (d.status === 'draft') return 'waiting'
  if (d.status === 'approved' || d.status === 'edited') return 'approved'
  if (d.status === 'queued') return 'queued'
  if (d.status === 'rejected') return 'rejected'
  if (d.status === 'failed') return 'failed'
  return 'published'
}

const BUCKETS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'all', label: 'الكلّ' },
  { id: 'waiting', label: 'تنتظر قرارك' },
  { id: 'approved', label: 'معتمَدة' },
  { id: 'queued', label: 'مجدولة' },
  { id: 'published', label: 'نُشرت' },
  { id: 'failed', label: 'فشلت' },
  { id: 'rejected', label: 'مرفوضة' },
]

/**
 * تبويباتُ الفرز — **وشرطا D-062 يُوَرَّثان**: العددُ معروضٌ دائما ولو
 * كان صفرا، والافتراضُ «الكلّ».
 *
 * وعددٌ يختفي حين يكون صفرا يجعل القائمةَ تتبدّل طولا بين فتحةٍ وأخرى،
 * **فيظنّ القارئُ أنّ تبويبا سقط**.
 *
 * ## وأزرارٌ لا روابط
 *
 * التبويبُ هنا يرشّح ما هو معروضٌ في الصفحة نفسِها، **ولا ينتقل**. ورابطٌ
 * لا ينتقل يكذب على من يفتحه في تبويبٍ جديد. وبلا JavaScript لا تظهر
 * هذه الشريحةُ أصلا — والقائمةُ كاملةٌ كما هي اليوم.
 */
/**
 * **ما تغيّر قبل الاعتماد** (D-128): `edited` كانت تقول إنّ تعديلًا وقع ولا
 * تقول ما هو. فيُعرَض الفرقُ سطرًا سطرًا من الأصل المحفوظ — مطويًّا،
 * لأنّ السؤالَ يُسأل عند المراجعة لا عند كلّ فتحة. **والحالُ لونٌ ورمزٌ
 * ونصّ** (D-043): المحذوفُ بـ«−» والمضافُ بـ«+» قبل اللون.
 */
function editDiff(d: DraftRow): string {
  if (d.status !== 'edited' || d.originalText === null) return ''
  const diff = diffLines(d.originalText, d.text)
  const n = changedCount(diff)
  if (n === 0) return ''
  const body = diff.map((l) => {
    const mark = l.kind === 'del' ? '−' : l.kind === 'add' ? '+' : ' '
    return `<span class="dl ${l.kind}">${mark} ${escapeHtml(l.text)}</span>`
  }).join('\n')
  return `<details class="diff">
    <summary>ما تغيّر قبل الاعتماد <span class="chip">${n} ${n === 1 ? 'سطر' : n === 2 ? 'سطران' : 'أسطر'}</span></summary>
    <pre class="diff-body" dir="auto">${body}</pre>
  </details>`
}

function filterTabs(drafts: readonly DraftRow[]): string {
  const tabs = BUCKETS.map((b) => {
    const n = b.id === 'all' ? drafts.length : drafts.filter((d) => bucketOf(d) === b.id).length
    // ‏تبويبُ فرزٍ بلغة التنقّل (D-189) — وحالُه في «aria-pressed» لا في صنف
    return `<button type="button" class="tab-item"
      data-bucket="${b.id}" aria-pressed="${b.id === 'all'}"
      >${escapeHtml(b.label)}${count(n)}</button>`
  }).join('')
  /*
   * **وفرزٌ ثانٍ بالمنصّة، وترتيب** (D-127) — بشرطَي D-062 نفسيهما:
   * العددُ معروضٌ ولو صفرًا، والافتراضُ «الكلّ» والأحدثُ أوّلًا. والمنصّاتُ
   * من المسوّدات نفسِها لا من قائمةٍ ثابتة: منصّةٌ بلا مسوّدةٍ لا تبويبَ لها.
   * **وبلا JavaScript لا يظهر شيءٌ من هذا** — والقائمةُ كاملةٌ كما هي.
   */
  const platforms = [...new Set(drafts.map((d) => d.platform))]
  const ptabs = [
    `<button type="button" class="tab-item" data-platform-tab="all" aria-pressed="true">كلُّ المنصّات${count(drafts.length)}</button>`,
    ...platforms.map((p) => `<button type="button" class="tab-item" data-platform-tab="${escapeHtml(p)}" aria-pressed="false"
      >${escapeHtml(platformLabel(p))}${count(drafts.filter((d) => d.platform === p).length)}</button>`),
  ].join('')
  const order = `<label class="order"><span class="sub">الترتيب</span>
    <select id="draft-order" aria-label="ترتيبُ المسوّدات">
      <option value="new" selected>الأحدث أوّلًا</option>
      <option value="old">الأقدم أوّلًا</option>
      <option value="cost">الأغلى نشرًا أوّلًا</option>
    </select></label>`
  return `<nav class="tab-bar" id="draft-filter" aria-label="فرزُ المسوّدات" hidden>${tabs}</nav>
  <nav class="tab-bar tab-sub" id="draft-platform" aria-label="فرزُ المسوّدات بالمنصّة" hidden>${ptabs}<span class="grow"></span>${order}</nav>`
}

/**
 * المعاينة — **كما تُقرأ لا كما تُحرَّر** (D-100).
 *
 * ## ما تُضيفه على المربّع
 *
 * المربّعُ حقلُ تحرير: خطُّ اللوحة، وحدٌّ، وشريطُ تمرير، وعرضُ البطاقة.
 * **والمنشورُ يُقرأ فقرةً في عمودٍ ضيّقٍ تحت اسم الحساب** — وحكمٌ على
 * نصٍّ في حقلٍ ليس حكما عليه منشورا.
 *
 * ## وحدُّ الصدق — ولا يُرسَم ما لم يُقَس
 *
 * **الطيُّ («اقرأ المزيد») لا يُرسَم.** حدُّه عند LinkedIn يتبدّل بالجهاز
 * وبوجود صورة، **و`PLATFORMS.md` لا تحمله مقيسا** — ورسمُ خطٍّ عند رقمٍ
 * من الذاكرة يجعل المالكَ يقصّر نصَّه أو يطيله على وهم.
 *
 * وهي قاعدةُ D-076 نفسُها: **الفحصُ يكذب حين يستدلّ**. فيُقال إنّها
 * تقريبٌ، ويُسمَّى ما لا تعرفه.
 *
 * ## وما تعرفه تعرفه يقينا
 *
 * السطرُ الأوّل هو ما يُقرأ قبل أيّ طيّ **مهما كان حدُّه** — فيُعلَّم.
 * والأسطرُ تُحفظ كما كُتبت (`pre-wrap`): منشورٌ بفقرتين يُقرأ فقرةً واحدة
 * إن طُويت أسطرُه، فيُحكَم عليه بغير ما يظهر.
 */
function preview(d: DraftRow, target: string): string {
  const [first = '', ...rest] = d.text.split('\n')
  return `<div class="card card-inset pv" data-pv="${escapeHtml(d.id)}">
    <div class="pv-head">
      <span class="pv-dot" aria-hidden="true"></span>
      <span class="pv-who">${escapeHtml(target)}</span>
      <span class="grow"></span>
      <span class="ago">معاينة</span>
    </div>
    <p class="pv-body" data-post-text><b data-pv-first>${escapeHtml(first)}</b><span data-pv-rest>${
      rest.length === 0 ? '' : escapeHtml('\n' + rest.join('\n'))
    }</span></p>
    <p class="pv-note">تقريبٌ لا محاكاة: السطرُ الأوّل ما يُقرأ أوّلا.
      <b>والطيُّ لا يُرسَم</b> — حدُّه يتبدّل بالجهاز ولم يُقَس، ورقمٌ من
      الذاكرة يجعلك تقصّر نصَّك على وهم.</p>
  </div>`
}

/**
 * لوحُ المراجعة — **ملحوظاتٌ تُقرأ ولا تمنع** (D-090).
 *
 * ولا يظهر إلّا حيث يُفيد: مسوّدةٌ يُبَتّ فيها. **وملحوظةٌ على منشورٍ
 * نُشر عتابٌ لا مراجعة** — فات وقتُ تعديله، ولا يبقى منها إلّا الإزعاج.
 *
 * **ولا شارةَ حمراء**: هذه ملحوظاتُ ذوقٍ لا أخطاءُ نظام. ولونٌ يقول
 * «عطل» على «ما رأيكم؟» يجعل المالكَ يتجاهل اللونَ حين يعني عطلا حقّا.
 */
export function notesPane(d: DraftRow, counted: number, hardLimit: number): string {
  // **والشرطُ هو شرطُ المحرِّر نفسُه**: ملحوظةٌ حيث لا مربّعَ يُحرَّر
  // عتابٌ لا مراجعة. وشرطان متقاربان يفترقان بلا حارس
  if (d.status !== 'draft' && d.status !== 'approved' && d.status !== 'edited') return ''
  // ‏ومقاييسُ الملحوظات (الوسومُ وطولُ الجملة) لم تُضبَط لـ Instagram — فلا تُخترَع لها
  if (d.platform === 'instagram') return ''
  const notes: readonly ReviewNote[] = reviewText(d.text, d.platform, counted, hardLimit)
  if (notes.length === 0) return ''

  return `<details class="notes">
    <summary>${statusBadge('idle', '◍', `${
      notes.length} ملحوظةً على الصياغة`)}
      <span class="ago">تُقرأ ولا تمنع — والقرارُ لك</span></summary>
    <ul class="plain">${notes
      .map(
        (n) => `<li><b>${escapeHtml(n.text)}</b>${
          n.hits.length === 0
            ? ''
            : ` <span class="hit-list">${n.hits
                .map((h) => `<span class="chip">${escapeHtml(h)}</span>`)
                .join(' ')}</span>`
        }</li>`,
      )
      .join('')}</ul>
  </details>`
}

/** موعدٌ بتوقيت المالك، و«بتوقيت الرياض» حين لم تصل منطقتُه (D-201). */
function ownerMoment(at: string, zone: string | null, now: Date): string {
  const date = parseSqliteUtc(at)
  if (date === null) return at
  return `${momentLabel(date, zone, now)}${zoneNote(zone)}`
}

/** شعارُ المنصّة على أرض لونها ‏24px (D-198) — في البطاقة المختصرة والمحرّر. */
export function platformMark(p: string): string {
  return `<span class="pc-logo" data-pf="${escapeHtml(p)}" aria-hidden="true">${LOGOS[p] ?? ''}</span>`
}

/** مَن كتبها — **باسم الخدمة لا بمعرّف النموذج** (D-198)، والمعرّفُ تحت «التفاصيل» في المحرّر وحدَها. */
export function writerName(model: string | null): string {
  if (model === null || model === '') return 'غيرُ مسجَّل'
  if (model === 'owner' || model === 'upload') return 'أنت'
  const m = model.toLowerCase()
  if (m.startsWith('claude')) return 'Claude'
  if (m.startsWith('deepseek')) return 'DeepSeek'
  if (m.startsWith('gemini')) return 'Gemini'
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'GPT'
  if (m.startsWith('plan')) return 'خطّتك من ملفّ'
  return 'نموذجُ الكتابة'
}

/** مَن قرّر — **«أنت» لا «panel:passkey»** (D-198): المعرّفُ كان يُطبع على البطاقة كما هو. */
export function deciderText(by: string | null): string {
  if (by === null) return ''
  if (by === 'panel:passkey') return 'أنت بمفتاح المرور'
  if (by === 'panel:token') return 'أنت بكلمة الإدارة'
  if (by.startsWith('panel')) return 'أنت'
  if (by.startsWith('plan')) return 'أنت باعتماد الخطّة'
  return 'غيرُك'
}

/** أوّلُ كلماتِ المنشور اسمًا لزرّه: «عدّل» على عشر بطاقاتٍ عشرُ وجهاتٍ باسمٍ واحد لقارئ الشاشة. */
function snippet(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= 48 ? flat : `${flat.slice(0, 48)}…`
}

/** رابطُ المحرّر المركّز لمنشور (D-198): يُرسَم على الخادم بجوار القائمة. */
export function editorHref(id: string): string {
  return `/panel?open=${encodeURIComponent(id)}#ed`
}

/**
 * البطاقةُ المختصرة (D-198) — **رأسٌ وثلاثةُ أسطرٍ وفعلٌ واحد، ‏320px أو أقلّ**.
 *
 * كانت البطاقةُ تحمل مربّعَ تحريرٍ باثني عشرَ سطرًا وسببَ الزاوية وشريطَ جدولةٍ ظاهرًا: ‏٥٠٠ إلى ‏٧٠٠px
 * للواحدة، فلا يُرى على الحاسوب غيرُ ثلاث. فصار ظاهرُها ما يُبَتّ به وحدَه (D-195): الشعارُ والحسابُ
 * والحال، والنصُّ في ثلاثة أسطر، وصورةٌ مصغّرةٌ ‏64px، و[اعتمد] [عدّل] [⋯]. **والتحريرُ في المحرّر**
 * (`?open=<id>`)، و«اعتمد» هنا يعتمد المحفوظَ كما هو كـ«اعتمدها كما كُتبت».
 *
 * **والطيّةُ باقيةٌ بما فيها** (المعاينةُ والصورةُ والجدولةُ والكلفة): مرساتا `#s-…` و`#i-…` تفتحانها
 * كما في D-195، فلا يسقط رابطٌ ولا نموذج. والمنشورُ المفتوحُ في المحرّر بلا طيّة: ما فيها هناك،
 * ومعرّفٌ مكرَّرٌ في الصفحة مرساةٌ تنزل إلى غير موضعها.
 */
function card(
  d: DraftRow,
  now: Date,
  targets: readonly Target[],
  earliest: string,
  media: readonly MediaView[],
  pageOnly: readonly string[],
  peaks: Readonly<Record<string, Peaks>>,
  lines: ReadyLines,
  editing: string | null,
  zone: string | null,
): string {
  const spec = specOf(d.platform)
  const st = statusOf(d)
  const open = d.status === 'draft'
  // بطاقةٌ فيها فعلٌ باقٍ ليست منتهية: المعتمَدُ ينتظر موعدا، والمجدولُ
  // ينتظر ساعته، والفاشلُ إعادتَه — والرماديُّ للمرفوض والمنشور وحدهما
  const live = open || d.status === 'approved' || d.status === 'edited' || d.status === 'queued' ||
    d.status === 'failed'
  const here = editing === d.id
  // ‏والمعتمَدةُ بلا موعدٍ نموذجُ جدولتها ظاهرٌ (D-198 · ر-4): الخطوةُ التالية فيها موعد، فلا تُطوى
  const ready = d.status === 'approved' || d.status === 'edited'
  const id = escapeHtml(d.id)

  /*
   * ‏ما تحت النصّ سطرٌ واحد: المجدولةُ والفاشلةُ شريطُهما المختصرُ ظاهرًا (موعدُها و«اسحب الموعد»، أو سببُها
   * ‏و«أعده»)، كما أبقاهما D-195، والمعتمَدةُ نموذجُ جدولتها في الطيّة، والمسوّدةُ سطرُ مصدرها إن تغيّر.
   */
  const line = d.status === 'failed'
    ? `<p class="pc-line" data-tone="bad">${statusBadge('bad', '▲', 'لم يُنشر')}<span>سببُه وزرُّ إعادته في «الموعدُ والتفاصيل».</span></p>`
    : ''
  // ‏وموعدُ المجدولة في سطر الحساب قصيرًا بـ UTC، وبتوقيتك في شريطها تحت الطيّة
  const when = d.status === 'queued' && d.scheduledAt !== null
    ? `موعدُها ${ownerMoment(d.scheduledAt, zone, now)}`
    : relativeTime(d.createdAt, now)

  const thumb = media.find((m) => m.postId === d.id && m.status === 'ready' && !m.mime.startsWith('video/'))
  const pic = thumb === undefined
    ? ''
    : `<img class="pc-thumb" src="/panel/media/${escapeHtml(thumb.id)}" alt="" loading="lazy" width="64" height="64">`

  const more: string[] = []
  if (open) more.push(menuAction({ label: 'ارفض', action: '/panel/drafts/decide', fields: { id: d.id, do: 'reject' }, danger: true }))
  more.push(menuItem({ label: 'رحلةُ المنشور', href: `/panel/journey/${d.id}`, note: 'من الملفّ إلى الأثر' }))

  const meta = [
    d.sourceName === null ? '' : `<span class="chip">${fileName(d.sourceName)}</span>`,
    d.model === null ? '' : `<span class="chip">كتبها ${escapeHtml(writerName(d.model))}</span>`,
    `<span class="chip mono" title="كلفةُ الكتابة — وقد وقعت">${d.cost === 0 ? '—' : money(d.cost)}</span>`,
    /*
     * **وثمنُ النشر غيرُ ثمن الكتابة** — وهذا هو الذي يبتّ فيه المالك. ورابطٌ على X ثلاثةَ عشرَ
     * ضعفا (D-003 · D-069): يُعلَّم تحذيرا ليُرى قبل النقر لا بعده.
     */
    d.publishCost === 0
      ? ''
      : statusBadge(d.publishCost >= 0.1 ? 'warn' : '', d.publishCost >= 0.1 ? '!' : '●',
          `نشرُها ${money(d.publishCost)}${d.publishCost >= 0.1 ? ' — فيها رابط' : ''}`),
    d.approvedBy === null ? '' : `<span class="chip">${d.status === 'rejected' ? 'رفضها' : 'اعتمدها'} ${escapeHtml(deciderText(d.approvedBy))}</span>`,
  ].filter((x) => x !== '').join('')

  return `<div class="card draft pc${live ? '' : ' done'}" id="d-${id}" data-draft="${id}"${here ? ' aria-current="true"' : ''}
    data-status="${escapeHtml(bucketOf(d))}" data-platform="${escapeHtml(d.platform)}"
    data-created="${Date.parse(d.createdAt.replace(' ', 'T') + 'Z') || 0}" data-cost="${d.publishCost}">
    <div class="draft-top">
      ${open
        ? `<label class="pick" title="حدّدها للاعتماد الجماعيّ">
             <input type="checkbox" form="bulk" name="id" value="${id}"
               data-pick data-cost="${d.publishCost}"
               aria-label="حدّد هذه المسوّدة للاعتماد الجماعيّ">
           </label>`
        : ''}
      ${platformMark(d.platform)}
      <div class="pc-who"><b><bdi>${escapeHtml(d.accountName ?? spec.label)}</bdi></b><span class="pc-when">${
        d.accountName === null ? '' : `${escapeHtml(spec.label)} · `}<bdi>${escapeHtml(when)}</bdi></span></div>
      ${statusBadge(st.cls, st.glyph, escapeHtml(st.text))}
    </div>
    <div class="pc-body"><p class="pc-text" dir="auto" data-post-text>${escapeHtml(d.text.replace(/\s*\n\s*/g, ' '))}</p>${pic}</div>
    ${line}
    ${d.status === 'queued' && d.dispatchedAt === null ? quickMove(d.id) : ''}
    ${ready ? scheduler(d, targets, earliest, now, pageOnly, peaks[d.platform], media, zone) : ''}
    <div class="pc-foot">
      ${open
        ? `<form class="inline" method="POST" action="/panel/drafts/decide" data-busy="جارٍ…">
             <input type="hidden" name="id" value="${id}">
             <button class="btn btn-primary btn-sm" type="submit" name="do" value="approve">اعتمد</button></form>`
        : ''}
      <a class="btn btn-secondary btn-sm" href="${escapeHtml(editorHref(d.id))}" data-edit
        aria-label="${escapeHtml(`${open ? 'عدّل' : 'افتح'}: ${snippet(d.text)} (${specOf(d.platform).label}، ${relativeTime(d.createdAt, now)})`)}">${open ? 'عدّل' : 'افتح'}</a>
      <span class="grow"></span>
      ${d.stale && open
        // ‏والمصدرُ الذي تغيّر بعدها مكانَ العدّاد: سطرٌ مستقلٌّ كان يمدّ البطاقةَ فوق ‏320px على الهاتف
        ? statusBadge('warn', '▲', 'المصدر تغيّر بعدها')
        : `<span class="draft-len"><b>${lengthOf(d)}</b> / ${spec.hardLimit}</span>`}
      ${menu({ label: 'أفعالٌ أخرى', variant: 'icon', size: 'sm', icon: ICON.more, items: more })}
    </div>
    ${here
      ? '<p class="pc-line"><span class="ago">مفتوحةٌ في المحرّر بجوارها.</span></p>'
      : `<details class="draft-more"><summary>${open ? 'المعاينةُ والصورةُ والموعد' : 'الموعدُ والصورةُ والتفاصيل'}</summary>
      ${open ? preview(d, spec.label) : ''}
      ${editDiff(d)}
      ${imagePane(d, media, lines)}
      ${ready ? '' : scheduler(d, targets, earliest, now, pageOnly, peaks[d.platform], media, zone)}
      <div class="draft-meta">${meta}</div>
    </details>`}
  </div>`
}

/** حسابٌ مربوطٌ يصلح وجهةً — والقائمةُ تُبنى من القنوات لا من ثابت. */
export interface Target {
  readonly id: string
  readonly platform: PublishPlatform
  readonly label: string
}

/** صورةٌ مولَّدة كما تُعرض — بلا بايتات، فالبايتاتُ خلف `/panel/media/:id`. */
export interface MediaView {
  readonly id: string
  readonly postId: string
  readonly mime: string
  readonly bytes: number
  /** الوصفُ الذي وُلّدت به — **ومَن لا يعرفه لا يُحسِّن** (D-070). */
  readonly prompt: string
  readonly cost: number
  readonly status: 'ready' | 'rejected'
  /**
   * ما قيل عن الشريحة يومَ وُلّدت (D-162): `null` لم يُسجَّل · `''` رُكّب
   * النصّ · نصٌّ سببُ السقوط.
   *
   * **وإلزاميّان ولو `null`**: حقلٌ اختياريٌّ يُنسى في الربط فيصمت السطرُ
   * تحت كلّ صورة، ولا يعلم أحد.
   */
  readonly note: string | null
  readonly headline: string | null
  /** `infographic:<شكل>` للإنفوجرافيك (D-174)، واسمُ النموذج للصورة الفنّيّة. */
  readonly model: string
  /** الأبعادُ يومَ التوليد — و`null` لصفٍّ أقدمَ من ‏0029. */
  readonly width: number | null
  readonly height: number | null
}

export interface DraftsInput {
  readonly drafts: readonly DraftRow[]
  readonly media: readonly MediaView[]
  /** الوجهاتُ الحيّة: مربوطةٌ وإذنُها قائم. */
  readonly targets: readonly Target[]
  /** «الآن» بصيغة نموذج datetime-local — أدنى موعدٍ يُقبل. */
  readonly earliest: string
  /** مصادرُ محلَّلةٌ يمكن أن تُكتب منها — بلا خلاصةٍ لا مادّة. */
  readonly writable: readonly { id: string; name: string }[]
  readonly now: Date
  /** أمزوّدُ مهمّة `draft` جاهز؟ زرٌّ لا ينادي أحدا لا يُعرض عاملا. */
  readonly ready: boolean
  /**
   * حاجزُ الكتابة المدفوعة وسببُه وموضعُ إصلاحه (`writeBlock` في `lib/home.ts`) —
   * فيُعطَّل الزرُّ والسببُ تحته، لا زرٌّ يُضغَط فيُردّ إلى رأس اللوح (ر-10).
   */
  readonly blocked?: { readonly text: string; readonly label: string; readonly href: string } | null
  /**
   * منصّاتٌ حساباتُها الحيّةُ **صفحاتٌ لا أشخاص** (D-087).
   *
   * ولولا هذا لقيل «لا قناةَ مربوطة» وهي مربوطة — **وذاك كذبٌ يُرسل
   * المالكَ يربط ما هو مربوط**. فيُقال السببُ الحقيقيّ: الصفحةُ مربوطةٌ،
   * والنشرُ باسمها لم يُبنَ.
   */
  readonly pageOnly: readonly string[]
  /**
   * ساعاتُ الذروة لكلّ منصّة (D-106) — **أو صمتٌ يقول لماذا**.
   *
   * ولا تُمرَّر مصفوفةً واحدة: **جمهورُ LinkedIn في ساعات العمل وجمهورُ
   * X ليلا**، وخلطُهما يعطي وسطا لا يصف أيّا منهما.
   *
   * **وإلزاميّةٌ ولو فارغة**: حقلٌ اختياريٌّ يُنسى في مسارٍ جديد فيصمت
   * الاقتراحُ بلا أن يعلم أحد. **وخريطةٌ فارغةٌ تُكتب صراحةً قرارٌ يُقرأ.**
   */
  readonly peaks: Readonly<Record<string, Peaks>>
  /**
   * نقاطُ الجاهزيّة تحت زرَّي الصورة والمقطع (D-163) — **محسوبةً مرّةً
   * للّوح** من حكم الدوالّ التي تحكم عند الضغط.
   *
   * **وإلزاميّةٌ** على سابقة `peaks`: حقلٌ اختياريٌّ يُنسى في مسارٍ جديد
   * فيعود الزرُّ يُضغَط ليُقال بعد الدفع ما كان يُعرَف قبله.
   */
  readonly mediaReady: MediaReady
  /**
   * حالُ ربط كلّ منصّة (D-190) — فيُقال تحت LinkedIn وX في «اكتب من فكرتك» أمتّصلةٌ هي،
   * ويُترك غيرُ المتّصل بلا تأشير. واختياريّ: الغائبُ «لا يُعرف» فلا يُقال شيء.
   */
  readonly links?: Readonly<Record<string, LinkState>>
  /** منطقةُ المالك من كعكته (D-173): موعدُ المجدولة على بطاقتها بتوقيته. */
  readonly zone?: string | null
  /** معرّفُ المنشور المفتوح في المحرّر المركّز (D-198) — بطاقتُه بلا طيّة، وما فيها هناك. */
  readonly editing?: string | null
}

/** المنصّاتُ التي تُكتب لها مسوّدةٌ من فكرة — **المكتوبةُ وحدَها**: نصُّ المقطع له صفُّ المقطع. */
const IDEA_PLATFORMS = ['linkedin', 'x'] as const

/**
 * «اكتب من فكرتك» (D-190) — **جملةٌ أو كلماتٌ قليلة ← مسوّدةٌ لكلّ منصّةٍ تختارها**.
 *
 * قال المالك: «يُفترض أن تكون الكتابةُ أسهل، وتنشأ من نصٍّ أو كلماتٍ بسيطة». وكانت لا تبدأ
 * إلّا من مستندٍ في Drive حُلّل، بمنصّةٍ واحدةٍ في كلّ ضغطة. فهنا حقلٌ واحدٌ ومربّعٌ لكلّ
 * منصّةٍ مكتوبة، **ونداءٌ لكلّ منصّةٍ مختارة** بوصفها وحدّها (`draftFromIdea`)، والكلفةُ
 * قبل المسوّدة. والزرُّ معطَّلٌ وسببُه تحته حين لا يُكتب الآن — بحكم النداء نفسِه.
 */
function ideaCard(input: DraftsInput): string {
  const blocked = input.blocked ?? null
  const why = blocked !== null
    ? { text: blocked.text, label: blocked.label, href: blocked.href }
    : input.ready
      ? null
      : { text: 'مزوّدُ مهمّة الكتابة غير جاهز.', label: 'افتح المزوّدين', href: '#providers' }
  const boxes = IDEA_PLATFORMS.map((p) => {
    const link = input.links?.[p]
    // ‏غيرُ المتّصل لا يُؤشَّر: تُكتب مسوّدتُه إن اختاره، ولا تُجدوَل حتّى يربطه
    const checked = link === undefined || link === 'linked'
    return `<label class="vpf">
        <input type="checkbox" name="platform" value="${p}"${checked ? ' checked' : ''}>
        <span class="vpf-b"><b>${escapeHtml(PLATFORMS[p].label)}</b>
          ${link === undefined ? '' : linkLine(p, link, PRIVATE_ONLY)}
          <span class="ago">${p === 'x'
            ? `فكرةٌ واحدةٌ في ${PLATFORMS.x.hardLimit} محرفًا`
            : `فقراتٌ قصيرةٌ حتّى ${PLATFORMS.linkedin.hardLimit} محرف`}</span></span>
      </label>`
  }).join('')
  return `<div class="card mt-3" id="idea">
    <div class="card-head"><h2>اكتب من فكرتك</h2></div>
    <p class="hint">جملةٌ أو كلماتٌ قليلة، ونكتب منها لكلّ منصّةٍ مسوّدتَها بطولها ونبرتها.
      <b>وتقرؤها وتعتمدها أنت</b> — لا يُنشر شيءٌ قبل ذلك.</p>
    <form method="POST" action="/panel/drafts/idea" data-busy="جارٍ كتابة المسوّدات…">
      ${field({
        id: 'di-text',
        label: 'فكرتك أو كلماتك',
        hint: 'مثل: «الحوكمةُ لا تبطئ القرار، تحميه» — أو كلماتٌ متفرّقة: «قيادة، ثقة، أوّل مئة يوم».',
        control: `<textarea name="idea" rows="3" required maxlength="${IDEA_MAX}"></textarea>`,
      })}
      <div class="vpfs mt-3" role="group" aria-label="اكتب لـ">${boxes}</div>
      ${pickLine('تُكتب مسوّدتُها ولا تُجدوَل')}
      <div class="row">
        <span class="ago">نداءٌ لكلّ منصّةٍ تختارها، وكلفتُه تُسجَّل قبل أن تُكتب المسوّدة.</span>
        <span class="grow"></span>
        ${button({
          label: 'اكتب المسوّدات',
          variant: 'primary',
          type: 'submit',
          ...(why === null ? {} : { disabled: { id: 'di-why', reason: why.text } }),
        })}
      </div>
      ${why === null ? '' : `<a class="tap" href="${escapeHtml(why.href)}">${escapeHtml(why.label)}</a>`}
    </form>
  </div>`
}

/**
 * اللوحُ قسمان (D-195): **المسوّداتُ** (ما ينتظر قرارك والتوزيعُ والفرز) و**الكتابة** (من فكرةٍ ومن مصدر)
 * — يُرسَم كلٌّ في تبويبه من تبويبات «المنشورات». و`draftsSection` يجمعهما كما كان لمن يريد اللوحَ كلَّه.
 */
export function draftsSection(input: DraftsInput): string {
  const parts = draftsParts(input)
  return `${parts.list}\n\n  ${parts.write}`
}

export function draftsParts(input: DraftsInput): { readonly list: string; readonly write: string } {
  const { drafts, writable, now } = input
  const waiting = drafts.filter((d) => d.status === 'draft').length
  const blocked = input.blocked ?? null

  // نموذجُ الكتابة: مصدرٌ ومنصّة، ونداءٌ واحد لكلٍّ. ولا كتابةَ آليّة —
  // الإنفاقُ يبدأ بضغطةٍ من المالك لا بدورةِ ساعة
  const writer =
    writable.length === 0
      ? emptyState({
          title: 'لا مصدر جاهزا للكتابة',
          html: `الكتابةُ تنطلق من خلاصةِ تحليلٍ لا من المستند نفسه.
              حلّل مصدرا أوّلا ثمّ عد.`,
          action: '<a class="btn btn-secondary btn-sm" href="#sources">اذهب إلى المصادر</a>',
        })
      : `<form class="row" method="POST" action="/panel/drafts/write" data-busy="جارٍ الكتابة…">
           <div class="field"><label for="dw-src">المصدر</label>
             <select id="dw-src" name="id">${writable
               .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
               .join('')}</select></div>
           <div class="field"><label for="dw-pf">المنصّة</label>
             <select id="dw-pf" name="platform">${(
               Object.values(PLATFORMS) as PlatformSpec[]
             )
               .map(
                 (spec) =>
                   // ‏ومنصّةُ المقطع تقول ذلك قبل أن يُدفَع ثمنُ الكتابة: نصُّها وصفٌ لا يُنشَر وحدَه
                   `<option value="${escapeHtml(spec.id)}">${escapeHtml(spec.label)} — ${CLIP_PLATFORMS.has(spec.id)
                     ? 'وصفُ مقطع (يحتاج مقطعًا)' : `حتّى ${spec.hardLimit} محرفا`}</option>`,
               )
               .join('')}</select></div>
           <div class="grow"></div>
           <button class="btn btn-primary" type="submit"${input.ready && blocked === null ? '' : ' disabled'}${
             blocked === null ? '' : ' aria-describedby="dw-why"'}>اكتب مسوّدة</button>
         </form>
         ${blocked !== null
           ? `<p class="hint m-0 mt-2" id="dw-why">${escapeHtml(blocked.text)}
                <a class="tap" href="${escapeHtml(blocked.href)}">${escapeHtml(blocked.label)}</a></p>`
           : input.ready
             ? ''
             : '<p class="hint m-0 mt-2">مزوّدُ مهمّة الكتابة غير جاهز — اضبط مفتاحه في «المزوّدون».</p>'}`

  /*
   * لوحُ الاختصارات — **ولا يُعرض إلّا حيث تعمل**.
   *
   * الاختصاراتُ مربوطةٌ ببطاقات المسوّدات، فلوحٌ يُعلنها في شاشةٍ لا
   * مسوّدةَ فيها **يَعِد بما لا يقع**. وهو مخفيٌّ في الوثيقة ويُظهره
   * السكربتُ — لأنّها كلَّها لا تعمل بدونه.
   */
  const keys = `<details class="card card-inset keys" id="keys" hidden>
    <summary>اختصاراتُ لوحة المفاتيح <span class="grow"></span><kbd>?</kbd></summary>
    <div class="rows">
      <span class="row-k"><kbd>J</kbd><kbd>K</kbd> التنقّل</span>
      <span class="row-k"><kbd>A</kbd> اعتمد</span>
      <span class="row-k"><kbd>R</kbd> ارفض</span>
      <span class="row-k"><kbd>E</kbd> افتحها في المحرّر</span>
      <span class="row-k"><kbd>S</kbd> الجدولة</span>
      <span class="row-k"><kbd>?</kbd> هذا اللوح</span>
    </div>
    <p class="hint m-0 keys-hint">
      <b>وتُقاس بموضع المفتاح لا بحرفه</b> — فتعمل بالتخطيط العربيّ كما
      تعمل بالإنجليزيّ. ولا تعمل وأنت داخل مربّع كتابة.</p>
  </details>`

  // سطرا الجاهزيّة يُبنيان هنا مرّةً، والبطاقاتُ تأخذهما نصًّا (D-163)
  const lines = readyLines(input.mediaReady)
  const cards =
    drafts.length === 0
      ? emptyState({
          title: 'لا مسوّدات بعد',
          html: 'اكتب واحدةً من فكرتك أو من مصدرٍ محلَّل، وستظهر هنا لتقرأها وتقرّر.',
          action: button({ label: 'اكتب من فكرتك', variant: 'primary', size: 'sm', href: '#idea' }),
        })
      : `<div class="dcols">${drafts
          .map((d) =>
            card(d, now, input.targets, input.earliest, input.media, input.pageOnly, input.peaks, lines, input.editing ?? null, input.zone ?? null))
          .join('')}</div>`

  /*
   * شريطُ البَتِّ الجماعيّ — **ونموذجُه خارج البطاقات لا فيها**.
   *
   * صناديقُ التحديد موزّعةٌ على بطاقاتٍ فيها نماذجُ اعتمادٍ مستقلّة،
   * **ونموذجٌ داخل نموذجٍ لا يصحّ في HTML** — يتجاهله المتصفّح صامتا.
   * فالسمةُ `form="bulk"` تربط الصندوقَ بنموذجٍ في مكانٍ آخر من الوثيقة،
   * وهي القياسيّةُ لهذا بعينه.
   *
   * **والشريطُ يبقى ملتصقا بأسفل الشاشة**: من يحدّد خمسا وهو في آخر
   * القائمة لا يُطلَب منه أن يصعد ليضغط.
   *
   * وبلا JavaScript يبقى مخفيّا: العدّادُ والكلفةُ يُحسبان في المتصفّح،
   * **وشريطٌ يقول «٠ محدَّدة» أبدا زينةٌ تشغل مكانا**.
   */
  const bulk = `<form id="bulk" class="bulkbar" method="POST"
      action="/panel/drafts/approve-many" data-busy="جارٍ الاعتماد…" hidden>
    ${statusBadge('ok', '●', `<b data-bulk-n>0</b> محدَّدة`)}
    <span class="ago" data-bulk-cost></span>
    <span class="grow"></span>
    <button type="button" class="btn btn-secondary btn-sm" data-bulk-clear>ألغِ التحديد</button>
    <button class="btn btn-primary btn-sm" type="submit">اعتمدها كما كُتبت</button>
  </form>`

  /*
   * **الترتيبُ بالقرار لا بالتدفّق** (D-156). كان اللوحُ يبدأ ببطاقة الكتابة
   * من مصدر، وما ينتظر قرارَ المالك تحتها بـ‏١٦٦٥px عند ‏١٤٤٠×‏٩٠٠ (التدقيقُ
   * الثالث). السؤالُ الذي يُفتَح له اللوح «ما الذي ينتظرني؟»، فجوابُه أوّلًا:
   * المسوّداتُ المنتظرة، ثمّ التوزيعُ إن كان له ما يُوزَّع، ثمّ الكتابةُ من
   * مصدر، والخطّةُ بعدها في اللوح.
   */
  /*
   * ‏**والفرزُ أوّلًا تحت تبويبات القسم، قبل أيّ نموذج** (D-199): كان «وزّع المعتمَد» نموذجًا كاملًا يتصدّر
   * ‏القائمة وتبويباتُ الفرز تحته. فصار السطرُ: العنوانُ وعددُ ما ينتظر و«؟» تحمل جملةَ القيد، ثمّ الفرز،
   * ‏ثمّ التوزيعُ سطرًا مطويًّا، ثمّ البطاقات.
   */
  const list = `${bulk}
  <div class="lede-row">
    <h3 class="sec bare">المسوّدات</h3>
    ${statusBadge(waiting === 0 ? 'idle' : 'warn', waiting === 0 ? '○' : '!', `${waiting} تنتظر قرارك`)}
    <span class="grow"></span>
    <details class="why-tip"><summary aria-label="لماذا الاعتماد؟">؟</summary>
      <p class="hint m-0">الاعتمادُ يفتح بابَ الطابور ولا يعبره: <b>لا يُنشر منشورٌ بلا موافقةٍ مسجّلة</b>، والقيدُ في القاعدة لا في هذه الصفحة.</p>
    </details>
  </div>
  ${filterTabs(drafts)}
  ${spreadBar(input)}
  ${keys}
  ${cards}
  ${emptyState({ id: 'draft-none', hidden: true, title: 'لا مسوّدةَ في هذا الفرز', html: 'غيّر التبويبَ أعلاه، أو اختر «الكلّ».' })}`

  const write = `${ideaCard(input)}

  <div class="card mt-3" id="write">
    <div class="card-head"><h2>الكتابة من مصدر</h2></div>
    <p class="hint">نداءٌ واحدٌ لكلّ ضغطة، وكلفتُه تُسجَّل قبل أن تُكتب المسوّدة.
      <b>ولا كتابةَ آليّة</b> — الإنفاق يبدأ بقرارك لا بدورةِ ساعة.</p>
    ${writer}
  </div>`
  return { list, write }
}

/**
 * شريطُ التوزيع — **ولا يظهر إلّا حيث يعمل** (D-089).
 *
 * معتمَدةٌ واحدةٌ تُجدوَل من بطاقتها في ضغطتين. **والتوزيعُ يُوجد
 * لاثنتين فصاعدا**، فزرٌّ يظهر على واحدةٍ يزحم الصفحةَ بلا أن يوفّر شيئا.
 *
 * وشرطُ الوجهة معه: معتمَدةٌ بلا قناةٍ لمنصّتها لا تُوزَّع أصلا — **وزرٌّ
 * يفتح شاشةً تقول «لا شيءَ يُوزَّع» وعدٌ يُخلَف**.
 */
function spreadBar(input: DraftsInput): string {
  const ready = input.drafts.filter(
    (d) =>
      (d.status === 'approved' || d.status === 'edited') &&
      input.targets.some((t) => t.platform === d.platform) &&
      missingMedia(d.platform, readyMimes(d, input.media)) === null,
  ).length
  if (ready < 2) return ''

  /*
   * ‏**سطرٌ هادئٌ لا نموذجٌ يتصدّر القائمة** (D-199): «2 جاهزةٌ للتوزيع · وزّعها» طيّةٌ مغلقة، وتحتها
   * ‏أوّلُ موعدٍ بأزرارٍ يحسبها الخادمُ بتوقيت المالك (`whenField` المحرّر نفسُه) والفاصل. فلا حقلَ
   * ‏‹mm/dd/yyyy› ولا UTC في أوّل ما يراه، ويُعرَض الجدولُ كاملًا قبل أن يقع منه شيء كما كان.
   */
  return `<details class="card card-inset spread" id="spread">
    <summary>${statusBadge('ok', '●', `${ready} جاهزةٌ للتوزيع`)}<span class="grow"></span><span class="btn btn-secondary btn-sm spread-go">وزّعها</span></summary>
    <form id="spread-form" class="spread-form" method="POST" action="/panel/drafts/spread">
      ${whenField('spread-form', input.zone ?? null, input.now, undefined, 'أوّلُ موعد')}
      <div class="row">
        <div class="field"><label for="sp-gap">بين كلِّ اثنتين (ساعة)</label>
          <input id="sp-gap" name="gap" type="number" inputmode="numeric"
            min="1" max="168" value="24" required></div>
        <span class="grow"></span>
        <button class="btn btn-primary" type="submit">اعرض الجدول</button>
      </div>
      <p class="hint m-0">يُعرَض الجدولُ كاملًا قبل أن يقع منه شيء.</p>
    </form>
  </details>`
}
