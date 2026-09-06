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

export type ProviderName = 'anthropic' | 'gemini'

/** المهامّ التي تنادي نموذجا. تُوسَّع حين تُبنى طبقةٌ جديدة. */
export type TaskName = 'analyze' | 'draft' | 'image'

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
  image: {
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    why: 'لا بديل عند Anthropic — لم تُبنَ بعد',
  },
}

/** ما بُني فعلا. الباقي في السجلّ تصريحٌ بالنيّة لا وعدٌ بالعمل. */
export const IMPLEMENTED: ReadonlySet<TaskName> = new Set<TaskName>(['analyze', 'draft'])

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
