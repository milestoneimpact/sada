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
import { SETUP, unsignedAccounts, type ChannelView } from '../../lib/channels'
import type { AccountHealth } from '../../lib/platform/screen'
import { capabilities, type Capability } from '../../lib/oauth/scopes'
import type { Platform } from '../../lib/oauth/providers'
import { permalink, type PlatformPost, type PlatformTally } from '../../lib/platform/screen'
import { money, relativeTime } from '../../lib/format'
import { widest, windowLabel, type PostMetricRow } from '../../lib/metrics/job'

/** ما يلزم لعرض وسيطٍ في القائمة — لا صفُّ القاعدة كاملا. */
export interface PostMedia {
  readonly id: string
  readonly mime: string
  readonly status: 'ready' | 'rejected'
}
import { ICON } from './icons'
import { escapeHtml } from './shell'
import { setupPane } from './channels'
import type { AppStatus } from '../../lib/oauth/apps'
import { whenTag } from './time'
import { LOGOS } from './logos'
// وعلامةُ الدرجة من `parts` لا من نسخةٍ هنا — نقاطُ المسوّدات تقرؤها كذلك (D-163)
import { glyph, RUNG_MARK, status } from './parts'
import { readiness, type Readiness } from '../../lib/platform/readiness'

export interface PlatformScreenData {
  readonly view: ChannelView
  readonly posts: readonly PlatformPost[]
  readonly tally: PlatformTally
  /** نطاقاتُ كلّ حسابٍ كما مُنحت — مفتاحُها معرّفُ الحساب. */
  readonly scopes: Readonly<Record<string, string>>
  /** سجلُّ صحّة كلّ حساب — مفتاحُها معرّفُ الحساب (D-129). */
  readonly health: Readonly<Record<string, AccountHealth>>
  /** ما قِيس لكلّ منشور — مفتاحُها معرّفُ المنشور (D-048). */
  readonly metrics: Readonly<Record<string, readonly PostMetricRow[]>>
  /**
   * الوسائطُ المولَّدة لكلّ منشور — مفتاحُها معرّفُ المنشور.
   *
   * **وصدى يولّد صورا ومقاطعَ منذ D-039 و D-052، والقائمةُ لا تُظهر
   * منها شيئا** — لصيقةُ «بصورة» تقول إنّ هناك شيئا ولا تُريه. ومالكٌ
   * يعتمد منشورا بصورةٍ لم يرَها **يعتمد نصفَه**.
   */
  readonly media: Readonly<Record<string, readonly PostMedia[]>>
  /** أيُّ تبويبٍ مفتوح — من الاستعلام، فحالُ الصفحة في عنوانها. */
  readonly show?: Show
  /** حالُ تطبيق المنصّة — يُعرَض دليلُه هنا لا في لوح القنوات (D-111). */
  readonly app: AppStatus | undefined
  /** أصلُ اللوحة — يُبنى منه رابطُ العودة المعروضُ للنسخ. */
  readonly baseUrl: string
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
      24 ساعةً من النشر</span></div>`
  }
  return `<div class="stats">
    ${stat('ظهور', m.impressions)}
    ${stat('تفاعل', m.reactions)}
    ${stat('تعليق', m.comments)}
    ${stat('مشاركة', m.shares)}
    <span class="grow"></span>
    <span class="ago" title="${escapeHtml(m.pulledAt)} UTC">نافذةُ ${escapeHtml(
      windowLabel(m.window),
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
            ? status('ok', '●', 'ممنوح')
            : status('bad', '▲', 'ناقص')
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

/**
 * مصغَّراتُ الوسائط تحت النصّ.
 *
 * **والصورةُ تُعرَض لا يُقال إنّ هناك صورة.** لصيقةُ «بصورة» تخبر
 * ولا تُري، ومالكٌ يعتمد منشورا بصورةٍ لم يرَها **يعتمد نصفَه**.
 *
 * والبايتاتُ من `/panel/media/:id` **خلف الجلسة** (D-050): صورةٌ
 * لمنشورٍ لم يُنشر بعد تكشف ما يُعدُّه المالك قبل أن يعلنه.
 *
 * **والمرفوضُ يُعرَض مُعلَّما لا يُخفى**: كلفتُه دُفعت، وإخفاؤه يجعل
 * سطرا في الدفتر بلا ما يقابله.
 *
 * والفيديو `<video>` لا `<img>`: إطارٌ أوّلُ ساكنٌ يكفي للتعرّف،
 * **ولا تشغيلَ آليّ** — صوتٌ يبدأ وحده في لوحةِ عملٍ عدوان.
 */
function mediaStrip(items: readonly PostMedia[]): string {
  if (items.length === 0) return ''
  const cells = items
    .map((m) => {
      const src = `/panel/media/${encodeURIComponent(m.id)}`
      const isVideo = m.mime.startsWith('video/')
      const body = isVideo
        ? `<video src="${escapeHtml(src)}" preload="metadata" muted playsinline
             aria-label="مقطعٌ مولَّد"></video>`
        : `<img src="${escapeHtml(src)}" alt="صورةٌ مولَّدة لهذا المنشور" loading="lazy" data-media>`
      return `<a class="thumb${m.status === 'rejected' ? ' off' : ''}"
        href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer">
        ${body}
        ${isVideo ? '<span class="tag">مقطع</span>' : ''}
        ${m.status === 'rejected' ? '<span class="tag bad">مرفوضة</span>' : ''}
      </a>`
    })
    .join('')
  return `<div class="thumbs">${cells}</div>`
}

/** بطاقةُ منشورٍ واحد — نصُّه هو المعروض، لا ملخّصٌ عنه. */
function postCard(
  post: PlatformPost,
  platform: Platform,
  now: Date,
  metrics: readonly PostMetricRow[],
  media: readonly PostMedia[],
): string {
  const meta = STATUS[post.status] ?? { label: post.status, cls: 'idle', g: '○' }
  const link = permalink(platform, post.platformPostId)

  const when =
    post.publishedAt !== null
      ? `<span class="ago" title="${escapeHtml(post.publishedAt)} UTC">نُشر منذ ${escapeHtml(
          relativeTime(post.publishedAt, now),
        )}</span>`
      : post.scheduledAt !== null
        /*
         * **والمنطقةُ في المتن لا في `title`** (D-106): ما في `title` لا
         * يُرى إلّا بتحويم فأرة، **ولا فأرةَ في الجوّال** — فموعدٌ يُقرأ
         * هناك بلا منطقةٍ يُحسَب بتوقيت القارئ وهو UTC.
         */
        ? `<span class="ago when">${whenTag(post.scheduledAt, { label: 'موعدُه' })}</span>`
        : `<span class="ago">كُتبت منذ ${escapeHtml(relativeTime(post.createdAt, now))}</span>`

  // الفشلُ يُعرض بنصّه: «فشل» وحدها لا تُعالَج، والسببُ يُعالَج
  const error =
    post.lastError === null
      ? ''
      : `<div class="why bad"><span class="i">${glyph('▲')}</span><span class="t">
         <b>آخرُ فشل:</b> ${escapeHtml(post.lastError)}</span></div>`

  return `<article class="post">
    <div class="post-top">
      ${status(meta.cls, meta.g, meta.label)}
      ${post.accountName === null
        ? ''
        : `<span class="chip">${escapeHtml(post.accountName)}</span>`}
      ${media.length === 0
        ? post.hasMedia
          // صفٌّ يقول إنّ له وسيطا ولا وسيطَ يُقرأ: يُقال ولا يُخفى
          ? '<span class="chip">وسيطٌ لا يُقرأ</span>'
          : ''
        : ''}
      <span class="grow"></span>${when}
    </div>
    <p class="post-text">${escapeHtml(post.text)}</p>
    ${mediaStrip(media)}
    ${metricRow(metrics, post.status === 'published', now)}
    ${error}
    <div class="post-foot">
      ${link === null
        ? post.status === 'published'
          ? '<span class="ago">نُشر، ولم تُعِد المنصّةُ معرّفا يُبنى منه رابط.</span>'
          : ''
        : `<a class="btn g sm" href="${escapeHtml(link)}" target="_blank"
             rel="noopener noreferrer">${ICON.external} افتحه على المنصّة</a>`}
      <span class="grow"></span>
      ${post.costUsd > 0
        ? `<span class="ago money">${money(post.costUsd)} كتابةً</span>`
        : ''}
    </div>
  </article>`
}

/** أربعةُ أرقامٍ في صفٍّ — الحصادُ قبل التفاصيل. */
function tallyRow(t: PlatformTally, now: Date): string {
  const cell = (k: string, v: string, n: string): string =>
    `<div class="card tile"><div class="k">${k}</div><div class="v">${v}</div>
     <div class="n">${n}</div></div>`

  return `<div class="grid tiles c4">
    ${cell('نُشر', String(t.published), t.lastPublishedAt === null
      ? 'لم يُنشر شيءٌ بعد'
      : `آخرُه منذ ${escapeHtml(relativeTime(t.lastPublishedAt, now))}`)}
    ${cell('في الطابور', String(t.queued), 'ينتظر موعدَه أو دورةَ الإرسال')}
    ${cell('فشل', String(t.failed), t.failed === 0 ? 'لا فشلَ مسجَّل' : 'يُقرأ سببُه تحت')}
    ${cell('كلفةُ الكتابة', `${money(t.spend).replace(/\$$/, '')}<em>$</em>`, 'على منشورات هذه المنصّة وحدها')}
  </div>`
}

/**
 * تبويباتُ القائمة — **فرزٌ لا إخفاء.**
 *
 * ## ولماذا لم تكن
 *
 * D-046 قال: «الفاشلةُ تُعرض مع الناجحة ولا تُخفى في تبويبٍ ثانٍ —
 * **فشلٌ لا يُرى لا يُعالَج**». وذاك صحيحٌ عند ثلاثةِ منشورات.
 * **وعند ستّين لا يُرى الفشلُ أصلا**: يغرق بين الناجحات.
 *
 * ## فالفرزُ يخدم القاعدةَ نفسَها إن حُرس بشرطين
 *
 * **١ · العددُ على كلّ تبويبٍ دائما** — فمن يقف على «الكلّ» يرى «فشل ٣»
 * بلا أن يفتحه. **والرقمُ هو الذي يُنبّه، لا فتحُ التبويب.**
 *
 * **٢ · والافتراضُ «الكلّ»** لا «نُشر»: تبويبٌ افتراضيٌّ يُخفي الفشلَ
 * هو عينُ ما حذّر منه D-046.
 *
 * ## ويعمل بلا جافاسكربت
 *
 * التبويباتُ **روابطُ استعلام** (`?show=failed`) لا أزرارُ سكربت:
 * تُفتَح في تبويبٍ جديد، وتُحفَظ في المفضّلة، وتعمل إن سقط السكربت.
 * **وحالُ الصفحة في عنوانها** — فمن يشارك رابطا يشارك ما يرى.
 */
type Show = 'all' | 'published' | 'queued' | 'failed' | 'drafts'

const SHOW_LABEL: Readonly<Record<Show, string>> = {
  all: 'الكلّ',
  published: 'نُشر',
  queued: 'في الطابور',
  failed: 'فشل',
  drafts: 'مسوّدات',
}

const SHOW_MATCH: Readonly<Record<Show, (status: string) => boolean>> = {
  all: () => true,
  published: (s) => s === 'published',
  queued: (s) => s === 'queued',
  failed: (s) => s === 'failed',
  drafts: (s) => s === 'draft' || s === 'approved' || s === 'edited' || s === 'rejected',
}

export function showOf(raw: string | undefined): Show {
  return raw !== undefined && raw in SHOW_LABEL ? (raw as Show) : 'all'
}

function postTabs(posts: readonly PlatformPost[], active: Show, platform: string): string {
  const order: Show[] = ['all', 'published', 'queued', 'failed', 'drafts']
  const links = order
    .map((show) => {
      const n = posts.filter((p) => SHOW_MATCH[show](p.status)).length
      // تبويبٌ فارغٌ لا يُعرَض — إلّا «الكلّ» فهو المرجع
      if (n === 0 && show !== 'all') return ''
      const href = show === 'all'
        ? `/panel/channels/${encodeURIComponent(platform)}`
        : `/panel/channels/${encodeURIComponent(platform)}?show=${show}`
      const on = show === active
      return `<a class="ftab${on ? ' on' : ''}${show === 'failed' && n > 0 ? ' bad' : ''}"
        href="${escapeHtml(href)}"${on ? ' aria-current="page"' : ''}
        >${SHOW_LABEL[show]}<span class="count">${n}</span></a>`
    })
    .join('')
  return `<nav class="ftabs" aria-label="فرزُ المنشورات">${links}</nav>`
}

/**
 * **سجلُّ صحّة الحساب** (D-129): متى رُبط، ومتى جُدّد آخرَ مرّةٍ بنجاح، ومتى
 * ينتهي رمزُه ورمزُ تجديده، وما سُجّل من اقترابٍ. كلُّه من صفوفٍ في
 * القاعدة — `accounts` و`tokens` و`token_alerts` — **ولا محطّةَ تُخترَع**:
 * حسابٌ لم يُجدَّد قطّ يُقال فيه ذلك، لا يُرسَم له تاريخٌ فارغ.
 */
function healthLog(h: AccountHealth | undefined, linkedAt: string, now: Date): string {
  const when = (at: string | null, none: string): string =>
    at === null ? none : `<span title="${escapeHtml(at)} UTC">${escapeHtml(relativeTime(at, now))}</span>`
  const alerts = (h?.alerts ?? []).slice(0, 5).map((al) =>
    `<li><span class="dot ${al.threshold === 0 ? 'bad' : 'warn'}"></span>
      <span>${al.kind === 'refresh' ? 'إذنُ التجديد' : 'إذنُ الوصول'} ${
        al.threshold === 0 ? 'انتهى' : `يقترب — بقي ${al.threshold} ${al.threshold === 1 ? 'يوم' : 'أيّام'}`}
      <span class="ago">${escapeHtml(relativeTime(al.at, now))}</span></span></li>`).join('')
  return `<h3 class="sec">سجلُّ صحّة الحساب</h3>
      <ul class="todo health">
        <li><span class="dot ok"></span><span>رُبط ${when(linkedAt, '—')}</span></li>
        <li><span class="dot ${h?.refreshedAt ? 'ok' : ''}"></span><span>${
          h?.refreshedAt ? `جُدّد آخرَ مرّةٍ ${when(h.refreshedAt, '')}` : 'لم يُجدَّد بعدُ — يُجدَّد قبل انتهائه بساعتين'}</span></li>
        <li><span class="dot"></span><span>${
          h?.expiresAt ? `إذنُ الوصول ينتهي ${when(h.expiresAt, '')}` : 'لا إذنَ وصولٍ محفوظا'}${
          h?.refreshExpiresAt ? ` · والتجديدُ ${when(h.refreshExpiresAt, '')}` : ''}</span></li>
        ${h?.needsReauthAt ? `<li><span class="dot bad"></span><span>سقط الإذن ${when(h.needsReauthAt, '')} — والنشرُ متوقّفٌ عليه منذها</span></li>` : ''}
        ${alerts}
      </ul>`
}

/**
 * سلّمُ الجاهزيّة (D-158): خمسُ درجاتٍ من الصفوف لا من الكلمة، وأوّلُ
 * ساقطةٍ حكمٌ وزرّ. **ويُطوى ما تمّ**: مالكٌ عاد بعد شهرٍ يريد الدرجةَ
 * الساقطةَ لا الخمس.
 */
export function readinessLadder(r: Readiness): string {
  if (r.rungs.length === 0) return ''
  const rows = r.rungs
    .map((rung, i) => {
      const mark = RUNG_MARK[rung.state]
      const act = rung.action === undefined || rung.state === 'done' || rung.state === 'waiting'
        ? ''
        : `<a class="btn ${rung.state === 'failed' ? 'p' : 'g'} sm" href="${escapeHtml(rung.action.href)}">${escapeHtml(rung.action.label)}</a>`
      return `<li class="${mark.cls}${rung === r.next ? ' at' : ''}">
        <span class="n" aria-hidden="true">${i + 1}</span>
        <span class="body">
          <span class="what">${escapeHtml(rung.title)}</span>
          <span class="why">${escapeHtml(rung.note)}</span>
        </span>
        ${act}
        ${status(mark.cls, mark.g, mark.label)}
      </li>`
    })
    .join('')
  const done = r.rungs.filter((x) => x.state === 'done').length
  const all = done === r.rungs.length
  return `<details class="card ladder"${all ? '' : ' open'}>
    <summary class="card-head">
      <h2>أتنشر الآن؟</h2><div class="grow"></div>
      ${status(
        r.verdict.kind,
        r.verdict.kind === 'ok' ? '●' : r.verdict.kind === 'bad' ? '▲' : r.verdict.kind === 'warn' ? '◍' : '○',
        r.verdict.kind === 'ok' ? 'تعمل' : r.verdict.kind === 'bad' ? 'لا تنشر' : r.verdict.kind === 'warn' ? 'تنتظرك' : 'تنتظر',
      )}
      <span class="st idle">${done} من ${r.rungs.length}</span>
    </summary>
    <p class="verdict ${r.verdict.kind}">${escapeHtml(r.verdict.text)}</p>
    <p class="hint">كلُّ درجةٍ تُحسَب من صفٍّ في القاعدة لا من كلمة: الإذنُ من موعد انتهائه، والتجديدُ من آخر مرّةٍ وقع، والنشرُ من آخر محاولة.</p>
    <ol class="steps wiz">${rows}</ol>
  </details>`
}

export function platformScreen(d: PlatformScreenData): string {
  const { spec, state, accounts } = d.view
  const logo = LOGOS[spec.id] ?? ''
  const guide = SETUP[spec.id]

  // ‏والشارةُ تقرأ الصفَّ كما تقرؤه بطاقةُ القناة (D-166)
  const unsigned = unsignedAccounts(d.view).length > 0
  const badge =
    unsigned
      ? status('bad', '▲', 'مربوطة بلا إذن')
      : state === 'linked'
      ? status('ok', '●', 'مربوطة')
      : state === 'needs_reauth'
        ? status('bad', '▲', 'تحتاج تجديدا')
        : state === 'connectable'
          ? status('idle', '○', 'جاهزةٌ للربط')
          : state === 'awaiting_owner'
            ? status('warn', '!', 'تنتظرك')
            : status('idle', '○', 'لم يُبنَ سائقُها')

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
      return `<div class="card" style="margin-bottom:var(--s-3)">
        <div class="card-head">
          <h2>${escapeHtml(a.displayName)}</h2>
          <span class="chip">${a.kind === 'org' ? 'صفحةٌ أو شركة' : 'حسابٌ شخصيّ'}</span>
          <div class="grow"></div>
          ${a.status === 'needs_reauth'
            ? status('bad', '▲', 'جدّد الإذن')
            : missing === 0
              ? status('ok', '●', 'كلُّ النطاقات ممنوحة')
              : `${status('warn', '!', `${missing} نطاقا ناقصا`)}`}
        </div>
        <p class="hint">${
          granted === ''
            ? '<b>لا نطاقاتٍ مسجّلة لهذا الحساب.</b> وهذا يقع إن رُبط قبل أن تُسجَّل النطاقات — أعِد الربط ليُقرأ ما مُنح.'
            : missing === 0
              ? 'يستطيع هذا الحسابُ كلَّ ما يحتاجه صدى.'
              : '<b>ما نقص طُلب ولم يُمنَح</b> — والمصدرُ في العمود الأخير، وكلُّه في بوّابة المنصّة لا هنا.'
        }</p>
        ${capabilityTable(rows)}
        ${healthLog(d.health[a.id], a.createdAt, d.now)}
      </div>`
    })
    .join('')

  const show = d.show ?? 'all'
  const shown = d.posts.filter((p) => SHOW_MATCH[show](p.status))
  const posts = shown
    .map((p) => postCard(p, platform, d.now, d.metrics[p.id] ?? [], d.media[p.id] ?? []))
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
        ? `<a class="btn p" href="/oauth/${escapeHtml(spec.id)}/start"
              aria-label="جدّد إذن ${escapeHtml(spec.label)}">جدّد الإذن</a>`
        : unsigned
          ? `<a class="btn p" href="/oauth/${escapeHtml(spec.id)}/start"
                aria-label="أعد ربط ${escapeHtml(spec.label)}">أعد الربط</a>`
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
  ${readinessLadder(readiness({ view: d.view, app: d.app, health: d.health, tally: d.tally, posts: d.posts, now: d.now }))}
  ${spec.stage === 'link' ? '' : tallyRow(d.tally, d.now)}

  <h3 class="sec">الحساباتُ وما تستطيعه</h3>
  ${accounts.length === 0
    ? `<div class="empty"><b>لا حسابَ مربوطا</b>
       <p>${state === 'awaiting_owner'
         ? 'ينقص سرّا التطبيق — واضبطهما من «ضبطُ التطبيق» أسفلَ هذه الصفحة.'
         : 'زرُّ الربط أعلاه يفتح شاشةَ الإذن عند المنصّة.'}</p>${
         state === 'awaiting_owner' && guide !== undefined
           ? '<a class="btn p sm" href="#setup">اضبط التطبيق</a>'
           : ''}</div>`
    : accountBlocks}

  ${spec.stage === 'link'
    ? `<h3 class="sec">ولماذا لا تُكتب لها مسوّدةٌ بعد</h3>
       <div class="card"><p class="hint">قيدُ <span class="mono">posts.platform</span> في
         القاعدة يحصر المسوّدات في المنصّات التي لها سائقُ نشر.
         فمسوّدةٌ تُكتب لمنصّةٍ لا تنشر وعدٌ يُخلَف عند الجدولة،
         <b>والقاعدةُ هي التي تمنعه لا الشاشة</b>.
         ويُوسَّع القيدُ في ترحيل السائق نفسِه، لا قبله.</p>
       <div class="outcome"><span class="k">وما جاهز</span><span class="v">
         المقاطعُ تُولَّد رأسيّةً <span class="mono">9:16</span> بخمسَ عشرةَ ثانية،
         والنافذةُ الموقّعةُ تعطي المنصّةَ رابطا تسحب منه. <b>فالمادّةُ حاضرة،
         والباقي سائقُ الرفع.</b></span></div></div>`
    : `<h3 class="sec">ما نُشر وما ينتظر</h3>
       ${d.posts.length === 0
         ? emptyPosts
         : `${postTabs(d.posts, show, spec.id)}
            ${shown.length === 0
              ? `<div class="empty"><b>لا شيءَ في «${SHOW_LABEL[show]}»</b>
                 <p>والعددُ على كلّ تبويبٍ يقول أين ما تبحث عنه.</p>
                 <a class="btn g sm" href="/panel/channels/${escapeHtml(spec.id)}">الكلّ</a></div>`
              : `<div class="posts">${posts}</div>`}`}`}

  ${/*
     * **والدليلُ هنا لا في اللوح** (D-111).
     *
     * كان مقلوبا: البطاقةُ في لوح القنوات تحمل الدليلَ كاملا، والشاشةُ
     * تقول «الدليلُ في اللوح». **فقِيست البطاقةُ فوُجدت كتلةُ الدليل
     * ‏١٢٦٥px من أصل ‏١٦٢٠ — ‏٧٨٪ منها وثيقة**، وفتحُها يُطيلها ولا يُطيل
     * جارتَها **فيُمزَّق صفُّ الشبكة بـ‏١٤٣٩px**.
     *
     * **والبطاقةُ حالٌ، والشاشةُ وثيقة.** فما يحتاج مساحةً يسكن حيث
     * المساحةُ عمودٌ واحدٌ لا شبكةٌ تُمزَّق.
     *
     * **وترويسةٌ بلا جسدٍ لا تُرسَم** (لاحقةُ D-123). `setupPane` تردّ فراغا
     * حين لا حالَ للتطبيق — وهي حالُ YouTube وTikTok وInstagram في اللوحة،
     * لأنّ `appStatuses` تُقرأ لمنصّتين — **فكانت الشاشةُ تنتهي بعنوانٍ
     * تحته لا شيء**، يُقرأ قسما سقط. فيُحسَب اللوحُ أوّلا، والعنوانُ يتبعه.
     */''}${(() => {
    const setup = guide === undefined ? '' : setupPane(d.view, d.app, d.baseUrl)
    return setup === '' ? '' : `<h3 class="sec" id="setup">ضبطُ التطبيق ودليلُه</h3>\n       ${setup}`
  })()}`
}
