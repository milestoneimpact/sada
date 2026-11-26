/**
 * **شاشاتُ الخطّة الموحّدة** (D-383 · المرحلة ٨): سجلُّ الاستيرادات، والشهرُ بتقويمه وشاراتِ حمله، والفرقُ قبل الاعتماد،
 * وسطرُ الاعتماد، ورحلةُ الشهرين في الرئيسيّة.
 *
 * كلُّها قوالبُ خالصة: ما تعرضه يُحسب في `lib/plan/month.ts` و`planChecks`، وشريطُ التحذيرات وأزرارُ «وزّع» و«أزِح»
 * و«ادمج» هي `checksStrip` نفسُها لا نسخةٌ منها. وبلا سكربتٍ يعمل كلُّ شيء: كلُّ زرٍّ نموذج.
 */
import { LOAD_SAY, STATION_SAY, STATIONS, loadLevel, monthGrid, type DiffRow, type ImportRow, type MonthJourney } from '../../lib/plan/month'

export type { DiffRow, ImportRow }
import { checksStrip, type ChecksView } from './checksView'
import { statusBadge } from './components/badge'
import { button } from './components/button'
import { card } from './components/card'
import { html, raw } from './html'
import { pageHead } from './parts'
import { filterBar } from './components/filterbar'
import { platformLabel } from '../../lib/oauth/providers'
import {
  CAL_STATUSES, CAL_STATUS_SAY, CAL_STATUS_TONE, CAL_VIEW_SAY, bulkPick, calHref, calSpan, matches, toggle,
  type CalItem, type CalQuery, type CalView,
} from '../../lib/plan/calendar'

const SOURCE_SAY: Readonly<Record<string, string>> = { github: 'GitHub', csv: 'ملفّ CSV', text: 'نصّ ملصوق', wizard: 'المعالج' }
const STATUS_TONE: Readonly<Record<string, 'ok' | 'warn' | 'bad' | 'pending' | 'idle'>> = {
  applied: 'ok', unchanged: 'idle', normalized: 'pending', pending: 'pending', failed: 'bad',
}
const STATUS_SAY: Readonly<Record<string, string>> = {
  applied: 'طُبِّق', unchanged: 'بلا تغيير', normalized: 'طُبِّع', pending: 'ينتظر', failed: 'فشل',
}

export function importsScreen(rows: readonly ImportRow[], canRecheck: boolean): string {
  const head = pageHead('الخطّة', 'الاستيرادات', 'كلّ ملفّ دخل صدى، بحاله وبصمته وشهره وما غيّر.')
  if (rows.length === 0) {
    return head + card({ title: 'لا استيراد بعد', body: html`<p class="hint">ادفع ملفّ الشهر إلى 01-plan أو ألصق جدولًا في «خطّة جديدة».</p>`.value })
  }
  const body = html`<div class="scroll"><table>
    <thead><tr><th>المصدر</th><th>الشهر</th><th>الحال</th><th>البصمة</th><th>ما تغيّر</th><th>الإجراء</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><span class="chip">${SOURCE_SAY[r.sourceKind] ?? r.sourceKind}</span>${r.sourceRef === null ? '' : html` <span class="mono">${r.sourceRef}</span>`}</td>
      <td class="mono">${r.period ?? '—'}</td>
      <td>${raw(statusBadge(STATUS_TONE[r.status] ?? 'idle', r.status === 'failed' ? '×' : '•', STATUS_SAY[r.status] ?? r.status))}${(r.reseen ?? 0) === 0 ? '' : html`
        ${raw(statusBadge('idle', '○', 'أُعيد رفعُه بلا تغيير ' + String(r.reseen)))}${r.lastSeenAt == null ? '' : html` <span class="ago">آخرُها <bdi dir="ltr">${r.lastSeenAt.slice(0, 16)}</bdi></span>`}`}</td>
      <td class="mono">${r.contentHash.slice(0, 10)}</td>
      <td>${r.summary}</td>
      <td>${canRecheck && r.period !== null
        ? html`<form class="inline" method="GET" action="/panel/plan/month"><input type="hidden" name="p" value="${r.period}">${raw(button({ label: 'إعادة الفحص', size: 'sm', type: 'submit', variant: 'secondary' }))}</form>`
        : ''}${r.planId == null ? '' : html` <a class="tap" href="/panel/plan/versions?plan=${r.planId}">قارن الإصدارات</a>`}</td>
    </tr>`)}</tbody></table></div>`
  return head + card({ title: 'آخر ' + String(rows.length) + ' استيراد', body: body.value })
}

const KIND_SAY: Readonly<Record<DiffRow['kind'], string>> = {
  added: 'مضاف', removed: 'محذوف', text: 'تغيّر النصّ', time: 'تغيّر الموعد', format: 'تغيّرت الصيغة', media: 'تغيّر الوسيط',
}

export function diffCard(rows: readonly DiffRow[]): string {
  if (rows.length === 0) return ''
  const added = rows.filter((r) => r.kind === 'added').length
  const removed = rows.filter((r) => r.kind === 'removed').length
  const waiting = rows.filter((r) => r.awaiting).length
  const line = String(added) + ' مضاف، ' + String(rows.length - added - removed) + ' متغيّر، ' + String(removed) + ' محذوف، و' + String(waiting) + ' ينتظر قرارك.'
  const body = html`<p class="m-0">${line}</p><ul class="plain stack">${rows.slice(0, 40).map((r) => html`<li class="row gap-2">
      ${raw(statusBadge(r.awaiting ? 'warn' : r.kind === 'removed' ? 'bad' : 'ok', r.awaiting ? '!' : '•', KIND_SAY[r.kind]))}
      <span class="mono">${r.itemNo}</span><span class="chip">${r.platform}</span><span class="grow">${r.detail}</span>
      ${r.awaiting ? raw(button({ label: 'قرّر', href: '/panel/package#changes', size: 'sm', variant: 'secondary' })) : ''}</li>`)}</ul>`
  return card({ title: 'الفرق قبل الاعتماد', body: body.value })
}

export interface MonthScreenData {
  readonly period: string
  readonly planId: string | null
  /** عددُ البنود في كلّ يوم محلّيّ. */
  readonly perDay: Readonly<Record<string, number>>
  readonly dailyCap: number
  readonly checks: ChecksView
  readonly diff: readonly DiffRow[]
  readonly approval: string
  readonly canApprove: boolean
  /** «ألغِ جدولة الشهر» و«افتح الإصدار» للناشر فأعلى بعد الاعتماد. */
  readonly canRollback?: boolean
  readonly prev: string
  readonly next: string
  /** التقويمُ الموحّد (D-410): الفرزُ من العنوان، والبنودُ بحالها، والمنصّاتُ المعروفة. وبلاه يبقى تقويمُ الحمل وحده. */
  readonly cal?: { readonly q: CalQuery; readonly items: readonly CalItem[]; readonly platforms: readonly string[] }
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export function monthCalendar(d: Pick<MonthScreenData, 'period' | 'perDay' | 'dailyCap'>): string {
  const weeks = monthGrid(d.period)
  return html`<div class="scroll"><table>
    <thead><tr>${WEEKDAYS.map((w) => html`<th>${w}</th>`)}</tr></thead>
    <tbody>${weeks.map((w) => html`<tr>${w.map((day) => {
      if (day === null) return html`<td></td>`
      const n = d.perDay[day] ?? 0
      const lv = loadLevel(n, d.dailyCap)
      return html`<td><div class="mono">${String(Number(day.slice(8)))}</div>${lv === null ? '' : raw(statusBadge(lv, String(n), LOAD_SAY[lv], 'title="' + String(n) + ' منشور"'))}</td>`
    })}</tr>`)}</tbody></table></div>`.value
}

// ‏ووجهتا LinkedIn اسمان (D-417): «LinkedIn · حسابي» و«LinkedIn · صفحة»
const pfSay = (p: string): string => (p === 'linkedin' ? 'LinkedIn · حسابي' : platformLabel(p as never))
const VIEWS: readonly CalView[] = ['month', 'week', 'day']

/** شريطُ الفرز: العرضُ، والمنصّاتُ (اختيارٌ متعدّد)، والحال — كلُّه روابطُ في العنوان. */
export function calFilters(q: CalQuery, platforms: readonly string[]): string {
  return filterBar([
    { kind: 'seg', label: 'العرض', options: VIEWS.map((v) => ({ label: CAL_VIEW_SAY[v], href: calHref(q, { view: v }), current: q.view === v })) },
    { kind: 'seg', label: 'المنصّة', options: [
      { label: 'كلّها', href: calHref(q, { platforms: [] }), current: q.platforms.length === 0 },
      ...platforms.map((p) => ({ label: pfSay(p), href: calHref(q, { platforms: toggle(q.platforms, p) }), current: q.platforms.includes(p) })),
    ] },
    { kind: 'seg', label: 'الحال', options: [
      { label: 'كلّها', href: calHref(q, { statuses: [] }), current: q.statuses.length === 0 },
      ...CAL_STATUSES.map((s) => ({ label: CAL_STATUS_SAY[s], href: calHref(q, { statuses: toggle(q.statuses, s) }), current: q.statuses.includes(s) })),
    ] },
  ], 'فرز التقويم')
}

/** مفتاحُ الألوان: الحالاتُ الثلاث بنغمات الشارة. */
export function calKey(): string {
  return html`<p class="row gap-2 m-0" aria-label="مفتاح الألوان">${CAL_STATUSES.map((s) => raw(statusBadge(CAL_STATUS_TONE[s], '•', CAL_STATUS_SAY[s])))}</p>`.value
}

function dayItems(items: readonly CalItem[]): string {
  if (items.length === 0) return html`<p class="hint m-0">لا بند.</p>`.value
  return html`<ul class="plain stack">${items.map((it) => html`<li class="row gap-2"><span class="mono">${it.due.slice(11, 16)}</span>
    <span class="chip">${pfSay(it.platform)}</span>${raw(statusBadge(CAL_STATUS_TONE[it.status], '•', CAL_STATUS_SAY[it.status]))}<span class="grow">${it.title}</span></li>`)}</ul>`.value
}

/** خانةُ الشهر: رقمُ اليوم رابطٌ إلى يومه، ثمّ علاماتُ المنصّات بأعدادها وشاراتُ الحال. */
function monthCell(q: CalQuery, day: string, items: readonly CalItem[], cap: number): string {
  const lv = loadLevel(items.length, cap)
  const pfs = [...new Set(items.map((i) => i.platform))]
  return html`<a class="tap mono" href="${calHref(q, { view: 'day', day })}" aria-label="${'افتح يوم ' + day + '، ' + String(items.length) + ' بند'}">${String(Number(day.slice(8)))}</a>
    ${lv === null ? '' : raw(statusBadge(lv, String(items.length), LOAD_SAY[lv]))}
    ${pfs.map((p) => html` <span class="chip">${pfSay(p)} ${String(items.filter((i) => i.platform === p).length)}</span>`)}
    ${CAL_STATUSES.map((s) => { const n = items.filter((i) => i.status === s).length; return n === 0 ? '' : raw(statusBadge(CAL_STATUS_TONE[s], String(n), CAL_STATUS_SAY[s])) })}`.value
}

export interface CalBlock { readonly q: CalQuery; readonly items: readonly CalItem[]; readonly platforms: readonly string[]; readonly dailyCap: number }

/** التقويمُ الموحّد: شهرٌ بخاناتٍ غنيّة، أو أسبوعٌ، أو يوم — والبنودُ بعد الفرز. */
export function unifiedCalendar(c: CalBlock): string {
  const shown = c.items.filter((i) => matches(i, c.q))
  const on = (day: string): CalItem[] => shown.filter((i) => i.due.slice(0, 10) === day)
  if (c.q.view === 'month') {
    return html`<div class="scroll"><table>
    <thead><tr>${WEEKDAYS.map((w) => html`<th scope="col">${w}</th>`)}</tr></thead>
    <tbody>${monthGrid(c.q.period).map((w) => html`<tr>${w.map((day) => day === null ? html`<td></td>`
      : html`<td>${raw(monthCell(c.q, day, on(day), c.dailyCap))}</td>`)}</tr>`)}</tbody></table></div>`.value
  }
  const span = calSpan(c.q)
  const nav = html`<div class="row gap-2">${raw(button({ label: '‹ السابق', href: calHref(c.q, { day: span.prev }), size: 'sm', variant: 'quiet' }))}
    ${raw(button({ label: 'التالي ›', href: calHref(c.q, { day: span.next }), size: 'sm', variant: 'quiet' }))}</div>`.value
  return nav + span.days.map((day) => html`<section class="mt-2" aria-label="${day}"><h3 class="m-0"><a class="tap mono" href="${calHref(c.q, { view: 'day', day })}">${WEEKDAYS[new Date(day + 'T00:00:00Z').getUTCDay()]!} ${day}</a></h3>
    ${raw(dayItems(on(day)))}</section>`.value).join('')
}

/** «اعتمد ما في الفرز»: يمرّ بمسار الاعتماد نفسِه، بتأكيدٍ يذكر العدد، والفرزُ حقولٌ مخفيّة. */
export function bulkForm(c: CalBlock, planId: string): string {
  const n = bulkPick(c.items, c.q).length
  if (n === 0) return html`<p class="hint m-0">لا بند ينتظر الاعتماد في هذا الفرز.</p>`.value
  const label = 'اعتمد ما في الفرز (' + String(n) + ')'
  return html`<form method="POST" action="/panel/plan/month/approve" data-busy="يُعتمد…" data-confirm="${'اعتمد ' + String(n) + ' بندًا ينتظر في هذا الفرز وجدوِلها؟'}">
    <input type="hidden" name="id" value="${planId}"><input type="hidden" name="p" value="${c.q.period}"><input type="hidden" name="scope" value="filter">
    <input type="hidden" name="v" value="${c.q.view}"><input type="hidden" name="d" value="${c.q.day}">
    <input type="hidden" name="pf" value="${c.q.platforms.join(',')}"><input type="hidden" name="st" value="${c.q.statuses.join(',')}">
    ${raw(button({ label, type: 'submit', variant: 'secondary' }))}</form>`.value
}

export function monthScreen(d: MonthScreenData): string {
  const head = pageHead('الخطّة', 'شهر ' + d.period, 'كلّ يوم بشارة حمله، والتحذيرات فوقه، والفرق قبل الاعتماد.')
  const go = (p: string): string => d.cal === undefined ? '/panel/plan/month?p=' + p : calHref(d.cal.q, { view: 'month', period: p })
  const nav = html`<div class="row gap-2">${raw(button({ label: '‹ ' + d.prev, href: go(d.prev), size: 'sm', variant: 'quiet' }))}
    ${raw(button({ label: d.next + ' ›', href: go(d.next), size: 'sm', variant: 'quiet' }))}
    ${raw(button({ label: 'الاستيرادات', href: '/panel/plan/imports', size: 'sm', variant: 'secondary' }))}</div>`.value
  if (d.planId === null) {
    return head + nav + card({ title: 'لا خطّة لهذا الشهر', body: html`<p class="hint">ادفع ملفّ ${d.period} إلى 01-plan، أو ابدأ خطّة جديدة.</p>
      <div class="row">${raw(button({ label: 'خطّة جديدة', href: '/panel/plan/new' }))}</div>`.value })
  }
  const ids = html`<input type="hidden" name="id" value="${d.planId}"><input type="hidden" name="p" value="${d.period}">`
  const rollback = d.canRollback === true && !d.canApprove
    ? html`<div class="row mt-2"><form class="inline" method="POST" action="/panel/plan/month/unschedule" data-busy="تُلغى الجدولة…">${ids}${raw(button({ label: 'ألغِ جدولة الشهر', size: 'sm', type: 'submit', variant: 'secondary' }))}</form>
        <form class="inline" method="POST" action="/panel/plan/month/reopen" data-busy="يُفتح…">${ids}${raw(button({ label: 'افتح الإصدار', size: 'sm', type: 'submit', variant: 'quiet' }))}</form></div>
        <p class="hint m-0">«افتح الإصدار» يعيد المعتمَد مسوّدةً بإصدارٍ جديد، والمجدوَل يُلغى أوّلًا.</p>`
    : html``
  const approve = html`<p class="m-0" role="status"><b>${d.approval}</b></p>${d.canApprove
    ? html`<form method="POST" action="/panel/plan/month/approve" data-busy="يُعتمد…">${ids}<div class="row">${raw(button({ label: 'اعتمد الشهر', type: 'submit' }))}
        ${raw(button({ label: 'راجع البنود', href: '/panel/plan/review?id=' + d.planId, variant: 'secondary' }))}</div></form>`
    : d.canRollback === true ? html`` : html`<p class="hint">الاعتماد للناشر فأعلى.</p>`}${rollback}`
  const cal = d.cal === undefined ? monthCalendar(d)
    : calFilters(d.cal.q, d.cal.platforms) + calKey() + unifiedCalendar({ ...d.cal, dailyCap: d.dailyCap }) +
      (d.canApprove ? '<div class="mt-2">' + bulkForm({ ...d.cal, dailyCap: d.dailyCap }, d.planId) + '</div>' : '')
  return head + nav + checksStrip(d.checks) + '<div class="mt-3">' + card({ title: 'التقويم', body: cal }) + '</div>' +
    (d.diff.length === 0 ? '' : '<div class="mt-3">' + diffCard(d.diff) + '</div>') +
    '<div class="mt-3">' + card({ title: 'الاعتماد', body: approve.value }) + '</div>'
}

/** رحلةُ الشهر الحاليّ والقادم في الرئيسيّة: المحطّاتُ الخمس بأعدادها، والتنبيهاتُ فوقها. */
export function monthJourneyCard(months: readonly MonthJourney[]): string {
  const alerts = months.flatMap((m) => m.alerts)
  const body = html`${alerts.length === 0 ? '' : html`<ul class="plain stack">${alerts.map((a) => html`<li class="row gap-2">${raw(statusBadge('warn', '!', 'تنبيه'))}<span>${a}</span></li>`)}</ul>`}
    ${months.map((m) => html`<div class="row gap-2"><a class="tap mono" href="/panel/plan/month?p=${m.period}">${m.period}</a>
      ${STATIONS.map((s) => {
        const done = m.reached !== null && STATIONS.indexOf(s) <= STATIONS.indexOf(m.reached)
        return raw(statusBadge(done ? 'ok' : 'idle', String(m.counts[s]), STATION_SAY[s]))
      })}</div>`)}`
  return card({ title: 'رحلة الشهرين', body: body.value })
}
