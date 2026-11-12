/**
 * شاشةُ **الخطّة** (D-286 · D-327) — الشهرُ كلُّه في تقويم، ثمّ أسبوعٌ يُختار، وفي كلّ يومٍ بطاقةٌ لكلّ منصّة.
 *
 * ## ما صار (D-327)
 *
 * كان الاعتمادُ علامةً والجدولةُ زرًّا في آخر الصفحة («ثبّت الخطّة»)، والمثبَّتةُ تفتح «العرض» بلا زرّ اعتماد. فقال المالك:
 * «أفتح الخطّة ولا أجد زرَّ اعتماد». فصارت الشاشةُ واحدة:
 *
 * - **التقويم**: كلُّ يومٍ بشعارات منصّاته وعددِ ما ينتظر — رابطٌ إلى يومه في أسبوعه.
 * - **الأسبوع**: شريطُ أسابيع (`?w=`)، يُعرَض واحدٌ منها بأيّامه؛ والافتراضُ أسبوعُ اليوم ثمّ أوّلُ أسبوعٍ فيه ما ينتظر.
 * - **البطاقة**: المنشورُ بشكل منصّته (`nativePost`)، و**✓ اعتمد** يعتمد ويجدول في موعد البند، و**✕ أزِل** يُخرج المنصّةَ من
 *   يومها، و«تراجَع» على المجدول ما دام لم يُرسَل. والصورةُ بأزرارها: «ولّد صورة» · «بدّلها» · «بدون صورة».
 * - **الجملة**: «اعتمد الأسبوع» و«اعتمد الخطّة كاملة» في شريطٍ ثابتٍ أسفل الشاشة.
 *
 * **وبلا سكربتٍ يعمل كلُّ شيء**: الأفعالُ نماذج والأسابيعُ روابط. والسكربتُ يُظهر شريطَ المحدَّد ويعدّه، ويعيد تحميل الصفحة
 * ما دام صدى يكتب أو يرسم — فتظهر البطاقاتُ تباعًا بلا يد.
 */
import { html, raw, type Html } from './html'
import { pageHead } from './parts'
import { LOGOS } from './logos'
import { nativePost } from './nativePost'
import { maySpend } from '../../lib/access'
import { button } from './components/button'
import { ICON } from './icons'
import { platformLabel } from '../../lib/oauth/providers'
import { stamp } from '../../lib/time/zone'
import { AR_LATN, num } from '../../lib/format'
import { SPAN_LABEL, imageFor, spanDays } from '../../lib/plan/prompt'
import { GAP_LABEL, type Gap, type ReviewCard, type ReviewModel } from '../../lib/plan/review'

const AR = num

export function dayLabel(day: string, style: 'long' | 'short' = 'long'): string {
  const at = new Date(day + 'T12:00:00Z')
  return Number.isNaN(at.getTime())
    ? day
    : at.toLocaleDateString(AR_LATN, style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' } : { day: 'numeric', timeZone: 'UTC' })
}

export function shift(day: string, n: number): string {
  const at = new Date(day + 'T00:00:00Z')
  at.setUTCDate(at.getUTCDate() + n)
  return at.toISOString().slice(0, 10)
}

const STATUS: Readonly<Record<string, { tone: string; text: string }>> = {
  draft: { tone: 'warn', text: 'تنتظر اعتمادك' },
  approved: { tone: 'warn', text: 'معتمَدة بلا موعد' },
  edited: { tone: 'warn', text: 'معتمَدة بلا موعد' },
  queued: { tone: 'ok', text: 'مجدولة' },
  published: { tone: 'ok', text: 'نُشرت' },
  failed: { tone: 'bad', text: 'تعثّر نشرُها' },
}

export interface ReviewView {
  /** الأسبوعُ المطلوب من العنوان (`?w=`): رقمٌ من 1 أو «all» — وما سواهما يُحسَب. */
  readonly week?: string | null
  readonly now?: Date
  readonly orgName?: string
  /** اسمُ الحساب لكلّ منصّة — رأسُ المنشور في معاينته. */
  readonly authors?: Readonly<Record<string, string>>
}

/** أيُّ أسبوعٍ من الخطّة يقع فيه اليوم — من 1. */
function weekOfDay(start: string, day: string): number {
  const diff = Math.floor((Date.parse(day + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86_400_000)
  return Math.floor(diff / 7) + 1
}

/** ما ينتظر يدَ المالك: مسوّدةٌ لم تُعتمد، أو معتمَدةٌ بلا موعد. */
const waits = (c: ReviewCard): boolean => c.post !== null && (c.post.status === 'draft' || c.post.status === 'approved' || c.post.status === 'edited')

/**
 * الأسبوعُ المعروض: ما طُلب إن صحّ، ثمّ أسبوعُ اليوم إن كان في المدى، ثمّ أوّلُ أسبوعٍ فيه ما ينتظر، ثمّ الأوّل.
 * و`0` الخطّةُ كلُّها («all»).
 */
export function shownWeek(m: ReviewModel, asked: string | null | undefined, now: Date | undefined): number {
  const weeks = Math.ceil(spanDays(m.plan.span ?? 'week') / 7)
  if (asked === 'all') return 0
  const n = Number(asked)
  if (asked !== null && asked !== undefined && Number.isInteger(n) && n >= 1 && n <= weeks) return n
  if (weeks === 1) return 1
  if (now !== undefined) {
    const today = weekOfDay(m.plan.week, now.toISOString().slice(0, 10))
    if (today >= 1 && today <= weeks && m.cards.some((c) => weekOfDay(m.plan.week, c.item.day) === today)) return today
  }
  const first = m.cards.filter((c) => c.post === null || waits(c)).map((c) => weekOfDay(m.plan.week, c.item.day)).sort((a, b) => a - b)[0]
  return first !== undefined && first >= 1 && first <= weeks ? first : 1
}

/** أزرارُ الصورة على البطاقة (D-327): تُولَّد أو تُبدَّل أو تُترك — والتوليدُ نداءٌ قد يُدفع، فلمن يملك الإنفاق وحدَه. */
function imageActs(c: ReviewCard, m: ReviewModel, w: string): Html {
  if (c.post === null || c.item.kind === 'video' || c.post.status === 'published' || c.post.status === 'queued') return html``
  if (c.mediaMime !== null && c.mediaMime !== undefined && c.mediaMime.startsWith('video/')) return html``
  const back = html`<input type="hidden" name="back" value="plan"><input type="hidden" name="index" value="${String(c.index)}"><input type="hidden" name="w" value="${w}">`
  // ‏ونوعُ الصورة نوعُ منصّتها (D-329)، وما اختير له «بلا صورة» يُرسم بالنوع العامّ حين يُطلب بالزرّ
  const chosen = imageFor(m.plan.choices, c.item.platform)
  const style = html`<input type="hidden" name="style" value="${chosen === 'none' ? m.plan.choices.imageStyle : chosen}">`
  if (c.mediaId === null) {
    return maySpend()
      ? html`<div class="row gap-2 rv-img"><span class="hint">بدون صورة</span><span class="grow"></span>
          <form class="inline" method="POST" action="/panel/media/generate" data-busy="تُرسم الصورة…">${back}${style}<input type="hidden" name="id" value="${c.post.id}">${raw(button({ label: 'ولّد صورة', size: 'sm', type: 'submit' }))}</form></div>`
      : html`<div class="row gap-2 rv-img"><span class="hint">بدون صورة</span></div>`
  }
  return html`<div class="row gap-2 rv-img"><span class="hint">الصورة</span><span class="grow"></span>
      ${maySpend() ? html`<form class="inline" method="POST" action="/panel/media/regenerate" data-busy="تُرسم الصورة…">${back}${style}<input type="hidden" name="id" value="${c.post.id}"><input type="hidden" name="media" value="${c.mediaId}">${raw(button({ label: 'بدّلها', size: 'sm', type: 'submit' }))}</form>` : html``}
      <form class="inline" method="POST" action="/panel/media/reject">${back}<input type="hidden" name="id" value="${c.mediaId}">${raw(button({ label: 'بدون صورة', size: 'sm', type: 'submit' }))}</form></div>`
}

function card(c: ReviewCard, m: ReviewModel, zone: string | null, view: ReviewView, w: string): Html {
  const planId = m.plan.id
  const local = stamp(c.item.day + ' ' + c.item.time, zone).slice(11, 16)
  const st = c.post === null ? { tone: 'idle', text: 'تُكتب الآن' } : STATUS[c.post.status] ?? { tone: 'idle', text: c.post.status }
  const hidden = html`<input type="hidden" name="id" value="${planId}"><input type="hidden" name="index" value="${String(c.index)}"><input type="hidden" name="key" value="${c.key}"><input type="hidden" name="w" value="${w}">`
  const label = platformLabel(c.item.platform as never)
  const status = c.post?.status ?? ''
  // ‏والموعدُ الذي جُدولت إليه يُقال في الشارة: قد يكون أرجحَ ساعات المنصّة لا ساعةَ البند
  const when = status === 'queued' && c.post?.scheduledAt !== null && c.post?.scheduledAt !== undefined ? stamp(c.post.scheduledAt, zone).slice(5, 16) : ''
  const preview = c.post === null
    ? html`<div class="pd-pending"><p class="m-0">${c.item.angle}</p><span class="hint">صدى يكتبه الآن — يظهر هنا وحدَه.</span></div>`
    : raw(nativePost({
      platform: c.item.platform as never, id: c.post.id, author: { name: view.authors?.[c.item.platform] ?? view.orgName ?? 'خطّتي', kind: null },
      text: c.post.text, when: local,
      media: c.mediaId === null ? null : { id: c.mediaId, mime: c.mediaMime ?? 'image/png', composed: true },
      poster: null, metrics: null, variant: 'feed',
    }))
  const approve = c.post === null || (status !== 'draft' && status !== 'approved' && status !== 'edited')
    ? html``
    : html`<form class="inline" method="POST" action="/panel/plan/review/approve" data-busy="جار…">${hidden}<input type="hidden" name="post" value="${c.post.id}">${raw(button({ label: status === 'draft' ? 'اعتمد' : 'جدوِل', variant: 'primary', size: 'sm', type: 'submit', icon: ICON.check }))}</form>`
  const undo = c.post === null || status !== 'queued'
    ? html``
    : html`<form class="inline" method="POST" action="/panel/plan/review/undo" data-busy="جار…">${hidden}<input type="hidden" name="post" value="${c.post.id}">${raw(button({ label: 'تراجَع', size: 'sm', type: 'submit' }))}</form>`
  return html`<article class="card rv" id="c-${String(c.index)}" data-gaps="${c.gaps.join(' ')}">
    <header class="rv-h">
      <label class="rv-sel"><input type="checkbox" name="sel" form="rv-bulk" value="${String(c.index)}|${c.key}|${c.post?.id ?? ''}" aria-label="حدّد بند ${label} ${local}"></label>
      <span class="pf-logo rv-pf" data-pf="${c.item.platform}" aria-hidden="true">${raw(LOGOS[c.item.platform] ?? '')}</span>
      <b>${label}</b><bdi class="mono">${local}</bdi>
      <span class="grow"></span>
      <span class="st ${st.tone}">${st.text}</span>${when === '' ? html`` : html`<bdi class="mono">${when}</bdi>`}
    </header>
    <div class="rv-pv">${preview}</div>
    ${c.post === null || c.item.why === 'من خطّتك المرفوعة' ? html`` : html`<p class="hint m-0">${c.item.angle}</p>`}
    ${c.item.note === undefined ? html`` : html`<p class="hint m-0">ملاحظة: ${c.item.note}</p>`}
    ${c.gaps.includes('clash') ? html`<div class="row gap-2"><span class="chip">${GAP_LABEL.clash}</span></div>` : html``}
    ${imageActs(c, m, w)}
    <div class="row gap-2 rv-acts">
      ${approve}${undo}
      ${c.post === null || status === 'published' ? html`` : html`<a class="btn btn-secondary btn-sm" href="/panel?open=${encodeURIComponent(c.post.id)}#ed">عدّل</a>`}
      ${status === 'published' ? html`` : html`<form class="inline" method="POST" action="/panel/plan/review/delay">${hidden}<button class="btn btn-secondary btn-sm" type="submit" name="days" value="1">أخّر يومًا</button><button class="btn btn-secondary btn-sm" type="submit" name="days" value="7">أسبوعًا</button></form>`}
      ${/* ‏والإزالةُ حمراء (مراجعة D-323): حوارُ التأكيد يقرأ الهدمَ من لون الزرّ، فيقف التركيزُ على «إلغاء» */''}
      ${status === 'published' ? html`` : html`<form class="inline" method="POST" action="/panel/plan/review/drop" data-confirm="${'أزِل ' + label + ' من هذا اليوم؟' + (c.post === null ? '' : status === 'queued' ? ' يُسحب موعدُ منشوره ويُرفض، ويبقى بكلفته.' : ' ومسوّدتُه تُرفض وتبقى بكلفتها.')}">${hidden}${raw(button({ label: 'أزِل', variant: 'danger', size: 'sm', type: 'submit', icon: ICON.close }))}</form>`}
    </div>
  </article>`
}

/**
 * تقويمُ الخطّة: كلُّ يومٍ بشعارات منصّاته وعددِ بنوده. و`hrefOf` يقول إلى أين يذهب اليوم — المراجعةُ إلى أسبوعه، والعرضُ إلى
 * موضعه في الصفحة. **واللونُ لا يقول وحدَه**: ما ينتظر يُكتب في اسم الرابط ويُعلَّم بإطارٍ متقطّع.
 */
export function calendar(m: ReviewModel, hrefOf: (day: string) => string = (day) => '#d-' + day): Html {
  const start = m.plan.week
  const days = spanDays(m.plan.span ?? 'week')
  const byDay = new Map<string, ReviewCard[]>()
  for (const c of m.cards) byDay.set(c.item.day, [...(byDay.get(c.item.day) ?? []), c])
  const cells: Html[] = []
  // ‏الأسبوعُ يبدأ الأحد في الرأس، فيومُ بدايةٍ غيرُه يُزاح بخاناتٍ فارغة
  const lead = new Date(start + 'T12:00:00Z').getUTCDay()
  for (let i = 0; i < lead; i += 1) cells.push(html`<span class="rv-cd" aria-hidden="true"></span>`)
  for (let i = 0; i < days; i += 1) {
    const day = shift(start, i)
    const cards = byDay.get(day) ?? []
    const n = cards.length
    if (n === 0) { cells.push(html`<span class="rv-cd" aria-hidden="true"><b>${dayLabel(day, 'short')}</b></span>`); continue }
    const open = cards.filter((c) => c.post === null || waits(c)).length
    const platforms = [...new Set(cards.map((c) => c.item.platform))]
    // ‏والاسمُ ممّا يُرى (WCAG 2.5.3): رقمُ اليوم والعددُ نصٌّ ظاهر، وما يشرحهما نصٌّ لقارئ الشاشة بينهما — لا `aria-label` يحجبهما
    cells.push(html`<a class="rv-cd is-on${open > 0 ? ' is-wait' : ''}" href="${hrefOf(day)}"><b>${dayLabel(day, 'short')}</b>
      <span class="rv-dots" aria-hidden="true">${platforms.map((p) => html`<span class="pf-logo rv-pf rv-dot" data-pf="${p}">${raw(LOGOS[p] ?? '')}</span>`)}</span><span>${AR(n)}<i class="vh"> ${n === 1 ? 'منشور' : 'منشورات'}${open > 0 ? '، ' + AR(open) + ' تنتظر' : '، كلُّها مجدولة'}</i></span></a>`)
  }
  return html`<nav class="rv-cal" aria-label="أيّام الخطّة">${['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((d) => html`<span class="rv-wd" aria-hidden="true">${d}</span>`)}${cells}</nav>`
}

function gapsBar(m: ReviewModel): Html {
  const order: Gap[] = ['unwritten', 'pending', 'no_image', 'clash']
  const present = order.filter((g) => m.gaps[g] > 0)
  if (present.length === 0) return html`<p class="rv-ok m-0" role="status"><b>لا ينقص شيء</b> — كلُّ ما في الخطّة معتمَد.</p>`
  return html`<div class="row gap-2 rv-gaps" role="status"><b>ما ينقص:</b>${present.map((g) => {
    const first = m.cards.find((c) => c.gaps.includes(g))
    const wk = first === undefined ? 1 : weekOfDay(m.plan.week, first.item.day)
    return html`<a class="chip" href="?w=${String(wk)}#c-${String(first?.index ?? 0)}">${AR(m.gaps[g])} ${GAP_LABEL[g]}</a>`
  })}</div>`
}

/** شريطُ الأسابيع: رابطٌ لكلّ أسبوعٍ بمداه وما ينتظر فيه، و«الكلّ». ولا شريطَ لخطّة أسبوعٍ واحد. */
function weekTabs(m: ReviewModel, shown: number): Html {
  const weeks = Math.ceil(spanDays(m.plan.span ?? 'week') / 7)
  if (weeks <= 1) return html``
  const tabs: Html[] = []
  for (let w = 1; w <= weeks; w += 1) {
    const from = shift(m.plan.week, (w - 1) * 7)
    const inWeek = m.cards.filter((c) => weekOfDay(m.plan.week, c.item.day) === w)
    const open = inWeek.filter((c) => c.post === null || waits(c)).length
    tabs.push(html`<a class="rv-wk${w === shown ? ' is-on' : ''}" href="?w=${String(w)}"${w === shown ? raw(' aria-current="page"') : ''}><b>الأسبوع ${AR(w)}</b>
      <span class="ago">${dayLabel(from, 'short')}–${dayLabel(shift(from, 6), 'short')} · ${AR(inWeek.length)} ${open > 0 ? html`· <em>${AR(open)} تنتظر</em>` : ''}</span></a>`)
  }
  tabs.push(html`<a class="rv-wk${shown === 0 ? ' is-on' : ''}" href="?w=all"${shown === 0 ? raw(' aria-current="page"') : ''}><b>الكلّ</b><span class="ago">${AR(m.cards.length)} منشورًا</span></a>`)
  return html`<nav class="rv-weeks" aria-label="أسابيع الخطّة">${tabs}</nav>`
}

export function planReviewScreen(m: ReviewModel, zone: string | null, view: ReviewView = {}): string {
  const span = SPAN_LABEL[m.plan.span ?? 'week']
  const end = shift(m.plan.week, spanDays(m.plan.span ?? 'week') - 1)
  const shown = shownWeek(m, view.week, view.now)
  const w = shown === 0 ? 'all' : String(shown)
  const state = m.lockedAt !== null
    ? html`<span class="st ok">مثبَّتة · الإصدار ${AR(m.version)}</span>`
    : m.versions.length > 0
      ? html`<span class="st warn">عُدّلت بعد التثبيت · الإصدار ${AR(m.version)} غير مثبَّت</span>`
      : html`<span class="st idle">مسوّدة · الإصدار ${AR(m.version)}</span>`
  const head = pageHead('المنشورات', 'خطّةُ النشر', span + ' · ' + dayLabel(m.plan.week) + ' – ' + dayLabel(end))
  const written = m.cards.filter((c) => c.post !== null).length
  const settled = m.cards.filter((c) => c.post !== null && (c.post.status === 'queued' || c.post.status === 'published')).length
  // ‏ما يُكتب أو يُرسم الآن: الصفحةُ تعيد تحميلَ نفسها ما دام شيءٌ في الطريق (السكربتُ يقرأ `data-live`)
  const live = written < m.cards.length ? 'write' : m.gaps.no_image > 0 ? 'image' : ''
  const progress = written < m.cards.length
    ? html`<p class="hint m-0" role="status">كُتب ${AR(written)} من ${AR(m.cards.length)} — صدى يكتب الباقي الآن بصوره، والصفحةُ تتحدّث وحدَها.</p>`
    : html``
  const visible = [...m.cards]
    .filter((c) => shown === 0 || weekOfDay(m.plan.week, c.item.day) === shown)
    .sort((a, b) => (a.item.day + a.item.time).localeCompare(b.item.day + b.item.time))
  const byDay = new Map<string, ReviewCard[]>()
  for (const c of visible) byDay.set(c.item.day, [...(byDay.get(c.item.day) ?? []), c])
  const list = byDay.size === 0
    ? html`<p class="hint" role="status">لا منشورَ في هذا الأسبوع — اختر أسبوعًا آخر من الشريط.</p>`
    : [...byDay.entries()].map(([day, cards]) => html`<section class="rv-day" aria-labelledby="d-${day}">
      <h2 class="rv-dh" id="d-${day}">${dayLabel(day)}</h2>
      <div class="rv-cards">${cards.map((c) => card(c, m, zone, view, w))}</div></section>`)
  const versions = m.versions.length === 0 ? html`` : html`<details class="fold mt-4"><summary><span>الإصدارات المحفوظة (${AR(m.versions.length)})</span></summary>
      <ul class="plain">${m.versions.map((v) => html`<li>الإصدار ${AR(v.version)} — ثُبّت ${stamp(v.lockedAt, zone)}، ${AR(v.items)} بندًا، جُدول منها ${AR(v.scheduled)}${v.lockedBy === null ? '' : ' · ' + v.lockedBy}</li>`)}</ul></details>`
  // ‏«اعتمد الأسبوع»: مسوّداتُ المعروض كلُّها بنموذج الجملة نفسِه — لا طريقَ ثانيًا حول فحص الاعتماد
  const weekDrafts = visible.filter((c) => c.post !== null && c.post.status === 'draft')
  const allDrafts = m.gaps.pending
  const scope = shown === 0 ? 'الخطّة' : weeksOf(m) === 1 ? 'الأسبوع' : 'الأسبوع ' + AR(shown)
  const approveWeek = weekDrafts.length === 0 ? html`` : html`<form class="inline" method="POST" action="/panel/plan/review/bulk" data-busy="جار الاعتماد…"
      data-confirm="${'اعتمد ' + AR(weekDrafts.length) + (weekDrafts.length === 1 ? ' منشورًا' : ' منشورات') + ' كما كُتبت وجدوِلها في مواعيدها؟ تُنشر بعدها وحدَها.'}">
      <input type="hidden" name="id" value="${m.plan.id}"><input type="hidden" name="w" value="${w}">
      ${weekDrafts.map((c) => html`<input type="hidden" name="sel" value="${String(c.index)}|${c.key}|${c.post?.id ?? ''}">`)}
      ${raw(button({ label: 'اعتمد ' + scope + ' (' + AR(weekDrafts.length) + ')', variant: 'primary', type: 'submit', name: 'do', value: 'approve', icon: ICON.check }))}</form>`
  const approveAll = allDrafts <= weekDrafts.length ? html`` : html`<form class="inline" method="POST" action="/panel/plan/approve-all" data-busy="جار الاعتماد…"
      data-confirm="${'اعتمد ' + AR(allDrafts) + ' منشورًا من الخطّة كلِّها وجدوِلها في مواعيدها؟ تُنشر بعدها وحدَها.'}">
      <input type="hidden" name="id" value="${m.plan.id}"><input type="hidden" name="back" value="review">
      ${raw(button({ label: 'اعتمد الخطّة كاملة (' + AR(allDrafts) + ')', type: 'submit' }))}</form>`
  return html`${raw(head)}
    <div class="row gap-2 mb-3">${state}<span class="grow"></span><a class="btn btn-secondary btn-sm" href="/panel/plan/view">اعرض واطبع</a><a class="btn btn-secondary btn-sm" href="/panel/plan/new">خطّة جديدة</a></div>
    ${progress}
    ${calendar(m, (day) => '?w=' + String(weekOfDay(m.plan.week, day)) + '#d-' + day)}
    ${weekTabs(m, shown)}
    ${gapsBar(m)}
    <form method="POST" action="/panel/plan/review/bulk" id="rv-bulk" class="rv-bulk card card-inset">
      <input type="hidden" name="id" value="${m.plan.id}"><input type="hidden" name="w" value="${w}">
      <span id="rv-n">حدّد بنودًا لفعلٍ واحدٍ عليها</span><span class="grow"></span>
      <button class="btn btn-secondary btn-sm" type="submit" name="do" value="approve">اعتمد المحدَّد</button>
      <button class="btn btn-secondary btn-sm" type="submit" name="do" value="delay">أخّرها يومًا</button>
      <button class="btn btn-danger btn-sm" type="submit" name="do" value="drop" data-confirm="أزِل البنودَ المحدَّدة من الخطّة؟">أزِلها</button>
    </form>
    <div id="rv-live" data-live="${live}">${list}</div>
    ${versions}
    <div class="rv-foot card"><span class="grow">${AR(settled)} مجدولةً من ${AR(m.cards.length)}${m.gaps.pending > 0 ? ' · ' + AR(m.gaps.pending) + ' تنتظر اعتمادك' : ''}</span>${approveWeek}${approveAll}</div>`.value
}

const weeksOf = (m: ReviewModel): number => Math.ceil(spanDays(m.plan.span ?? 'week') / 7)

/**
 * يُظهر شريطَ الجملة حين يُحدَّد شيءٌ ويعدّه — وبلا سكربتٍ يبقى ظاهرًا ويعمل. **ويعيد تحميلَ الصفحة ما دام صدى يكتب أو يرسم**
 * (D-327): كلَّ عشر ثوانٍ، وللصور اثنتي عشرةَ مرّةً على الأكثر (صورةٌ تعذّرت لا تُبقي الصفحةَ تدور). ولا يُعاد التحميلُ وشيءٌ
 * محدَّدٌ أو حوارٌ مفتوحٌ أو التبويبُ مخفيّ — فلا يضيع ما في يد المالك.
 */
export const PLAN_REVIEW_SCRIPT = `(function(){
  var bar=document.getElementById('rv-bulk'), n=document.getElementById('rv-n');
  function upd(){if(!bar||!n)return; var k=document.querySelectorAll('input[name="sel"]:checked').length; bar.hidden=k===0; n.textContent=k.toLocaleString('ar-u-nu-latn')+' محدَّدًا';}
  document.addEventListener('change',function(e){if(e.target&&e.target.name==='sel')upd();});
  upd();
  var live=document.getElementById('rv-live'), mode=live?live.getAttribute('data-live'):'';
  if(!mode)return;
  var key='sada-rv-img', tries=0;
  try{tries=mode==='image'?Number(sessionStorage.getItem(key)||'0'):0; if(mode!=='image')sessionStorage.removeItem(key);}catch(e){}
  if(mode==='image'&&tries>=12)return;
  setTimeout(function tick(){
    var busy=document.hidden||document.querySelector('input[name="sel"]:checked')||document.querySelector('dialog[open]')||document.querySelector('form[aria-busy="true"]');
    if(busy){setTimeout(tick,10000);return;}
    try{if(mode==='image')sessionStorage.setItem(key,String(tries+1));}catch(e){}
    location.reload();
  },10000);
})();`
