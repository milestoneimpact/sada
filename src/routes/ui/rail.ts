/**
 * الرافدةُ وشريطُ الجوّال — **واحدةٌ لكلّ صفحة** (D-178).
 *
 * كانت تُرسَم في اللوحة وحدَها، وصفحاتُ المنصّة والمهامّ والتقرير والرحلة
 * والتوزيع «مستقلّةٌ» بسهم عودةٍ وحدَه: **وفي الجوّال بلا شريطٍ سفليّ أصلًا**،
 * فمن فتح صفحةَ LinkedIn من هاتفه لا يبلغ المنشوراتِ إلّا بالرجوع. وقال المالك:
 * «لا أجد المراحل، ولا أعرف كيف تترابط الصفحات».
 *
 * فالرافدةُ تُبنى هنا من جدول الأقسام (D-105) مرّةً، وتُرسَم في اللوحة بمراسيها
 * (`#posts`) وفي الصفحة المستقلّة بمساراتها (`/panel#posts`) — **والقسمُ الحاليُّ
 * معلَّمٌ في الوسم** فلا ينتظر سكربتًا ليُعرَف.
 */
import { commandMore, SECTIONS } from './command'
import { ICON } from './icons'
import { count } from './components/badge'
import { densitySwitch, escapeHtml, GLYPH_SVG, themeSwitch, wordmark } from './shell'

export interface RailInput {
  /** القسمُ الحاليّ — يُعلَّم `aria-current`. */
  readonly active?: string
  /** في اللوحة: المرساةُ وحدَها. وخارجها: مسارُ اللوحة قبلها. */
  readonly inPanel: boolean
  readonly counts?: Readonly<Record<string, number>>
  readonly env?: 'staging' | 'production'
  /**
   * القسمُ أبٌ لصفحةٍ معلَّمةٍ تحته (منصّةٌ في «القنوات»): يُعلَّم `aria-current="true"`
   * لا `"page"` — فلا تُعلَن صفحتان حاليّتان، ويُلوَّن في شريط الجوّال وحدَه حيث لا تحته.
   */
  readonly parent?: boolean
}

export function railHtml(input: RailInput): string {
  const counts = input.counts ?? {}
  let lastGroup = ''
  const tabs = SECTIONS.map((s) => {
    const head = s.group === lastGroup ? '' : `<span class="lbl">${s.group}</span>`
    lastGroup = s.group
    const href = s.page ?? (input.inPanel ? `#${s.id}` : `/panel#${s.id}`)
    // ‏والعددُ مكوّنُه (D-189)، ويعني «ينتظرك» وحدَها (خطّة التصميم 5.1)
    const n = counts[s.id] ?? 0
    /*
     * **وسمةُ الشريط تُقرأ من الجدول** (D-107): الرافدةُ نفسُها تصير
     * شريطا سفليّا في الجوّال، **ولا وسمَ ثانٍ يُبنى**.
     */
    const attrs = `${s.bar === true ? ' data-bar' : ''}${input.active === s.id ? ` aria-current="${input.parent === true ? 'true' : 'page'}"` : ''}`
    // ‏والاسمُ الأقصرُ للشريط الضيّق بجانبه، ويُبدَّل بينهما في الورقة لا في السكربت (D-185)
    const label = s.tight === undefined
      ? `<span>${s.short ?? s.label}</span>`
      : `<span class="wide">${s.short ?? s.label}</span><span class="tight">${escapeHtml(s.tight)}</span>`
    return `${head}<a href="${escapeHtml(href)}"${attrs}>${s.icon}${label}${
      n > 0 ? count(n) : ''
    }</a>`
  }).join('\n    ')

  return `<aside class="rail">
  <div class="rail-head">
    <div class="brand">${wordmark(true)}${input.env === undefined || input.env === 'production' ? '' : '<span>تجريبيّ</span>'}</div>
    <div class="glyph">${GLYPH_SVG}</div>
  </div>
  <nav class="tabs" aria-label="أقسام اللوحة">
    ${tabs}
    ${commandMore()}
  </nav>
  <div class="rail-foot">${themeSwitch()}${densitySwitch()}</div>
</aside>`
}

/** رافدةُ الصفحة المستقلّة — بقسمها معلَّمًا، ومساراتُها إلى اللوحة، ومنصّتُها إن كانت. */
export function soloNav(active: string, platform?: string): string {
  return railHtml({
    // ‏ولا قائمةَ منصّاتٍ تحت «الحسابات» (خطّة التصميم 5.1 · D-205): سبعةٌ في الرافدة، والمنصّاتُ في لوحها
    active, inPanel: false, parent: platform !== undefined,
  })
}
