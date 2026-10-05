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
import { escapeHtml } from '../escape'
import { counted, NOUNS } from '../../../lib/format'
import { pageHead } from '../parts'
import { sectionLabel } from '../command'
import { PLATFORM_LABEL } from '../../../lib/oauth/providers'
import {
  cellText, DIMENSION_LABEL, DIMENSIONS, keyLabel, MEASURE_LABEL, MEASURES,
  type Dimension, type Measure, type PivotTable,
} from '../../../lib/pivot'
import { emptyState } from '../components/empty'

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
  { days: 30, label: '30 يوما' },
  { days: 90, label: '90 يوما' },
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

/**
 * عنوانُ الملفّ يحمل العرضَ نفسَه الذي يحمله عنوانُ الصفحة (D-120) —
 * **فما يُنزَّل هو ما يُرى، لا افتراضٌ ثانٍ.**
 */
function csvHref(d: PivotView): string {
  const q = new URLSearchParams({
    rows: d.rows, cols: d.cols ?? 'none', m: d.measure, days: String(d.sinceDays),
  })
  return `/panel/pivot.csv?${q.toString()}`
}

/**
 * **رأسُ الصفّ بابٌ إلى شاشته** (D-132): حين يكون الصفُّ منصّةً لها شاشة،
 * يصير اسمُه رابطًا إليها. وما سواه (حسابٌ، حالٌ، يومٌ) اسمٌ كما كان.
 * والرابطُ في `th` لا يغيّر الجدولَ للطباعة ولا لقارئ الشاشة.
 */
function rowHead(dim: Dimension, key: string): string {
  const label = escapeHtml(keyLabel(dim, key))
  if (dim !== 'platform' || !(key in PLATFORM_LABEL)) return label
  return `<a href="/panel/channels/${escapeHtml(key)}" title="شاشةُ ${label}">${label}</a>`
}

export function pivotPane(d: PivotView): string {
  const t = d.table
  const max = Math.max(0, ...t.cells.flat().map((v) => v ?? 0))
  const twoAxis = d.cols !== null

  /*
   * **والترويسةُ تُقرأ اسما لا مفتاحا** (D-123): `keyLabel` تقلب
   * `published` إلى «نُشرت» — والمفتاحُ يبقى في الحساب كما هو.
   * و`scope="col"` لقارئ الشاشة: يقرأ العمودَ مع كلّ خليّةٍ تحته.
   */
  const head = `<tr><th scope="col">${escapeHtml(DIMENSION_LABEL[d.rows])}</th>${
    t.colKeys.map((c) =>
      `<th scope="col">${c === '' || d.cols === null
        ? escapeHtml(MEASURE_LABEL[d.measure])
        : escapeHtml(keyLabel(d.cols, c))}</th>`).join('')
  }${twoAxis ? '<th scope="col" class="pv-t">الكلّ</th>' : ''}</tr>`

  const body = t.rowKeys.map((r, i) => {
    const cells = t.cells[i] ?? []
    return `<tr><th scope="row">${rowHead(d.rows, r)}</th>${
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
  const empty = emptyState({
    title: 'لا منشورَ في هذا المدى',
    html: `المدى الحاليُّ ${escapeHtml(counted(d.sinceDays, NOUNS.day))}.
      وسّعه، أو اعتمد مسوّدةً من «المنشورات» فتدخل الجدولَ يومَ موعدها.`,
  })

  return `<section data-pane="pivot" hidden>
  ${pageHead('القياس', sectionLabel('pivot'), 'تختار الصفوفَ والأعمدةَ والقياس، فيُعاد بناءُ الجدول. <b>والعنوانُ يحمل عرضَك</b> — انسخه تعُد إليه كما تركته.')}

  <div class="card">
    <form class="row pv-form" method="GET" action="/panel">
      ${picker('pv-r', 'rows', 'الصفوف', d.rows, dims)}
      ${picker('pv-c', 'cols', 'الأعمدة', d.cols ?? 'none',
        [{ v: 'none', t: 'بلا أعمدة' }, ...dims])}
      ${picker('pv-m', 'm', 'القياس', d.measure,
        MEASURES.map((m) => ({ v: m, t: MEASURE_LABEL[m] })))}
      ${picker('pv-d', 'days', 'المدى', String(d.sinceDays),
        SPANS.map((s) => ({ v: String(s.days), t: s.label })))}
      <button class="btn btn-primary" type="submit">اعرض</button>
    </form>
  </div>

  <div class="card mt-3">
    <div class="split">
      <h2>${escapeHtml(MEASURE_LABEL[d.measure])} — ${
        escapeHtml(DIMENSION_LABEL[d.rows])}${
        d.cols === null ? '' : ` × ${escapeHtml(DIMENSION_LABEL[d.cols])}`}</h2>
      <div class="row acts"><span class="note">${escapeHtml(String(t.facts))} منشورا${
        d.capped ? ` · بلغ السقفَ (${escapeHtml(String(d.cap))}) فطُوي ما قبله` : ''}</span>
      ${t.rowKeys.length === 0 ? '' : `<a class="btn btn-secondary btn-sm" href="${
        escapeHtml(csvHref(d))}" download>نزّل الجدولَ CSV</a>`}</div>
    </div>
    ${t.rowKeys.length === 0 ? '' : `<p class="hint">ملفُّ CSV يحمل ما تراه هنا حرفًا — بالأسماء لا بالمفاتيح، ويفتح في Excel بالعربيّة.</p>`}
    ${t.rowKeys.length === 0
      ? empty
      : `<div class="pv-wrap"><table class="pv">
          <thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>`}
    ${t.rowKeys.length === 0 ? '' : `<p class="hint">خليّةٌ فارغةٌ تعني
      <b>لا منشورَ في تقاطعها</b> — لا صفرا. وصفرٌ يُكتب صفرا.</p>`}
  </div>
</section>`
}
