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
import { SETUP, type ChannelView } from '../../lib/channels'
import type { AppStatus } from '../../lib/oauth/apps'
import { wizardFor, type Step } from '../../lib/oauth/wizard'
import { ICON } from './icons'
import { escapeHtml } from './escape'
import { LOGOS } from './logos'
import { relativeTime } from '../../lib/format'
import { status } from './parts'

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
const STEP_MARK: Readonly<Record<Step['state'], { g: string; cls: string; label: string }>> = {
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
        <span class="n" aria-hidden="true">${step.n}</span>
        <span class="body">
          <span class="what">${escapeHtml(step.title)}</span>
          <span class="why">${step.proof.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</span>
        </span>
        ${status(mark.cls, mark.g, mark.label)}
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
    return `<details class="guide" style="margin-bottom:var(--s-3)">
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

  return `<div class="card" style="margin-bottom:var(--s-3)">
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
    return `${wizard}<div class="guide"><div class="guide-body" style="border-top:0">
      <div class="help"><span class="i">i</span><span class="t">
        <b>مضبوطٌ من أسرار Worker — وسرُّ البيئة يغلب الخزانة دائما.</b>
        فلا نموذجَ هنا: الكتابةُ فيه لن تغيّر ما يُستعمَل. ولتبديله، بدّله حيث هو —
        <span class="mono">${escapeHtml(app.secretNames[1])}</span>.</span></div>
      ${app.clientId === null ? '' : `<p class="ch-note">المعرّف الحاليّ:
        <span class="mono">${escapeHtml(app.clientId)}</span></p>`}
      <form method="POST" action="/panel/channels/app/verify" data-busy="جارٍ الفحص…">
        <input type="hidden" name="platform" value="${escapeHtml(view.spec.id)}">
        <button class="g sm" type="submit">افحص الزوج</button>
        <span class="ago">يسأل المنصّةَ أتقبل هذا الزوج — بلا دورةِ إذن، وبلا
          إذنِ وصولٍ يُنتَج.</span>
      </form>
    </div></div>`
  }

  const steps = guide.before
    .map(
      (b, i) => `<li><span class="n">${i + 1}</span>
        <span class="body"><span class="what">${b.what}</span>
        <span class="why">${b.why}</span></span></li>`,
    )
    .join('')

  const saved =
    app.source === 'vault'
      ? `<div class="help"><span class="i">✓</span><span class="t">
         <b>محفوظ.</b> المعرّف <span class="mono">${escapeHtml(app.clientId ?? '')}</span> ·
         السرّ <span class="mono">${escapeHtml(app.hint ?? '')}</span>
         ${app.updatedBy === null ? '' : `· بدّله ${escapeHtml(app.updatedBy)}`}</span></div>`
      : ''

  const id = view.spec.id
  const open = app.source === 'none'
  return `${wizard}<details class="guide"${open ? ' open' : ''}>
    <summary>
      <span class="g-ic">${ICON.guide}</span>
      <span class="g-t"><b>${open ? 'دليلُ ضبط التطبيق' : 'الدليل وتبديلُ الأسرار'}</b>
        <span>${guide.before.length} خطواتٍ في ${escapeHtml(guide.portalLabel)}، ثمّ سرّان هنا.</span></span>
      <span class="grow"></span>
      <span class="g-tog"><span class="lbl-open">افتح</span><span class="lbl-close">أغلق</span></span>
    </summary>
    <div class="guide-body">
      ${saved}

      <a class="btn g sm portal" href="${escapeHtml(guide.portal)}" target="_blank"
        rel="noopener noreferrer">${ICON.external} افتح ${escapeHtml(guide.portalLabel)}</a>

      <ol class="steps">${steps}</ol>

      <div class="field cb">
        <label for="cb-${id}">رابطُ العودة</label>
        <div class="help"><span class="i">!</span><span class="t">${guide.gotcha}</span></div>
        <div class="copy">
          <input id="cb-${id}" class="mono" value="${escapeHtml(callback)}" readonly
            aria-label="رابط العودة — للنسخ">
          <button type="button" class="g sm" data-copy="cb-${id}">انسخ</button>
        </div>
      </div>

      <form method="POST" action="/panel/channels/app" data-busy="جارٍ الحفظ…">
        <input type="hidden" name="platform" value="${escapeHtml(id)}">
        <div class="field">
          <label for="ci-${id}">Client ID</label>
          <div class="help" id="ci-${id}-h"><span class="i">؟</span>
            <span class="t">${guide.whereId}</span></div>
          <input id="ci-${id}" name="client_id" required aria-describedby="ci-${id}-h"
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
            : `<div class="help"><span class="i">!</span><span class="t">
                <b>هذا المعرّفُ محفوظٌ من قبل — والسرُّ أدناه يبدأ فارغا دائما.</b>
                فإن كنتَ تنسخ السرَّ من <b>تطبيقٍ آخر</b> (أنشأتَه حديثا مثلا)
                <b>فبدّل المعرّفَ معه</b>: سرٌّ صحيحٌ على معرّفٍ قديم يُردّ
                <span class="mono">invalid_client</span> — والرسالةُ تتّهم السرَّ وهو سليم.</span></div>`}
        </div>
        <div class="field">
          <label for="cs-${id}">Client Secret</label>
          <div class="help" id="cs-${id}-h"><span class="i">؟</span>
            <span class="t">${guide.whereSecret}</span></div>
          <input id="cs-${id}" name="client_secret" type="password" required
            aria-describedby="cs-${id}-h"
            placeholder="${app.source === 'vault' ? 'اكتبه لتبديله' : ''}"
            autocomplete="off" spellcheck="false">
          ${app.hint === null
            ? ''
            : `<div class="help"><span class="i">i</span><span class="t">
                المحفوظُ الآن <span class="mono">${escapeHtml(app.hint)}</span> —
                <b>قارنه بأوّل السرّ وآخرِه في ${escapeHtml(guide.portalLabel)}</b> قبل أن تكتب.
                فإن طابق فالسرُّ ليس العلّة، <b>وانظر في المعرّف أعلاه</b>.</span></div>`}
        </div>
        <div class="ch-foot">
          <button class="p" type="submit">احفظ</button>
          ${app.source === 'none'
            ? ''
            : `<button class="g sm" type="submit" formaction="/panel/channels/app/verify"
                 formnovalidate>افحص الزوج</button>`}
          <span class="ago">يُشفَّر قبل أن يُحفظ، ولا يُعرض بعدها إلّا مقنَّعا.</span>
          <span class="grow"></span>
          ${app.source === 'vault'
            ? `<button class="d sm" type="submit" formaction="/panel/channels/app/delete"
                 data-confirm="سيُحذف السرُّ المحفوظ ويتوقّف الربط. أتمضي؟">احذف</button>`
            : ''}
        </div>
        ${app.source === 'none' ? '' : `<div class="sub" style="margin-top:var(--s-2)">
          <b>«افحص الزوج»</b> يسأل ${escapeHtml(guide.portalLabel)} سؤالا واحدا —
          <b>أتقبل هذا المعرّفَ وهذا السرّ؟</b> — بمسار
          <span class="mono">client_credentials</span> الذي <b>لا منحةَ فيه تُفحَص</b>،
          فلا يبقى إلّا التوثيق. ويفرّق الجوابُ بين <b>سرٍّ خاطئ</b> و<b>معرّفٍ
          مجهول</b>، فلا تفتّش في الحقلين معا. ولا يُنتَج إذنُ وصولٍ لصدى، ولا
          تُنفَق فلسا.</div>`}
      </form>

      <div class="outcome"><span class="k">إن نجح</span>
        <span class="v">${guide.success}</span></div>
      <div class="outcome warn"><span class="k">إن فشل</span>
        <span class="v">${guide.failure}</span></div>
    </div>
  </details>`
}

/** بطاقةُ قناةٍ واحدة. */
function card(view: ChannelView, now: Date, app: AppStatus | undefined, base: string): string {
  const { spec, state, accounts, missing } = view
  const logo = LOGOS[spec.id] ?? ''

  // **والصفُّ لا الكلمة** (D-159): حسابٌ «مربوطٌ» بلا صفّ `tokens` كان
  // يُعرَض أخضرَ ثمّ يسقط أوّلُ منشورٍ في الطابور. وهو حالُ LinkedIn على staging
  const unsigned = accounts.filter((a) => a.status !== 'needs_reauth' && a.expiresAt === null)
  const badge =
    state === 'linked' && unsigned.length > 0
      ? status('bad', '▲', 'مربوطة بلا إذن')
      : state === 'linked'
        ? status('ok', '●', 'مربوطة')
      : state === 'needs_reauth'
        ? status('bad', '▲', 'تحتاج تجديدا')
        : state === 'connectable'
          ? status('idle', '○', 'جاهزةٌ للربط')
          : state === 'awaiting_owner'
            ? status('warn', '!', 'تنتظرك')
            : status('idle', '○', 'لم تُبنَ')

  const rows = accounts
    .map(
      (a) => `<div class="ch-acc">
        <span class="who">${escapeHtml(a.displayName)}</span>
        <span class="chip">${escapeHtml(KIND[a.kind] ?? a.kind)}</span>
        ${a.status === 'needs_reauth'
          ? ''
          : a.expiresAt === null
            ? status('bad', '▲', 'بلا إذنٍ محفوظ', 'title="لا صفَّ في tokens لهذا الحساب — أعد الربط"')
            : tokenDays(a.expiresAt, now)}
        <span class="grow"></span>
        ${a.status === 'needs_reauth'
          ? status('bad', '▲', 'جدّد الإذن')
          : `<span class="ago" title="${escapeHtml(a.createdAt)} UTC">منذ ${escapeHtml(
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
      ? `<div class="why warn"><span class="i">◍</span><span class="t">
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
      ? `<a class="btn p sm" href="/oauth/${escapeHtml(spec.id)}/start">اربط ${escapeHtml(spec.label)}</a>`
      : state === 'needs_reauth'
        ? `<a class="btn p sm" href="/oauth/${escapeHtml(spec.id)}/start"
              aria-label="جدّد إذن ${escapeHtml(spec.label)}">جدّد الإذن</a>`
        : state === 'linked' && unsigned.length > 0
          ? `<a class="btn p sm" href="/oauth/${escapeHtml(spec.id)}/start"
                aria-label="أعد ربط ${escapeHtml(spec.label)}">أعد الربط</a>`
        : state === 'linked'
          ? `<a class="btn g sm" href="/oauth/${escapeHtml(spec.id)}/start">اربط حسابا آخر</a>`
          : state === 'awaiting_owner'
            /*
             * **وزرٌّ يقود إلى الضبط لا شارةٌ تصفه** (D-111).
             *
             * كانت شارةً جامدةً تقول «بلا سرٍّ لا يبدأ الربط» — **تصف
             * المانعَ ولا تفتح بابَه**. ولمّا انتقل الدليلُ إلى شاشة
             * المنصّة صار للمانع موضعٌ يُقصَد، **فيُقصَد**.
             */
            ? `<a class="btn p sm" href="/panel/channels/${escapeHtml(spec.id)}"
                  aria-label="اضبط سرّي ${escapeHtml(spec.label)}">اضبط سرّيه</a>`
            : status('idle', '○', 'يحتاج سائقا يُكتب له')

  // اسمُ القناة رابطٌ إلى شاشتها: البطاقةُ تقول «أمربوطةٌ أم لا»،
  // والشاشةُ تقول ماذا نُشر وما فشل ولماذا — وهما سؤالان لا واحد
  return `<div class="ch${state === 'unbuilt' ? ' off' : ''}" id="ch-${escapeHtml(spec.id)}">
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
      <a class="btn g sm" href="/panel/channels/${escapeHtml(spec.id)}">شاشةُ ${escapeHtml(
        spec.label,
      )}</a></div>
  </div>`
}

/**
 * **عدُّ الأيّام على البطاقة** (D-126).
 *
 * تنبيهُ صدر اللوحة يقول «يبقى ‏٧ أيّام» حين يعبر الرمزُ عتبةً (D-065)،
 * **والبطاقةُ التي تصف الحسابَ نفسَه كانت لا تقوله** — والحقلُ في القاعدة.
 * فيُقرأ من الحقل نفسِه: أسبوعٌ فأقلُّ تحذير، وما انتهى خطر، وما فوق ذلك
 * رقاقةٌ هادئة. ولا إذنَ محفوظًا — لا شيء، لا «غير معروف».
 */
export function tokenDays(expiresAt: string | null, now: Date): string {
  if (expiresAt === null) return ''
  const ms = Date.parse(expiresAt.replace(' ', 'T') + (expiresAt.endsWith('Z') ? '' : 'Z'))
  if (Number.isNaN(ms)) return ''
  const days = Math.floor((ms - now.getTime()) / 86_400_000)
  const title = `title="ينتهي إذنُ الوصول ${escapeHtml(expiresAt)} UTC"`
  if (days < 0) return `${status('bad', '▲', `انتهى الإذن`, `${title}`)}`
  if (days <= 7) {
    return `${status('warn', '◍', `${
      days === 0 ? 'ينتهي الإذن اليوم' : `يبقى ${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : 'أيّام'} للإذن`}`, `${title}`)}`
  }
  return `<span class="chip" ${title}>الإذن ${days} يوما</span>`
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
  const unsignedOf = (v: ChannelView): boolean =>
    v.state === 'linked' && v.accounts.some((a) => a.status !== 'needs_reauth' && a.expiresAt === null)
  const urgent = [
    ...built.filter((v) => v.state === 'needs_reauth'),
    ...built.filter(unsignedOf),
    ...built.filter((v) => v.state === 'awaiting_owner'),
  ]
  const waiting = urgent.length === 0
    ? ''
    : `<div class="card" style="margin-bottom:var(--s-4);border-color:var(--warn)">
        <div class="card-head"><h2>ما ينتظرك الآن</h2><div class="grow"></div>
          ${status('warn', '!', `${urgent.length} ${
            urgent.length === 1 ? 'قناة' : 'قنوات'}`)}</div>
        <ul class="todo">${urgent.map((v) => `<li>
          <span class="dot ${v.state === 'needs_reauth' || unsignedOf(v) ? 'bad' : 'warn'}"></span>
          <span><b>${escapeHtml(v.spec.label)}</b> — ${v.state === 'needs_reauth'
            ? 'إذنُ الوصول انتهى أو سُحب، <b>والنشرُ عليها متوقّف</b>.'
            : unsignedOf(v)
              ? 'الحسابُ محفوظٌ <b>ولا إذنَ وصولٍ معه</b> — أوّلُ منشورٍ مجدولٍ سيسقط.'
              : 'ينقص سرّا التطبيق، فلا يبدأ الربط.'}</span>
          ${v.state === 'needs_reauth' || unsignedOf(v)
            ? `<a class="btn p sm" href="/oauth/${escapeHtml(v.spec.id)}/start"
                  aria-label="${v.state === 'needs_reauth' ? 'جدّد إذن' : 'أعد ربط'} ${escapeHtml(v.spec.label)}">${
                  v.state === 'needs_reauth' ? 'جدّد الإذن' : 'أعد الربط'}</a>`
            : `<a class="btn g sm" href="#ch-${escapeHtml(v.spec.id)}"
                  aria-label="انتقل إلى بطاقة ${escapeHtml(v.spec.label)}">اعرضها</a>`}
        </li>`).join('')}</ul>
      </div>`

  /**
   * شريطُ الحال — **أربعُ حالاتٍ في نظرة**.
   *
   * وكان الجوابُ عن «أين أنا؟» يحتاج مسحَ أربعِ بطاقاتٍ في شبكة، كلٌّ
   * منها بطولِ معالجٍ كامل.
   */
  const count = (state: string): number => views.filter((v) => v.state === state).length
  const strip = `<div class="grid tiles c4" style="margin-bottom:var(--s-4)">
    <div class="card tile"><div class="k">مربوطة وتعمل</div>
      <div class="v">${count('linked')}<em> / ${built.length}</em></div>
      <div class="n">مبنيٌّ لها سائقُ نشرٍ وحسابُها قائم</div></div>
    <div class="card tile"><div class="k">تحتاج تجديدا</div>
      <div class="v">${count('needs_reauth')}</div>
      <div class="n">${count('needs_reauth') === 0
        ? 'ولا إذنَ انتهى'
        : '<b>النشرُ عليها متوقّفٌ حتّى تجدّد</b>'}</div></div>
    <div class="card tile"><div class="k">تنتظر ضبطا</div>
      <div class="v">${count('awaiting_owner') + count('connectable')}</div>
      <div class="n">ينقصها سرٌّ أو ربطُ حساب</div></div>
    <div class="card tile"><div class="k">لم يُبنَ سائقُها</div>
      <div class="v">${rest.length}</div>
      <div class="n">تُعرَض لتُعرَف، ولا زرَّ لا يعمل</div></div>
  </div>`

  return `${strip}${waiting}<div class="lede-row">
    <h3 class="sec" style="margin:0; border:0; padding:0">القنوات المبنيّة</h3>
    <span class="grow"></span>
    ${status(linked === 0 ? 'warn' : 'ok', linked === 0 ? '!' : '●', `${linked} من ${built.length} مربوطة`)}
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
  <details class="unbuilt" style="margin-top:var(--s-5)">
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
