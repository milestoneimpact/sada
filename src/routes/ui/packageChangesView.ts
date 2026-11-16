/**
 * «ما تغيّر في حزمتك» (D-372) — رأس بثلاثة أرقام، ثمّ بطاقة لكلّ مادّة فيها قبل وبعد متجاوران، وزرّان لكلّ ما ينتظر:
 * «اعتمد التحديث» و«أبقِ القديم»، وزرٌّ جماعيٌّ لكلّ نوع. نماذج POST بلا سكربت بالعُدّة نفسِها.
 * والنصوص هنا للمالكة: بلا أرقام قرارات.
 */
import type { StoredChange } from '../../lib/package/apply'
import type { SnapshotEntry } from '../../lib/package/diff'
import type { RevisionRow } from '../../lib/package/revision'
import { pageHead } from './parts'
import { card } from './components/card'
import { statusBadge } from './components/badge'
import { button } from './components/button'
import { menu, menuItem } from './components/menu'
import { html, raw, type Html } from './html'
import { escapeHtml } from './escape'
import { localWhen } from '../../lib/time/zone'
import { PLATFORM_LABEL } from '../../lib/oauth/providers'

export interface ChangeView extends StoredChange { readonly postStatus: string | null }

export interface ChangesScreen {
  readonly revision: RevisionRow
  readonly changes: readonly ChangeView[]
  readonly history: readonly RevisionRow[]
  readonly zone?: string | null
  /** ما يُعتمَد ويُجدوَل بـ«اعتمد الخطّة وجدولها» (D-382). */
  readonly schedulable?: number
  readonly flash?: { readonly tone: 'ok' | 'warn' | 'bad'; readonly text: string } | null
}

const PLATFORM: Readonly<Record<string, string>> = PLATFORM_LABEL
export const KIND_LABEL: Readonly<Record<StoredChange['kind'], string>> = {
  added: 'أُضيف', removed: 'حُذف من الخطّة', text: 'النصّ عُدّل', time: 'الموعد تحرّك', format: 'الصيغة تغيّرت', media: 'نسخة أحدث من الوسيطة',
}
const BULK: Readonly<Record<StoredChange['kind'], string>> = {
  added: 'الإضافات', removed: 'الحذف', text: 'تعديلات النصّ', time: 'المواعيد', format: 'الصيغ', media: 'الوسائط',
}

export const short = (sha: string | null): string => (sha === null ? '—' : sha.slice(0, 7))

function disposition(c: ChangeView): string {
  if (c.id.startsWith('diff:')) return statusBadge('', '○', 'لم يُطبَّق')
  switch (c.disposition) {
    case 'auto_applied': return statusBadge('ok', '✓', c.kind === 'added' && c.postId === null && c.after?.text === null ? 'ينتظر الكتابة' : 'حُدّث وحده')
    case 'awaiting_owner': return statusBadge('warn', '!', 'ينتظر قرارك')
    case 'accepted': return statusBadge('ok', '✓', 'اعتمدت التحديث')
    case 'kept_old': return c.supersededBy == null ? statusBadge('', '○', 'أبقيت القديم') : statusBadge('', '○', 'سبقه تحديث أحدث')
    case 'frozen_published': return statusBadge('', '■', 'نُشر — لا يتغيّر')
  }
}

function side(e: SnapshotEntry | null, kind: StoredChange['kind']): Html {
  if (e === null) return html`<p class="hint m-0">لا شيء</p>`
  if (kind === 'time') return html`<p class="m-0"><bdi dir="ltr">${e.date} ${e.time}</bdi></p>`
  if (kind === 'format') return html`<p class="m-0">${e.format === '' ? '—' : e.format}</p>`
  if (kind === 'media') return html`<p class="m-0"><bdi dir="ltr">${e.mediaName ?? 'بلا وسيطة'}</bdi></p>`
  return html`<pre class="pk-text">${e.text ?? 'يُكتب من فكرته: ' + e.idea}</pre>
    <p class="hint m-0"><bdi dir="ltr">${e.date} ${e.time}</bdi>${e.mediaName === null ? '' : html` · <bdi dir="ltr">${e.mediaName}</bdi>`}</p>`
}

function decideForm(rev: string, c: ChangeView): Html {
  if (c.disposition !== 'awaiting_owner') return html``
  return html`<form method="post" action="/panel/package/changes/${rev}/decide" class="pk-acts">
    <input type="hidden" name="id" value="${c.id}">
    ${raw(button({ label: 'اعتمد التحديث', variant: 'primary', type: 'submit', name: 'verdict', value: 'accept', size: 'sm' }))}
    ${raw(button({ label: 'أبقِ القديم', variant: 'secondary', type: 'submit', name: 'verdict', value: 'keep', size: 'sm' }))}
  </form>`
}

function changeBlock(rev: string, c: ChangeView, zone: string | null): Html {
  const problems = c.after?.problems ?? []
  return html`<section class="stack" aria-label="${(PLATFORM[c.platform] ?? c.platform) + ' — ' + KIND_LABEL[c.kind]}">
    <p class="m-0"><b>${PLATFORM[c.platform] ?? c.platform}</b> · ${KIND_LABEL[c.kind]} ${raw(disposition(c))}</p>
    <div class="pk-diff">
      <div class="pk-side pk-old"><h4>قبل</h4>${side(c.before, c.kind)}</div>
      <div class="pk-side pk-new"><h4>بعد</h4>${side(c.after, c.kind)}</div>
    </div>
    ${problems.length === 0 ? html`` : html`<p class="m-0">${raw(statusBadge('warn', '!', problems.join('، ')))}</p>`}
    ${c.disposition === 'awaiting_owner' && c.kind === 'time' ? html`<p class="hint m-0">اعتماد الموعد يحدّث موعدَه في الحزمة، وجدولتُه تبقى من بطاقته.</p>` : html``}
    ${c.supersededBy == null ? html`` : html`<p class="hint m-0">دفعة أحدث غيّرت هذا المنشور بالنوع نفسِه بعد هذا التغيير، فلم يُكتب فوقها. <a href="/panel/package/changes/${c.supersededBy}">افتح الدفعة الأحدث</a>.</p>`}
    ${c.decidedAt == null || c.disposition === 'awaiting_owner' ? html`` : html`<p class="hint m-0">حُسم <bdi>${localWhen(c.decidedAt, zone)}</bdi></p>`}
    ${decideForm(rev, c)}
  </section>`
}

/** الأرقام الثلاثة في رأس الشاشة. */
export function summary(r: RevisionRow): string {
  return html`<dl class="pk-sum">
    <div><dt>أُضيف</dt><dd>${String(r.counts.added)}</dd></div>
    <div><dt>تغيّر</dt><dd>${String(r.counts.changed + r.counts.removed)}</dd></div>
    <div><dt>ينتظر قرارك</dt><dd>${String(r.counts.awaiting)}</dd></div>
  </dl>`.value
}

const STATUS: Readonly<Record<RevisionRow['status'], readonly ['ok' | 'warn' | 'bad' | '', string, string]>> = {
  applied: ['ok', '✓', 'طُبّقت'], analysed: ['warn', '…', 'تُطبَّق'], pending: ['', '○', 'تنتظر'], failed: ['bad', '!', 'تعذّرت'],
}
export const revisionBadge = (r: RevisionRow): string => statusBadge(...STATUS[r.status])

/** سجلُّ الدفعات — قائمة منسدلة بلا سكربت. */
export function historyMenu(history: readonly RevisionRow[], zone: string | null): string {
  if (history.length === 0) return ''
  return menu({ label: 'الدفعات السابقة', size: 'sm', items: history.map((r) => menuItem({
    label: short(r.commit) + ' · ' + STATUS[r.status][2], href: '/panel/package/changes/' + r.id,
    note: (r.message === '' ? 'بلا رسالة' : r.message.slice(0, 60)) + ' · ' + localWhen(r.createdAt, zone),
  })) })
}

export function changesScreen(m: ChangesScreen): string {
  const r = m.revision
  const awaiting = m.changes.filter((c) => c.disposition === 'awaiting_owner')
  const head = pageHead('حزمة المحتوى', 'ما تغيّر في حزمتك',
    'الدفعة <bdi dir="ltr">' + escapeHtml(short(r.commit)) + '</bdi>' + (r.appliedAt === null ? '' : ' · طُبّقت <bdi>' + escapeHtml(localWhen(r.appliedAt, m.zone ?? null)) + '</bdi>') + (r.message === '' ? '' : ' · ' + escapeHtml(r.message)) + ' · ' + revisionBadge(r),
    historyMenu(m.history.filter((h) => h.id !== r.id), m.zone ?? null))
  const flash = m.flash == null ? html`` : html`<p class="m-0">${raw(statusBadge(m.flash.tone, m.flash.tone === 'ok' ? '✓' : '!', m.flash.text))}</p>`
  const kinds = [...new Set(awaiting.map((c) => c.kind))]
  const bulk = kinds.length === 0 ? html`` : raw(card({ title: 'قرار واحد لنوع كامل', level: 2, body: html`<p class="hint m-0">المسوّدات حُدّثت وحدها. وهذا ما اعتمدتِه أو جُدول: لا يتغيّر إلا بقرارك.</p>
    ${kinds.map((k) => html`<form method="post" action="/panel/package/changes/${r.id}/decide" class="pk-acts">
      <input type="hidden" name="kind" value="${k}"><span>${BULK[k]} (${String(awaiting.filter((c) => c.kind === k).length)})</span>
      ${raw(button({ label: 'اعتمدها كلّها', variant: 'secondary', type: 'submit', name: 'verdict', value: 'accept', size: 'sm' }))}
      ${raw(button({ label: 'أبقِ القديم كلّه', variant: 'quiet', type: 'submit', name: 'verdict', value: 'keep', size: 'sm' }))}
    </form>`)}`.value }))
  const items = [...new Set(m.changes.map((c) => c.item))].sort()
  const cards = items.map((item) => {
    const own = m.changes.filter((c) => c.item === item)
    const title = own.find((c) => c.after !== null)?.after?.idea ?? own[0]?.before?.idea ?? ''
    return raw(card({ title: 'المادّة ' + item + (title === '' ? '' : ' — ' + title), level: 2, body: html`${own.map((c) => changeBlock(r.id, c, m.zone ?? null))}`.value }))
  })
  const empty = m.changes.length === 0
    ? raw(card({ title: r.status === 'failed' ? 'تعذّرت قراءة هذه الدفعة' : 'لا تغيير في هذه الدفعة', level: 2,
      body: html`<p class="m-0">${r.error ?? 'الخطّة والنصوص والوسائط كما كانت.'}</p>`.value }))
    : html``
  const n = m.schedulable ?? 0
  const plan = n === 0 ? html`` : raw(card({ title: 'الخطوة التالية', level: 2, body: html`<p class="m-0">${String(n)} من مسوّدات الحزمة جاهزة بنصّها وموعدها.</p>
    <div class="row">${raw(button({ label: 'اعتمد الخطّة وجدولها', variant: 'primary', href: '/panel/plan/package/schedule?from=changes&rev=' + r.id }))}</div>`.value }))
  return html`${raw(head)}<div class="stack">${flash}${raw(summary(r))}${plan}${bulk}${empty}${cards}
    <p class="m-0">${raw(button({ label: 'عودة إلى حزمة المحتوى', variant: 'quiet', href: '/panel/package' }))}</p></div>`.value
}
