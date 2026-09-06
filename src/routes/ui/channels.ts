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
import { escapeHtml } from './shell'
import { LOGOS } from './logos'
import { relativeTime } from '../../lib/format'

/** رمزُ الدليل — كتابٌ مفتوح. مرسومٌ لا مُحمَّل، كسائر رموز هذا الملفّ. */
const ICON_GUIDE =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M12 6.5C10.5 5 8.5 4.5 4 4.5v13c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-13c-4.5 0-6.5.5-8 2z"/>` +
  `<path d="M12 6.5v13"/></svg>`

/** سهمُ المغادرة — الرابطُ يفتح تبويبا آخر، والعلامةُ تقول ذلك قبل الضغط. */
const ICON_EXTERNAL =
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M14 4h6v6"/><path d="M20 4l-9 9"/>` +
  `<path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`

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
function setupPane(view: ChannelView, app: AppStatus | undefined, base: string): string {
  const guide = SETUP[view.spec.id]
  if (guide === undefined || app === undefined) return ''

  const callback = `${base.replace(/\/+$/, '')}/oauth/${view.spec.id}/callback`

  if (app.source === 'worker_secret') {
    return `<div class="guide"><div class="guide-body" style="border-top:0">
      <div class="help"><span class="i">i</span><span class="t">
        <b>مضبوطٌ من أسرار Worker — وسرُّ البيئة يغلب الخزانة دائما.</b>
        فلا نموذجَ هنا: الكتابةُ فيه لن تغيّر ما يُستعمَل. ولتبديله، بدّله حيث هو —
        <span class="mono">${escapeHtml(app.secretNames[1])}</span>.</span></div>
      ${app.clientId === null ? '' : `<p class="ch-note">المعرّف الحاليّ:
        <span class="mono">${escapeHtml(app.clientId)}</span></p>`}
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
  return `<details class="guide"${open ? ' open' : ''}>
    <summary>
      <span class="g-ic">${ICON_GUIDE}</span>
      <span class="g-t"><b>${open ? 'دليلُ ضبط التطبيق' : 'الدليل وتبديلُ الأسرار'}</b>
        <span>${guide.before.length} خطواتٍ في ${escapeHtml(guide.portalLabel)}، ثمّ سرّان هنا.</span></span>
      <span class="grow"></span>
      <span class="g-tog"><span class="lbl-open">افتح</span><span class="lbl-close">أغلق</span></span>
    </summary>
    <div class="guide-body">
      ${saved}

      <a class="btn g sm portal" href="${escapeHtml(guide.portal)}" target="_blank"
        rel="noopener noreferrer">${ICON_EXTERNAL} افتح ${escapeHtml(guide.portalLabel)}</a>

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
        </div>
        <div class="field">
          <label for="cs-${id}">Client Secret</label>
          <div class="help" id="cs-${id}-h"><span class="i">؟</span>
            <span class="t">${guide.whereSecret}</span></div>
          <input id="cs-${id}" name="client_secret" type="password" required
            aria-describedby="cs-${id}-h"
            placeholder="${app.source === 'vault' ? 'اكتبه لتبديله' : ''}"
            autocomplete="off" spellcheck="false">
        </div>
        <div class="ch-foot">
          <button class="p" type="submit">احفظ</button>
          <span class="ago">يُشفَّر قبل أن يُحفظ، ولا يُعرض بعدها إلّا مقنَّعا.</span>
          <span class="grow"></span>
          ${app.source === 'vault'
            ? `<button class="d sm" type="submit" formaction="/panel/channels/app/delete"
                 data-confirm="سيُحذف السرُّ المحفوظ ويتوقّف الربط. أتمضي؟">احذف</button>`
            : ''}
        </div>
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

  const badge =
    state === 'linked'
      ? '<span class="st ok"><span class="g">●</span>مربوطة</span>'
      : state === 'needs_reauth'
        ? '<span class="st bad"><span class="g">▲</span>تحتاج تجديدا</span>'
        : state === 'connectable'
          ? '<span class="st idle"><span class="g">○</span>جاهزةٌ للربط</span>'
          : state === 'awaiting_owner'
            ? '<span class="st warn"><span class="g">!</span>تنتظرك</span>'
            : '<span class="st idle"><span class="g">○</span>لم تُبنَ</span>'

  const rows = accounts
    .map(
      (a) => `<div class="ch-acc">
        <span class="who">${escapeHtml(a.displayName)}</span>
        <span class="chip">${escapeHtml(KIND[a.kind] ?? a.kind)}</span>
        <span class="grow"></span>
        ${a.status === 'needs_reauth'
          ? '<span class="st bad"><span class="g">▲</span>جدّد الإذن</span>'
          : `<span class="ago" title="${escapeHtml(a.createdAt)} UTC">منذ ${escapeHtml(
              relativeTime(a.createdAt, now),
            )}</span>`}
      </div>`,
    )
    .join('')

  // ما يُقال ولمَ: كلُّ حالٍ لها جملتُها، ولا تُترك حالٌ بلا تفسير
  const note =
    state === 'awaiting_owner'
      ? `ينقص سرّا التطبيق. <b>اضبطهما من هنا</b> — أو من أسرار Worker باسمَي
         <span class="mono">${missing.map(escapeHtml).join('</span> و <span class="mono">')}</span>.`
      : state === 'needs_reauth'
        ? 'رمزُ الوصول انتهى أو سُحب. <b>والنشر متوقّفٌ على هذه القناة حتّى تُجدّده</b> — ويقع صامتا لولا هذا التنبيه.'
        : escapeHtml(spec.note)

  // زرُّ الربط لا يُعرض إلا حيث يعمل. و «اربط» فعلٌ يغادر اللوحة إلى
  // المنصّة، فهو رابطٌ لا نموذج — ولا رمز CSRF على انتقالٍ لا يغيّر شيئا
  const action =
    state === 'connectable'
      ? `<a class="btn p sm" href="/oauth/${escapeHtml(spec.id)}/start">اربط ${escapeHtml(spec.label)}</a>`
      : state === 'needs_reauth'
        ? `<a class="btn p sm" href="/oauth/${escapeHtml(spec.id)}/start">جدّد الإذن</a>`
        : state === 'linked'
          ? `<a class="btn g sm" href="/oauth/${escapeHtml(spec.id)}/start">اربط حسابا آخر</a>`
          : state === 'awaiting_owner'
            ? '<span class="st idle"><span class="g">○</span>بلا سرٍّ لا يبدأ الربط</span>'
            : '<span class="st idle"><span class="g">○</span>يحتاج سائقا يُكتب له</span>'

  // اسمُ القناة رابطٌ إلى شاشتها: البطاقةُ تقول «أمربوطةٌ أم لا»،
  // والشاشةُ تقول ماذا نُشر وما فشل ولماذا — وهما سؤالان لا واحد
  return `<div class="ch${state === 'unbuilt' ? ' off' : ''}">
    <div class="ch-top">
      <div class="ch-logo">${logo}</div>
      <div class="ch-name"><a href="/panel/channels/${escapeHtml(spec.id)}"
        >${escapeHtml(spec.label)}</a>
        <span>${accounts.length === 0 ? 'لا حساب' : `${accounts.length} حساب`}</span></div>
      <span class="grow"></span>${badge}
    </div>
    ${rows}
    <p class="ch-note">${note}</p>
    ${setupPane(view, app, base)}
    <div class="ch-foot">${action}
      <span class="grow"></span>
      <a class="btn g sm" href="/panel/channels/${escapeHtml(spec.id)}">شاشةُ ${escapeHtml(
        spec.label,
      )}</a></div>
  </div>`
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

  return `<div class="lede-row">
    <h3 class="sec" style="margin:0; border:0; padding:0">القنوات المبنيّة</h3>
    <span class="grow"></span>
    <span class="st ${linked === 0 ? 'warn' : 'ok'}"><span class="g">${
      linked === 0 ? '!' : '●'}</span>${linked} من ${built.length} مربوطة</span>
    <span class="lede-note">ولا يُنشر منشورٌ بلا موافقةٍ مسجّلة، مهما كانت القنواتُ مربوطة.</span>
  </div>

  <div class="grid c2 ragged">${built.map((v) => card(v, now, byPlatform.get(v.spec.id), base)).join('')}</div>

  <div class="lede-row" style="margin-top:22px">
    <h3 class="sec" style="margin:0; border:0; padding:0">لم تُبنَ بعد</h3>
    <span class="grow"></span>
    <span class="lede-note">مزوّدو الذكاء يُضافون من اللوحة لأنّهم يتكلّمون لهجةً واحدة —
      <b>والمنصّاتُ الاجتماعيّة لا لهجةَ لها مشتركة</b>، فحقلُ «عنوان API» لا يكفيها.</span>
  </div>

  <div class="grid c3 ragged">${rest.map((v) => card(v, now, undefined, base)).join('')}</div>`
}
