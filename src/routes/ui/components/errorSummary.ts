/**
 * **خلاصةُ الأخطاء** (D-302 · Adam Silver، Form Design Patterns · GOV.UK Design System «Error summary»).
 *
 * نموذجٌ بأكثر من حقلٍ فيه خطآن: الخطأُ تحت حقله وحدَه يُرى واحدًا ويُفوَّت الآخر. فتُجمَع الأخطاءُ في صندوقٍ واحد فوق الحقول،
 * كلُّ سطرٍ رابطٌ إلى حقله، **وينتقل التركيزُ إلى الصندوق** حين تُفتح الصفحة (سكربتٌ صغير في الواجهة)، فيقرؤه قارئُ الشاشة أوّلًا
 * ويراه الهاتفُ قبل أن يمرّر. والخطأُ نفسُه يبقى تحت حقله أيضًا: الخلاصةُ للعدّ والانتقال، والحقلُ للإصلاح.
 */
import { html } from '../html'

export interface SummaryItem {
  /** مرساةُ الحقل: `#vyt-…` */
  readonly href: string
  readonly text: string
}

export function errorSummary(items: readonly SummaryItem[], title = 'هناك ما يُصلَح قبل الإرسال'): string {
  if (items.length === 0) return ''
  return html`<div class="card card-alert err-sum" role="alert" tabindex="-1" id="err-sum">
    <h2 class="err-sum-t">${title}</h2>
    <ul class="err-sum-l">${items.map((i) => html`<li><a href="${i.href}">${i.text}</a></li>`)}</ul>
  </div>`.value
}
