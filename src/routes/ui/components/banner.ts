/**
 * تنبيهُ النظام — **مكوّنٌ واحد أعلى المحتوى، لما يوقف النشر وحدَه** (D-381، §4.4).
 *
 * كان العطلُ نفسُه يُقال ثلاثًا: شريطٌ أعلى اللوحة، وزرٌّ في رأس الرئيسيّة، وبندٌ في «ما ينتظرك». فصار
 * سطرًا واحدًا: أيقونةٌ ونصٌّ قصير و**زرُّ فعلٍ واحد** يذهب إلى حيث يُصلَح، وزرُّ إغلاقٍ مؤقّت. والإغلاقُ
 * سكربتٌ (D-328): مخفيٌّ بلا سكربت فالتنبيهُ يبقى ظاهرًا، ويُطوى للجلسة وحدَها (`sessionStorage`) فيعود
 * في جلسةٍ تالية ما دام العطلُ قائمًا. **ولا يُطوى ما لم يُصلَح**: المفتاحُ نصُّه، فعطلٌ جديدٌ يظهر.
 */
import { html, raw } from '../html'
import { GLYPH_ICON, ICON } from '../icons'
import { button } from './button'

export interface BannerInput {
  readonly tone: 'bad' | 'warn'
  /** النصّ — وسمٌ جاهزٌ مهرَّبٌ عند من كتبه. */
  readonly html: string
  /** الفعلُ الواحد: اسمُه ومساره. */
  readonly action: { readonly label: string; readonly href: string }
  /** مفتاحُ الإغلاق المؤقّت — يتغيّر بتغيّر العطل. */
  readonly key: string
}

export function systemBanner(input: BannerInput): string {
  // ‏النصُّ والزرُّ وسمٌ جاهز (‏الأوّلُ مهرَّبٌ عند من كتبه، والثاني من العُدّة): يُوثَقان عند الحدّ (D-281)
  return html`<div class="sys-banner ${input.tone}" role="alert" data-banner="${input.key}"><span class="toast-ic">${raw(GLYPH_ICON['!'] ?? '')}</span><span class="toast-t">${raw(input.html)}</span>${raw(button({ label: input.action.label, size: 'sm', href: input.action.href }))}<button type="button" class="btn btn-icon btn-sm" data-banner-close aria-label="أخفِ التنبيه الآن" hidden>${raw(ICON.close)}</button></div>`.value
}
