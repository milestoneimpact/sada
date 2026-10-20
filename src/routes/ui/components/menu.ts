/**
 * القائمةُ المنسدلة — **`<details>` أصليٌّ لا طبقةٌ مصنوعة** (الخطّة 5.6 و7.1 · D-198).
 *
 * «منشور جديد ▾» و«⋯» على البطاقة و«الصورة ▾» في المحرّر: زرٌّ يكشف قائمةً من روابطَ ونماذج.
 * **والمتصفّحُ يفعل ذلك بلا سطرٍ منّا**: الملخّصُ يُضغَط ويُقرأ «مطويّ / مفتوح» لقارئ الشاشة،
 * ويعمل بلا سكربت. والسكربتُ (`KIT_SCRIPT`) يزيد ما يتوقّعه من اعتاد القوائم وحدَه: النقرُ خارجها
 * يغلقها، وEsc يغلقها ويعيد التركيزَ إلى زرّها. **وهي قائمةُ إفصاحٍ لا `role="menu"`**: البنودُ
 * روابطُ وأزرارٌ تُبلَغ بـTab كما هي، فلا تُعِد بأسهمٍ لا تعمل.
 *
 *   menu        الحاوية (`position:relative`)
 *   menu-list   اللوحُ المنسدل: سطحُ الحوار وظلُّه «--sh-3» ونصفُ قطر البطاقة
 *   menu-item   بندٌ بارتفاع الهدف ‏٤٤ على الأقلّ: رابطٌ أو زرُّ نموذجٍ أو لصيقةُ ملفّ
 */
import { escapeHtml } from '../escape'

export interface MenuInput {
  /** نصُّ الزرّ — أو اسمُه لقارئ الشاشة في زرّ الأيقونة. */
  readonly label: string
  /** درجةُ الزرّ من عائلة «btn». */
  readonly variant?: 'primary' | 'secondary' | 'quiet' | 'icon'
  readonly size?: 'md' | 'sm'
  /** أيقونةٌ من `ICON` تسبق النصّ (أو تقوم مقامه في زرّ الأيقونة). */
  readonly icon?: string
  /** سهمٌ بعد النصّ يقول «تنسدل» — من `ICON.chevron`. */
  readonly caret?: string
  /** البنودُ وسمًا جاهزًا (`menuItem()` أو نموذجٌ بزرٍّ من «menu-item»). */
  readonly items: readonly string[]
  readonly id?: string
  /** سِماتٌ أخرى على الحاوية. */
  readonly attrs?: string
}

/** بندٌ رابط: عنوانٌ ثمّ سطرٌ يقول ما يقع (اختياريّ). */
export function menuItem(input: { readonly label: string; readonly href: string; readonly note?: string; readonly icon?: string; readonly danger?: boolean }): string {
  return `<a class="menu-item${input.danger === true ? ' menu-danger' : ''}" href="${escapeHtml(input.href)}">${input.icon ?? ''}<span class="menu-t"><b>${escapeHtml(input.label)}</b>${
    input.note === undefined ? '' : `<span>${escapeHtml(input.note)}</span>`}</span></a>`
}

/**
 * بندٌ زرُّ نموذج — **والنموذجُ حولَه هنا** (`action` وحقولُه المخفيّة): قائمةٌ داخل بطاقةٍ لا
 * يُزرَع فيها نموذجٌ داخل نموذج، فلكلّ بندٍ نموذجُه.
 */
export function menuAction(input: {
  readonly label: string
  readonly action: string
  readonly fields: Readonly<Record<string, string>>
  readonly danger?: boolean
  readonly confirm?: string
  readonly busy?: string
  /** سببُ التعطيل: البندُ يبقى ظاهرًا معطَّلًا وسببُه تحته (D-163) — لا يختفي فيُبحث عنه. */
  readonly blocked?: string
  /** سطرٌ تحت بندٍ يعمل: ما ينتظرك فيه، أو كم بقي منه اليوم. */
  readonly note?: string
  /** يُرسَل بلا تحميل وتُبدَّل بطاقتُه (D-207) — لما ينتهي في بطاقةٍ بمعرّفها `d-…`. */
  readonly swap?: boolean
  /** ما تقوله البطاقةُ فورَ الضغط قبل ردّ الخادم (D-233)، مع `swap` وحدَه. */
  readonly optimistic?: string
}): string {
  const hidden = Object.entries(input.fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join('')
  const line = input.blocked ?? input.note
  const why = line === undefined ? '' : `<span>${escapeHtml(line)}</span>`
  return `<form class="menu-form" method="POST" action="${escapeHtml(input.action)}" data-busy="${escapeHtml(input.busy ?? 'جارٍ…')}"${
    input.confirm === undefined ? '' : ` data-confirm="${escapeHtml(input.confirm)}"`}${input.swap === true ? ' data-swap' : ''}>${hidden}<button class="menu-item${
    input.danger === true ? ' menu-danger' : ''}" type="submit"${input.optimistic === undefined ? '' : ` data-optimistic="${escapeHtml(input.optimistic)}"`}${input.blocked === undefined ? '' : ' disabled'}><span class="menu-t"><b>${
    escapeHtml(input.label)}</b>${why}</span></button></form>`
}

export function menu(input: MenuInput): string {
  const variant = input.variant ?? 'secondary'
  const cls = `btn btn-${variant}${input.size === 'sm' ? ' btn-sm' : ''} menu-btn`
  // ‏زرُّ الأيقونة بلا نصٍّ ظاهر: اسمُه في «aria-label» كـ`button()`
  const named = variant === 'icon'
    ? ` aria-label="${escapeHtml(input.label)}" title="${escapeHtml(input.label)}"`
    : ''
  const text = variant === 'icon' ? '' : `<span>${escapeHtml(input.label)}</span>`
  return `<details class="menu"${input.id === undefined ? '' : ` id="${escapeHtml(input.id)}"`}${
    input.attrs === undefined || input.attrs === '' ? '' : ` ${input.attrs}`}>` +
    `<summary class="${cls}"${named}>${input.icon ?? ''}${text}${input.caret === undefined ? '' : `<span class="menu-caret" aria-hidden="true">${input.caret}</span>`}</summary>` +
    `<div class="menu-list">${input.items.join('')}</div></details>`
}
