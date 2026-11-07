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
  readonly AI?: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>
    /** قارئُ المستندات (D-284): PDF وWord وExcel وHTML نصًّا — بلا كلفةٍ للمستندات. */
    toMarkdown?: import('./lib/sources/ingest').ToMarkdown
  }
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
  /**
   * رمزُ Browser Rendering — **لتركيب النصّ العربيّ فوق الصورة** (D-085).
   *
   * وهو **غيرُ `CF_AI_TOKEN`**: صلاحيّتُه `Browser Rendering · Edit` لا
   * `Workers AI · Read`، ورمزٌ يحمل أحدَهما يُردّ على نهاية الآخر. ومن
   * جمعهما في رمزٍ واحدٍ بصلاحيّتين وضع القيمةَ نفسَها في الاثنين.
   *
   * **وغيابُه ليس عطلا**: تخرج الصورةُ بلا نصّ، ولا يقع نداءٌ ولا كلفة.
   */
  readonly CF_BROWSER_TOKEN?: string
  readonly KV: KVNamespace
  readonly PUBLISH_QUEUE: Queue
  readonly GENERATE_QUEUE: Queue
  /**
   * ربطُ `send_email` لرمز الدخول (D-245) — مقيَّدٌ بعنوان المالك في `wrangler.toml`.
   * وغيابُه لا يفتح شيئا: لا رمزَ يُرسَل، والدخولُ بمفتاح المرور باقٍ.
   */
  readonly EMAIL?: import('./lib/mail/send').MailBinding
  /**
   * ‏ربطُ `version_metadata` (D-319): **أيُّ نسخةٍ من الـ Worker تخدم هذا الطلب** — المعرّفُ نفسُه الذي يطبعه `wrangler deploy`.
   * ‏يقوله `/ready` ليقارنه سيرُ النشر بما نشره للتوّ: بناءٌ قديمٌ لم يُستبدَل كان يمرّ بكلّ فحص. واختياريٌّ لأنّ الاختبارَ
   * ‏و`wrangler dev` بلا نسخة، فيُقال `null` ولا يُخترَع معرّف.
   */
  readonly CF_VERSION_METADATA?: { readonly id: string; readonly tag: string; readonly timestamp: string }

  // أسرار Worker
  readonly TOKEN_ENC_KEY: string
  /**
   * **المفتاحُ السابق أثناء التدوير وحده** (D-318) — يُقرأ به ما شُفِّر قبل التبديل، ولا يُكتب به شيء. ودورةُ التدوير
   * تعيد تشفيرَ ما بقي عليه بالحاليّ، ثمّ يُحذف حين يقول `/admin/ready` إنّه لم يبقَ شيء (`keys.pending = 0`).
   */
  readonly TOKEN_ENC_KEY_PREV?: string
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

/**
 * الجاهزيّةُ بعد الخزانة — **وسرٌّ سُدّ من اللوحة سرٌّ حاضر** (D-095).
 *
 * ## العلّة المقيسة
 *
 * `readiness` تقرأ بيئةَ Worker وحدَها، وهذا صوابُها: دالّةٌ خالصةٌ لا
 * تمسّ قاعدة. **وخزانةُ المزوّدين (D-042) تسدّ أكثرَها من اللوحة** —
 * مفاتيحُ Anthropic وسرّا LinkedIn و X تُحفَظ مشفّرةً في D1 لا في أسرار
 * Worker.
 *
 * فكان `‎/ready` يعرف ذلك ويحسبه (`configured_in_vault`) **ثمّ لا يردّه
 * إلى الحكم**. فخرج جوابٌ يناقض نفسَه في سطرين:
 *
 *     "missing_secrets": []        ← لا شيءَ ناقص
 *     "phase_0": false, "ready": false   ← وغيرُ جاهز
 *
 * وردَّ ٥٠٣. **وسجلُّ النشر يطبع «أسرارٌ ما تزال ناقصة» ثمّ يعدّد فراغا.**
 *
 * ## ولماذا هذا أخطرُ من رقمٍ خاطئ
 *
 * إشارةٌ حمراءُ دائما تُتجاهَل — وهي حجّةٌ مكتوبةٌ في سير النشر نفسِه:
 * «ولو بقي كلُّ نشرٍ أحمرَ طوالها لصار الأحمرُ عادةً تُتجاهَل، وحين يقع
 * عطلٌ حقيقيٌّ لا يميّزه أحد».
 *
 * **فالحكمُ يُعاد بعد أن يُعرَف ما سُدّ**، والدالّةُ خالصةٌ كسابقتها:
 * تأخذ ما قِيس وتردّ الحكم، ولا تنادي أحدا.
 */
export function afterVault(state: Readiness, covered: readonly string[]): Readiness {
  const sealed = new Set(covered)
  const left = state.missing.filter((name) => !sealed.has(name))
  const remains = (names: readonly string[]): boolean =>
    names.every((name) => !left.includes(name))
  return {
    phase0: remains(PHASE_0_SECRETS),
    // **والمجلَّدُ يبقى شرطا**: لا خزانةَ تسدّ متغيّرَ بيئة
    phase1: remains(PHASE_1_SECRETS) && state.driveFolder,
    missing: left,
    driveFolder: state.driveFolder,
  }
}
