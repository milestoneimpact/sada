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
import { relativeTime } from '../../lib/format'

/** شعارٌ لكلّ قناة — `currentColor` فيتبع الثيم بلا نسختين. */
const LOGOS: Readonly<Record<string, string>> = {
  linkedin: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C21.4 8.65 22 11 22 14.2V21h-4v-6c0-1.43-.03-3.27-2-3.27-2 0-2.3 1.56-2.3 3.17V21h-4z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.9-6.4L5.1 21H2l7.3-8.3L2.5 3h6.3l4.4 5.8zm-1.1 16.1h1.7L7.7 4.8H5.9z"/></svg>`,
  snapchat: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c3 0 4.6 2.2 4.6 5v2.1c.5-.2 1-.4 1.5-.1.6.4.4 1.1-.2 1.5-.5.3-1.2.5-1.2.9 0 .9 2 3.2 3.6 3.7.5.2.4.8-.1 1-.6.2-1.4.3-1.6.7-.1.3.1.7-.2.9-.4.2-1.3-.1-2.2.1-.8.2-1.4 1.3-3.1 1.3h-.2c-1.7 0-2.3-1.1-3.1-1.3-.9-.2-1.8.1-2.2-.1-.3-.2-.1-.6-.2-.9-.2-.4-1-.5-1.6-.7-.5-.2-.6-.8-.1-1C7.3 14.7 9.3 12.4 9.3 11.5c0-.4-.7-.6-1.2-.9-.6-.4-.8-1.1-.2-1.5.5-.3 1 0 1.5.1V7c0-2.8 1.6-5 4.6-5z"/></svg>`,
  instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 2h-3v13.2a2.6 2.6 0 1 1-2.2-2.6v-3a5.6 5.6 0 1 0 5.2 5.6V9.4c1 .7 2.2 1.1 3.5 1.2v-3c-1.9-.1-3.4-1.6-3.5-3.5z"/></svg>`,
  threads: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 21c-5 0-8-3.4-8-9s3-9 8-9c3.4 0 5.7 1.5 6.8 4"/><path d="M8.8 14.2c0-1.7 1.6-2.7 3.6-2.7 3 0 4.3 1.6 4.3 3.6 0 2-1.3 3.4-3 3.4-1.5 0-2.4-.9-2.4-2"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12s0-3.4-.4-5c-.3-.9-1-1.6-1.9-1.9C18 4.7 12 4.7 12 4.7s-6 0-7.7.4c-.9.3-1.6 1-1.9 1.9C2 8.6 2 12 2 12s0 3.4.4 5c.3.9 1 1.6 1.9 1.9 1.7.4 7.7.4 7.7.4s6 0 7.7-.4c.9-.3 1.6-1 1.9-1.9.4-1.6.4-5 .4-5zM10 15.2V8.8l5.2 3.2z"/></svg>`,
}

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
    return `<details class="setup">
      <summary>مضبوطٌ من أسرار Worker</summary>
      <div class="setup-body">
        <p class="ch-note"><b>وسرُّ البيئة يغلب الخزانة دائما.</b> فلا نموذجَ هنا:
          الكتابةُ فيه لن تغيّر ما يُستعمَل. ولتبديله، بدّله حيث هو —
          <span class="mono">${escapeHtml(app.secretNames[1])}</span> في أسرار Worker.</p>
        ${app.clientId === null ? '' : `<p class="ch-note">المعرّف الحاليّ:
          <span class="mono">${escapeHtml(app.clientId)}</span></p>`}
      </div>
    </details>`
  }

  // رقمٌ في دائرةٍ لا نقطةٌ في قائمة: الخطواتُ تُنفَّذ بالترتيب، والعينُ
  // تحتاج موضعا تعود إليه بعد أن تغادر الشاشة إلى بوّابة المنصّة
  const steps = guide.before
    .map(
      (b, i) => `<li><span class="n">${i + 1}</span>
        <span class="body"><span class="what">${b.what}</span>
        <span class="why">${b.why}</span></span></li>`,
    )
    .join('')

  const saved =
    app.source === 'vault'
      ? `<p class="ch-note"><span class="st ok"><span class="g">●</span>محفوظ</span>
         المعرّف <span class="mono">${escapeHtml(app.clientId ?? '')}</span> ·
         السرّ <span class="mono">${escapeHtml(app.hint ?? '')}</span>
         ${app.updatedBy === null ? '' : `· بدّله ${escapeHtml(app.updatedBy)}`}</p>`
      : ''

  const id = view.spec.id
  return `<details class="setup"${app.source === 'none' ? ' open' : ''}>
    <summary>${app.source === 'none' ? 'اضبط التطبيق' : 'بدّل أسرار التطبيق'}</summary>
    <div class="setup-body">
      ${saved}

      <p class="ch-note">افتح <a href="${escapeHtml(guide.portal)}" target="_blank"
        rel="noopener noreferrer">${escapeHtml(guide.portalLabel)}</a> وأتمم هذه أوّلا:</p>
      <ol class="steps">${steps}</ol>

      <div class="field cb">
        <label for="cb-${id}">رابطُ العودة</label>
        <span class="hint-sm">${guide.gotcha}</span>
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
          <span class="hint-sm" id="ci-${id}-h">${guide.whereId}</span>
          <input id="ci-${id}" name="client_id" required aria-describedby="ci-${id}-h"
            value="${escapeHtml(app.clientId ?? '')}" autocomplete="off" spellcheck="false">
        </div>
        <div class="field">
          <label for="cs-${id}">Client Secret</label>
          <span class="hint-sm" id="cs-${id}-h">${guide.whereSecret}</span>
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

      <div class="outcome"><span class="k">علامةُ النجاح</span>
        <span class="v">${guide.success}</span></div>
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

  return `<div class="ch${state === 'unbuilt' ? ' off' : ''}">
    <div class="ch-top">
      <div class="ch-logo">${logo}</div>
      <div class="ch-name">${escapeHtml(spec.label)}
        <span>${accounts.length === 0 ? 'لا حساب' : `${accounts.length} حساب`}</span></div>
      <span class="grow"></span>${badge}
    </div>
    ${rows}
    <p class="ch-note">${note}</p>
    ${setupPane(view, app, base)}
    <div class="ch-foot">${action}</div>
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

  <div class="grid c2">${built.map((v) => card(v, now, byPlatform.get(v.spec.id), base)).join('')}</div>

  <div class="lede-row" style="margin-top:22px">
    <h3 class="sec" style="margin:0; border:0; padding:0">لم تُبنَ بعد</h3>
    <span class="grow"></span>
    <span class="lede-note">مزوّدو الذكاء يُضافون من اللوحة لأنّهم يتكلّمون لهجةً واحدة —
      <b>والمنصّاتُ الاجتماعيّة لا لهجةَ لها مشتركة</b>، فحقلُ «عنوان API» لا يكفيها.</span>
  </div>

  <div class="grid c3">${rest.map((v) => card(v, now, undefined, base)).join('')}</div>`
}
