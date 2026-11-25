/**
 * **«هذا ما فهمته»** (طلبُ المالك 2026-11-15: «ارفقتُ خطّة، فالأصل أن يتمّ تحليلٌ كامل لها»).
 *
 * الشاشةُ الأولى من «ابنِ ← راجع ← اعتمد ← تابع» حين تكون الخطّةُ للمالك: يُقرأ الملفّ ولا يُسكَّن شيء،
 * ويُعرض ما فُهم منه: المدّة، وعددُ المنشورات لكلّ منصّة، وما أكمله صدى (يومٌ أو ساعة)، والصفوفُ نفسُها
 * بعلامة «من ملفّك» أو «من صدى». ثمّ زرٌّ أوّليٌّ واحد «ابنِ الخطّة من ملفّي» وثانويٌّ «ارفع غيره».
 */
import { parseCsvRecords } from '../../lib/plan/import'
import { counted, NOUNS } from '../../lib/format'
import { pageHead } from './parts'
import { card } from './components/card'
import { button } from './components/button'
import { html, raw } from './html'
import type { PlanRules } from '../../lib/plan/guidelines'

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
  const per = new Map<string, number>()
  for (const { cells } of rows) per.set(g(cells, pi) || '؟', (per.get(g(cells, pi) || '؟') ?? 0) + 1)
  const days = rows.map(({ cells }) => g(cells, di)).filter((x) => x !== '').sort()
  const filledN = Object.keys(d.filled).length
  const source = d.via === 'model' ? 'نصٌّ حرٌّ قرأه نموذجُ الكتابة' : d.widened ? 'جدولٌ عريض: صفٌّ لكلّ يوم وعمودان لكلّ منصّة' : 'جدولٌ بصفٍّ لكلّ منشور'
  const facts = html`<dl class="pv-facts">
    <div><dt>المدّة</dt><dd dir="ltr">${days.length === 0 ? '—' : days[0] + ' إلى ' + days[days.length - 1]}</dd></div>
    <div><dt>المنشورات</dt><dd>${counted(rows.length, NOUNS.post)}</dd></div>
    <div><dt>لكلّ منصّة</dt><dd>${[...per].map(([p, n]) => p + ' ' + String(n)).join(' · ')}</dd></div>
    <div><dt>أكمله صدى</dt><dd>${filledN === 0 ? 'لا شيء، كلُّه من ملفّك' : counted(filledN, NOUNS.post) + ' بيومٍ أو ساعةٍ لم يذكرها الملفّ'}</dd></div>
    <div><dt>الملفّ</dt><dd>${source}</dd></div>
  </dl>`
  const table = html`<div class="pv-scroll"><table class="pv-table">
    <thead><tr><th>اليوم</th><th>الوقت</th><th>المنصّة</th><th>الفكرة أو النصّ</th><th>المصدر</th></tr></thead>
    <tbody>${rows.slice(0, SHOWN).map(({ cells, line }) => {
      const note = d.filled[String(line)]
      return html`<tr><td dir="ltr">${g(cells, di)}</td><td dir="ltr">${g(cells, ti)}</td><td>${g(cells, pi)}</td>
        <td>${g(cells, xi).replace(/\s+/g, ' ').slice(0, 140)}${raw(d.media?.[String(line)] ?? '')}</td><td>${note === undefined ? 'من ملفّك' : note}</td></tr>`
    })}</tbody></table></div>
    ${rows.length > SHOWN ? html`<p class="hint m-0">وغيرُها ${counted(rows.length - SHOWN, NOUNS.post)} تظهر في المراجعة.</p>` : html``}`
  const cost = d.cost > 0 ? 'كلّفت القراءةُ $' + d.cost.toFixed(3) + ' في الدفتر. ' : ''
  const act = html`<form method="POST" action="/panel/plan/import/confirm" class="stack">
    <input type="hidden" name="k" value="${d.key}">
    <p class="hint m-0">${cost}«اكتب» يكتب كلَّ منشورٍ من فكرته بقواعد منصّته: ${counted(rows.length, NOUNS.post)}، نداءٌ مدفوعٌ لكلٍّ في الدفتر وتحت سقفك اليوميّ. و«ابنِ كما هي» يضع النصوصَ كما في ملفّك بلا كلفة. ولا يُجدوَل شيءٌ قبل أن تعتمد.</p>
    ${d.estimate === undefined ? html`` : html`<p class="hint m-0"><strong>«اكتب»</strong>: ${d.estimate.write}${d.estimate.seat === null ? html`` : html` <strong>«ابنِ كما هي»</strong> مع الصور: ${d.estimate.seat}`} من أسعار المزوّدين المضبوطة نفسِها التي يكتب بها الدفتر.</p>`}
    <div class="row gap-2">${raw(button({ label: 'اكتب الخطّة من أفكارها', type: 'submit', variant: 'primary', name: 'write', value: '1' }))}
      ${raw(button({ label: 'ابنِ كما هي', type: 'submit', variant: 'secondary', name: 'write', value: '0' }))}
      ${raw(button({ label: 'ارفع غيره', href: '/panel/plan/import', variant: 'quiet' }))}</div></form>`
  return html`${raw(pageHead('', 'هذا ما فهمته', 'لم يُبنَ شيءٌ بعد. راجع ما قرأتُه من ملفّك، فإن صحّ فابنِ.'))}
    <div class="stack">
      ${raw(card({ title: 'الخلاصة', level: 2, body: facts.value }))}
      ${d.rules == null ? html`` : raw(card({ title: 'قواعد الكتابة من ورقة الإرشادات', level: 2, body: html`<div class="pv-rules">${Object.entries(d.rules).map(([p, list]) => html`<section><h3 class="m-0">${p}</h3>
        <dl class="pv-facts">${list.map((r) => html`<div><dt>${r.item}</dt><dd>${r.value}</dd></div>`)}</dl></section>`)}</div>`.value }))}
      ${raw(card({ title: 'الصفوف', level: 2, body: table.value }))}
      ${act}
    </div>`.value
}
