/**
 * **«قارن الإصدارات»** (D-406): إصداران من خطّةٍ مرفوعة متجاوران — قبلُ وبعدُ بالبطاقة نفسِها التي يعرض بها «ما تغيّر في حزمتك»
 * (`.pk-diff` · `.pk-side`) ووسومِه نفسِها (`KIND_LABEL`). والاختيارُ نموذجُ GET بلا سكربت.
 */
import type { Change, SnapshotEntry } from '../../lib/package/diff'
import type { PlanVersion } from '../../lib/plan/versions'
import { PLATFORM_LABEL } from '../../lib/oauth/providers'
import { KIND_LABEL } from './packageChangesView'
import { pageHead } from './parts'
import { card } from './components/card'
import { button } from './components/button'
import { field } from './components/field'
import { statusBadge, type Tone } from './components/badge'
import { html, raw, type Html } from './html'

export interface VersionsScreen {
  readonly planId: string
  readonly versions: readonly PlanVersion[]
  readonly a: PlanVersion
  readonly b: PlanVersion
  readonly changes: readonly Change[]
}

const TONE: Readonly<Record<Change['kind'], Tone | ''>> = { added: 'ok', removed: 'bad', text: 'warn', time: 'warn', format: 'warn', media: 'warn' }
const G: Readonly<Record<Change['kind'], string>> = { added: '◆', removed: '✕', text: '✎', time: '◔', format: '✎', media: '✎' }

const label = (v: PlanVersion): string => 'الإصدار ' + String(v.version) + (v.current ? ' (القائم)' : '') + ' · ' + v.at.slice(0, 16)

function side(e: SnapshotEntry | null): Html {
  if (e === null) return html`<p class="hint m-0">لا شيء</p>`
  return html`<pre class="pk-text">${e.text ?? ''}</pre><p class="hint m-0"><bdi dir="ltr">${e.date} ${e.time}</bdi></p>`
}

function picker(name: 'a' | 'b', title: string, versions: readonly PlanVersion[], chosen: number): string {
  const opts = html`${versions.map((v) => v.version === chosen
    ? html`<option value="${String(v.version)}" selected>${label(v)}</option>`
    : html`<option value="${String(v.version)}">${label(v)}</option>`)}`
  return field({ id: 'pv-' + name, label: title, control: html`<select name="${name}">${opts}</select>`.value })
}

export function versionsScreen(m: VersionsScreen): string {
  const head = pageHead('الخطّة', 'قارن الإصدارات', 'كلُّ استيرادٍ يحفظ الإصدارَ الذي قبله. اختر اثنين لترى ما تغيّر بينهما.')
  if (m.versions.length < 2) {
    return head + card({ title: 'إصدارٌ واحد', body: html`<p class="m-0">لم يُرفع لهذه الخطّة ملفٌّ ثانٍ بعد، فلا شيءَ يُقارَن.</p>`.value })
  }
  const form = html`<form method="GET" action="/panel/plan/versions" class="row gap-2">
    <input type="hidden" name="plan" value="${m.planId}">
    ${raw(picker('a', 'قبل', m.versions, m.a.version))}${raw(picker('b', 'بعد', m.versions, m.b.version))}
    ${raw(button({ label: 'قارن', type: 'submit', variant: 'secondary', size: 'sm' }))}</form>`
  const count = (k: Change['kind']): number => m.changes.filter((c) => c.kind === k).length
  const kinds = (['added', 'removed', 'text', 'time', 'format', 'media'] as const).filter((k) => count(k) > 0)
  const bar = kinds.length === 0 ? html`<p class="m-0">الإصداران متطابقان.</p>`
    : html`<ul class="plain row gap-2" aria-label="ملخّص الفرق">${kinds.map((k) => html`<li>${raw(statusBadge(TONE[k], G[k], KIND_LABEL[k] + ' ' + String(count(k))))}</li>`)}</ul>`
  const blocks = m.changes.map((c) => html`<section class="stack" aria-label="${(PLATFORM_LABEL[c.platform as keyof typeof PLATFORM_LABEL] ?? c.platform) + ' — ' + KIND_LABEL[c.kind]}">
    <p class="m-0"><b>${PLATFORM_LABEL[c.platform as keyof typeof PLATFORM_LABEL] ?? c.platform}</b> · <bdi dir="ltr">${c.item}</bdi> ${raw(statusBadge(TONE[c.kind], G[c.kind], KIND_LABEL[c.kind]))}</p>
    <div class="pk-diff">
      <div class="pk-side pk-old"><h4>${label(m.a)}</h4>${side(c.before)}</div>
      <div class="pk-side pk-new"><h4>${label(m.b)}</h4>${side(c.after)}</div>
    </div></section>`)
  return html`${raw(head)}<div class="stack">
    ${raw(card({ title: 'الإصداران', level: 2, body: form.value + bar.value }))}
    ${blocks.length === 0 ? html`` : raw(card({ title: 'ما تغيّر', level: 2, body: html`${blocks}`.value }))}
    <p class="m-0">${raw(button({ label: 'عودة إلى الاستيرادات', variant: 'quiet', href: '/panel/plan/imports' }))}</p></div>`.value
}
