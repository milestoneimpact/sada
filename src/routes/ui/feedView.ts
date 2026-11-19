/**
 * **شاشةُ التيّار** (D-386): عمودٌ واحد يُقرأ من الهاتف أوّلًا — رأسٌ بأعداد الشهر وزرٍّ أوّليٍّ واحد، ثمّ «ما سيُنشر»
 * الأقربُ أوّلًا، ثمّ خطُّ «الآن»، ثمّ «ما نُشر» الأحدثُ أوّلًا.
 *
 * البطاقةُ واحدةٌ لكلّ منشورٍ أو بند: شعارُ منصّته، ويومُه وساعتُه بتوقيت المالك، وثلاثةُ أسطرٍ من نصّه، وصورتُه إن كانت،
 * وشارةُ حالٍ واحدة من `postStatus` (D-340)، وشارةُ فحصٍ صغيرة إن وجد الفحصُ شيئًا، **وفعلٌ أوّليٌّ واحدٌ بحالها**: ينتظر
 * «اعتمد»، ومجدولٌ «افتح»، وفشل «أعد المحاولة»، ونُشر سطرُ مقاييسه أو «النتائج». ولا سكربتَ يلزمها: كلُّ فعلٍ نموذج.
 */
import type { FeedCard, FeedModel } from '../../lib/feed'
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
}

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] as const

/** «نوفمبر 2026» من مفتاح اليوم المحلّيّ. */
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
    const m = c.metrics
    if (m === null) return html`<a class="tap" href="/panel/journey/${c.id}">النتائج</a>`
    const n = (x: number | null): string => (x === null ? '—' : num(x))
    return html`<ul class="fd-metrics plain" aria-label="النتائج">
      <li>${raw(ICON.views)}<span class="num">${n(m.impressions)}</span><span class="vh"> ظهور</span></li>
      <li>${raw(ICON.heart)}<span class="num">${n(m.reactions)}</span><span class="vh"> تفاعل</span></li>
      <li>${raw(ICON.comment)}<span class="num">${n(m.comments)}</span><span class="vh"> تعليق</span></li>
      <li>${raw(ICON.share)}<span class="num">${n(m.shares)}</span><span class="vh"> مشاركة</span></li></ul>`
  }
  // ‏مجدولٌ أو معتمَدٌ بلا موعد: منشورُ الخطّة إلى شاشة التعديل والسجلّ (D-383 المرحلة ٧)، وما سواه إلى بطاقته في لوح
  // ‏المنشورات (D-388): فيها «انقلها إلى» بضغطةٍ (D-200) والمحرّرُ — واللوحُ خرج من الرافدة، وهذا بابُه
  return raw(button({ label: 'افتح', variant: 'primary', size: 'sm', href: c.planId !== null ? '/panel/plan/post/' + encodeURIComponent(c.id) : '/panel#d-' + encodeURIComponent(c.id) }))
}

function badges(c: FeedCard): Html {
  const face = c.kind === 'item' ? { tone: 'pending' as const, glyph: '○', label: 'يُكتب الآن' } : postStatus(c.status)
  return html`${raw(statusBadge(face.tone, face.glyph, face.label))}${
    c.warning === null ? '' : raw(statusBadge(c.warning.tone, c.warning.tone === 'bad' ? '×' : '!', c.warning.label))}${
    c.edited ? raw(statusBadge('warn', '!', EDITED_MARK)) : ''}`
}

function card(c: FeedCard, v: FeedView): Html {
  const id = c.kind === 'item' ? 'f-item-' + c.id.slice(5).replace(/[^\w-]+/g, '_') : 'f-' + c.id
  // ‏والصنفُ من `cardClass` (D-325): البطاقةُ عنصرُ قائمةٍ لا `div`، فلا يرسمها `card()`
  return html`<li class="${cardClass()} fd-card" id="${id}" data-status="${c.status}">
    <div class="fd-head">
      <span class="pf-logo rv-pf" data-pf="${c.platform}" aria-hidden="true">${raw(LOGOS[c.platform] ?? '')}</span>
      <span class="fd-who"><b>${platformLabel(c.platform)}</b><span class="fd-when">${when(c, v.zone, v.now)}</span></span>
      <span class="grow"></span>
      <span class="fd-st">${badges(c)}</span>
    </div>
    <p class="fd-text">${excerpt(c.text)}</p>
    ${thumb(c)}
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

export function feedScreen(v: FeedView): string {
  const m = v.model
  const today = dayKey(v.now, v.zone)
  const lede = html`<span class="fd-counts"><span><b class="num">${String(m.counts.published)}</b> نُشر</span><span><b class="num">${String(m.counts.queued)}</b> مجدول</span><span><b class="num">${String(m.counts.awaiting)}</b> ينتظر اعتمادك</span><span><b class="num">${String(m.counts.writing)}</b> يُكتب</span></span>`.value
  const head = pageHead(monthName(today), 'التيّار', lede, entry(v, approveAll(v).value).value)
  const upcoming = m.upcoming.length === 0
    ? emptyState({ title: 'لا شيء ينتظر النشر', html: 'اعتمد مسوّدةً أو ابنِ خطّةً فيظهر هنا ما سيُنشر بموعده.', echo: true,
        action: button({ label: 'منشورات جديدة', size: 'sm', href: '/panel/new' }) })
    : html`<ol class="plain fd-list">${m.upcoming.map((c) => card(c, v))}</ol>`.value
  const past = m.past.length === 0
    ? emptyState({ title: 'لم يُنشر شيءٌ في هذه الأيّام', html: m.window.older === null ? 'ما يُنشر يظهر هنا بنتائجه.' : 'وما قبلها يُفتح من «أقدم».' })
    : html`<ol class="plain fd-list">${m.past.map((c) => card(c, v))}</ol>`.value
  const older = m.window.older === null ? '' : html`<p class="fd-older"><a class="tap" href="/panel/feed?before=${m.window.older}">أقدم</a></p>`.value
  return head + html`
  <div class="fd">
    <section class="fd-sec" aria-labelledby="fd-up"><h2 id="fd-up" class="fd-h">ما سيُنشر</h2>${raw(upcoming)}</section>
    <div class="fd-now" role="separator" aria-label="الآن"><span>الآن</span></div>
    <section class="fd-sec" aria-labelledby="fd-past"><h2 id="fd-past" class="fd-h">ما نُشر</h2>${raw(past)}${raw(older)}</section>
  </div>`.value
}
