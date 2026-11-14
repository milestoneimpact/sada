/**
 * **صفحةُ العميل** (D-353): خطّةٌ واحدة يراها العميلُ بلا حساب — كلُّ منشورٍ بشكل منصّته، وأمامه «موافق» و«أطلب تعديلًا»
 * بملحوظة. لا تنقُّلَ إلى اللوحة، ولا اسمَ حسابٍ ولا إعداد: ما يراه هو ما سيُنشر، وقرارُه.
 */
import { html, raw, type Html } from './html'
import { nativePost } from './nativePost'
import { button } from './components/button'
import { cardClass } from './components/card'
import { ICON } from './icons'
import { echo } from './echo'
import { dayLabel } from './planReviewView'
import { platformLabel } from '../../lib/oauth/providers'
import { stamp } from '../../lib/time/zone'
import { NOTE_MAX, type VerdictRow } from '../../lib/clientReview'
import type { ReviewCard } from '../../lib/plan/review'

export interface ClientCard {
  readonly card: ReviewCard
  /** عنوانُ الصورة موقَّعًا — أو `null` بلا صورة. */
  readonly mediaSrc: string | null
}

export interface ClientReviewData {
  readonly token: string
  readonly orgName: string
  /** اسمُ الحساب لكلّ منصّة — رأسُ المنشور كما في المراجعة. */
  readonly authors: Readonly<Record<string, string>>
  readonly cards: readonly ClientCard[]
  readonly verdicts: ReadonlyMap<string, VerdictRow>
  readonly zone: string | null
  readonly expiresAt: string
  readonly saved: boolean
}

const SAID: Readonly<Record<VerdictRow['verdict'], string>> = { approve: 'وافقتَ عليه', changes: 'طلبتَ تعديله' }

function item(c: ClientCard, d: ClientReviewData, n: number): Html {
  const it = c.card.item
  const post = c.card.post
  if (post === null) return html``
  const local = stamp(it.day + ' ' + it.time, d.zone).slice(11, 16)
  const v = d.verdicts.get(c.card.key)
  const media = c.card.mediaId === null || c.mediaSrc === null ? null
    : { id: c.card.mediaId, mime: c.card.mediaMime ?? 'image/png', composed: true, width: c.card.mediaWidth ?? null, height: c.card.mediaHeight ?? null, src: c.mediaSrc }
  const action = '/r/' + d.token
  return html`<li class="${cardClass()} cr-item" id="i${String(n)}"${v === undefined ? '' : raw(' data-verdict="' + v.verdict + '"')}>
    <div class="cr-head"><b>${platformLabel(it.platform as never)}</b><span class="ago">${dayLabel(it.day)} · ${local}</span>
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
    <header class="ph-hero">
      <span class="ph-echo" aria-hidden="true">${raw(echo({ width: 1200, height: 360, tone: 'light', crest: 0.2, level: 0.5, scale: 1.1, density: 3, hairline: false, align: 'xMinYMid' }))}</span>
      <span class="ph-eyebrow">${d.orgName}</span>
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
    <p class="cr-foot">صفحةُ مراجعةٍ خاصّةٌ بك من صدى — لا تشاركها.</p>
  </main>`.value
}

/** الرابطُ لا يفتح شيئًا — جوابٌ واحد لكلّ سبب: لا يوجد، انتهى، أُلغي، أو خطّةٌ أحدث. */
export function clientReviewGone(): string {
  return html`<main class="cr-page"><div class="${cardClass()}">
    <h1 class="m-0">هذا الرابطُ لم يعد يعمل</h1>
    <p class="hint m-0">انتهت مدّتُه أو أُلغي أو صارت للخطّة نسخةٌ أحدث. اطلب من الفريق رابطًا جديدًا.</p></div></main>`.value
}
