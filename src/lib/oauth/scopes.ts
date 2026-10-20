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
    enables: 'التعرّف على حسابك',
  },
  {
    name: 'profile',
    need: 'identity',
    grantedBy: 'Sign In with LinkedIn using OpenID Connect',
    where: 'تبويب Products ← Request access — يُمنَح فورا بلا مراجعة',
    enables: 'قراءة اسمك لتُعرَض البطاقة باسم لا بمعرّف',
  },
  {
    name: 'w_member_social',
    need: 'publish',
    grantedBy: 'Share on LinkedIn',
    where: 'تبويب Products ← Request access — يُمنَح فورا بلا مراجعة',
    enables: 'النشر باسمك، ورفع الصور مع المنشور',
  },
]

const X_SCOPES: readonly ScopeSpec[] = [
  {
    name: 'users.read',
    need: 'identity',
    grantedBy: 'User authentication settings',
    where: 'إعدادات التطبيق ← User authentication settings ← Set up',
    enables: 'التعرّف على حسابك',
  },
  {
    name: 'tweet.read',
    need: 'identity',
    grantedBy: 'App permissions: Read',
    where: 'User authentication settings ← App permissions',
    enables: 'قراءة منشوراتك لعرضها في شاشة المنصّة',
  },
  {
    name: 'tweet.write',
    need: 'publish',
    grantedBy: 'App permissions: Read and write',
    where: 'User authentication settings ← App permissions ← Read and write',
    enables: 'النشر باسمك',
  },
  {
    name: 'media.write',
    need: 'media',
    grantedBy: 'App permissions: Read and write',
    where: 'User authentication settings ← App permissions ← Read and write',
    enables: 'رفع الصور مع المنشور',
  },
  {
    name: 'offline.access',
    need: 'refresh',
    grantedBy: 'OAuth 2.0 — يُطلَب في الرابط ولا يحتاج إعدادا',
    where: 'لا يحتاج شيئا في البوّابة',
    enables: 'تجديد الإذن تلقائيّا — وبدونه يتوقّف النشر عند انتهائه',
  },
]

/**
 * YouTube — عبر Google OAuth.
 *
 * **ونطاقُ الرفع حسّاسٌ عند Google**: تطبيقٌ يطلبه يبقى في وضع
 * `Testing` بمئةِ مستخدمٍ ورمزٍ يسقط كلَّ سبعة أيّام، حتّى تُجاز
 * المراجعة. **وهذا يُقال قبل الربط لا بعد أسبوع.**
 */
const YOUTUBE_SCOPES: readonly ScopeSpec[] = [
  {
    name: 'https://www.googleapis.com/auth/youtube.readonly',
    need: 'identity',
    grantedBy: 'YouTube Data API v3',
    where: 'Google Cloud ← APIs & Services ← Library ← فعّل YouTube Data API v3',
    enables: 'قراءة اسم قناتك ومعرّفِها',
  },
  {
    name: 'https://www.googleapis.com/auth/youtube.upload',
    need: 'publish',
    grantedBy: 'YouTube Data API v3 — ونطاق حسّاس يحتاج مراجعة Google',
    where: 'OAuth consent screen ← Data access ← Add scopes ← ثمّ Publish app',
    enables: 'رفع المقاطع إلى قناتك',
  },
]

/**
 * TikTok — Content Posting API.
 *
 * **وأوّلُ نشرٍ يقع مسوّدةً في التطبيق لا منشورا**، حتّى تُجاز مراجعةُ
 * المحتوى. وهذا حدُّ المنصّة لا نقصٌ عندنا.
 */
const TIKTOK_SCOPES: readonly ScopeSpec[] = [
  {
    name: 'user.info.basic',
    need: 'identity',
    grantedBy: 'Login Kit',
    where: 'لوحة المطوّرين ← تطبيقك ← Add products ← Login Kit',
    enables: 'التعرّف على حسابك واسمِه',
  },
  {
    name: 'video.upload',
    need: 'publish',
    grantedBy: 'Content Posting API',
    where: 'Add products ← Content Posting API',
    enables: 'رفع المقطع مسوّدةً إلى تطبيق TikTok لتنشره بيدك',
  },
  {
    name: 'video.publish',
    need: 'media',
    grantedBy: 'Content Posting API — بعد Audit المحتوى',
    where: 'Content Posting API ← Direct Post ← اطلب المراجعة',
    enables: 'النشر مباشرةً بلا فتح التطبيق — ويحتاج إجازة TikTok',
  },
]

/*
 * Instagram — **وطريقان إلى النطاقات نفسِها تقريبا** (D-121).
 *
 * `Instagram Business Login` يعطي `instagram_business_*` مباشرةً بحسابٍ
 * احترافيّ. و`Facebook Login for Business` يعطي `instagram_basic` و
 * `instagram_content_publish` **عبر صفحةٍ مربوطة**.
 *
 * **والمشترَكُ بينهما أنّ النشرَ يوجب وسيطا**: لا منشورَ نصّيٌّ في
 * Instagram — صورةٌ أو مقطع.
 */
const INSTAGRAM_SCOPES: readonly ScopeSpec[] = [
  {
    name: 'instagram_business_basic',
    need: 'identity',
    grantedBy: 'Instagram — API setup with Instagram business login',
    where: 'لوحة Meta ← تطبيقُك ← Instagram ← API setup ← أضف الحساب',
    enables: 'التعرّف على حسابك واسمِه',
  },
  {
    name: 'instagram_business_content_publish',
    need: 'publish',
    grantedBy: 'Instagram — API setup with Instagram business login',
    where: 'النطاق نفسُه في شاشة الإعداد — **ويحتاج حسابا احترافيّا**',
    enables: 'نشر صورة أو مقطع باسمك',
  },
]

/**
 * والطريقُ الثاني — **عبر صفحة فيسبوك**.
 *
 * نطاقاتُه غيرُ نطاقاتِ الأوّل اسما، **والوجهةُ واحدة**. ويوجب صفحةً
 * مربوطةً بالحساب، **ومراجعةَ تطبيقٍ أطول** — ويعطي إحصاءاتٍ أوسعَ
 * وإدارةَ تعليقات.
 */
const INSTAGRAM_PAGE_SCOPES: readonly ScopeSpec[] = [
  {
    name: 'instagram_basic',
    need: 'identity',
    grantedBy: 'Facebook Login for Business',
    where: 'لوحة Meta ← Use cases ← أضف النطاق',
    enables: 'التعرّف على حساب Instagram المربوط بالصفحة',
  },
  {
    name: 'pages_show_list',
    need: 'identity',
    grantedBy: 'Facebook Login for Business',
    where: 'النطاق نفسُه — **ولا يُعرَف الحساب بدونه**',
    enables: 'قراءة صفحاتك لتُعرَف أيُّها يحمل حساب Instagram',
  },
  {
    name: 'instagram_content_publish',
    need: 'publish',
    grantedBy: 'Facebook Login for Business',
    where: 'Use cases ← Instagram ← أضف النطاق ثمّ اطلب المراجعة',
    enables: 'نشر صورة أو مقطع على الحساب المربوط',
  },
]

/**
 * نطاقاتُ الطريق الثاني — **تُعرَض في الشاشة ولا تدخل الرابط**.
 *
 * فالمنصّةُ واحدةٌ في `SCOPES`، **والطريقُ يُختار عند الربط**. ولو
 * دخلت المجموعتان رابطا واحدا لرُدّ الإذنُ كلُّه: **نطاقٌ لا يعرفه
 * المزوّدُ يُسقط الطلبَ لا يُتجاهَل**.
 */
export const INSTAGRAM_VIA_PAGE: readonly ScopeSpec[] = INSTAGRAM_PAGE_SCOPES

export const SCOPES: Readonly<Record<Platform, readonly ScopeSpec[]>> = {
  linkedin: LINKEDIN_SCOPES,
  x: X_SCOPES,
  youtube: YOUTUBE_SCOPES,
  tiktok: TIKTOK_SCOPES,
  instagram: INSTAGRAM_SCOPES,
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
        enables: 'نطاق منحته المنصّة ولا يستعمله صدى',
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
