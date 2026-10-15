/**
 * «النتائج» — **وجهةٌ واحدةٌ بتبويبين** (خطّة التصميم 5.1 و5.8 · D-204).
 *
 * كان التقريرُ الأسبوعيّ صفحةً مستقلّةً في الرافدة، والجدولُ المحوريُّ لوحًا ثانيًا باسمٍ آخر،
 * وكلاهما جوابُ سؤالٍ واحد: «ما أثرُ ما نشرت؟». فصارا تبويبَي وجهةٍ واحدة، والتبويبُ رابطٌ
 * إلى موضعه: «هذا الأسبوع» صفحةُ التقرير، و«تحليلٌ مفصّل» لوحُ الجدول في اللوحة.
 */
import { tabs } from './components/tabs'

export function resultsTabs(current: 'week' | 'pivot'): string {
  return tabs('أقسامُ النتائج', [
    { label: 'هذا الأسبوع', href: '/panel/report', ...(current === 'week' ? { current: true } : {}) },
    { label: 'تحليلٌ مفصّل', href: current === 'pivot' ? '#pivot' : '/panel/analysis', ...(current === 'pivot' ? { current: true } : {}) },
  ], { id: 'results-sub' })
}
