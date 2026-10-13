/**
 * قسمُ القنوات.
 *
 * ## الشعاراتُ مرسومةٌ لا مُحمَّلة
 *
 * السياسةُ `img-src 'self' data:` تمنع صورةً من نطاقٍ آخر — وهو منعٌ
 * مقصود. فالشعاراتُ أشكالٌ هندسيّةٌ بسيطةٌ تُرسم بـ SVG داخل الصفحة:
 * لا نداءَ شبكةٍ يُسرّب أنّ لوحتك فُتحت، ولا صورةٌ تختفي حين يتبدّل
 * عنوانُها عند صاحبها.
 *
 * وهي **إشاراتٌ تُميّز لا نسخٌ من العلامات التجاريّة**: حرفٌ أو شكلٌ
 * يكفي العينَ لتفرز البطاقات.
 *
 * ## ولا زرَّ لا يعمل
 *
 * لكلّ حالٍ ما يليق بها: زرُّ ربطٍ حيث الربط ممكن، وإرشادٌ حيث ينقص
 * سرّ، **ولا شيء** حيث لم يُبنَ سائق. وزرٌّ يُعرض ثمّ يقول «غير مدعوم»
 * أسوأ من غيابه: يجعل المالك يشكّ في ضبطه لا في نضج النظام.
 */
import { stamp } from '../../lib/time/zone'
import { callbackStep, SETUP, setupHref, tokenHealth, unsignedAccounts, type ChannelView, type LinkedAccount } from '../../lib/channels'
import type { AppStatus } from '../../lib/oauth/apps'
import { wizardFor, type Step } from '../../lib/oauth/wizard'
import { ICON } from './icons'
import { escapeHtml } from './escape'
import { LOGOS } from './logos'
import { counted, NOUNS, relativeTime } from '../../lib/format'
import { glyph, pathArrows } from './parts'
import { statusBadge, type Tone } from './components/badge'
import { returnTo } from '../../lib/nav/back'

const KIND: Readonly<Record<string, string>> = {
  member: 'حسابٌ شخصيّ',
  org: 'صفحةٌ أو شركة',
}

/**
 * لوحُ ضبط التطبيق (D-042).
 *
 * ## الإرشادُ بجانب الحقل لا في وثيقة
 *
 * مالكٌ يجد حقلين فارغين ثمّ يبحث عن معناهما يتوقّف. فتحت كلّ حقلٍ من
 * أين تأتي قيمتُه، وقبلَهما ما يجب أن يتمّ أوّلا **ولماذا** — ورابطُ
 * العودة معروضٌ ليُنسَخ لا ليُكتب.
 *
 * ## والسرُّ يُكتب ولا يُقرأ
 *
 * الحقلُ يبقى فارغا دائما ولو كان محفوظا: يُعرض قناعُه بجانبه، فيعرف
 * المالك أنّ هناك سرّا ولا يُكشَف. **وحقلٌ يُملأ بالمحفوظ يُسرّبه إلى
 * كلّ من يفتح الصفحة.**
 *
 * ## وسرُّ Worker لا يُدهَس صامتا
 *
 * حيث تكون البيئةُ هي المصدر، **لا نموذجَ يُعرض**: النموذجُ يوهم بأنّ
 * الكتابةَ فيه تغيّر المستعمَل، وهي لا تغيّره (D-030).
 */
/**
 * شريطُ الخطوات الأربع.
 *
 * **ولا علامةَ صحٍّ على ما لم يُتحقَّق منه.** أربعُ حالاتٍ لا اثنتان:
 * تمّت · الآن · تنتظر · **لا يُعرَف من هنا** · رُدّت. والخامسةُ
 * والرابعةُ هما ما يفرق هذا عن شريطِ تقدّمٍ يزيّن.
 *
 * والرمزُ **مع النصّ لا وحدَه**: لونٌ أو شكلٌ بلا كلمةٍ لا يُقرأ بصوتٍ
 * عالٍ، ولا يفرزه من لا يميّز الألوان (D-043).
 */
const STEP_MARK: Readonly<Record<Step['state'], { g: string; cls: Tone; label: string }>> = {
  done: { g: '●', cls: 'ok', label: 'تمّت' },
  now: { g: '◍', cls: 'warn', label: 'الآن' },
  waiting: { g: '○', cls: 'idle', label: 'تنتظر' },
  unknowable: { g: '?', cls: 'idle', label: 'لا يُعرَف من هنا' },
  failed: { g: '▲', cls: 'bad', label: 'رُدّت' },
}

function wizardStrip(view: ChannelView, app: AppStatus | undefined): string {
  const w = wizardFor(view, app)
  const rows = w.steps
    .map((step) => {
      const mark = STEP_MARK[step.state]
      return `<li class="${mark.cls}${step.state === 'now' ? ' at' : ''}">
        <span class="step-n" aria-hidden="true">${step.n}</span>
        <span class="body">
          <span class="what">${escapeHtml(step.title)}</span>
          <span class="why">${step.proof.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</span>
        </span>
        ${statusBadge(mark.cls, mark.g, mark.label)}
      </li>`
    })
    .join('')

  const done = w.steps.filter((x) => x.state === 'done').length
  const tally = `${done} من ${w.steps.length} ثبتت`

  /*
   * **والطريقُ التامُّ يُطوى** (D-084).
   *
   * كان يُعرض كاملا لكلّ قناة: أربعُ خطواتٍ بشروحها، **مضروبةً في عدد
   * القنوات**. فقارئُ اللوح يمرّ بأربعِ نسخٍ من الطريق نفسِه قبل أن
   * يبلغ ما ينتظره فعلا.
   *
   * وهو لا يُحذَف: **يُراجَع عند كلّ تبديل**، وضغطةٌ تعيده. والمهمُّ أنّ
   * ما تمّ لا يزاحم ما لم يتمّ.
   */
  if (w.linked) {
    return `<details class="card card-inset guide mb-3">
      <summary>
        <span class="g-ic">${ICON.guide}</span>
        <span class="g-t"><b>الطريقُ إلى الربط — تمّ كلُّه</b>
          <span>${tally}. والخطواتُ تبقى لتُراجَع عند أيّ تبديل.</span></span>
        <span class="grow"></span>
        <span class="g-tog"><span class="lbl-open">افتح</span><span class="lbl-close">أغلق</span></span>
      </summary>
      <div class="guide-body"><ol class="steps wiz">${rows}</ol></div>
    </details>`
  }

  const head = w.current === null
    ? '<b>الطريق.</b>'
    : `<b>أنت عند الخطوة ${w.current} من ${w.steps.length}.</b>`

  return `<div class="card mb-3">
    <div class="card-head"><h2>الطريقُ إلى الربط</h2><div class="grow"></div>
      <span class="chip">${tally}</span></div>
    <p class="hint">${head}</p>
    <ol class="steps wiz">${rows}</ol>
  </div>`
}

/*
 * **ولصيقةٌ تُقرأ وحدَها تُسمّي وجهتَها** (D-122).
 *
 * ستُّ بطاقاتٍ تحمل «اضبط سرّيه» تذهب إلى ستّ شاشات. **والعينُ تفرّق
 * بينها بالبطاقة التي حولها، وقارئُ الشاشة لا يرى البطاقة**: يسرد
 * الروابطَ فيقول «اضبط سرّيه» ستَّ مرّات.
 *
 * فيُضاف `aria-label` يسمّي المنصّة، **ويبقى النصُّ المرئيُّ قصيرا** —
 * فلا يُمدَّد الزرُّ في بطاقةٍ ضيّقة.
 *
 * **وفعلان مختلفان لا يتسمّيان باسمٍ واحد.** زرُّ البطاقة يفتح شاشةَ
 * المنصّة، وزرُّ التنبيه **ينتقل إلى البطاقة في الشاشة نفسِها** — فلمّا
 * تسمّيا «اضبط سرّيه» معا صار الاسمُ الواحدُ يعني فعلين. فسُمّي كلٌّ
 * بما يفعل، **والقياسُ هو الذي فرّقهما**: لصيقةٌ واحدةٌ إلى وجهتين.
 */
export function setupPane(view: ChannelView, app: AppStatus | undefined, base: string): string {
  const guide = SETUP[view.spec.id]
  if (guide === undefined || app === undefined) return ''

  const callback = `${base.replace(/\/+$/, '')}/oauth/${view.spec.id}/callback`
  const wizard = wizardStrip(view, app)

  if (app.source === 'worker_secret') {
    return `${wizard}<div class="card card-inset guide"><div class="guide-body">
      <div class="help"><span class="help-ic">i</span><span class="help-t">
        <b>مضبوطٌ من أسرار Worker — وسرُّ البيئة يغلب الخزانة دائما.</b>
        فلا نموذجَ هنا: الكتابةُ فيه لن تغيّر ما يُستعمَل. ولتبديله، بدّله حيث هو —
        <span class="mono">${escapeHtml(app.secretNames[1])}</span>.</span></div>
      ${app.clientId === null ? '' : `<p class="ch-note">المعرّف الحاليّ:
        <span class="mono">${escapeHtml(app.clientId)}</span></p>`}
      <form method="POST" action="/panel/channels/app/verify" data-busy="جارٍ الفحص…">
        <input type="hidden" name="platform" value="${escapeHtml(view.spec.id)}">
        <input type="hidden" name="return" value="${escapeHtml(returnTo(view.spec.id, 'setup'))}">
        <button class="btn btn-secondary btn-sm" type="submit">افحص الزوج</button>
        <span class="ago">يسأل المنصّةَ أتقبل هذا الزوج — بلا دورةِ إذن، وبلا
          إذنِ وصولٍ يُنتَج.</span>
      </form>
    </div></div>`
  }

  const steps = guide.before
    .map(
      (b, i) => `<li><span class="step-n">${i + 1}</span>
        <span class="body"><span class="what">${pathArrows(b.what)}</span>
        <span class="why">${pathArrows(b.why)}</span></span></li>`,
    )
    .join('')

  const saved =
    app.source === 'vault'
      ? `<div class="help"><span class="help-ic">${glyph('✓')}</span><span class="help-t">
         <b>محفوظ.</b> المعرّف <span class="mono">${escapeHtml(app.clientId ?? '')}</span> ·
         السرّ <span class="mono">${escapeHtml(app.hint ?? '')}</span>
         ${app.updatedBy === null ? '' : `· بدّله ${escapeHtml(app.updatedBy)}`}</span></div>`
      : ''

  const id = view.spec.id
  const fresh = app.source === 'none'
  /*
   * ‏**ويبقى مفتوحًا ما دام الضبطُ لم يُثبَت** (ر-1): كان يُطوى بعد أوّل حفظ، فزرُّ «افحص
   * ‏الزوج» والحقلان خلف ضغطةٍ في اللحظة التي يُحتاجان فيها. فيُطوى حين يُربَط حسابٌ أو
   * ‏يجوز الفحص، ويُفتَح من جديدٍ إن ردّت المنصّةُ الزوج.
   */
  const rejected = app.verifiedKind === 'bad_secret' || app.verifiedKind === 'bad_client_id'
  const open = fresh || rejected || (view.accounts.length === 0 && app.verifiedKind !== 'accepted')
  const step = callbackStep(guide)
  return `${wizard}<details class="card card-inset guide"${open ? ' open' : ''}>
    <summary>
      <span class="g-ic">${ICON.guide}</span>
      <span class="g-t"><b>${fresh ? 'دليلُ ضبط التطبيق' : 'الدليل وتبديلُ الأسرار'}</b>
        <span>${guide.before.length} خطواتٍ في ${escapeHtml(guide.portalLabel)}، ثمّ سرّان هنا.</span></span>
      <span class="grow"></span>
      <span class="g-tog"><span class="lbl-open">افتح</span><span class="lbl-close">أغلق</span></span>
    </summary>
    <div class="guide-body">
      ${saved}

      <a class="btn btn-secondary btn-sm portal" href="${escapeHtml(guide.portal)}" target="_blank"
        rel="noopener noreferrer">${ICON.external} افتح ${escapeHtml(guide.portalLabel)}</a>

      <ol class="steps">${steps}</ol>
      ${/*
        * ‏**والتنبيهُ بعد الخطوات بعنوانه، لا تحت لصيقة الرابط** (ر-1): تحتها يُقرأ
        * ‏تعليمةً عن الرابط، وأكثرُه عن غيره (نوعُ المنشور، ومعاملاتٌ في الشيفرة).
        */ ''}
      <div class="help"><span class="help-ic">!</span><span class="help-t"><b>انتبه.</b> ${pathArrows(guide.gotcha)}</span></div>

      <div class="field cb">
        <label for="cb-${id}">رابطُ العودة</label>
        <div class="help" id="cb-${id}-h"><span class="help-ic">؟</span><span class="help-t">انسخه بزرّ «انسخ»${
          step === null ? '' : ` والصقه في الخطوة ${step} أعلاه`}.</span></div>
        <div class="copy">
          <input id="cb-${id}" class="mono" dir="ltr" value="${escapeHtml(callback)}" readonly
            aria-label="رابط العودة — للنسخ" aria-describedby="cb-${id}-h">
          <button type="button" class="btn btn-secondary btn-sm" data-copy="cb-${id}">انسخ</button>
        </div>
      </div>

      <form method="POST" action="/panel/channels/app" data-busy="جارٍ الحفظ…">
        <input type="hidden" name="platform" value="${escapeHtml(id)}">
        ${/*
          * ‏**والفعلُ يعود إلى هذا التبويب** (ر-1): كان «احفظ» و«افحص الزوج» و«احذف» تنتهي
          * ‏بلوح القنوات، فيقرأ المالكُ الإشعارَ هناك ويمرّر شاشتين إلى «اربط»، والحقولُ ضاعت.
          */ ''}<input type="hidden" name="return" value="${escapeHtml(returnTo(id, 'setup'))}">
        <div class="field">
          <label for="ci-${id}">Client ID</label>
          <div class="help" id="ci-${id}-h"><span class="help-ic">؟</span>
            <span class="help-t">${pathArrows(guide.whereId)}</span></div>
          <input id="ci-${id}" name="client_id" dir="ltr" required pattern="\\S.*"
            title="الصق المعرّف — الفراغُ وحدَه لا يكفي" aria-describedby="ci-${id}-h"
            value="${escapeHtml(app.clientId ?? '')}" autocomplete="off" spellcheck="false">
          ${/*
            * **الفخُّ الذي أضاع ساعة** (D-074).
            *
            * حقلُ المعرّف يُملأ من المحفوظ، وحقلُ السرّ يبقى فارغا
            * دائما. فمن أنشأ تطبيقا جديدا يلصق سرَّه **ولا ينتبه أنّ
            * المعرّفَ فوقه لتطبيقٍ آخر** — فيُحفَظ زوجٌ مختلط: معرّفٌ
            * قديم وسرٌّ جديد. **وجوابُه `invalid_client` مهما نُسخ
            * السرُّ حرفا حرفا**، والرسالةُ تتّهم السرَّ وهو سليم.
            */ ''}${app.clientId === null
            ? ''
            : `<div class="help"><span class="help-ic">!</span><span class="help-t">
                <b>هذا المعرّفُ محفوظٌ من قبل — والسرُّ أدناه يبدأ فارغا دائما.</b>
                فإن كنتَ تنسخ السرَّ من <b>تطبيقٍ آخر</b> (أنشأتَه حديثا مثلا)
                <b>فبدّل المعرّفَ معه</b>: سرٌّ صحيحٌ على معرّفٍ قديم يُردّ
                <span class="mono">invalid_client</span> — والرسالةُ تتّهم السرَّ وهو سليم.</span></div>`}
        </div>
        <div class="field">
          <label for="cs-${id}">Client Secret</label>
          <div class="help" id="cs-${id}-h"><span class="help-ic">؟</span>
            <span class="help-t">${pathArrows(guide.whereSecret)}</span></div>
          <input id="cs-${id}" name="client_secret" type="password" dir="ltr" required pattern="\\S.*"
            title="الصق السرّ — الفراغُ وحدَه لا يكفي"
            aria-describedby="cs-${id}-h"
            placeholder="${app.source === 'vault' ? 'اكتبه لتبديله' : ''}"
            autocomplete="off" spellcheck="false">
          ${app.hint === null
            ? ''
            : `<div class="help"><span class="help-ic">i</span><span class="help-t">
                المحفوظُ الآن <span class="mono">${escapeHtml(app.hint)}</span> —
                <b>قارنه بأوّل السرّ وآخرِه في ${escapeHtml(guide.portalLabel)}</b> قبل أن تكتب.
                فإن طابق فالسرُّ ليس العلّة، <b>وانظر في المعرّف أعلاه</b>.</span></div>`}
        </div>
        <div class="ch-foot">
          <button class="btn btn-primary" type="submit">احفظ</button>
          ${app.source === 'none'
            ? ''
            : `<button class="btn btn-secondary btn-sm" type="submit" formaction="/panel/channels/app/verify"
                 formnovalidate>افحص الزوج</button>`}
          <span class="ago">يُشفَّر قبل أن يُحفظ، ولا يُعرض بعدها إلّا مقنَّعا.</span>
          <span class="grow"></span>
          ${app.source === 'vault'
            ? `<button class="btn btn-danger btn-sm" type="submit" formaction="/panel/channels/app/delete" formnovalidate
                 data-confirm="سيُحذف السرُّ المحفوظ ويتوقّف الربط. أتمضي؟">احذف</button>`
            : ''}
        </div>
        ${app.source === 'none' ? '' : `<div class="sub mt-2">
          <b>«افحص الزوج»</b> يسأل ${escapeHtml(guide.portalLabel)} سؤالا واحدا —
          <b>أتقبل هذا المعرّفَ وهذا السرّ؟</b> — بمسار
          <span class="mono">client_credentials</span> الذي <b>لا منحةَ فيه تُفحَص</b>،
          فلا يبقى إلّا التوثيق. ويفرّق الجوابُ بين <b>سرٍّ خاطئ</b> و<b>معرّفٍ
          مجهول</b>، فلا تفتّش في الحقلين معا. ولا يُنتَج إذنُ وصولٍ لصدى، ولا
          تُنفَق فلسا.</div>`}
      </form>

      <div class="outcome"><span class="kv-k">إن نجح</span>
        <span class="kv-v">${pathArrows(guide.success)}</span></div>
      <div class="outcome warn"><span class="kv-k">إن فشل</span>
        <span class="kv-v">${pathArrows(guide.failure)}</span></div>
    </div>
  </details>`
}

/** بطاقةُ قناةٍ واحدة. */
function card(view: ChannelView, now: Date, app: AppStatus | undefined, base: string): string {
  const { spec, state, accounts, missing } = view
  const logo = LOGOS[spec.id] ?? ''

  // **والصفُّ لا الكلمة** (D-159): حسابٌ «مربوطٌ» بلا صفّ `tokens` كان
  // يُعرَض أخضرَ ثمّ يسقط أوّلُ منشورٍ في الطابور. وهو حالُ LinkedIn على staging
  const unsigned = unsignedAccounts(view)
  const badge =
    unsigned.length > 0
      ? statusBadge('bad', '▲', 'مربوطة بلا إذن')
      : state === 'linked'
        ? statusBadge('ok', '●', 'مربوطة')
      : state === 'needs_reauth'
        ? statusBadge('bad', '▲', 'تحتاج تجديدا')
        : state === 'connectable'
          ? statusBadge('idle', '○', 'جاهزةٌ للربط')
          : state === 'awaiting_owner'
            ? statusBadge('warn', '!', 'تنتظرك')
            : statusBadge('idle', '○', 'لم تُبنَ')

  const rows = accounts
    .map(
      (a) => `<div class="ch-acc">
        <span class="who"><bdi>${escapeHtml(a.displayName)}</bdi></span>
        <span class="chip">${escapeHtml(KIND[a.kind] ?? a.kind)}</span>
        ${a.status === 'needs_reauth'
          ? ''
          : a.expiresAt === null
            ? statusBadge('bad', '▲', 'بلا إذنٍ محفوظ', 'title="لا صفَّ في tokens لهذا الحساب — أعد الربط"')
            : tokenDays(a.expiresAt, now, a)}
        <span class="grow"></span>
        ${a.status === 'needs_reauth'
          ? statusBadge('bad', '▲', 'جدّد الإذن')
          : `<span class="ago" title="${escapeHtml(stamp(a.createdAt, null))}">رُبط ${escapeHtml(
              relativeTime(a.createdAt, now),
            )}</span>`}
      </div>`,
    )
    .join('')

  // ما يُقال ولمَ: كلُّ حالٍ لها جملتُها، ولا تُترك حالٌ بلا تفسير
  // **والمرتبةُ تُقال قبل كلّ شيء**: منصّةٌ تُربَط ولا تنشر يجب أن
  // يعرف مالكُها ذلك **قبل** أن يربط، لا بعد أوّل جدولةٍ تُردّ
  const stageNote =
    spec.stage === 'link'
      ? `<div class="why warn"><span class="why-ic">${glyph('◍')}</span><span class="why-t">
         <b>تُربَط ولا تنشر بعد.</b> دورةُ الإذن مبنيّةٌ لها، وسائقُ الرفع لم يُبنَ —
         فيُحفَظ الحساب وتُقرأ نطاقاتُه، <b>ولا تُكتب لها مسوّدة</b>.</span></div>`
      : ''

  const note =
    state === 'awaiting_owner'
      ? `ينقص سرّا التطبيق. <b>اضبطهما في شاشة ${escapeHtml(spec.label)}</b> — أو من
         أسرار Worker باسمَي
         <span class="mono">${missing.map(escapeHtml).join('</span> و <span class="mono">')}</span>.`
      : state === 'needs_reauth'
        ? 'إذنُ الوصول انتهى أو سُحب. <b>والنشر متوقّفٌ على هذه القناة حتّى تُجدّده</b> — ويقع صامتا لولا هذا التنبيه.'
        : unsigned.length > 0
          ? `الحسابُ محفوظٌ <b>ولا إذنَ وصولٍ معه</b> — أوّلُ منشورٍ مجدولٍ سيسقط. أعد الربطَ ليُحفَظ الإذن.`
          : escapeHtml(spec.note)

  // زرُّ الربط لا يُعرض إلا حيث يعمل. و «اربط» فعلٌ يغادر اللوحة إلى
  // المنصّة، فهو رابطٌ لا نموذج — ولا رمز CSRF على انتقالٍ لا يغيّر شيئا
  const action =
    state === 'connectable'
      ? `<a class="btn btn-primary btn-sm" href="/oauth/${escapeHtml(spec.id)}/start">اربط ${escapeHtml(spec.label)}</a>`
      : state === 'needs_reauth'
        ? `<a class="btn btn-primary btn-sm" href="/oauth/${escapeHtml(spec.id)}/start"
              aria-label="جدّد إذن ${escapeHtml(spec.label)}">جدّد الإذن</a>`
        : state === 'linked' && unsigned.length > 0
          ? `<a class="btn btn-primary btn-sm" href="/oauth/${escapeHtml(spec.id)}/start"
                aria-label="أعد ربط ${escapeHtml(spec.label)}">أعد الربط</a>`
        : state === 'linked'
          ? `<a class="btn btn-secondary btn-sm" href="/oauth/${escapeHtml(spec.id)}/start">اربط حسابا آخر</a>`
          : state === 'awaiting_owner'
            /*
             * **وزرٌّ يقود إلى الضبط لا شارةٌ تصفه** (D-111).
             *
             * كانت شارةً جامدةً تقول «بلا سرٍّ لا يبدأ الربط» — **تصف
             * المانعَ ولا تفتح بابَه**. ولمّا انتقل الدليلُ إلى شاشة
             * المنصّة صار للمانع موضعٌ يُقصَد، **فيُقصَد**.
             */
            ? `<a class="btn btn-primary btn-sm" href="${escapeHtml(setupHref(spec.id))}">اضبط ${escapeHtml(spec.label)}</a>`
            /*
             * ‏**جملةٌ لا شارة** (D-185): الحالُ «لم تُبنَ» في رأس البطاقة، وهذا سببُها.
             * ‏وكانت شارةً ثانيةً بالحال نفسِه — والشارةُ لصيقةٌ ‏١٣px «لا جُمَل» (خطّة التصميم 4.3)
             */
            : '<span class="ago">يحتاج سائقا يُكتب له</span>'

  // اسمُ القناة رابطٌ إلى شاشتها: البطاقةُ تقول «أمربوطةٌ أم لا»،
  // والشاشةُ تقول ماذا نُشر وما فشل ولماذا — وهما سؤالان لا واحد
  return `<div class="card ch${state === 'unbuilt' ? ' off' : ''}" id="ch-${escapeHtml(spec.id)}">
    <div class="ch-top">
      <div class="ch-logo">${logo}</div>
      <div class="ch-name"><a class="tap" href="/panel/channels/${escapeHtml(spec.id)}"
        >${escapeHtml(spec.label)}</a>
        <span>${accounts.length === 0 ? 'لا حساب' : `${accounts.length} حساب`}</span></div>
      <span class="grow"></span>${badge}
    </div>
    ${rows}
    ${stageNote}
    <p class="ch-note">${note}</p>
    <div class="ch-foot">${action}
      <span class="grow"></span>
      <a class="btn btn-secondary btn-sm" href="/panel/channels/${escapeHtml(spec.id)}">شاشةُ ${escapeHtml(
        spec.label,
      )}</a></div>
  </div>`
}

/**
 * **عدُّ الأيّام على البطاقة** (D-126) — **من الرمزين معًا** (خطّة التصميم 5.7).
 *
 * تنبيهُ صدر اللوحة يقول «يبقى ‏٧ أيّام» حين يعبر الرمزُ عتبةً (D-065)،
 * **والبطاقةُ التي تصف الحسابَ نفسَه كانت لا تقوله** — والحقلُ في القاعدة.
 * فيُقرأ من الحقل نفسِه: أسبوعٌ فأقلُّ تحذير، وما انتهى خطر، وما فوق ذلك
 * رقاقةٌ هادئة. ولا إذنَ محفوظًا — لا شيء، لا «غير معروف».
 *
 * ‏**وما يتجدّد وحده رقاقةٌ هادئة** (ر-1): كانت X وYouTube «ينتهي الإذن اليوم» برتقاليّةً
 * ‏وإذنُ وصولهما ساعتان تجدّدهما الدورةُ، والبلاطةُ فوقهما «تحتاج تجديدا 0». والحكمُ من
 * ‏`tokenHealth` في `lib/channels` مرّةً، تقرؤه البطاقةُ والبلاطة. و`renew` غائبٌ يعني
 * ‏إذنَ الوصول وحده كما كان.
 */
export function tokenDays(
  expiresAt: string | null,
  now: Date,
  renew: Pick<LinkedAccount, 'renewable' | 'refreshExpiresAt'> = {},
): string {
  const h = tokenHealth({ expiresAt, ...renew }, now)
  if (h === null || expiresAt === null) return ''
  const title = renew.renewable === true
    ? `title="يتجدّد إذنُ الوصول وحده${h.kind === 'auto' && h.at === null ? '' : ` حتّى ${escapeHtml(stamp(h.at ?? '', null))}`}"`
    : `title="ينتهي إذنُ الوصول ${escapeHtml(stamp(expiresAt, null))}"`
  switch (h.kind) {
    case 'expired':
      return statusBadge('bad', '▲', 'انتهى الإذن', title)
    case 'soon':
      // ‏والعددُ بمعدوده (D-183): كان «يبقى 2 يومان» و«الإذن 9 يوما»
      return statusBadge('warn', '◍', h.days === 0 ? 'ينتهي الإذن اليوم' : `يبقى ${counted(h.days, NOUNS.day)} للإذن`, title)
    case 'overdue':
      return statusBadge('warn', '◍', 'تأخّر التجديد', `title="انتهى إذنُ الوصول ${escapeHtml(stamp(h.at, null))} وإذنُ التجديد قائم — تجدّده الدورةُ القادمة"`)
    case 'auto':
      return `<span class="chip" ${title}>يتجدّد تلقائيًّا</span>`
    case 'ok':
      return `<span class="chip" ${title}>الإذن ${counted(h.days, NOUNS.day)}</span>`
  }
}

export function channelsSection(
  views: readonly ChannelView[],
  now: Date,
  apps: readonly AppStatus[] = [],
  base = '',
): string {
  const byPlatform = new Map(apps.map((a) => [String(a.platform), a]))
  const built = views.filter((v) => v.spec.built)
  const rest = views.filter((v) => !v.spec.built)
  const linked = built.filter((v) => v.state === 'linked' || v.state === 'needs_reauth').length

  /**
   * **ما ينتظرك الآن — فوق كلّ شيء** (D-084).
   *
   * رمزُ X انتهى فتوقّف النشرُ عليها، **والتنبيهُ كان في وسط تمريرٍ من
   * ثلاثة آلاف بكسل**. وعطلٌ صامتٌ لا يُرى ليس أهونَ من عطلٍ لا يُكتشَف:
   * كلاهما ينتهي بمنشورٍ لم يخرج.
   *
   * وترتيبُه بالضرر لا بالأبجديّة: **ما يوقف نشرا قائما قبل ما يمنع
   * نشرا لم يبدأ**.
   */
  const unsignedOf = (v: ChannelView): boolean => unsignedAccounts(v).length > 0
  /*
   * ‏**والجاهزةُ للربط تبقى في القائمة** (ر-1): بعد حفظ سرَّي TikTok خرجت منها، وزرُّ
   * ‏«اربط TikTok» على بُعد شاشتين. وهي آخرُها: لا نشرَ قائمٌ يتوقّف بتركها.
   */
  const urgent = [
    ...built.filter((v) => v.state === 'needs_reauth'),
    ...built.filter(unsignedOf),
    ...built.filter((v) => v.state === 'awaiting_owner'),
    ...built.filter((v) => v.state === 'connectable'),
  ]
  const waiting = urgent.length === 0
    ? ''
    // ‏بلا إطارٍ مكتوبٍ بلون التحذير (D-183): كان «border-color:var(--warn)» في
    // ‏الوسم، يُقرأ ذهبًا في الليل ويُسقط لونًا خارج الورقة. والحالُ في حبّتها
    : `<div class="card mb-4">
        <div class="card-head"><h2>ما ينتظرك الآن</h2><div class="grow"></div>
          ${statusBadge('warn', '!', counted(urgent.length, NOUNS.channel))}</div>
        <ul class="todo">${urgent.map((v) => `<li>
          <span class="dot ${v.state === 'needs_reauth' || unsignedOf(v) ? 'bad' : 'warn'}"></span>
          <span><b>${escapeHtml(v.spec.label)}</b> — ${v.state === 'needs_reauth'
            ? 'إذنُ الوصول انتهى أو سُحب، <b>والنشرُ عليها متوقّف</b>.'
            : unsignedOf(v)
              ? 'الحسابُ محفوظٌ <b>ولا إذنَ وصولٍ معه</b> — أوّلُ منشورٍ مجدولٍ سيسقط.'
              : v.state === 'connectable'
                ? 'سرّا التطبيق محفوظان، <b>وبقي أن تربط حسابك</b>.'
                : 'ينقص سرّا التطبيق، فلا يبدأ الربط.'}</span>
          ${v.state === 'needs_reauth' || unsignedOf(v)
            ? `<a class="btn btn-primary btn-sm" href="/oauth/${escapeHtml(v.spec.id)}/start"
                  aria-label="${v.state === 'needs_reauth' ? 'جدّد إذن' : 'أعد ربط'} ${escapeHtml(v.spec.label)}">${
                  v.state === 'needs_reauth' ? 'جدّد الإذن' : 'أعد الربط'}</a>`
            : v.state === 'connectable'
              ? `<a class="btn btn-primary btn-sm" href="/oauth/${escapeHtml(v.spec.id)}/start">اربط ${escapeHtml(v.spec.label)}</a>`
              : `<a class="btn btn-secondary btn-sm" href="${escapeHtml(setupHref(v.spec.id))}">اضبط ${escapeHtml(v.spec.label)}</a>`}
        </li>`).join('')}</ul>
      </div>`

  /**
   * شريطُ الحال — **أربعُ حالاتٍ في نظرة**.
   *
   * وكان الجوابُ عن «أين أنا؟» يحتاج مسحَ أربعِ بطاقاتٍ في شبكة، كلٌّ
   * منها بطولِ معالجٍ كامل.
   */
  const count = (state: string): number => views.filter((v) => v.state === state).length
  /*
   * ‏**والبلاطةُ تعدّ ما تعدّه البطاقة** (خطّة التصميم 5.7): قناةٌ سقط إذنُها، أو انتهى
   * ‏ولا تجديدَ معه، أو يقترب موعدُه ولا يتجدّد وحده — حكمُ `tokenHealth` نفسُه.
   * ‏وكانت تعدّ `needs_reauth` وحده، فتقول «0» تحت بطاقةٍ تقول «انتهى الإذن».
   */
  const healthOf = (v: ChannelView): string[] =>
    v.accounts.map((a) => tokenHealth(a, now)?.kind ?? '')
  const stopped = built.filter((v) => v.state === 'needs_reauth' || healthOf(v).includes('expired')).length
  const renew = built.filter((v) => v.state === 'needs_reauth' || healthOf(v).some((k) => k === 'expired' || k === 'soon')).length
  const strip = `<div class="card grid tiles c4 mb-4">
    <div class="card tile"><div class="kv-k">مربوطة وتعمل</div>
      <div class="kv-v">${count('linked')}<em> / ${built.length}</em></div>
      <div class="note">مبنيٌّ لها سائقُ نشرٍ وحسابُها قائم</div></div>
    <div class="card tile"><div class="kv-k">تحتاج تجديدا</div>
      <div class="kv-v">${renew}</div>
      <div class="note">${renew === 0
        ? 'ولا إذنَ انتهى'
        : stopped > 0
          ? '<b>النشرُ عليها متوقّفٌ حتّى تجدّد</b>'
          : 'يقترب موعدُ إذنها — جدّده قبله'}</div></div>
    <div class="card tile"><div class="kv-k">تنتظر ضبطا</div>
      <div class="kv-v">${count('awaiting_owner') + count('connectable')}</div>
      <div class="note">ينقصها سرٌّ أو ربطُ حساب</div></div>
    <div class="card tile"><div class="kv-k">لم يُبنَ سائقُها</div>
      <div class="kv-v">${rest.length}</div>
      <div class="note">تُعرَض لتُعرَف، ولا زرَّ لا يعمل</div></div>
  </div>`

  return `${strip}${waiting}<div class="lede-row">
    <h3 class="sec bare">القنوات المبنيّة</h3>
    <span class="grow"></span>
    ${statusBadge(linked === 0 ? 'warn' : 'ok', linked === 0 ? '!' : '●', `${linked} من ${built.length} مربوطة`)}
    <span class="lede-note"><b>ولا علامةَ صحٍّ على ما لم يُتحقَّق منه</b>:
      خطوتان في كلّ طريقٍ تقعان في بوّابة المنصّة ولا تُقرآن من هنا،
      وبرهانُهما نجاحُ ما بعدهما. ولا يُنشر منشورٌ بلا موافقةٍ مسجّلة،
      مهما كانت القنواتُ مربوطة.</span>
  </div>

  <div class="grid c2">${built.map((v) => card(v, now, byPlatform.get(v.spec.id), base)).join('')}</div>

  ${/*
   * **وما لم يُبنَ سطرٌ يُطوى لا شبكةُ بطاقات** (D-111).
   *
   * قِيست ثلاثُ بطاقاتٍ ‏١٥٩px لكلٍّ — **‏٤٧٧px لتقول «غيرُ مدعومة»**.
   * وهي أعلى ما يمكن أن تُعطى معلومةٌ سلبيّةٌ من وزن: البطاقةُ في هذه
   * الصفحة **وحدةُ قناةٍ تُربَط**، ومنصّةٌ لا تُربَط تأخذ شكلَ ما يُربَط
   * فتُقرأ خياراً معطَّلا لا شيئاً غيرَ موجود.
   *
   * **وتبقى كاملةً لمن فتحها**: الأسماءُ والسببُ ورابطُ الشاشة — ولا
   * يُحذَف شيء.
   */ ''}
  <details class="card card-inset unbuilt mt-5">
    <summary>
      <b>لم تُبنَ بعد</b>
      <span class="chip">${rest.length}</span>
      <span class="names">${rest.map((v) => escapeHtml(v.spec.label)).join(' · ')}</span>
      <span class="grow"></span>
      <span class="g-tog"><span class="lbl-open">افتح</span><span class="lbl-close">أغلق</span></span>
    </summary>
    <div class="unbuilt-body">
      <p class="hint">مزوّدو الذكاء يُضافون من اللوحة لأنّهم يتكلّمون لهجةً واحدة —
        <b>والمنصّاتُ الاجتماعيّة لا لهجةَ لها مشتركة</b>، فحقلُ «عنوان API» لا يكفيها.</p>
      <div class="grid c3">${rest.map((v) => card(v, now, undefined, base)).join('')}</div>
    </div>
  </details>`
}
