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
import { PLATFORMS, type Platform } from '../../../lib/draft/prompt'
import { escapeHtml } from '../shell'
import { relativeTime } from '../../../lib/format'

const MARK: Readonly<Record<string, string>> = {
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C21.4 8.65 22 11 22 14.2V21h-4v-6c0-1.43-.03-3.27-2-3.27-2 0-2.3 1.56-2.3 3.17V21h-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.9-6.4L5.1 21H2l7.3-8.3L2.5 3h6.3l4.4 5.8zm-1.1 16.1h1.7L7.7 4.8H5.9z"/></svg>',
}

const STATUS: Readonly<Record<string, { cls: string; glyph: string; text: string }>> = {
  draft: { cls: 'idle', glyph: '○', text: 'تنتظر قرارك' },
  approved: { cls: 'ok', glyph: '●', text: 'معتمَدة' },
  edited: { cls: 'ok', glyph: '●', text: 'معتمَدة بعد تعديل' },
  rejected: { cls: 'bad', glyph: '✕', text: 'مرفوضة' },
  queued: { cls: 'warn', glyph: '◔', text: 'مجدولة' },
  published: { cls: 'ok', glyph: '✓', text: 'نُشرت' },
  failed: { cls: 'bad', glyph: '▲', text: 'فشل النشر' },
}

function money(value: number): string {
  return value === 0 ? '—' : `${value.toFixed(4)}$`
}

/** أسطرُ المربّع — لكلّ منصّةٍ قدرُ نصّها، فلا فائضٌ ولا فراغ. */
const LINES: Readonly<Record<string, number>> = { linkedin: 12, x: 6 }
const LINE = 26
const PAD = 28

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
function scheduler(d: DraftRow, targets: readonly Target[], earliest: string, now: Date): string {
  const approved = d.status === 'approved' || d.status === 'edited'

  if (d.status === 'queued') {
    const when = d.scheduledAt === null ? '' : d.scheduledAt.replace(' ', ' · ')
    const gone = d.dispatchedAt !== null
    return `<div class="sched ${gone ? 'gone' : 'set'}">
      <span class="st ${gone ? 'warn' : 'ok'}"><span class="g">${gone ? '↑' : '◔'}</span>${
        gone ? 'غادرت إلى الطابور' : 'مجدولة'}</span>
      <span class="when mono">${escapeHtml(when)} UTC</span>
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
    return `<div class="sched none">
      <span class="st warn"><span class="g">!</span>لا قناةَ ${escapeHtml(PLATFORMS[d.platform].label)} مربوطة</span>
      <span class="ago">اعتُمد النصّ، ويبقى حتّى تُربَط قناتُه — ولا يضيع.</span>
      <span class="grow"></span>
      <a class="btn g sm" href="#channels">اربط قناة</a>
    </div>`
  }

  const id = d.id.slice(0, 8)
  return `<form class="sched" method="POST" action="/panel/drafts/schedule" data-busy="جارٍ…">
    <input type="hidden" name="id" value="${escapeHtml(d.id)}">
    <div class="field"><label for="ac-${id}">الوجهة</label>
      <select id="ac-${id}" name="account">${fit
        .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`)
        .join('')}</select></div>
    <div class="field"><label for="wh-${id}">الموعد (UTC)</label>
      <input id="wh-${id}" name="when" type="datetime-local"
        min="${escapeHtml(earliest)}" required></div>
    <span class="grow"></span>
    <button class="p sm" type="submit">جدوِل</button>
  </form>`
}

/**
 * لوحُ الصورة.
 *
 * ثلاثةُ أحوال: بلا صورةٍ فزرُّ توليد، وبصورةٍ فمعاينةٌ وزرُّ رفض،
 * ومرفوضةٌ فأثرٌ يبقى بكلفته.
 *
 * **والصورةُ تُعرض بحجمها الحقيقيّ لا مصغَّرةً بعشرين بكسلا**: المالك
 * يقرّر عليها، وقرارٌ على مربّعٍ صغير ليس قرارا.
 */
function imagePane(d: DraftRow, media: readonly MediaView[]): string {
  const open = d.status === 'draft' || d.status === 'approved' || d.status === 'edited'
  const mine = media.filter((m) => m.postId === d.id)
  // الصورةُ والمقطعُ صفّان في `media` يفترقان بالنوع — لا جدولَ ثانٍ
  const ready = mine.find((m) => m.status === 'ready' && !m.mime.startsWith('video/'))
  const clip = mine.find((m) => m.status === 'ready' && m.mime.startsWith('video/'))

  if (ready !== undefined) {
    return `<div class="pic">
      <img src="/panel/media/${escapeHtml(ready.id)}" alt="صورةٌ مولَّدة تصاحب المنشور"
        loading="lazy" width="1200" height="628">
      <div class="pic-foot">
        <span class="chip mono">${Math.round(ready.bytes / 1024)}KB</span>
        <span class="chip mono">${ready.cost === 0 ? '—' : `${ready.cost.toFixed(4)}$`}</span>
        ${ready.prompt === ''
          ? ''
          : `<span class="chip" title="${escapeHtml(ready.prompt)}">الوصف</span>`}
        <span class="grow"></span>
        ${open
          ? `<form class="inline" method="POST" action="/panel/media/animate"
                   data-busy="جارٍ التحريك…">
               <input type="hidden" name="id" value="${escapeHtml(d.id)}">
               <button class="g sm" type="submit">حرّكها فيديو</button></form>
             <form class="inline" method="POST" action="/panel/media/reject" data-busy="جارٍ…">
               <input type="hidden" name="id" value="${escapeHtml(ready.id)}">
               <button class="g sm" type="submit">ارفض الصورة</button></form>`
          : ''}
      </div>
      ${clip === undefined
        ? ''
        : `<div class="pic-foot">
             <span class="st ok"><span class="g">●</span>مقطعٌ رأسيّ ١٥ث</span>
             <span class="chip mono">${Math.round(clip.bytes / 1024)}KB</span>
             <span class="ago">يصلح لـ Shorts و Reels و TikTok — وهي كلُّها رأسيّة.</span>
           </div>`}
    </div>`
  }

  const rejected = mine.filter((m) => m.status === 'rejected').length
  if (!open) return ''

  return `<div class="pic none">
    <span class="st idle"><span class="g">○</span>${
      rejected === 0 ? 'بلا صورة' : `رُفضت ${rejected} — وتبقى في الدفتر`}</span>
    <span class="ago">صورةٌ مجرّدةٌ <b>بلا حرف</b>: النصُّ في المنشور حيث يُقرأ.</span>
    <span class="grow"></span>
    <form class="inline" method="POST" action="/panel/media/generate" data-busy="جارٍ التوليد…">
      <input type="hidden" name="id" value="${escapeHtml(d.id)}">
      <button class="g sm" type="submit">ولّد صورة</button></form>
  </div>`
}

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
function filterTabs(drafts: readonly DraftRow[]): string {
  const tabs = BUCKETS.map((b) => {
    const n = b.id === 'all' ? drafts.length : drafts.filter((d) => bucketOf(d) === b.id).length
    return `<button type="button" class="ftab${b.id === 'all' ? ' on' : ''}"
      data-bucket="${b.id}" aria-pressed="${b.id === 'all'}"
      >${escapeHtml(b.label)}<span class="count">${n}</span></button>`
  }).join('')
  return `<nav class="ftabs" id="draft-filter" aria-label="فرزُ المسوّدات" hidden>${tabs}</nav>`
}

function card(
  d: DraftRow,
  now: Date,
  targets: readonly Target[],
  earliest: string,
  media: readonly MediaView[],
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
    `<span class="chip mono" title="كلفةُ الكتابة — وقد وقعت">${money(d.cost)}</span>`,
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
      : `<span class="st ${d.publishCost >= 0.1 ? 'warn' : ''}"
           ><span class="g">${d.publishCost >= 0.1 ? '!' : '●'}</span
           >نشرُها ${money(d.publishCost)}${d.publishCost >= 0.1 ? ' — فيها رابط' : ''}</span>`,
    d.stale ? '<span class="st warn"><span class="g">▲</span>المصدر تغيّر بعدها</span>' : '',
  ]
    .filter((x) => x !== '')
    .join('')

  // مربّعٌ يُحرَّر ونصٌّ يُقرأ: البَتُّ مفتوحٌ للمسوّدة وحدها، وما بُتّ فيه
  // يبقى معروضا ولا يُحذف — كلفتُه وقعت، وما دُفع ثمنُه يُرى
  const editor = open
    ? `<form method="POST" action="/panel/drafts/decide" data-busy="جارٍ…">
         <input type="hidden" name="id" value="${escapeHtml(d.id)}">
         <textarea name="text" class="draft-text" style="${box}"
           data-limit="${spec.hardLimit}" data-target="${spec.target}"
           data-count="${spec.id}"
           aria-label="نصّ المنشور">${escapeHtml(d.text)}</textarea>
         <div class="draft-foot">
           <span class="count ${len > spec.hardLimit ? 'bad' : len > spec.target ? 'warn' : ''}"
             ><b>${len}</b> / ${spec.hardLimit}</span>
           <span class="grow"></span>
           <button class="g sm" type="submit" name="do" value="reject">ارفض</button>
           <button class="p sm" type="submit" name="do" value="approve">اعتمد</button>
         </div>
       </form>`
    : `<div class="draft-text ro" style="${box}" data-ro>${escapeHtml(d.text)}</div>
       <div class="draft-foot"><span class="count"><b>${len}</b> / ${spec.hardLimit}</span>
         <span class="grow"></span>
         ${d.approvedBy === null
           ? ''
           : `<span class="ago">${d.status === 'rejected' ? 'رفضها' : 'اعتمدها'} ${escapeHtml(
               d.approvedBy,
             )}</span>`}</div>`

  return `<div class="draft${live ? '' : ' done'}" data-draft="${escapeHtml(d.id)}"
    data-status="${escapeHtml(bucketOf(d))}" data-platform="${escapeHtml(d.platform)}">
    <div class="draft-top">
      ${open
        ? `<label class="pick" title="حدّدها للاعتماد الجماعيّ">
             <input type="checkbox" form="bulk" name="id" value="${escapeHtml(d.id)}"
               data-pick data-cost="${d.publishCost}"
               aria-label="حدّد هذه المسوّدة للاعتماد الجماعيّ">
           </label>`
        : ''}
      <div class="ch-logo sm">${MARK[d.platform] ?? ''}</div>
      <div class="ch-name">${escapeHtml(spec.label)}
        <span class="ago">منذ ${escapeHtml(relativeTime(d.createdAt, now))}</span></div>
      <span class="grow"></span>
      <span class="st ${st.cls}"><span class="g">${st.glyph}</span>${escapeHtml(st.text)}</span>
    </div>
    ${d.rationale === null || d.rationale === '' ? '' : `<p class="draft-why">${escapeHtml(d.rationale)}</p>`}
    ${editor}
    ${imagePane(d, media)}
    ${scheduler(d, targets, earliest, now)}
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
             <select id="dw-pf" name="platform">
               <option value="linkedin">LinkedIn — نحو ١٣٠٠ محرف</option>
               <option value="x">X — نحو ٢٥٠ محرفا</option></select></div>
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

  const list =
    drafts.length === 0
      ? `<div class="empty"><b>لا مسوّدات بعد</b>
           <p>اكتب واحدةً من مصدرٍ محلَّل، وستظهر هنا لتقرأها وتقرّر.</p></div>`
      : `<div class="grid c2 ragged">${drafts
          .map((d) => card(d, now, input.targets, input.earliest, input.media))
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
    <span class="st ok"><span class="g">●</span><b data-bulk-n>0</b> محدَّدة</span>
    <span class="ago" data-bulk-cost></span>
    <span class="grow"></span>
    <button type="button" class="g sm" data-bulk-clear>ألغِ التحديد</button>
    <button class="p sm" type="submit">اعتمدها كما كُتبت</button>
  </form>`

  return `${bulk}<div class="card" style="margin-bottom:var(--s-3)">
    <div class="card-head"><h2>الكتابة من مصدر</h2>
      <div class="grow"></div>
      <span class="st ${waiting === 0 ? 'idle' : 'warn'}"><span class="g">${
        waiting === 0 ? '○' : '!'}</span>${waiting} تنتظر قرارك</span></div>
    <p class="hint">نداءٌ واحدٌ لكلّ ضغطة، وكلفتُه تُسجَّل قبل أن تُكتب المسوّدة.
      <b>ولا كتابةَ آليّة</b> — الإنفاق يبدأ بقرارك لا بدورةِ ساعة.</p>
    ${writer}
  </div>

  <div class="lede-row">
    <h3 class="sec" style="margin:0; border:0; padding:0">المسوّدات</h3>
    <span class="grow"></span>
    <span class="lede-note">الاعتمادُ يفتح بابَ الطابور ولا يعبره:
      <b>لا يُنشر منشورٌ بلا موافقةٍ مسجّلة</b>، والقيدُ في القاعدة لا في هذه الصفحة.</span>
  </div>
  ${filterTabs(drafts)}
  ${keys}
  ${list}
  <div class="empty" id="draft-none" hidden>
    <b>لا مسوّدةَ في هذا الفرز</b>
    <p>غيّر التبويبَ أعلاه، أو اختر «الكلّ».</p></div>`
}
