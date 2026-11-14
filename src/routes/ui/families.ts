/**
 * **عائلاتُ الشاشات** (D-342، المرحلةُ الثالثة من `docs/FLOW-PLAN.md`): «شاشاتٌ أقلّ».
 *
 * كانت «النتائج» خمسَ شاشاتٍ يُبلَغ كلٌّ منها من موضعٍ غير الآخر (الرافدةُ إلى واحدة، ورابطٌ في ذيل بطاقةٍ إلى ثانية، ولوحةُ الأوامر
 * إلى ثالثة)، و«المكتبة» شاشتين، و«ما عليك» ثلاثًا. فمن دخل واحدةً لم يعرف أنّ لها أخوات.
 *
 * هنا **كلُّ عائلةٍ وجهةٌ واحدةٌ بألسنتها**: شريطٌ واحدٌ أعلى كلّ شاشةٍ من العائلة، بالترتيب نفسِه، والحاليُّ معلَّم. العناوينُ القديمةُ
 * باقيةٌ كما هي (لا رابطَ محفوظًا ينكسر)، والمصدرُ الواحدُ للعائلات هذا الملفّ — فلا شاشةَ تكتب أخواتِها بيدها.
 */
import { tabs } from './components/tabs'

interface Member { readonly href: string; readonly label: string }

export const FAMILIES: Readonly<Record<string, { readonly label: string; readonly members: readonly Member[] }>> = {
  library: {
    label: 'المكتبة',
    members: [{ href: '/panel/library', label: 'المصادر والمقاطع' }, { href: '/panel/assets', label: 'كلُّ الأصول' }],
  },
  results: {
    label: 'النتائج',
    members: [
      { href: '/panel/report', label: 'الأسبوع' }, { href: '/panel/analysis', label: 'الأداء' },
      { href: '/panel/insights', label: 'ما ينجح' }, { href: '/panel/timeline', label: 'الخطّ الزمنيّ' },
    ],
  },
  plan: {
    label: 'الخطّة',
    members: [{ href: '/panel/plan/review', label: 'الخطّة' }, { href: '/panel/plan/view', label: 'عرضٌ للطباعة' }, { href: '/panel/plan/new', label: 'خطّة جديدة' }],
  },
  // ‏و«تفتح قدرة» أختُ «المهامّ» بعدها (دمجُ متابعة D-324 على main): مهامُّ القدرة خرجت إلى صفحتها، فلا تُبلَغ من سطرٍ وحده.
  // ‏واسمُها هنا اسمُ رأسها (`LATER_LABEL` في `tasksView.ts`، واختبارٌ يطابقهما) — ولا يُستورَد: tasksView يرسم بـ shell، وshell يقرأ هذا الملفّ
  todo: {
    label: 'ما عليك',
    members: [
      { href: '/panel/tasks', label: 'المهامّ' }, { href: '/panel/tasks/later', label: 'تفتح قدرة' },
      { href: '/panel/gates', label: 'البوّابات' }, { href: '/panel/help', label: 'المساعدة' },
    ],
  },
}

/**
 * **تنقّلٌ بلا انتظار** (D-344، المرحلةُ الخامسة): قواعدُ الجلب المسبق (Speculation Rules) — المتصفّحُ يجلب الصفحةَ حين يحوَّم على
 * رابطها، فتُفتح فورًا بانتقال الصفحات القائم. **للشاشات الساكنة وحدَها**: «ما عليك» و«النتائج» — لا الخطّةُ ولا المنشوراتُ ولا المكتبة،
 * فتحتها حالٌ حيّةٌ قد تتبدّل بين الجلب والضغط. وهي `GET` لا تغيّر شيئًا. Chrome وEdge؛ وغيرُهما يتجاهل الوسمَ ويبقى كما كان.
 */
export const PREFETCH_RULES = JSON.stringify({
  prefetch: [{
    where: { href_matches: [...FAMILIES['todo']!.members, ...FAMILIES['results']!.members].map((m) => m.href) },
    eagerness: 'moderate',
  }],
})

/** شريطُ عائلة الشاشة التي عنوانُها `at` — وفراغٌ لشاشةٍ بلا عائلة. */
export function familyTabs(at: string): string {
  const family = Object.values(FAMILIES).find((f) => f.members.some((m) => m.href === at))
  if (family === undefined) return ''
  return tabs(family.label, family.members.map((m) => ({ href: m.href, label: m.label, current: m.href === at })), { id: 'family' })
}
