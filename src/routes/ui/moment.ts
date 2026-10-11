/**
 * لحظةُ العلامة — **السطحُ العميقُ والنقشُ وحدهما هنا** (D-196 · خطّة التصميم 3.5).
 *
 * رسمان للنقش لا رسمٌ يُمَطّ: لوحةٌ قائمةٌ بجانب النموذج على الحاسوب، وشريطٌ عريضٌ فوقه على
 * الجوّال؛ يُظهر كلًّا شرطُه في الورقة. **والنقشُ لا يقع خلف نصّ**: القمّةُ والأصداءُ في
 * النصف البعيد عن الاسم والشعار. **والقفلُ كما في لوحة الهويّة**: الاسمُ و«SADA» تحته ثمّ
 * الرمز في الشيفرة، فيقع الرمزُ يسارَ الاسم — الشعارُ لا يُقلَب مع الاتّجاه.
 *
 * والرمزُ هنا الرسمُ التقريبيُّ نفسُه حتّى يصل الأصلُ المتّجه (M-26)، **ولا يُدّعى أنّه هو**.
 * ويُستعمَل في القالب T6 وحده (الدخولُ والعاملُ الثاني، وصفحةُ الهبوط بعد دمج D-193): لحظةٌ واحدةٌ في الشاشة، ابنٌ مباشرٌ لـ
 * `.auth-split` بجانب النموذج لا فوقه ولا فيه — `docs/BRAND.md`، ويثبّته `views.test` و`audit_design`.
 *
 * **والسطرُ اللاتينيُّ زينةٌ لقارئ الشاشة** (مراجعة D-196): ترجمةُ السطر العربيّ قبله حرفًا، فكان
 * يُسمَع مرّتين و«SADA» مخفيّ. فعليه `aria-hidden` كـ«SADA»، ويُكتب بحالته وتكبّره الورقة.
 */
import { echo } from './echo'
import { GLYPH_SVG, wordmark } from './shell'

export function brandMoment(): string {
  return `<div class="moment">
    <span class="echo wide">${echo({ width: 600, height: 900, tone: 'deep', crest: 0.62, level: 0.55, scale: 1.4 })}</span>
    <span class="echo narrow">${echo({ width: 390, height: 240, tone: 'deep', crest: 0.1, level: 0.7, scale: 1.1, density: 3, align: 'xMinYMax' })}</span>
    <div class="moment-id"><span class="moment-name">${wordmark(true)}<span class="moment-sada" aria-hidden="true">SADA</span></span><span class="moment-glyph">${GLYPH_SVG}</span></div>
    <p class="moment-line">أصوات اليوم .. لقرارات أفضل</p>
    <p class="moment-en" lang="en" aria-hidden="true">Today’s voices .. better decisions</p>
  </div>`
}
