/**
 * صفحةُ المنصّة — **صفحةُ حسابٍ لا لوحُ ضبط** (D-172).
 *
 * ## ما قاله المالك
 *
 * «لا رحلةَ توضّح المطلوبَ لكلّ منصّة، وماذا تمّ فيها، في صفحتها، بالتاريخ.
 * تشبه صفحةَ المنصّة، وتوضّح شكلَ المنشور، والسابقَ واللاحق.»
 *
 * وكانت الشاشةُ تبدأ بالسلّم وجداول النطاقات، **فيقع أوّلُ منشورٍ عند ‏٢٤٤٠
 * بكسلًا**، والقادمُ مخلوطٌ بما نُشر، والتواريخُ نسبيّةٌ والمطلقُ في `title`.
 *
 * ## فأربعةُ أسئلةٍ بترتيبها
 *
 * ١ · **من أنا هنا، وهل أنشر الآن؟** — رأسُ الحساب ببنية المنصّة، وحكمٌ واحد.
 * ٢ · **ماذا تطلب المنصّة؟** — سبعُ محطّاتٍ من `platformNeeds` وأعدادِ المنصّة.
 * ٣ · **ماذا سيُنشر ومتى؟** — «القادم» تصاعديًّا بتوقيت المالك وUTC تحته.
 * ٤ · **ماذا نُشر ومتى وبأيّ نتيجة؟** — تحت رؤوس أيّامٍ لاصقة، والفاشلُ في يومه
 *    ومعه سببُه بالعربيّة وفعلُه.
 *
 * **والضبطُ في تبويبه**: السلّمُ كاملًا والنطاقاتُ وسجلُّ الصحّة ودليلُ التطبيق
 * يُسأل عنها مرّةً في عمر المنصّة، فلا تسبق ما يُسأل عنه كلَّ يوم.
 *
 * ## والمنصّةُ التي لم يُبنَ لها سائقٌ لها شاشةٌ أيضا
 *
 * وفيها ما ينقص بالضبط، لا «قريبا». **والسببُ يُصدَّق، والوعدُ يُنتظَر ثمّ يُنسى.**
 */
import type { Pulse } from '../../lib/insights/pulse'
import { agoTag } from './time'
import { channelHealth, SETUP, unsignedAccounts, type ChannelView } from '../../lib/channels'
import type { AccountHealth, PlatformPost, PlatformTally } from '../../lib/platform/screen'
import { permalink } from '../../lib/platform/screen'
import { capabilities, type Capability } from '../../lib/oauth/scopes'
import { platformLabel, type Platform } from '../../lib/oauth/providers'
import { counted, duration, money, NOUNS, parseSqliteUtc, relativeTime, shortAgo, untilTime } from '../../lib/format'
import { widest, windowLabel, type PostMetricRow } from '../../lib/metrics/job'
import type { AppStatus } from '../../lib/oauth/apps'
import type { PlatformNeeds } from '../../lib/platform/needs'
import {
  classifyQueued, type HistoryFilter, type HistoryPage, type PlatformCounts, type TimelineRow,
} from '../../lib/platform/timeline'
import { whyFailed } from '../../lib/publish/reasons'
import { clock, dayKey, dayLabel, stamp } from '../../lib/time/zone'
import { ICON } from './icons'
import { echo } from './echo'
import { escapeHtml } from './escape'
// ‏القالبُ الموسوم (D-281) لما يُستحدث هنا؛ و`raw` لمخرَج `when()` الذي يرسم HTML ولم يُحوَّل بعد
import { html, raw } from './html'
import { setupPane } from './channels'
import { LOGOS } from './logos'
// وعلامةُ الدرجة من `parts` لا من نسخةٍ هنا — نقاطُ المسوّدات تقرؤها كذلك (D-163)
import { fileName, glyph, pathArrows, RUNG_MARK } from './parts'
import { statusBadge } from './components/badge'
import { notice, toastRegion } from './components/toast'
import { tabs } from './components/tabs'
import { readiness, type Readiness } from '../../lib/platform/readiness'
import { nativePost, npDay, npRow, npTile, type NpMedia, type NpPlatform } from './nativePost'
import { returnTo } from '../../lib/nav/back'
import { emptyState } from './components/empty'
import { threadCheckForm } from './sections/drafts'
import { button } from './components/button'
import { card } from './components/card'
import { dialog } from './components/dialog'
import { REVOKE_PAGE } from '../../lib/oauth/disconnect'
import { PAGE_CALLBACK_PATH, PAGE_SAY } from '../../lib/linkedinPage'
import { taskHref } from '../../lib/owner'

/** ما يلزم لعرض وسيطٍ — لا صفُّ القاعدة كاملا. */
export interface PostMedia {
  readonly id: string
  readonly mime: string
  readonly status: 'ready' | 'rejected'
  /** `''` حين رُكّبت الشريحةُ بمقاس المنصّة، و`null` لصفٍّ أقدم من الحفظ. */
  readonly note: string | null
}

export type Tab = 'posts' | 'waiting' | 'media' | 'setup'

export interface PlatformScreenData {
  readonly view: ChannelView
  /** آخرُ المنشورات — لسلّم الجاهزيّة وحده (درجةُ النشر من آخر محاولة). */
  readonly posts: readonly PlatformPost[]
  readonly tally: PlatformTally
  readonly counts: PlatformCounts
  readonly needs: PlatformNeeds | null
  readonly upcoming: readonly TimelineRow[]
  readonly history: HistoryPage
  readonly waiting: readonly TimelineRow[]
  readonly filter: HistoryFilter
  readonly tab: Tab
  /** كلفةُ الدفتر باسم كلّ منشور — تُضاف إلى عموده. */
  readonly costs: Readonly<Record<string, number>>
  /** نطاقاتُ كلّ حسابٍ كما مُنحت — مفتاحُها معرّفُ الحساب. */
  readonly scopes: Readonly<Record<string, string>>
  /** سجلُّ صحّة كلّ حساب — مفتاحُها معرّفُ الحساب (D-129). */
  readonly health: Readonly<Record<string, AccountHealth>>
  /** ما قِيس لكلّ منشور — مفتاحُها معرّفُ المنشور (D-048). */
  readonly metrics: Readonly<Record<string, readonly PostMetricRow[]>>
  /** الوسائطُ المولَّدة لكلّ منشور — مفتاحُها معرّفُ المنشور. */
  readonly media: Readonly<Record<string, readonly PostMedia[]>>
  /** حالُ تطبيق المنصّة — يُعرَض دليلُه في «الإعداد» (D-111). */
  readonly app: AppStatus | undefined
  /** أصلُ اللوحة — يُبنى منه رابطُ العودة المعروضُ للنسخ. */
  readonly baseUrl: string
  /** منطقةُ المالك من كعكة متصفّحه، أو `null` فالأيّامُ بتوقيت الرياض (D-201). */
  readonly zone: string | null
  /** وميضُ آخر فعلٍ عاد إلى هذه الصفحة. */
  readonly flash: { readonly kind: 'ok' | 'warn' | 'bad'; readonly text: string } | null
  readonly now: Date
  /**
   * أيُنشَر للعامّة؟ (D-190) — لـ YouTube وTikTok وحدهما، قرارُ المالك بعد الإجازة.
   * وغيابُه: منصّةٌ لا خيارَ فيها (تنشر للعامّة دائمًا أو لا تنشر مقطعًا).
   */
  readonly reachPublic?: boolean
  /**
   * لـ TikTok: قُلب العلنيُّ ولا حسابَ نشطًا بـ `video.publish` (D-190) — فالناشرُ يرسل إلى
   * صندوق التطبيق، وتقول البطاقةُ ذلك بدل «للعامّة».
   */
  readonly reachNoScope?: boolean
  /** ‏أضُبط سرّا تطبيق صفحة LinkedIn الثاني؟ (D-423) — لـ LinkedIn وحدها، وغيابُه «لا». */
  readonly pageApp?: boolean
  /** نبضُ القناة لهذا العميل (D-263) — يغيب لمنصّةٍ لا تُقاس. */
  readonly pulse?: Pulse
}

const TABS: readonly Tab[] = ['posts', 'waiting', 'media', 'setup']

/**
 * ‏بطاقةُ «الكتابة من مصدر» في لوح المنشورات — **لا لوحُ المصادر** (ر-2).
 *
 * ‏كانت ثلاثةُ أزرارٍ هنا تقول «اكتب» وتفتح «#sources»: جدولُ ملفّاتٍ وزرُّ «مسح Drive»
 * ‏ولا نموذجَ كتابة. والمرساةُ تفتح لوحَها ثمّ تنزل إليها (`panelScript` · show).
 */
const WRITE = '/panel#write'

/**
 * ‏**غلافُ الحساب حين لا غلافَ من المنصّة** (BRAND §٥ · D-229): النغمةُ الفاتحةُ على `--surface-2` بلا حريرٍ ولا خيط،
 * ‏صدَيان بحبر `--ink-3`، والقمّةُ في أوّل السطر (يمينًا) بعيدًا عن شعار المنصّة في آخره. حتميٌّ فيُحسب مرّة.
 */
const COVER_ECHO = echo({ width: 960, height: 120, tone: 'light', density: 2, crest: 0.75, level: 0.45, align: 'xMaxYMid' })

export function tabOf(raw: string | undefined, show: string | undefined): Tab {
  if (raw !== undefined && (TABS as readonly string[]).includes(raw)) return raw as Tab
  // ‏و`?show=` القديم يُترجَم ولا يُكسَر رابطٌ حُفظ في المفضّلة
  return show === 'drafts' ? 'waiting' : 'posts'
}

export function filterOf(raw: string | undefined, show: string | undefined): HistoryFilter {
  const v = raw ?? show
  return v === 'published' || v === 'failed' ? v : 'all'
}

function href(platform: string, query: Record<string, string> = {}, hash = ''): string {
  const q = new URLSearchParams(query).toString()
  return `/panel/channels/${encodeURIComponent(platform)}${q === '' ? '' : `?${q}`}${hash}`
}

/** وسيطُ المنشور: الصورةُ الجاهزة، والمقطعُ إن وُجد يغلبها وتصير غلافَه. */
function mediaOf(items: readonly PostMedia[] | undefined): { media: NpMedia | null; poster: string | null } {
  const ready = (items ?? []).filter((m) => m.status === 'ready')
  const clip = ready.find((m) => m.mime.startsWith('video/'))
  const image = ready.find((m) => !m.mime.startsWith('video/'))
  if (clip !== undefined) {
    return { media: { id: clip.id, mime: clip.mime, composed: true }, poster: image?.id ?? null }
  }
  if (image !== undefined) {
    return { media: { id: image.id, mime: image.mime, composed: image.note === '' }, poster: null }
  }
  return { media: null, poster: null }
}

/** سطرُ الوقت خارج الإطار: الساعةُ بتوقيت المالك كبيرةً، و«بتوقيت الرياض» تحتها حين هي احتياط (D-201). */
function whenCol(value: string, zone: string | null, opts: { day?: boolean; rel?: string | undefined; state: string }): string {
  const local = clock(value, zone)
  return `${opts.day === true ? `<span class="np-dayl">${escapeHtml(dayLabel(value, zone, false))}</span>` : ''}
    <b class="np-clock">${escapeHtml(local)}</b>
    ${zone === null ? '<span class="np-utc">بتوقيت الرياض</span>' : ''}
    ${opts.rel === undefined ? '' : `<span class="ago">${escapeHtml(opts.rel)}</span>`}
    ${opts.state}`
}

function frame(d: PlatformScreenData, row: TimelineRow, when: string): string {
  const { media, poster } = mediaOf(d.media[row.id])
  const m = d.metrics[row.id]
  const best = m === undefined ? null : widest(m)
  return nativePost({
    platform: d.view.spec.id as NpPlatform,
    id: row.id,
    author: { name: row.accountName ?? d.view.accounts[0]?.displayName ?? d.view.spec.label, kind: row.accountKind },
    text: row.text,
    when,
    media,
    poster,
    metrics: best,
    variant: 'compact',
  })
}

function journeyLink(id: string): string {
  return `<a class="tap" href="/panel/journey/${escapeHtml(encodeURIComponent(id))}">سجلُّه</a>`
}

function requeueForm(id: string, primary: boolean, platform: string): string {
  return `<form class="inline" method="POST" action="/panel/drafts/requeue" data-busy="جار…">
    <input type="hidden" name="id" value="${escapeHtml(id)}">
    <input type="hidden" name="return" value="${escapeHtml(returnTo(platform, 'waiting'))}">
    <button class="btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm" type="submit">أعده إلى المعتمَد</button></form>`
}

/** كلفةُ المنشور كلُّها: عمودُه وما في الدفتر باسمه. */
function costOf(d: PlatformScreenData, row: TimelineRow): number {
  return row.costUsd + (d.costs[row.id] ?? 0)
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
/**
 * مسارُ البوّابة وأسماءُ أزرارها **بحرفها كما تراها على الشاشة** — شيفرةً لا
 * كلامًا: «Request access» اسمُ زرٍّ عند LinkedIn، لا كلمةٌ تُترجَم.
 */
function portalPath(where: string): string {
  return pathArrows(escapeHtml(where).replace(/[A-Za-z][A-Za-z .]*[A-Za-z]/g, (m) => `<span class="mono">${m}</span>`))
}

function capabilityTable(rows: readonly Capability[]): string {
  const cells = rows
    .map((row) => {
      const on = row.granted
      return `<tr>
        <td data-label="النطاق"><span class="mono">${escapeHtml(row.spec.name)}</span></td>
        <td data-label="يفتح"><span class="nm">${escapeHtml(row.spec.enables)}</span></td>
        <td data-label="الحال">${
          on
            ? statusBadge('ok', '●', 'ممنوح')
            : statusBadge('bad', '▲', 'ناقص')
        }</td>
        <td data-label="مصدرُه">${
          on
            ? '<span class="ago">—</span>'
            : `<span class="sub m-0"><b>${escapeHtml(row.spec.grantedBy)}</b><br>
               ${portalPath(row.spec.where)}</span>`
        }</td>
      </tr>`
    })
    .join('')

  return `<div class="scroll"><table>
    <thead><tr><th>النطاق</th><th>يفتح</th><th>الحال</th><th>مصدرُه إن نقص</th></tr></thead>
    <tbody>${cells}</tbody></table></div>`
}


/**
 * **سجلُّ صحّة الحساب** (D-129): متى رُبط، ومتى جُدّد آخرَ مرّةٍ بنجاح، ومتى
 * ينتهي رمزُه ورمزُ تجديده، وما سُجّل من اقترابٍ. كلُّه من صفوفٍ في
 * القاعدة — `accounts` و`tokens` و`token_alerts` — **ولا محطّةَ تُخترَع**:
 * حسابٌ لم يُجدَّد قطّ يُقال فيه ذلك، لا يُرسَم له تاريخٌ فارغ.
 */
/** أسبابُ القياس رموزٌ من `metrics/job.ts` — تُقال بالعربيّة، وما سواها كما جاء (D-291). */
function metricsNoteText(note: string): string {
  if (note === 'no_tokens') return 'لا إذن محفوظ'
  if (note === 'missing_read_scope') return 'الإذن بلا نطاق قراءة — أعد الربط'
  return note
}

function healthLog(h: AccountHealth | undefined, linkedAt: string, now: Date, zone: string | null): string {
  const when = (at: string | null, none: string): string =>
    at === null ? none : agoTag(at, now, zone)
  /*
   * ‏**والموعدُ القادمُ يُعَدّ إلى الأمام** (ر-1): `relativeTime` للماضي وتحصر الفرقَ
   * ‏بالصفر، فكان كلُّ انتهاءٍ قادمٍ «الآن» — «إذنُ الوصول ينتهي الآن · والتجديدُ الآن»
   * ‏لحسابٍ سليمٍ بقي له 300 يوم، والسلّمُ فوقه يقول «صالحٌ 54 يومًا». والفعلُ يتبع الزمن.
   */
  const ends = (at: string): string => {
    const date = parseSqliteUtc(at)
    const past = date !== null && date.getTime() <= now.getTime()
    return `${past ? 'انتهى' : 'ينتهي'} ${agoTag(at, now, zone, past ? undefined : untilTime(at, now))}`
  }
  const alerts = (h?.alerts ?? []).slice(0, 5).map((al) =>
    `<li><span class="dot ${al.threshold === 0 ? 'bad' : 'warn'}"></span>
      <span>${al.kind === 'refresh' ? 'إذن التجديد' : 'إذن الوصول'} ${
        al.threshold === 0 ? 'انتهى' : `يقترب — بقي ${al.threshold} ${al.threshold === 1 ? 'يوم' : 'أيّام'}`}
      <span class="ago">${escapeHtml(relativeTime(al.at, now))}</span></span></li>`).join('')
  return `<h3 class="sec">سجلّ صحّة الحساب</h3>
      <ul class="todo health">
        <li><span class="dot ok"></span><span>رُبط ${when(linkedAt, '—')}</span></li>
        <li><span class="dot ${h?.refreshedAt ? 'ok' : ''}"></span><span>${
          h?.refreshedAt ? `جُدّد آخر مرّة ${when(h.refreshedAt, '')}` : 'لم يُجدَّد بعد — يُجدَّد قبل انتهائه بساعتين'}</span></li>
        <li><span class="dot"></span><span>${
          h?.expiresAt ? `إذن الوصول ${ends(h.expiresAt)}` : 'لا إذن وصول محفوظا'}${
          h?.refreshExpiresAt ? ` · والتجديد ${ends(h.refreshExpiresAt)}` : ''}</span></li>
        ${h?.needsReauthAt ? `<li><span class="dot bad"></span><span>سقط الإذن ${when(h.needsReauthAt, '')} — والنشر متوقّف عليه منذها</span></li>` : ''}
        ${h?.renewNote ? html`<li><span class="dot warn"></span><span>آخر تجديد لم يتمّ: ${h.renewNote} <span class="ago">${raw(when(h.renewNotedAt, ''))}</span></span></li>` : ''}
        ${h?.metricsNote ? html`<li><span class="dot warn"></span><span>آخر قياس لم يتمّ: ${metricsNoteText(h.metricsNote)} <span class="ago">${raw(when(h.metricsNotedAt, ''))}</span></span></li>` : ''}
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
        : `<a class="btn ${rung.state === 'failed' ? 'btn-primary' : 'btn-secondary'} btn-sm" href="${escapeHtml(rung.action.href)}">${escapeHtml(rung.action.label)}</a>`
      return `<li class="${mark.cls}${rung === r.next ? ' at' : ''}">
        <span class="step-n" aria-hidden="true">${i + 1}</span>
        <span class="body">
          <span class="what">${escapeHtml(rung.title)}</span>
          <span class="why">${escapeHtml(rung.note)}</span>
        </span>
        ${act}
        ${statusBadge(mark.cls, mark.g, mark.label)}
      </li>`
    })
    .join('')
  const done = r.rungs.filter((x) => x.state === 'done').length
  const all = done === r.rungs.length
  return `<details class="card ladder"${all ? '' : ' open'}>
    <summary class="card-head">
      <h2>أتنشر الآن؟</h2><div class="grow"></div>
      ${statusBadge(
        r.verdict.kind,
        r.verdict.kind === 'ok' ? '●' : r.verdict.kind === 'bad' ? '▲' : r.verdict.kind === 'warn' ? '◍' : '○',
        r.verdict.kind === 'ok' ? 'تعمل' : r.verdict.kind === 'bad' ? 'لا تنشر' : r.verdict.kind === 'warn' ? 'تنتظرك' : 'تنتظر',
      )}
      <span class="st idle">${done} من ${r.rungs.length}</span>
    </summary>
    <p class="verdict ${r.verdict.kind}">${escapeHtml(r.verdict.text)}</p>
    <p class="hint">كلّ درجة تُحسَب من صفّ في القاعدة لا من كلمة: الإذن من موعد انتهائه، والتجديد من آخر مرّة وقع، والنشر من آخر محاولة.</p>
    <ol class="steps wiz">${rows}</ol>
  </details>`
}


// ── ١ · رأسُ الحساب ───────────────────────────────────────────────────

/** صنفُ الرأس لكلّ منصّة — **بأسمائه كاملةً** فيراها حارسُ الأصناف. */
const ACCT_CLASS: Readonly<Record<string, string>> = {
  linkedin: 'acct-linkedin', x: 'acct-x', youtube: 'acct-youtube', tiktok: 'acct-tiktok', instagram: 'acct-instagram',
}

/** الحكمُ الواحد في الرأس — **من السلّم لا من حال الربط**: «مربوطة» فوق «لا تنشر» تناقض. */
function verdictChip(r: Readiness): string {
  const k = r.verdict.kind
  return statusBadge(
    k,
    k === 'ok' ? '●' : k === 'bad' ? '▲' : k === 'warn' ? '◍' : '○',
    k === 'ok' ? 'تنشر' : k === 'bad' ? 'لا تنشر' : k === 'warn' ? 'تنتظرك' : 'تنتظر',
  )
}

/**
 * الفعلُ التالي الواحد — **زرٌّ أساسيٌّ واحد في الرأس، وما سواه هادئ**.
 *
 * بالترتيب: ما يمنع النشرَ أوّلًا (ربطٌ أو إذنٌ أو تطبيق)، ثمّ ما ينتظر قرارَ
 * المالك، ثمّ المعتمَدُ بلا موعد، ثمّ الكتابة.
 */
function nextAction(d: PlatformScreenData, r: Readiness): { label: string; href: string } | null {
  const id = d.view.spec.id
  const label = d.view.spec.label
  // ‏وما يمنع النشرَ من جهة الربط فعلُه فعلُ بطاقة «الحسابات» نفسُه (D-205): حكمٌ واحدٌ وزرٌّ واحد
  const h = channelHealth(d.view, d.now)
  if (h.button !== null && h.kind !== 'connected') {
    return { label: h.kind === 'connectable' ? `اربط ${label}` : h.button.label, href: h.button.href }
  }
  if (r.next?.action !== undefined && r.next.state === 'failed') return r.next.action
  if (d.counts.waiting > 0) {
    return { label: d.counts.waiting === 1 ? 'راجع المسوّدة' : `راجع ${d.counts.waiting} مسوّدات`, href: href(id, { tab: 'waiting' }) }
  }
  if (d.counts.ready > 0) return { label: 'جدوِل المعتمَد', href: href(id, { tab: 'waiting' }) }
  // ‏ونموذجُ الكتابة «#write» في لوح المنشورات، لا لوحُ المصادر الذي لا كتابةَ فيه (ر-2)
  if (d.needs?.drafts === true) return { label: 'اكتب منشورًا من مصدر', href: WRITE }
  return null
}

function accountHeader(d: PlatformScreenData, r: Readiness): string {
  const { spec, accounts } = d.view
  const health = channelHealth(d.view, d.now)
  const logo = LOGOS[spec.id] ?? ''
  const first = accounts[0]
  const name = first?.displayName ?? spec.label
  const kind = first === undefined
    ? 'لا حساب مربوط'
    : spec.id === 'youtube' ? 'قناة' : first.kind === 'org' ? 'صفحة أو شركة' : 'حساب شخصيّ'
  const linked = first === undefined
    ? ''
    : ` · رُبط ${escapeHtml(dayLabel(first.createdAt, d.zone))}`
  const more = accounts.length > 1 ? ` · و${accounts.length - 1} ${accounts.length === 2 ? 'حساب آخر' : 'حسابات أخرى'}` : ''
  const c = d.counts
  const last = d.tally.lastPublishedAt
  const next = nextAction(d, r)
  const initial = Array.from(name.trim())[0] ?? '؟'
  /*
   * ‏**ومنصّةٌ بلا حسابٍ لا تُرسَم حسابًا** (ر-1): كان الرأسُ يقول الاسمَ ثلاثًا — حرفُ
   * ‏«I» في دائرةِ صورة، ثمّ «Instagram» فوق العنوان، ثمّ العنوان — وتحته «0 نُشر · 0 في
   * ‏الطابور · 0 فشل». فالصورةُ لحسابٍ قائم، والاسمُ مرّةً، والعدّاداتُ أصفارًا لا تُكتب.
   */
  const counts = c.published + c.queued + c.failed === 0
    ? first === undefined ? '' : '<ul class="acct-counts"><li>لم يُنشر شيء بعد</li></ul>'
    : `<ul class="acct-counts">
          <li><b>${c.published}</b> نُشر</li>
          <li><b>${c.queued}</b> مجدول</li>
          <li class="${c.failed > 0 ? 'bad' : ''}"><b>${c.failed}</b> فشل</li>
          <li>${last === null ? 'لم يُنشر شيء بعد' : `آخر نشر ${escapeHtml(relativeTime(last, d.now))}`}</li>
        </ul>`
  return `<header class="card acct ${ACCT_CLASS[spec.id] ?? ''}">
    <div class="acct-cover" aria-hidden="true"><span class="echo acct-echo">${COVER_ECHO}</span><span class="acct-mark">${logo}</span></div>
    <div class="acct-body">
      ${first === undefined ? '' : `<span class="acct-av" data-kind="${first.kind === 'org' || spec.id === 'youtube' ? 'org' : 'member'}"
        aria-hidden="true">${escapeHtml(initial)}</span>`}
      <div class="acct-id">
        ${first === undefined ? '' : `<div class="eyebrow"><span class="ln"></span>${escapeHtml(spec.label)}</div>`}
        <h1>${escapeHtml(name)}</h1>
        <p class="acct-sub">${escapeHtml(kind)}${linked}${more}</p>
        ${counts}
      </div>
      <div class="acct-act">
        <span class="acct-verdict">${health.kind !== 'connected'
          // ‏والشارةُ حكمُ بطاقة «الحسابات» نفسُه ما دام الربطُ هو المانع (D-166 · D-205)، وإلّا فحالُ النشر
          ? statusBadge(health.tone, health.tone === 'bad' ? '▲' : health.tone === 'warn' ? '!' : '○', health.label,
            `data-fact="${escapeHtml(spec.id)}:${health.kind}"`)
          : verdictChip(r)}
          <a class="tap" href="${escapeHtml(href(spec.id, { tab: 'setup' }))}">التفاصيل</a></span>
        ${next === null ? '' : `<a class="btn btn-primary" href="${escapeHtml(next.href)}">${escapeHtml(next.label)}</a>`}
      </div>
    </div>
  </header>`
}

// ── ٢ · ما تطلبه المنصّة ──────────────────────────────────────────────

interface Station {
  readonly title: string
  readonly state: 'ok' | 'warn' | 'bad' | 'idle'
  readonly rule: string
  readonly now: string
  readonly href: string
}

const STATION_G: Readonly<Record<Station['state'], string>> = { ok: '●', warn: '◍', bad: '▲', idle: '○' }

/**
 * سبعُ محطّات — **القاعدةُ سطرًا، وحالُ هذه المنصّة سطرًا تحته**.
 *
 * والقاعدةُ من `platformNeeds` (ثوابتُ المستودع)، والحالُ من أعداد المنصّة
 * ومن السلّم. وكلُّ محطّةٍ رابطٌ إلى موضعها، والساقطةُ تُرى بحدٍّ لا بلونٍ وحدَه.
 */
function stations(d: PlatformScreenData, r: Readiness, needs: PlatformNeeds): Station[] {
  const id = d.view.spec.id
  const c = d.counts
  const setup = href(id, { tab: 'setup' })
  const waitingHref = href(id, { tab: 'waiting' })
  const blocking = r.rungs.find((x) => x.state === 'failed' && x.key !== 'publish')
  const token = r.rungs.find((x) => x.key === 'token')
  const clip = needs.media.kind === 'clip'
  const publishRung = r.rungs.find((x) => x.key === 'publish')
  const list: Station[] = [
    {
      title: 'الحساب والإذن',
      state: blocking !== undefined ? 'bad' : r.verdict.kind === 'ok' || token?.state === 'done' ? 'ok' : 'warn',
      rule: needs.account,
      now: blocking?.note ?? token?.note ?? r.verdict.text,
      href: setup,
    },
    {
      title: 'النصّ',
      state: needs.drafts ? 'ok' : 'idle',
      rule: needs.text,
      now: needs.drafts ? 'يُكتب من مصدر محلَّل' : 'لا تُكتب لها مسوّدة بعد',
      href: needs.drafts ? WRITE : setup,
    },
    {
      title: 'القرار',
      state: c.waiting > 0 ? 'warn' : 'ok',
      rule: 'لا يُنشر شيء بلا اعتمادك',
      now: c.waiting > 0 ? `${c.waiting} تنتظر قرارك` : 'لا مسوّدة تنتظرك',
      href: waitingHref,
    },
    {
      title: clip ? 'المقطع' : 'الصورة',
      state: c.missingMedia > 0 ? (needs.media.required ? 'bad' : 'idle') : 'ok',
      rule: needs.media.spec,
      now: c.missingMedia > 0
        ? `${c.missingMedia} ${clip ? 'بلا مقطع' : 'بلا صورة'}`
        : 'لكلّ منشور قادم ما يلزمه',
      href: waitingHref,
    },
    {
      title: 'الموعد',
      state: c.ready > 0 ? 'warn' : c.queued > 0 ? 'ok' : 'idle',
      // ‏ويخرج في دقيقته (D-320): الدورةُ ترسل ما يحلّ قبل التي بعدها برسالةٍ مؤجَّلةٍ إلى موعده
      rule: 'بتوقيتك، ويخرج في دقيقته',
      now: c.ready > 0 ? `${c.ready} معتمَدة بلا موعد` : c.queued > 0 ? `${c.queued} مجدولة` : 'لا موعد قادم',
      href: c.ready > 0 ? waitingHref : '#upcoming',
    },
    {
      title: 'النشر',
      state: publishRung?.state === 'failed' ? 'bad' : c.published > 0 ? 'ok' : 'idle',
      rule: `${needs.publish} · ${needs.cost}`,
      now: publishRung?.state === 'failed'
        ? 'آخر محاولة فشلت'
        : d.tally.lastPublishedAt !== null
          ? `${c.published} نُشر · آخرُه ${relativeTime(d.tally.lastPublishedAt, d.now)}`
          : c.queued > 0 ? `${c.queued} ينتظر موعدَه` : 'لا منشور بعد',
      href: '#history',
    },
    {
      title: 'الأثر',
      state: needs.measured ? 'ok' : 'idle',
      rule: needs.measure,
      now: needs.measured ? 'يُقرأ تحت كلّ منشور نُشر' : 'تُقرأ النتيجة على المنصّة نفسِها',
      href: '#history',
    },
  ]
  /*
   * ‏**ولا خضرةَ على منصّةٍ لا تنشر أصلًا** (ر-1): بلا حسابٍ كانت «القرار: لا مسوّدةَ
   * ‏تنتظرك» و«الصورة: لكلّ منشورٍ قادمٍ ما يلزمه» خضراوين، فيُقرأ «2 من 7 جاهزة» عن
   * ‏منصّةٍ لن يخرج إليها شيء. فما بعد الأولى ينتظر الربط، وما فيه عددٌ يبقى عددُه.
   */
  if (d.view.accounts.length > 0) return list
  return list.map((s, i): Station => i === 0 ? s : { ...s, state: 'idle', now: s.state === 'ok' ? 'بعد الربط' : s.now })
}

function needsStrip(d: PlatformScreenData, r: Readiness, needs: PlatformNeeds): string {
  const list = stations(d, r, needs)
  const ready = list.filter((s) => s.state === 'ok').length
  const tally = d.view.accounts.length === 0 ? 'اربطها أوّلًا' : `${ready} من ${list.length} جاهزة`
  return `<section class="needs" aria-labelledby="needs-h">
    <h2 class="needs-h" id="needs-h">ما تطلبه ${escapeHtml(needs.label)} <span class="ago">${tally}</span></h2>
    <ol class="needs-list">${list
      .map((s, i) => `<li class="${s.state}"><a class="card card-interactive" href="${escapeHtml(s.href)}">
        <span class="needs-top"><span class="step-n" aria-hidden="true">${i + 1}</span>
          <b>${escapeHtml(s.title)}</b><span class="needs-g">${glyph(STATION_G[s.state])}</span></span>
        <span class="needs-rule">${escapeHtml(s.rule)}</span>
        <span class="needs-now">${escapeHtml(s.now)}</span></a></li>`)
      .join('')}</ol>
  </section>`
}

// ── ٣ · التبويبات ─────────────────────────────────────────────────────

function tabsNav(d: PlatformScreenData, r: Readiness): string {
  const id = d.view.spec.id
  const clip = d.needs?.media.kind === 'clip'
  const label: Readonly<Record<Tab, string>> = {
    posts: 'المنشورات',
    waiting: 'ينتظرك',
    media: id === 'youtube' ? 'Shorts' : clip || id === 'instagram' ? 'الشبكة' : 'الوسائط',
    setup: 'الإعداد',
  }
  const n: Readonly<Record<Tab, number | '!' | undefined>> = {
    posts: d.counts.queued + d.counts.published + d.counts.failed,
    waiting: d.counts.waiting + d.counts.ready,
    media: undefined,
    setup: r.verdict.kind === 'bad' ? '!' : undefined,
  }
  // ‏تبويباتٌ من العُدّة (D-189): روابطُ بـ«aria-current»، والفشلُ يُنبَّه عليه في «الإعداد» بنغمته
  return tabs('أقسام صفحة المنصّة', TABS.map((t) => ({
    label: label[t],
    href: t === 'posts' ? href(id) : href(id, { tab: t }),
    current: t === d.tab,
    ...(n[t] === undefined ? {} : { count: n[t] }),
    bad: t === 'setup' && r.verdict.kind === 'bad',
  })))
}

// ── ٤ · القادم ────────────────────────────────────────────────────────

function upcomingSection(d: PlatformScreenData): string {
  const rows = d.upcoming.map((row) => {
    const at = row.scheduledAt ?? row.createdAt
    const q = classifyQueued(row, d.now)
    const state = q.kind === 'upcoming'
      ? statusBadge('ok', '◍', 'مجدول')
      : q.kind === 'late'
        ? statusBadge('warn', '!', `تأخّر ${q.minutes} د`)
        : q.kind === 'sending'
          ? statusBadge('warn', '◍', 'في الطريق')
          : statusBadge('bad', '▲', 'عالق')
    const under = `
      ${row.accountName === null ? '' : `<span class="np-acc">${escapeHtml(row.accountName)}</span>`}
      ${q.kind === 'late' ? '<p class="hint">حلّ موعدُه ولم تُرسله الدورة بعد — تدور كلّ ربع ساعة.</p>' : ''}
      ${q.kind === 'stuck'
        ? `<p class="hint">أُرسل للنشر قبل ${duration(q.minutes * 60)} ولم يعُد جواب المنصّة.</p>${requeueForm(row.id, true, d.view.spec.id)}`
        : row.dispatchedAt === null
          ? `<form class="inline" method="POST" action="/panel/drafts/unschedule" data-busy="جار…">
               <input type="hidden" name="id" value="${escapeHtml(row.id)}">
               <input type="hidden" name="return" value="${escapeHtml(returnTo(d.view.spec.id, 'waiting'))}">
               <button class="btn btn-secondary btn-sm" type="submit">ألغ الجدولة</button></form>`
          : ''}
      ${journeyLink(row.id)}`
    return npRow(
      row.id,
      whenCol(at, d.zone, { day: true, rel: q.kind === 'upcoming' ? untilTime(at, d.now) : undefined, state }),
      frame(d, row, `${dayLabel(at, d.zone, false).split(' ')[0] ?? ''} ${clock(at, d.zone)}`),
      under,
    )
  })
  return `<h3 class="sec" id="upcoming">القادم · ${d.upcoming.length}</h3>
    ${rows.length === 0
      ? emptyState({ title: `لا شيء مجدول على ${d.view.spec.label}`, html: 'ما تعتمده وتجدوله يظهر هنا بموعده، الأقرب أوّلًا.' })
      : `<div class="np-list">${rows.join('')}</div>`}`
}

// ── ٤½ · نبضُ القناة (D-263) ─────────────────────────────────────────

/**
 * أربعُ بلاطاتٍ فوق «ما نُشر»: ما خرج في ثلاثين يومًا، ووسيطُ تفاعله واتّجاهُه، وأرجحُ موعد، وأنجحُ شكل.
 * وما لم يُقَس يقول ما بقي له، لا صفرًا يوهم.
 */
function pulseStrip(d: PlatformScreenData): string {
  const p = d.pulse
  if (p === undefined || d.needs?.measured !== true) return ''
  const tile = (k: string, v: string, note: string): string =>
    `<div class="card tile"><div class="kv-k">${escapeHtml(k)}</div><div class="kv-v">${v}</div><div class="note">${note}</div></div>`
  const trend = p.trend === null ? 'لا مقارنةَ قبل ثلاثةٍ مقيسة في كلّ شهر'
    : p.trend === 0 ? 'كالشهر الذي قبله' : p.trend > 0 ? `<b>أعلى بـ${p.trend}٪</b> من الشهر الذي قبله` : `أقلّ بـ${-p.trend}٪ من الشهر الذي قبله`
  const later = escapeHtml(p.why ?? 'لم يُقَس بعد')
  return `<div class="grid tiles c4 mb-4" aria-label="نبض ${escapeHtml(d.view.spec.label)}">
    ${tile('خرج في 30 يومًا', String(p.last30), 'منشورًا قِيس بعد يومه الأوّل')}
    ${tile('وسيطُ التفاعل', p.median30 === null ? '—' : String(Math.round(p.median30)), trend)}
    ${tile('أرجحُ موعد', p.slot === null ? '—' : escapeHtml(p.slot), p.slot === null ? later : 'من كلّ ما قِيس هنا')}
    ${tile('أنجحُ شكل', p.format === null ? '—' : escapeHtml(p.format), p.format === null ? later : 'بتفاعل يومه الأوّل')}
  </div>`
}

// ── ٥ · ما نُشر وما فشل ───────────────────────────────────────────────

/** تفاعلُ المنشور في نافذة ‏24 ساعة — المقياسُ الذي يُقارَن به في «ما ينجح» (D-253). */
function engagement24(rows: readonly PostMetricRow[]): number | null {
  const m = rows.find((r) => r.window === '24h')
  return m === undefined ? null : (m.reactions ?? 0) + (m.comments ?? 0) + (m.shares ?? 0)
}

/**
 * **المنشورُ بجانب معتاد قناته** (GROWTH-PLAN م-٤): «أعلى من المعتاد بـ40٪» تقول ما لا يقوله الرقمُ وحده.
 * والمعتادُ وسيطُ ما قِيس في الصفحة نفسِها؛ ولا مقارنةَ قبل ثلاثةٍ مقيسة، ولا يُقال فرقٌ دون ‏20٪.
 */
function versusUsual(d: PlatformScreenData, row: TimelineRow): string {
  const mine = engagement24(d.metrics[row.id] ?? [])
  const all = Object.values(d.metrics).map(engagement24).filter((x): x is number => x !== null).sort((a, b) => a - b)
  if (mine === null || all.length < 3) return ''
  const mid = Math.floor(all.length / 2)
  const usual = all.length % 2 === 1 ? all[mid]! : (all[mid - 1]! + all[mid]!) / 2
  if (usual <= 0) return ''
  const r = mine / usual
  if (r >= 1.2) return ` · <b>أعلى من المعتاد بـ${Math.round((r - 1) * 100)}٪</b>`
  if (r <= 0.8) return ` · أقلّ من المعتاد بـ${Math.round((1 - r) * 100)}٪`
  return ' · كالمعتاد'
}

/**
 * **نموُّ المنشور عبر نوافذه** (D-263): «يومٌ 12 ← ثلاثةُ أيّام 18 ← أسبوع 21» يقول هل ما زال يُرى أم انطفأ.
 * يُكتب حين تُقاس نافذتان فأكثر، بتفاعل كلٍّ منها.
 */
function growth(rows: readonly PostMetricRow[]): string {
  const order = ['24h', '72h', '7d']
  const steps = order.map((w) => rows.find((r) => r.window === w)).filter((r): r is PostMetricRow => r !== undefined)
  if (steps.length < 2) return ''
  return ` · ${steps.map((r) => `${escapeHtml(windowLabel(r.window))} ${(r.reactions ?? 0) + (r.comments ?? 0) + (r.shares ?? 0)}`).join(' ← ')}`
}

function resultLine(d: PlatformScreenData, row: TimelineRow): string {
  if (d.needs?.measured !== true) return '<span class="ago">لا يُقاس لهذه المنصّة بعد</span>'
  const m = widest(d.metrics[row.id] ?? [])
  if (m === null) return '<span class="ago">لم يُقَس بعد — أوّل قياس بعد 24 ساعةً من النشر</span>'
  const v = (n: number | null): string => n === null ? '<span tabindex="0" data-tip="لا تعطيه المنصّة لهذا الحساب">—<span class="vh">لا تعطيه المنصّة لهذا الحساب</span></span>' : `<b>${n}</b>`
  return `<span class="np-result">نافذة ${escapeHtml(windowLabel(m.window))}:
    تفاعل ${v(m.reactions)} · تعليق ${v(m.comments)} · مشاركة ${v(m.shares)} · ظهور ${v(m.impressions)}${versusUsual(d, row)}${growth(d.metrics[row.id] ?? [])}</span>`
}

function historyRow(d: PlatformScreenData, row: TimelineRow): string {
  const published = row.status === 'published'
  const at = published ? row.publishedAt ?? row.sortAt : row.failedAt ?? row.sortAt
  const platform = d.view.spec.id as Platform
  const cost = costOf(d, row)
  let under: string
  if (published) {
    const link = permalink(platform, row.platformPostId)
    under = `${resultLine(d, row)}
      ${link === null
        ? '<span class="ago">نُشر، ولا يُبنى رابطُه من معرّفه لهذه المنصّة.</span>'
        : `<a class="btn btn-secondary btn-sm" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"
             aria-label="${escapeHtml(`افتحه على ${d.view.spec.label} — منشور ${dayLabel(row.publishedAt ?? row.sortAt, d.zone, false)} ${clock(row.publishedAt ?? row.sortAt, d.zone)}`)}"
             >${ICON.external} افتحه على ${escapeHtml(d.view.spec.label)}</a>`}
      <span class="ago">${cost > 0 ? `كلّف ${money(cost)} · ` : ''}${row.tries > 1 ? `بعد ${row.tries} محاولات · ` : ''}</span>${journeyLink(row.id)}`
  } else {
    const why = whyFailed(row.failure, platform)
    under = `<p class="np-why"><span class="np-why-ic">${glyph('▲')}</span>${escapeHtml(why.text)}</p>
      ${why.action === 'relink'
        ? `<a class="btn btn-primary btn-sm" href="/oauth/${escapeHtml(platform)}/start">أعد الربط</a>${requeueForm(row.id, false, platform)}`
        : why.action === 'requeue' || why.action === 'open'
          ? requeueForm(row.id, true, platform)
          : why.action === 'confirm' ? threadCheckForm(row.id, returnTo(platform, 'waiting')) : ''}
      ${journeyLink(row.id)}`
  }
  return npRow(
    row.id,
    whenCol(at, d.zone, { state: published ? statusBadge('ok', '●', 'نُشر') : statusBadge('bad', '▲', 'فشل') }),
    frame(d, row, shortAgo(at, d.now)),
    under,
    published ? '' : 'failed',
  )
}

function historySection(d: PlatformScreenData): string {
  const id = d.view.spec.id
  const filters: { f: HistoryFilter; label: string; n: number }[] = [
    { f: 'all', label: 'الكلّ', n: d.counts.published + d.counts.failed },
    { f: 'published', label: 'نُشر', n: d.counts.published },
    { f: 'failed', label: 'فشل', n: d.counts.failed },
  ]
  const nav = tabs('فرز ما نُشر', filters
    .filter((x) => x.f === 'all' || x.n > 0)
    .map((x) => ({
      label: x.label,
      href: x.f === 'all' ? href(id, {}, '#history') : href(id, { filter: x.f }, '#history'),
      current: x.f === d.filter,
      count: x.n,
      bad: x.f === 'failed',
    })), { sub: true })

  let day = ''
  const parts: string[] = []
  for (const row of d.history.rows) {
    const at = row.status === 'published' ? row.publishedAt ?? row.sortAt : row.failedAt ?? row.sortAt
    const key = dayKey(at, d.zone)
    if (key !== day) {
      day = key
      parts.push(npDay(dayLabel(at, d.zone)))
    }
    parts.push(historyRow(d, row))
  }
  const older = d.history.next === null
    ? ''
    : `<a class="btn btn-secondary" href="${escapeHtml(href(id, d.filter === 'all' ? { before: d.history.next } : { filter: d.filter, before: d.history.next }, '#history'))}">أقدم</a>`
  return `<h3 class="sec" id="history">حتّى الآن · ما نُشر</h3>
    ${d.needs?.measured === true
      ? `<p class="hint">متى تنشر على ${escapeHtml(d.view.spec.label)} وبأيّ شكل؟ <a class="tap" href="/panel/insights?p=${escapeHtml(encodeURIComponent(id))}">ما ينجح على ${escapeHtml(d.view.spec.label)}</a></p>`
      : ''}
    ${nav}
    ${parts.length === 0
      ? emptyState({
          title: d.filter === 'failed' ? 'لا فشل مسجَّل' : `لم يُنشر شيء على ${d.view.spec.label} بعد`,
          html: 'ما يُنشر يظهر هنا تحت يومه، بنتيجته ورابطه وكلفته.',
        })
      : `<div class="np-list">${parts.join('')}</div>${older}`}`
}

// ── تبويب «ينتظرك» ────────────────────────────────────────────────────

function waitingSection(d: PlatformScreenData): string {
  const drafts = d.waiting.filter((r) => r.status === 'draft')
  const ready = d.waiting.filter((r) => r.status !== 'draft')
  const row = (r: TimelineRow): string => npRow(
    r.id,
    whenCol(r.createdAt, d.zone, {
      day: true,
      rel: `كُتبت ${relativeTime(r.createdAt, d.now)}`,
      state: r.status === 'draft' ? statusBadge('warn', '◍', 'تنتظر قرارك') : statusBadge('idle', '○', 'معتمَدة بلا موعد'),
    }),
    frame(d, r, r.status === 'draft' ? 'مسوّدة' : 'معتمَدة'),
    `${r.sourceName === null ? '' : `<span class="ago">من «${fileName(r.sourceName)}»</span>`}
     <a class="btn ${r.status === 'draft' ? 'btn-primary' : 'btn-secondary'} btn-sm" href="/panel#d-${escapeHtml(encodeURIComponent(r.id))}">${
       r.status === 'draft' ? 'راجعها واعتمدها' : 'جدوِلها'}</a>
     ${journeyLink(r.id)}`,
  )
  const empty = emptyState({
    title: `لا شيء ينتظرك على ${d.view.spec.label}`,
    html: 'ما يُكتب من مصدر محلَّل يظهر هنا بهيئته على المنصّة، وتعتمده من بطاقته.',
    action: `<a class="btn btn-secondary btn-sm" href="${WRITE}">اكتب من مصدر</a>`,
  })
  return d.waiting.length === 0
    ? empty
    : `${drafts.length === 0 ? '' : `<h3 class="sec">تنتظر قرارك · ${drafts.length}</h3><div class="np-list">${drafts.map(row).join('')}</div>`}
       ${ready.length === 0 ? '' : `<h3 class="sec">معتمَدة بلا موعد · ${ready.length}</h3><div class="np-list">${ready.map(row).join('')}</div>`}`
}

// ── تبويب «الوسائط» ───────────────────────────────────────────────────

function mediaSection(d: PlatformScreenData): string {
  const all = [...d.upcoming, ...d.history.rows]
  const tiles = all.flatMap((row) => {
    const { media, poster } = mediaOf(d.media[row.id])
    if (media === null) return []
    const badge = row.status === 'queued'
      ? statusBadge('ok', '◍', escapeHtml(clock(row.scheduledAt ?? row.createdAt, d.zone)))
      : row.status === 'failed'
        ? statusBadge('bad', '▲', 'فشل')
        : statusBadge('ok', '●', escapeHtml(shortAgo(row.publishedAt ?? row.sortAt, d.now)))
    return [npTile({ id: row.id, media, poster, badge, dim: row.status === 'queued' })]
  })
  const bare = all.length - tiles.length
  const shape = d.needs?.media.kind === 'clip' ? 'np-grid-clip' : d.view.spec.id === 'instagram' ? 'np-grid-ig' : ''
  return tiles.length === 0
    ? emptyState({ title: 'لا وسائط بعد', html: 'الصور والمقاطع التي تُنشر أو تُجدوَل تظهر هنا شبكةً كما في صفحة حسابك.' })
    : `<p class="hint">لها وسيط: ${counted(tiles.length, NOUNS.post)}${bare > 0 ? ` · و${bare} بلا وسيط لا تظهر هنا` : ''}.
         المجدول خافت، ويفتح كلّ مربّع منشورَه في الخطّ الزمنيّ.</p>
       <div class="np-grid${shape === '' ? '' : ` ${shape}`}">${tiles.join('')}</div>`
}

// ── تبويب «الإعداد» ───────────────────────────────────────────────────

/**
 * «مَن يرى ما تنشره» (D-190) — **مفتاحُ النشر العلنيّ يقلبه المالكُ بعد الإجازة**.
 *
 * YouTube يُقفل ما يُرفع من مشروعٍ لم يُجَز على «خاصّ» مهما طُلب، وTikTok لا يقبل من تطبيقٍ
 * لم يُجَز إلّا `SELF_ONLY`. فكان «خاصّ» ثابتًا في السائقين، والمالكُ يسأل «لماذا لا أنشر
 * على YouTube؟» ولا جوابَ في شاشته. فالجوابُ هنا والمفتاحُ بجانبه: افتراضُه خاصّ، **ولا
 * يُقلَب من شيءٍ غير يده** — لا ردَّ من المنصّة يقول «أُجيز».
 */
function reachCard(platform: 'youtube' | 'tiktok', isPublic: boolean, noScope = false): string {
  const who = platform === 'youtube' ? 'Google' : 'TikTok'
  const where = platform === 'youtube' ? 'من YouTube Studio' : 'من تطبيق TikTok'
  const why = platform === 'youtube'
    ? 'Google تقفل ما يُرفع من تطبيق لم تُجِزه على «خاصّ» مهما طُلب.'
    : 'TikTok لا تقبل من تطبيق لم تُجِزه للنشر المباشر إلّا منشورًا لا يراه غيرُك.'
  const after = platform === 'youtube'
    ? 'فيُنشر كلّ مقطع للعامّة في موعده.'
    : 'فيُنشر للعامّة إن سمح حسابُك بذلك، وإلّا فبأضيق ما يسمح به.'
  // ‏وTikTok «للعامّة إن سمح حسابُك» لا مطلقًا: حسابٌ خاصٌّ لا يُعرض فيه العامّ (D-190)
  const flipped = platform === 'youtube'
    ? 'يُنشر كلّ مقطع على YouTube للعامّة في موعده.'
    : 'يُطلب لكلّ مقطع على TikTok النشر للعامّة في موعده، إن سمح حسابُك بذلك، وإلّا فبأضيق ما يسمح به.'
  const body = isPublic && noScope
    ? `<p class="hint"><b>قلبت النشر العلنيّ، وحساب TikTok المربوط لم يُمنح <bdi dir="ltr">video.publish</bdi></b>
         — فيصل كلّ مقطع صندوق تطبيقك بلا نصّه، لا حسابَك، حتّى تمنحه. اضغط «اربط حسابا آخر» أعلاه
         وادخل بالحساب نفسِه ووافق على النشر المباشر: يُحدَّث الحساب نفسُه ولا يُضاف ثان.</p>`
    : isPublic
    ? `<p class="hint">${flipped}
         <b>وإن لم تكن ${who} قد أجازت تطبيقك</b> فسيصل خاصًّا رغم ذلك — أعده خاصًّا حتّى تُجاز.</p>`
    : `<p class="hint">${why} فيصل كلّ مقطع خاصًّا، وتنشره أنت ${where}.
         <b>وبعد أن تُجيز ${who} تطبيقَك</b> اقلب هذا، ${after}
         <a class="tap" href="${taskHref(platform === 'youtube' ? 'M-28' : 'M-29')}">ما عليك لتُجاز</a></p>`
  const confirm = isPublic
    ? `يعود كلّ مقطع على ${platformLabel(platform)} خاصًّا تنشره أنت ${where}. أتمضي؟`
    : `أأجازت ${who} تطبيقك؟ قبل الإجازة يصل المقطع خاصًّا مهما طُلب. من الآن يُطلب لكلّ مقطع على ${platformLabel(platform)} النشر للعامّة.`
  return `<h3 class="sec" id="reach">مَن يرى ما تنشره</h3>
    ${card({
      title: `النشر العلنيّ — بعد إجازة ${who}`,
      action: isPublic && noScope
        ? statusBadge('warn', '!', 'يصل الصندوق')
        : isPublic ? statusBadge('ok', '●', 'للعامّة') : statusBadge('warn', '!', 'خاصّ'),
      body: `${body}
      <form class="inline" method="POST" action="/panel/settings" data-confirm="${escapeHtml(confirm)}" data-busy="جار الحفظ…">
        <input type="hidden" name="key" value="${platform}_public">
        <input type="hidden" name="value" value="${isPublic ? 'false' : 'true'}">
        <input type="hidden" name="return" value="${escapeHtml(returnTo(platform, 'setup'))}">
        ${button({
          label: isPublic ? 'أعده خاصًّا' : 'انشر للعامّة',
          variant: isPublic ? 'secondary' : 'primary',
          type: 'submit',
        })}
      </form>`,
    })}`
}

/**
 * ‏**«افصل الحساب»** (D-197): زرٌّ خطِرٌ يفتح حوارًا أصليًّا يقول ما سيقع قبل أن يقع.
 *
 * ‏النموذجُ خارج الحوار (حوارُ العُدّة نموذجُ `method="dialog"`، والنماذجُ لا تتداخل)،
 * ‏وزرُّ التأكيد يُرسله بسِمة `form`. والمعرّفُ رقمُ البطاقة لا معرّفُ الحساب: ذاك فيه «:».
 */
function disconnectBlock(platform: Platform, accountId: string, name: string, index: number): string {
  const dlg = `dc-${platform}-${index}`
  const formId = `${dlg}-f`
  const page = REVOKE_PAGE[platform]
  const label = platformLabel(platform)
  return `<form id="${formId}" method="POST" action="/panel/channels/disconnect" data-busy="جار الفصل…">
      <input type="hidden" name="platform" value="${escapeHtml(platform)}">
      <input type="hidden" name="account" value="${escapeHtml(accountId)}">
      <input type="hidden" name="return" value="${escapeHtml(returnTo(platform, 'setup'))}">
    </form>
    <div class="acct-more">${button({
      label: 'افصل الحساب', variant: 'danger', size: 'sm',
      attrs: `data-dialog-open="${dlg}" aria-haspopup="dialog" aria-controls="${dlg}"`,
    })}</div>
    ${dialog({
      id: dlg,
      title: `افصل «${name}» عن صدى؟`,
      body: `<ul>
        <li>تُحذف رموز الوصول والتجديد لهذا الحساب من قاعدة صدى، ولا تُستردّ.</li>
        <li>كلّ منشور مجدول عليه يتوقّف ويصير «فشل» بسبب الفصل، ولا يُنشَر منه شيء.</li>
        <li>يحاول صدى إبطال الإذن عند ${escapeHtml(label)} أيضًا، ويُحذف ما عنده ولو تعذّر ذلك.</li>
        <li>واسحب التطبيق بيدك من <a class="tap" href="${escapeHtml(page.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(page.label)}</a> لتطمئنّ.</li>
      </ul>
      <p class="hint">والربط من جديد ممكن متى شئت بزرّ الربط.</p>`,
      actions: button({ label: 'افصل واحذف الرموز', variant: 'danger-solid', type: 'submit', attrs: `form="${formId}"` }),
    })}`
}

function setupSection(d: PlatformScreenData, r: Readiness): string {
  const { spec, state, accounts } = d.view
  const platform = spec.id as Platform
  const guide = SETUP[spec.id]
  const accountBlocks = accounts
    .map((a, i) => {
      const granted = d.scopes[a.id] ?? ''
      const rows = capabilities(platform, granted)
      const missing = rows.filter((x) => !x.granted).length
      return `<div class="card acct-card">
        <div class="card-head">
          <h2>${escapeHtml(a.displayName)}</h2>
          <span class="chip">${a.kind === 'org' ? (spec.id === 'youtube' ? 'قناة' : 'صفحة أو شركة') : 'حساب شخصيّ'}</span>
          <div class="grow"></div>
          ${a.status === 'needs_reauth'
            ? statusBadge('bad', '▲', 'جدّد الإذن')
            : missing === 0
              ? statusBadge('ok', '●', 'كلّ النطاقات ممنوحة')
              : statusBadge('warn', '!', `ينقص ${counted(missing, NOUNS.scope)}`)}
        </div>
        <details${missing > 0 || granted === '' ? ' open' : ''}><summary>ما يستطيعه هذا الحساب</summary>
        <p class="hint">${
          granted === ''
            ? '<b>لا نطاقات مسجّلة لهذا الحساب.</b> وهذا يقع إن رُبط قبل أن تُسجَّل النطاقات — أعِد الربط ليُقرأ ما مُنح.'
            : missing === 0
              ? 'يستطيع هذا الحساب كلّ ما يحتاجه صدى.'
              : '<b>ما نقص طُلب ولم يُمنَح</b> — والمصدر في العمود الأخير، وكلُّه في بوّابة المنصّة لا هنا.'
        }</p>
        ${capabilityTable(rows)}</details>
        ${healthLog(d.health[a.id], a.createdAt, d.now, d.zone)}
        ${disconnectBlock(platform, a.id, a.displayName, i)}
      </div>`
    })
    .join('')
  const setup = guide === undefined ? '' : setupPane(d.view, d.app, d.baseUrl)
  return `${readinessLadder(r)}
    <h3 class="sec">الحسابات وما تستطيعه</h3>
    ${accounts.length === 0
      ? emptyState({
          echo: true,
          title: 'لا حساب مربوطا',
          html: state === 'awaiting_owner'
            ? 'ينقص سرّا التطبيق — واضبطهما من «ضبط التطبيق» أسفل هذه الصفحة.'
            : 'زرّ الربط في رأس الصفحة يفتح شاشة الإذن عند المنصّة.',
        })
      : accountBlocks}
    ${state === 'linked' && unsignedAccounts(d.view).length === 0
      ? `<div class="acct-more"><a class="btn btn-secondary" href="/oauth/${escapeHtml(spec.id)}/start">اربط حسابا آخر</a></div>`
      : ''}
    ${spec.id === 'linkedin' ? pageConnectCard(d.pageApp === true, d.baseUrl, accounts) : ''}
    ${(spec.id === 'youtube' || spec.id === 'tiktok') && d.reachPublic !== undefined
      ? reachCard(spec.id, d.reachPublic, d.reachNoScope === true)
      : ''}
    ${setup === '' ? '' : `<h3 class="sec" id="setup">ضبط التطبيق ودليلُه</h3>\n${setup}`}`
}

/**
 * ‏**صفحةُ LinkedIn — وجهةٌ ثانيةٌ بتطبيقٍ ثانٍ** (D-423 · M-03). بلا سرّيه حالٌ تُقال بالعربيّة لا زرٌّ يفشل،
 * ‏وبهما «اربط صفحة LinkedIn» ومعه عنوانُ العودة كما يُلصق في بوّابة المطوّر.
 */
export function pageConnectCard(ready: boolean, base: string, accounts: readonly { readonly kind: string; readonly displayName: string; readonly pagePublish?: boolean }[]): string {
  const pages = accounts.filter((a) => a.kind === 'org')
  const callback = base.replace(/\/+$/, '') + PAGE_CALLBACK_PATH
  const body = html`${ready
      ? html`<p class="hint">يُنشَر باسم الصفحة بتطبيق «SADA Pages» (Community Management API). كلُّ صفحةٍ تختارها يُنشَر عليها وحدها: «LinkedIn · صفحة …» بجانب «LinkedIn · حسابي».</p>
        ${pages.length === 0 ? '' : html`<ul class="plain stack">${pages.map((p) => html`<li>LinkedIn · صفحة <bdi>${p.displayName}</bdi> — ${p.pagePublish === true ? 'تنشر' : 'إذنُها بلا w_organization_social، أعد ربطها'}</li>`)}</ul>`}
        <div class="row mt-3">${raw(button({ label: 'اربط صفحة LinkedIn', variant: 'primary', href: '/oauth/linkedin-page/start' }))}</div>`
      : html`<p class="hint"><b>${PAGE_SAY.pending}.</b> وحتّى تصل الموافقة يبقى النشرُ من حسابك الشخصيّ كما هو. وبعدها: سرّا LINKEDIN_ORG_CLIENT_ID وLINKEDIN_ORG_CLIENT_SECRET في أسرار Worker، ثمّ «اربط صفحة LinkedIn» هنا.</p>
        <div class="row mt-3">${raw(button({ label: 'ما عليك (M-03)', href: taskHref('M-03') }))}</div>`}
    <details class="setup mt-2"><summary>عنوانُ العودة للتطبيق الثاني</summary>
      <p class="hint"><span class="mono" dir="ltr">${callback}</span></p></details>`.value
  return card({
    id: 'linkedin-page',
    title: 'صفحة LinkedIn',
    // ‏والانتظارُ يقوله المتنُ، لا شارةٌ صغيرةٌ تكرّره (سلّمُ الخطّ: ما تحت ‏14px ‏≤ ‏10٪)
    ...(ready ? { action: statusBadge('ok', '●', 'التطبيق الثاني مضبوط') } : {}),
    body,
  })
}

// ── الصفحة ────────────────────────────────────────────────────────────

export function platformScreen(d: PlatformScreenData): string {
  const { spec } = d.view
  const logo = LOGOS[spec.id] ?? ''

  // ── ما لم يُبنَ: شاشةٌ تقول السببَ لا «قريبا» ──────────────────────
  if (spec.stage === 'none' || d.needs === null) {
    return `<div class="page-head">
      <div class="txt">
        <div class="eyebrow"><span class="ln"></span>منصّة لم تُبن</div>
        <h1>${escapeHtml(spec.label)}</h1>
        <p class="lede">${escapeHtml(spec.note)}</p>
      </div>
      <div class="aside"><div class="plat-logo lg">${logo}</div></div>
    </div>
    <div class="card">
      <h2>لماذا لا تُضاف من اللوحة</h2>
      <p class="hint">لكلّ منصّةٍ طريقتُها في النشر، فتُبنى في صدى واحدةً واحدة.
        <b>وحقلٌ في اللوحة يوهم بأنّه يكفي لا يكفي</b>، فلا نعرضه.</p>
      <details class="setup mt-2"><summary>للمطوّر</summary>
        <p class="hint">مزوّدو الذكاء يُضافون من اللوحة لأنّهم يتكلّمون لهجةً واحدة
          (<span class="mono">chat/completions</span>)، فسائقٌ واحد يغطّيهم. والمنصّاتُ الاجتماعيّة لا لهجةَ لها مشتركة.</p>
      </details>
      <div class="outcome warn"><span class="kv-k">ما ينقص</span>
        <span class="kv-v">${escapeHtml(spec.note)}</span></div>
    </div>`
  }

  const r = readiness({ view: d.view, app: d.app, health: d.health, tally: d.tally, posts: d.posts, now: d.now, zone: d.zone })
  const head = accountHeader(d, r)
  // ‏وما ينتظر يُقال في زرّ الرأس وعددِ التبويب، لا في شريطٍ ثالثٍ يدفع المنشوراتِ إلى الأسفل
  const zoneNote = d.zone === null && (d.tab === 'posts' || d.tab === 'waiting')
    ? '<p class="hint">الأيّام والساعات بتوقيت الرياض.</p>'
    : ''
  const body = d.tab === 'setup'
    ? setupSection(d, r)
    : d.tab === 'waiting'
      ? waitingSection(d)
      : d.tab === 'media'
        ? mediaSection(d)
        : `${pulseStrip(d)}${upcomingSection(d)}${historySection(d)}`
  // ‏الإشعارُ مكوّنُه (D-189)، والخطأُ يُعلَن تنبيهًا ويبقى حتّى يُغلَق (7.8)
  const flash = toastRegion(d.flash === null
    ? ''
    : notice({ tone: d.flash.kind, html: escapeHtml(d.flash.text), alert: d.flash.kind === 'bad',
        g: d.flash.kind === 'ok' ? '●' : d.flash.kind === 'warn' ? '!' : '▲' }))
  return `${flash}${head}
  ${d.tab === 'setup' ? '' : needsStrip(d, r, d.needs)}
  ${tabsNav(d, r)}
  ${zoneNote}
  ${body}
  ${d.tab === 'posts' || d.tab === 'waiting'
    ? '<p class="np-note">المعاينة ببنية المنصّة وخطّ صدى، لا لقطة منها، والنصّ مختصر هنا للتصفّح.</p>'
    : ''}`
}
