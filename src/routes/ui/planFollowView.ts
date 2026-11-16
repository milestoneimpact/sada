/**
 * **متابعةُ الخطّة** (طلبُ المالك 2026-11-15: «أنشئ الخطّة، فتُعتمد، فتنتقل إلى صفحةٍ أخرى لأتابع منها»).
 *
 * الشاشةُ الرابعة من «ابنِ ← راجع ← اعتمد ← تابع»: لا تحرير هنا. ثلاثُ مجموعاتٍ بترتيب ما يحتاج المالك:
 * ما فشل وسببُه وبابُه، ثمّ ما جُدول بموعده، ثمّ ما نُشر. وما زال ينتظر قرارًا يُعدّ بسطرٍ يعيد إلى المراجعة.
 * وكلُّها روابطُ إلى رحلة المنشور (`/panel/journey/<id>`) حيث الإصلاحُ والسحب.
 */
import type { ReviewModel, ReviewCard } from '../../lib/plan/review'
import { postStatus } from '../../lib/status'
import { stamp } from '../../lib/time/zone'
import { platformLabel } from '../../lib/oauth/providers'
import { counted, NOUNS } from '../../lib/format'
import { pageHead } from './parts'
import { card } from './components/card'
import { statusBadge } from './components/badge'
import { EDITED_MARK } from '../../lib/plan/rights'
import { html, raw, type Html } from './html'

function row(c: ReviewCard, zone: string | null): Html {
  const post = c.post!
  const face = postStatus(post.status)
  const when = post.scheduledAt === null ? stamp(c.item.day + ' ' + c.item.time, zone) : stamp(post.scheduledAt, zone)
  return html`<li class="pf-row"><a class="tap" href="/panel/journey/${post.id}">
    ${raw(statusBadge(face.tone, face.glyph, face.label))}
    <span class="pf-when" dir="ltr">${when.slice(0, 16)}</span>
    <b>${platformLabel(c.item.platform as never)}</b>
    <span class="pf-text">${post.text.replace(/\s+/g, ' ').slice(0, 90)}</span></a>
    ${post.edited === true ? raw(statusBadge('warn', '!', EDITED_MARK)) : ''}
    <a class="tap" href="/panel/plan/post/${post.id}">${post.status === 'published' ? 'انسخه مسوّدةً' : 'عدّل أو أوقف'}</a></li>`
}

function group(title: string, cards: readonly ReviewCard[], zone: string | null, empty: string): string {
  return card({ title, level: 2, body: cards.length === 0
    ? html`<p class="hint m-0">${empty}</p>`.value
    : html`<ul class="plain pf-list">${cards.map((c) => row(c, zone))}</ul>`.value })
}

export function planFollowScreen(m: ReviewModel, zone: string | null): string {
  const by = (s: readonly string[]) => m.cards.filter((c) => c.post !== null && s.includes(c.post.status))
    .sort((a, b) => (a.post!.scheduledAt ?? a.item.day + a.item.time).localeCompare(b.post!.scheduledAt ?? b.item.day + b.item.time))
  const failed = by(['failed'])
  const queued = by(['queued'])
  const published = by(['published'])
  const waiting = m.cards.filter((c) => c.post === null || c.post.status === 'draft' || c.post.status === 'approved').length
  const head = pageHead('الخطّة', 'متابعةُ الخطّة', counted(queued.length, NOUNS.post) + ' في موعدها، و' + counted(published.length, NOUNS.post) + ' نُشرت')
  const back = waiting === 0 ? html``
    : html`<p class="m-0"><a class="tap" href="/panel/plan/review">${counted(waiting, NOUNS.post)} تنتظر قرارك في المراجعة</a></p>`
  return html`${raw(head)}
    <div class="stack pf-stack">
      ${back}
      ${failed.length === 0 ? html`` : raw(group('فشلت — افتح كلًّا لترى سببه وتصلحه', failed, zone, ''))}
      ${raw(group('مجدولة', queued, zone, 'لا شيء مجدول بعد. اعتمد من المراجعة فيُجدوَل في موعده.'))}
      ${raw(group('نُشرت', published, zone, 'لم يُنشر شيءٌ من هذه الخطّة بعد.'))}
    </div>`.value
}

