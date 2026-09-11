/**
 * لوحُ المقارنة — **وهنا صدَق الجدولُ ولم يصدُق في `E-4`** (D-120).
 *
 * أُغلق `E-4` لأنّ بطاقاتِ القنوات تختلف بحالها **قصدا**. والمنشوراتُ
 * غيرُها: متطابقةُ الحقول تماما. **فمئةُ منشورٍ في مئة بطاقةٍ لا تُقارَن**،
 * وفي جدولٍ محوريٍّ تُقارَن بنظرة.
 *
 * **والضبطُ نموذجُ `GET` لا جافاسكربت.** فالعنوانُ يحمل العرضَ كلَّه:
 * يُنسَخ ويُرسَل ويُحفَظ في المفضّلة، **ويعمل قبل أن يُحمَّل سطرُ نصٍّ
 * واحد**. وزرٌّ لا يعمل بلا جافاسكربت زرٌّ يعمل خطأً (D-046).
 */
import { escapeHtml } from '../shell'
import {
  cellText, DIMENSION_LABEL, DIMENSIONS, MEASURE_LABEL, MEASURES,
  type Dimension, type Measure, type PivotTable,
} from '../../../lib/pivot'

export interface PivotView {
  readonly table: PivotTable
  readonly rows: Dimension
  readonly cols: Dimension | null
  readonly measure: Measure
  readonly sinceDays: number
  /** أبلغت الحقائقُ السقفَ فطُوي ما بعدها؟ */
  readonly capped: boolean
  readonly cap: number
}

/** المدى بالأيّام — **وخياراتٌ معدودةٌ خيرٌ من حقلٍ يقبل أيَّ رقم**. */
const SPANS: readonly { readonly days: number; readonly label: string }[] = [
  { days: 7, label: 'أسبوع' },
  { days: 30, label: '٣٠ يوما' },
  { days: 90, label: '٩٠ يوما' },
  { days: 365, label: 'سنة' },
]

function option(value: string, label: string, on: boolean): string {
  return `<option value="${escapeHtml(value)}"${on ? ' selected' : ''}>${escapeHtml(label)}</option>`
}

function picker(
  id: string, name: string, label: string, chosen: string,
  items: readonly { readonly v: string; readonly t: string }[],
): string {
  return `<div class="field"><label for="${id}">${escapeHtml(label)}</label>
    <select id="${id}" name="${escapeHtml(name)}">${
      items.map((i) => option(i.v, i.t, i.v === chosen)).join('')}</select></div>`
}

const dims = DIMENSIONS.map((d) => ({ v: d, t: DIMENSION_LABEL[d] }))

/**
 * **والحرارةُ تُقرأ من الرقم لا من اللون وحدَه.**
 *
 * تدرّجٌ خافتٌ خلف الخليّة يدلّ العينَ على الثقل، **والرقمُ يبقى مقروءا
 * بحبره** — فمن لا يميّز الألوان لا يفقد شيئا (D-086).
 */
function heat(v: number | null, max: number): string {
  if (v === null || max <= 0 || v <= 0) return ''
  const t = Math.min(1, v / max)
  return ` style="background:color-mix(in srgb,var(--brand) ${Math.round(t * 16)}%,transparent)"`
}

export function pivotPane(d: PivotView): string {
  const t = d.table
  const max = Math.max(0, ...t.cells.flat().map((v) => v ?? 0))
  const twoAxis = d.cols !== null

  const head = `<tr><th class="pv-h">${escapeHtml(DIMENSION_LABEL[d.rows])}</th>${
    t.colKeys.map((c) =>
      `<th>${c === '' ? escapeHtml(MEASURE_LABEL[d.measure]) : escapeHtml(c)}</th>`).join('')
  }${twoAxis ? '<th class="pv-t">الكلّ</th>' : ''}</tr>`

  const body = t.rowKeys.map((r, i) => {
    const cells = t.cells[i] ?? []
    return `<tr><th scope="row">${escapeHtml(r)}</th>${
      cells.map((v) => `<td${heat(v, max)}>${escapeHtml(cellText(v, d.measure))}</td>`).join('')
    }${twoAxis ? `<td class="pv-t">${escapeHtml(cellText(t.rowTotals[i] ?? null, d.measure))}</td>` : ''}</tr>`
  }).join('')

  const foot = twoAxis
    ? `<tr class="pv-f"><th scope="row">الكلّ</th>${
        t.colTotals.map((v) => `<td>${escapeHtml(cellText(v, d.measure))}</td>`).join('')
      }<td class="pv-t">${escapeHtml(cellText(t.grand, d.measure))}</td></tr>`
    : ''

  /*
   * **وجدولٌ فارغٌ يقول لماذا.** «لا نتائج» وحدَها تترك المالكَ يظنّ
   * العطلَ في اللوح، **والسببُ في المدى غالبا** — فيُقال ويُعرَض الفعل.
   */
  const empty = `<div class="empty"><b>لا منشورَ في هذا المدى</b>
    <p>المدى الحاليُّ ${escapeHtml(String(d.sinceDays))} يوما.
      وسّعه، أو اعتمد مسوّدةً من «المنشورات» فتدخل الجدولَ يومَ موعدها.</p></div>`

  return `<section data-pane="pivot" hidden>
  <p class="lede lede-lead">تختار الصفوفَ والأعمدةَ والقياس، فيُعاد بناءُ الجدول.
    <b>والعنوانُ يحمل عرضَك</b> — انسخه تعُد إليه كما تركته.</p>

  <div class="card">
    <form class="row pv-form" method="GET" action="/panel">
      ${picker('pv-r', 'rows', 'الصفوف', d.rows, dims)}
      ${picker('pv-c', 'cols', 'الأعمدة', d.cols ?? 'none',
        [{ v: 'none', t: 'بلا أعمدة' }, ...dims])}
      ${picker('pv-m', 'm', 'القياس', d.measure,
        MEASURES.map((m) => ({ v: m, t: MEASURE_LABEL[m] })))}
      ${picker('pv-d', 'days', 'المدى', String(d.sinceDays),
        SPANS.map((s) => ({ v: String(s.days), t: s.label })))}
      <button class="p" type="submit">اعرض</button>
    </form>
  </div>

  <div class="card" style="margin-top:var(--s-3)">
    <div class="split">
      <h2>${escapeHtml(MEASURE_LABEL[d.measure])} — ${
        escapeHtml(DIMENSION_LABEL[d.rows])}${
        d.cols === null ? '' : ` × ${escapeHtml(DIMENSION_LABEL[d.cols])}`}</h2>
      <span class="n">${escapeHtml(String(t.facts))} منشورا${
        d.capped ? ` · بلغ السقفَ (${escapeHtml(String(d.cap))}) فطُوي ما قبله` : ''}</span>
    </div>
    ${t.rowKeys.length === 0
      ? empty
      : `<div class="pv-wrap"><table class="pv">
          <thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>`}
    ${t.rowKeys.length === 0 ? '' : `<p class="hint">خليّةٌ فارغةٌ تعني
      <b>لا منشورَ في تقاطعها</b> — لا صفرا. وصفرٌ يُكتب صفرا.</p>`}
  </div>
</section>`
}
