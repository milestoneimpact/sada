/**
 * المحرّرُ المركّز (D-198) — **منشورٌ واحدٌ بكلّ ما فيه، وما سواه خارجه**.
 *
 * لوحٌ ‏560px بجوار قائمة «المسوّدات» على الحاسوب، وشاشةٌ كاملةٌ على الهاتف. **مرسومٌ على الخادم**
 * (`/panel?open=<id>#ed`) فيُفتح برابطٍ ويُحفظ ويعمل بلا سكربت، وفي تبويب «المسوّدات» نفسِه من
 * تبويبات D-195 الأربعة: لا صفحةَ جديدة ولا تبويبَ خامس. وفيه بترتيب القرار:
 *
 * 1. **الرأس**: الشعارُ والحسابُ والحال، و«⋯» (الرفضُ والسحبُ والنسخُ والرحلة)، والإغلاق.
 * 2. **النصّ** بمقطع [تحرير | معاينة] وعدّادِ المنصّة وملحوظاتِ الصياغة مطويّة.
 * 3. **الصورة** بلوح البطاقة نفسِه (`imagePane`): نماذجُ التوليد والرفض كما هي.
 * 4. **الموعد بتوقيتك**: أزرارٌ يحسبها الخادمُ بمنطقة المالك (`presetAt`) أو يومٌ وساعة، لا حقلٌ بـ UTC.
 * 5. **التفاصيل** مطويّة: لماذا هذه الزاوية، والمصدر، ومن كتبها وبكم، ومن اعتمدها، وما تغيّر.
 * 6. **شريطٌ ثابتٌ في الأسفل**: [اعتمد وجدوِل] و[اعتمد] و[احفظ] للمسوّدة، وفعلُ كلّ مرحلةٍ لغيرها.
 *
 * **والنماذجُ نماذجُ الخادم نفسُها** (`decide` و`schedule` و`reschedule` و`requeue` و`undo-*`)، وحقلُ
 * `from=editor` وحدَه يقول للمسار أن يعود إلى هنا. والحقولُ خارج نموذجها مربوطةٌ بسِمة `form`.
 */
import type { DraftRow } from '../../../lib/draft/store'
import { ceilingOf } from '../../../lib/draft/review'
import { changedCount, diffLines } from '../../../lib/draft/diff'
import type { MediaReady } from '../../../lib/media/readiness'
import type { Peaks } from '../../../lib/schedule/peak'
import { missingMedia } from '../../../lib/schedule/media'
import { CLIP_PLATFORMS } from '../../../lib/platform/needs'
import { money, parseSqliteUtc, relativeTime } from '../../../lib/format'
import { zoneNote } from '../../../lib/time/zone'
import { momentLabel, presetAt } from '../../../lib/time/local'
import { whyFailed } from '../../../lib/publish/reasons'
import { escapeHtml } from '../escape'
import { ICON } from '../icons'
import { button } from '../components/button'
import { field } from '../components/field'
import { statusBadge } from '../components/badge'
import { menu, menuAction, menuItem } from '../components/menu'
import { nativePost } from '../nativePost'
import { whenField } from '../when'
import { fileName } from '../parts'
import {
  deciderText, imagePane, lengthOf, platformMark, writerName, notesPane, readyLines, readyMimes, requeueForm, specOf, statusOf,
  type MediaView, type Target,
} from './drafts'

export interface EditorInput {
  readonly draft: DraftRow
  readonly media: readonly MediaView[]
  readonly targets: readonly Target[]
  readonly pageOnly: readonly string[]
  readonly peaks: Peaks | undefined
  readonly mediaReady: MediaReady
  readonly zone: string | null
  readonly now: Date
}



/** موعدٌ بتوقيت المالك، و«بتوقيت الرياض» حين لم تصل منطقتُه (D-201). */
function ownerTime(at: string | null, zone: string | null, now: Date): string {
  const date = at === null ? null : parseSqliteUtc(at)
  if (date === null) return ''
  return `${momentLabel(date, zone, now)}${zoneNote(zone)}`
}


/** الحسابُ الذي يُنشر عليه: سطرٌ إن كان واحدًا، وقائمةٌ إن تعدّد. */
function accountField(form: string, fit: readonly Target[]): string {
  if (fit.length === 1) {
    return `<input type="hidden" name="account" value="${escapeHtml(fit[0]!.id)}" form="${form}">
      <p class="ed-on">على حساب <b><bdi>${escapeHtml(fit[0]!.label)}</bdi></b></p>`
  }
  return field({
    id: `${form}-acct`,
    label: 'الحساب',
    control: `<select name="account" form="${form}">${fit
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`).join('')}</select>`,
  })
}

/**
 * ما يمنع الجدولة قبل الضغط — **بالجملة التي تردّ بها `schedulePost`** وبطاقتُه (`scheduler`): وسيطٌ
 * ينقص، أو صفحةٌ لا شخص، أو لا قناة. وسطرٌ يقول السببَ ورابطَ إصلاحه خيرٌ من نموذجٍ يُردّ.
 */
function scheduleBlock(d: DraftRow, input: EditorInput): { readonly text: string; readonly label: string; readonly href: string } | null {
  const lacking = missingMedia(d.platform, readyMimes(d, input.media))
  if (lacking !== null) {
    return { text: `${lacking}.`, label: CLIP_PLATFORMS.has(d.platform) ? 'ارفع مقطعًا' : 'ولّد صورة', href: CLIP_PLATFORMS.has(d.platform) ? '#videos' : '#ed-image' }
  }
  if (input.targets.some((t) => t.platform === d.platform)) return null
  if (input.pageOnly.includes(d.platform)) {
    return { text: 'الصفحة مربوطة، والنشر باسمها لم يُبن بعد. اربط حسابَك الشخصيّ لتنشر الآن.', label: 'ما عليك', href: '/panel/tasks' }
  }
  return { text: `لا قناة ${specOf(d.platform).label} مربوطة، ويبقى النصّ حتّى تُربَط.`, label: 'اربط قناة', href: '#channels' }
}

type Stage = 'waiting' | 'ready' | 'scheduled' | 'published' | 'failed' | 'rejected'

function stageOf(status: string): Stage {
  if (status === 'approved' || status === 'edited') return 'ready'
  if (status === 'queued') return 'scheduled'
  if (status === 'published' || status === 'failed' || status === 'rejected') return status
  return 'waiting'
}

/** قسمُ الموعد وشريطُ الأفعال بحسب المرحلة — والنموذجُ الذي يرسلانه. */
function scheduleAndBar(d: DraftRow, input: EditorInput): { readonly section: string; readonly bar: string; readonly forms: string } {
  const id = escapeHtml(d.id)
  const stage = stageOf(d.status)
  const fit = input.targets.filter((t) => t.platform === d.platform)
  const block = stage === 'waiting' || stage === 'ready' ? scheduleBlock(d, input) : null
  const blockLine = block === null
    ? ''
    : `<p class="ed-note">${escapeHtml(block.text)} <a class="tap" href="${escapeHtml(block.href)}">${escapeHtml(block.label)}</a></p>`
  const sec = (title: string, inner: string): string =>
    `<section class="ed-sec" id="ed-when" aria-labelledby="ed-when-t"><div class="ed-sec-head"><h3 id="ed-when-t">${title}</h3></div>${inner}</section>`
  const from = '<input type="hidden" name="from" value="editor">'

  if (stage === 'waiting') {
    const forms = `<form id="ed-form" method="POST" action="/panel/drafts/decide" data-busy="جار…">
      <input type="hidden" name="id" value="${id}">${from}</form>`
    const canSchedule = block === null
    const submit = (label: string, value: string, variant: 'primary' | 'secondary' | 'quiet'): string =>
      button({ label, variant, type: 'submit', name: 'do', value, attrs: 'form="ed-form"' })
    return {
      forms,
      section: sec('الموعد', canSchedule ? `${accountField('ed-form', fit)}${whenField('ed-form', input.zone, input.now, input.peaks)}` : blockLine),
      bar: canSchedule
        ? `${submit('اعتمد وجدوِل', 'approve-schedule', 'primary')}${submit('اعتمد', 'approve', 'secondary')}<span class="grow"></span>${submit('احفظ', 'save', 'quiet')}`
        : `${submit('اعتمد', 'approve', 'primary')}<span class="grow"></span>${submit('احفظ', 'save', 'quiet')}`,
    }
  }
  if (stage === 'ready') {
    if (block !== null) return { forms: '', section: sec('الموعد', blockLine), bar: '' }
    const forms = `<form id="ed-sched" method="POST" action="/panel/drafts/schedule" data-busy="جار الجدولة…">
      <input type="hidden" name="id" value="${id}">${from}</form>`
    return {
      forms,
      section: sec('الموعد', `${accountField('ed-sched', fit)}${whenField('ed-sched', input.zone, input.now, input.peaks)}`),
      bar: button({ label: 'جدوِل', variant: 'primary', type: 'submit', attrs: 'form="ed-sched"' }),
    }
  }
  if (stage === 'scheduled') {
    const at = ownerTime(d.scheduledAt, input.zone, input.now)
    const on = d.accountName === null ? '' : ` على حساب <b><bdi>${escapeHtml(d.accountName)}</bdi></b>`
    if (d.dispatchedAt !== null) {
      return { forms: '', section: sec('الموعد', `<p class="ed-on">خرجت إلى المنصّة ${escapeHtml(relativeTime(d.dispatchedAt, input.now))}${on}، ولا تُستردّ من هناك.</p>`), bar: '' }
    }
    const forms = `<form id="ed-resched" method="POST" action="/panel/drafts/reschedule" data-busy="جار…">
      <input type="hidden" name="id" value="${id}">${from}</form>`
    return {
      forms,
      section: sec('الموعد', `<p class="ed-on">مجدولة <b>${escapeHtml(at)}</b>${on}.</p>${whenField('ed-resched', input.zone, input.now, input.peaks)}`),
      bar: button({ label: 'غيّر الموعد', variant: 'primary', type: 'submit', attrs: 'form="ed-resched"' }),
    }
  }
  if (stage === 'failed') {
    const why = whyFailed(d.failure ?? null, d.platform)
    const action = why.action === 'relink'
      ? `${button({ label: 'أعد الربط', variant: 'primary', href: `/oauth/${d.platform}/start` })}${requeueForm(d.id, false)}`
      : why.action === 'none' ? '' : requeueForm(d.id, true)
    return { forms: '', section: sec('ما وقع', `<p class="ed-note" data-tone="bad">${escapeHtml(why.text)}</p>`), bar: action }
  }
  if (stage === 'rejected') {
    return {
      forms: '',
      section: '',
      bar: `<form class="inline" method="POST" action="/panel/drafts/undo-reject" data-busy="جار…"><input type="hidden" name="id" value="${id}">${
        button({ label: 'أعدها مسوّدة', variant: 'primary', type: 'submit' })}</form>`,
    }
  }
  return { forms: '', section: '', bar: '' }
}

/** ما تغيّر قبل الاعتماد (D-128) — سطرًا سطرًا، والحالُ رمزٌ قبل اللون (D-043). */
function editDiff(d: DraftRow): string {
  if (d.originalText === null || d.status === 'draft' || d.status === 'rejected') return ''
  const diff = diffLines(d.originalText, d.text)
  const n = changedCount(diff)
  if (n === 0) return ''
  const body = diff.map((l) => {
    const mark = l.kind === 'del' ? '−' : l.kind === 'add' ? '+' : ' '
    return `<span class="dl ${l.kind}">${mark} ${escapeHtml(l.text)}</span>`
  }).join('\n')
  return `${n} ${n === 1 ? 'سطر' : n === 2 ? 'سطران' : 'أسطر'}<pre class="diff-body" dir="auto">${body}</pre>`
}

/** «التفاصيل» مطويّة — كلُّ ما كان رقاقةً على البطاقة، بكلامٍ بشريّ. */
function details(d: DraftRow, input: EditorInput): string {
  const rows: [string, string][] = []
  if (d.rationale !== null && d.rationale !== '') rows.push(['لماذا هذه الزاوية؟', escapeHtml(d.rationale)])
  if (d.sourceName !== null) rows.push(['المصدر', `${fileName(d.sourceName)}${d.stale ? ' <span class="ago">(تغيّر بعد كتابتها)</span>' : ''}`])
  const writer = writerName(d.model)
  rows.push(['كتبها', `${escapeHtml(writer)}${d.model !== null && writer !== 'أنت' && writer !== 'غير مسجَّل' ? ` <span class="ago"><bdi dir="ltr">${escapeHtml(d.model)}</bdi></span>` : ''}`])
  rows.push(['كلفة الكتابة', d.cost === 0 ? 'بلا كلفة' : `<span class="mono">${escapeHtml(money(d.cost))}</span>`])
  if (d.publishCost > 0) {
    rows.push(['كلفة النشر', `<span class="mono">${escapeHtml(money(d.publishCost))}</span>${d.publishCost >= 0.1 ? ' <span class="ago">(فيها رابط)</span>' : ''}`])
  }
  const decider = deciderText(d.approvedBy)
  if (decider !== '') {
    rows.push([d.status === 'rejected' ? 'رفضها' : 'اعتمدها', `${escapeHtml(decider)}${d.approvedAt === null ? '' : ` <span class="ago">${escapeHtml(relativeTime(d.approvedAt, input.now))}</span>`}`])
  }
  const diff = editDiff(d)
  if (diff !== '') rows.push(['ما تغيّر قبل الاعتماد', diff])
  rows.push(['كُتبت', escapeHtml(relativeTime(d.createdAt, input.now))])
  const list = rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`).join('')
  return `<details class="ed-more" id="ed-details"><summary>التفاصيل</summary>
    <dl class="ed-kv">${list}</dl>
    <a class="tap" href="/panel/journey/${encodeURIComponent(d.id)}">رحلة المنشور من الملفّ إلى الأثر</a>
  </details>`
}

/** سطرُ الوقت تحت الحساب — **وقتُ المرحلة لا وقتُ الكتابة دائمًا**. */
export function stageTime(d: DraftRow, zone: string | null, now: Date): string {
  switch (stageOf(d.status)) {
    case 'ready':
      return d.approvedAt === null ? `كُتبت ${relativeTime(d.createdAt, now)}` : `اعتُمدت ${relativeTime(d.approvedAt, now)}`
    case 'scheduled':
      return d.dispatchedAt !== null ? `خرجت ${relativeTime(d.dispatchedAt, now)}` : ownerTime(d.scheduledAt, zone, now)
    case 'failed':
      return d.scheduledAt === null ? `كُتبت ${relativeTime(d.createdAt, now)}` : `موعدُها كان ${ownerTime(d.scheduledAt, zone, now)}`
    default:
      return `كُتبت ${relativeTime(d.createdAt, now)}`
  }
}

/** المحرّر — رأسٌ ونصٌّ وصورةٌ وموعدٌ وتفاصيل، وشريطُ الأفعال. */
export function editorPane(input: EditorInput): string {
  const d = input.draft
  const spec = specOf(d.platform)
  const st = statusOf(d)
  const who = d.accountName ?? spec.label
  const stage = stageOf(d.status)
  const len = lengthOf(d)
  const { section, bar, forms } = scheduleAndBar(d, input)
  const close = `/panel#d-${d.id}`
  const more: string[] = []
  if (stage === 'waiting') {
    more.push(menuAction({ label: 'ارفض', action: '/panel/drafts/decide', fields: { id: d.id, do: 'reject', from: 'editor' }, danger: true }))
  }
  if (stage === 'ready') more.push(menuAction({ label: 'أعدها مسوّدة', action: '/panel/drafts/undo-approve', fields: { id: d.id } }))
  if (stage === 'scheduled' && d.dispatchedAt === null) {
    // ‏بلا سؤالٍ قبله (D-303 · D-323): السحبُ يُردّ بـ«تراجَع» في إشعاره، كما في قائمة المنشورات
    more.push(menuAction({ label: 'اسحب الموعد', action: '/panel/drafts/unschedule', fields: { id: d.id } }))
  }
  // ‏والنسخُ من المربّع نفسِه (`COPY_SCRIPT` يحدّد حقلًا بمعرّفه)، فللمسوّدة وحدَها
  if (stage === 'waiting') more.push('<button class="menu-item" type="button" data-copy="ed-txt"><span class="menu-t"><b>انسخ النصّ</b></span></button>')
  more.push(menuItem({ label: 'رحلة المنشور', href: `/panel/journey/${encodeURIComponent(d.id)}` }))

  const editable = stage === 'waiting'
  const counter = `<span class="draft-len${len > spec.hardLimit ? ' bad' : len > ceilingOf(spec.hardLimit) ? ' warn' : ''}"><b>${len}</b> / ${spec.hardLimit}</span>`
  const seg = `<div class="seg" id="ed-seg" role="group" aria-label="النصّ أو معاينته" hidden>
      <button type="button" data-view-pick="edit" aria-pressed="true">${editable ? 'تحرير' : 'النصّ'}</button>
      <button type="button" data-view-pick="preview" aria-pressed="false">معاينة</button></div>`
  // ‏والعدّادُ أخو المربّع في أبيه: سكربتُ اللوحة يقرؤه من هناك ويحدّثه مع الكتابة
  const text = editable
    ? `<div class="ed-field">
        <div class="ed-label"><label for="ed-txt">النصّ</label>${counter}<span class="grow"></span>${seg}</div>
        <textarea id="ed-txt" name="text" form="ed-form" class="draft-text ed-txt" dir="auto" rows="10"
          data-limit="${spec.hardLimit}" data-target="${ceilingOf(spec.hardLimit)}" data-count="${spec.id}">${escapeHtml(d.text)}</textarea>
        ${notesPane(d, len, spec.hardLimit)}
      </div>`
    : `<div class="ed-field"><div class="ed-label"><span class="ed-l">النصّ</span>${counter}<span class="grow"></span>${seg}</div>
        <div class="ed-read" id="ed-txt" dir="auto" data-post-text>${escapeHtml(d.text)}</div></div>`
  const img = input.media.find((m) => m.postId === d.id && m.status === 'ready' && !m.mime.startsWith('video/'))
  const preview = nativePost({
    platform: d.platform,
    id: `ed-${d.id}`,
    author: { name: who, kind: null },
    text: d.text,
    when: stage === 'scheduled' ? ownerTime(d.scheduledAt, input.zone, input.now) : 'الآن',
    media: img === undefined ? null : { id: img.id, mime: img.mime, composed: img.note === '' },
    poster: null,
    metrics: null,
    variant: 'feed',
  })
  // ‏ووصفُ الإنفوجرافيك هنا بجملته لا بجملة البطاقة: الطيّةُ في القائمة تقولها لكلّ مسوّدة
  const pic = imagePane(d, input.media, readyLines(input.mediaReady),
    '<b>إنفوجرافيك يُرسم من النصّ أعلاه</b> بعنوانه وأرقامه كما هي، بلا رقم من خارجه.')
  return `<aside class="card ed" id="ed" aria-labelledby="ed-t" data-post="${escapeHtml(d.id)}">
    ${forms}
    <div class="ed-head">
      ${platformMark(d.platform)}
      <div class="pc-who"><h2 id="ed-t"><bdi>${escapeHtml(who)}</bdi></h2><span class="pc-when">${
        d.accountName === null ? '' : `${escapeHtml(spec.label)} · `}${escapeHtml(stageTime(d, input.zone, input.now))}</span></div>
      ${statusBadge(st.cls, st.glyph, escapeHtml(st.text))}
      ${menu({ label: 'أفعال أخرى', variant: 'icon', size: 'sm', icon: ICON.more, items: more })}
      <a class="btn btn-icon btn-sm ed-x" href="${escapeHtml(close)}" aria-label="أغلق المنشور وارجع إلى القائمة">${ICON.close}</a>
    </div>
    <div class="ed-body">
      <div class="ed-views">
        <div class="ed-view" data-view="edit">${text}</div>
        <div class="ed-view" data-view="preview" data-post-text>${preview}</div>
      </div>
      ${pic === '' ? '' : `<section class="ed-sec" id="ed-image" aria-labelledby="ed-image-t">
        <div class="ed-sec-head"><h3 id="ed-image-t">${d.platform === 'tiktok' || d.platform === 'youtube' ? 'المقطع' : 'الصورة'}</h3></div>
        ${pic}</section>`}
      ${section}
      ${details(d, input)}
    </div>
    ${bar === '' ? '' : `<div class="ed-bar">${bar}</div>`}
  </aside>`
}
