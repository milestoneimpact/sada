/**
 * سجلّ المزوّدين وتوجيه المهامّ.
 *
 * المرجع الواحد لسؤالين: **مَن ينفّذ كلّ مهمّة؟** و **ما الذي يلزمه؟**
 *
 * وُجد لأنّ نداء المزوّد كان مباشرا في طبقة الفهم: إضافة Gemini كانت
 * تعني نسخ الطبقة، ثمّ ثالثا فنسخةً ثالثة — وتصير إجابة «أيّ نموذج
 * يعمل الآن؟» بحثا في الشيفرة لا قراءةً في ملفّ.
 *
 * ولا مفاتيح هنا ولا قيم: أسماء الأسرار فقط. والمفتاح يبقى في أسرار
 * Worker، لا يمرّ بشيفرتنا ولا يُقرأ منها.
 */
import type { Env } from '../../env'

export type ProviderName = 'anthropic' | 'gemini' | 'cloudflare'

/**
 * المهامّ التي تنادي نموذجا — **قائمةٌ حيّةٌ يُشتَقّ منها النوع**.
 *
 * وكانت اتّحادا مكتوبا يدا **و`ROUTES` جدولا بجانبه**: مهمّةٌ تُضاف في
 * أحدهما وتُنسى في الآخر. وهي علّةُ `SETTING_KEYS` (D-110) و`Platform`
 * (D-121) — **ثالثةً في المستودع نفسِه**، فأُغلقت هنا كما أُغلقتا.
 */
export const TASK_NAMES = ['analyze', 'draft', 'image', 'plan', 'video', 'vision'] as const

export type TaskName = (typeof TASK_NAMES)[number]

export interface ProviderSpec {
  readonly label: string
  /** اسم السرّ في بيئة Worker. اسمٌ لا قيمة. */
  readonly secret: keyof Env
  readonly docs: string
}

export const PROVIDERS: Readonly<Record<ProviderName, ProviderSpec>> = {
  anthropic: {
    label: 'Anthropic — الفهم والكتابة',
    secret: 'ANTHROPIC_API_KEY',
    docs: 'console.anthropic.com ← API Keys',
  },
  gemini: {
    label: 'Gemini — توليد الصور',
    secret: 'GEMINI_API_KEY',
    docs: 'aistudio.google.com/apikey',
  },
  cloudflare: {
    label: 'Cloudflare Workers AI — الفيديو',
    secret: 'CF_AI_TOKEN',
    docs: 'dash.cloudflare.com ← My Profile ← API Tokens ← Workers AI',
  },
}

export interface Route {
  readonly provider: ProviderName
  readonly model: string
  /** سببُ اختيار هذا النموذج لهذه المهمّة — يُقرأ ويُراجَع. */
  readonly why: string
}

/**
 * التوجيه.
 *
 * الافتراض `claude-opus-5` في كلّ مهمّة نصيّة عمدا: **خفضُ النموذج
 * لتوفير المال قرارُ المالك لا قرارُ النظام.** فيُعرض الفرق ويُختار،
 * ولا يُخفَض صامتا فتنخفض الجودة بلا أن يعرف أحد لماذا.
 */
export const ROUTES: Readonly<Record<TaskName, Route>> = {
  analyze: {
    provider: 'anthropic',
    model: 'claude-opus-5',
    why: 'حكمٌ يقرّر إنفاقا لاحقا — الخطأ فيه أغلى من ثمنه',
  },
  draft: {
    provider: 'anthropic',
    model: 'claude-opus-5',
    why: 'كتابةٌ عربية تُنشر باسم المالك — الخطأ فيها يُقرأ عليه لا علينا',
  },
  plan: {
    provider: 'anthropic',
    model: 'claude-opus-5',
    why: 'حكمٌ على أسبوعٍ كامل — يقرّر ما يُنفَق بعده، فالخطأ فيه أغلى من ثمنه',
  },
  image: {
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    why: 'لا بديل عند Anthropic — وصورةٌ تصاحب النصّ تُرى أكثر',
  },
  /**
   * **والفيديو كان مثبَّتا في الشيفرة** (D-091).
   *
   * `animateForPost` تنادي `alibaba/hh1-i2v` حرفا، **فاختيارُ المالك في
   * اللوحة لا يصل إليه**. وهي علّةُ D-079 نفسُها في مكانٍ لم يُفتَّش:
   * يُقرأ ولا يُطاع.
   *
   * **وهو أغلى ما يُنادى في النظام** (M-16: سعرُه لم يُقرأ بعد) — فأن
   * يُختار نموذجُه من اللوحة أولى لا أدنى.
   */
  video: {
    provider: 'cloudflare',
    model: 'alibaba/hh1-i2v',
    why: 'صورةٌ ← مقطعٌ رأسيّ: نرى الصورةَ ونعتمدها قبل أن نُنفق على تحريكها',
  },
  /**
   * قراءةُ صورةٍ نصّا — **خطوةٌ قبل التحليل لا تحليلٌ ثانٍ** (D-124).
   *
   * وملفُّ Drive الذي صورةٌ كان يُردّ بلا قراءة، **وعرضٌ مصوَّرٌ أو
   * مخطّطٌ يحمل ما يستحقّ النشر**.
   *
   * **وافتراضُه Gemini لأنّه يعمل، لا لأنّه أوّلُ ما خطر.** مدمَجٌ في
   * `0005` بلهجةٍ موحَّدةٍ وعنوانٍ حقيقيّ، **ويقرأ الصور**. وAnthropic
   * تقرؤها كذلك لكنّ صياغتَها غيرُ هذه اللهجة، **وافتراضٌ لا يعمل
   * بالشيفرة التي تحته أسوأُ من افتراضٍ فارغ**.
   *
   * **وDeepSeek تُوجَّه إليها من اللوحة** متى ضُبط مفتاحُها (M-21).
   */
  vision: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    why: 'قراءةُ الصور نصّا — والوصفُ وحدَه، والحكمُ يبقى عند التحليل',
  },
}

/** ما بُني فعلا. الباقي في السجلّ تصريحٌ بالنيّة لا وعدٌ بالعمل. */
export const IMPLEMENTED: ReadonlySet<TaskName> = new Set<TaskName>([
  'analyze', 'draft', 'image', 'plan', 'video', 'vision',
])

export function isConfigured(env: Partial<Env>, provider: ProviderName): boolean {
  const value = env[PROVIDERS[provider].secret]
  return typeof value === 'string' && value.length > 0
}

export interface RouteStatus extends Route {
  readonly task: TaskName
  readonly implemented: boolean
  /** الطريق معطّل إن لم يكن مزوّده مضبوطا — يُقال بدل أن يُكتشف عند أوّل نداء. */
  readonly ready: boolean
}

export function routeStatuses(env: Partial<Env>): RouteStatus[] {
  return (Object.keys(ROUTES) as TaskName[]).map((task) => {
    const route = ROUTES[task]
    const implemented = IMPLEMENTED.has(task)
    return {
      task,
      ...route,
      implemented,
      ready: implemented && isConfigured(env, route.provider),
    }
  })
}
