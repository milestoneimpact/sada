/**
 * **شاشاتُ الخطّة الموحّدة** (D-383 · المرحلة ٨): سجلُّ الاستيرادات، والشهرُ بتقويمه وشاراتِ حمله، والفرقُ قبل الاعتماد،
 * وسطرُ الاعتماد، ورحلةُ الشهرين في الرئيسيّة.
 *
 * كلُّها قوالبُ خالصة: ما تعرضه يُحسب في `lib/plan/month.ts` و`planChecks`، وشريطُ التحذيرات وأزرارُ «وزّع» و«أزِح»
 * و«ادمج» هي `checksStrip` نفسُها لا نسخةٌ منها. وبلا سكربتٍ يعمل كلُّ شيء: كلُّ زرٍّ نموذج.
 */
import {
  LOAD_SAY, NEXT_MONTH_FROM_DAY, PATH_STEPS, PLAN_STAGE_SAY, STATION_SAY, STATIONS, loadLevel, monthGrid, pathAt, planStage, stageNext,
  type DiffRow, type ImportRow, type MonthFacts, type MonthJourney,
} from '../../lib/plan/month'

export type { DiffRow, ImportRow }
import { checksStrip, type ChecksView } from './checksView'
import { statusBadge } from './components/badge'
import { button } from './components/button'
import { card } from './components/card'
import { html, raw } from './html'
import { pageHead } from './parts'
import { ICON } from './icons'

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
      <td>${raw(statusBadge(STATUS_TONE[r.status] ?? 'idle', r.status === 'failed' ? '×' : '•', STATUS_SAY[r.status] ?? r.status))}</td>
      <td class="mono">${r.contentHash.slice(0, 10)}</td>
      <td>${r.summary}</td>
      <td>${canRecheck && r.period !== null
        ? html`<form class="inline" method="GET" action="/panel/plan/month"><input type="hidden" name="p" value="${r.period}">${raw(button({ label: 'إعادة الفحص', size: 'sm', type: 'submit', variant: 'secondary' }))}</form>`
        : ''}</td>
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
  /** خطوةُ الشهر في المسار الرباعيّ (`pathAt`، D-389) — تُرسم تحت الرأس. */
  readonly path?: number
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

export function monthScreen(d: MonthScreenData): string {
  const head = pageHead('الخطّة', 'شهر ' + d.period, 'كلّ يوم بشارة حمله، والتحذيرات فوقه، والفرق قبل الاعتماد.')
  const path = d.path === undefined ? '' : '<div class="mb-3">' + pathSteps(d.path) + '</div>'
  const nav = html`<div class="row gap-2">${raw(button({ label: '‹ ' + d.prev, href: '/panel/plan/month?p=' + d.prev, size: 'sm', variant: 'quiet' }))}
    ${raw(button({ label: d.next + ' ›', href: '/panel/plan/month?p=' + d.next, size: 'sm', variant: 'quiet' }))}
    ${raw(button({ label: 'الاستيرادات', href: '/panel/plan/imports', size: 'sm', variant: 'secondary' }))}</div>`.value
  if (d.planId === null) {
    return head + path + nav + card({ title: 'لا خطّة لهذا الشهر', body: html`<p class="hint">ادفع ملفّ ${d.period} إلى 01-plan، أو ابدأ خطّة جديدة.</p>
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
  return head + path + nav + checksStrip(d.checks) + '<div class="mt-3">' + card({ title: 'التقويم', body: monthCalendar(d) }) + '</div>' +
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

/**
 * **المسارُ الرباعيّ مؤشّرَ خطوات** (D-389): المصدرُ ← الفحصُ ← الاعتمادُ ← التيّار، شاراتٌ من `statusBadge` على سطرٍ يلتفّ —
 * ما تمّ أخضرُ بـ«✓»، والحاليّةُ كهرمانيّةٌ بـ`aria-current="step"`، وما بعدها محايد. لا نمطَ جديد.
 */
export function pathSteps(at: number): string {
  return html`<ol class="plain row gap-2 pm-path" aria-label="مسار الخطّة">${PATH_STEPS.map((label, i) => {
    const [tone, g] = i < at ? (['ok', '✓'] as const) : i === at ? (['warn', '◍'] as const) : (['idle', '○'] as const)
    return html`<li${i === at ? raw(' aria-current="step"') : ''}>${i === 0 ? '' : raw('<span class="arw" aria-hidden="true">' + ICON.go + '</span> ')}${raw(statusBadge(tone, g, label))}</li>`
  })}</ol>`.value
}

/**
 * **بطاقةُ «خطّةُ الشهر القادم»** في الرئيسيّة (D-389): تظهر من يوم ‏20 بتوقيت المالك وتغيب قبله — حالُ الشهر في كلمة،
 * والمسارُ الرباعيّ، وزرٌّ واحدٌ للخطوة التالية. `today` يومُ المالك «YYYY-MM-DD».
 */
export function nextMonthCard(f: MonthFacts, today: string): string {
  if (Number(today.slice(8, 10)) < NEXT_MONTH_FROM_DAY) return ''
  const stage = planStage(f)
  const go = stageNext(stage, f.period)
  const tone = stage === 'scheduled' ? 'ok' : stage === 'none' ? 'idle' : 'warn'
  const body = html`<div class="row gap-2"><span class="mono">${f.period}</span>${raw(statusBadge(tone, stage === 'scheduled' ? '✓' : stage === 'none' ? '○' : '◍', PLAN_STAGE_SAY[stage]))}</div>
    <div class="mt-3">${raw(pathSteps(pathAt(stage)))}</div>
    <div class="row gap-2 mt-3">${raw(button({ label: go.label, href: go.href, variant: 'secondary' }))}</div>`
  return '<div class="mt-3">' + card({ id: 'next-month', title: 'خطّةُ الشهر القادم', titleId: 'nm-t', attrs: 'role="region" aria-labelledby="nm-t"', body: body.value }) + '</div>'
}
