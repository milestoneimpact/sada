/**
 * **تعديلُ المنشور وسجلُّه** (D-383 المرحلة ٧): النصّ والموعد بحسب المرحلة والدور، و«عُدِّل في صدى»، والسجلّ مع
 * «استعد هذه النسخة»، و«أوقف» و«أجّل» في آخر ربع ساعة، و«انسخه مسوّدةً» للمنشور.
 *
 * والأزرار تُخفى بـ`mayDo` نفسِه الذي يردّ به الخادم، وما يُخفى يُقال سببُه في سطر.
 */
import { EDITED_MARK, STAGE_LABEL, mayDo, type EditStage } from '../../lib/plan/rights'
import type { EditEntry } from '../../lib/plan/revise'
import type { Role } from '../../lib/ownerEmail'
import { stamp } from '../../lib/time/zone'
import { pageHead } from './parts'
import { button } from './components/button'
import { card } from './components/card'
import { field } from './components/field'
import { statusBadge } from './components/badge'
import { html, join, raw, type Html } from './html'

export interface PostEditModel {
  readonly id: string
  readonly text: string
  readonly scheduledAt: string | null
  readonly rev: number
  readonly edited: boolean
  readonly stage: EditStage
  readonly role: Role
  readonly history: readonly EditEntry[]
  /** صورُ المكتبة التي تُربط به: «الوسيط» في جدول التعديل. */
  readonly media?: readonly { readonly ref: string; readonly name: string }[]
}

/** قيمةُ حقل `datetime-local` بساعة المالك من موعدٍ بتوقيت UTC. */
function localValue(at: string | null, zone: string | null): string {
  if (at === null) return ''
  const s = stamp(at, zone)
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.slice(0, 10) + 'T' + s.slice(11, 16) : ''
}

const hidden = (m: PostEditModel): Html =>
  html`<input type="hidden" name="id" value="${m.id}"><input type="hidden" name="rev" value="${String(m.rev)}">`

function editCard(m: PostEditModel, zone: string | null): string {
  const can = mayDo(m.role, 'edit', m.stage)
  const media = m.media ?? []
  const body = can.ok
    ? html`<form class="stack" method="POST" action="/panel/plan/post/revise" data-busy="يُحفظ…">${hidden(m)}
        <label for="pe-text">النصّ</label>
        <textarea id="pe-text" name="text" rows="8" required>${m.text}</textarea>
        ${raw(field({
          id: 'pe-at', label: 'الموعد بساعتك', optional: true,
          ...(m.stage === 'scheduled' ? { hint: 'المجدوَل يُعدَّل موعدُه حتّى قبل النشر بـ 15 دقيقة.' } : {}),
          control: html`<input name="scheduled_local" type="datetime-local" dir="ltr" value="${localValue(m.scheduledAt, zone)}">`.value,
        }))}
        ${raw(field({
          id: 'pe-media', label: 'الوسيط', optional: true,
          control: html`<select name="media_ref"><option value="">يبقى كما هو</option>${media.map((x) => html`<option value="${x.ref}">${x.name}</option>`)}</select>`.value,
        }))}
        <div class="row">${raw(button({ label: 'احفظ التعديل', variant: 'primary', type: 'submit' }))}</div></form>`
    : html`<p class="m-0">${m.text}</p><p class="hint m-0">${can.reason}</p>`
  return card({ id: 'post-edit', title: 'النصّ والموعد والوسيط', level: 2, body: body.value })
}

function actionsCard(m: PostEditModel): string {
  const parts: Html[] = []
  if (mayDo(m.role, 'pause', m.stage).ok) {
    parts.push(html`<form class="inline" method="POST" action="/panel/plan/post/hold">${hidden(m)}<input type="hidden" name="how" value="pause">
      ${raw(button({ label: 'أوقف', size: 'sm', type: 'submit' }))}</form>`)
    parts.push(html`<form class="inline" method="POST" action="/panel/plan/post/hold">${hidden(m)}<input type="hidden" name="how" value="60">
      ${raw(button({ label: 'أجّل ساعة', size: 'sm', type: 'submit' }))}</form>`)
  }
  if (mayDo(m.role, 'copy', m.stage).ok) {
    parts.push(html`<form class="inline" method="POST" action="/panel/plan/post/copy">${hidden(m)}
      ${raw(button({ label: 'انسخه مسوّدةً', size: 'sm', type: 'submit' }))}</form>`)
  }
  if (parts.length === 0) return ''
  return card({ id: 'post-hold', title: 'قبل النشر وبعده', level: 2, body: html`<div class="row">${join(parts)}</div>`.value })
}

function historyCard(m: PostEditModel, zone: string | null): string {
  const canRestore = mayDo(m.role, 'restore').ok && mayDo(m.role, 'edit', m.stage).ok
  const rows = m.history.map((e) => html`<li>
      <span dir="ltr">${stamp(e.at, zone).slice(0, 16)}</span> <b>${e.actor}</b> النسخة ${String(e.rev)}${e.reason === null ? '' : html` · ${e.reason}`}
      <p class="m-0 hint">${(e.before.text ?? '').replace(/\s+/g, ' ').slice(0, 120)}</p>
      ${canRestore ? html`<form class="inline" method="POST" action="/panel/plan/post/restore">${hidden(m)}<input type="hidden" name="edit" value="${e.id}">
        ${raw(button({ label: 'استعد هذه النسخة', size: 'sm', type: 'submit' }))}</form>` : html``}</li>`)
  const body = rows.length === 0 ? html`<p class="hint m-0">لم يُعدَّل بعد.</p>` : html`<ol class="stack">${join(rows)}</ol>`
  return card({ id: 'post-history', title: 'سجلّ التعديل', level: 2, body: body.value })
}

export function postEditScreen(m: PostEditModel, zone: string | null): string {
  const when = m.scheduledAt === null ? 'بلا موعد' : stamp(m.scheduledAt, zone).slice(0, 16)
  const head = pageHead('الخطّة', 'تعديل المنشور', STAGE_LABEL[m.stage] + ' · ' + when)
  const mark = m.edited ? html`<p class="m-0">${raw(statusBadge('warn', '!', EDITED_MARK))}</p>` : html``
  return html`${raw(head)}<div class="stack">${mark}${raw(editCard(m, zone))}${raw(actionsCard(m))}${raw(historyCard(m, zone))}</div>`.value
}
