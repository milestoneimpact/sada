/**
 * خطُّ الصدى — **النقشُ مشتقٌّ من العلامة لا مرسومٌ بجوارها**.
 *
 * ## الفكرة
 *
 * «صدى» صوتٌ يعود متأخّرًا وأخفت. فالنقشُ **شريطُ العلامة نفسُه** — طرفٌ عالٍ، ثمّ
 * وادٍ، ثمّ صعودٌ طويلٌ بزاوية العلامة إلى قمّة — مكبَّرًا ومقصوصًا كما تُبنى الرسومُ
 * الكبرى من العلامة (supergraphic)، ثمّ **يتردّد موازيًا لنفسه**: كلُّ صدًى أبعدُ من
 * سابقه بفسحةٍ أوسع، وأخفتُ منه، وأرقُّ خطًّا، **وأقلُّ سعةً** — الموجةُ تتسطّح كما
 * يتسطّح الصوتُ العائد، ويتأخّر قليلًا كما يتأخّر. وخيطٌ ذهبيٌّ واحدٌ يحدّ الشريطَ
 * كما تحدّ خيوطُ الذهب أشرطةَ الحرير في لوحة الهويّة.
 *
 * ## لماذا هكذا
 *
 * - **حريرٌ بدرجاتٍ لا بتدرّج** (D-196): الشريطُ المصمتُ الواحد قُرئ مساحةً مملوءةً أو
 *   رسمًا بيانيًّا، وحريرُ اللوحة يُعرَف بلمعته. فالشريطُ ثلاثُ طبقاتٍ من تدرّج الشعار
 *   المقيس — جسمٌ تركوازيّ، ووجهٌ مضاءٌ يتّسع عند القمّة ويذوب عند الطرفين، وخيطُ لمعةٍ
 *   «نعناعيٌّ فاتح» على الحافّة. درجاتٌ مصمتةٌ لا `linearGradient`: التدرّجُ يطلب معرّفًا،
 *   والمعرّفُ يتصادم حين يُضمَّن النقشُ مرّتين. ولا توهّجَ ولا ظلّ (خطّة التصميم 3.1).
 * - **الإزاحةُ على العموديّ على المنحنى لا على المحور**: الإزاحةُ الرأسيّة تُرقّ الشريطَ
 *   حيث يصعد وتُغلظه حيث يستوي، فيُقرأ رسمًا بيانيًّا لا حريرًا.
 * - **حتميٌّ بلا بذرة**: المُدخَلُ نفسُه يُخرج البايتاتِ نفسَها في كلّ تشغيل.
 * - **لا يطلب شيئًا ولا ينفّذ شيئًا**: سماتُ عرضٍ (`fill` و`stroke` و`opacity`) لا
 *   `style=""` ولا `<style>` ولا `href` ولا `id` — فيمرّ تحت السياسة كما هي، ويُضمَّن
 *   مرّتين في صفحةٍ بلا تصادم معرّفات.
 * - **لا يحمل معنًى**: `aria-hidden` دائمًا. **ويحمل علامتَه** `data-echo` على الـ`svg` نفسِه
 *   (مراجعة D-196): `audit_design` يردّ النقشَ في سطح عمل، وكان يسأل عن غلافٍ `.echo` وحده،
 *   فـ`echo()` مكشوفًا في خليّة جدولٍ مرّ.
 *
 * ## النغمتان
 *
 *   deep   أرضٌ خضراءُ عميقة، وشريطٌ حريريّ، والأصداءُ نعناعٌ بشفافيّةٍ تتناقص — أربعةٌ
 *          افتراضًا وستّةٌ على الأكثر (في غلاف اللوحة خطّان أو ثلاثة) — والخيطُ ذهبُ الليل.
 *          **والنعناعُ هنا ضوءٌ على عمق** — لا تعبئةٌ ولا نصٌّ على أبيض.
 *   light  بلا أرض: الخطوطُ `currentColor` يلوّنها من يضعها ويتبع الثيم، وصدَيان افتراضًا.
 *          **والحالةُ الفارغةُ تمرّر `density: 1`**: شريطٌ وصدَيان ثلاثةُ خطوطٍ متوازية في بطاقةٍ
 *          صغيرة تُقرأ رسمًا بيانيًّا. وبلا خيطٍ ذهبيّ افتراضًا: الذهبُ على الفاتح يختفي (‏2.24:1)،
 *          وخيطُها ذهبُ النهار.
 */

import { MOMENT } from './tokens'

export type EchoTone = 'deep' | 'light'

export interface EchoOptions {
  readonly width: number
  readonly height: number
  readonly tone: EchoTone
  /** عددُ الأصداء — يُقصَر على ‏0 إلى ‏6. الافتراضيّ ‏4 في «deep» و‏2 في «light». */
  readonly density?: number
  /** موضعُ قمّة الشريط من العرض (‏0 يسار، ‏1 يمين). الافتراضيّ ‏0.7. */
  readonly crest?: number
  /** موضعُ القمّة من الارتفاع (‏0 أعلى، ‏1 أسفل). الافتراضيّ ‏0.45. */
  readonly level?: number
  /** عرضُ العلامة المكبَّرة نسبةً إلى عرض الإطار — يحفظ زاويةَ الصعود. الافتراضيّ ‏1.1. */
  readonly scale?: number
  /** الخيطُ الذهبيّ. الافتراضيّ: في «deep» وحدها. */
  readonly hairline?: boolean
  /** الشريطُ المصمت. الافتراضيّ: في «deep» وحدها. */
  readonly ribbon?: boolean
  /** الأرضُ مستطيلًا. الافتراضيّ: في «deep» وحدها. */
  readonly ground?: boolean
  /**
   * أيُّ ركنٍ يثبت حين يُقَصّ الرسمُ إلى إطارٍ بنسبةٍ أخرى (`preserveAspectRatio … slice`).
   * الافتراضيّ الوسط؛ وشريطُ الجوّال يثبّت الأسفلَ الأيسر كي لا تزحف القمّةُ تحت النصّ في ‏320.
   */
  readonly align?: `x${'Min' | 'Mid' | 'Max'}Y${'Min' | 'Mid' | 'Max'}`
}

/** ألوانُ النغمة العميقة من مصدرها الواحد — ثابتةٌ في الثيمين («MOMENT» في «tokens.ts»). */
const ECHO_DEEP = MOMENT

/**
 * عمودُ العلامة الفقريّ — **أربعةُ مقاطعَ بيزييه مكعّبة بوحدة عرض العلامة**، والقمّةُ عند ‏(0, 0).
 *
 * قيس على «الشعار الأساسيّ» في اللوحة (صندوقُه ‏212×150، النسبة ‏1.41): الوادي عند ‏0.36
 * من العرض و‏0.86 من الارتفاع، والقمّةُ عند ‏0.76 و‏0.14 — فالصعودُ ‏0.40 عرضًا و‏0.51 ارتفاعًا
 * (بوحدة العرض)، **وهو توقيعُ العلامة**: صعودٌ طويلٌ مائلٌ بين وادٍ مستديرٍ وقمّةٍ مستديرة.
 * **والطيّةُ اليمنى لا تُنسَخ**: الشريطُ المطويُّ لا يُوازى، فيُمَدّ بعد القمّة نزولًا
 * هادئًا. والطرفان ممدودان خارج العلامة كي يعبر الخطُّ الإطارَ كلَّه أينما وقعت القمّة.
 * **والمماسُّ متّصلٌ عند كلّ وصل** (أفقيٌّ في الوادي والقمّة) فلا انكسارَ يُرى في خطٍّ رفيع.
 */
type Pt = readonly [number, number]

const SPINE: ReadonlyArray<readonly [Pt, Pt, Pt, Pt]> = [
  [[-1.9, -0.04], [-1.25, -0.04], [-0.78, 0.5], [-0.4, 0.5]],
  [[-0.4, 0.5], [-0.28, 0.5], [-0.2, 0], [0, 0]],
  [[0, 0], [0.24, 0], [0.46, 0.36], [0.92, 0.38]],
  [[0.92, 0.38], [1.4, 0.4], [1.8, 0.32], [2.4, 0.3]],
]

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** العمودُ عيّناتٍ كثيفة — بيزييه يُحسَب نقطةً نقطة، ثمّ يُنقَل إلى الإطار بالدالّة `to`. */
function dense(to: (p: Pt) => Pt, per = 32): Pt[] {
  const out: Pt[] = []
  SPINE.forEach(([a, b, c, d], s) => {
    for (let i = s === 0 ? 0 : 1; i <= per; i++) {
      const t = i / per, u = 1 - t
      const k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t
      out.push(to([k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1]]))
    }
  })
  return out
}

/** إزاحةٌ على العموديّ — ثابتةٌ، أو تتبدّل على طول الخطّ (الوجهُ المضاء يتّسع عند القمّة). */
function offset(p: readonly Pt[], d: number | ((q: Pt) => number)): Pt[] {
  return p.map((q, i) => {
    const a = p[Math.max(0, i - 1)] as Pt, b = p[Math.min(p.length - 1, i + 1)] as Pt
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1
    const k = typeof d === 'number' ? d : d(q)
    // ‏العموديُّ إلى أسفل الشاشة على يمين اتّجاه السير
    return [q[0] - (ty / l) * k, q[1] + (tx / l) * k] as Pt
  })
}

/**
 * أصغرُ نصف قطرٍ حيث ينحني الخطُّ قمّةً (التفافٌ مع عقارب الساعة على الشاشة) — **وهناك وحدَه
 * تتّجه الإزاحةُ إلى الداخل**. من ثلاث عيّناتٍ متباعدةٍ بثلاث: R = abc ÷ (4 × المساحة).
 */
function crestRadius(p: readonly Pt[]): number {
  let min = Infinity
  for (let i = 3; i < p.length - 3; i++) {
    const a = p[i - 3] as Pt, b = p[i] as Pt, c = p[i + 3] as Pt
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (cross <= 0) continue
    const ab = Math.hypot(...sub(b, a)), bc = Math.hypot(...sub(c, b)), ca = Math.hypot(...sub(a, c))
    const r = (ab * bc * ca) / (2 * cross)
    if (r < min) min = r
  }
  return min
}

/** النقاطُ الظاهرة وحدها، ونقطةٌ واحدةٌ بعد كلّ حافّة — العمودُ ممدودٌ أبعدَ من الإطار بكثير. */
function visible(all: readonly Pt[], w: number): Pt[] {
  const lo = all.findIndex((q) => q[0] >= -0.04 * w)
  const hi = all.findIndex((q) => q[0] > 1.04 * w)
  return all.slice(Math.max(0, lo - 1), hi < 0 ? all.length : hi + 1)
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1]
const unit = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l] }

/**
 * المنحنى الكثيف مقاطعَ بيزييه قليلة — **ملاءمةُ Schneider** (Graphics Gems، ‏1990).
 *
 * يُقسَم الظاهرُ على طوله `pieces` قطعة، ولكلّ حدٍّ مماسُّه من العيّنات نفسِها، فالقطعتان
 * المتجاورتان تتشاركان الاتّجاهَ **ولا انكسارَ عند الوصل**. ثمّ يُحَلّ طولا المقبضين بأصغر
 * المربّعات على عيّنات القطعة. وأُغني بهذا عن Catmull-Rom على نقاطٍ متساوية: ذاك كان يُري
 * زوايا خفيفةً في الخطّ الرفيع عند القمّة، لأنّ انحناءه يقفز عند كلّ نقطة.
 *
 * والإحداثيّاتُ نسبيّةٌ («c»)، **محسوبةً من النقطة السابقة بعد تقريبها** — فلا يتراكم
 * خطأُ التقريب على طول الخطّ.
 *
 * **والمماسُّ عند الوصل واحدٌ بعد التقريب لا قبله** (مراجعة D-196): كان المقبضان يُحسَبان من طرفَي
 * القطعة قبل تقريبهما ويُكتبان نسبةً إليهما بعده، والمقبضُ الصادرُ يُقرَّب وحدَه — فانكسر المماسُّ عند
 * الوصل ‏4.5° في الخيط الذهبيّ، ويكبّره `slice` في شريط الجوّال حتّى ‏2.3 مرّة. فالمقبضان من الطرفين
 * المقرَّبين، **والمقبضُ الصادرُ على امتداد الوارد كما كُتب** (من مقبضه المقرَّب إلى الوصل)، ويُكتب بمنزلةٍ
 * عشريّة — فلا يبقى إلّا خطأُ تلك المنزلة (دون ‏0.5°) بزيادة أربعة محارف للقطعة لا اثني عشر.
 * ويقيس `echo.test` أكبرَ انكسارٍ في رسمَي اللحظة.
 */
function fit(all: readonly Pt[], pieces: number, w: number, fine: boolean, back = false): string {
  const p = back ? visible(all, w).reverse() : visible(all, w)
  const acc = [0]
  for (let i = 1; i < p.length; i++) acc.push((acc[i - 1] as number) + Math.hypot(...sub(p[i] as Pt, p[i - 1] as Pt)))
  const total = acc[acc.length - 1] as number
  const cut: number[] = [0]
  for (let k = 1; k < pieces; k++) cut.push(acc.findIndex((s) => s >= (total * k) / pieces))
  cut.push(p.length - 1)
  const tangent = (i: number): Pt => unit(sub(p[Math.min(p.length - 1, i + 1)] as Pt, p[Math.max(0, i - 1)] as Pt))
  const r = (v: number): number => (fine ? Math.round(v * 10) / 10 : Math.round(v))
  const n = (v: number): string => { const x = fine ? Math.round(v * 10) / 10 : Math.round(v); return Object.is(x, -0) ? '0' : String(x) }
  const n1 = (v: number): string => { const x = Math.round(v * 10) / 10; return Object.is(x, -0) ? '0' : String(x) }
  const r1 = (v: number): number => Math.round(v * 10) / 10
  let at: Pt = [r((p[0] as Pt)[0]), r((p[0] as Pt)[1])]
  // ‏اتّجاهُ المماسّ الوارد إلى «at» كما كُتب — من المقبض المقرَّب إلى الوصل المقرَّب
  let incoming: Pt | null = null
  const out: string[] = []
  for (let k = 0; k < pieces; k++) {
    const ia = cut[k] as number, ib = cut[k + 1] as number
    if (ib <= ia) continue
    const A = p[ia] as Pt, B = p[ib] as Pt
    const ta = tangent(ia), tb = tangent(ib)
    const t2: Pt = [-tb[0], -tb[1]]
    let c11 = 0, c12 = 0, c22 = 0, x1 = 0, x2 = 0
    const span = (acc[ib] as number) - (acc[ia] as number)
    for (let i = ia; i <= ib; i++) {
      const t = ((acc[i] as number) - (acc[ia] as number)) / span, u = 1 - t
      const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t
      const a1: Pt = [ta[0] * b1, ta[1] * b1], a2: Pt = [t2[0] * b2, t2[1] * b2]
      const q = p[i] as Pt
      const tmp = sub(q, [A[0] * (b0 + b1) + B[0] * (b2 + b3), A[1] * (b0 + b1) + B[1] * (b2 + b3)])
      c11 += dot(a1, a1); c12 += dot(a1, a2); c22 += dot(a2, a2); x1 += dot(tmp, a1); x2 += dot(tmp, a2)
    }
    const det = c11 * c22 - c12 * c12
    const chord = Math.hypot(...sub(B, A))
    let al = det === 0 ? 0 : (x1 * c22 - x2 * c12) / det
    let be = det === 0 ? 0 : (c11 * x2 - c12 * x1) / det
    if (!(al > chord * 1e-3) || !(be > chord * 1e-3)) { al = chord / 3; be = chord / 3 }
    const end: Pt = [r(B[0]), r(B[1])]
    const dir = incoming ?? ta
    const c1: Pt = [r1(at[0] + dir[0] * al), r1(at[1] + dir[1] * al)]
    const c2: Pt = [r(end[0] + t2[0] * be), r(end[1] + t2[1] * be)]
    out.push([n1(c1[0] - at[0]), n1(c1[1] - at[1]), ...[c2[0] - at[0], c2[1] - at[1], end[0] - at[0], end[1] - at[1]].map(n)].join(' '))
    // ‏ومقبضٌ وقع على وصله بالتقريب لا اتّجاهَ له: يعود الصادرُ إلى مماسّ العيّنات
    const arm = sub(end, c2)
    incoming = Math.hypot(arm[0], arm[1]) > 0.5 ? unit(arm) : null
    at = end
  }
  const first = p[0] as Pt
  return `${back ? 'L' : 'M'}${n(first[0])} ${n(first[1])}c${out.join(' ')}`.replace(/ -/g, '-')
}

const op = (v: number): string => String(Math.round(v * 100) / 100).replace(/^0\./, '.')

/** نقشُ الصدى نصَّ SVG واحدًا — يُضمَّن في الصفحة كما هو. */
export function echo(opts: EchoOptions): string {
  const deep = opts.tone === 'deep'
  const W = Math.max(1, Math.round(opts.width))
  const H = Math.max(1, Math.round(opts.height))
  const M = (opts.scale ?? 1.1) * W
  const cx = (opts.crest ?? 0.7) * W
  const cy = (opts.level ?? 0.45) * H
  const count = clamp(Math.round(opts.density ?? (deep ? 4 : 2)), 0, 6)
  const fine = Math.min(W, H) < 160
  // ‏شريطُ العلامة ‏0.25 إلى ‏0.34 من عرضها (قيس: الطرفُ ‏53 والصاعدُ ‏66 والطيّةُ ‏72 من ‏212)؛
  // ‏وهنا سُدسُه تقريبًا: حريرٌ لا كتلة، فلا يُنازع العلامةَ نفسَها
  const band = 0.05 * M
  // ‏الخطُّ في الإطار: السعةُ تُخفَّض نحو خطّ القمّة والوادي الأوسط، والتأخّرُ إزاحةٌ أفقيّة
  const base = (damp: number, delay: number): Pt[] =>
    dense(([u, v]) => [cx + (u + delay) * M, cy + (0.25 + (v - 0.25) * damp) * M])
  const ink = deep ? ECHO_DEEP.echo : 'currentColor'
  const parts: string[] = []

  if (opts.ground ?? deep) parts.push(`<rect width="${W}" height="${H}" fill="${ECHO_DEEP.ground}"/>`)

  const voice = base(1, 0)
  if (opts.ribbon ?? deep) {
    const top = fit(offset(voice, -band / 2), 8, W, fine)
    const bottom = fit(offset(voice, band / 2), 8, W, fine, true)
    parts.push(`<path d="${top}${bottom}Z" fill="${deep ? ECHO_DEEP.ribbon : 'currentColor'}"` +
      `${deep ? '' : ' opacity=".07"'}/>`)
    if (deep) {
      // ‏الوجهُ المضاء: نصفُ الشريط عند القمّة، ويذوب جرسيًّا إلى لا شيء على بُعد ‏0.26 من العلامة
      // ‏— الضوءُ يقع على الحرير حيث ينعطف، كما في غلاف اللوحة. ثمّ خيطُ لمعةٍ على الحافّة
      const lit = (q: Pt): number => -band / 2 + 0.55 * band * Math.exp(-(((q[0] - cx) / (0.26 * M)) ** 2))
      const litEdge = fit(offset(voice, lit), 8, W, fine, true)
      parts.push(`<path d="${top}${litEdge}Z" fill="${ECHO_DEEP.lit}"/>`)
      parts.push(`<path d="${top}" stroke="${ECHO_DEEP.sheen}" stroke-width="1" opacity=".45"/>`)
    }
  }
  if (opts.hairline ?? deep) {
    const hair = fit(offset(voice, -band / 2 - 0.012 * M), 8, W, fine)
    parts.push(`<path d="${hair}" stroke="${deep ? ECHO_DEEP.gold : ECHO_DEEP.goldLight}" stroke-width="1"/>`)
  }
  // ‏الفسحةُ الأولى ‏2.2٪ من العلامة ثمّ تتّسع ‏1.22 مرّةً؛ والسعةُ ‏0.8 من سابقتها — **وهو ما يمنع
  // ‏الصدى البعيدَ أن ينعقد عند القمّة**: إزاحةٌ أكبرُ من نصف قطر الانحناء تعقد المنحنى؛ والتأخّرُ ‏0.02
  let d = band / 2, gap = 0.022 * M
  // ‏نصفُ قطر القمّة في الشريط نفسِه: إزاحةٌ إلى الداخل تبلغه **تعقد المنحنى عقدةً حادّة**.
  // ‏والتسطيحُ يُكبّره بنسبته (نصفُ القطر عند القمّة ∝ ‏1 ÷ السعة)، فيُسطَّح الصدى حتّى يبقى
  // ‏نصفُ قطره ضعفَ إزاحته — لا أقلّ — مهما طال الإطار
  const rCrest = crestRadius(voice)
  const lines: string[] = []
  for (let k = 1; k <= count; k++) {
    d += gap
    gap *= 1.22
    const damp = Math.min(0.8 ** k, rCrest / (2 * d))
    const p = fit(offset(base(damp, 0.02 * k), d), 6, W, fine)
    const w = Math.max(0.75, 1.5 - 0.125 * (k - 1))
    lines.push(`<path d="${p}" stroke-width="${op(w)}" opacity="${op((deep ? 0.7 : 0.55) * 0.76 ** (k - 1))}"/>`)
  }
  if (lines.length > 0) parts.push(`<g stroke="${ink}">${lines.join('')}</g>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="${opts.align ?? 'xMidYMid'} slice" ` +
    `fill="none" aria-hidden="true" focusable="false" data-echo="${opts.tone}">${parts.join('')}</svg>`
}
