/**
 * ما يقع على المالك — **سجلٌّ واحدٌ تقرأ منه الشاشةُ والوثيقة.**
 *
 * ## لماذا في الشيفرة لا في وثيقةٍ وحدها
 *
 * قائمةٌ مكتوبةٌ بيدٍ تشيخ — **وقد شاخت فعلا**: `docs/STATUS.md` وقف
 * عند D-044 ثلاثةَ عشرَ قرارا (D-056)، و`M-08` و`M-09` يُشار إليهما
 * ولا صفحةَ لهما.
 *
 * فالسجلُّ هنا، **ويُقاس بحارسٍ** يردّ رمزا في الشيفرة بلا صفحةٍ في
 * الوثيقة، وصفحةً بلا صفٍّ هنا.
 *
 * ## وحالُ كلّ مهمّةٍ يُشتقّ لا يُكتَب
 *
 * «تمّت» تُكتب بيدٍ **فتبقى مكتوبةً بعد أن تنقض**. فما أمكن اشتقاقُه
 * من البيئة أو القاعدة يُشتقّ، **وما لا يُعرَف يُقال «لا يُعرَف من
 * هنا»** — ولا علامةَ صحٍّ على ما لم يُتحقَّق منه (D-061).
 */
import { slideGate } from './image/gate'

/** ماذا يفتح إنجازُ المهمّة — وبه تُرتَّب، لا بترقيمها. */
export type Unblocks =
  /** بوّابةُ مرحلةٍ لا تُجتاز بدونها. */
  | 'gate'
  /** قدرةٌ تُفتَح، ولا شيءَ ينكسر بتركها. */
  | 'capability'
  /** حارسٌ لا يعمل بدونها — والنظامُ يعمل ويبدو سليما. */
  | 'guard'

export interface OwnerTask {
  readonly code: string
  readonly title: string
  /** جملةٌ واحدة: **ما يقع إن تُرك** — العنصرُ السادس في CLAUDE.md. */
  readonly ifLeft: string
  readonly unblocks: Unblocks
  /**
   * كيف يُعرَف أنّها تمّت — **أو أنّها لا تُعرَف من هنا**.
   *
   * دالّةٌ تقرأ ما هو متاح. و`null` تعني **لا يُعرَف**، لا «لم تتمّ».
   */
  readonly done: (facts: OwnerFacts) => boolean | null
  /**
   * سطرٌ يقول **ما قِيس** — كما تحمل بنودُ البوّابات دليلَها (D-064).
   *
   * وُجد لأنّ «تمّت» وحدها تكذب على مهمّةٍ **دوريّة**: مراجعةُ رقمٍ لم
   * تقع بعد، ولكنّها **ليست مستحقّةً** — والفرقُ يُقال لا يُترَك
   * للقارئ يخمّنه (D-072).
   */
  readonly evidence?: (facts: OwnerFacts) => string
  /**
   * أسرارُ Worker التي تُغلق المهمّةَ — **فالأمرُ يُنسَخ من الصفّ** (D-126).
   *
   * مهمّةٌ ثمنُها أمرُ `wrangler` واحدٌ تحمل زرَّ نسخٍ كما يحمله رابطُ
   * العودة (D-042): الاسمُ يُكتب هنا مرّةً، والأمرُ يُبنى منه للبيئة التي
   * تُفتَح منها الشاشة. **أسماءٌ لا قيَم** — كما في كلّ موضع (D-005).
   */
  readonly secrets?: readonly string[]
  /**
   * أين يُتَّخذ القرار — **رابطٌ إلى موضعه لا شرحٌ له** (D-130). مهمّةٌ
   * ثمنُها ضغطةٌ في اللوحة تحمل بابَها، كما تحمل مهمّةُ السرّ أمرَها.
   */
  readonly go?: string
  /** اسمُ الباب على الزرّ — **فزرّان باسمٍ واحدٍ إلى بابين يكذبان** (D-122). */
  readonly goLabel?: string
}

/** أمرُ ضبطِ سرٍّ واحد — بصيغة `MANUAL-TASKS.md` حرفًا. */
export function secretCommand(name: string, env: string): string {
  return `npx wrangler secret put ${name} --env ${env}`
}

/** الحقائقُ التي تُشتقّ منها الحالُ — تُجمَع مرّةً وتُمرَّر. */
export interface OwnerFacts {
  /** أسماءُ أسرار Worker المضبوطة — أسماءٌ لا قيَم (D-005). */
  readonly secrets: ReadonlySet<string>
  /** منصّاتٌ لها حسابٌ مربوطٌ فعلا. */
  readonly linked: ReadonlySet<string>
  /** منصّاتٌ لها زوجُ أسرارٍ محفوظ (بيئةً أو خزانة). */
  readonly appsConfigured: ReadonlySet<string>
  /** منصّاتٌ جاز فحصُ زوجها (D-060). */
  readonly appsVerified: ReadonlySet<string>
  /** متغيّراتُ البيئة غيرُ السرّيّة المضبوطة. */
  readonly vars: ReadonlySet<string>
  /** أنُشر منشورٌ واحدٌ بنجاح؟ — بوّابةُ المرحلة ٠. */
  readonly anyPublished: boolean
  /** أوُلّد فيديو بسعرٍ مؤكَّد؟ `false` يعني أنّ السقفَ لا يحرسه. */
  readonly videoPriced: boolean
  /** كم بطاقةً اختار المالكُ لصدر لوحه — بوّابةُ الستّة (D-114 · D-130). */
  readonly tilesChosen: number
  /** سقفُ الترويج الأسبوعيّ — وصفرٌ يعني لا توصيةَ تُكتب (D-006). */
  readonly promoCapUsd: number
  /**
   * أبلغت `LinkedIn-Version` المثبَّتةُ دورةَ المراجعة؟ (D-072)
   *
   * **يُحسَب من الرقم نفسِه ومن التاريخ** — لا يُكتب بيد.
   */
  readonly linkedInVersionDue: boolean
}

/**
 * السجلّ — **مرتَّبٌ بما يفتح، لا بترقيمه.**
 *
 * فما يفتح بوّابةً يسبق ما يفتح قدرة، وحارسٌ معطَّلٌ يسبقهما: **نظامٌ
 * يعمل بحارسٍ لا يعمل أخطرُ من نظامٍ لا يعمل** — الأوّلُ يُطمئن.
 */
export const OWNER_TASKS: readonly OwnerTask[] = [
  {
    code: 'M-02',
    title: 'زوجُ أسرار LinkedIn يجوز فحصُه',
    ifLeft:
      'لا يُربَط حسابٌ ولا يُنشَر حرف. **وبوّاباتُ المراحل ٠ و١ و٢ كلُّها تقف عليها.**',
    unblocks: 'gate',
    done: (f) => f.appsVerified.has('linkedin') || f.linked.has('linkedin'),
    secrets: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  },
  {
    code: 'M-04',
    title: 'زوجُ أسرار X ورصيدُ الحساب',
    ifLeft: 'المنصّةُ الثانيةُ لا تنشر — والبوّابةُ تطلب منشورا على كلٍّ منهما.',
    unblocks: 'gate',
    done: (f) => f.appsVerified.has('x') || f.linked.has('x'),
    secrets: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  },
  {
    code: 'M-16',
    title: 'سعرُ نموذج الفيديو من لوحة Cloudflare',
    ifLeft:
      'يُسجَّل اليوم `price_unverified` بصفر — **فسقفُ الإنفاق اليوميّ لا يحرس الفيديو**، ' +
      'ودورةٌ تدور مرّاتٍ تُنفق بلا أن يوقفها شيء.',
    unblocks: 'guard',
    done: (f) => f.videoPriced,
  },
  {
    code: 'M-18',
    title: 'مراجعةُ `LinkedIn-Version` المثبَّتة',
    ifLeft:
      'الرقمُ يشيخ صامتا. ويومَ تُسقط LinkedIn نسختَه **يتوقّف النشرُ كلُّه** ' +
      'بخطأٍ من المنصّة — **ولا شيءَ في اللوحة كان يقول إنّه شاخ**.',
    unblocks: 'guard',
    done: (f) => !f.linkedInVersionDue,
    evidence: (f) =>
      f.linkedInVersionDue
        ? 'بلغت دورةَ المراجعة — اقرأ ملاحظاتِ التغيير'
        : 'لم تبلغ دورةَ المراجعة بعد — **ولم تُراجَع**',
  },
  {
    code: 'M-17',
    title: '`LEGAL_ENTITY` و`LEGAL_CONTACT` في `wrangler.toml`',
    ifLeft:
      'صفحتا الشروط والخصوصيّة بلا كيانٍ مسمّى ولا بريدِ تواصل — ' +
      '**ومراجعةُ المنصّات تسقط عليهما**، ولا يُخترَع بريدٌ لا وجودَ له.',
    unblocks: 'capability',
    done: (f) => f.vars.has('LEGAL_ENTITY') && f.vars.has('LEGAL_CONTACT'),
  },
  {
    code: 'M-19',
    title: '`CF_BROWSER_TOKEN` — النصُّ فوق الصورة',
    ifLeft:
      'تخرج الصورةُ **نظيفةً بلا عنوان**، ولا يقع نداءٌ ولا كلفة. ' +
      'ولا نموذجَ توليدٍ يكتب عربيّةً صحيحةَ الوصل، **والوصلُ عملُ متصفّحٍ** ' +
      'لا عملُ مولّد صور.',
    unblocks: 'capability',
    // سرٌّ لا متغيّر (D-157): كان يُسأل عنه في `vars` فلا يكتمل أبدا ولو ضُبط.
    // **والحكمُ حكمُ `composeSlide` نفسُه** (D-163): كان ثالثَ نسخةٍ من شرطها
    done: (f) =>
      slideGate({
        overlay: true,
        hasBrowserKey: f.secrets.has('CF_BROWSER_TOKEN'),
        hasAccount: f.vars.has('CF_AI_ACCOUNT_ID'),
      }).state === 'ready',
    secrets: ['CF_BROWSER_TOKEN'],
  },
  {
    code: 'M-15',
    title: 'ربطُ YouTube',
    ifLeft:
      'لا شيءَ ينكسر، **والبطاقةُ تبقى «تنتظرك» صادقة**. ' +
      'والمقاطعُ الرأسيّةُ تُولَّد ولا تجد أين تذهب.',
    unblocks: 'capability',
    done: (f) => f.linked.has('youtube'),
  },
  {
    code: 'M-14',
    title: 'ربطُ TikTok',
    ifLeft: 'كسابقتها — ولا يُدَّعى نشرٌ لم يُبنَ سائقُه.',
    unblocks: 'capability',
    done: (f) => f.linked.has('tiktok'),
  },
  {
    code: 'M-20',
    title: 'بوّابةُ الستّة — ستُّ بطاقاتٍ في صدر لوحك',
    ifLeft:
      'تبقى الأربعُ الافتراضيّةُ اختيارَ من كتب الملفّ لا اختيارَك — ' +
      '**والشاشةُ اليوميّةُ تبدأ بجواب غيرِك**.',
    unblocks: 'capability',
    done: (f) => f.tilesChosen >= 6,
    evidence: (f) => `${f.tilesChosen} من 6 بطاقاتٍ مختارة`,
    go: '/panel#settings',
    goLabel: 'افتح الحدود',
  },
  {
    code: 'M-21',
    title: 'سقفُ الترويج الأسبوعيّ',
    ifLeft:
      '**لا توصيةَ تُكتب أصلا**: رقمٌ نؤلّفه رقمٌ بلا مصدر، والتقريرُ يقول ' +
      '«لا سقفَ موضوع» كلَّ اثنين.',
    unblocks: 'capability',
    done: (f) => f.promoCapUsd > 0,
    evidence: (f) => (f.promoCapUsd > 0 ? `السقفُ ${f.promoCapUsd}$ في الأسبوع` : 'صفر — لا توصيةَ تُكتب'),
    go: '/panel#settings',
    goLabel: 'افتح الحدود',
  },
  {
    code: 'M-03',
    title: 'موافقةُ LinkedIn على Community Management API',
    ifLeft: 'النشرُ باسم **صفحةِ شركة** لا يعمل. والنشرُ باسمك يعمل.',
    unblocks: 'capability',
    // موافقةٌ عند المنصّة: **لا تُقرأ من هنا** حتّى يُربَط حسابُ صفحة
    done: () => null,
  },
  {
    code: 'M-12',
    title: 'مفتاحُ مرورٍ (Passkey) على كلّ بيئة',
    ifLeft:
      '`ADMIN_TOKEN` وحده يحرس اللوحة — **ورمزٌ يُسرَّب يفتح كلَّ شيء**، ' +
      'ولا عاملَ ثانٍ يردّه.',
    unblocks: 'guard',
    // يُقرأ من `webauthn_credentials`، ولا يُمرَّر هنا بعد
    done: () => null,
  },
  {
    code: 'M-22',
    title: 'إطلاقُ الإنتاج على sada.basserh.com',
    ifLeft:
      'يبقى صدى على staging وحدَه: **كلُّ ما نُشر ويُنشر تجربةٌ**، والنطاقُ ' +
      'المسجَّلُ في مراجعات المنصّات لا يردّ.',
    unblocks: 'capability',
    // يُقرأ عند sada.basserh.com لا من هنا: staging لا تعرف حالَ الإنتاج
    done: () => null,
    go: 'https://github.com/milestoneimpact/sada/actions/workflows/deploy.yml',
    goLabel: 'افتح صفحةَ النشر',
  },
  {
    code: 'M-23',
    title: 'دقائقُ GitHub Actions — البوّابةُ والنشرُ يقفان بلا عدّاء',
    ifLeft:
      'لا يُكسَر staging — **لكنّ كلَّ دمجٍ لا يصله**، ولا يجري CI على أيّ ' +
      'طلب، فيُدمَج ما لم يُحرَس أو يتوقّف الدفعُ كلُّه.',
    unblocks: 'gate',
    // تُقرأ عند GitHub لا من هنا: العاملُ لا يعرف رصيدَ الدقائق ولا حالَ العدّاء
    done: () => null,
    go: 'https://github.com/settings/billing',
    goLabel: 'افتح الفوترة',
  },
  {
    code: 'M-11',
    title: 'تدويرُ مفتاح حساب خدمة Google',
    ifLeft: 'مفتاحٌ ظهر مرّةً يبقى صالحا — **وصلاحيّتُه لا تنتهي وحدها**.',
    unblocks: 'guard',
    done: () => null,
  },
]

export interface OwnerRow extends OwnerTask {
  /** `true` تمّت · `false` لم تتمّ · `null` **لا يُعرَف من هنا**. */
  readonly state: boolean | null
  /** ما قِيس — أو فراغٌ إن لم يكن للمهمّة قياسٌ يُعرَض. */
  readonly measured: string
}

/** يقرأ الحالَ لكلّ مهمّة — والترتيبُ: ما لم يتمّ أوّلا، ثمّ ما لا يُعرَف. */
export function ownerRows(facts: OwnerFacts): OwnerRow[] {
  const weight: Record<Unblocks, number> = { gate: 0, guard: 1, capability: 2 }
  return OWNER_TASKS.map((t) => ({
    ...t,
    state: t.done(facts),
    measured: t.evidence === undefined ? '' : t.evidence(facts),
  })).sort((a, b) => {
    const rank = (r: OwnerRow): number => (r.state === false ? 0 : r.state === null ? 1 : 2)
    return rank(a) - rank(b) || weight[a.unblocks] - weight[b.unblocks]
  })
}

/** كم مهمّةً **يُعرَف** أنّها لم تتمّ — ولا يُعدّ فيها ما لا يُعرَف. */
export function pendingCount(facts: OwnerFacts): number {
  return ownerRows(facts).filter((r) => r.state === false).length
}
