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
import { ceilingOf, reviewText, type ReviewNote } from '../../../lib/draft/review'
import { PLATFORMS, type Platform, type PlatformSpec } from '../../../lib/draft/prompt'
import { escapeHtml } from '../escape'
import { whenTag } from '../time'
import type { Peaks } from '../../../lib/schedule/peak'
import { kb, money, relativeTime } from '../../../lib/format'
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
import { RUNG_MARK, status } from '../parts'
import { OVERLAY_OFF, SLIDE_SIZE } from '../../../lib/image/slide'
import type { MediaLine, MediaReady } from '../../../lib/media/readiness'

const STATUS: Readonly<Record<string, { cls: string; glyph: string; text: string }>> = {
  draft: { cls: 'idle', glyph: '○', text: 'تنتظر قرارك' },
  approved: { cls: 'ok', glyph: '●', text: 'معتمَدة' },
  edited: { cls: 'ok', glyph: '●', text: 'معتمَدة بعد تعديل' },
  rejected: { cls: 'bad', glyph: '✕', text: 'مرفوضة' },
  queued: { cls: 'warn', glyph: '◔', text: 'مجدولة' },
  published: { cls: 'ok', glyph: '✓', text: 'نُشرت' },
  failed: { cls: 'bad', glyph: '▲', text: 'فشل النشر' },
}

/** أسطرُ المربّع — لكلّ منصّةٍ قدرُ نصّها، فلا فائضٌ ولا فراغ. */
const LINES: Readonly<Record<string, number>> = {
  linkedin: 12, x: 6, tiktok: 5, youtube: 8,
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
): string {
  const approved = d.status === 'approved' || d.status === 'edited'

  if (d.status === 'queued') {
    const gone = d.dispatchedAt !== null
    return `<div class="sched ${gone ? 'gone' : 'set'}">
      ${status(gone ? 'warn' : 'ok', gone ? '↑' : '◔', gone ? 'غادرت إلى الطابور' : 'مجدولة')}
      <span class="when mono">${whenTag(d.scheduledAt)}</span>
      ${d.accountName === null ? '' : `<span class="chip">${escapeHtml(d.accountName)}</span>`}
      <span class="grow"></span>
      ${gone
        ? '<span class="ago">ولا تُستردّ من هناك</span>'
        : `<form class="inline" method="POST" action="/panel/drafts/unschedule"
             data-confirm="سحبُ الموعد يعيدها معتمَدةً بلا موعد. أتمضي؟" data-busy="جارٍ…">
             <input type="hidden" name="id" value="${escapeHtml(d.id)}">
             <button class="g sm" type="submit">اسحب الموعد</button></form>`}
    </div>`
  }

  if (!approved) return ''

  const fit = targets.filter((t) => t.platform === d.platform)
  if (fit.length === 0) {
    // **والسببُ يُقال كما هو**: «لا قناة» حيث القناةُ مربوطةٌ صفحةً كذبٌ
    // يرسل المالكَ يربط ما هو مربوط
    if (pageOnly.includes(d.platform)) {
      return `<div class="sched none">
        ${status('warn', '!', `الصفحةُ مربوطة — والنشرُ باسمها لم يُبنَ`)}
        <span class="ago">اعتُمد النصّ ويبقى. واربط <b>حسابَك الشخصيّ</b> لتنشر الآن،
          أو انتظر موافقةَ <span class="mono">Community Management API</span> (M-03).</span>
        <span class="grow"></span>
        <a class="btn g sm" href="/panel/tasks">ما عليك</a>
      </div>`
    }
    return `<div class="sched none">
      ${status('warn', '!', `لا قناةَ ${escapeHtml(PLATFORMS[d.platform].label)} مربوطة`)}
      <span class="ago">اعتُمد النصّ، ويبقى حتّى تُربَط قناتُه — ولا يضيع.</span>
      <span class="grow"></span>
      <a class="btn g sm" href="#channels">اربط قناة</a>
    </div>`
  }

  const id = d.id.slice(0, 8)
  return `<form class="sched" method="POST" action="/panel/drafts/schedule" data-busy="جارٍ…">
    <input type="hidden" name="id" value="${escapeHtml(d.id)}">
    <div class="field"><label for="ac-${id}">الحساب</label>
      <select id="ac-${id}" name="account">${fit
        .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`)
        .join('')}</select></div>
    <div class="field"><label for="wh-${id}">الموعد (UTC)</label>
      <input id="wh-${id}" name="when" type="datetime-local" data-when
        min="${escapeHtml(earliest)}" required></div>
    <span class="grow"></span>
    <button class="p sm" type="submit">جدوِل</button>
    <div class="quick" data-quick="wh-${id}">
      ${QUICK.map(
        (q) =>
          `<button class="g sm" type="button" data-preset="${q.kind}">${escapeHtml(q.label)}</button>`,
      ).join('')}
      <span class="grow"></span>
      <span class="mirror mono" data-mirror="wh-${id}"></span>
    </div>
    ${peakLine(peaks)}
  </form>`
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
function peakLine(peaks: Peaks | undefined): string {
  if (peaks === undefined) return ''
  if (peaks.hours.length === 0) {
    return peaks.why === null
      ? ''
      : `<p class="hint peak"><b>لا اقتراحَ للموعد</b> — ${escapeHtml(peaks.why)}.
           <span class="ago">واقتراحٌ لم يُقَس أسوأُ من حقلٍ خامّ.</span></p>`
  }
  const said = peaks.hours
    .map((h) => `<span class="chip mono" title="وسيطُ التفاعل ${h.median} في ${h.posts} منشورات"
      >${String(h.hour).padStart(2, '0')}:00</span>`)
    .join('')
  return `<p class="hint peak"><b>أعلى تفاعلٍ قِيس</b> عند ${said}
    <span class="ago">بـ UTC · من ${peaks.samples} منشوراتٍ نُشرت وقِيست — خبرٌ لا أمر.</span></p>`
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
        ${status('ok', '●', `إنفوجرافيك${kind === '' ? '' : ` · ${escapeHtml(kind)}`}`)}
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
           ${status('ok', '●', 'على الصورة')}
           <span class="ago">«${escapeHtml(m.headline)}»</span>
         </div>`
  }
  const off = m.note.endsWith(OVERLAY_OFF)
  const offered = m.headline === null ? '' : ` — والعنوانُ المقترح «${escapeHtml(m.headline)}»`
  return `<div class="pic-foot">
      ${off ? status('idle', '○', 'بلا نصٍّ فوقها') : status('warn', '!', 'بلا نصٍّ فوقها')}
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
function imagePane(d: DraftRow, media: readonly MediaView[], lines: ReadyLines): string {
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
        ${status('ok', '●', 'مقطعُك كما رفعتَه')}
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
    const w = ready.width ?? SLIDE_SIZE[d.platform].width
    const h = ready.height ?? SLIDE_SIZE[d.platform].height
    const regen = (style: 'infographic' | 'illustration', label: string, blocked: boolean): string =>
      `<form class="inline" method="POST" action="/panel/media/regenerate" data-busy="جارٍ التوليد…">
         <input type="hidden" name="id" value="${escapeHtml(d.id)}">
         <input type="hidden" name="media" value="${escapeHtml(ready.id)}">
         <input type="hidden" name="style" value="${style}">
         <button class="g sm" type="submit"${blocked ? ' disabled' : ''}
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
               <button class="g sm" type="submit"${lines.videoBlocked ? ' disabled' : ''}>حرّكها فيديو</button></form>`
              : ''}
             ${info
               ? `${regen('infographic', 'ولّد إنفوجرافيك بديلًا', lines.infoBlocked)}${regen('illustration', 'بدّلها صورةً فنّيّة', lines.imageBlocked)}`
               : `${regen('illustration', 'ولّد صورةً بديلة', lines.imageBlocked)}${regen('infographic', 'بدّلها إنفوجرافيك', lines.infoBlocked)}`}
             <form class="inline" method="POST" action="/panel/media/reject" data-busy="جارٍ…">
               <input type="hidden" name="id" value="${escapeHtml(ready.id)}">
               <button class="g sm" type="submit">ارفض الصورة</button></form>`
          : ''}
      </div>
      ${slideLine(ready)}
      ${open && clip === undefined ? lines.video : ''}
      ${clip === undefined
        ? ''
        : `<div class="pic-foot">
             ${status('ok', '●', `مقطعٌ رأسيّ 15ث`)}
             <span class="chip mono">${kb(clip.bytes)}</span>
             <span class="ago">يصلح لـ Shorts و Reels و TikTok — وهي كلُّها رأسيّة.</span>
           </div>`}
    </div>`
  }

  const rejected = mine.filter((m) => m.status === 'rejected').length
  if (!open) return ''

  return `<div class="pic none">
    ${status('idle', '○', `${
      rejected === 0 ? 'بلا صورة' : `رُفضت ${rejected} — وتبقى في الدفتر`}`)}
    <span class="ago">${INFO_CAPTION}</span>
    <span class="grow"></span>
    <form class="inline" method="POST" action="/panel/media/generate" data-busy="جارٍ الرسم…">
      <input type="hidden" name="id" value="${escapeHtml(d.id)}">
      <input type="hidden" name="style" value="infographic">
      <button class="p sm" type="submit"${lines.infoBlocked ? ' disabled' : ''}>ولّد إنفوجرافيك</button></form>
    ${lines.info}
    <details class="art">
      <summary>أو صورةٌ فنّيّة</summary>
      <div class="art-row">
        <span class="ago">${lines.caption}</span>
        <form class="inline" method="POST" action="/panel/media/generate" data-busy="جارٍ التوليد…">
          <input type="hidden" name="id" value="${escapeHtml(d.id)}">
          <input type="hidden" name="style" value="illustration">
          <button class="g sm" type="submit"${lines.imageBlocked ? ' disabled' : ''}>ولّد صورةً فنّيّة</button></form>
        ${lines.image}
      </div>
    </details>
  </div>`
}

/** ما يُبنى مرّةً للّوح كلِّه — والبطاقاتُ تأخذه ولا تحسبه. */
interface ReadyLines {
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
      return status(mark.cls, mark.g, escapeHtml(dot.title),
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
function readyLines(ready: MediaReady): ReadyLines {
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
 * سِلالُ الفرز — **خمسٌ لا سبع**.
 *
 * `approved` و `edited` حالان في القاعدة **وسؤالٌ واحدٌ عند المالك**:
 * «اعتُمدت، وتنتظر موعدا». والفرقُ بينهما (أعُدّلت قبل الاعتماد؟) يُقرأ
 * على البطاقة، **ولا يستحقّ تبويبا يقسم القائمة نصفين بلا سبب**.
 *
 * وكذلك `failed` مع `published`: كلتاهما «غادرت»، والفشلُ يُرى بشارته.
 */
function bucketOf(d: DraftRow): string {
  if (d.status === 'draft') return 'waiting'
  if (d.status === 'approved' || d.status === 'edited') return 'approved'
  if (d.status === 'queued') return 'queued'
  if (d.status === 'rejected') return 'rejected'
  return 'gone'
}

const BUCKETS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'all', label: 'الكلّ' },
  { id: 'waiting', label: 'تنتظر قرارك' },
  { id: 'approved', label: 'معتمَدة' },
  { id: 'queued', label: 'مجدولة' },
  { id: 'gone', label: 'غادرت' },
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
    return `<button type="button" class="ftab${b.id === 'all' ? ' on' : ''}"
      data-bucket="${b.id}" aria-pressed="${b.id === 'all'}"
      >${escapeHtml(b.label)}<span class="count">${n}</span></button>`
  }).join('')
  /*
   * **وفرزٌ ثانٍ بالمنصّة، وترتيب** (D-127) — بشرطَي D-062 نفسيهما:
   * العددُ معروضٌ ولو صفرًا، والافتراضُ «الكلّ» والأحدثُ أوّلًا. والمنصّاتُ
   * من المسوّدات نفسِها لا من قائمةٍ ثابتة: منصّةٌ بلا مسوّدةٍ لا تبويبَ لها.
   * **وبلا JavaScript لا يظهر شيءٌ من هذا** — والقائمةُ كاملةٌ كما هي.
   */
  const platforms = [...new Set(drafts.map((d) => d.platform))]
  const ptabs = [
    `<button type="button" class="ftab on" data-platform-tab="all" aria-pressed="true">كلُّ المنصّات<span class="count">${drafts.length}</span></button>`,
    ...platforms.map((p) => `<button type="button" class="ftab" data-platform-tab="${escapeHtml(p)}" aria-pressed="false"
      >${escapeHtml(platformLabel(p))}<span class="count">${drafts.filter((d) => d.platform === p).length}</span></button>`),
  ].join('')
  const order = `<label class="order"><span class="sub">الترتيب</span>
    <select id="draft-order" aria-label="ترتيبُ المسوّدات">
      <option value="new" selected>الأحدث أوّلًا</option>
      <option value="old">الأقدم أوّلًا</option>
      <option value="cost">الأغلى نشرًا أوّلًا</option>
    </select></label>`
  return `<nav class="ftabs" id="draft-filter" aria-label="فرزُ المسوّدات" hidden>${tabs}</nav>
  <nav class="ftabs ftabs-2" id="draft-platform" aria-label="فرزُ المسوّدات بالمنصّة" hidden>${ptabs}<span class="grow"></span>${order}</nav>`
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
  return `<div class="pv" data-pv="${escapeHtml(d.id)}">
    <div class="pv-head">
      <span class="pv-dot" aria-hidden="true"></span>
      <span class="pv-who">${escapeHtml(target)}</span>
      <span class="grow"></span>
      <span class="ago">معاينة</span>
    </div>
    <p class="pv-body"><b data-pv-first>${escapeHtml(first)}</b><span data-pv-rest>${
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
function notesPane(d: DraftRow, counted: number, hardLimit: number): string {
  // **والشرطُ هو شرطُ المحرِّر نفسُه**: ملحوظةٌ حيث لا مربّعَ يُحرَّر
  // عتابٌ لا مراجعة. وشرطان متقاربان يفترقان بلا حارس
  if (d.status !== 'draft' && d.status !== 'approved' && d.status !== 'edited') return ''
  const notes: readonly ReviewNote[] = reviewText(d.text, d.platform, counted, hardLimit)
  if (notes.length === 0) return ''

  return `<details class="notes">
    <summary>${status('idle', '◍', `${
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

function card(
  d: DraftRow,
  now: Date,
  targets: readonly Target[],
  earliest: string,
  media: readonly MediaView[],
  pageOnly: readonly string[],
  peaks: Readonly<Record<string, Peaks>>,
  lines: ReadyLines,
): string {
  const spec = PLATFORMS[d.platform]
  // `queued` حالان لا حال: ينتظر ساعته، أو غادر. وشارةٌ تقول «مجدولة» فوق
  // شريطٍ يقول «غادرت» تناقضٌ يُقرأ عطلا
  const st =
    d.status === 'queued' && d.dispatchedAt !== null
      ? { cls: 'warn', glyph: '↑', text: 'في الطريق' }
      : (STATUS[d.status] ?? STATUS['draft']!)
  const open = d.status === 'draft'
  // بطاقةٌ فيها فعلٌ باقٍ ليست منتهية: المعتمَدُ ينتظر موعدا، والمجدولُ
  // ينتظر ساعته — والرماديُّ للمرفوض والمنشور وحدهما
  const live = open || d.status === 'approved' || d.status === 'edited' || d.status === 'queued'
  const len = postLength(d.text, d.platform)
  // متغيّرٌ لا خاصّيّة: ارتفاعٌ مكتوبٌ في `style` لا تغلبه استفسارةُ وسط،
  // فيبقى الجوّالُ — حيث يلتفّ النصّ أضعافا — بمربّعٍ مقاسِ الشاشة العريضة
  const box = `--lines:${LINES[d.platform] ?? 9}`

  const meta = [
    d.sourceName === null ? '' : `<span class="chip">${escapeHtml(d.sourceName)}</span>`,
    d.model === null ? '' : `<span class="chip mono">${escapeHtml(d.model)}</span>`,
    `<span class="chip mono" title="كلفةُ الكتابة — وقد وقعت">${d.cost === 0 ? '—' : money(d.cost)}</span>`,
    /*
     * **وثمنُ النشر غيرُ ثمن الكتابة** — وهذا هو الذي يبتّ فيه المالك.
     *
     * `ARCHITECTURE.md §٤` تقول إنّ `has_url` «يُعرَض في اللوحة مع
     * تكلفته على X» منذ أوّل يوم. **ولم يُعرَض قطّ**: كان يُحسَب عند
     * النشر — بعد الاعتماد بأسابيع — ويُكتب صفرا حرفا في المسوّدة.
     *
     * ورابطٌ على X ثلاثةَ عشرَ ضعفا (D-003 · D-069): يُعلَّم تحذيرا
     * ليُرى قبل النقر لا بعده. و LinkedIn بلا رسمٍ فلا يُعرَض شيء.
     */
    d.publishCost === 0
      ? ''
      : status(d.publishCost >= 0.1 ? 'warn' : '', d.publishCost >= 0.1 ? '!' : '●',
          `نشرُها ${money(d.publishCost)}${d.publishCost >= 0.1 ? ' — فيها رابط' : ''}`),
    d.stale ? status('warn', '▲', 'المصدر تغيّر بعدها') : '',
    /*
     * **ورابطُ الرحلة على كلّ بطاقة** (D-104): الرحلةُ تُسأل عن منشورٍ
     * بعينه، **والسؤالُ يقع وأنت تنظر إليه** — لا بعد أن تبحث عن معرّفه.
     */
    `<a class="chip" href="/panel/journey/${escapeHtml(d.id)}"
       title="من الملفّ إلى الأثر — كلُّ ما وقع لهذا المنشور">الرحلة ${ICON.go}</a>`,
  ]
    .filter((x) => x !== '')
    .join('')

  // مربّعٌ يُحرَّر ونصٌّ يُقرأ: البَتُّ مفتوحٌ للمسوّدة وحدها، وما بُتّ فيه
  // يبقى معروضا ولا يُحذف — كلفتُه وقعت، وما دُفع ثمنُه يُرى
  const editor = open
    ? `<form method="POST" action="/panel/drafts/decide" data-busy="جارٍ…">
         <input type="hidden" name="id" value="${escapeHtml(d.id)}">
         <textarea name="text" class="draft-text" style="${box}"
           data-limit="${spec.hardLimit}" data-target="${ceilingOf(spec.hardLimit)}"
           data-count="${spec.id}"
           aria-label="نصّ المنشور">${escapeHtml(d.text)}</textarea>
         <div class="draft-foot">
           <span class="count ${len > spec.hardLimit ? 'bad' : len > ceilingOf(spec.hardLimit) ? 'warn' : ''}"
             ><b>${len}</b> / ${spec.hardLimit}</span>
           <span class="grow"></span>
           <button class="g sm" type="submit" name="do" value="reject">ارفض</button>
           <button class="p sm" type="submit" name="do" value="approve">اعتمد</button>
         </div>
       </form>
       ${preview(d, spec.label)}`
    : `<div class="draft-text ro" style="${box}" data-ro>${escapeHtml(d.text)}</div>
       <div class="draft-foot"><span class="count"><b>${len}</b> / ${spec.hardLimit}</span>
         <span class="grow"></span>
         ${d.approvedBy === null
           ? ''
           : `<span class="ago">${d.status === 'rejected' ? 'رفضها' : 'اعتمدها'} ${escapeHtml(
               d.approvedBy,
             )}</span>`}</div>`

  return `<div class="draft${live ? '' : ' done'}" id="d-${escapeHtml(d.id)}" data-draft="${escapeHtml(d.id)}"
    data-status="${escapeHtml(bucketOf(d))}" data-platform="${escapeHtml(d.platform)}"
    data-created="${Date.parse(d.createdAt.replace(' ', 'T') + 'Z') || 0}" data-cost="${d.publishCost}">
    ${notesPane(d, len, spec.hardLimit)}
    <div class="draft-top">
      ${open
        ? `<label class="pick" title="حدّدها للاعتماد الجماعيّ">
             <input type="checkbox" form="bulk" name="id" value="${escapeHtml(d.id)}"
               data-pick data-cost="${d.publishCost}"
               aria-label="حدّد هذه المسوّدة للاعتماد الجماعيّ">
           </label>`
        : ''}
      <div class="ch-logo sm">${LOGOS[d.platform] ?? ''}</div>
      <div class="ch-name">${escapeHtml(spec.label)}
        <span class="ago">${escapeHtml(relativeTime(d.createdAt, now))}</span></div>
      <span class="grow"></span>
      ${status(st.cls, st.glyph, escapeHtml(st.text))}
    </div>
    ${d.rationale === null || d.rationale === '' ? '' : `<p class="draft-why">${escapeHtml(d.rationale)}</p>`}
    ${editor}
    ${editDiff(d)}
    ${imagePane(d, media, lines)}
    ${scheduler(d, targets, earliest, now, pageOnly, peaks[d.platform])}
    <div class="draft-meta">${meta}</div>
  </div>`
}

/** حسابٌ مربوطٌ يصلح وجهةً — والقائمةُ تُبنى من القنوات لا من ثابت. */
export interface Target {
  readonly id: string
  readonly platform: Platform
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
}

export function draftsSection(input: DraftsInput): string {
  const { drafts, writable, now } = input
  const waiting = drafts.filter((d) => d.status === 'draft').length

  // نموذجُ الكتابة: مصدرٌ ومنصّة، ونداءٌ واحد لكلٍّ. ولا كتابةَ آليّة —
  // الإنفاقُ يبدأ بضغطةٍ من المالك لا بدورةِ ساعة
  const writer =
    writable.length === 0
      ? `<div class="empty"><b>لا مصدر جاهزا للكتابة</b>
           <p>الكتابةُ تنطلق من خلاصةِ تحليلٍ لا من المستند نفسه.
              حلّل مصدرا أوّلا ثمّ عد.</p>
           <a class="btn g sm" href="#sources">اذهب إلى المصادر</a></div>`
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
                   `<option value="${escapeHtml(spec.id)}">${escapeHtml(spec.label)} — حتّى ${
                     spec.hardLimit} محرفا</option>`,
               )
               .join('')}</select></div>
           <div class="grow"></div>
           <button class="p" type="submit"${input.ready ? '' : ' disabled'}>اكتب مسوّدة</button>
         </form>
         ${input.ready
           ? ''
           : '<p class="hint" style="margin:var(--s-2) 0 0">مزوّدُ مهمّة الكتابة غير جاهز — اضبط مفتاحه في «المزوّدون».</p>'}`

  /*
   * لوحُ الاختصارات — **ولا يُعرض إلّا حيث تعمل**.
   *
   * الاختصاراتُ مربوطةٌ ببطاقات المسوّدات، فلوحٌ يُعلنها في شاشةٍ لا
   * مسوّدةَ فيها **يَعِد بما لا يقع**. وهو مخفيٌّ في الوثيقة ويُظهره
   * السكربتُ — لأنّها كلَّها لا تعمل بدونه.
   */
  const keys = `<details class="keys" id="keys" hidden>
    <summary>اختصاراتُ لوحة المفاتيح <span class="grow"></span><kbd>?</kbd></summary>
    <div class="rows">
      <span class="row-k"><kbd>J</kbd><kbd>K</kbd> التنقّل</span>
      <span class="row-k"><kbd>A</kbd> اعتمد</span>
      <span class="row-k"><kbd>R</kbd> ارفض</span>
      <span class="row-k"><kbd>E</kbd> حرّر النصّ</span>
      <span class="row-k"><kbd>S</kbd> الجدولة</span>
      <span class="row-k"><kbd>?</kbd> هذا اللوح</span>
    </div>
    <p class="hint" style="padding:0 var(--s-3) var(--s-3); margin:0">
      <b>وتُقاس بموضع المفتاح لا بحرفه</b> — فتعمل بالتخطيط العربيّ كما
      تعمل بالإنجليزيّ. ولا تعمل وأنت داخل مربّع كتابة.</p>
  </details>`

  // سطرا الجاهزيّة يُبنيان هنا مرّةً، والبطاقاتُ تأخذهما نصًّا (D-163)
  const lines = readyLines(input.mediaReady)
  const list =
    drafts.length === 0
      ? `<div class="empty"><b>لا مسوّدات بعد</b>
           <p>اكتب واحدةً من مصدرٍ محلَّل، وستظهر هنا لتقرأها وتقرّر.</p>
           <a class="btn p sm" href="#write">اكتب من مصدر</a></div>`
      : `<div class="dcols">${drafts
          .map((d) =>
            card(d, now, input.targets, input.earliest, input.media, input.pageOnly, input.peaks, lines))
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
    ${status('ok', '●', `<b data-bulk-n>0</b> محدَّدة`)}
    <span class="ago" data-bulk-cost></span>
    <span class="grow"></span>
    <button type="button" class="g sm" data-bulk-clear>ألغِ التحديد</button>
    <button class="p sm" type="submit">اعتمدها كما كُتبت</button>
  </form>`

  /*
   * **الترتيبُ بالقرار لا بالتدفّق** (D-156). كان اللوحُ يبدأ ببطاقة الكتابة
   * من مصدر، وما ينتظر قرارَ المالك تحتها بـ‏١٦٦٥px عند ‏١٤٤٠×‏٩٠٠ (التدقيقُ
   * الثالث). السؤالُ الذي يُفتَح له اللوح «ما الذي ينتظرني؟»، فجوابُه أوّلًا:
   * المسوّداتُ المنتظرة، ثمّ التوزيعُ إن كان له ما يُوزَّع، ثمّ الكتابةُ من
   * مصدر، والخطّةُ بعدها في اللوح.
   */
  return `${bulk}
  <div class="lede-row">
    <h3 class="sec" style="margin:0; border:0; padding:0">المسوّدات</h3>
    ${status(waiting === 0 ? 'idle' : 'warn', waiting === 0 ? '○' : '!', `${waiting} تنتظر قرارك`)}
    <span class="grow"></span>
    <span class="lede-note">الاعتمادُ يفتح بابَ الطابور ولا يعبره:
      <b>لا يُنشر منشورٌ بلا موافقةٍ مسجّلة</b>، والقيدُ في القاعدة لا في هذه الصفحة.</span>
  </div>
  ${spreadBar(input)}
  ${filterTabs(drafts)}
  ${keys}
  ${list}
  <div class="empty" id="draft-none" hidden>
    <b>لا مسوّدةَ في هذا الفرز</b>
    <p>غيّر التبويبَ أعلاه، أو اختر «الكلّ».</p></div>

  <div class="card" id="write" style="margin-top:var(--s-3)">
    <div class="card-head"><h2>الكتابة من مصدر</h2></div>
    <p class="hint">نداءٌ واحدٌ لكلّ ضغطة، وكلفتُه تُسجَّل قبل أن تُكتب المسوّدة.
      <b>ولا كتابةَ آليّة</b> — الإنفاق يبدأ بقرارك لا بدورةِ ساعة.</p>
    ${writer}
  </div>`
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
      input.targets.some((t) => t.platform === d.platform),
  ).length
  if (ready < 2) return ''

  return `<form class="card" method="POST" action="/panel/drafts/spread">
    <div class="card-head"><h2>وزّع المعتمَد</h2>
      <div class="grow"></div>
      ${status('ok', '●', `${ready} جاهزةً للتوزيع`)}</div>
    <p class="hint">موعدٌ للأولى وفاصلٌ بين كلِّ اثنتين — <b>ويُعرَض الجدولُ كاملا
      قبل أن يقع منه شيء</b>.</p>
    <div class="row">
      <div class="field"><label for="sp-start">أوّلُ موعد (UTC)</label>
        <input id="sp-start" name="start" type="datetime-local" data-when
          min="${escapeHtml(input.earliest)}" required></div>
      <div class="field"><label for="sp-gap">الفاصل (ساعة)</label>
        <input id="sp-gap" name="gap" type="number" inputmode="numeric"
          min="1" max="168" value="24" required></div>
      <span class="grow"></span>
      <button class="p" type="submit">اعرض الجدول</button>
    </div>
    <div class="quick" data-quick="sp-start">
      ${QUICK.map(
        (q) =>
          `<button class="g sm" type="button" data-preset="${q.kind}">${escapeHtml(q.label)}</button>`,
      ).join('')}
      <span class="grow"></span>
      <span class="mirror mono" data-mirror="sp-start"></span>
    </div>
  </form>`
}
