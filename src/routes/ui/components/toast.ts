/**
 * الإشعار — **نتيجةُ ما فُعل، حيث يُرى** (خطّة التصميم 7.8 و5.9 · D-189).
 *
 * يُرسَم في موضعه من الخادم، **ويطفو حين يعمل السكربت** (`panelScript`): أعلى الشاشة
 * تحت الشريط على الجوّال (مراجعة ر-0 — أسفلُها مزدحمٌ بصفوف البتّ اللاصقة)، وفي الزاوية
 * السفليّة على الحاسوب. ومعه «أغلق»، ويذهب وحدَه بعد أربع ثوانٍ (v1 §5.10) ويقف العدُّ تحت المؤشّر
 * والتركيز والإصبع (WCAG 2.2.1). **والخطأُ لا يذهب وحدَه، وما فيه نموذجٌ لا يذهب وحدَه**
 * (D-186): «تراجَع» بابُه الوحيد، ولا عدّادَ ثوانٍ يسبق لوحَ المفاتيح إليه.
 *
 * **وشكلُه شكلُ «card-alert»** (7.3): السطحُ وحافّةٌ ‏٤px بلون الحال. والأرضُ المقلوبة
 * («--ink» تحت «--bg» في 7.8) لم تُتَّخذ: رمزُ «bad» عليها ‏٢٫٧١:١ نهارًا — دون ‏٣:١ للرمز
 * (WCAG 1.4.11) — والحالُ لونٌ ورمزٌ وكلمةٌ معًا (D-043)، فلا يُسقَط لونُها لأجل الأرض.
 */
import { escapeHtml } from '../escape'
import { GLYPH_ICON } from '../icons'

export interface NoticeInput {
  readonly tone: 'ok' | 'warn' | 'bad'
  /** النصّ — وسمٌ جاهزٌ مهرَّبٌ عند من كتبه. */
  readonly html: string
  /** فعلٌ في طرفه («تراجَع»، «جدّد الإذن») — وسمٌ جاهز. */
  readonly action?: string
  /** يُعلَن تنبيهًا (`role="alert"`) — للخطأ، ولما يوقف شيئًا. */
  readonly alert?: boolean
  /** حرفُ الرمز من جدول الحال — وإلّا فرمزُ النغمة. */
  readonly g?: string
}

const TONE_GLYPH = { ok: '✓', warn: '!', bad: '✕' } as const

/** إشعارٌ واحد — يُرسَم في موضعه، ويطفو إن كان في `toastRegion`. */
export function notice(input: NoticeInput): string {
  const g = GLYPH_ICON[input.g ?? TONE_GLYPH[input.tone]] ?? ''
  // ‏والنغمةُ صنفٌ لا سِمة: سكربتُ اللوحة يقرؤها («classList.contains('bad')») ليقرّر أيذهب وحدَه
  return `<div class="toast-note ${input.tone}"${input.alert === true ? ' role="alert"' : ''}>` +
    `<span class="toast-ic">${g}</span><span class="toast-t">${input.html}</span>${
      input.action === undefined ? '' : `<span class="grow"></span>${input.action}`}</div>`
}

/**
 * منطقةُ الإشعار — **حيّةٌ ومعلَنة**، وفيها ما يطفو.
 *
 * `id="flash"` مرساةُ السكربت والنموذج المشغول (يكتب فيها «جارٍ…»، D-149)، فلا تُبدَّل.
 */
export function toastRegion(inner: string): string {
  return `<div id="flash" role="status" aria-live="polite">${inner}</div>`
}

/** إشعارٌ نصّيٌّ بسيط — النصُّ يُهرَّب هنا. */
export function noticeText(tone: NoticeInput['tone'], text: string, alert = tone === 'bad'): string {
  return notice({ tone, html: escapeHtml(text), alert })
}
