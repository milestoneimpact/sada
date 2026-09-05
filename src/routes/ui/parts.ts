/**
 * عناصرُ مشتركة بين الأقسام.
 *
 * وُضعت هنا لا في `panelView` لأنّ قسم المزوّدين يستعملها أيضا —
 * واستيرادُها منه يصنع دائرةً بين ملفّين. والدائرةُ تعمل في الأنواع
 * وتنكسر في التشغيل حين يتبدّل ترتيبُ الحزم.
 */
import { escapeHtml } from './shell'

export function pct(used: number, cap: number): number {
  if (cap <= 0) return 100
  return Math.min(100, Math.round((used / cap) * 100))
}

/**
 * مقياسُ مقدار: هيئةٌ واحدة تتدرّج بالطول لا بالهيئة.
 * والبلوغ حالةٌ لا مقدار — فيقفز إلى الأحمر **ومعه نصّ**، لأنّ الحالة
 * لا تقع على اللون وحده.
 */
export function bar(used: number, cap: number, label = 'بلغ السقف'): string {
  const p = pct(used, cap)
  const full = p >= 100
  return `<div class="bar"><i class="${full ? 'f' : ''}" style="width:${p}%"></i></div>` +
    (full
      ? `<div class="cap${label === 'بلغ السقف' ? '' : ' done'}"><span aria-hidden="true">■</span>${escapeHtml(label)}</div>`
      : '')
}

