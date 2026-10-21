/**
 * «النتائج» — **وجهةٌ واحدةٌ بثلاثة تبويبات** (خطّة التصميم 5.1 و5.8 · D-204 · D-212).
 *
 * كان التقريرُ الأسبوعيّ صفحةً مستقلّةً في الرافدة، والجدولُ المحوريُّ لوحًا ثانيًا باسمٍ آخر،
 * وكلاهما جوابُ سؤالٍ واحد: «ما أثرُ ما نشرت؟». فصارا تبويبَي وجهةٍ واحدة، والتبويبُ رابطٌ
 * إلى موضعه: «هذا الأسبوع» صفحةُ التقرير، و«تحليلٌ مفصّل» لوحُ الجدول في اللوحة.
 *
 * **والثالثُ «الخطّ الزمنيّ»** (D-212): السؤالُ نفسُه مقروءًا على الزمن — كلُّ منشورٍ في
 * المحفظة شريطٌ من كتابته إلى خروجه، وما مضى وما يأتي في نظرةٍ واحدة.
 */
import { tabs } from './components/tabs'

export function resultsTabs(current: 'week' | 'pivot' | 'timeline' | 'insights'): string {
  return tabs('أقسام النتائج', [
    { label: 'هذا الأسبوع', href: '/panel/report', ...(current === 'week' ? { current: true } : {}) },
    { label: 'تحليل مفصّل', href: current === 'pivot' ? '#pivot' : '/panel/analysis', ...(current === 'pivot' ? { current: true } : {}) },
    { label: 'الخطّ الزمنيّ', href: '/panel/timeline', ...(current === 'timeline' ? { current: true } : {}) },
    // ‏والرابعُ «ما ينجح» (D-253): متى تنشر وبأيّ شكل، من تاريخ الحساب
    { label: 'ما ينجح', href: '/panel/insights', ...(current === 'insights' ? { current: true } : {}) },
  ], { id: 'results-sub' })
}
