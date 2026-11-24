/**
 * **شاشةُ التيّار** (D-386): عمودٌ واحد يُقرأ من الهاتف أوّلًا — رأسٌ بأعداد الشهر وزرٍّ أوّليٍّ واحد، ثمّ «ما سيُنشر»
 * الأقربُ أوّلًا، ثمّ خطُّ «الآن»، ثمّ «ما نُشر» الأحدثُ أوّلًا.
 *
 * البطاقةُ واحدةٌ لكلّ منشورٍ أو بند: شعارُ منصّته، ويومُه وساعتُه بتوقيت المالك، وثلاثةُ أسطرٍ من نصّه، وصورتُه إن كانت،
 * وشارةُ حالٍ واحدة من `postStatus` (D-340)، وشارةُ فحصٍ صغيرة إن وجد الفحصُ شيئًا، **وفعلٌ أوّليٌّ واحدٌ بحالها**: ينتظر
 * «اعتمد»، ومجدولٌ «افتح»، وفشل «أعد المحاولة»، ونُشر سطرُ مقاييسه أو «النتائج». ولا سكربتَ يلزمها: كلُّ فعلٍ نموذج.
 */
import { FEED_FILTERS, cardDay, matchesFilter, monthTally, type FeedCard, type FeedFilter, type FeedModel } from '../../lib/feed'
import { monthGrid, nextPeriod } from '../../lib/plan/month'
import { tabs } from './components/tabs'
import { glyph } from './icons'
import { postStatus } from '../../lib/status'
import { clock, dayKey, dayKeyLabel, dayLabel } from '../../lib/time/zone'
import { parseSqliteUtc, num } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { mayDo } from '../../lib/plan/rights'
import { allows } from '../../lib/access'
import type { Role } from '../../lib/ownerEmail'
import { EDITED_MARK } from '../../lib/plan/rights'
import { pageHead } from './parts'
import { LOGOS } from './logos'
import { ICON } from './icons'
import { statusBadge } from './components/badge'
import { button } from './components/button'
import { cardClass } from './components/card'
import { emptyState } from './components/empty'
import { newPostMenu } from './newMenu'
import { html, raw, type Html } from './html'

export interface FeedView {
  readonly model: FeedModel
  readonly zone: string | null
  readonly now: Date
  readonly role: Role
  /** مرشِّحُ رحلة الشهر (`?s=`، D-389)، و`null` للكلّ. */
  readonly filter?: FeedFilter | null
}

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const

/** «نوفمبر 2026» من مفتاح اليوم المحلّيّ أو الشهر. */
function monthName(todayKey: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(todayKey)
  return m === null ? '' : (MONTHS[Number(m[2]) - 1] ?? '') + ' ' + m[1]
}

/** «الأحد 28 سبتمبر · 9:00 ص» للمنشور (UTC يُحوَّل)، و«28 سبتمبر · 09:00» لبندٍ بتوقيت المالك كما هو. */
function when(c: FeedCard, zone: string | null, now: Date): string {
  if (c.at !== null) {
    const d = parseSqliteUtc(c.at)
    if (d !== null) return dayLabel(d, zone, dayKey(d, zone).slice(0, 4) !== dayKey(now, zone).slice(0, 4)) + ' · ' + clock(d, zone)
  }
  if (c.local !== null) {
    // ‏البندُ بتوقيت المالك كما هو (D-384): يُقرأ بمنطقة غرينتش فلا يُحوَّل، ويُكتب بصيغة المنشور نفسِها
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.local.day)
    const t = /^(\d{2}):(\d{2})$/.exec(c.local.time)
    if (m !== null && t !== null) {
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2])))
      return dayLabel(d, 'UTC', m[1] !== dayKey(now, zone).slice(0, 4)) + ' · ' + clock(d, 'UTC')
    }
    return dayKeyLabel(c.local.day) + ' · ' + c.local.time
  }
  return 'بلا موعد'
}

/** ثلاثةُ أسطرٍ من النصّ — والقصُّ في الورقة (`fd-text`)، وهنا سقفٌ للبايتات وحدَه. */
function excerpt(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 320)
}

function thumb(c: FeedCard): Html {
  if (c.media === null) return html``
  const video = c.media.mime.startsWith('video/')
  const src = '/panel/media/' + encodeURIComponent(c.media.id) + (video ? '' : '?w=800')
  const dims = c.media.width !== null && c.media.height !== null ? html` width="${String(c.media.width)}" height="${String(c.media.height)}"` : html``
  return video
    ? html`<video class="fd-thumb" src="${src}" preload="metadata" muted playsinline aria-hidden="true"></video>`
    : html`<img class="fd-thumb" src="${src}" alt="" loading="lazy"${dims}>`
}

/** الفعلُ الواحد بحال البطاقة — ولمن يملكه (`mayDo`)، وما سواه رابطٌ إلى حيث يُقرأ. */
function action(c: FeedCard, v: FeedView): Html {
  const role = v.role
  if (c.kind === 'item') return html`<a class="tap" href="/panel/plan/review">افتح الخطّة</a>`
  if (c.status === 'draft') {
    if (!mayDo(role, 'approve', 'draft').ok) return html`<a class="tap" href="/panel/plan/post/${c.id}">افتح</a>`
    // ‏مسوّدةُ الخطّة تُعتمَد بمسار المراجعة (D-327: الاعتمادُ يجدول في موعد بندها)، وما سواها بقرار المسوّدات
    return c.planId !== null
      ? html`<form class="inline" method="POST" action="/panel/plan/review/approve" data-busy="جار…">
        <input type="hidden" name="id" value="${c.planId}"><input type="hidden" name="post" value="${c.id}"><input type="hidden" name="back" value="feed">
        ${raw(button({ label: 'اعتمد', variant: 'primary', size: 'sm', type: 'submit' }))}</form>`
      : html`<form class="inline" method="POST" action="/panel/drafts/decide" data-busy="جار…">
        <input type="hidden" name="id" value="${c.id}"><input type="hidden" name="back" value="feed">
        ${raw(button({ label: 'اعتمد', variant: 'primary', size: 'sm', type: 'submit', name: 'do', value: 'approve' }))}</form>`
  }
  if (c.status === 'failed') {
    return mayDo(role, 'approve', 'draft').ok
      ? html`<form class="inline" method="POST" action="/panel/drafts/requeue" data-busy="جار…">
        <input type="hidden" name="id" value="${c.id}"><input type="hidden" name="back" value="feed">
        ${raw(button({ label: 'أعد المحاولة', variant: 'primary', size: 'sm', type: 'submit' }))}</form>`
      : html`<a class="tap" href="/panel/journey/${c.id}">افتح</a>`
  }
  if (c.status === 'published') {
    const fix = correctAction(c, v)
    const m = c.metrics
    if (m === null) return html`<a class="tap" href="/panel/journey/${c.id}">النتائج</a>${fix}`
    const n = (x: number | null): string => (x === null ? '—' : num(x))
    return html`<ul class="fd-metrics plain" aria-label="النتائج">
      <li>${raw(ICON.views)}<span class="num">${n(m.impressions)}</span><span class="vh"> ظهور</span></li>
      <li>${raw(ICON.heart)}<span class="num">${n(m.reactions)}</span><span class="vh"> تفاعل</span></li>
      <li>${raw(ICON.comment)}<span class="num">${n(m.comments)}</span><span class="vh"> تعليق</span></li>
      <li>${raw(ICON.share)}<span class="num">${n(m.shares)}</span><span class="vh"> مشاركة</span></li></ul>${fix}`
  }
  // ‏مجدولٌ أو معتمَدٌ بلا موعد: منشورُ الخطّة إلى شاشة التعديل والسجلّ (D-383 المرحلة ٧)، وما سواه إلى بطاقته في لوح
  // ‏المنشورات (D-388): فيها «انقلها إلى» بضغطةٍ (D-200) والمحرّرُ — واللوحُ خرج من الرافدة، وهذا بابُه
  return raw(button({ label: 'افتح', variant: 'primary', size: 'sm', href: c.planId !== null ? '/panel/plan/post/' + encodeURIComponent(c.id) : '/panel#d-' + encodeURIComponent(c.id) }))
}

/**
 * ‏**«صحّح المنشور»** (D-391) للمحرّر فأعلى على منشور LinkedIn أو X (`mayDo('correct')`)، رابطًا إلى صفحة التصحيح بلا سكربت.
 * ‏وما حذفه صدى ولم يُنشر بديلُه: «أعد المحاولة» ينشر البديلَ وحده بلا حذفٍ ثانٍ.
 */
function correctAction(c: FeedCard, v: FeedView): Html {
  if (!mayDo(v.role, 'correct', 'posted').ok) return html``
  const k = c.correction
  if (k !== null && k.retry !== null) {
    return html`<form class="inline" method="POST" action="/panel/posts/${c.id}/correct/retry" data-busy="جار…">
      <input type="hidden" name="correction" value="${k.retry}">
      ${raw(button({ label: 'أعد المحاولة', variant: 'primary', size: 'sm', type: 'submit' }))}</form>`
  }
  if (k !== null && (k.deleted || k.of !== null)) return html``
  if (c.platform !== 'linkedin' && c.platform !== 'x') return html``
  return html`<a class="tap" href="/panel/posts/${c.id}/correct">صحّح المنشور</a>`
}

/** شارةُ التصحيح ورابطُ الأصل أو البديل (D-391). */
function correctionLine(c: FeedCard): Html {
  const k = c.correction
  if (k === null) return html``
  if (k.of !== null) {
    return html`<p class="fd-fix">${k.kind === 'replace' ? 'بديلٌ لمنشورٍ حُذف' : 'ردٌّ تصحيحيّ'} · <a class="tap" href="/panel/journey/${k.of}">الأصل</a></p>`
  }
  if (k.retry !== null) return html`<p class="fd-fix">حُذف من X ولم يُنشر البديلُ بعد.</p>`
  const to = k.by === null ? html`` : html` · <a class="tap" href="/panel/journey/${k.by}">${k.deleted ? 'البديل' : 'التصحيح'}</a>`
  return html`<p class="fd-fix">${k.deleted ? 'حُذف من X وأُعيد نشرُه' : 'صُحّح'}${to}</p>`
}

function badges(c: FeedCard): Html {
  const face = c.kind === 'item' ? { tone: 'pending' as const, glyph: '○', label: 'يُكتب الآن' } : postStatus(c.status)
  return html`${raw(statusBadge(face.tone, face.glyph, face.label))}${
    c.warning === null ? '' : raw(statusBadge(c.warning.tone, c.warning.tone === 'bad' ? '×' : '!', c.warning.label))}${
    c.edited ? raw(statusBadge('warn', '!', EDITED_MARK)) : ''}${
    c.correction !== null && (c.correction.corrected || c.correction.deleted) ? raw(statusBadge('warn', '!', 'صُحّح')) : ''}`
}

/** مرساةُ البطاقة في التيّار — يقصدها التقويمُ وعودةُ الاعتماد. */
function cardId(c: FeedCard): string {
  return c.kind === 'item' ? 'f-item-' + c.id.slice(5).replace(/[^\w-]+/g, '_') : 'f-' + c.id
}

function card(c: FeedCard, v: FeedView): Html {
  const id = cardId(c)
  // ‏والصنفُ من `cardClass` (D-325): البطاقةُ عنصرُ قائمةٍ لا `div`، فلا يرسمها `card()`
  return html`<li class="${cardClass()} fd-card" id="${id}" data-status="${c.status}">
    <div class="fd-head">
      <span class="pf-logo rv-pf" data-pf="${c.platform}" aria-hidden="true">${raw(LOGOS[c.platform] ?? '')}</span>
      <span class="fd-who"><b>${platformLabel(c.platform)}</b><span class="fd-when">${when(c, v.zone, v.now)}</span></span>
      <span class="grow"></span>
      <span class="fd-st">${badges(c)}</span>
    </div>
    <p class="fd-text">${excerpt(c.text)}</p>
    ${thumb(c)}${correctionLine(c)}
    <div class="fd-acts">${action(c, v)}</div>
  </li>`
}

function approveAll(v: FeedView): Html {
  const m = v.model
  if (m.awaitingIds.length === 0 || !mayDo(v.role, 'approve', 'draft').ok) return html``
  // ‏كلُّ ما ينتظر من الخطّة الحاليّة: اعتمادُ الخطّة يجدول في مواعيد بنودها (D-327). وما خالطه غيرُه: «اعتمد المحدّد» على الكلّ
  const viaPlan = m.plan !== null && m.plan.awaiting === m.awaitingIds.length
  const label = 'اعتمد كلّ ما ينتظر (' + String(m.awaitingIds.length) + ')'
  return viaPlan
    ? html`<form class="inline" method="POST" action="/panel/plan/approve-all" data-busy="يُعتمَد…">
        <input type="hidden" name="id" value="${m.plan!.id}"><input type="hidden" name="back" value="feed">
        ${raw(button({ label, variant: 'primary', type: 'submit' }))}</form>`
    : html`<form class="inline" method="POST" action="/panel/drafts/approve-many" data-busy="يُعتمَد…">
        ${m.awaitingIds.map((id) => html`<input type="hidden" name="id" value="${id}">`)}<input type="hidden" name="back" value="feed">
        ${raw(button({ label, variant: 'primary', type: 'submit' }))}</form>`
}

/**
 * **رأسُ التيّار بابُ كلّ شيء** (D-387 · D-388): «منشورات جديدة» ثمّ «منشور جديد ▾» (أبوابُ المنشور الواحد، كانت في لوح
 * المنشورات وحدَه) ثمّ «اعتمد كلّ ما ينتظر». **وأوّليٌّ واحدٌ أبدًا** (`audit_primary`): الاعتمادُ حين ينتظر شيء، وإلّا
 * «منشورات جديدة»؛ و«منشور جديد ▾» ثانويٌّ دائمًا. وللمحرّر فأعلى (كلُّها كتابة). وحين تكون خطّةٌ قائمة رابطان صغيران:
 * «ورشة الخطّة» (المراجعة) و«تقويم الشهر» (شاراتُ الحمل و«اعتمد الشهر») — فالخطّةُ ورشةٌ تُبلَغ من هنا لا وجهةٌ في الرافدة.
 */
function entry(v: FeedView, approve: string): Html {
  const parts: Html[] = []
  if (v.model.plan !== null) {
    parts.push(html`<a class="tap" href="/panel/plan/review">ورشة الخطّة</a>`)
    parts.push(html`<a class="tap" href="/panel/plan/month">تقويم الشهر</a>`)
  }
  if (allows(v.role, 'editor')) {
    parts.push(raw(button({ label: 'منشورات جديدة', variant: approve === '' ? 'primary' : 'secondary', href: '/panel/new', icon: ICON.add })))
    parts.push(raw(newPostMenu('data-feed-new', 'secondary')))
  }
  if (approve !== '') parts.push(raw(approve))
  return parts.length === 0 ? html`` : html`<div class="row gap-2 fd-entry">${parts}</div>`
}

/** أسماءُ المرشِّحات على شريط الرحلة بترتيب `FEED_FILTERS` — قائمةٌ لا خريطةُ حالٍ ثانية (D-340). */
const FILTER_SAY: readonly string[] = ['ينتظر الاعتماد', 'معتمَد', 'مجدول', 'نُشر', 'تعثّر']

/** عنوانُ التيّار بشهره ومرشِّحه — وما يُهمَل لا يُكتب. */
function feedHref(month: string | null, filter: FeedFilter | null, hash = ''): string {
  const q = [month === null ? '' : 'm=' + month, filter === null ? '' : 's=' + filter].filter((x) => x !== '').join('&')
  return '/panel/feed' + (q === '' ? '' : '?' + q) + hash
}

/**
 * **رحلةُ الشهر ومبدِّلُه** (D-389): «هذا الشهر · الشهر القادم» تنقّلٌ بـ`?m=`، ثمّ خمسةُ أعدادٍ كلٌّ رابطُ مرشِّح (`?s=`)
 * و«الكلّ» لإزالته — روابطُ بلا سكربت بـ`aria-current="page"` (`tabs()` نفسُها، لا نمطَ جديد)، والعددُ قبل المرشِّح.
 */
function journeyBar(v: FeedView, cards: readonly FeedCard[], today: string, period: string): string {
  const m = v.model
  const filter = v.filter ?? null
  const cur = today.slice(0, 7)
  const next = nextPeriod(cur)
  const chosen = m.explicit === true ? period : null
  const months = tabs('الشهر', [
    { label: 'هذا الشهر', href: feedHref(null, filter), current: chosen === null || chosen === cur },
    { label: 'الشهر القادم', href: feedHref(next, filter), current: chosen === next },
  ], { sub: true })
  const n = monthTally(cards, v.zone, today, period)
  const bar = tabs('رحلة الشهر', [
    { label: 'الكلّ', href: feedHref(chosen, null), current: filter === null },
    ...FEED_FILTERS.map((f, i) => ({ label: FILTER_SAY[i] ?? f, href: feedHref(chosen, f), current: filter === f, count: n[f], bad: f === 'failed' && n.failed > 0 })),
  ], { id: 'fd-journey' })
  return months + bar
}

/**
 * **تقويمُ النقاط** (D-389): أيّامُ الشهر شبكةً تبدأ بالأحد (RTL، فالأحدُ يمينًا)، ونقطةٌ لكلّ منشورٍ أو بندٍ بلون حاله من
 * الرموز (`.st` بنغمات `postStatus`) ورمزِها — فالحالُ لا تُعرف باللون وحدَه (D-198). **واليومُ رابطٌ إلى أوّل بطاقاته**
 * في التيّار بشهره؛ ويومٌ بلا شيءٍ رقمٌ لا رابط. وعلى الهاتف ‏360 سبعةُ أعمدةٍ ‏44px لا تفيض.
 */
function dotCalendar(cards: readonly FeedCard[], v: FeedView, today: string, period: string): string {
  const by = new Map<string, FeedCard[]>()
  for (const c of cards) {
    const d = cardDay(c, v.zone)
    if (d === null || !d.startsWith(period)) continue
    by.set(d, [...(by.get(d) ?? []), c])
  }
  const cells = monthGrid(period).flat().map((day): Html => {
    if (day === null) return html`<li aria-hidden="true"></li>`
    const list = by.get(day) ?? []
    const n = String(Number(day.slice(8)))
    const mark = day === today ? raw(' data-today') : ''
    if (list.length === 0) return html`<li${mark}><span class="fd-day"><span class="num">${n}</span></span></li>`
    const faces = list.map((c) => (c.kind === 'item' ? { tone: 'pending' as const, glyph: '○', label: 'يُكتب الآن' } : postStatus(c.status)))
    const dots = faces.slice(0, 4).map((f) => html`<span class="fd-dot ${f.tone}">${raw(glyph(f.glyph))}</span>`)
    const more = list.length > 4 ? html`<span class="fd-more num">+${String(list.length - 4)}</span>` : ''
    const say = dayKeyLabel(day) + ': ' + faces.map((f) => f.label).join('، ')
    return html`<li${mark}><a class="fd-day" href="${feedHref(period, null, '#' + cardId(list[0]!))}" aria-label="${say}"><span class="num">${n}</span><span class="fd-dots" aria-hidden="true">${dots}${more}</span></a></li>`
  })
  const head = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map((d) => html`<span>${d}</span>`)
  return html`<section class="fd-sec" aria-labelledby="fd-cal-h"><h2 id="fd-cal-h" class="fd-h">أيّامُ ${monthName(period)}</h2>
    <div class="fd-calw"><div class="fd-wk" aria-hidden="true">${head}</div><ol class="plain fd-cal">${cells}</ol></div></section>`.value
}

export function feedScreen(v: FeedView): string {
  const m = v.model
  const today = dayKey(v.now, v.zone)
  const period = m.period ?? today.slice(0, 7)
  const filter = v.filter ?? null
  const all = [...m.upcoming, ...m.past]
  // ‏بلا `?m=` يبقى التيّارُ كلُّه (D-386)، والأعدادُ والتقويمُ لشهر اليوم؛ وبه كلُّ شيءٍ للشهر المختار
  const lede = (m.explicit === true
    ? html`ما سيُنشر وما نُشر في ${monthName(period)}، كلٌّ بحاله.`
    : html`ما سيُنشر وما نُشر، وأعدادُ ${monthName(period)} وأيّامُه فوقهما.`).value
  const head = pageHead(monthName(period), 'التيّار', lede, entry(v, approveAll(v).value).value)
  const shown = (list: readonly FeedCard[]): FeedCard[] => list.filter((c) => matchesFilter(c, filter) && (filter === null || c.kind === 'post'))
  const up = shown(m.upcoming)
  const done = shown(m.past)
  const upcoming = up.length === 0
    ? (filter === null
      ? emptyState({ title: 'لا شيء ينتظر النشر', html: 'اعتمد مسوّدةً أو ابنِ خطّةً فيظهر هنا ما سيُنشر بموعده.', echo: true,
          action: button({ label: 'منشورات جديدة', size: 'sm', href: '/panel/new' }) })
      : emptyState({ title: 'لا شيء بهذه الحال هنا', html: 'اختر «الكلّ» لترى الشهر كاملًا.' }))
    : html`<ol class="plain fd-list">${up.map((c) => card(c, v))}</ol>`.value
  const past = done.length === 0
    ? emptyState({ title: 'لم يُنشر شيءٌ في هذه الأيّام', html: m.window.older === null ? 'ما يُنشر يظهر هنا بنتائجه.' : 'وما قبلها يُفتح من «أقدم».' })
    : html`<ol class="plain fd-list">${done.map((c) => card(c, v))}</ol>`.value
  const older = m.window.older === null ? '' : html`<p class="fd-older"><a class="tap" href="/panel/feed?before=${m.window.older}">أقدم</a></p>`.value
  return head + html`
  <div class="fd">
    <div class="fd-top">${raw(journeyBar(v, all, today, period))}</div>
    ${raw(dotCalendar(all, v, today, period))}
    <section class="fd-sec" aria-labelledby="fd-up"><h2 id="fd-up" class="fd-h">ما سيُنشر</h2>${raw(upcoming)}</section>
    <div class="fd-now" role="separator" aria-label="الآن"><span>الآن</span></div>
    <section class="fd-sec" aria-labelledby="fd-past"><h2 id="fd-past" class="fd-h">ما نُشر</h2>${raw(past)}${raw(older)}</section>
  </div>`.value
}
