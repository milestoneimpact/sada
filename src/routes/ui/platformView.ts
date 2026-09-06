/**
 * شاشةُ منصّةٍ واحدة.
 *
 * ## أربعةُ أسئلةٍ بترتيبها
 *
 * ١ · **ما حالُها الآن** — أمربوطةٌ، وبأيّ حساب، ومتى آخرُ نشر.
 * ٢ · **ما تستطيعه فعلا** — من النطاقات الممنوحة لا المطلوبة (D-045).
 * ٣ · **ما نُشر عليها** — بنصّه ورابطه ووقته.
 * ٤ · **ما فشل ولماذا** — ولا يُخفى في تبويبٍ ثانٍ.
 *
 * والترتيبُ مقصود: من فتح الشاشةَ يسأل «ماذا نُشر» أوّلا، ويسأل «ماذا
 * أضبط» مرّةً في عمرها. فالدليلُ في آخرها لا في أوّلها — **عكسَ لوح
 * القنوات، حيث الضبطُ هو الغرض.**
 *
 * ## والمنصّةُ التي لم يُبنَ لها سائقٌ لها شاشةٌ أيضا
 *
 * وفيها ما ينقص بالضبط، لا «قريبا». وصفحةٌ تقول «قريبا» تُقرأ وعدا،
 * وصفحةٌ تقول «النشرُ فيديو لا نصّ، فيحتاج رفعا مجزّأً» تُقرأ سببا —
 * **والسببُ يُصدَّق، والوعدُ يُنتظَر ثمّ يُنسى.**
 */
import { SETUP, type ChannelView } from '../../lib/channels'
import { capabilities, type Capability } from '../../lib/oauth/scopes'
import type { Platform } from '../../lib/oauth/providers'
import { permalink, type PlatformPost, type PlatformTally } from '../../lib/platform/screen'
import { relativeTime } from '../../lib/format'
import { widest, type PostMetricRow } from '../../lib/metrics/job'
import { escapeHtml } from './shell'
import { LOGOS } from './logos'

export interface PlatformScreenData {
  readonly view: ChannelView
  readonly posts: readonly PlatformPost[]
  readonly tally: PlatformTally
  /** نطاقاتُ كلّ حسابٍ كما مُنحت — مفتاحُها معرّفُ الحساب. */
  readonly scopes: Readonly<Record<string, string>>
  /** ما قِيس لكلّ منشور — مفتاحُها معرّفُ المنشور (D-048). */
  readonly metrics: Readonly<Record<string, readonly PostMetricRow[]>>
  readonly now: Date
}

/**
 * رقمٌ في الشاشة — **والفراغُ يُقال ولا يُصفَّر**.
 *
 * `0` تعني «قِيس فكان لا شيء»، و `null` تعني «لا يُقاس أصلا» —
 * و LinkedIn لا يعطي الظهورَ لمنشور عضو. فلو عُرض صفرا لقُرئ فشلا،
 * ولبُني على ذلك قرارُ نشرٍ خاطئ (D-048).
 */
function stat(label: string, value: number | null): string {
  return `<span class="stat"><b>${
    value === null ? '<span class="na" title="لا تعطيه المنصّة لهذا الحساب">—</span>' : value
  }</b>${escapeHtml(label)}</span>`
}

/** صفُّ الأرقام تحت المنشور — أو سببُ غيابه. */
function metricRow(rows: readonly PostMetricRow[], published: boolean, now: Date): string {
  if (!published) return ''
  const m = widest(rows)
  if (m === undefined || m === null) {
    return `<div class="stats none"><span class="ago">لم يُقَس بعد — أوّلُ قياسٍ بعد
      ٢٤ ساعةً من النشر</span></div>`
  }
  return `<div class="stats">
    ${stat('ظهور', m.impressions)}
    ${stat('تفاعل', m.reactions)}
    ${stat('تعليق', m.comments)}
    ${stat('مشاركة', m.shares)}
    <span class="grow"></span>
    <span class="ago" title="${escapeHtml(m.pulledAt)} UTC">نافذةُ ${escapeHtml(
      m.window,
    )} · قِيس منذ ${escapeHtml(relativeTime(m.pulledAt, now))}</span>
  </div>`
}

const STATUS: Readonly<Record<string, { label: string; cls: string; g: string }>> = {
  published: { label: 'نُشر', cls: 'ok', g: '●' },
  queued: { label: 'في الطابور', cls: 'warn', g: '◍' },
  failed: { label: 'فشل', cls: 'bad', g: '▲' },
  approved: { label: 'معتمَدة', cls: 'idle', g: '○' },
  edited: { label: 'معدَّلة', cls: 'idle', g: '○' },
  draft: { label: 'مسوّدة', cls: 'idle', g: '○' },
  rejected: { label: 'مرفوضة', cls: 'idle', g: '○' },
}

/** رمزُ فتحِ رابطٍ خارجيّ — مرسومٌ لا مُحمَّل، كسائر رموز اللوحة. */
const OUT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/>' +
  '<path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'

/**
 * لوحُ القدرات — **ما يستطيعه هذا الرمزُ فعلا**.
 *
 * وُجد بعد أن ردّت LinkedIn `unauthorized_scope_error` ولم يكن في
 * اللوحة موضعٌ واحد يقول أيَّ نطاقٍ نقص. وكان الجوابُ الوحيدُ سطرَ JSON
 * في المتصفّح.
 *
 * وصفٌّ لكلّ نطاق: أيُمنَح، وما يفتحه، ومَن يمنحه إن نقص. **فالناقصُ
 * يُسمّى ويُقال أين يُفتَح** — لا «فشل الربط».
 */
function capabilityTable(rows: readonly Capability[]): string {
  const cells = rows
    .map((row) => {
      const on = row.granted
      return `<tr>
        <td data-label="النطاق"><span class="mono">${escapeHtml(row.spec.name)}</span></td>
        <td data-label="يفتح"><span class="nm">${escapeHtml(row.spec.enables)}</span></td>
        <td data-label="الحال">${
          on
            ? '<span class="st ok"><span class="g">●</span>ممنوح</span>'
            : '<span class="st bad"><span class="g">▲</span>ناقص</span>'
        }</td>
        <td data-label="مصدرُه">${
          on
            ? '<span class="ago">—</span>'
            : `<span class="sub" style="margin:0"><b>${escapeHtml(row.spec.grantedBy)}</b><br>
               ${escapeHtml(row.spec.where)}</span>`
        }</td>
      </tr>`
    })
    .join('')

  return `<div class="scroll"><table>
    <thead><tr><th>النطاق</th><th>يفتح</th><th>الحال</th><th>مصدرُه إن نقص</th></tr></thead>
    <tbody>${cells}</tbody></table></div>`
}

/** بطاقةُ منشورٍ واحد — نصُّه هو المعروض، لا ملخّصٌ عنه. */
function postCard(
  post: PlatformPost,
  platform: Platform,
  now: Date,
  metrics: readonly PostMetricRow[],
): string {
  const meta = STATUS[post.status] ?? { label: post.status, cls: 'idle', g: '○' }
  const link = permalink(platform, post.platformPostId)

  const when =
    post.publishedAt !== null
      ? `<span class="ago" title="${escapeHtml(post.publishedAt)} UTC">نُشر منذ ${escapeHtml(
          relativeTime(post.publishedAt, now),
        )}</span>`
      : post.scheduledAt !== null
        ? `<span class="ago when" title="${escapeHtml(post.scheduledAt)} UTC">موعدُه ${escapeHtml(
            post.scheduledAt.slice(0, 16).replace('T', ' '),
          )}</span>`
        : `<span class="ago">كُتبت منذ ${escapeHtml(relativeTime(post.createdAt, now))}</span>`

  // الفشلُ يُعرض بنصّه: «فشل» وحدها لا تُعالَج، والسببُ يُعالَج
  const error =
    post.lastError === null
      ? ''
      : `<div class="why bad"><span class="i">▲</span><span class="t">
         <b>آخرُ فشل:</b> ${escapeHtml(post.lastError)}</span></div>`

  return `<article class="post">
    <div class="post-top">
      <span class="st ${meta.cls}"><span class="g">${meta.g}</span>${meta.label}</span>
      ${post.accountName === null
        ? ''
        : `<span class="chip">${escapeHtml(post.accountName)}</span>`}
      ${post.hasMedia ? '<span class="chip">بصورة</span>' : ''}
      <span class="grow"></span>${when}
    </div>
    <p class="post-text">${escapeHtml(post.text)}</p>
    ${metricRow(metrics, post.status === 'published', now)}
    ${error}
    <div class="post-foot">
      ${link === null
        ? post.status === 'published'
          ? '<span class="ago">نُشر، ولم تُعِد المنصّةُ معرّفا يُبنى منه رابط.</span>'
          : ''
        : `<a class="btn g sm" href="${escapeHtml(link)}" target="_blank"
             rel="noopener noreferrer">${OUT} افتحه على المنصّة</a>`}
      <span class="grow"></span>
      ${post.costUsd > 0
        ? `<span class="ago money">${post.costUsd.toFixed(4)}$ كتابةً</span>`
        : ''}
    </div>
  </article>`
}

/** أربعةُ أرقامٍ في صفٍّ — الحصادُ قبل التفاصيل. */
function tallyRow(t: PlatformTally, now: Date): string {
  const cell = (k: string, v: string, n: string): string =>
    `<div class="card tile"><div class="k">${k}</div><div class="v">${v}</div>
     <div class="n">${n}</div></div>`

  return `<div class="grid c4">
    ${cell('نُشر', String(t.published), t.lastPublishedAt === null
      ? 'لم يُنشر شيءٌ بعد'
      : `آخرُه منذ ${escapeHtml(relativeTime(t.lastPublishedAt, now))}`)}
    ${cell('في الطابور', String(t.queued), 'ينتظر موعدَه أو دورةَ الإرسال')}
    ${cell('فشل', String(t.failed), t.failed === 0 ? 'لا فشلَ مسجَّل' : 'يُقرأ سببُه تحت')}
    ${cell('كلفةُ الكتابة', `${t.spend.toFixed(2)}<em>$</em>`, 'على منشورات هذه المنصّة وحدها')}
  </div>`
}

export function platformScreen(d: PlatformScreenData): string {
  const { spec, state, accounts } = d.view
  const logo = LOGOS[spec.id] ?? ''
  const guide = SETUP[spec.id]

  const badge =
    state === 'linked'
      ? '<span class="st ok"><span class="g">●</span>مربوطة</span>'
      : state === 'needs_reauth'
        ? '<span class="st bad"><span class="g">▲</span>تحتاج تجديدا</span>'
        : state === 'connectable'
          ? '<span class="st idle"><span class="g">○</span>جاهزةٌ للربط</span>'
          : state === 'awaiting_owner'
            ? '<span class="st warn"><span class="g">!</span>تنتظرك</span>'
            : '<span class="st idle"><span class="g">○</span>لم يُبنَ سائقُها</span>'

  // ── ما يُربَط ولا ينشر: الحقيقةُ كاملةً في صدر الشاشة ─────────────
  const stageBanner =
    spec.stage === 'link'
      ? `<div class="outcome warn"><span class="k">تُربَط ولا تنشر</span><span class="v">
         دورةُ الإذن مبنيّةٌ لهذه المنصّة: <b>يُحفَظ حسابُك وتُقرأ نطاقاتُه</b>.
         وسائقُ الرفع لم يُبنَ بعد، <b>فلا تُكتب لها مسوّدةٌ ولا تُجدوَل</b> —
         والقاعدةُ هي التي تمنع ذلك لا الشاشة.</span></div>`
      : ''

  // ── ما لم يُبنَ: شاشةٌ تقول السببَ لا «قريبا» ──────────────────────
  if (spec.stage === 'none') {
    return `<div class="page-head">
      <div class="txt">
        <div class="eyebrow"><span class="ln"></span>منصّةٌ لم تُبنَ</div>
        <h1>${escapeHtml(spec.label)}</h1>
        <p class="lede">${escapeHtml(spec.note)}</p>
      </div>
      <div class="aside"><div class="plat-logo lg">${logo}</div></div>
    </div>
    <div class="card">
      <h2>لماذا لا يكفي أن يُضاف من اللوحة</h2>
      <p class="hint">مزوّدو الذكاء يُضافون من اللوحة لأنّهم يتكلّمون لهجةً واحدة
        (<span class="mono">chat/completions</span>)، فسائقٌ واحدٌ يغطّي مَن لم يُخترَع بعد.
        <b>والمنصّاتُ الاجتماعيّة لا لهجةَ لها مشتركة</b> — فحقلُ «عنوان API» لا يكفيها،
        <b>ولوحةٌ تعرض حقلا يوهم بأنّه يكفي تكذب</b>.</p>
      <div class="outcome warn"><span class="k">ما ينقص</span>
        <span class="v">${escapeHtml(spec.note)}</span></div>
    </div>`
  }

  // ── حساباتُها ونطاقاتُها ─────────────────────────────────────────
  const platform = spec.id as Platform
  const accountBlocks = accounts
    .map((a) => {
      const granted = d.scopes[a.id] ?? ''
      const rows = capabilities(platform, granted)
      const missing = rows.filter((r) => !r.granted).length
      return `<div class="card" style="margin-bottom:14px">
        <div class="card-head">
          <h2>${escapeHtml(a.displayName)}</h2>
          <span class="chip">${a.kind === 'org' ? 'صفحةٌ أو شركة' : 'حسابٌ شخصيّ'}</span>
          <div class="grow"></div>
          ${a.status === 'needs_reauth'
            ? '<span class="st bad"><span class="g">▲</span>جدّد الإذن</span>'
            : missing === 0
              ? '<span class="st ok"><span class="g">●</span>كلُّ النطاقات ممنوحة</span>'
              : `<span class="st warn"><span class="g">!</span>${missing} نطاقا ناقصا</span>`}
        </div>
        <p class="hint">${
          granted === ''
            ? '<b>لا نطاقاتٍ مسجّلة لهذا الحساب.</b> وهذا يقع إن رُبط قبل أن تُسجَّل النطاقات — أعِد الربط ليُقرأ ما مُنح.'
            : missing === 0
              ? 'يستطيع هذا الحسابُ كلَّ ما يحتاجه صدى.'
              : '<b>ما نقص طُلب ولم يُمنَح</b> — والمصدرُ في العمود الأخير، وكلُّه في بوّابة المنصّة لا هنا.'
        }</p>
        ${capabilityTable(rows)}
      </div>`
    })
    .join('')

  const posts = d.posts
    .map((p) => postCard(p, platform, d.now, d.metrics[p.id] ?? []))
    .join('')

  const emptyPosts = `<div class="empty">
    <b>لا منشورَ على ${escapeHtml(spec.label)} بعد</b>
    <p>ما يُكتب يظهر في «الخطّة والمسوّدات»، ولا يصل إلى هنا حتّى تعتمده وتجدوله.
       <b>ولا يُنشر شيءٌ بلا موافقةٍ مسجّلة</b> — والقيدُ في القاعدة لا في الصفحة.</p>
    <a class="btn g sm" href="/panel#posts">افتح المسوّدات</a>
  </div>`

  const action =
    state === 'connectable'
      ? `<a class="btn p" href="/oauth/${escapeHtml(spec.id)}/start">اربط ${escapeHtml(spec.label)}</a>`
      : state === 'needs_reauth'
        ? `<a class="btn p" href="/oauth/${escapeHtml(spec.id)}/start">جدّد الإذن</a>`
        : state === 'linked'
          ? `<a class="btn g" href="/oauth/${escapeHtml(spec.id)}/start">اربط حسابا آخر</a>`
          : ''

  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>منصّة</div>
      <h1>${escapeHtml(spec.label)}</h1>
      <p class="lede">${escapeHtml(spec.note)}</p>
    </div>
    <div class="aside">
      <div class="plat-logo lg">${logo}</div>
      ${badge}${action}
    </div>
  </div>

  ${stageBanner}
  ${spec.stage === 'link' ? '' : tallyRow(d.tally, d.now)}

  <h3 class="sec">الحساباتُ وما تستطيعه</h3>
  ${accounts.length === 0
    ? `<div class="empty"><b>لا حسابَ مربوطا</b>
       <p>${state === 'awaiting_owner'
         ? 'ينقص سرّا التطبيق. اضبطهما من لوح القنوات، ثمّ عُد إلى هنا.'
         : 'زرُّ الربط أعلاه يفتح شاشةَ الإذن عند المنصّة.'}</p>
       <a class="btn g sm" href="/panel#channels">افتح لوح القنوات</a></div>`
    : accountBlocks}

  ${spec.stage === 'link'
    ? `<h3 class="sec">ولماذا لا تُكتب لها مسوّدةٌ بعد</h3>
       <div class="card"><p class="hint">قيدُ <span class="mono">posts.platform</span> في
         القاعدة يحصر المسوّدات في المنصّات التي لها سائقُ نشر.
         <b>وهذا مقصود</b>: مسوّدةٌ تُكتب لمنصّةٍ لا تنشر هي وعدٌ يُخلَف عند الجدولة —
         <b>والقاعدةُ هي التي تمنعه لا الشاشة</b> (D-009).
         ويُوسَّع القيدُ في ترحيل السائق نفسِه، لا قبله.</p>
       <div class="outcome"><span class="k">وما جاهز</span><span class="v">
         المقاطعُ تُولَّد رأسيّةً <span class="mono">9:16</span> بخمسَ عشرةَ ثانية،
         والنافذةُ الموقّعةُ تعطي المنصّةَ رابطا تسحب منه. <b>فالمادّةُ حاضرة،
         والباقي سائقُ الرفع.</b></span></div></div>`
    : `<h3 class="sec">ما نُشر وما ينتظر</h3>
       ${d.posts.length === 0 ? emptyPosts : `<div class="posts">${posts}</div>`}`}

  ${guide === undefined
    ? ''
    : `<h3 class="sec">إن احتجت ضبطا</h3>
       <div class="card"><div class="card-head"><h2>ضبطُ التطبيق ودليلُه</h2></div>
         <p class="hint">الدليلُ كاملا في لوح القنوات — بخطواته في
           ${escapeHtml(guide.portalLabel)}، ورابطِ العودة، وعلامةِ النجاح وما يقع إن فشل.</p>
         <a class="btn g sm" href="/panel#channels">افتح الدليل</a></div>`}`
}
