/**
 * القنوات — سجلٌّ صادقٌ لما يُنشَر عليه.
 *
 * ## لماذا لا تُضاف قناةٌ من اللوحة، والمزوّدُ يُضاف
 *
 * سُئلتُ قبلُ: «لماذا لا أضيف أيّ AI كما أريد من الداشبورد؟» — وكان
 * السؤال في محلّه، فبُني ذلك في D-031. **والقنواتُ ليست كذلك، والفرق
 * ليس كسلا.**
 *
 * المزوّدون اجتمعوا على لهجةٍ واحدة (`chat/completions`)، فسائقٌ واحد
 * غطّى ستّةً منهم وستّةً لم تُخترع بعد. **والمنصّاتُ الاجتماعيّة لا لهجةَ
 * لها مشتركة**: نشرُ LinkedIn ثلاثةُ نداءاتٍ بترويسةٍ خاصّة، و X مختلفٌ
 * عنه جذريّا، و Snapchat لا يشبه أيّا منهما. فحقلُ «عنوان الـ API» لا
 * يكفي — **ولوحةٌ تعرض حقلا يوهم بأنّه يكفي تكذب.**
 *
 * فالحدُّ هنا صادق، ويُقال في الواجهة نصّا: «لم يُبنَ سائقُها».
 */
import type { Db } from './tokens'

/** ما بُني له سائقٌ فعلا. يقابل `CHECK (platform IN (...))` في المخطّط. */
export type BuiltPlatform = 'linkedin' | 'x'

export interface ChannelSpec {
  readonly id: string
  readonly label: string
  /** أبُني له سائقٌ ينشر؟ */
  readonly built: boolean
  /** أسرارُ Worker التي يحتاجها الربط. */
  readonly secrets: readonly string[]
  /** مهمّةُ المالك التي تفتحه، إن كانت. */
  readonly task: string | null
  /** ما يُقال لمن ينتظره. */
  readonly note: string
}

/**
 * السجلّ. والمبنيّ أوّلا، ثمّ ما ينتظر سائقا — بترتيبٍ ثابت لا يتبدّل
 * بين تحميلين، فالعينُ تحفظ مواضعها.
 */
/**
 * دليلُ ضبطِ التطبيق — **بجانب الحقل لا في وثيقةٍ أخرى**.
 *
 * مالكٌ يفتح اللوحة فيجد حقلين فارغين ثمّ يبحث في ملفٍّ عن معناهما
 * يتوقّف. والخطواتُ هنا بأسماء الأزرار كما تُرى على الشاشة، ومعها
 * **ما يعني النجاح** — فلا يُترك أحدٌ يظنّ أنّه أتمّ وقد نقص.
 */
export interface SetupGuide {
  /** بوّابةُ المطوّرين — يُفتَح في تبويبٍ آخر. */
  readonly portal: string
  readonly portalLabel: string
  /** خطواتٌ قبل السرّين — كلٌّ لها سببُها. */
  readonly before: readonly { readonly what: string; readonly why: string }[]
  /** أين يجد المعرّف والسرّ بالضبط. */
  readonly whereId: string
  readonly whereSecret: string
  /** علامةُ النجاح — تُرى ولا تُفترَض. */
  readonly success: string
  /**
   * وما يقع إن فشل — **بالرسالة كما تُرى، لا بوصفٍ عامّ**.
   *
   * وُجد بعد أن ردّت LinkedIn <span dir="ltr">unauthorized_scope_error</span>
   * على أوّل ربطٍ حقيقيّ، ولم يكن في الدليل سطرٌ واحدٌ يفسّرها. ودليلٌ
   * يقول «إن نجح» ولا يقول «إن فشل» يترك أحوجَ الحالين بلا شيء.
   */
  readonly failure: string
  /** ما يجب أن يبقى صحيحا وإلّا فشل الربط بخطأٍ غامض. */
  readonly gotcha: string
}

export const SETUP: Readonly<Record<string, SetupGuide>> = {
  linkedin: {
    portal: 'https://www.linkedin.com/developers/apps',
    portalLabel: 'LinkedIn Developers',
    before: [
      {
        what: 'تبويب Auth ← Authorized redirect URLs ← الصق رابط العودة أدناه',
        why: 'بلا رابطِ عودةٍ مسجَّل تردّ LinkedIn الطلبَ <b>قبل أن تعرض شاشة الإذن</b>. وهذا عائقٌ لا يُصلحه سرّ.',
      },
      {
        what: 'تبويب Products ← Request access على «Share on LinkedIn»',
        why: 'هو الذي يمنح <span class="mono">w_member_social</span> — <b>ويُمنَح فورا بلا مراجعة</b>. وبدونه يعمل الربطُ ولا يعمل النشر.',
      },
      {
        what: 'وأضف «Community Management API» إن أردت صفحةَ الشركة',
        why: 'مراجعةٌ طويلة، <b>ولا تنتظرها للحساب الشخصيّ</b> — فهي لصفحة الشركة وحدها.',
      },
    ],
    whereId: 'تبويب Auth ← Application credentials ← Client ID: Primary',
    whereSecret: 'تحته مباشرةً — اضغط 👁 ليظهر، ثمّ 📋 لتنسخه. ولا تضغط «Generate a new Client Secret».',
    success: 'تحت OAuth 2.0 scopes في تبويب Auth تظهر ثلاثةٌ: openid و profile و w_member_social.',
    failure:
      'تعود الشاشةُ بـ <span class="mono">unauthorized_scope_error</span> — ' +
      '<b>ومعناها أنّ نطاقا طُلب ولم يُمنَح لتطبيقك</b>، لا أنّ السرَّ خطأ. ' +
      'ومصدرُه تبويب Products: <span class="mono">w_member_social</span> من ' +
      '«Share on LinkedIn»، و <span class="mono">openid</span> و ' +
      '<span class="mono">profile</span> من «Sign In with LinkedIn using OpenID Connect». ' +
      'وصدى يعرض عندها ما نقص بالاسم، ويعرض <b>ربطَ الهويّة وحدها</b> لتمضي اليوم وتُكمل غدا.',
    gotcha:
      'رابطُ العودة يُطابَق حرفا بحرف: شرطةٌ في آخره أو http بدل https تُسقط الربط.',
  },
  x: {
    portal: 'https://developer.x.com/en/portal/dashboard',
    portalLabel: 'X Developer Portal',
    before: [
      {
        what: 'Billing ← اشترِ رصيدا (عشرة دولارات تكفي شهورا)',
        why: 'X يحاسب على كلّ منشور. <b>وبلا رصيدٍ ينجح الربطُ ويفشل أوّلُ نشر.</b>',
      },
      {
        what: 'User authentication settings ← Set up ← App permissions: <b>Read and write</b>',
        why: 'رفعُ الصور يوجب <span class="mono">media.write</span>، <b>وتطبيقٌ بصلاحية قراءةٍ فقط لا يمنحه</b> — فيفشل الربط بخطأٍ غامض.',
      },
      {
        what: 'وفي الشاشة نفسها: Type of App = Web App، و Callback URI = رابط العودة أدناه',
        why: '<b>لا يوجد OAuth 2.0 Client ID أصلا</b> قبل أن تُكمل هذه الشاشة.',
      },
    ],
    whereId: 'تبويب Keys and tokens ← قسم OAuth 2.0 Client ID and Client Secret',
    whereSecret:
      'في القسم نفسه. <b>و X يعرضه مرّةً واحدةً عند إنشائه</b> — فإن لم تحفظه اضغط Regenerate، ولا ضرر ما دام لم يُربَط حساب.',
    success: 'تظهر بطاقةُ X هنا «جاهزةٌ للربط» بزرٍّ يعمل، ويُظهر /ready أنّ سرَّيها لم يعودا ناقصين.',
    failure:
      'يعود الربطُ بـ <span class="mono">unauthorized_client</span> أو ' +
      '<span class="mono">invalid_request</span> — <b>وأكثرُه من شاشة User authentication ' +
      'settings لم تُكمَل</b>، أو App permissions تركت على Read فقط. ' +
      'وأوّلُ نشرٍ يفشل بـ 403 إن لم يكن في حساب المطوّر رصيد.',
    gotcha:
      'إن بقيت App permissions على Read فقط، يفشل الربطُ أو ينجح ولا يُرفَع وسيط.',
  },
}

export const CHANNELS: readonly ChannelSpec[] = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    built: true,
    secrets: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
    task: 'M-02',
    note: 'النشرُ باسمك أو باسم صفحة. ويحتاج موافقةَ LinkedIn على Community Management API (M-03) للصفحات.',
  },
  {
    id: 'x',
    label: 'X',
    built: true,
    secrets: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
    task: 'M-04',
    note: 'النشرُ يحتاج رصيدا في حساب المطوّر — وكلّ طلبٍ يُحاسَب عليه.',
  },
  {
    id: 'snapchat',
    label: 'Snapchat',
    built: false,
    secrets: [],
    task: null,
    note: 'واجهةُ نشرِها لا تشبه غيرَها، فتحتاج سائقا يُكتب لها وحدها.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    built: false,
    secrets: [],
    task: null,
    note: 'تمرّ عبر Graph API بحسابِ أعمالٍ مربوط — خطُّ ربطٍ مختلفٌ كلّيّا.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    built: false,
    secrets: [],
    task: null,
    note: 'النشرُ فيديو لا نصّ، فيحتاج رفعا مجزّأً ومعالجةَ وسائط.',
  },
  {
    id: 'threads',
    label: 'Threads',
    built: false,
    secrets: [],
    task: null,
    note: 'واجهتُها حديثةٌ وتتبدّل، ولم تستقرّ بعد استقرارا يُبنى عليه.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    built: false,
    secrets: [],
    task: null,
    note: 'رفعُ فيديو بحصّةٍ يوميّةٍ صارمة — وحسابُه غير حساب Drive.',
  },
]

export interface LinkedAccount {
  readonly id: string
  readonly platform: string
  /** `member` حسابٌ شخصيّ، `org` صفحةٌ أو شركة. */
  readonly kind: string
  readonly displayName: string
  readonly status: 'active' | 'needs_reauth' | 'revoked'
  readonly createdAt: string
}

interface AccountRow {
  id: string
  platform: string
  kind: string
  display_name: string
  status: string
  created_at: string
}

/**
 * الحسابات المربوطة.
 *
 * وجدولٌ لا يُقرأ لا يُسقط اللوحة: تُعاد قائمةٌ فارغة، فيُعرض «لا قناة
 * مربوطة» — وهو الحال الصحيح حين لا نعرف، لا رسالةُ عطل.
 */
export async function listAccounts(db: Db): Promise<LinkedAccount[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT id, platform, kind, display_name, status, created_at
           FROM accounts ORDER BY platform, created_at`,
      )
      .all<AccountRow>()
    return results.map((row) => ({
      id: row.id,
      platform: row.platform,
      kind: row.kind,
      displayName: row.display_name,
      status:
        row.status === 'needs_reauth' || row.status === 'revoked' ? row.status : 'active',
      createdAt: row.created_at,
    }))
  } catch {
    return []
  }
}

export type ChannelState =
  /** حسابٌ مربوطٌ يعمل. */
  | 'linked'
  /** مربوطٌ ورمزُه يحتاج تجديدا — يوقف النشر صامتا. */
  | 'needs_reauth'
  /** مبنيٌّ وأسرارُه حاضرة: زرُّ الربط يعمل. */
  | 'connectable'
  /** مبنيٌّ وأسرارُه ناقصة: ينتظر مهمّةَ المالك. */
  | 'awaiting_owner'
  /** لم يُبنَ له سائق. */
  | 'unbuilt'

export interface ChannelView {
  readonly spec: ChannelSpec
  readonly state: ChannelState
  readonly accounts: LinkedAccount[]
  /** ما ينقص من أسرار Worker — أسماءٌ لا قيَم. */
  readonly missing: string[]
}

/**
 * يجمع السجلَّ بالحال الحقيقيّ.
 *
 * وترتيبُ الحالات مقصود: **المربوطُ يغلب**، ثمّ ما يحتاج تجديدا، ثمّ ما
 * ينتظر. فقناةٌ مربوطةٌ وسرُّها اختفى من البيئة تُعرض «تحتاج تجديدا» لا
 * «تنتظرك» — لأنّ الحساب قائمٌ في القاعدة والمالكُ يريد أن يعرف ذلك.
 */
export function viewChannels(
  accounts: readonly LinkedAccount[],
  presentSecrets: (name: string) => boolean,
): ChannelView[] {
  return CHANNELS.map((spec) => {
    const mine = accounts.filter((a) => a.platform === spec.id && a.status !== 'revoked')
    const missing = spec.secrets.filter((name) => !presentSecrets(name))

    let state: ChannelState
    if (!spec.built) {
      state = 'unbuilt'
    } else if (mine.some((a) => a.status === 'needs_reauth')) {
      state = 'needs_reauth'
    } else if (mine.length > 0) {
      state = 'linked'
    } else if (missing.length > 0) {
      state = 'awaiting_owner'
    } else {
      state = 'connectable'
    }

    return { spec, state, accounts: mine, missing }
  })
}
