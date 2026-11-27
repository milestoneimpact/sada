/**
 * **«هذا ما فهمته»** (طلبُ المالك 2026-11-15: «ارفقتُ خطّة، فالأصل أن يتمّ تحليلٌ كامل لها»).
 *
 * الشاشةُ الأولى من «ابنِ ← راجع ← اعتمد ← تابع» حين تكون الخطّةُ للمالك: يُقرأ الملفّ ولا يُسكَّن شيء،
 * ويُعرض ما فُهم منه: المدّة، وعددُ المنشورات لكلّ منصّة، وما أكمله صدى (يومٌ أو ساعة)، والصفوفُ نفسُها
 * بعلامة «من ملفّك» أو «من صدى». ثمّ زرٌّ أوّليٌّ واحد «ابنِ الخطّة من ملفّي» وثانويٌّ «ارفع غيره».
 */
import { parseCsvRecords, platformOfCell } from '../../lib/plan/import'
import { textProblem } from '../../lib/draft/store'
import { dayLabel } from './planReviewView'
import { counted, NOUNS } from '../../lib/format'
import { pageHead } from './parts'
import { card } from './components/card'
import { button } from './components/button'
import { html, raw } from './html'
import type { PlanRules } from '../../lib/plan/guidelines'
import type { RowTag, SeatPreview } from '../../lib/plan/seat'
import { statusBadge, type Tone } from './components/badge'
import { notice } from './components/toast'
import { PLATFORM_LABEL } from '../../lib/oauth/providers'

export interface PreviewData {
  readonly key: string
  readonly csv: string
  /** رقمُ السطر ← ما أكمله صدى. */
  readonly filled: Readonly<Record<string, string>>
  readonly via: string
  readonly widened: boolean
  readonly cost: number
  readonly rules?: PlanRules | null
  /** رقمُ السطر ← سطرُ وسيطته من مكتبة Drive (D-363، `mediaLine`) — HTML مهرَّبٌ من قبل. */
  readonly media?: Readonly<Record<string, string>>
  /** تقديرُ الزرّين بالدولار قبل الضغط (D-395، `buildEstimateLine`) — نصٌّ خامٌّ يُهرَّب هنا. */
  readonly estimate?: { readonly write: string; readonly seat: string | null }
  /** ما سيفعله «ابنِ» بكلّ صفّ (D-406، `previewSeat`)، وتاريخُ الاستيراد السابق للملفّ نفسِه نصًّا جاهزًا للعرض. */
  readonly seat?: SeatPreview & { readonly importedLabel?: string | null }
}

type Tag = RowTag | 'removed'

/** وسومُ المعاينة (D-406): لونٌ ورمزٌ وكلمةٌ معًا (D-043)، بشارة الحال نفسِها. */
export const TAG: Readonly<Record<Tag, { readonly tone: Tone | ''; readonly g: string; readonly say: string }>> = {
  new: { tone: 'ok', g: '◆', say: 'جديد' },
  modified: { tone: 'warn', g: '✎', say: 'معدَّل' },
  unchanged: { tone: 'idle', g: '○', say: 'بلا تغيير' },
  scheduled: { tone: 'pending', g: '◔', say: 'مجدول سابقًا' },
  published: { tone: '', g: '■', say: 'منشور سابقًا' },
  removed: { tone: 'bad', g: '✕', say: 'محذوف من الملفّ' },
}
const ORDER: readonly Tag[] = ['new', 'modified', 'unchanged', 'scheduled', 'published', 'removed']
const tagBadge = (t: Tag): string => statusBadge(TAG[t].tone, TAG[t].g, TAG[t].say)

/** شريطُ الخلاصة: عددُ كلّ وسم، وما عددُه صفرٌ لا يُعرض. */
export function tagBar(seat: SeatPreview): string {
  const n = (t: Tag): number => t === 'removed' ? seat.removed.length : Object.values(seat.tags).filter((x) => x === t).length
  const shown = ORDER.filter((t) => n(t) > 0)
  if (shown.length === 0) return ''
  return html`<ul class="plain row gap-2" aria-label="ما سيفعله البناء بصفوف ملفّك">${shown.map((t) =>
    html`<li>${raw(statusBadge(TAG[t].tone, TAG[t].g, TAG[t].say + ' ' + String(n(t))))}</li>`)}</ul>`.value
}

const SHOWN = 60

export function planPreviewScreen(d: PreviewData): string {
  const records = parseCsvRecords(d.csv)
  const head = (records[0]?.cells ?? []).map((h) => h.trim().toLowerCase())
  const at = (names: readonly string[]) => head.findIndex((h) => names.includes(h))
  const di = at(['التاريخ', 'date', 'day'])
  const ti = at(['الوقت', 'time', 'الساعة'])
  const pi = at(['المنصة', 'المنصّة', 'platform'])
  const xi = at(['النص', 'النصّ', 'text', 'caption', 'نص المنشور', 'نصّ المنشور'])
  const rows = records.slice(1)
  const g = (r: readonly string[], i: number) => (i < 0 ? '' : (r[i] ?? '').trim())
  // ‏**اسمُ المنصّة لا رمزُها** (D-436): «linkedin» في الملفّ «LinkedIn» في المعاينة، وما لا يُعرف يبقى كما كُتب
  const pfOf = (cell: string): string | null => { const p = platformOfCell(cell); return p === null ? null : p === 'linkedin-page' ? 'linkedin' : p }
  const pfName = (cell: string): string => {
    const p = platformOfCell(cell)
    return p === null ? (cell === '' ? '؟' : cell) : p === 'linkedin-page' ? 'صفحة LinkedIn' : PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p
  }
  const per = new Map<string, number>()
  for (const { cells } of rows) per.set(pfName(g(cells, pi)), (per.get(pfName(g(cells, pi))) ?? 0) + 1)
  // ‏**فحصُ الاعتماد نفسُه هنا** (D-436): نصٌّ أقصرُ من منشورٍ يُوسم «قصير» قبل البناء — كان يُبنى ثمّ يردّه «اعتمد المحدّد» 0 من 3
  const problemOf = (cells: readonly string[]): string | null => {
    const text = g(cells, xi); const p = pfOf(g(cells, pi))
    return text === '' || p === null ? null : textProblem(p, text)
  }
  const allText = rows.length > 0 && xi >= 0 && rows.every(({ cells }) => g(cells, xi) !== '')
  const shortN = rows.filter(({ cells }) => problemOf(cells) !== null).length
  const days = rows.map(({ cells }) => g(cells, di)).filter((x) => x !== '').sort()
  const filledN = Object.keys(d.filled).length
  const source = d.via === 'model' ? 'نصٌّ حرٌّ قرأه نموذجُ الكتابة' : d.widened ? 'جدولٌ عريض: صفٌّ لكلّ يوم وعمودان لكلّ منصّة' : 'جدولٌ بصفٍّ لكلّ منشور'
  const facts = html`<dl class="pv-facts">
    <div><dt>المدّة</dt><dd>${days.length === 0 ? '—' : html`<bdi>${dayLabel(days[0]!)}</bdi> إلى <bdi>${dayLabel(days[days.length - 1]!)}</bdi>`}</dd></div>
    <div><dt>المنشورات</dt><dd>${counted(rows.length, NOUNS.post)}</dd></div>
    <div><dt>لكلّ منصّة</dt><dd>${[...per].map(([p, n]) => p + ' ' + String(n)).join(' · ')}</dd></div>
    ${shortN === 0 ? html`` : html`<div><dt>قصير</dt><dd>${counted(shortN, NOUNS.post)} نصُّها أقصرُ من منشور — أكملها في ملفّك، أو اكتبها من أفكارها</dd></div>`}
    <div><dt>أكمله صدى</dt><dd>${filledN === 0 ? 'لا شيء، كلُّه من ملفّك' : counted(filledN, NOUNS.post) + ' بيومٍ أو ساعةٍ لم يذكرها الملفّ'}</dd></div>
    <div><dt>الملفّ</dt><dd>${source}</dd></div>
  </dl>`
  const table = html`<div class="pv-scroll"><table class="pv-table">
    <caption class="vh">صفوفُ ملفّك كما قُرئت</caption>
    <thead><tr><th scope="col">اليوم</th><th scope="col">الوقت</th><th scope="col">المنصّة</th><th scope="col">الفكرة أو النصّ</th><th scope="col">المصدر</th>${d.seat === undefined ? '' : html`<th scope="col">عند البناء</th>`}</tr></thead>
    <tbody>${rows.slice(0, SHOWN).map(({ cells, line }) => {
      const note = d.filled[String(line)]
      const bad = problemOf(cells)
      const day = g(cells, di)
      return html`<tr${bad === null ? '' : raw(' class="is-bad"')}><th scope="row"><bdi>${/^\d{4}-\d{2}-\d{2}$/.test(day) ? dayLabel(day) : day}</bdi></th><td><bdi dir="ltr" class="mono">${g(cells, ti)}</bdi></td><td>${pfName(g(cells, pi))}</td>
        <td>${bad === null ? '' : raw(statusBadge('warn', '!', 'قصير') + ' ')}${g(cells, xi).replace(/\s+/g, ' ').slice(0, 140)}${raw(d.media?.[String(line)] ?? '')}${bad === null ? '' : html`<span class="hint"> — ${bad}</span>`}</td><td>${note === undefined ? 'من ملفّك' : note}</td>${d.seat === undefined ? '' : html`<td>${raw(d.seat.tags[String(line)] === undefined ? '—' : tagBadge(d.seat.tags[String(line)]!))}</td>`}</tr>`
    })}</tbody></table></div>
    ${rows.length > SHOWN ? html`<p class="hint m-0">وغيرُها ${counted(rows.length - SHOWN, NOUNS.post)} تظهر في المراجعة.</p>` : html``}`
  const seat = d.seat
  const removed = seat === undefined || seat.removed.length === 0 ? html`` : html`<ul class="plain stack">${seat.removed.map((r) => html`<li class="row gap-2">
      ${raw(tagBadge('removed'))}<span class="chip">${PLATFORM_LABEL[r.platform as keyof typeof PLATFORM_LABEL] ?? r.platform}</span>
      <bdi dir="ltr">${r.due ?? '—'}</bdi><span class="grow">${r.angle.replace(/\s+/g, ' ').slice(0, 140)}</span>
      <span class="hint">${r.guarded ? 'يبقى: منشورُه مجدولٌ أو منشور' : 'يُحذف من الخطّة'}</span></li>`)}</ul>`
  const banner = seat?.importedLabel == null ? '' : notice({ tone: 'warn', g: '◍', html: html`هذا الملفّ استُورد في ${seat.importedLabel} — البناءُ لن يغيّر شيئًا. عدّل الملفّ ثمّ ارفعه، أو راجع خطّتك.`.value })
  const cost = d.cost > 0 ? 'كلّفت القراءةُ $' + d.cost.toFixed(3) + ' في الدفتر. ' : ''
  const act = html`<form method="POST" action="/panel/plan/import/confirm" class="stack">
    <input type="hidden" name="k" value="${d.key}">
    <p class="hint m-0">${cost}«اكتب» يكتب كلَّ منشورٍ من فكرته بقواعد منصّته: ${counted(rows.length, NOUNS.post)}، نداءٌ مدفوعٌ لكلٍّ في الدفتر وتحت سقفك اليوميّ. و«ابنِ كما هي» يضع النصوصَ كما في ملفّك بلا كلفة. ولا يُجدوَل شيءٌ قبل أن تعتمد.</p>
    ${d.estimate === undefined ? html`` : html`<p class="hint m-0"><strong>«اكتب»</strong>: ${d.estimate.write}${d.estimate.seat === null ? html`` : html` <strong>«ابنِ كما هي»</strong> مع الصور: ${d.estimate.seat}`} من أسعار المزوّدين المضبوطة نفسِها التي يكتب بها الدفتر.</p>`}
    ${/* ‏**ما في الملفّ نصٌّ كلُّه يُبنى كما هو أوّلًا** (D-436): إعادةُ الكتابة بالذكاء ثانويّةٌ وكلفتُها على زرّها */''}
    <div class="row gap-2">${allText && shortN === 0
      ? html`${raw(button({ label: 'ابنِ كما هي', type: 'submit', variant: 'primary', name: 'write', value: '0' }))}
      ${raw(button({ label: 'أعد كتابتها بالذكاء (' + counted(rows.length, NOUNS.request, 'acc') + ' مدفوعة' + (d.estimate === undefined ? '' : ' · ' + d.estimate.write) + ')', type: 'submit', variant: 'secondary', name: 'write', value: '1' }))}`
      : html`${raw(button({ label: 'اكتب الخطّة من أفكارها', type: 'submit', variant: 'primary', name: 'write', value: '1' }))}
      ${raw(button({ label: 'ابنِ كما هي', type: 'submit', variant: 'secondary', name: 'write', value: '0' }))}`}
      ${raw(button({ label: 'ارفع غيره', href: '/panel/plan/import', variant: 'quiet' }))}</div></form>`
  return html`${raw(pageHead('', 'هذا ما فهمته', 'لم يُبنَ شيءٌ بعد. راجع ما قرأتُه من ملفّك، فإن صحّ فابنِ.'))}
    <div class="stack">
      ${raw(banner)}
      ${raw(card({ title: 'الخلاصة', level: 2, body: facts.value + (seat === undefined ? '' : tagBar(seat)) }))}
      ${d.rules == null ? html`` : raw(card({ title: 'قواعد الكتابة من ورقة الإرشادات', level: 2, body: html`<div class="pv-rules">${Object.entries(d.rules).map(([p, list]) => html`<section><h3 class="m-0">${p}</h3>
        <dl class="pv-facts">${list.map((r) => html`<div><dt>${r.item}</dt><dd>${r.value}</dd></div>`)}</dl></section>`)}</div>`.value }))}
      ${raw(card({ title: 'الصفوف', level: 2, body: table.value }))}
      ${seat === undefined || seat.removed.length === 0 ? html`` : raw(card({ title: 'في خطّتك وليس في الملفّ', level: 2, body: removed.value }))}
      ${act}
    </div>`.value
}
