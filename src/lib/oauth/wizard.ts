/**
 * معالجُ الربط — أربعُ خطواتٍ، **وكلُّ خطوةٍ تقول كيف تُعرَف.**
 *
 * ## المشكلة التي وُجد لها
 *
 * الضبطُ لم يكن خطوات: كان **حقلين ودليلا مطويّا وزرَّ ربط**. فمن
 * فشل عنده الربطُ لا يعرف **أين هو من الطريق** — أنقص شيءٌ في البوّابة؟
 * أم في الأسرار؟ أم في رابط العودة؟ فيعيد ما فعله مرّةً بعد مرّة.
 *
 * ## وأصدقُ ما في هذا: ما لا نعرفه لا نضع عليه علامة
 *
 * خطوتان منها **تقعان عند المنصّة لا عندنا**، ولا سبيلَ إلى قراءتهما.
 * ولوحةٌ تضع علامةَ صحٍّ على ما لم تتحقّق منه **تكذب في أخطر موضع**:
 * تقول «تمّت» فيبحث المالكُ في غيرها — وهو ما وقع فعلا.
 *
 * فبرهانُ كلِّ خطوةٍ يأتي **من نجاح خطوةٍ بعدها**:
 *
 * | الخطوة | ما يثبتها |
 * |---|---|
 * | ١ · أنشئ التطبيق | **نجاحُ الفحص**: معرّفٌ تعرفه المنصّة |
 * | ٢ · رابطُ العودة في البوّابة | **نجاحُ الربط وحده** — لا يُقرأ من هنا |
 * | ٣ · الأسرارُ في صدى | صفٌّ في الخزانة، ثمّ فحصٌ يجيزه |
 * | ٤ · اربط | حسابٌ محفوظ |
 *
 * وما لم يُعرَف يُقال «لا يُعرَف من هنا» — لا «تمّت» ولا «لم تتمّ».
 */
import type { AppStatus } from './apps'
import type { ChannelView } from '../channels'

export type StepState =
  /** تمّت، وبرهانُها مذكور. */
  | 'done'
  /** هي التي عليك الآن. */
  | 'now'
  /** تنتظر ما قبلها. */
  | 'waiting'
  /** وقعت عند المنصّة ولا تُقرأ من هنا — ولا يُدَّعى فيها حكم. */
  | 'unknowable'
  /** فُحصت ورُدّت. */
  | 'failed'

export interface Step {
  readonly n: number
  readonly title: string
  readonly state: StepState
  /** كيف عُرف حالُها — يُعرَض تحتها، فلا يُصدَّق حكمٌ بلا سند. */
  readonly proof: string
}

export interface WizardView {
  readonly steps: readonly Step[]
  /** رقمُ الخطوة التي على المالك الآن — أو `null` إن تمّ كلُّ شيء. */
  readonly current: number | null
  readonly linked: boolean
}

/** أحكامُ الفحص التي تُعدّ جوازا. وما عداها لا يُجيز. */
const PASSED: ReadonlySet<string> = new Set(['accepted'])
const FAILED: ReadonlySet<string> = new Set(['bad_secret', 'bad_client_id'])

export function wizardFor(view: ChannelView, app: AppStatus | undefined): WizardView {
  const linked = view.accounts.length > 0
  const hasSecrets = app !== undefined && app.source !== 'none'
  const kind = app?.verifiedKind ?? null
  const verified = kind !== null && PASSED.has(kind)
  const rejected = kind !== null && FAILED.has(kind)

  /**
   * **الخطوةُ الأولى تثبتها المنصّةُ لا نحن.**
   *
   * ولا يكفي أن يكون في الخزانة سرّ: سرٌّ يُلصَق لتطبيقٍ لم يُنشَأ
   * يُحفَظ كما يُحفَظ الصحيح. **فالمعرّفُ لا يُعدّ قائما حتّى تقول
   * المنصّةُ إنّها تعرفه.**
   */
  const created: StepState = kind === 'bad_client_id'
    ? 'failed'
    : verified || rejected || linked
      ? 'done'
      : hasSecrets
        ? 'unknowable'
        : 'now'

  /**
   * **ورابطُ العودة لا يُقرأ من هنا بحال.**
   *
   * هو حقلٌ في بوّابة المنصّة، ولا واجهةَ تقول ما فيه. **ونجاحُ الربط
   * وحده يثبته** — فحتّى يقع، يبقى «لا يُعرَف».
   */
  const callback: StepState = linked ? 'done' : 'unknowable'

  /**
   * **وفحصٌ لم يُحسَم ليس فحصا لم يقع** (D-076).
   *
   * الفحصُ يسأل بمنحة `client_credentials`، وقد تردّ المنصّةُ بما
   * لا يتكلّم عن الزوج أصلا. **وكان ذلك يُقرأ جوازا** فتخضرّ الخطوةُ
   * على زوجٍ ترفضه المنصّةُ في منحة الرمز — وهو ما وقع حرفا.
   *
   * فصار «لا يُعرَف»: لا خُضرةٌ تكذب، ولا «لم يُفحَص» تكذب أيضا.
   */
  const probed = kind !== null
  const secrets: StepState = rejected
    ? 'failed'
    : verified || linked
      ? 'done'
      : probed
        ? 'unknowable'
        : hasSecrets
          ? 'now'
          : 'waiting'

  const connect: StepState = linked
    ? 'done'
    : !hasSecrets
      ? 'waiting'
      : rejected
        ? 'waiting'
        : 'now'

  const steps: Step[] = [
    {
      n: 1,
      title: 'أنشئ التطبيق في بوّابة المنصّة',
      state: created,
      proof:
        created === 'failed'
          ? 'ردّت المنصّة أنّ المعرّف لا تعرفه — فهو تطبيق آخر أو حرف ساقط.'
          : created === 'done'
            ? 'ثبت: المنصّة تعرف هذا المعرّف.'
            : created === 'unknowable'
              ? 'حُفظ معرّف، ولم تقل المنصّة بعد إنّها تعرفه. افحص الزوج في الخطوة 3.'
              : 'لم يُحفَظ معرّف بعد.',
    },
    {
      n: 2,
      title: 'الصق رابط العودة في البوّابة',
      state: callback,
      proof:
        callback === 'done'
          ? 'ثبت: الربط نجح، ولا ينجح برابط عودة مخالف.'
          : 'لا يُقرأ من هنا — هو حقل عند المنصّة. ونجاح الخطوة 4 وحده يثبته.',
    },
    {
      n: 3,
      title: 'الصق المعرّف والسرّ في صدى، ثمّ افحص',
      state: secrets,
      proof:
        secrets === 'failed'
          ? 'فُحص فرُدّ. والإشعار يقول أيّ الحقلين هو الخطأ.'
          : secrets === 'done'
            ? app?.verifiedAt === null || app?.verifiedAt === undefined
              ? 'ثبت بنجاح الربط.'
              : 'ثبت: المنصّة قبلت الزوج.'
            : secrets === 'unknowable'
              ? 'فُحص **فلم يُحسَم**: ردّت المنصّة بما لا يتكلّم عن الزوج. ' +
                'والبرهان الوحيد نجاح الربط — والإشعار يحمل نصَّها.'
              : secrets === 'now'
                ? 'محفوظ ولم يُفحَص. **واضغط «افحص الزوج»** — يجيب في ثانية بلا دورة إذن.'
                : 'تنتظر الخطوة 1.',
    },
    {
      n: 4,
      title: 'اربط الحساب',
      state: connect,
      proof:
        connect === 'done'
          ? `ثبت: ${view.accounts.length} حساب محفوظ.`
          : connect === 'now'
            ? 'كلّ ما قبلها جاهز.'
            : rejected
              ? 'لا تُجرَّب قبل أن يجوز الفحص — دورة تنتهي بالرفض نفسِه.'
              : 'تنتظر الأسرار.',
    },
  ]

  const current = steps.find((s) => s.state === 'now' || s.state === 'failed')?.n ?? null
  return { steps, current, linked }
}
