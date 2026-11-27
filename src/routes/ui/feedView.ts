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
import { PRESETS } from '../../lib/time/local'
import { platformLabel } from '../../lib/oauth/providers'
import { mayDo } from '../../lib/plan/rights'
import { allows } from '../../lib/access'
import type { Role } from '../../lib/ownerEmail'
import { EDITED_MARK } from '../../lib/plan/rights'
import { vtName, pageHead } from './parts'
import { LOGOS } from './logos'
import { ICON } from './icons'
import { statusBadge } from './components/badge'
import { button } from './components/button'
import { cardClass } from './components/card'
import { emptyState } from './components/empty'
import { newPostMenu } from './newMenu'
import { menu, menuItem } from './components/menu'
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
/**
 * ‏**البطاقةُ التالية التي تنتظر** (D-417): بعد «اعتمد» أو «أعد» يعود التحويلُ إليها بترتيب `awaitingIds` فيُعتمَد أسبوعٌ
 * ‏بلا فقد الموضع — وآخرُ ما ينتظر (أو ما ليس منه) يعود إلى نفسه. والخادمُ يفحصه بنمط `vtName` قبل أن يكتبه.
 */
function nextOf(c: FeedCard, v: FeedView): string {
  const ids = v.model.awaitingIds
  const i = ids.indexOf(c.id)
  return i >= 0 && i + 1 < ids.length ? ids[i + 1]! : c.id
}

/** ‏«يُنشر الأحد 28 سبتمبر · 9:00 ص» لزرّ الاعتماد حين يُعرف الموعد. */
function publishAttrs(c: FeedCard, v: FeedView): string {
  if (c.at === null) return ''
  const d = parseSqliteUtc(c.at)
  if (d === null) return ''
  const say = 'يُنشر ' + dayLabel(d, v.zone, false) + ' · ' + clock(d, v.zone)
  return html`title="${say}" aria-label="${'اعتمد وجدوِل: ' + say}"`.value
}

function action(c: FeedCard, v: FeedView): Html {
  const role = v.role
  if (c.kind === 'item') return html`<a class="tap" href="/panel/plan">افتح الخطّة</a>`
  const next = html`<input type="hidden" name="next" value="${nextOf(c, v)}">`
  if (c.status === 'draft') {
    if (!mayDo(role, 'approve', 'draft').ok) return html`<a class="tap" href="/panel/plan/post/${c.id}">افتح</a>`
    const approve = { label: 'اعتمد وجدوِل', variant: 'primary' as const, size: 'sm' as const, type: 'submit' as const, icon: ICON.check, attrs: publishAttrs(c, v) }
    // ‏مسوّدةُ الخطّة تُعتمَد بمسار المراجعة (D-327: الاعتمادُ يجدول في موعد بندها)، وما سواها بقرار المسوّدات
    return c.planId !== null
      ? html`<form class="inline" method="POST" action="/panel/plan/review/approve" data-busy="يُعتمَد…">
        <input type="hidden" name="id" value="${c.planId}"><input type="hidden" name="post" value="${c.id}"><input type="hidden" name="back" value="feed">${next}
        ${raw(button({ ...approve }))}</form>`
      : html`<form class="inline" method="POST" action="/panel/drafts/decide" data-busy="يُعتمَد…">
        <input type="hidden" name="id" value="${c.id}"><input type="hidden" name="back" value="feed">${next}
        ${raw(button({ ...approve, name: 'do', value: 'approve' }))}</form>`
  }
  if (c.status === 'failed') {
    return mayDo(role, 'approve', 'draft').ok
      ? html`<form class="inline" method="POST" action="/panel/drafts/requeue" data-busy="يُعاد…">
        <input type="hidden" name="id" value="${c.id}"><input type="hidden" name="back" value="feed">${next}
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
  const open = raw(button({ label: 'افتح', variant: c.status === 'queued' ? 'secondary' : 'primary', size: 'sm', href: c.planId !== null ? '/panel/plan/post/' + encodeURIComponent(c.id) : '/panel#d-' + encodeURIComponent(c.id) }))
  return c.status === 'queued' && mayDo(role, 'approve', 'draft').ok ? html`${quickMove(c.id)}${open}` : open
}

/**
 * ‏**«انقلها إلى» على بطاقة المجدولة في التيّار** (D-433): أزرارُ `PRESETS` نفسُها التي على بطاقة اللوح (D-200)، ترسل
 * ‏`preset` إلى `reschedule` فيحسبه الخادمُ بتوقيت المالك ويغيّر الموعدَ وحده (`reschedulePost`، والمُرسَلُ يُرفَض هناك).
 * ‏و`back=feed` يعيد إلى البطاقة `#f-{id}` في التيّار لا إلى اللوح. وإرسالٌ عاديّ بلا `data-swap`: التيّارُ صفحةٌ بلا سكربت اللوح، وتبديلُه يجلب `/panel` لا التيّار.
 */
function quickMove(id: string): Html {
  return html`<form class="inline" method="POST" action="/panel/drafts/reschedule" data-busy="جار…" aria-label="انقل الموعد إلى">
    <input type="hidden" name="id" value="${id}"><input type="hidden" name="back" value="feed">
    ${raw(PRESETS.map((p) => button({ label: p.label, variant: 'secondary', size: 'sm', type: 'submit', name: 'preset', value: p.kind })).join(''))}</form>`
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

function card(c: FeedCard, v: FeedView): Html {
  const id = c.kind === 'item' ? 'f-item-' + c.id.slice(5).replace(/[^\w-]+/g, '_') : vtName(c.id)
  // ‏والصنفُ من `cardClass` (D-325): البطاقةُ عنصرُ قائمةٍ لا `div`، فلا يرسمها `card()`
  // ‏و«id» البطاقة هو اسمُ انتقالها المشترك (D-401): رأسُ صفحة المنشور يحمله، و«view-transition-name:auto» يقرؤه — لا «style» (CSP)
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
  // ‏وأبوابُ الخطّة في قائمةٍ ثانويّةٍ واحدة (D-417) — خرج «خطّة من ملفّ» من «منشور جديد ▾»: الخطّةُ ليست منشورًا واحدًا
  if (allows(v.role, 'editor')) {
    parts.push(raw(menu({ label: 'الخطّة', variant: 'secondary', size: 'sm', attrs: 'data-feed-plan', items: [
      menuItem({ label: 'خطّة جديدة', note: 'تُبنى من أهدافك', href: '/panel/plan/new' }),
      menuItem({ label: 'عندي خطّة', note: 'CSV لأسابيع', href: '/panel#plan-import' }),
    ] })))
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
