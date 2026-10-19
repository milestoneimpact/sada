/**
 * لحظةُ العلامة — **السطحُ العميقُ والنقشُ وحدهما هنا** (D-196 · خطّة التصميم 3.5).
 *
 * رسمان للنقش لا رسمٌ يُمَطّ: لوحةٌ قائمةٌ بجانب النموذج على الحاسوب، وشريطٌ عريضٌ فوقه على
 * الجوّال؛ يُظهر كلًّا شرطُه في الورقة. **والنقشُ لا يقع خلف نصّ**: القمّةُ والأصداءُ في
 * النصف البعيد عن الاسم والشعار. **والقفلُ الاسمُ «صدى» وحده** ثمّ
 * الرمز في الشيفرة، فيقع الرمزُ يسارَ الاسم — الشعارُ لا يُقلَب مع الاتّجاه.
 *
 * والرمزُ هنا الرسمُ التقريبيُّ نفسُه حتّى يصل الأصلُ المتّجه (M-26)، **ولا يُدّعى أنّه هو**.
 * ويُستعمَل في القالب T6 وحده (الدخولُ والعاملُ الثاني، وصفحةُ الهبوط بعد دمج D-193): لحظةٌ واحدةٌ في الشاشة، ابنٌ مباشرٌ لـ
 * `.auth-split` بجانب النموذج لا فوقه ولا فيه — `docs/BRAND.md`، ويثبّته `views.test` و`audit_design`.
 *
 * **والعلامةُ «صدى» وحدها** (D-203): لا «SADA» تحت الاسم ولا سطرٌ لاتينيٌّ بعد الشعار العربيّ.
 */
import { echo } from './echo'
import { GLYPH_SVG, wordmark } from './shell'

export function brandMoment(): string {
  return `<div class="moment">
    <span class="echo wide">${echo({ width: 600, height: 900, tone: 'deep', crest: 0.62, level: 0.55, scale: 1.4 })}</span>
    <span class="echo narrow">${echo({ width: 390, height: 240, tone: 'deep', crest: 0.1, level: 0.7, scale: 1.1, density: 3, align: 'xMinYMax' })}</span>
    <div class="moment-id"><span class="moment-name">${wordmark(true)}</span><span class="moment-glyph">${GLYPH_SVG}</span></div>
    <p class="moment-line">أصوات اليوم .. لقرارات أفضل</p>
  </div>`
}

/**
 * ‏**شريطُ اليوم الأوّل** (BRAND §٥ · D-224): النغمةُ العميقةُ أعلى الرئيسيّة بارتفاع ‏10rem (‏160px) وأربعة أصداء،
 * ‏**حتّى يُفهَم أوّلُ مصدر** — فمصدرٌ لم يُحلَّل لا يُكتب منه بعد، واليومُ الأوّلُ قائمٌ ما لم يُكتب شيء.
 * * ‏بلا نصٍّ عليه ولا فوقه (الحارسُ الثالث، D-222)، و`aria-hidden` كلُّه. **وبلا خيطٍ ذهبيّ**: الأصداءُ النعناعيّةُ موضعُ
 * ‏ذهبٍ واحد، والخيطُ في الليل موضعٌ ثانٍ يتجاوز ميزانيّةَ الثلاثة.
 * ‏وليس «.moment»: تلك لحظةُ T6 بجانب النموذج، وهذا شريطٌ في سطح اللوحة يختفي.
 */
export function firstBand(): string {
  return `<div class="first-band" aria-hidden="true"><span class="echo">${
    echo({ width: 1200, height: 160, tone: 'deep', crest: 0.72, level: 0.5, scale: 1.1, density: 4, hairline: false, align: 'xMaxYMid' })}</span></div>`
}
