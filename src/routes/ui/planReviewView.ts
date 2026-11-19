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
import { btnClass, button } from './components/button'
import { menu, menuAction, menuItem } from './components/menu'
import { ICON } from './icons'
import { platformLabel } from '../../lib/oauth/providers'
import { postStatus } from '../../lib/status'
import { stamp, todayKey } from '../../lib/time/zone'
import { field } from './components/field'
import { segmented, tabs as tabBar } from './components/tabs'
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

/** وجهُ الحال من المصدر الواحد (D-340) — بمفتاحَي هذه الشاشة. */
const face = (status: string): { tone: string; text: string } => { const f = postStatus(status); return { tone: f.tone, text: f.label } }

export interface ReviewView {
  /** الأسبوعُ المطلوب من العنوان (`?w=`): رقمٌ من 1 أو «all» — وما سواهما يُحسَب. */
  readonly week?: string | null
  readonly now?: Date
  readonly orgName?: string
  /** اسمُ الحساب لكلّ منصّة — رأسُ المنشور في معاينته. */
  readonly authors?: Readonly<Record<string, string>>
  /** رابطُ العميل النافذ لهذه الخطّة (D-353): عددُه وأبعدُ انتهاء — والرمزُ لا يُعاد عرضُه. */
  readonly share?: { readonly count: number; readonly until: string | null }
  /** رأيُ العميل في كلّ بندٍ ببصمته (D-353). */
  readonly verdicts?: ReadonlyMap<string, { readonly verdict: 'approve' | 'changes'; readonly note: string }>
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
export function shownWeek(m: ReviewModel, asked: string | null | undefined, now: Date | undefined, zone: string | null = null): number {
  const weeks = Math.ceil(spanDays(m.plan.span ?? 'week') / 7)
  if (asked === 'all') return 0
  const n = Number(asked)
  if (asked !== null && asked !== undefined && Number.isInteger(n) && n >= 1 && n <= weeks) return n
  if (weeks === 1) return 1
  if (now !== undefined) {
    const today = weekOfDay(m.plan.week, todayKey(now, zone))
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
  // ‏«من المكتبة» (D-334): صورةٌ سبق رسمُها أو رفعُها تُربط بهذا المنشور بلا كلفة — رابطٌ إلى الأصول في وجه الاختيار
  const lib = raw(button({ label: 'من المكتبة', size: 'sm', href: '/panel/assets?kind=image&post=' + encodeURIComponent(c.post.id) + '&index=' + String(c.index) + (w === '' ? '' : '&w=' + encodeURIComponent(w)) }))
  if (c.mediaId === null) {
    return maySpend()
      ? html`<div class="row gap-2 rv-img"><span class="hint">بدون صورة</span><span class="grow"></span>${lib}
          <form class="inline" method="POST" action="/panel/media/generate" data-busy="تُرسم الصورة…">${back}${style}<input type="hidden" name="id" value="${c.post.id}">${raw(button({ label: 'ولّد صورة', size: 'sm', type: 'submit' }))}</form></div>`
      : html`<div class="row gap-2 rv-img"><span class="hint">بدون صورة</span><span class="grow"></span>${lib}</div>`
  }
  return html`<div class="row gap-2 rv-img"><span class="hint">الصورة</span><span class="grow"></span>${lib}
      ${maySpend() ? html`<form class="inline" method="POST" action="/panel/media/regenerate" data-busy="تُرسم الصورة…">${back}${style}<input type="hidden" name="id" value="${c.post.id}"><input type="hidden" name="media" value="${c.mediaId}">${raw(button({ label: 'بدّلها', size: 'sm', type: 'submit' }))}</form>` : html``}
      <form class="inline" method="POST" action="/panel/media/reject">${back}<input type="hidden" name="id" value="${c.mediaId}">${raw(button({ label: 'بدون صورة', size: 'sm', type: 'submit' }))}</form></div>`
}

function card(c: ReviewCard, m: ReviewModel, zone: string | null, view: ReviewView, w: string): Html {
  const planId = m.plan.id
  const local = c.item.time
  const st = c.post === null ? (c.failed !== undefined ? { tone: 'bad', text: 'تعذّرت كتابتُه' } : { tone: 'idle', text: 'تُكتب الآن' }) : face(c.post.status)
  const hidden = html`<input type="hidden" name="id" value="${planId}"><input type="hidden" name="index" value="${String(c.index)}"><input type="hidden" name="key" value="${c.key}"><input type="hidden" name="w" value="${w}">`
  const label = platformLabel(c.item.platform as never)
  const status = c.post?.status ?? ''
  // ‏والموعدُ الذي جُدولت إليه يُقال في الشارة: قد يكون أرجحَ ساعات المنصّة لا ساعةَ البند
  const when = status === 'queued' && c.post?.scheduledAt !== null && c.post?.scheduledAt !== undefined ? stamp(c.post.scheduledAt, zone).slice(5, 16) : ''
  const preview = c.post === null
    ? html`<div class="pd-pending"><p class="m-0">${c.item.angle}</p><span class="hint">${c.failed !== undefined ? 'تعذّرت كتابتُه: ' + c.failed : 'صدى يكتبه الآن — يظهر هنا وحدَه.'}</span></div>`
    : raw(nativePost({
      platform: c.item.platform as never, id: c.post.id, author: { name: view.authors?.[c.item.platform] ?? view.orgName ?? 'خطّتي', kind: null },
      text: c.post.text, when: local,
      media: c.mediaId === null ? null : { id: c.mediaId, mime: c.mediaMime ?? 'image/png', composed: true, width: c.mediaWidth ?? null, height: c.mediaHeight ?? null, small: true },
      poster: null, metrics: null, variant: 'feed',
    }))
  const approve = c.post === null || (status !== 'draft' && status !== 'approved' && status !== 'edited')
    ? html``
    : html`<form class="inline" method="POST" action="/panel/plan/review/approve" data-busy="جار…">${hidden}<input type="hidden" name="post" value="${c.post.id}"><input type="hidden" name="back" value="feed">${raw(button({ label: status === 'draft' ? 'اعتمد' : 'جدوِل', variant: 'primary', size: 'sm', type: 'submit', icon: ICON.check }))}</form>`
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
    ${clientSaid(view.verdicts?.get(c.key))}
    ${imageActs(c, m, w)}
    <div class="row gap-2 rv-acts">
      ${approve}${undo}
      ${c.post === null || status === 'published' ? html`` : html`<a class="btn btn-secondary btn-sm" href="/panel?open=${encodeURIComponent(c.post.id)}#ed" data-sheet="${String(c.index)}">عدّل</a>`}
      ${/*
        ‏**فعلٌ أوّلٌ ظاهر، والباقي في «أفعال أخرى»** (D-351 · رونق): كانت البطاقةُ ستّةَ أزرارٍ متساوية — اعتمد، وعدّل، وأخّر يومًا، وأسبوعًا،
        ‏وأزِل — فلا تقول العينُ أيّها الأهمّ. والتأخيرُ يقع بالسحب في التقويم أيضًا (D-330)، والإزالةُ حمراءُ في القائمة كما كانت في الصفّ
        ‏(مراجعة D-323: حوارُ التأكيد يقرأ الهدمَ من لونها).
      */''}
      ${status === 'published' ? html`` : raw(menu({ label: 'أفعال أخرى', variant: 'icon', size: 'sm', icon: ICON.more, items: [
        menuAction({ label: 'أخّر يومًا', action: '/panel/plan/review/delay', fields: { id: planId, index: String(c.index), key: c.key, w, days: '1' } }),
        menuAction({ label: 'أخّر أسبوعًا', action: '/panel/plan/review/delay', fields: { id: planId, index: String(c.index), key: c.key, w, days: '7' } }),
        menuAction({ label: 'أزِل', action: '/panel/plan/review/drop', danger: true, fields: { id: planId, index: String(c.index), key: c.key, w },
          confirm: 'أزِل ' + label + ' من هذا اليوم؟' + (c.post === null ? '' : status === 'queued' ? ' يُسحب موعدُ منشوره ويُرفض، ويبقى بكلفته.' : ' ومسوّدتُه تُرفض وتبقى بكلفتها.') }),
      ] }))}
    </div>
  </article>`
}

/** رأيُ العميل على البطاقة (D-353): وسمٌ بحاله، وملحوظتُه إن كتب. */
function clientSaid(v: { readonly verdict: 'approve' | 'changes'; readonly note: string } | undefined): Html {
  if (v === undefined) return html``
  return html`<div class="rv-client" data-verdict="${v.verdict}"><span class="st ${v.verdict === 'approve' ? 'ok' : 'warn'}">${v.verdict === 'approve' ? 'العميل: موافق' : 'العميل: يطلب تعديلًا'}</span>${v.note === '' ? html`` : html`<q>${v.note}</q>`}</div>`
}

/** «شارك مع العميل» (D-353): رابطٌ يُنشأ ويُعرض مرّةً، أو حالُ الرابط النافذ وإلغاؤه. */
const shareBtn = btnClass('secondary', 'sm')
function shareBox(m: ReviewModel, view: ReviewView): Html {
  const s = view.share ?? { count: 0, until: null }
  const said = view.verdicts === undefined ? 0 : [...view.verdicts.values()].length
  const changes = view.verdicts === undefined ? 0 : [...view.verdicts.values()].filter((v) => v.verdict === 'changes').length
  // ‏فعلٌ ثانويٌّ بأيقونة المشاركة (§6.2) لا طيّةٌ بعرض الصفحة: الطيُّ نفسُه «details» فيعمل بلا سكربت
  return html`<details class="rv-share"><summary class="${shareBtn}">${raw(ICON.share)}<span>شارك مع العميل${s.count > 0 ? ' · رابطٌ نافذ' : ''}${said > 0 ? ' · قال رأيه في ' + AR(said) + (changes > 0 ? '، ويطلب تعديلَ ' + AR(changes) : '') : ''}</span></summary>
    <p class="hint">رابطٌ يرى به العميلُ منشورات هذه الخطّة بشكل كلّ منصّة، ويقول في كلٍّ منها «موافق» أو «أطلب تعديلًا» بملحوظة. لا ينشر ولا يعتمد، ولا يرى شيئًا سواها. وينتهي بعد أربعة عشر يومًا، أو حين تُبنى خطّةٌ أحدث.</p>
    <div class="row gap-2">
      <form class="inline" method="POST" action="/panel/plan/share" data-busy="جار…"><input type="hidden" name="id" value="${m.plan.id}">
        ${raw(button({ label: s.count > 0 ? 'أنشئ رابطًا آخر' : 'أنشئ رابطَ العميل', variant: s.count > 0 ? 'secondary' : 'primary', type: 'submit', size: 'sm' }))}</form>
      ${s.count === 0 ? html`` : html`<span class="hint">نافذٌ حتّى ${dayLabel((s.until ?? '').slice(0, 10))}</span>
      <form class="inline" method="POST" action="/panel/plan/share/revoke" data-busy="جار…" data-confirm="يتوقّف كلُّ رابطٍ أُرسل للعميل عن العمل. أتابع؟"><input type="hidden" name="id" value="${m.plan.id}">
        ${raw(button({ label: 'ألغِ الروابط', variant: 'danger', type: 'submit', size: 'sm' }))}</form>`}
    </div></details>`
}

/**
 * تقويمُ الخطّة: كلُّ يومٍ بشعارات منصّاته وعددِ بنوده. و`hrefOf` يقول إلى أين يذهب اليوم — المراجعةُ إلى أسبوعه، والعرضُ إلى
 * موضعه في الصفحة. **واللونُ لا يقول وحدَه**: ما ينتظر يُكتب في اسم الرابط ويُعلَّم بإطارٍ متقطّع.
 */
export function calendar(m: ReviewModel, hrefOf: (day: string) => string = (day) => '#d-' + day, board?: { readonly zone: string | null; readonly cardHref: (c: ReviewCard) => string }): Html {
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
    const cards = (byDay.get(day) ?? []).sort((a, b) => a.item.time.localeCompare(b.item.time))
    const n = cards.length
    if (n === 0) {
      // ‏وفي اللوحة: اليومُ الفارغُ هدفُ إفلاتٍ أيضًا (D-330)، فيحمل تاريخَه
      cells.push(board === undefined
        ? html`<span class="rv-cd" aria-hidden="true"><b>${dayLabel(day, 'short')}</b></span>`
        : html`<div class="rv-cd is-day" data-day="${day}"><b aria-hidden="true">${dayLabel(day, 'short')}</b></div>`)
      continue
    }
    const open = cards.filter((c) => c.post === null || waits(c)).length
    const platforms = [...new Set(cards.map((c) => c.item.platform))]
    const said = html`<span>${AR(n)}<i class="vh"> ${n === 1 ? 'منشور' : 'منشورات'}${open > 0 ? '، ' + AR(open) + ' تنتظر' : '، كلُّها مجدولة'}</i></span>`
    if (board === undefined) {
      // ‏والاسمُ ممّا يُرى (WCAG 2.5.3): رقمُ اليوم والعددُ نصٌّ ظاهر، وما يشرحهما نصٌّ لقارئ الشاشة بينهما — لا `aria-label` يحجبهما
      cells.push(html`<a class="rv-cd is-on${open > 0 ? ' is-wait' : ''}" href="${hrefOf(day)}"><b>${dayLabel(day, 'short')}</b>
      <span class="rv-dots" aria-hidden="true">${platforms.map((p) => html`<span class="pf-logo rv-pf rv-dot" data-pf="${p}">${raw(LOGOS[p] ?? '')}</span>`)}</span>${said}</a>`)
      continue
    }
    /*
     * ‏**لوحةُ الشهر** (D-330): اليومُ بمصغَّرات منشوراته — صورتُها وشعارُ منصّتها وساعتُها وحالُها — لا نقطةٌ وعدد. المصغَّرةُ رابطٌ
     * ‏إلى بطاقتها في أسبوعها (فتعمل بلا سكربت)، والسكربتُ يفتح بها لوحَ البطاقة ويسحبها إلى يومٍ آخر. وما نُشر لا يُسحب.
     */
    cells.push(html`<div class="rv-cd is-on is-day${open > 0 ? ' is-wait' : ''}" data-day="${day}">
      <a class="rv-cd-h" href="${hrefOf(day)}"><b>${dayLabel(day, 'short')}</b>${said}</a>
      ${cards.map((c) => {
        const st = c.post === null ? 'writing' : waits(c) ? 'wait' : c.post.status === 'published' ? 'done' : c.post.status === 'failed' ? 'bad' : 'set'
        const text = c.post === null ? (c.failed !== undefined ? 'تعذّرت كتابتُه' : 'تُكتب الآن') : face(c.post.status).text
        const movable = c.post === null || c.post.status !== 'published'
        return html`<a class="rv-mini" href="${board.cardHref(c)}" data-sheet="${String(c.index)}" data-st="${st}"${movable ? raw(' draggable="true" data-move="' + String(c.index) + '"') : ''} data-key="${c.key}">
          ${/* ‏ولا مصغَّرةَ صورةٍ في خانة اليوم (§6.2): ‏28px لا تُقرأ، وصورةٌ لم تصل كانت أيقونةَ صورةٍ مكسورة. الشعارُ والشريطُ بلون المنصّة يقولانها */''}
          <i class="pf-stripe" data-pf="${c.item.platform}" aria-hidden="true"></i><span class="pf-logo rv-pf rv-dot" data-pf="${c.item.platform}" aria-hidden="true">${raw(LOGOS[c.item.platform] ?? '')}</span>
          <bdi class="mono">${c.item.time}</bdi><span class="rv-mini-t" aria-hidden="true">${c.item.angle}</span><i class="rv-st" aria-hidden="true"></i><span class="vh ago">${platformLabel(c.item.platform as never)}، ${text}</span></a>`
      })}
    </div>`)
  }
  return html`<nav class="rv-cal${board === undefined ? '' : ' is-board'}" aria-label="أيّام الخطّة">${['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((d) => html`<span class="rv-wd" aria-hidden="true">${d}</span>`)}${cells}</nav>`
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
const scopeName = (m: ReviewModel, shown: number): string => shown === 0 ? 'الخطّة' : weeksOf(m) === 1 ? 'الأسبوع' : 'الأسبوع ' + AR(shown)

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

/**
 * **أفعالُ الخطّة كلِّها في مكانٍ واحد** (طلبُ المالك 2026-11-15: «لا أجد طريقةً لتعديل الخطّة أو إلغائها أو إكمالها»):
 * المتابعة، والعرضُ للطباعة، وإعادةُ البناء، والإلغاء — قائمةٌ ثانويّة بجانب المنظار، والأوّليُّ في الشاشة يبقى «اعتمد».
 * والإلغاءُ نموذجٌ بلا سكربت (D-328) بتأكيدٍ يقول ما يقع، ولا يمسّ ما جُدول (يُسحب من «المنشورات» إن أراد المالك).
 */
function planActions(m: ReviewModel): Html {
  const scheduled = m.cards.filter((c) => c.post !== null && (c.post.status === 'queued' || c.post.status === 'published')).length
  const drafts = m.cards.filter((c) => c.post !== null && (c.post.status === 'draft' || c.post.status === 'approved')).length
  const keep = scheduled === 0 ? '' : ' ويبقى ما جُدول (' + AR(scheduled) + ') في موعده؛ تسحبه من «المنشورات» إن شئت.'
  // ‏«⋯» (§6.2): أفعالُ الخطّة كلِّها نادرةٌ ولا تنافس «اعتمد» — زرُّ أيقونةٍ اسمُه «أفعال الخطّة»
  return html`${raw(menu({ label: 'أفعال الخطّة', variant: 'icon', size: 'sm', icon: ICON.more, items: [
    menuItem({ label: 'تابع ما جُدول ونُشر', href: '/panel/plan/follow' }),
    menuItem({ label: 'اعرض واطبع', href: '/panel/plan/view' }),
    menuItem({ label: 'أعد بناء الخطّة', href: '/panel/plan/new' }),
    menuAction({ label: 'ألغِ الخطّة', action: '/panel/plan/cancel', fields: { id: m.plan.id }, danger: true,
      confirm: 'ألغِ هذه الخطّة؟ تُرفض مسوّداتُها التي لم تُجدوَل (' + AR(drafts) + ')' + keep }),
  ] }))}`
}

export function planReviewScreen(m: ReviewModel, zone: string | null, view: ReviewView = {}): string {
  const span = SPAN_LABEL[m.plan.span ?? 'week']
  const end = shift(m.plan.week, spanDays(m.plan.span ?? 'week') - 1)
  const shown = shownWeek(m, view.week, view.now, zone)
  const w = shown === 0 ? 'all' : String(shown)
  const state = m.lockedAt !== null
    ? html`<span class="st ok">مثبَّتة · الإصدار ${AR(m.version)}</span>`
    : m.versions.length > 0
      ? html`<span class="st warn">عُدّلت بعد التثبيت · الإصدار ${AR(m.version)} غير مثبَّت</span>`
      : html`<span class="st idle">مسوّدة · الإصدار ${AR(m.version)}</span>`
  // ‏بلا لصيقةٍ فوق العنوان (§8 «رأسٌ واحد بلا روابط رجوع»): «المنشورات» فوق «خطّةُ النشر» كانت فتاتَ خبزٍ في ثوبٍ آخر، والموضعُ في الرافدة
  const head = pageHead('', 'خطّةُ النشر', span + ' · ' + dayLabel(m.plan.week) + ' – ' + dayLabel(end))
  const written = m.cards.filter((c) => c.post !== null).length
  // ‏ما تعذّر لا يُنتظر (PL-23): يُقال سببُه ومعه «أعد كتابة ما تعذّر»، والصفحةُ لا تتحدّث له
  const failed = m.cards.filter((c) => c.post === null && c.failed !== undefined)
  const inFlight = m.cards.length - written - failed.length
  const settled = m.cards.filter((c) => c.post !== null && (c.post.status === 'queued' || c.post.status === 'published')).length
  // ‏ما يُكتب أو يُرسم الآن: الصفحةُ تعيد تحميلَ نفسها ما دام شيءٌ في الطريق (السكربتُ يقرأ `data-live`)
  const live = inFlight > 0 ? 'write' : m.gaps.no_image > 0 ? 'image' : ''
  const progress = html`<div class="rv-progress">
      <progress class="rv-prog" max="${String(Math.max(1, m.cards.length))}" value="${String(settled)}" aria-label="${'مجدولٌ أو منشور: ' + AR(settled) + ' من ' + AR(m.cards.length)}"></progress>
      <span class="hint" role="status">${inFlight > 0
        ? 'صدى يكتب الباقي الآن بصوره، والصفحةُ تتحدّث وحدَها.'
        : failed.length > 0
        ? 'تعذّرت كتابةُ ' + AR(failed.length) + ': ' + failed[0]!.failed!
        : AR(settled) + ' من ' + AR(m.cards.length) + ' مجدولةٌ أو منشورة' + (m.gaps.pending > 0 ? ' · ' + AR(m.gaps.pending) + ' تنتظر اعتمادك' : '')}</span>
      ${inFlight === 0 && failed.length > 0 ? html`<form class="inline" method="POST" action="/panel/plan/review/redraft"><input type="hidden" name="id" value="${m.plan.id}">${raw(button({ label: 'أعد كتابة ما تعذّر (' + AR(failed.length) + ')', variant: 'secondary', size: 'sm', type: 'submit' }))}</form>` : html``}</div>`
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
  // ‏عرضُ القائمة (D-337): المعروضُ نفسُه جدولًا مضغوطًا — يومٌ وساعةٌ ومنصّةٌ وحالٌ وأوّلُ النصّ، والصفُّ يفتح لوحَ بطاقته.
  // ‏تبديلُ المنظار بالسكربت وحدَه (D-328)، وبلا سكربتٍ البطاقاتُ كما هي والجدولُ مخفيّ
  const rows = visible.map((c) => {
    const st = c.post === null ? (c.failed !== undefined ? { tone: 'bad', text: 'تعذّرت كتابتُه' } : { tone: 'idle', text: 'تُكتب الآن' }) : face(c.post.status)
    const text = c.post === null ? c.item.angle : c.post.text.replace(/\s+/g, ' ').trim()
    return html`<tr><td><span class="ago">${dayLabel(c.item.day, 'short')}</span> <bdi dir="ltr" class="mono">${c.item.time}</bdi></td>
      <td>${platformLabel(c.item.platform as never)}</td><td><span class="st ${st.tone}">${st.text}</span></td>
      <td><a href="#c-${String(c.index)}" data-sheet="${String(c.index)}">${text.length > 80 ? text.slice(0, 80) + '…' : text}</a></td></tr>`
  })
  const table = visible.length === 0 ? html`` : html`<div class="scroll rv-list"><table><caption class="vh">منشوراتُ ${scopeName(m, shown)} قائمةً</caption>
      <thead><tr><th scope="col">الموعد</th><th scope="col">المنصّة</th><th scope="col">الحال</th><th scope="col">المنشور</th></tr></thead><tbody>${rows}</tbody></table></div>`
  // ‏مقطعٌ (segmented · §6.2) لا زرّان متساويان: اختيارٌ واحدٌ من اثنين، بلغة «الاختيار» في D-189
  const toggle = html`<span class="rv-vw" hidden>${raw(segmented('طريقة العرض', 'view', [{ value: 'cards', label: 'بطاقات', pressed: true }, { value: 'list', label: 'قائمة' }]))}</span>`
  // ‏تبويباتُ الخطّة تحت العنوان (§6.2): ثلاثُ صفحاتٍ لشيءٍ واحد، فالتنقّلُ بينها بلغة التنقّل
  const sub = tabBar('صفحات الخطّة', [
    { label: 'الخطّة', href: '/panel/plan/review', current: true },
    { label: 'عرض للطباعة', href: '/panel/plan/view' },
    { label: 'خطّة جديدة', href: '/panel/plan/new' },
  ])
  const versions = m.versions.length === 0 ? html`` : html`<details class="fold mt-4"><summary><span>الإصدارات المحفوظة (${AR(m.versions.length)})</span></summary>
      <ul class="plain">${m.versions.map((v) => html`<li>الإصدار ${AR(v.version)} — ثُبّت ${stamp(v.lockedAt, zone)}، ${AR(v.items)} بندًا، جُدول منها ${AR(v.scheduled)}${v.lockedBy === null ? '' : ' · ' + v.lockedBy}</li>`)}</ul></details>`
  // ‏«اعتمد الأسبوع»: مسوّداتُ المعروض كلُّها بنموذج الجملة نفسِه — لا طريقَ ثانيًا حول فحص الاعتماد
  const weekDrafts = visible.filter((c) => c.post !== null && c.post.status === 'draft')
  const allDrafts = m.gaps.pending
  const scope = scopeName(m, shown)
  // ‏زرٌّ واحدٌ في الذيل (D-387): «اعتمد الأسبوع» يعتمد ويجدول في المواعيد، ويعود إلى التيّار (`back=feed`). وكان بجواره
  // ‏«اعتمد الخطّة كاملة» ثانيًا؛ فصار في رأس التيّار «اعتمد كلّ ما ينتظر» وحدَه
  const approveWeek = weekDrafts.length === 0 ? html`` : html`<form class="inline" method="POST" action="/panel/plan/review/bulk" data-busy="جار الاعتماد…" data-away
      data-confirm="${'اعتمد ' + AR(weekDrafts.length) + (weekDrafts.length === 1 ? ' منشورًا' : ' منشورات') + ' كما كُتبت وجدوِلها في مواعيدها؟ تُنشر بعدها وحدَها.'}">
      <input type="hidden" name="id" value="${m.plan.id}"><input type="hidden" name="w" value="${w}"><input type="hidden" name="back" value="feed">
      ${weekDrafts.map((c) => html`<input type="hidden" name="sel" value="${String(c.index)}|${c.key}|${c.post?.id ?? ''}">`)}
      ${raw(button({ label: 'اعتمد ' + scope + ' (' + AR(weekDrafts.length) + ')', variant: 'primary', type: 'submit', name: 'do', value: 'approve', icon: ICON.check }))}</form>`
  const rest = allDrafts <= weekDrafts.length ? html`` : html`<span class="hint">و${AR(allDrafts - weekDrafts.length)} في أسابيعَ أخرى — من رأس التيّار كلُّها</span>`
  // ‏«أضف منشورًا» (D-336): يومٌ من المعروض، ومنصّةٌ من قنوات الخطّة، وساعةٌ بتوقيت المالك، وجملةٌ تقول ما يقوله — نموذجٌ إلى مساره
  const channels = [...new Set([...m.plan.choices.channels, ...m.cards.map((c) => c.item.platform)])]
  const firstDay = shown === 0 ? m.plan.week : shift(m.plan.week, (shown - 1) * 7)
  const lastDay = shown === 0 ? end : [shift(firstDay, 6), end].sort()[0]!
  const today = todayKey(view.now ?? new Date(), zone)
  const addDay = today >= firstDay && today <= lastDay ? today : firstDay
  const add = channels.length === 0 ? html`` : html`<details class="fold rv-add"><summary><span>أضف منشورًا إلى ${scope}</span></summary>
      <form method="POST" action="/panel/plan/review/add" class="rv-add-f" data-busy="يُضاف…">
        <input type="hidden" name="id" value="${m.plan.id}"><input type="hidden" name="w" value="${w}">
        ${raw(field({ id: 'rv-add-angle', label: 'ما يقوله المنشور', hint: 'جملةٌ واحدة — صدى يكتب المنشورَ منها ومن مصادر الخطّة.', control: html`<input type="text" id="rv-add-angle" name="angle" maxlength="200" required>`.value }))}
        <div class="row">
          ${raw(field({ id: 'rv-add-p', label: 'المنصّة', control: html`<select id="rv-add-p" name="platform">${channels.map((p) => html`<option value="${p}">${platformLabel(p as never)}</option>`)}</select>`.value }))}
          ${raw(field({ id: 'rv-add-day', label: 'اليوم', control: html`<input type="date" id="rv-add-day" name="day" value="${addDay}" min="${firstDay}" max="${lastDay}" dir="ltr" required>`.value }))}
          ${raw(field({ id: 'rv-add-time', label: 'الساعة بتوقيتك', control: html`<input type="time" id="rv-add-time" name="time" value="09:00" dir="ltr" required>`.value }))}
          ${raw(button({ label: 'أضف واكتبه', variant: 'primary', type: 'submit' }))}
        </div>
      </form></details>`
  /*
   * ‏**زرُّ سطر الحالة الأوّليّ** (§6.2): «تابع الكتابة» إلى أوّل بندٍ يحتاج يدَ المالك — لم يُكتب، أو كُتب وينتظر قرارَه — في أسبوعه.
   * ‏رابطٌ لا نموذج: الكتابةُ تجري وحدَها، والمالكُ يتابع من حيث وقفت. وحين لا شيء ينتظر لا زرّ: الحالُ تقول ذلك
   */
  const due = [...m.cards].filter((c) => (c.post === null && c.failed === undefined) || waits(c))
    .sort((a, b) => (a.item.day + a.item.time).localeCompare(b.item.day + b.item.time))[0]
  const next = due === undefined ? html`` : raw(button({ label: 'تابع الكتابة', variant: 'primary', size: 'sm', href: '?w=' + String(weekOfDay(m.plan.week, due.item.day)) + '#c-' + String(due.index) }))
  const weekHref = (day: string): string => '?w=' + String(weekOfDay(m.plan.week, day)) + '#d-' + day
  return html`${raw(head)}
    <div id="rv-root" data-live="${live}" data-plan="${m.plan.id}" data-w="${w}">
    ${raw(sub)}
    <div class="row gap-2 mb-3 rv-status">${state}<span class="hint">كُتب ${AR(written)} من ${AR(m.cards.length)}</span>${next}<span class="grow"></span>${toggle}${shareBox(m, view)}${planActions(m)}</div>
    ${progress}
    ${calendar(m, weekHref, { zone, cardHref: (c) => '?w=' + String(weekOfDay(m.plan.week, c.item.day)) + '#c-' + String(c.index) })}
    ${weekTabs(m, shown)}
    ${gapsBar(m)}
    <form method="POST" action="/panel/plan/review/bulk" id="rv-bulk" class="rv-bulk card card-inset">
      <input type="hidden" name="id" value="${m.plan.id}"><input type="hidden" name="w" value="${w}"><input type="hidden" name="back" value="feed">
      <span id="rv-n">حدّد بنودًا لفعلٍ واحدٍ عليها</span><span class="grow"></span>
      <button class="btn btn-secondary btn-sm" type="submit" name="do" value="approve" data-away>اعتمد المحدّد</button>
      <button class="btn btn-secondary btn-sm" type="submit" name="do" value="delay">أخّرها يومًا</button>
      <button class="btn btn-danger btn-sm" type="submit" name="do" value="drop" data-confirm="أزِل البنودَ المحدَّدة من الخطّة؟">أزِلها</button>
    </form>
    <div class="rv-days">${list}</div>
    ${table}
    ${add}
    ${versions}
    <div class="rv-foot card"><span class="grow">${AR(settled)} مجدولةً من ${AR(m.cards.length)}${m.gaps.pending > 0 ? ' · ' + AR(m.gaps.pending) + ' تنتظر اعتمادك' : ''}</span>${rest}${approveWeek}</div>
    </div>
    ${/* ‏لوحُ البطاقة (D-330): «<dialog>» أصليّ يحبس التركيزَ ويُغلق بـEsc، يملؤه السكربتُ من `/panel/plan/review/card` */''}
    <dialog class="rv-sheet" id="rv-sheet" aria-labelledby="rv-sh-t"></dialog>`.value
}

/**
 * **لوحُ البطاقة** (D-330) — بندٌ واحدٌ بكلّ ما يُفعل به: معاينتُه بشكل منصّته، ونصُّه يُكتب ويُحفظ في مكانه، وصورتُه، وموعدُه
 * (يومٌ وساعةٌ بتوقيت المالك)، وأفعالُه. جزءُ صفحةٍ يطلبه السكربتُ، **ونماذجُه هي نماذجُ البطاقة نفسُها إلى مساراتها** — فلا
 * طريقَ ثانيًا حول حارس (D-328). و`null` لرقمٍ لا بندَ له (حُذف منذ فُتحت الصفحة).
 */
export function planSheet(m: ReviewModel, index: number, zone: string | null, view: ReviewView = {}): string | null {
  const c = Number.isInteger(index) ? m.cards.find((x) => x.index === index) : undefined
  if (c === undefined) return null
  const w = view.week === 'all' ? 'all' : String(weekOfDay(m.plan.week, c.item.day))
  const order = [...m.cards].sort((a, b) => (a.item.day + a.item.time).localeCompare(b.item.day + b.item.time))
  const at = order.findIndex((x) => x.index === c.index)
  const prev = order[at - 1], next = order[at + 1]
  const label = platformLabel(c.item.platform as never)
  const status = c.post?.status ?? ''
  const st = c.post === null ? (c.failed !== undefined ? { tone: 'bad', text: 'تعذّرت كتابتُه' } : { tone: 'idle', text: 'تُكتب الآن' }) : face(status)
  // ‏البندُ بتوقيت المالك كما هو (D-384)
  const localDay = c.item.day
  const localTime = c.item.time
  const hidden = html`<input type="hidden" name="id" value="${m.plan.id}"><input type="hidden" name="index" value="${String(c.index)}"><input type="hidden" name="key" value="${c.key}"><input type="hidden" name="w" value="${w}">`
  const preview = c.post === null
    ? html`<div class="pd-pending"><p class="m-0">${c.item.angle}</p><span class="hint">${c.failed !== undefined ? 'تعذّرت كتابتُه: ' + c.failed : 'صدى يكتبه الآن — يظهر هنا وحدَه.'}</span></div>`
    : raw(nativePost({
      platform: c.item.platform as never, id: c.post.id, author: { name: view.authors?.[c.item.platform] ?? view.orgName ?? 'خطّتي', kind: null },
      text: c.post.text, when: localTime,
      media: c.mediaId === null ? null : { id: c.mediaId, mime: c.mediaMime ?? 'image/png', composed: true, width: c.mediaWidth ?? null, height: c.mediaHeight ?? null },
      poster: null, metrics: null, variant: 'feed',
    }))
  const edit = c.post === null
    ? html``
    : status === 'draft'
      ? html`<form method="POST" action="/panel/plan/review/text" class="stack" data-busy="جار الحفظ…">${hidden}<input type="hidden" name="post" value="${c.post.id}">
          ${raw(field({ id: 'rv-sh-text', label: 'النصّ', hint: 'اكتب هنا ثمّ احفظ — يبقى مسوّدةً حتّى تعتمده.',
            control: html`<textarea id="rv-sh-text" name="text" rows="7" dir="auto">${c.post.text}</textarea>`.value }))}
          ${/* ‏رقائقُ الهاشتاق (D-336): يملؤها السكربتُ من النصّ نفسِه — ضغطةٌ تُزيل الوسمَ من النصّ، والحفظُ بالنموذج كما هو */''}
          <div class="rv-tags" id="rv-sh-tags" role="group" aria-label="هاشتاقات المنشور — اضغط وسمًا لتُزيله من النصّ"></div>
          <div class="row gap-2">${raw(button({ label: 'احفظ النصّ', size: 'sm', type: 'submit' }))}</div></form>`
      : status === 'published'
        ? html``
        : html`<p class="hint m-0">${status === 'queued' ? 'مجدولة — «تراجَع» يعيدها مسوّدةً لتعدّل نصَّها.' : 'معتمَدة — نصُّها يُعدَّل من محرّرها.'}</p>`
  const move = status === 'published'
    ? html``
    : html`<form method="POST" action="/panel/plan/review/move" class="stack" data-busy="جار النقل…">${hidden}
        <div class="rv-sh-when">
          ${raw(field({ id: 'rv-sh-day', label: 'اليوم', control: html`<input type="date" id="rv-sh-day" name="day" value="${localDay}" min="${m.plan.week}" max="${shift(m.plan.week, spanDays(m.plan.span ?? 'week') - 1)}" dir="ltr">`.value }))}
          ${raw(field({ id: 'rv-sh-time', label: 'الساعة بتوقيتك', control: html`<input type="time" id="rv-sh-time" name="time" value="${localTime}" dir="ltr">`.value }))}
        </div>
        <div class="row gap-2">${raw(button({ label: 'انقل الموعد', size: 'sm', type: 'submit' }))}</div></form>`
  const approve = c.post === null || (status !== 'draft' && status !== 'approved' && status !== 'edited')
    ? html``
    : html`<form class="inline" method="POST" action="/panel/plan/review/approve" data-busy="جار…">${hidden}<input type="hidden" name="post" value="${c.post.id}"><input type="hidden" name="back" value="feed">${raw(button({ label: status === 'draft' ? 'اعتمد' : 'جدوِل', variant: 'primary', type: 'submit', icon: ICON.check }))}</form>`
  const undo = c.post === null || status !== 'queued'
    ? html``
    : html`<form class="inline" method="POST" action="/panel/plan/review/undo" data-busy="جار…">${hidden}<input type="hidden" name="post" value="${c.post.id}">${raw(button({ label: 'تراجَع عن الاعتماد', type: 'submit' }))}</form>`
  const drop = status === 'published'
    ? html`<span class="hint">نُشر هذا المنشور، فلا يُعدَّل من الخطّة.</span>`
    : html`<form class="inline" method="POST" action="/panel/plan/review/drop" data-confirm="${'أزِل ' + label + ' من هذا اليوم؟' + (c.post === null ? '' : status === 'queued' ? ' يُسحب موعدُ منشوره ويُرفض، ويبقى بكلفته.' : ' ومسوّدتُه تُرفض وتبقى بكلفتها.')}">${hidden}${raw(button({ label: 'أزِل', variant: 'danger', type: 'submit', icon: ICON.close }))}</form>`
  // ‏السابقُ والتالي بترتيب الموعد — روابطُ إلى بطاقتيهما (تعمل بلا سكربت)، والسكربتُ يملأ بهما اللوح
  const nav = (x: ReviewCard | undefined, text: string, icon: string): string => x === undefined
    ? ''
    : button({ label: text, variant: 'icon', icon, href: '?w=' + String(weekOfDay(m.plan.week, x.item.day)) + '#c-' + String(x.index), attrs: 'data-sheet="' + String(x.index) + '"' })
  const before = nav(prev, 'البند السابق', ICON.go)
  const after = nav(next, 'البند التالي', ICON.back)
  // ‏من المنشور إلى أصله (D-345): مصدرُه في المكتبة، ورحلتُه بعد أن يُجدول أو يُنشر — ضغطةٌ واحدةٌ لكلٍّ منهما
  const srcName = m.sourceNames?.[c.item.sourceId]
  const origin = srcName === undefined && (c.post === null || (status !== 'queued' && status !== 'published'))
    ? html``
    : html`<p class="hint m-0">${srcName === undefined ? html`` : html`كُتب من <a href="/panel/library#sources">${srcName}</a>`}${
        c.post !== null && (status === 'queued' || status === 'published') ? html`${srcName === undefined ? '' : ' · '}<a href="/panel/journey/${c.post.id}">رحلةُ المنشور</a>` : html``}</p>`
  return html`<div class="rv-sh" data-index="${String(c.index)}">
    <header class="rv-sh-h">
      <span class="pf-logo rv-pf" data-pf="${c.item.platform}" aria-hidden="true">${raw(LOGOS[c.item.platform] ?? '')}</span>
      <h2 class="rv-sh-t" id="rv-sh-t">${label} · ${dayLabel(localDay)}</h2>
      <span class="st ${st.tone}">${st.text}</span>
      <span class="grow"></span>
      ${raw(before)}${raw(after)}
      ${raw(button({ label: 'أغلق', variant: 'icon', icon: ICON.close, attrs: 'data-sheet-close' }))}
    </header>
    <div class="rv-sh-b">
      <div class="rv-pv">${preview}</div>
      ${c.post === null || c.item.why === 'من خطّتك المرفوعة' ? html`` : html`<p class="hint m-0">الزاوية: ${c.item.angle}</p>`}
      ${origin}
      ${edit}
      ${imageActs(c, m, w)}
      ${move}
    </div>
    <footer class="rv-sh-f">${approve}${undo}${drop}</footer>
  </div>`.value
}

const weeksOf = (m: ReviewModel): number => Math.ceil(spanDays(m.plan.span ?? 'week') / 7)

/**
 * **سكربتُ شاشة الخطّة** (D-330، بقرار D-328) — طبقةٌ فوق صفحةٍ أفعالُها نماذجُ تعمل بدونه:
 *
 * ١ · **الأفعالُ بلا إعادة تحميل**: نموذجٌ داخل `#rv-root` أو اللوح يُرسَل بـ`fetch` **إلى مساره نفسِه بحقوله نفسِها** (CSRF وحرّاسُ
 *     الخادم كما هي)، والخادمُ يردّ كما يردّ دائمًا (ينفّذ ويحوّل إلى الشاشة)، فتُجلب الشاشةُ ويُؤخذ منها `#rv-root` والإشعار. **لا قرارَ هنا**:
 *     ما يُرسَم هو ما رسمه الخادمُ مهرَّبًا. وردٌّ ليس الشاشةَ (جلسةٌ انتهت، خطأ) يفتح الشاشةَ بـGET ولا يُعيد الإرسال.
 * ٢ · **لوحُ البطاقة**: `[data-sheet]` يفتح `<dialog>` أصليًّا (تركيزٌ محبوس وEsc) ويملؤه من `/panel/plan/review/card`.
 * ٣ · **السحبُ بين الأيّام**: مصغَّرةٌ تُسحب إلى يومٍ آخر فيُرسَل `/panel/plan/review/move` — والحكمُ في الخادم (المدى، والماضي، وما أُرسل).
 * ٤ · **تحديثٌ حيّ**: ما دام صدى يكتب أو يرسم (`data-live`) تُجلب الشاشةُ كلَّ ثماني ثوانٍ ويُبدَّل جسدُها — لا إعادةَ تحميل.
 *     وللصور خمسَ عشرةَ مرّةً على الأكثر، ولا تبديلَ وشيءٌ محدَّدٌ أو اللوحُ مفتوحٌ أو التبويبُ مخفيّ.
 *
 * وسؤالُ التأكيد من `CONFIRM_SCRIPT` (في طور الالتقاط على الوثيقة) يسبق هذا، فما يُبدَّل داخلٌ فيه بلا ربطٍ جديد.
 */
export const PLAN_REVIEW_SCRIPT = `(function(){
  var root=document.getElementById('rv-root'); if(!root)return;
  var sheet=document.getElementById('rv-sheet'), openI=null, flying=false;
  var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  function vt(fn){ if(document.startViewTransition&&!calm){document.startViewTransition(fn);} else fn(); }
  function upd(){var bar=document.getElementById('rv-bulk'), n=document.getElementById('rv-n'); if(!bar||!n)return;
    var k=root.querySelectorAll('input[name="sel"]:checked').length; bar.hidden=k===0; n.textContent=k.toLocaleString('ar-u-nu-latn')+' محدَّدًا';}
  document.addEventListener('change',function(e){if(e.target&&e.target.name==='sel')upd();});
  upd(); view(); setTimeout(function(){root.setAttribute('data-seen','1');},700);
  // ‏منظارُ العرض (D-337): بطاقاتٌ أو قائمة — يُحفظ في المتصفّح وحدَه (تفضيلُ عرضٍ لا بيان)، ويُعاد بعد كلّ تحديثٍ حيّ
  function view(set){
    var v=set||root.getAttribute('data-view'); if(!v){try{v=localStorage.getItem('rv-view');}catch(_){} }
    if(v!=='list')v='cards';
    root.setAttribute('data-view',v);
    if(set){try{localStorage.setItem('rv-view',v);}catch(_){}}
    var g=root.querySelector('.rv-vw'); if(!g)return; g.hidden=false;
    g.querySelectorAll('[data-view]').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-view')===v));});
  }
  document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('.rv-vw [data-view]'):null; if(b)view(b.getAttribute('data-view'));});
  function here(){return '/panel/plan/review'+location.search;}
  // ‏الإشعارُ من ردّ الخادم كما رسمه؛ ويذهب وحدَه بعد ستّ ثوانٍ إلّا الخطأ
  var flashT=null;
  function say(doc){
    var f=doc.getElementById('flash'); if(!f||!f.innerHTML.trim())return;
    var box=document.getElementById('flash');
    if(!box){box=document.createElement('div'); box.id='flash'; box.setAttribute('role','status'); box.setAttribute('aria-live','polite'); root.parentNode.appendChild(box);}
    box.innerHTML=f.innerHTML; box.classList.add('toast');
    clearTimeout(flashT); if(!box.querySelector('.toast-note.bad'))flashT=setTimeout(function(){box.innerHTML='';},6000);
  }
  function adopt(text,quiet){
    // ‏أنماطُ الردّ وسكربتاتُه لا تلزم ولا تُحلَّل: ما يُؤخذ منه جسدُ الشاشة وإشعارُها وحدهما (وCSP تردّ نمطًا بلا nonce هذه الصفحة)
    var doc=new DOMParser().parseFromString(text.replace(/<(style|script)\\b[\\s\\S]*?<\\/\\1>/gi,''),'text/html'), next=doc.getElementById('rv-root');
    if(!next)return false;
    var picked=[]; root.querySelectorAll('input[name="sel"]:checked').forEach(function(x){picked.push(x.value);});
    // ‏settle (D-341): ما تبدّلت حالُه بين الرسمين تنبض شارتُه مرّةً — الفعلُ يُرى أثرُه حيث وقع
    var was={}; root.querySelectorAll('.rv[id]').forEach(function(a){var s=a.querySelector('.st'); was[a.id]=s?s.textContent:'';});
    vt(function(){
      root.innerHTML=next.innerHTML;
      ['data-live','data-plan','data-w'].forEach(function(a){root.setAttribute(a,next.getAttribute(a)||'');});
      root.querySelectorAll('input[name="sel"]').forEach(function(x){if(picked.indexOf(x.value)>=0)x.checked=true;});
      root.querySelectorAll('.rv[id]').forEach(function(a){var s=a.querySelector('.st'); if(s&&was[a.id]!==undefined&&was[a.id]!==s.textContent)s.classList.add('m-settle');});
      upd(); view();
    });
    if(!quiet)say(doc);
    return true;
  }
  // ‏فعلٌ يقع والسابقُ في الطريق يصطفّ ولا يسقط: سحبٌ بعد «اعتمد» مباشرةً كان يُهمَل بصمت
  var queue=[];
  // ‏و«away» (D-387): «اعتمد الأسبوع» و«اعتمد المحدّد» تهبط في التيّار بعد الردّ، كما تفعل بلا سكربت؛ والبطاقةُ واللوحُ يبقيان في الورشة
  function post(url,body,form,away){
    if(flying){queue.push([url,body,form,away]); return;}
    flying=true; if(form)form.setAttribute('aria-busy','true');
    // ‏التحويلُ لا يُتبَع (كأفعال اللوحة، D-207): الخادمُ نفّذ وحوّل — فتُجلب الشاشةُ بـGET منفصل. وما ليس تحويلًا (جلسةٌ انتهت، خطأ) يفتحها كما هي
    fetch(url,{method:'POST',body:body,credentials:'same-origin',redirect:'manual'})
      .then(function(r){ if(r.type!=='opaqueredirect')throw new Error('away'); if(away){location.href='/panel/feed'; return new Promise(function(){});} return fetch(here(),{credentials:'same-origin'}); })
      .then(function(r){ if(!r.ok)throw new Error('away'); return r.text(); })
      .then(function(t){ if(!adopt(t,false))throw new Error('shape'); if(openI!==null)return fill(openI,true); })
      .catch(function(){ location.href=here(); })
      .then(function(){ flying=false; if(form)form.removeAttribute('aria-busy'); var n=queue.shift(); if(n)post(n[0],n[1],n[2],n[3]); });
  }
  document.addEventListener('submit',function(e){
    var f=e.target; if(e.defaultPrevented||!f||!f.closest)return;
    if(!(f.closest('#rv-root')||f.closest('#rv-sheet'))||String(f.method).toLowerCase()!=='post')return;
    e.preventDefault();
    var body=new FormData(f), s=e.submitter; if(s&&s.name)body.append(s.name,s.value);
    post(f.action,body,f,f.hasAttribute('data-away')||!!(s&&s.hasAttribute('data-away')));
  });

  // ‏لوحُ البطاقة
  // ‏رقائقُ الهاشتاق (D-336): تُقرأ من نصّ المسوّدة وتُرسم بـtextContent — لا innerHTML بنصّ المستخدم (D-328)
  function words(line){return line.split(' ').join(String.fromCharCode(9)).split(String.fromCharCode(9));}
  function tags(){
    var box=document.getElementById('rv-sh-tags'), ta=document.getElementById('rv-sh-text'); if(!box||!ta)return;
    var seen=[]; ta.value.split(String.fromCharCode(10)).forEach(function(l){words(l).forEach(function(x){if(x.charAt(0)==='#'&&x.length>1&&seen.indexOf(x)<0)seen.push(x);});});
    while(box.firstChild)box.removeChild(box.firstChild);
    seen.forEach(function(t){
      var b=document.createElement('button'); b.type='button'; b.className='rv-tag'; b.setAttribute('data-tag',t);
      var s=document.createElement('span'); s.textContent=t; b.appendChild(s);
      var x=document.createElement('span'); x.className='vh'; x.textContent=' — أزِله من النصّ'; b.appendChild(x);
      box.appendChild(b);
    });
  }
  document.addEventListener('input',function(e){if(e.target&&e.target.id==='rv-sh-text')tags();});
  document.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('.rv-tag'):null, ta=document.getElementById('rv-sh-text'); if(!b||!ta)return;
    var t=b.getAttribute('data-tag');
    ta.value=ta.value.split(String.fromCharCode(10)).map(function(l){return l.split(' ').filter(function(x){return x!==t;}).join(' ');}).join(String.fromCharCode(10)).replace(new RegExp('[ '+String.fromCharCode(10)+']+$'),'');
    tags(); ta.focus();
  });
  function shut(){openI=null; if(sheet&&sheet.open)sheet.close(); if(sheet)sheet.innerHTML='';}
  function fill(i,keep){
    if(!sheet||typeof sheet.showModal!=='function')return Promise.resolve(false);
    return fetch('/panel/plan/review/card?i='+encodeURIComponent(i)+'&w='+encodeURIComponent(root.getAttribute('data-w')||''),{credentials:'same-origin'})
      .then(function(r){ if(!r.ok)throw new Error('gone'); return r.text(); })
      .then(function(t){
        var typing=keep&&sheet.contains(document.activeElement)&&/^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName);
        if(typing)return true;
        sheet.innerHTML=t; openI=i; if(!sheet.open)sheet.showModal(); tags();
        var x=sheet.querySelector('[data-sheet-close]'); if(x&&!keep)x.focus();
        return true;
      })
      .catch(function(){ shut(); return false; });
  }
  if(sheet){
    sheet.addEventListener('close',function(){openI=null; sheet.innerHTML='';});
    sheet.addEventListener('click',function(e){ if(e.target===sheet||(e.target.closest&&e.target.closest('[data-sheet-close]')))shut(); });
  }
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('[data-sheet]'):null;
    if(!a||e.metaKey||e.ctrlKey||e.shiftKey||!sheet||typeof sheet.showModal!=='function')return;
    e.preventDefault(); fill(a.getAttribute('data-sheet'),false);
  });

  // ‏السحبُ بين الأيّام — على ما يُسحب بالمؤشّر؛ واللمسُ ينقل من لوح البطاقة
  var drag=null;
  function csrf(){var x=root.querySelector('input[name="_csrf"]'); return x?x.value:'';}
  document.addEventListener('dragstart',function(e){
    var m=e.target&&e.target.closest?e.target.closest('.rv-mini[data-move]'):null; if(!m)return;
    drag={index:m.getAttribute('data-move'),key:m.getAttribute('data-key'),from:m.closest('[data-day]')};
    m.classList.add('is-drag'); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',drag.index);}catch(x){}
  });
  document.addEventListener('dragend',function(){drag=null; root.querySelectorAll('.is-over,.is-drag').forEach(function(n){n.classList.remove('is-over','is-drag');});});
  document.addEventListener('dragover',function(e){
    var d=e.target&&e.target.closest?e.target.closest('.rv-cal [data-day]'):null; if(!d||!drag)return;
    e.preventDefault(); root.querySelectorAll('.is-over').forEach(function(n){if(n!==d)n.classList.remove('is-over');}); d.classList.add('is-over');
  });
  document.addEventListener('drop',function(e){
    var d=e.target&&e.target.closest?e.target.closest('.rv-cal [data-day]'):null; if(!d||!drag)return;
    e.preventDefault(); var g=drag; drag=null; if(g.from===d)return;
    var body=new FormData(); body.append('_csrf',csrf()); body.append('id',root.getAttribute('data-plan')||''); body.append('index',g.index);
    body.append('key',g.key||''); body.append('day',d.getAttribute('data-day')); body.append('w',root.getAttribute('data-w')||'');
    post('/panel/plan/review/move',body,null);
  });

  // ‏السحبُ باللمس (D-336): ضغطةٌ مطوّلةٌ على مصغَّرةٍ تحملها، والإفلاتُ على يومٍ ينقلها — بالطلب نفسِه إلى المسار نفسِه.
  // ‏وقبل أن تُحمَل: الإصبعُ يمرّر الصفحةَ كعادته، والنقرةُ تفتح اللوح
  var hold=null, held=null, over=null, ate=false;
  function drop(){ if(hold){clearTimeout(hold); hold=null;} if(held)held.el.classList.remove('is-held'); if(over)over.classList.remove('is-over'); held=null; over=null; }
  document.addEventListener('touchstart',function(e){
    var m=e.target&&e.target.closest?e.target.closest('.rv-mini[data-move]'):null; drop(); if(!m||e.touches.length!==1)return;
    var t=e.touches[0], x=t.clientX, y=t.clientY;
    hold=setTimeout(function(){ hold=null; held={el:m,index:m.getAttribute('data-move'),key:m.getAttribute('data-key'),from:m.closest('[data-day]'),x:x,y:y}; m.classList.add('is-held'); if(navigator.vibrate)navigator.vibrate(10); },380);
    m._x=x; m._y=y;
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    var t=e.touches[0]; if(!t)return;
    if(hold){ var m=e.target&&e.target.closest?e.target.closest('.rv-mini[data-move]'):null; if(!m||Math.abs(t.clientX-m._x)>8||Math.abs(t.clientY-m._y)>8)drop(); return; }
    if(!held)return;
    e.preventDefault();
    var el=document.elementFromPoint(t.clientX,t.clientY), d=el&&el.closest?el.closest('.rv-cal [data-day]'):null;
    if(over&&over!==d)over.classList.remove('is-over'); over=d; if(d)d.classList.add('is-over');
  },{passive:false});
  document.addEventListener('touchend',function(e){
    if(!held){drop(); return;}
    var g=held, d=over; drop(); ate=true; setTimeout(function(){ate=false;},400); e.preventDefault();
    if(!d||d===g.from)return;
    var body=new FormData(); body.append('_csrf',csrf()); body.append('id',root.getAttribute('data-plan')||''); body.append('index',g.index);
    body.append('key',g.key||''); body.append('day',d.getAttribute('data-day')); body.append('w',root.getAttribute('data-w')||'');
    post('/panel/plan/review/move',body,null);
  },{passive:false});
  document.addEventListener('touchcancel',drop);
  // ‏والنقرةُ التي تلي الإفلات لا تفتح اللوح
  document.addEventListener('click',function(e){ if(ate&&e.target&&e.target.closest&&e.target.closest('.rv-mini')){e.preventDefault(); e.stopPropagation();} },true);
  document.addEventListener('contextmenu',function(e){ if((held||hold)&&e.target&&e.target.closest&&e.target.closest('.rv-mini[data-move]'))e.preventDefault(); });

  // ‏تحديثٌ حيّ ما دام صدى يكتب أو يرسم
  var tries=0;
  setInterval(function(){
    var mode=root.getAttribute('data-live'); if(!mode){tries=0; return;}
    if(mode==='image'&&tries>=15)return;
    if(flying||document.hidden||openI!==null||root.querySelector('input[name="sel"]:checked')||document.querySelector('dialog[open]'))return;
    tries++;
    fetch(here(),{credentials:'same-origin'}).then(function(r){return r.ok?r.text():'';}).then(function(t){if(t&&!flying)adopt(t,true);}).catch(function(){});
  },8000);
})();`
