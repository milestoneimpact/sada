/**
 * ربط بيئة Worker.
 *
 * الأسرار (Secrets) لا تظهر في wrangler.toml ولا تكتب في سجل. أسماؤها هنا
 * فقط، وقيمها تدخل بـ `wrangler secret put <NAME> --env <staging|production>`.
 *
 * أنواع Cloudflare تُستورَد صراحة لا اعتمادا على النطاق العام، حتى يمر هذا
 * الملف في فحص الاختبارات أيضا وهو لا يحمّل أنواع Workers.
 */
import type {
  D1Database,
  KVNamespace,
  Queue,
  R2Bucket,
} from '@cloudflare/workers-types'
export interface Env {
  // متغيرات عادية من wrangler.toml
  readonly SADA_ENV: 'staging' | 'production'
  readonly PUBLIC_BASE_URL: string
  /** مجلد Drive الوحيد الذي يقرأه النظام. ليس سرا: معرّف لا يمنح وصولا. */
  readonly DRIVE_FOLDER_ID: string

  // موارد Cloudflare
  readonly DB: D1Database
  readonly MEDIA: R2Bucket
  /**
   * رابطُ Workers AI — **ولا مفتاحَ معه** (D-050).
   *
   * الحسابُ نفسه هو الإذن ما دام النداءُ من داخل Cloudflare. ورمزُ
   * `cfut_` لا يلزم إلّا لمن ينادي من خارجها — **فلا سرَّ يُخزَّن ولا
   * يُدوَّر ولا يُسرَّب**، وهو أفضلُ ما في هذا الخيار.
   *
   * واختياريٌّ لأنّ الرابطَ قد لا يكون مضبوطا في بيئةٍ قديمة: فيُفحَص
   * قبل الاستعمال ويُقال «غيرُ مضبوط»، ولا يسقط الطلبُ بـ 500.
   */
  readonly AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> }
  /**
   * حسابُ Workers AI حين يكون **غيرَ حساب الـ Worker**.
   *
   * ورابطُ `AI` يبلغ حسابَ الـ Worker وحده. فمَن فرّق الحسابين يضبط
   * هذين، ويُنادى عبر REST. **ومَن جمعهما لا يضبط شيئا** — ولا سرَّ
   * عنده يُدوَّر، وذاك الأفضل.
   *
   * والمعرّفُ متغيّرٌ عاديّ (يُعرَف من عنوان اللوحة)، **والرمزُ سرٌّ**.
   */
  readonly CF_AI_ACCOUNT_ID?: string
  readonly CF_AI_TOKEN?: string
  readonly KV: KVNamespace
  readonly PUBLISH_QUEUE: Queue
  readonly GENERATE_QUEUE: Queue

  // أسرار Worker
  readonly TOKEN_ENC_KEY: string
  /**
   * جهةُ التشغيل وبريدُ التواصل — يظهران في `/privacy` و `/terms`.
   *
   * متغيّرا بيئةٍ لا سرّان: كلاهما يُنشر على الصفحة نفسها، فلا معنى
   * لإخفائه. واختياريّان: ما لم يُضبَط لا يُخترَع (`legal.ts`).
   */
  readonly LEGAL_ENTITY?: string
  readonly LEGAL_CONTACT?: string
  readonly LINKEDIN_CLIENT_ID: string
  readonly LINKEDIN_CLIENT_SECRET: string
  readonly X_CLIENT_ID: string
  readonly X_CLIENT_SECRET: string
  readonly ANTHROPIC_API_KEY: string
  readonly GEMINI_API_KEY: string
  readonly GOOGLE_SA_JSON: string
  /**
   * يحرس مسارات `/admin/*`. غيابه يُغلقها لا يفتحها (D-019).
   * ليس من أسرار البوّابة: نظامٌ بلا مسار إدارةٍ ليس معطّلاً.
   */
  readonly ADMIN_TOKEN: string
}

/** أسرار المرحلة صفر: الربط والنشر. بلا واحد منها لا تُجتاز البوابة. */
export const PHASE_0_SECRETS = [
  'TOKEN_ENC_KEY',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'X_CLIENT_ID',
  'X_CLIENT_SECRET',
] as const

/** أسرار المرحلة الأولى: الفهم والتخطيط. المرحلة صفر تعمل بدونها. */
export const PHASE_1_SECRETS = ['GOOGLE_SA_JSON', 'ANTHROPIC_API_KEY'] as const

function absent(env: Partial<Env>, name: keyof Env): boolean {
  const value = env[name]
  return typeof value !== 'string' || value.length === 0
}

/**
 * الجاهزية مرحلتان لا حالة واحدة: نظام ينشر ولا يفهم ليس معطلا — هو في
 * المرحلة صفر. فيُقال ذلك بدل أن يُقال «غير جاهز» فيُظن عطلا.
 */
export interface Readiness {
  readonly phase0: boolean
  readonly phase1: boolean
  readonly missing: string[]
  readonly driveFolder: boolean
}

export function readiness(env: Partial<Env>): Readiness {
  const missing0 = PHASE_0_SECRETS.filter((name) => absent(env, name))
  const missing1 = PHASE_1_SECRETS.filter((name) => absent(env, name))
  const driveFolder = !absent(env, 'DRIVE_FOLDER_ID')
  return {
    phase0: missing0.length === 0,
    phase1: missing1.length === 0 && driveFolder,
    missing: [...missing0, ...missing1],
    driveFolder,
  }
}
