/**
 * ما يُرى بعد العودة من شاشة الإذن.
 *
 * ## العلّة التي وُلد منها هذا الملفّ
 *
 * ربطُ X نجح، وربطُ LinkedIn ردّ هذا في المتصفّح:
 *
 *     { "error": "consent_denied",
 *       "platform": "linkedin",
 *       "reason": "unauthorized_scope_error" }
 *
 * وهو **صادقٌ وعديمُ النفع معا**. لا يقول أيَّ نطاقٍ رُفض، ولا مَن
 * يمنحه، ولا أنّ العلّة في بوّابة المنصّة لا في السرّ الذي كُتب. ومن
 * قرأه ظنّ أنّ سرَّه خطأ فأعاد توليده — وهي أوّلُ حركةٍ خاطئة.
 *
 * ## وثلاثةُ أشياءَ تصنعها هذه الصفحة
 *
 * ١ · **تسمّي الناقصَ ومصدرَه** بالاسم كما يُرى في البوّابة.
 * ٢ · **تفتح مخرجا**: زرٌّ يعيد المحاولة بالهويّة وحدها، فيُربَط الحساب
 *     اليوم ويُكمَل النشرُ غدا — بدل شاشةٍ لا مخرجَ منها.
 * ٣ · **تقول ما لا يعمل بعدها**، فلا يظنّ المالكُ أنّه أتمّ وقد نقص.
 *
 * ## ولا رمزَ في هذه الصفحة ولا في عنوانها
 *
 * تُعرض بعد أن يُخزَّن الرمزُ مشفّرا، ولا تحمل منه شيئا: اسمُ الحساب
 * وحالُ النطاقات لا أكثر (D-005).
 */
import { stamp } from '../../lib/time/zone'
import { panelHref } from '../../lib/nav/panes'
import { SCOPES, scopeSet, type ScopeSpec } from '../../lib/oauth/scopes'
import { blamedScopes } from '../../lib/oauth/refusal'
import { PLATFORM_LABEL, type Platform } from '../../lib/oauth/providers'
import { callbackStep, SETUP, setupHref } from '../../lib/channels'
import { escapeHtml } from './shell'
import { LOGOS } from './logos'
import { pathArrows } from './parts'
import { statusBadge } from './components/badge'
import { button } from './components/button'
import { counted, NOUNS } from '../../lib/format'

/** «الحسابات» ثانويًّا — طريقُ العودة في كلّ نتيجة، بدالّة العُدّة لا بوسمٍ يُكتب في كلّ موضع (D-325). */
const ACCOUNTS = button({ label: 'الحسابات', href: panelHref('channels') })

// القاموسُ واحدٌ في lib/oauth/providers (D-151)
const LABEL = PLATFORM_LABEL

function head(platform: Platform, eyebrow: string, title: string, lede: string): string {
  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>${escapeHtml(eyebrow)}</div>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${lede}</p>
    </div>
    <div class="aside"><div class="plat-logo lg">${LOGOS[platform] ?? ''}</div></div>
  </div>`
}

/** صفٌّ لكلّ نطاق: أمُنح، وما يفتحه، ومَن يمنحه إن نقص. */
function scopeRows(platform: Platform, granted: ReadonlySet<string>): string {
  return SCOPES[platform]
    .map((spec: ScopeSpec) => {
      const on = granted.has(spec.name)
      return `<tr>
        <td data-label="النطاق"><span class="mono">${escapeHtml(spec.name)}</span></td>
        <td data-label="يفتح"><span class="nm">${escapeHtml(spec.enables)}</span></td>
        <td data-label="الحال">${
          on
            ? statusBadge('ok', '●', 'ممنوح')
            : statusBadge('bad', '▲', 'ناقص')
        }</td>
        <td data-label="مصدرُه">${
          on
            ? '<span class="ago">—</span>'
            : `<span class="sub m-0"><b>${escapeHtml(spec.grantedBy)}</b><br>
               ${pathArrows(escapeHtml(spec.where))}</span>`
        }</td>
      </tr>`
    })
    .join('')
}

export interface ConnectedData {
  readonly platform: Platform
  readonly displayName: string
  readonly grantedScopes: readonly string[]
  readonly hasRefresh: boolean
  readonly expiresAt: string
}

/** رُبط الحساب — وما يستطيعه يُقال هنا لا يُترك ليُكتشَف عند أوّل نشر. */
export function connectedBody(d: ConnectedData): string {
  const granted = new Set(d.grantedScopes)
  const missing = SCOPES[d.platform].filter((s) => !granted.has(s.name))
  const canPublish = SCOPES[d.platform]
    .filter((s) => s.need === 'publish')
    .every((s) => granted.has(s.name))

  const verdict =
    missing.length === 0
      ? `<div class="outcome"><span class="kv-k">تمّ</span><span class="kv-v">
         كلّ النطاقات ممنوحة. <b>يستطيع صدى أن ينشر باسم هذا الحساب</b> —
         بعد موافقتك على كلّ منشور على حدة.</span></div>`
      : canPublish
        ? `<div class="outcome warn"><span class="kv-k">ينقص</span><span class="kv-v">
           النشر يعمل، <b>ولم يُمنَح ${counted(missing.length, NOUNS.scope)}</b> — وما يفتحه لا يعمل.
           والجدول تحت يقول أيَّها ومَن يمنحه.</span></div>`
        : `<div class="outcome warn"><span class="kv-k">مربوط ولا ينشر</span><span class="kv-v">
           <b>الهويّة مقروءة، والنشر غير ممكن</b> — نطاق النشر لم يُمنَح.
           والحساب محفوظ كما هو: أضف المنتَج في البوّابة ثمّ اضغط «جدّد الإذن»،
           ولا تُعِد بناء التطبيق.</span></div>`

  const refresh = d.hasRefresh
    ? statusBadge('ok', '●', 'يُجدَّد تلقائيّا')
    : `${statusBadge('warn', '!', `بلا تجديد تلقائيّ`)}`

  return `${head(
    d.platform,
    'رُبط',
    `${LABEL[d.platform]} — ${d.displayName}`,
    'الإذن محفوظ مشفّرا، ولا يظهر في هذه الصفحة ولا في سجلّ. ' +
      '<b>وما يستطيعه هذا الحساب مقروء ممّا مُنح لا ممّا طُلب.</b>',
  )}

  ${verdict}

  <div class="card mt-4">
    <div class="card-head"><h2>ما مُنح لهذا الحساب</h2>
      <div class="grow"></div>${refresh}</div>
    <p class="hint">وقت انتهاء الإذن: <span class="mono">${escapeHtml(
      stamp(d.expiresAt.slice(0, 16).replace('T', ' '), null),
    )}</span>.
      ${d.hasRefresh
        ? 'ويُجدَّد قبل انتهائه بلا تدخّل.'
        : '<b>ولا إذن تجديد معه</b> — فسيتوقّف النشر عند انتهائه حتّى تُعيد الربط.'}</p>
    <div class="scroll"><table>
      <thead><tr><th>النطاق</th><th>يفتح</th><th>الحال</th><th>مصدرُه إن نقص</th></tr></thead>
      <tbody>${scopeRows(d.platform, granted)}</tbody></table></div>
  </div>

  <div class="row mt-4">
    ${button({ label: 'شاشة ' + LABEL[d.platform], variant: 'primary', href: '/panel/channels/' + d.platform })}
    ${ACCOUNTS}
  </div>`
}

export interface RefusedData {
  readonly platform: Platform
  /** رمزُ الرفض كما ردّته المنصّة — لا نصُّ وصفها. */
  readonly reason: string
  /**
   * وصفُ المنصّة — **يُضيّق ولا يقرّر**.
   *
   * فيه اسمُ النطاق المرفوض غالبا، ويُطابَق على سجلٍّ نعرفه: ما وافق
   * أُخذ، وما لم يوافق أُهمل وعُرضت القائمةُ كاملةً كما كانت.
   */
  readonly description?: string
  /** ما طُلب في الدورة التي رُفضت. */
  readonly requested: readonly string[]
  /** أتُعرَض محاولةُ الهويّة وحدها؟ لا تُعرَض إن كانت هي التي رُفضت. */
  readonly identityRetry: boolean
  /**
   * ما أُرسل فعلا — **معرّفُ التطبيق ورابطُ العودة، لا السرّ**.
   *
   * وهذان **علنيّان**: المعرّفُ معروضٌ في بوّابة المنصّة نفسِها،
   * والرابطُ يظهر في شريط العنوان عند كلّ دورة. فعرضُهما لا يكشف شيئا،
   * **ويحسم سؤالا لا يُحسَم بغيرهما**: أهو تطبيقٌ آخرُ أصلا؟
   *
   * **ولا يُعرَض السرُّ ولا قناعُه ولا بصمتُه هنا**: هذه الصفحةُ ليست
   * خلف جلسة — من أتمّ إذنا عند المنصّة يبلغها. وقناعُ السرّ يكشف
   * أوّلَه وآخرَه، فموضعُه لوحُ القنوات خلف الدخول (D-042).
   */
  readonly sent?: { readonly clientId: string; readonly redirectUri: string }
}

/**
 * رُفض الإذن — والرفضُ نوعان لا نوع.
 *
 * **رفضُ المستخدم** قرارٌ لا عطل: يُقال كما هو بلا تشخيص.
 * **ورفضُ المنصّة للنطاق** عطلُ ضبطٍ في بوّابتها: يُشخَّص بالاسم.
 *
 * وخلطُهما — وهو ما كان — يجعل من ضغط «إلغاء» يقرأ صفحةَ عطل، ومن رُفض
 * نطاقُه يقرأ «أُلغي» فيظنّ أنّه هو ألغى.
 */
export function refusedBody(d: RefusedData): string {
  const scopeProblem =
    d.reason === 'unauthorized_scope_error' || d.reason === 'invalid_scope'
  const userDenied = d.reason === 'user_cancelled_login' || d.reason === 'access_denied' ||
    d.reason === 'user_cancelled_authorize'
  const guide = SETUP[d.platform]
  /*
   * ‏**بلغة كلّ منصّةٍ وإلى حقليها** (ر-1): كانت الصفحةُ تقول «تبويب Auth» لكلّ منصّة —
   * ‏ولا تبويبَ بهذا الاسم عند Meta وTikTok وGoogle — وزرُّها «افتح الدليل والحقول» يقود
   * ‏إلى لوح القنوات ولا حقلَ فيه. فالبوّابةُ من دليلها، والزرُّ إلى حقل المعرّف في الإعداد.
   */
  const portal = guide?.portalLabel ?? LABEL[d.platform]
  const fields = setupHref(d.platform)
  const step = guide === undefined ? null : callbackStep(guide)

  if (userDenied) {
    return `${head(
      d.platform,
      'أُلغي',
      `لم تُمنَح ${LABEL[d.platform]} إذنا`,
      'أُغلقت شاشة الإذن قبل الموافقة. <b>ولم يُحفَظ شيء</b> — لا حساب ولا إذن.',
    )}
    <div class="card">
      <h2>لا شيء يحتاج إصلاحا</h2>
      <p class="hint">هذا قرارُك لا عطل في الضبط. وزرّ الربط في لوح القنوات
        يعمل كما كان متى شئت.</p>
      <div class="row mt-3">
        ${button({ label: 'جرّب من جديد', variant: 'primary', href: '/oauth/' + d.platform + '/start' })}
        ${ACCOUNTS}
      </div>
    </div>`
  }

  /**
   * **`invalid_client` ليس رفضَ نطاق، ولا رفضَ مستخدم.**
   *
   * شاشةُ الإذن نجحت، والمنصّةُ أعطت `code` — ثمّ **ردّت تبديلَه**.
   * ومعناه واحدٌ عند كلّ المنصّات: **الزوجُ الذي في صدى ليس زوجَ هذا
   * التطبيق**.
   *
   * وأشيعُ سببٍ له **إعادةُ إنشاء التطبيق**: التطبيقُ الجديد معرّفٌ
   * جديدٌ وسرٌّ جديد، وصدى يحمل القديم — **فالشاشةُ تعمل والتبديلُ
   * يُردّ**، وهو أشدُّ ما يُربك: نصفُ الدورة نجح.
   *
   * ويُقال بالاسم لأنّ فرعا عامّا يقول «راجع الضبط» **يجعل المالك
   * يفتّش في المنتَجات والنطاقات — وليس فيها العطل**.
   */
  if (d.reason === 'invalid_client') {
    return `${head(
      d.platform,
      'رُفض',
      'الإذن نجح، وتبديل الإذن رُدّ',
      'شاشة الإذن مرّت، ثمّ ردّت ' + LABEL[d.platform] + ' تبديل الإذن بـ ' +
        '<span class="mono">invalid_client</span>. ' +
        '<b>ومعناه أنّ Client ID أو Client Secret في صدى ليس زوج هذا التطبيق.</b> ' +
        '<b>ولم يُحفَظ شيء.</b>',
    )}
    <div class="card">
      <h2>ولا علاقة له بالنطاقات ولا بالمنتَجات</h2>
      <p class="hint">النطاقات تُفحَص <b>قبل</b> شاشة الإذن، وقد مرّت.
        <b>فلا تفتّش في تبويب Products</b> — العطل في زوج المفاتيح وحده.</p>
      <ol class="steps">
        <li><span class="step-n">1</span><span class="body">
          <span class="what">أأُعيد إنشاء التطبيق؟</span>
          <span class="why"><b>هذا أشيع سبب.</b> تطبيق جديد معرّفُه جديد وسرُّه
            جديد — وصدى يحمل زوج التطبيق القديم.</span></span></li>
        <li><span class="step-n">2</span><span class="body">
          <span class="what">أأُعيد توليد السرّ؟</span>
          <span class="why">سرّ يُولَّد من جديد <b>يُبطل السابق فورا</b>،
            والمعرّف يبقى كما هو — فيبدو أنّ شيئا لم يتغيّر.</span></span></li>
        <li><span class="step-n">3</span><span class="body">
          <span class="what">أَلُصق السرّ في حقل المعرّف أو العكس؟</span>
          <span class="why">الحقلان متجاوران، والقيمتان طويلتان متشابهتان
            في الشكل.</span></span></li>
      </ol>
      ${d.description === undefined ? '' : `<div class="outcome warn">
        <span class="kv-k">وهذا نصّ ${LABEL[d.platform]} حرفا</span>
        <span class="kv-v"><span class="mono">${escapeHtml(d.description)}</span></span></div>`}
      ${d.sent === undefined ? '' : `<div class="card mt-3">
        <h2>وهذا ما أرسله صدى — قارنه بما في البوّابة</h2>
        <p class="hint"><b>القيمتان علنيّتان</b>: المعرّف معروض في البوّابة نفسِها،
          والرابط يظهر في شريط العنوان عند كلّ دورة. <b>ولا يُعرَض السرّ هنا</b> —
          هذه الصفحة ليست خلف دخول؛ قناع السرّ في لوح القنوات.</p>
        <div class="field cb">
          <label for="sent-id">Client ID الذي أُرسل</label>
          <div class="copy">
            <input id="sent-id" class="mono" dir="ltr" value="${escapeHtml(d.sent.clientId)}" readonly
              aria-label="معرّف التطبيق الذي أُرسل">
            ${button({ label: 'انسخ', size: 'sm', attrs: 'data-copy="sent-id"' })}
          </div>
          <div class="help"><span class="help-ic">!</span><span class="help-t">
            <b>إن خالف المعرّف في ${escapeHtml(portal)} فهذا تطبيق آخر</b> — وهو وحده يفسّر
            الرفض. وإن طابقه، <b>فالسرّ هو الخطأ</b>: ولّد سرّا جديدا والصقه.</span></div>
        </div>
        <div class="field cb">
          <label for="sent-cb">رابط العودة الذي أُرسل</label>
          <div class="copy">
            <input id="sent-cb" class="mono" dir="ltr" value="${escapeHtml(d.sent.redirectUri)}" readonly
              aria-label="رابط العودة الذي أُرسل">
            ${button({ label: 'انسخ', size: 'sm', attrs: 'data-copy="sent-cb"' })}
          </div>
        </div>
      </div>`}
      <div class="outcome warn"><span class="kv-k">ما يُفعَل</span>
        <span class="kv-v">انسخ <b>Client ID</b> و <b>Client Secret</b> من
          <b>${escapeHtml(portal)}</b> في التطبيق <b>الذي تراه الآن</b>، والصقهما في
          <b>${pathArrows('صفحة المنصّة ← ضبط التطبيق ودليلُه')}</b>، ثمّ أعد الربط.
          <b>وإن كان السرّ لا يظهر لك كاملا في البوّابة فولّد سرّا جديدا</b> —
          المعروض مقنَّعا لا يُنسَخ، ولصق قناع يعطي هذا الردّ نفسه.</span></div>
      <div class="row mt-3">
        ${button({ label: 'اضبط المعرّف والسرّ', variant: 'primary', href: fields })}
        ${button({ label: 'أعد المحاولة', href: '/oauth/' + d.platform + '/start' })}
      </div>
    </div>`
  }

  if (!scopeProblem) {
    return `${head(
      d.platform,
      'رُفض',
      `ردّت ${LABEL[d.platform]} الطلب`,
      `ما أعادته حرفًا: <span class="mono">${escapeHtml(d.reason)}</span>. ` +
        '<b>ولم يُحفَظ شيء.</b>',
    )}
    <div class="card">
      <h2>أوّل ما يُراجَع</h2>
      <ol class="steps">
        <li><span class="step-n">1</span><span class="body">
          <span class="what">رابط العودة المسجَّل في ${escapeHtml(portal)}</span>
          <span class="why">يُطابَق حرفًا بحرف: شرطة زائدة في آخره أو http بدل https تُسقط الربط.${
            step === null ? '' : ` وهو الخطوة ${step} من الدليل.`}</span></span></li>
        <li><span class="step-n">2</span><span class="body">
          <span class="what">Client ID و Client Secret</span>
          <span class="why">سرّ من تطبيق آخر، أو سرّ أُعيد توليدُه ولم يُبدَّل هنا،
            يعطي هذا الردّ نفسه.</span></span></li>
      </ol>
      ${guide === undefined ? '' : `<div class="outcome warn"><span class="kv-k">إن فشل</span>
        <span class="kv-v">${pathArrows(guide.failure)}</span></div>`}
      <div class="row mt-3">
        ${button({ label: 'اضبط المعرّف والسرّ', variant: 'primary', href: fields })}
        ${button({ label: 'أعد المحاولة', href: '/oauth/' + d.platform + '/start' })}
      </div>
    </div>`
  }

  // ── رفضُ نطاق: التشخيصُ بالاسم، والمخرجُ بزرّ ────────────────────
  //
  // **والمنصّةُ تسمّي النطاقَ في وصفها.** فإن سمّته عُرض وحده، وإلّا
  // عُرضت القائمةُ كاملة — وعرضُ ثلاثةٍ حيث يُعرَف واحدٌ يجعل المالك
  // يفحص ثلاثةَ منتَجاتٍ وأحدُها وحده الناقص
  const asked = new Set(d.requested)
  const blamed = blamedScopes(d.description ?? '', d.requested)
  const named = blamed.length > 0
  const suspects = SCOPES[d.platform].filter(
    (s) => asked.has(s.name) && (!named || blamed.includes(s.name)),
  )

  // ونطاقُ الهويّة إن كان هو الناقصَ **أسقط مخرجَ الهويّة**: زرٌّ يطلب
  // ما رُفض بعينه يَعِد بما لا يقع
  const identity = new Set(scopeSet(d.platform, 'identity'))
  const identityBlocked = blamed.some((name) => identity.has(name))
  const offerIdentity = d.identityRetry && !identityBlocked
  const rows = suspects
    .map(
      (s) => `<tr>
        <td data-label="النطاق"><span class="mono">${escapeHtml(s.name)}</span></td>
        <td data-label="يفتح">${escapeHtml(s.enables)}</td>
        <td data-label="مَن يمنحه"><span class="nm">${escapeHtml(s.grantedBy)}</span>
          <div class="sub mt-1">${pathArrows(escapeHtml(s.where))}</div></td>
      </tr>`,
    )
    .join('')

  return `${head(
    d.platform,
    'نطاق لم يُمنَح',
    `${LABEL[d.platform]} رفضت نطاقا طلبناه`,
    named
      ? `النطاق الناقص: <span class="mono">${escapeHtml(blamed.join('</span> و <span class="mono">'))}</span>. ` +
        '<b>سمّته المنصّة في جوابها</b>، فلا حاجة إلى تخمين. ' +
        'ولا علاقة للسرّ بهذا: <b>لا تُعِد توليده.</b>'
      : `ما أعادته حرفًا: <span class="mono">${escapeHtml(d.reason)}</span>. ` +
        '<b>ومعناه أنّ التطبيق لا يملك نطاقا طُلب — لا أنّ سرَّك خطأ.</b> ' +
        'فلا تُعِد توليد السرّ: لن يغيّر شيئا.',
  )}

  <div class="outcome warn"><span class="kv-k">أين العلّة</span><span class="kv-v">
    النطاق يُمنَح <b>بمنتَج يُضاف في بوّابة المنصّة</b>، لا بمفتاح يُكتب هنا.
    والجدول تحت يقول ما طُلب ومَن يمنح كلّ واحد منه.
    <b>ولم يُحفَظ شيء</b> — لا حساب ولا إذن.</span></div>

  <div class="card mt-4">
    <div class="card-head"><h2>${
      named ? 'النطاق الناقص ومَن يمنحه' : 'ما طُلب في هذه المحاولة'
    }</h2></div>
    <p class="hint">${
      named
        ? 'سمّته المنصّة بعينه، <b>فهذا وحده ما ينقص</b>. وما عداه ممنوح أصلا' + (d.platform === 'linkedin'
          // ‏و«تبويب Auth» اسمٌ عند LinkedIn وحدها — لا يُقال لمنصّةٍ لا تبويبَ فيها بهذا الاسم
          ? ' — وتبويب Auth في بوّابتك يُظهر ما مُنح تحت <span class="mono">OAuth 2.0 scopes</span>.'
          : '.')
        : 'المنصّة لم تسمّ نطاقا في جوابها، <b>فكلُّها معروضة</b>. ' +
          'وأكثر ما يقع أن يكون النقص في المنتَج الذي يمنح النشر.'
    } والمنتَج يُمنَح <b>فورا بلا مراجعة</b>.</p>
    <div class="scroll"><table>
      <thead><tr><th>النطاق</th><th>يفتح</th><th>مَن يمنحه</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>

  ${identityBlocked
    ? `<div class="card mt-4">
      <div class="card-head"><h2>ولا يفيدك ربط الهويّة وحدها هنا</h2></div>
      <p class="hint"><b>الناقص هو نطاق الهويّة نفسه</b> — فمحاولة تطلبه وحده
        تُردّ بالردّ نفسه. والمنتَج الذي يمنحه
        <b>${escapeHtml(SCOPES[d.platform].find((s) => blamed.includes(s.name))?.grantedBy ?? '')}</b>،
        ويُضاف في دقيقة بلا مراجعة. <b>أضفه ثمّ أعد المحاولة كاملةً.</b></p>
    </div>`
    : !offerIdentity
    ? ''
    : `<div class="card mt-4">
      <div class="card-head"><h2>ولا تنتظر البوّابة لتربط</h2></div>
      <p class="hint">يمكن الربط <b>بالهويّة وحدها</b> الآن: يُحفَظ الحساب ويظهر باسمه،
        <b>ولا يُنشَر منه شيء</b> حتّى يُضاف المنتَج الناقص ثمّ تضغط «جدّد الإذن».
        وصدى يقرأ ما مُنح فعلا، فلن يحاول نشرا يعرف أنّه سيُردّ.</p>
      <div class="row mt-3">
        ${button({ label: 'اربط الهويّة وحدها', variant: 'primary', href: '/oauth/' + d.platform + '/start?scope=identity' })}
        ${button({ label: 'أعد المحاولة كاملةً', href: '/oauth/' + d.platform + '/start' })}
      </div>
    </div>`}

  ${!identityBlocked
    ? ''
    : `<div class="row mt-4">
        ${button({ label: 'أعد المحاولة كاملةً', variant: 'primary', href: '/oauth/' + d.platform + '/start' })}
      </div>`}

  ${guide === undefined
    ? ''
    : `<div class="card guide mt-4">
      <div class="card-head"><h2>الخطوات في ${escapeHtml(guide.portalLabel)}</h2></div>
      <ol class="steps">${guide.before
        .map(
          (b, i) => `<li><span class="step-n">${i + 1}</span><span class="body">
            <span class="what">${pathArrows(b.what)}</span><span class="why">${pathArrows(b.why)}</span></span></li>`,
        )
        .join('')}</ol>
      ${/*
       * **الخطواتُ في عمودٍ وما بعدها في الآخر** (D-137): البابُ و«إن نجح»
       * بجانب الخطوات على العريض لا تحتها — كانت البطاقةُ جوفاءَ نصفِها.
       */''}
      <div class="guide-aside">
        ${button({ label: 'افتح ' + guide.portalLabel, size: 'sm', href: guide.portal, attrs: 'target="_blank" rel="noopener noreferrer"' })}
        <div class="outcome"><span class="kv-k">إن نجح</span>
          <span class="kv-v">${pathArrows(guide.success)}</span></div>
      </div>
    </div>`}

  <div class="row mt-4">
    ${ACCOUNTS}
  </div>`
}

/**
 * ‏**سرّان حُذفا بين الذهاب والعودة: صفحةٌ لا وميض** (مراجعة ر-1).
 *
 * ‏في `/start` يكفي الوميض: الطلبُ من اللوحة نفسِها فتُرسَل كعكةُ الجلسة. أمّا العودةُ
 * ‏فتحويلٌ من نطاق المنصّة، **وكعكةُ الجلسة `SameSite=Strict` لا تعبره** — فلا يُكتب
 * ‏وميضٌ، ثمّ يُرسَل المالكُ إلى الإعداد بلا كلمة. فالسببُ هنا، وزرٌّ إلى حقلَي التطبيق
 * ‏يُضغط من صفحتنا فتصل الكعكةُ معه. ولا يُذكر معرّفٌ ولا سرّ: «ينقص» لا قيمةَ معها.
 */
export function unconfiguredBody(platform: Platform): string {
  const label = LABEL[platform]
  return `${head(platform, 'لم يكتمل', 'لم يكتمل الربط',
    `وافقت ${escapeHtml(label)}، ثمّ لم نجد عندنا معرّف تطبيقها وسرَّه — حُذفا بعد أن بدأ الربط. <b>ولم يُحفَظ شيء.</b>`)}
  <div class="card">
    <h2>ما يُفعَل</h2>
    <p class="hint">اضبط المعرّف والسرّ في تبويب الإعداد، ثمّ «اربط ${escapeHtml(label)}» من جديد.</p>
    <div class="row mt-3">
      ${button({ label: 'اضبط المعرّف والسرّ', variant: 'primary', href: setupHref(platform) })}
      ${ACCOUNTS}
    </div>
  </div>`
}

/** الحسابُ مربوطٌ في منظّمةٍ أخرى (D-229): لم يُنقَل ولم يُحفَظ رمز. */
export function elsewhereBody(platform: Platform, displayName: string): string {
  const label = LABEL[platform]
  return `${head(platform, 'لم يكتمل', 'الحساب مربوط في منظّمة أخرى',
    `وافقت ${escapeHtml(label)} على «${escapeHtml(displayName)}»، وهو مربوط من قبل في منظّمة أخرى. <b>ولم يُنقَل منها ولم يُحفَظ شيء.</b>`)}
  <div class="card">
    <h2>ما يُفعَل</h2>
    <p class="hint">انتقل إلى المنظّمة التي تملكه من الإعدادات، أو افصله منها أوّلًا ثمّ اربطه هنا.</p>
    <div class="row mt-3">
      ${button({ label: 'المنظّمات', variant: 'primary', href: panelHref('orgs') })}
      ${ACCOUNTS}
    </div>
  </div>`
}

/**
 * **العودةُ من متصفّحٍ غير الذي بدأ** (D-318). رابطُ الموافقة يحمل حالةً مربوطةً بكعكةٍ في متصفّح من ضغط «اربط»؛ فإن فُتح
 * في متصفّحٍ آخر — أو أُرسل إلى شخصٍ آخر — لا يُربَط شيء. ويُقال ذلك بلا اتّهام: أكثرُ ما يقع أن يبدأ المالكُ من حاسوبه
 * ويُكمل من هاتفه.
 */
export function otherBrowserBody(platform: Platform): string {
  const label = LABEL[platform]
  return head(platform, 'لم يكتمل', 'الربطُ بدأ في متصفّحٍ آخر',
    'عاد ' + escapeHtml(label) + ' إلى صدى في متصفّحٍ غير الذي ضُغط فيه «اربط». <b>ولم يُربَط حسابٌ ولم يُحفَظ شيء.</b>') + `
  <div class="card">
    <h2>ما يُفعَل</h2>
    <p class="hint">ابدأ الربطَ من جديد وأكمله في المتصفّح نفسِه. وإن وصلك رابطُ موافقةٍ من شخصٍ آخر فلا تكمله:
      الربطُ يبدأ من لوحتك أنت.</p>
    <div class="row mt-3">
      ` + button({ label: 'الحسابات', variant: 'primary', href: panelHref('channels') }) + `
    </div>
  </div>`
}

export interface UnreachedData {
  readonly platform: Platform
  /**
   * ‏أين وقف: `start` قبل الذهاب إلى المنصّة، و`reach` في طريق الرمز أو الهويّة ولم
   * ‏يُكتب شيء، و`save` بعد أن ردّت المنصّةُ وتعذّر الحفظُ عندنا.
   */
  readonly stage: 'start' | 'reach' | 'save'
  /** ‏اسمُ العطل وسطرُه بلا استعلام رابط — للمطوّر وحده. */
  readonly detail: string
}

/**
 * ‏**عطلٌ لم نعرفه: صفحةٌ هادئةٌ لا «Internal Server Error»** (ر-1 · خطّة التصميم 7.11).
 *
 * ‏المالكُ وافق عند المنصّة ثمّ وصله سطرٌ نصّيٌّ بلا رابطٍ ولا رجوع، والحالةُ استُهلكت
 * ‏فلا يصلحه رجوعٌ ولا تحديث. فالصفحةُ تقول ما وقع وما حُفظ، وزرُّها الأوّلُ محاولةٌ
 * ‏جديدةٌ من البداية، والتفصيلُ تحت «للمطوّر» ليُرسَل كما هو.
 */
export function unreachedBody(d: UnreachedData): string {
  const label = LABEL[d.platform]
  const title = d.stage === 'save' ? 'لم يُحفَظ الربط' : d.stage === 'start' ? 'لم يبدأ الربط' : `لم نصل إلى ${label} الآن`
  const lede = d.stage === 'save'
    ? `وافقت ${escapeHtml(label)}، ثمّ تعذّر الحفظ عندنا. <b>أعد المحاولة</b>؛ وإن ظهر الحساب «بلا إذن» فالمحاولة نفسُها تُصلحه.`
    : d.stage === 'start'
      ? 'تعذّرت قراءة ضبط التطبيق قبل الذهاب إلى المنصّة. <b>ولم يُحفَظ شيء.</b>'
      : `انقطع الطريق إلى ${escapeHtml(label)} قبل أن يكتمل الربط. <b>ولم يُحفَظ شيء</b> — لا حساب ولا إذن.`
  return `${head(d.platform, 'لم يكتمل', title, lede)}
  <div class="card">
    <h2>ما يُفعَل</h2>
    <p class="hint">أعد المحاولة بعد دقيقة. فإن تكرّر هذا فأرسل إليّ ما تحت «للمطوّر» كما هو.</p>
    <div class="row mt-3">
      ${button({ label: 'أعد المحاولة', variant: 'primary', href: '/oauth/' + d.platform + '/start' })}
      ${button({ label: 'صفحة ' + label, href: '/panel/channels/' + d.platform })}
    </div>
    <details class="mt-3"><summary>للمطوّر</summary>
      <p class="hint"><span class="mono">${escapeHtml(d.detail)}</span></p></details>
  </div>`
}
