/**
 * طبقةُ الرسم — **شكلان لسؤالين، لا شكلٌ واحدٌ لكلّ شيء** (D-103).
 *
 * ## ما وُجد عند القياس
 *
 * قالت الخطّةُ إنّ في اللوحة «`sparkline` وحيدٌ بلا محاور ولا مفاتيح»،
 * **فقِيس فوُجد أغنى ممّا قيل**: فيه محاورُ وشبكةٌ وسقفٌ مستديرٌ وذروةٌ
 * مُعلَّمةٌ ووصفٌ لقارئ الشاشة.
 *
 * **فالناقصُ لم يكن جودةَ الرسم — كان أمرين**: أنّه محبوسٌ دالّةً خاصّةً
 * في `panelView.ts` لا يُعاد استعمالُه، **وأنّه شكلٌ واحدٌ يُسأل به
 * سؤالان مختلفان**.
 *
 * ## والشكلُ يتبع السؤال
 *
 * | السؤال | الشكل | لماذا |
 * |---|---|---|
 * | كيف تغيّر هذا **عبر الزمن**؟ | مساحةٌ وخطّ | المحورُ متّصلٌ، والمساحةُ تقول «تراكم» |
 * | **أيُّها** أكبر؟ | أعمدة | المقارنةُ بين أسماءٍ لا بين أوقات |
 *
 * **وخطٌّ يصل بين مزوّدين يَعِد بتتابعٍ لا وجودَ له**: ليس بين «أنثروبيك»
 * و«جيميناي» زمنٌ يمرّ. فالأعمدةُ ليست ذوقا — هي الشكلُ الصادق.
 *
 * ## وألوانُ الحالة محجوزة (D-043)
 *
 * لا يُلوَّن عمودٌ بالأحمر لأنّه الأكبر: **الأحمرُ حالةٌ لا مقدار**.
 * والمقدارُ تدرّجُ هيئةٍ واحدة، والأكبرُ يُعلَّم بالذهب — ندرةً لا زينة.
 */
import { escapeHtml } from './escape'
import { money } from '../../lib/format'
import { dayKeyLabel } from '../../lib/time/zone'
import { counted, NOUNS } from '../../lib/format'
import { emptyState } from './components/empty'

export function areaChart(series: { day: string; total: number }[]): string {
  if (series.length < 2) return emptyState({ title: 'لا بيانات كافية بعد' })

  // مساحةٌ للمحور وأرقامه، لا رسمٌ مقصوصٌ إلى حافّة البطاقة
  const w = 640
  const h = 168
  const padTop = 14
  const padBottom = 26
  const padStart = 46
  const plotH = h - padTop - padBottom
  const plotW = w - padStart - 8

  const raw = Math.max(...series.map((d) => d.total))
  // سقفٌ مستدير: محورٌ ينتهي عند ٣٫٤٧ يُقرأ رقما عشوائيّا لا حدّا
  const max = raw <= 0 ? 1 : Math.ceil(raw * 1.15 * 2) / 2
  const step = plotW / (series.length - 1)
  const x = (i: number): number => padStart + i * step
  const y = (v: number): number => padTop + plotH - (v / max) * plotH

  const pts = series.map((d, i) => `${x(i).toFixed(1)},${y(d.total).toFixed(1)}`)
  const line = `M ${pts.join(' L ')}`
  const area = `${line} L ${x(series.length - 1).toFixed(1)},${padTop + plotH} L ${padStart},${padTop + plotH} Z`

  /*
   * **الرسمُ يتمدّد والحرفُ لا** (D-153). كان الـSVG كلُّه بنسبة viewBox
   * (`preserveAspectRatio="none"`) فتُقلَّص محاورُه إلى ‏٥px عند ‏٣٢٠ والخطُّ
   * دون بكسل. فالمسارُ وحدَه يبقى في SVG بحدٍّ لا يتمدّد
   * (`vector-effect:non-scaling-stroke`)، والأرقامُ والتواريخُ ونقطةُ الذروة
   * HTML فوقه بمواضعَ مئويّة من إحداثيّات الرسم نفسِها.
   */
  const px = (v: number): string => `${((v / w) * 100).toFixed(2)}%`
  const py = (v: number): string => `${((v / h) * 100).toFixed(2)}%`
  const ticks = [0, 0.5, 1].map((t) => {
    const value = max * t
    const yy = y(value)
    return `<line class="grid-l" x1="${padStart}" y1="${yy.toFixed(1)}" x2="${w - 8}" y2="${yy.toFixed(1)}"/>`
  }).join('')
  const tickLabels = [0, 0.5, 1].map((t) => {
    const value = max * t
    return `<span class="axis axis-y" style="top:${py(y(value))};right:${px(w - padStart + 8)}">${value.toFixed(1)}</span>`
  }).join('')

  const peakIndex = series.reduce((best, d, i) => (d.total > series[best]!.total ? i : best), 0)
  const peak = series[peakIndex]!
  const last = series[series.length - 1]!
  const first = series[0]!

  // اليومان الطرفان وحدهما: محورٌ بأربعةَ عشرَ تاريخا يزدحم فلا يُقرأ
  const label = (d: { day: string }): string => dayKeyLabel(d.day)
  const dates = `<span class="axis axis-x" style="left:${px(x(0))};top:${py(h - 8)}">${label(first)}</span>
    <span class="axis axis-x end" style="right:${px(w - x(series.length - 1))};top:${py(h - 8)}">${label(last)}</span>`
  const peakDot = `<i class="peak" style="left:${px(x(peakIndex))};top:${py(y(peak.total))}" aria-hidden="true"></i>`

  const total = series.reduce((sum, d) => sum + d.total, 0)
  const average = total / series.length

  return `<div class="chart">
    <div class="plot">
    <svg viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="none"
      aria-label="إنفاق ${counted(series.length, NOUNS.day, 'gen')}، مجموعه ${money(total)}، وأعلاه ${money(peak.total)} في ${peak.day}">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity=".22"/>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
      </linearGradient></defs>
      ${ticks}
      <path d="${area}" fill="url(#sg)"/>
      <path d="${line}" fill="none" stroke="var(--brand)" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      <line class="base" x1="${padStart}" y1="${padTop + plotH}" x2="${w - 8}" y2="${padTop + plotH}"/>
    </svg>
    ${tickLabels}${dates}${peakDot}
    </div>
    <div class="legend">
      <span>المجموع <b>${money(total)}</b></span>
      <span>المتوسّط اليوميّ <b>${money(average)}</b></span>
      <span>الذروة <b>${money(peak.total)}</b> · ${escapeHtml(dayKeyLabel(peak.day))}</span>
    </div>
  </div>`
}


/**
 * أعمدةٌ أفقيّة — **والأفقيّةُ لأنّ الأسماءَ عربيّة**.
 *
 * عمودٌ رأسيٌّ يضع اسمَه تحته مائلا أو مقصوصا، **واسمٌ عربيٌّ مائلٌ لا
 * يُقرأ**. والأفقيُّ يعطي السطرَ كلَّه للاسم، ويقرأه من يقرأ من اليمين
 * بلا التواء.
 *
 * **ويُرتَّب نازلا**: السؤالُ «أيُّها أكبر»، وجوابُه يجب أن يكون أوّلَ
 * سطر.
 */
export function barChart(
  rows: readonly { readonly label: string; readonly value: number }[],
  options: { readonly unit?: 'money' | 'count' } = {},
): string {
  const live = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
  if (live.length === 0) {
    return emptyState({ title: 'لا إنفاق بعد', html: 'لم يُناد مزوّد مدفوع في هذه المدّة.' })
  }

  const max = Math.max(...live.map((r) => r.value))
  const total = live.reduce((sum, r) => sum + r.value, 0)
  const show = (v: number): string =>
    options.unit === 'money' ? money(v) : String(v)

  /*
   * **والعرضُ نسبةٌ من الأكبر لا من المجموع.**
   *
   * نسبةُ المجموع تجعل أطولَ عمودٍ قصيرا حين تكثر الصفوف — فيُقرأ الرسمُ
   * فارغا وهو ممتلئ. والسؤالُ مقارنةٌ بين الصفوف، والأكبرُ مرجعُها.
   */
  const bars = live
    .map((r, i) => {
      const pct = (r.value / max) * 100
      return `<div class="bar-row">
        <span class="bar-name">${escapeHtml(r.label)}</span>
        <span class="bar-track"><i class="bar-fill${i === 0 ? ' top' : ''}"
          style="width:${pct.toFixed(1)}%"></i></span>
        <span class="bar-val money">${escapeHtml(show(r.value))}</span>
      </div>`
    })
    .join('')

  return `<div class="chart bars" role="img"
    aria-label="${escapeHtml(`${counted(live.length, NOUNS.service)}، والمجموع ${show(total)}، والأعلى ${live[0]!.label} بـ${show(live[0]!.value)}`)}">
    ${bars}
  </div>`
}

/**
 * «ما مضى» رسمًا — **أسابيعُ بترتيبها لا بحجمها** (D-127).
 *
 * `barChart` يرتّب نازلًا لأنّ سؤالَه «أيُّها أكبر». وسؤالُ الأسابيع «كيف
 * تغيّر»، **والزمنُ لا يُرتَّب بالحجم**. فالصفوفُ كما تُعطى، الأحدثُ أوّلًا
 * كجدولها. **ومع كلّ عمودٍ عددُ المقيس**: أسبوعٌ خرج فيه خمسةٌ وقِيس واحدٌ
 * لا يُقارَن بأسبوعٍ قِيس كلُّه — فلا نسبةَ نموٍّ تُكتب بين قياسٍ ونصفِ قياس
 * (سنّةُ D-058).
 */
export function historyBars(
  rows: readonly { readonly label: string; readonly value: number; readonly measured: number; readonly href: string }[],
): string {
  if (rows.length === 0) return ''
  const max = Math.max(1, ...rows.map((r) => r.value))
  const bars = rows
    .map((r) => {
      const pct = (r.value / max) * 100
      const partial = r.measured < r.value
      return `<div class="bar-row">
        <a class="bar-name" href="${escapeHtml(r.href)}">${escapeHtml(r.label)}</a>
        <span class="bar-track"><i class="bar-fill${partial ? ' part' : ''}" style="width:${pct.toFixed(1)}%"></i></span>
        <span class="bar-val"><b>${r.value}</b> <span class="sub">قِيس ${r.measured}</span></span>
      </div>`
    })
    .join('')
  return `<div class="chart bars history" role="img"
    aria-label="${escapeHtml(`${rows.length} أسابيع، وآخرُها ${rows[0]!.label}: خرج ${rows[0]!.value} وقِيس ${rows[0]!.measured}`)}">
    ${bars}
  </div>`
}


/**
 * أعمدةُ الأيّام (D-265) — **عددٌ حقيقيٌّ لكلّ يوم، والزمنُ بترتيبه**.
 *
 * رسمٌ من الخادم بـ SVG بلا سكربت: العمودُ ينمو بـ CSS (ويقف مع تقليل الحركة)،
 * وقيمتُه في `<title>` للتمرير، والخلاصةُ سطرٌ مكتوبٌ تحته (فاللمسُ لا يمرّر)، **وجدولٌ مخفيٌّ لقارئ الشاشة**.
 * ومجموعٌ صفرٌ لا يُرسَم أعمدةً مسطّحة: يُقال إنّه لا شيء بعد، برسمٍ صغير.
 */
export function dayBars(
  rows: readonly { readonly label: string; readonly value: number }[],
  empty: { readonly title: string; readonly html: string; readonly action?: string },
): string {
  const total = rows.reduce((n, r) => n + r.value, 0)
  if (total === 0) {
    return emptyState({ title: empty.title, html: empty.html, icon: EMPTY_DRAFTS, ...(empty.action === undefined ? {} : { action: empty.action }) })
  }
  const max = Math.max(...rows.map((r) => r.value))
  const w = 28, gap = 12, top = 22, h = 120
  const width = rows.length * (w + gap) - gap
  const bars = rows.map((r, i) => {
    const bh = r.value === 0 ? 2 : Math.max(6, Math.round((r.value / max) * h))
    const x = width - (i + 1) * (w + gap) + gap // ‏الأقدمُ يمينًا: يُقرأ الزمنُ من اليمين
    const y = top + h - bh
    return `<g class="db-bar${r.value === 0 ? ' zero' : ''}" style="--i:${i}"><title>${escapeHtml(`${r.label}: ${r.value}`)}</title>
      <rect x="${x}" y="${y}" width="${w}" height="${bh}" rx="6"></rect>
</g>`
  }).join('')
  const peak = rows.reduce((a, b) => (b.value > a.value ? b : a))
  const summary = `${rows.length} يومًا، والمجموع ${total}، وأعلاها ${peak.label} بـ${peak.value}`
  return `<figure class="chart daybars">
    <svg class="db-svg" viewBox="0 0 ${width} ${top + h + 2}" role="img" aria-label="${escapeHtml(summary)}" preserveAspectRatio="none">
      <line class="db-base" x1="0" y1="${top + h + 1}" x2="${width}" y2="${top + h + 1}"></line>${bars}</svg>
    <figcaption class="db-axis" aria-hidden="true"><span>${escapeHtml(rows[0]!.label)}</span><span>${escapeHtml(rows[rows.length - 1]!.label)}</span></figcaption>
    <p class="hint">${escapeHtml(summary)}</p>
    <div class="vh"><table><caption>${escapeHtml(summary)}</caption><tbody>${rows.map((r) =>
      `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${r.value}</td></tr>`).join('')}</tbody></table></div>
  </figure>`
}

/** رسمُ «لا شيء بعد» من الطبقة البصريّة (Visuals): ورقةٌ وسطورٌ وزائد. */
const EMPTY_DRAFTS = `<svg width="120" height="88" viewBox="0 0 180 130" aria-hidden="true">
  <rect class="ill-wash" x="30" y="30" width="120" height="84" rx="12"></rect>
  <rect class="ill-line" x="44" y="46" width="70" height="8" rx="4"></rect>
  <rect class="ill-soft" x="44" y="62" width="92" height="8" rx="4"></rect>
  <rect class="ill-soft" x="44" y="78" width="56" height="8" rx="4"></rect>
  <circle class="ill-brand" cx="146" cy="30" r="18"></circle>
  <path class="ill-plus" d="M146 22v16M138 30h16" stroke-width="3" stroke-linecap="round"></path>
  <circle class="ill-dot" cx="22" cy="100" r="6"></circle></svg>`
