/**
 * **صفحةُ العميل** (D-353): خطّةٌ واحدة يراها العميلُ بلا حساب — كلُّ منشورٍ بشكل منصّته، وأمامه «موافق» و«أطلب تعديلًا»
 * بملحوظة. لا تنقُّلَ إلى اللوحة، ولا اسمَ حسابٍ ولا إعداد: ما يراه هو ما سيُنشر، وقرارُه.
 */
import { html, raw, type Html } from './html'
import { nativePost } from './nativePost'
import { button } from './components/button'
import { cardClass } from './components/card'
import { ICON } from './icons'
import { dayLabel } from './planReviewView'
import { platformLabel } from '../../lib/oauth/providers'
import { NOTE_MAX, type VerdictRow } from '../../lib/clientReview'
import type { ReviewCard } from '../../lib/plan/review'
import { localToUtc } from '../../lib/time/local'
import { clock, dayKey, zoneName } from '../../lib/time/zone'

/** كعكةُ منطقة العميل (D-428): على `/r` وحده، فلا تلتبس بـ`sada_tz` منطقةِ المالك في اللوحة. */
export const CLIENT_TZ_COOKIE = 'sada_ctz'
export const CLIENT_TZ_SCRIPT = '(function(){try{var tz=Intl.DateTimeFormat().resolvedOptions().timeZone||\'\';' +
  'if(tz!==\'\')document.cookie=\'' + CLIENT_TZ_COOKIE + '=\'+encodeURIComponent(tz)+\'; Path=/r; SameSite=Strict; Max-Age=86400\'+' +
  '(location.protocol===\'https:\'?\'; Secure\':\'\');}catch(e){}})();'

/**
 * وقتُ البند بمنطقة العميل: البندُ مكتوبٌ بيوم المالك وساعته (D-384)، فيُردّ إلى لحظةٍ ثمّ يُقرأ بمنطقة العميل — وإن جُهلت
 * فبمنطقة المالك. واسمُ المنطقة بجانبه دائمًا: العميلُ لا يُحسَب عليه فرقُ الساعات.
 */
export function clientWhen(day: string, time: string, ownerZone: string | null, clientZone: string | null): { day: string; time: string; label: string } {
  const [y, mo, dd] = day.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const at = localToUtc(y ?? 0, mo ?? 0, dd ?? 0, h ?? -1, mi ?? -1, ownerZone)
  const zone = clientZone ?? ownerZone
  if (at === null) return { day, time, label: time + ' بتوقيت ' + zoneName(ownerZone) }
  const t = clock(at, zone)
  return { day: dayKey(at, zone), time: t, label: t + ' بتوقيت ' + zoneName(zone) }
}

export interface ClientCard {
  readonly card: ReviewCard
  /** عنوانُ الصورة موقَّعًا — أو `null` بلا صورة. */
  readonly mediaSrc: string | null
}

export interface ClientReviewData {
  readonly token: string
  readonly orgName: string
  /** حرفا العلامة — علامتُها حين لا شعار (D-428). */
  readonly initials: string
  /** اسمُ الحساب لكلّ منصّة — رأسُ المنشور كما في المراجعة. */
  readonly authors: Readonly<Record<string, string>>
  readonly cards: readonly ClientCard[]
  readonly verdicts: ReadonlyMap<string, VerdictRow>
  readonly zone: string | null
  /** منطقةُ متصفّح العميل إن عُرفت (`sada_ctz`) — وإلّا فمنطقةُ المالك. */
  readonly clientZone: string | null
  readonly expiresAt: string
  readonly saved: boolean
}

const SAID: Readonly<Record<VerdictRow['verdict'], string>> = { approve: 'وافقتَ عليه', changes: 'طلبتَ تعديله' }

function item(c: ClientCard, d: ClientReviewData, n: number): Html {
  const it = c.card.item
  const post = c.card.post
  if (post === null) return html``
  const when = clientWhen(it.day, it.time, d.zone, d.clientZone)
  const local = when.time
  const v = d.verdicts.get(c.card.key)
  const media = c.card.mediaId === null || c.mediaSrc === null ? null
    : { id: c.card.mediaId, mime: c.card.mediaMime ?? 'image/png', composed: true, width: c.card.mediaWidth ?? null, height: c.card.mediaHeight ?? null, src: c.mediaSrc }
  const action = '/r/' + d.token
  return html`<li class="${cardClass()} cr-item" id="i${String(n)}"${v === undefined ? '' : raw(' data-verdict="' + v.verdict + '"')}>
    <div class="cr-head"><b>${platformLabel(it.platform as never)}</b><span class="ago">${dayLabel(when.day)} · ${when.label}</span>
      ${v === undefined ? html`` : html`<span class="cr-said">${SAID[v.verdict]}</span>`}</div>
    ${raw(nativePost({ platform: it.platform as never, id: post.id, author: { name: d.authors[it.platform] ?? d.orgName, kind: null }, text: post.text, when: local, media, poster: null, metrics: null, variant: 'feed' }))}
    <form method="POST" action="${action}" class="cr-form">
      <input type="hidden" name="key" value="${c.card.key}"><input type="hidden" name="at" value="i${String(n)}">
      <label class="cr-note"><span>ملحوظةٌ للفريق (اختياريّة)</span>
        <textarea name="note" rows="2" maxlength="${String(NOTE_MAX)}">${v?.note ?? ''}</textarea></label>
      <div class="cr-acts">
        ${raw(button({ label: 'موافق', variant: 'primary', type: 'submit', icon: ICON.check, attrs: 'name="verdict" value="approve"' }))}
        ${raw(button({ label: 'أطلب تعديلًا', variant: 'secondary', type: 'submit', attrs: 'name="verdict" value="changes"' }))}
      </div>
    </form>
  </li>`
}

export function clientReviewScreen(d: ClientReviewData): string {
  const shown = d.cards.filter((c) => c.card.post !== null)
  const done = shown.filter((c) => d.verdicts.has(c.card.key)).length
  return html`<main class="cr-page">
    <header class="ph-hero cr-hero">
      <span class="cr-brand"><span class="cr-mark" aria-hidden="true">${d.initials}</span><b>${d.orgName}</b></span>
      <h1 class="ph-title">راجع منشوراتك</h1>
      <p class="ph-lede m-0">كلُّ منشورٍ كما سيظهر في منصّته. قل «موافق» أو «أطلب تعديلًا» واكتب ما تريد تغييره — يصل إلى الفريق فورًا.</p>
      <div class="ph-kpis">
        <div class="ph-kpi"><b>${String(done)}<em> / ${String(shown.length)}</em></b><span>قلتَ فيها رأيك</span></div>
        <div class="ph-kpi"><b>${dayLabel(d.expiresAt.slice(0, 10))}</b><span>آخرُ يومٍ يعمل فيه الرابط</span></div>
      </div>
    </header>
    ${d.saved ? html`<p class="cr-saved" role="status">حُفظ رأيك. شكرًا لك.</p>` : html``}
    ${shown.length === 0
      ? html`<div class="${cardClass()}"><h2 class="m-0">لا منشوراتَ مكتوبةً بعد</h2><p class="hint m-0">افتح الرابطَ نفسَه لاحقًا: تظهر هنا حين تُكتب.</p></div>`
      : html`<ol class="cr-list">${shown.map((c, n) => item(c, d, n))}</ol>`}
    <p class="cr-foot">صفحةُ مراجعةٍ خاصّةٌ بك — لا تشاركها.</p>
    <p class="cr-powered">بإدارة صدى</p>
  </main>`.value
}

/** الرابطُ لا يفتح شيئًا — جوابٌ واحد لكلّ سبب: لا يوجد، انتهى، أُلغي، أو خطّةٌ أحدث. */
export function clientReviewGone(): string {
  return html`<main class="cr-page"><div class="${cardClass()}">
    <h1 class="m-0">هذا الرابطُ لم يعد يعمل</h1>
    <p class="hint m-0">انتهت مدّتُه أو أُلغي أو صارت للخطّة نسخةٌ أحدث. اطلب من الفريق رابطًا جديدًا.</p></div></main>`.value
}
