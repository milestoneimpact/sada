/**
 * النطاقات — ما يُطلَب، ومن يمنحه، وما ينكسر إن نقص.
 *
 * ## العلّةُ التي وُلد منها هذا الملفّ
 *
 * طُلبت ثلاثةُ نطاقاتٍ من LinkedIn دفعةً واحدة، فردّت الشاشةُ
 * <span dir="ltr">unauthorized_scope_error</span> **قبل أن تُعرَض على
 * المالك أصلا** — ووصل إلى اللوحة سطرُ JSON عارٍ لا يقول أيَّ نطاقٍ رُفض
 * ولا كيف يُفتَح.
 *
 * والعلّةُ ليست في الرمز: **نطاقٌ لا يُمنَح بمفتاح، بل بمنتَجٍ يُضاف في
 * بوّابة المنصّة.** فالشيفرةُ لا تصلحه، وأقصى ما تفعله ثلاثة:
 *
 * ١ · **أن تسمّي بالضبط ما نقص** ومن يمنحه — لا أن تقول «فشل».
 * ٢ · **ألّا تُغلق الباب**: الهويّةُ وحدها تُربَط بلا نطاق النشر، فيرى
 *     المالكُ حسابَه مربوطا اليوم ويُكمل النشرَ غدا.
 * ٣ · **أن تحرس النشر بما مُنح فعلا** لا بما طُلب: رمزٌ بلا
 *     `w_member_social` ينشر فيردّ 403 بعد أن حُسبت التكلفة.
 *
 * ## ولماذا تُقرأ الممنوحةُ لا تُفترَض المطلوبة
 *
 * المنصّةُ تعيد `scope` في جواب الرمز — وهو **ما مُنح**، وقد يكون أقلَّ
 * ممّا طُلب بلا خطأ. فمن بنى على المطلوب ظنّ أنّه يستطيع النشر حتّى
 * جاءت أوّلُ محاولةٍ فكذّبته.
 */
import type { Platform } from './providers'

/** لماذا يُطلَب هذا النطاق — والرتبةُ تقرّر أيُتنازل عنه. */
export type ScopeNeed =
  /** بدونه لا هويّةَ ولا حساب: لا ربطَ أصلا. */
  | 'identity'
  /** بدونه يُربَط الحسابُ ولا يُنشَر. */
  | 'publish'
  /** بدونه يُنشَر نصٌّ ولا تُرفَع صورة. */
  | 'media'
  /** بدونه ينتهي الإذنُ فيُطلَب الربطُ من جديد كلَّ شهرين. */
  | 'refresh'

export interface ScopeSpec {
  readonly name: string
  readonly need: ScopeNeed
  /** المنتَجُ أو الإعدادُ الذي يمنحه في بوّابة المنصّة — بالاسم كما يُرى. */
  readonly grantedBy: string
  /** أين يُضاف بالضبط. */
  readonly where: string
  /** ما يفتحه في صدى. */
  readonly enables: string
}

const LINKEDIN_SCOPES: readonly ScopeSpec[] = [
  {
    name: 'openid',
    need: 'identity',
    grantedBy: 'Sign In with LinkedIn using OpenID Connect',
    where: 'تبويب Products ← Request access — يُمنَح فورا بلا مراجعة',
    enables: 'التعرّفُ على حسابك',
  },
  {
    name: 'profile',
    need: 'identity',
    grantedBy: 'Sign In with LinkedIn using OpenID Connect',
    where: 'تبويب Products ← Request access — يُمنَح فورا بلا مراجعة',
    enables: 'قراءةُ اسمك لتُعرَض البطاقةُ باسمٍ لا بمعرّف',
  },
  {
    name: 'w_member_social',
    need: 'publish',
    grantedBy: 'Share on LinkedIn',
    where: 'تبويب Products ← Request access — يُمنَح فورا بلا مراجعة',
    enables: 'النشرُ باسمك، ورفعُ الصور مع المنشور',
  },
]

const X_SCOPES: readonly ScopeSpec[] = [
  {
    name: 'users.read',
    need: 'identity',
    grantedBy: 'User authentication settings',
    where: 'إعداداتُ التطبيق ← User authentication settings ← Set up',
    enables: 'التعرّفُ على حسابك',
  },
  {
    name: 'tweet.read',
    need: 'identity',
    grantedBy: 'App permissions: Read',
    where: 'User authentication settings ← App permissions',
    enables: 'قراءةُ منشوراتك لعرضها في شاشة المنصّة',
  },
  {
    name: 'tweet.write',
    need: 'publish',
    grantedBy: 'App permissions: Read and write',
    where: 'User authentication settings ← App permissions ← Read and write',
    enables: 'النشرُ باسمك',
  },
  {
    name: 'media.write',
    need: 'media',
    grantedBy: 'App permissions: Read and write',
    where: 'User authentication settings ← App permissions ← Read and write',
    enables: 'رفعُ الصور مع المنشور',
  },
  {
    name: 'offline.access',
    need: 'refresh',
    grantedBy: 'OAuth 2.0 — يُطلَب في الرابط ولا يحتاج إعدادا',
    where: 'لا يحتاج شيئا في البوّابة',
    enables: 'تجديدُ الإذن تلقائيّا — وبدونه يتوقّف النشر عند انتهائه',
  },
]

export const SCOPES: Readonly<Record<Platform, readonly ScopeSpec[]>> = {
  linkedin: LINKEDIN_SCOPES,
  x: X_SCOPES,
}

/**
 * مجموعتان لا واحدة.
 *
 * `full` هو الأصل. و`identity` **مخرَجُ نجاةٍ لا خيارٌ يُقدَّم ابتداءً**:
 * يُعرَض بعد أن ترفض المنصّةُ النطاقَ الكامل، فيُربَط الحسابُ اليوم
 * ويُكمَل غدا — بدل شاشةِ خطأٍ لا مخرجَ منها.
 */
export type ScopeMode = 'full' | 'identity'

export function scopeSet(platform: Platform, mode: ScopeMode = 'full'): readonly string[] {
  const all = SCOPES[platform]
  const wanted = mode === 'identity' ? all.filter((s) => s.need === 'identity') : all
  return wanted.map((s) => s.name)
}

/** يقرأ `scope` كما ردّته المنصّة: مفصولٌ بمسافةٍ أو بفاصلة. */
export function parseGranted(raw: string): readonly string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export interface Capability {
  readonly spec: ScopeSpec
  readonly granted: boolean
}

/**
 * ما يستطيعه هذا الحسابُ فعلا.
 *
 * ويُقرأ من الممنوح لا من المطلوب. ونطاقٌ منحته المنصّةُ ولم نطلبه
 * **لا يُخفى**: قد يفسّر سلوكا لا نفهمه، وإخفاؤه يجعل الشاشةَ تكذب.
 */
export function capabilities(platform: Platform, grantedRaw: string): Capability[] {
  const granted = new Set(parseGranted(grantedRaw))
  const known = SCOPES[platform]
  const rows: Capability[] = known.map((spec) => ({ spec, granted: granted.has(spec.name) }))

  for (const extra of granted) {
    if (known.some((s) => s.name === extra)) continue
    rows.push({
      granted: true,
      spec: {
        name: extra,
        need: 'identity',
        grantedBy: 'مُنح ولم يُطلَب',
        where: '—',
        enables: 'نطاقٌ منحته المنصّةُ ولا يستعمله صدى',
      },
    })
  }
  return rows
}

/**
 * أفي الممنوح نطاقٌ بعينه؟
 *
 * سؤالٌ أدقُّ من `canPublish`: القراءةُ تحتاج نطاقا واحدا لا مجموعةً،
 * ودورةُ القياس تسأل عنه قبل النداء — فرمزٌ بلا نطاقِ قراءةٍ يُردّ 403
 * **بعد** أن تُحسَب تكلفتُه (D-008 · D-019).
 */
export function hasScope(grantedRaw: string, name: string): boolean {
  return parseGranted(grantedRaw).includes(name)
}

/**
 * أيستطيع هذا الرمزُ النشرَ؟
 *
 * يُسأل **قبل** النداء لا بعده — كما وقع حارسُ الإدارة قبل نداء Google
 * (D-019). فمحاولةُ نشرٍ برمزٍ ناقص تُحسَب تكلفتُها وتُستهلَك حصّتُها ثمّ
 * تردّ 403، وتُكتب في `publish_attempts` فشلا غامضا.
 */
export function canPublish(platform: Platform, grantedRaw: string): boolean {
  const granted = new Set(parseGranted(grantedRaw))
  return SCOPES[platform]
    .filter((s) => s.need === 'publish')
    .every((s) => granted.has(s.name))
}

/** أيستطيع رفعَ صورة؟ LinkedIn يرفعها بنطاق النشر نفسه، و X بنطاقٍ ثانٍ. */
export function canUploadMedia(platform: Platform, grantedRaw: string): boolean {
  const granted = new Set(parseGranted(grantedRaw))
  const media = SCOPES[platform].filter((s) => s.need === 'media')
  return canPublish(platform, grantedRaw) && media.every((s) => granted.has(s.name))
}

/** ما نقص من النطاقات المطلوبة — أسماءٌ ومصادرُها، لا رسالةُ فشل. */
export function missingScopes(platform: Platform, grantedRaw: string): ScopeSpec[] {
  const granted = new Set(parseGranted(grantedRaw))
  return SCOPES[platform].filter((s) => !granted.has(s.name))
}
