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
import { byNeed, callbackStep, channelHealth, SETUP, setupHref, tokenHealth, type ChannelHealthKind, type ChannelView, type LinkedAccount } from '../../lib/channels'
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
        فلا نموذجَ هنا: الكتابةُ فيه لن تغيّر ما يُستعمَل. ولتبديله، بدّله حيث هو، في أسرار Worker.</span></div>
      ${/* ‏واسمُ المتغيّر خلف «للمطوّر» (خطّة التصميم 5.7 · D-218): المالكُ يعرف أين يُبدَّل، والاسمُ لمن يكتب الأمر */''}
      <details class="setup mt-2"><summary>للمطوّر</summary>
        <p class="ch-note">السرّان: <span class="mono">${escapeHtml(app.secretNames[0])}</span> و<span class="mono">${escapeHtml(app.secretNames[1])}</span>
          — <span class="mono">wrangler secret put ${escapeHtml(app.secretNames[1])}</span></p></details>
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

      <form method="POST" action="/panel/channels/app" data-busy="جارٍ الحفظ…" id="app-${escapeHtml(id)}">
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
          <div class="mt-2"><span class="ago">يُشفَّر قبل أن يُحفظ، ولا يُعرض بعدها إلّا مقنَّعا.</span></div>
          ${app.hint === null
            ? ''
            : `<div class="help"><span class="help-ic">i</span><span class="help-t">
                المحفوظُ الآن <span class="mono">${escapeHtml(app.hint)}</span> —
                <b>قارنه بأوّل السرّ وآخرِه في ${escapeHtml(guide.portalLabel)}</b> قبل أن تكتب.
                فإن طابق فالسرُّ ليس العلّة، <b>وانظر في المعرّف أعلاه</b>.</span></div>`}
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
      ${/*
        * ‏**شريطُ الأفعال آخرَ الدليل لا آخرَ النموذج** (T4 · D-218): الملتصقُ لا يغادر أباه، والنموذجُ تحت الخطوات،
        * ‏فكان الشريطُ خارج الشاشة ما دام المالكُ يقرأ. فصار ابنَ الدليل كلِّه، وأزرارُه للنموذج بسِمة «form».
        */''}
        <div class="ch-foot wiz-bar">
          <button class="btn btn-primary" type="submit" form="app-${escapeHtml(id)}">احفظ</button>
          ${app.source === 'none'
            ? ''
            : `<button class="btn btn-secondary btn-sm" type="submit" form="app-${escapeHtml(id)}" formaction="/panel/channels/app/verify"
                 formnovalidate>افحص الزوج</button>`}
          <span class="grow"></span>
          ${app.source === 'vault'
            ? `<button class="btn btn-danger btn-sm" type="submit" form="app-${escapeHtml(id)}" formaction="/panel/channels/app/delete" formnovalidate
                 data-confirm="سيُحذف السرُّ المحفوظ ويتوقّف الربط. أتمضي؟">احذف</button>`
            : ''}
        </div>
    </div>
  </details>`
}

/**
 * بطاقةُ منصّةٍ واحدة — **حالٌ واحدةٌ وزرٌّ واحد، والبطاقةُ كلُّها بابُ شاشتها** (خطّة التصميم 5.7 · D-205).
 *
 * كانت تحمل شارتين متعارضتين (القناةُ «مربوطة» والحسابُ تحتها «انتهى الإذن») وزرّين («جدّد الإذن» و«شاشةُ
 * LinkedIn»)، وأسماءَ أسرار Worker في جملتها. فصارت: الشعارُ والاسمُ والحسابُ في `<bdi>`، ثمّ حكمُ
 * `channelHealth` وحدَه، ثمّ جملةُ ما يقع، ثمّ فعلٌ واحد. واسمُ المنصّة رابطٌ يمدّ نفسَه على البطاقة،
 * والفعلُ فوقه فلا يبتلعه. وتفصيلُ الحساب والإذن في شاشة المنصّة.
 */
function card(view: ChannelView, now: Date): string {
  const { spec, accounts } = view
  const h = channelHealth(view, now)
  const logo = LOGOS[spec.id] ?? ''
  const badge = statusBadge(h.tone, TONE_GLYPH[h.tone], h.label, `data-fact="${escapeHtml(spec.id)}:${h.kind}"`)

  const rows = accounts
    .map((a) => `<div class="ch-acc">
        <span class="who"><bdi>${escapeHtml(a.displayName)}</bdi></span>
        <span class="chip">${escapeHtml(KIND[a.kind] ?? a.kind)}</span>
        <span class="grow"></span>
        <span class="ago">رُبط ${escapeHtml(relativeTime(a.createdAt, now))}</span>
      </div>`)
    .join('')

  // **والمرتبةُ تُقال قبل كلّ شيء**: منصّةٌ تُربَط ولا تنشر يعرف مالكُها ذلك قبل أن يربط
  const stageNote =
    spec.stage === 'link'
      ? `<div class="why warn"><span class="why-ic">${glyph('◍')}</span><span class="why-t">
         <b>تُربَط ولا تنشر بعد.</b> يُحفَظ الحساب، <b>ولا تُكتب لها مسوّدة</b> حتّى يُبنى سائقُ الرفع.</span></div>`
      : ''

  const note: Record<ChannelHealthKind, string> = {
    broken: `انقطع الربط، <b>والنشرُ على ${escapeHtml(spec.label)} متوقّفٌ حتّى تعيد ربطها</b>.`,
    expiring: '<b>تعمل الآن، وتنقطع ما لم تُعِد ربطها.</b> والمجدولُ عليها يبقى في موعده.',
    setup: `ينقص التطبيق. <b>أكمل إعدادَه مرّةً واحدة</b> ثمّ اربط حسابك.`,
    connectable: 'التطبيقُ مضبوط، <b>وبقي أن تربط حسابك</b>.',
    connected: escapeHtml(spec.note),
    unbuilt: escapeHtml(spec.note),
  }

  const action = h.button === null
    ? ''
    : `<a class="btn ${h.button.primary ? 'btn-primary' : 'btn-secondary'} btn-sm" href="${escapeHtml(h.button.href)}"
         aria-label="${escapeHtml(`${h.button.label} ${spec.label}`)}">${escapeHtml(h.button.label)}</a>`

  return `<div class="card ch" id="ch-${escapeHtml(spec.id)}" data-health="${h.kind}">
    <div class="ch-top">
      <div class="ch-logo">${logo}</div>
      <div class="ch-name"><a class="ch-go" href="/panel/channels/${escapeHtml(spec.id)}">${escapeHtml(spec.label)}</a>
        <span>${accounts.length === 0 ? 'لا حساب'
          : accounts.length === 1 ? `<bdi>${escapeHtml(accounts[0]!.displayName)}</bdi>`
          : escapeHtml(counted(accounts.length, NOUNS.account))}</span></div>
      <span class="grow"></span>${badge}
    </div>
    ${accounts.length > 1 ? rows : ''}
    ${stageNote}
    <p class="ch-note">${note[h.kind]}</p>
    ${action === '' ? '' : `<div class="ch-foot">${action}</div>`}
  </div>`
}

const TONE_GLYPH = { ok: '●', bad: '▲', warn: '!', idle: '○' } as const


/**
 * لوحُ «الحسابات» (خطّة التصميم 5.7 · D-205): **بطاقةٌ لكلّ منصّةٍ مبنيّة بترتيب الحاجة**، فالمنقطعةُ أوّلُ
 * ما يُرى، ثمّ ما يحتاج إعدادًا أو ربطًا، ثمّ المتّصلة. وكانت فوقها بطاقةُ «ما ينتظرك الآن» تعيد ما في
 * البطاقات بكلماتٍ أخرى، وبلاطةٌ وشارةٌ تعدّان المربوطَ مرّتين — **والحقيقةُ تُقال مرّةً** (5.9). وما لم
 * يُبنَ سطرُ «قريبًا» في آخر الصفحة.
 */
export function channelsSection(
  views: readonly ChannelView[],
  now: Date,
): string {
  const built = byNeed(views.filter((v) => v.spec.built), now)
  const rest = views.filter((v) => !v.spec.built)
  const kinds = built.map((v) => channelHealth(v, now).kind)
  const n = (...k: ChannelHealthKind[]): number => kinds.filter((x) => k.includes(x)).length
  const relink = n('broken', 'expiring')
  const strip = `<div class="card grid tiles c3 mb-4">
    <div class="card tile"><div class="kv-k">متّصلة</div>
      <div class="kv-v">${n('connected')}<em> / ${built.length}</em></div>
      <div class="note">تنشر الآن بلا فعلٍ منك</div></div>
    <div class="card tile"><div class="kv-k">تحتاج إعادةَ ربط</div>
      <div class="kv-v">${relink}</div>
      <div class="note">${relink === 0 ? 'ولا ربطَ يقترب انقطاعُه' : n('broken') > 0
        ? '<b>النشرُ متوقّفٌ على المنقطعة</b>' : 'تعمل الآن، وتنقطع بعد أيّام'}</div></div>
    <div class="card tile"><div class="kv-k">تحتاج إعدادًا</div>
      <div class="kv-v">${n('setup', 'connectable')}</div>
      <div class="note">تطبيقٌ يُضبط أو حسابٌ يُربط</div></div>
  </div>`

  return `${strip}
  <div class="grid c2">${built.map((v) => card(v, now)).join('')}</div>
  ${rest.length === 0 ? '' : `<p class="hint mt-5">قريبًا: ${rest.map((v) => escapeHtml(v.spec.label)).join(' و')}</p>`}`
}
