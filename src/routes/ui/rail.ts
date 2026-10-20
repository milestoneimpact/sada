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
import { SECTIONS } from './command'
import { scopeMenu, type Scope } from './scope'
import { ICON } from './icons'
import { count } from './components/badge'
import { escapeHtml, GLYPH_SVG, wordmark } from './shell'

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
  /** المنظّماتُ والنشطةُ منها: مبدّلٌ تحت العلامة حين تكون أكثرَ من واحدة (`scope.ts`). */
  readonly scope?: Scope
}

/**
 * «المزيد» على الهاتف — **قائمةٌ لا بحث** (خطّة التصميم 5.3 · D-208).
 *
 * كان زرًّا يفتح لوحةَ الأوامر: من أراد «الإعدادات» من هاتفه كتب اسمَها. فصار `<details>` يعمل بلا سكربت، فيه ما
 * ليس في الشريط من `SECTIONS` بأعدادها (الحسابات · ما عليك · الإعدادات)، ثمّ «بحثٌ وأوامر». وعددُه مجموعُ ما فيه،
 * فلا يختفي «ينتظرك» تحت زرٍّ لا رقمَ عليه. وعلى الحاسوب لا يُرسم: الرافدةُ تحمل السبعة.
 */
function moreSheet(input: RailInput, counts: Readonly<Record<string, number>>): string {
  const rest = SECTIONS.filter((s) => s.bar !== true)
  const total = rest.reduce((n, s) => n + (counts[s.id] ?? 0), 0)
  const links = rest.map((s) => {
    const href = s.page ?? (input.inPanel ? `#${s.id}` : `/panel#${s.id}`)
    const n = counts[s.id] ?? 0
    return `<a href="${escapeHtml(href)}"${input.active === s.id ? ' aria-current="page"' : ''}>${s.icon}<span>${escapeHtml(s.label)}</span>${n > 0 ? count(n) : ''}</a>`
  }).join('')
  return `<details class="more-sheet">
    <summary>${ICON.more}<span>المزيد</span>${total > 0 ? count(total) : ''}</summary>
    <div class="more-panel">${links}
      <button type="button" class="cmdk-open" aria-haspopup="dialog" aria-controls="cmdk">${ICON.search}<span>بحث وأوامر</span></button>
    </div>
  </details>`
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
  ${scopeMenu(input.scope)}
  <nav class="tabs" aria-label="أقسام اللوحة">
    ${tabs}
    ${moreSheet(input, counts)}
  </nav>
  ${/* ‏والسمة والكثافة في قائمة الحساب أعلى الصفحة (D-215) — لا ذيل يُرى دائمًا */''}
</aside>`
}

/** رافدةُ الصفحة المستقلّة — بقسمها معلَّمًا، ومساراتُها إلى اللوحة، ومنصّتُها إن كانت. */
export function soloNav(active: string, platform?: string): string {
  return railHtml({
    // ‏ولا قائمةَ منصّاتٍ تحت «الحسابات» (خطّة التصميم 5.1 · D-205): سبعةٌ في الرافدة، والمنصّاتُ في لوحها
    active, inPanel: false, parent: platform !== undefined,
  })
}
