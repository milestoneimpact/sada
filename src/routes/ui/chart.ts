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
import { escapeHtml } from './shell'
import { money } from '../../lib/format'

export function areaChart(series: { day: string; total: number }[]): string {
  if (series.length < 2) return '<div class="empty"><b>لا بيانات كافية بعد</b></div>'

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

  // ثلاثةُ خطوطٍ أفقيّة بأرقامها — وبدونها الرسمُ شكلٌ لا مقدار
  const ticks = [0, 0.5, 1].map((t) => {
    const value = max * t
    const yy = y(value).toFixed(1)
    return `<line class="grid-l" x1="${padStart}" y1="${yy}" x2="${w - 8}" y2="${yy}"/>
      <text class="axis" x="${padStart - 8}" y="${(Number(yy) + 3.5).toFixed(1)}"
        text-anchor="end">${value.toFixed(1)}</text>`
  }).join('')

  const peakIndex = series.reduce((best, d, i) => (d.total > series[best]!.total ? i : best), 0)
  const peak = series[peakIndex]!
  const last = series[series.length - 1]!
  const first = series[0]!

  // اليومان الطرفان وحدهما: محورٌ بأربعةَ عشرَ تاريخا يزدحم فلا يُقرأ
  const label = (d: { day: string }): string => d.day.slice(5)
  const dates = `<text class="axis" x="${x(0)}" y="${h - 8}" text-anchor="start">${label(first)}</text>
    <text class="axis" x="${x(series.length - 1)}" y="${h - 8}" text-anchor="end">${label(last)}</text>`

  const total = series.reduce((sum, d) => sum + d.total, 0)
  const average = total / series.length

  return `<div class="chart">
    <svg viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="none"
      aria-label="إنفاق ${series.length} يوما، مجموعه ${money(total)}، وأعلاه ${money(peak.total)} في ${peak.day}">
      <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity=".22"/>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
      </linearGradient></defs>
      ${ticks}
      <path d="${area}" fill="url(#sg)"/>
      <path d="${line}" fill="none" stroke="var(--brand)" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${x(peakIndex).toFixed(1)}" cy="${y(peak.total).toFixed(1)}" r="3.5"
        fill="var(--surface)" stroke="var(--brand)" stroke-width="2"/>
      <line class="base" x1="${padStart}" y1="${padTop + plotH}" x2="${w - 8}" y2="${padTop + plotH}"/>
      ${dates}
    </svg>
    <div class="legend">
      <span>المجموع <b>${money(total)}</b></span>
      <span>المتوسّط اليوميّ <b>${money(average)}</b></span>
      <span>الذروة <b>${money(peak.total)}</b> · ${escapeHtml(peak.day.slice(5))}</span>
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
    return '<div class="empty"><b>لا إنفاق بعد</b><p>لم يُنادَ مزوّدٌ مدفوعٌ في هذه المدّة.</p></div>'
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
    aria-label="${escapeHtml(`${live.length} مزوّدا، مجموعُ إنفاقها ${show(total)}، وأعلاها ${live[0]!.label} بـ${show(live[0]!.value)}`)}">
    ${bars}
  </div>`
}
