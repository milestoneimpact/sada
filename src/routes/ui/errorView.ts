/**
 * صفحتا الخطأ — **بالقالب نفسِه والرافدة، لا JSON** (خطّة التصميم 7.11 · D-189).
 *
 * كان كلُّ مسارٍ لا وجودَ له يردّ `{"error":"not_found"}`، **فيرى المالكُ نصًّا خامًّا** إن فتح
 * رابطًا قديمًا أو علامةً محفوظة — ولا بابَ منه إلى اللوحة. وخطأُ الخادم كان «Internal Server
 * Error» بالإنجليزيّة على أرضٍ بيضاء. فصارتا صفحتين من اللوحة: الرافدةُ وشريطُ الجوّال، وجملةٌ
 * تقول ما وقع، وفعلٌ أوّليٌّ واحد. **ورقمُ الطلب تحت «للمطوّر»** ليُرسَل كما هو، ولا يُعرَض
 * سببٌ تقنيٌّ في الوجه.
 */
import { button } from './components/button'
import { emptyState } from './components/empty'
import { escapeHtml } from './escape'
import { GLYPH_ICON } from './icons'
import { railHtml } from './rail'
import { soloPage } from './shell'
import { buildCommands } from './command'

const HOME = { href: '/panel', label: 'الرئيسيّة' } as const

/**
 * ‏٤٠٤ — «هذه الصفحة غير موجودة. ربّما نُقلت.» و[الرئيسيّة].
 * و`detail` جملةُ المسار الذي يعرف ما لم يجده («لا منصّةَ بهذا الاسم»).
 */
export function notFoundPage(nonce: string, path: string, detail?: string): string {
  const said = detail === undefined ? '' : `${escapeHtml(detail)}. `
  const body = emptyState({
    heading: 1,
    echo: true,
    title: 'هذه الصفحة غير موجودة',
    html: `${said}ربّما نُقلت، أو كُتب رابطُها بخطأ: <bdi class="mono">${escapeHtml(path)}</bdi>.
      ابدأ من الرئيسيّة، أو ابحث عمّا تريد بـ <kbd class="kbd">Ctrl K</kbd>.`,
    action: button({ label: 'الرئيسيّة', variant: 'primary', href: '/panel' }),
  })
  return soloPage('صدى — صفحةٌ غير موجودة', HOME, body, nonce, '', buildCommands({ onPanel: false }),
    railHtml({ inPanel: false }))
}

/**
 * ‏٥٠٠ — «حدث خطأ من جهتنا، لا منك. أعد المحاولة بعد دقيقة.» و[أعد المحاولة].
 * و`retry` المسارُ نفسُه إن كان طلبَ قراءة؛ وما سواه لا يُعاد بضغطة (نموذجٌ قد يُرسَل مرّتين).
 *
 * **ولا تَعِد الصفحةُ بما لا يعرفه الخادم** (مراجعةُ D-189): كانت تقول لكلّ ‏٥٠٠ «لم يُحفَظ شيءٌ
 * ناقص»، ونموذجٌ يكتب صفًّا صفًّا (`applyPlan`) أو يكتب ثمّ يسقط في `setFlash` قد تمّ بعضُه أو
 * كلُّه قبل الاستثناء — فكانت تدفع المالكَ إلى تكرار ما وقع. فالقراءةُ تُعاد بلا وعد، والكتابةُ
 * تقول «ربّما تمّ بعضُه» وتطلب التحقّقَ قبل الإعادة.
 */
export function serverErrorPage(nonce: string, requestId: string, retry: string | null): string {
  const tail = 'فإن تكرّر فأرسل إليّ ما تحت «للمطوّر» كما هو.'
  // ‏**ولا نقشَ في صفحة الخطأ** (BRAND §٥، مراجعة D-196): الأرضُ العميقةُ والنعناعُ يُقرآن «تمّ» حيث لا شيءَ تمّ.
  // ‏ولا جذرَ لها يميّزها، فـ`data-no-echo` يعلّمها ويردّ `audit_design` نقشًا تحته
  const body = `<div data-no-echo="500">${emptyState({
    heading: 1,
    // ‏مثلّثُ التنبيه من جدول الحال — لا درعُ «الأمان»: الرمزُ اسمُ معناه (D-103)
    icon: GLYPH_ICON['▲'] ?? '',
    title: 'حدث خطأ من جهتنا، لا منك',
    html: retry === null
      ? `<b>ربّما تمّ بعضُ ما طلبتَ قبل الخطأ.</b> افتح الصفحةَ التي كنتَ فيها وتحقّق ممّا حُفظ قبل أن تعيده، ${tail}`
      : `أعد المحاولة بعد دقيقة، ${tail}`,
    action: retry === null
      ? button({ label: 'الرئيسيّة', variant: 'primary', href: '/panel' })
      : button({ label: 'أعد المحاولة', variant: 'primary', href: retry }),
  })}
  <details class="setup mt-3"><summary>للمطوّر</summary>
    <div class="setup-body"><p class="hint m-0">رقمُ الطلب: <span class="mono">${escapeHtml(requestId)}</span></p></div></details></div>`
  return soloPage('صدى — خطأٌ في الخادم', HOME, body, nonce, '', buildCommands({ onPanel: false }),
    railHtml({ inPanel: false }))
}
