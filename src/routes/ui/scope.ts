/**
 * ‏**أين أعمل الآن؟** — مبدّلُ المنظّمة أعلى الرافدة (D-242 · وثيقةُ الرؤية §التنقّل).
 *
 * ‏صارت شاشاتُ اللوحة كلُّها تقرأ المنظّمةَ النشطةَ وحدَها، والانتقالُ بينها في «الإعدادات ← المنظّمات» وحده:
 * ‏ثلاثُ نقراتٍ لسؤالٍ يُسأل كلَّ يوم، **واسمُ المنظّمة لا يُرى في أيّ شاشة** — فمن يعتمد مسوّدةً لا يعرف لمن
 * ‏يعتمدها. فاسمُها أعلى الرافدة حيث يضعه Slack وLinear وVercel، وتحته قائمةُ الانتقال.
 *
 * ‏**ومنظّمةٌ واحدةٌ لا مبدّلَ لها**: اسمٌ لا يتغيّر في كلّ شاشةٍ ضجيجٌ لمن يملك صدى وحده. والهاتفُ بلا رأس رافدة
 * ‏(D-107)، فالاسمُ هناك في قائمة الحساب سطرًا. والانتقالُ نموذجٌ إلى المسار الذي كان (`/panel/orgs/switch`)،
 * ‏ويعود إلى الصفحة التي بدأ منها لا إلى الإعدادات.
 */
import { ORG_KIND_LABEL, type OrgRow } from '../../lib/tenancy'
import { escapeHtml } from './escape'
import { ICON } from './icons'
import { menuAction, menuItem } from './components/menu'

export interface Scope {
  readonly orgs: readonly OrgRow[]
  /** المنظّمةُ النشطة — معرّفُها. */
  readonly active: string
  /** أين يعود الانتقال: مسارٌ تحت `/panel` (يمرّ بـ`safeNext` على الخادم). */
  readonly next: string
}

const brands = (n: number): string => (n === 1 ? 'علامةٌ واحدة' : n === 2 ? 'علامتان' : `${n} علامات`)

/** المنظّمةُ النشطة من القائمة، و`null` إن كانت واحدةً لا تحتاج مبدّلًا. */
export function current(scope: Scope | undefined): OrgRow | null {
  if (scope === undefined || scope.orgs.length < 2) return null
  return scope.orgs.find((o) => o.id === scope.active) ?? null
}

/** المبدّلُ أعلى الرافدة — `''` لمنظّمةٍ واحدة. */
export function scopeMenu(scope: Scope | undefined): string {
  const now = current(scope)
  if (now === null || scope === undefined) return ''
  const others = scope.orgs.filter((o) => o.id !== now.id).map((o) => menuAction({
    label: o.name, note: `${ORG_KIND_LABEL[o.kind]} · ${brands(o.brands)}`,
    action: '/panel/orgs/switch', fields: { org: o.id, next: scope.next }, busy: 'جارٍ الانتقال…',
  }))
  return `<details class="menu scope" id="scope">
    <summary class="scope-btn" aria-label="المنظّمة النشطة: ${escapeHtml(now.name)} — بدّلها">
      <span class="scope-t"><b>${escapeHtml(now.name)}</b><span>${ORG_KIND_LABEL[now.kind]} · ${brands(now.brands)}</span></span>
      <span class="menu-caret" aria-hidden="true">${ICON.chevron}</span>
    </summary>
    <div class="menu-list">${menuItem({ label: 'كلُّ الشركات — المحفظة', href: '/panel/portfolio', note: 'ما ينتظر وما خرج وما أُنفق لكلّ شركة' })}${others.join('')}${menuItem({ label: 'إدارة المنظّمات', href: '/panel/settings#orgs' })}</div>
  </details>`
}

/** سطرُ المنظّمة في قائمة الحساب — للهاتف حيث لا رأسَ رافدة. */
export function scopeLine(scope: Scope | undefined): string[] {
  const now = current(scope)
  if (now === null) return []
  return [`<div class="menu-seg"><span>المنظّمة</span><b>${escapeHtml(now.name)}</b></div>`,
    menuItem({ label: 'كلُّ الشركات — المحفظة', href: '/panel/portfolio' }),
    menuItem({ label: 'بدّل المنظّمة', href: '/panel/settings#orgs' })]
}
