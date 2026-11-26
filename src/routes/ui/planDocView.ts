/**
 * **عرضُ الخطّة** (D-288) — الطلبُ د من «الخطّةُ محورَ المنصّة»: الخطّةُ كما تُقدَّم، لا كما تُدار.
 *
 * المراجعةُ (D-286) شاشةُ عمل: أفعالٌ على كلّ بطاقة، و«ما ينقص»، وجملة. وهذه شاشةُ قراءة: **يرى المالكُ خطّتَه كاملةً
 * ومحتواها بشكل منصّاته**، فيعرضها على فريقه أو عميله أو يقرؤها وحدَه. خمسةُ أقسام:
 *
 *   الغلاف (المنظّمة والمدّة والأرقام) ← المنصّات ← التقويم ← المحتوى أسبوعًا أسبوعًا ← المصادرُ والإصدارات
 *
 * والمنشورُ يُرسم بـ `nativePost` (D-172): بنيةُ المنصّة بجلد صدى، بلا رقمٍ مخترَع. **والطباعةُ تحسينٌ لا غاية**: زرٌّ
 * واحد، وورقةُ أنماطٍ بمقاس التسليم (25 × 20.05 سم) تُخفي ما ليس من الوثيقة.
 */
import { postStatus } from '../../lib/status'
import { html, raw, type Html } from './html'
import { LOGOS } from './logos'
import { nativePost } from './nativePost'
import { echo } from './echo'
import { platformLabel } from '../../lib/oauth/providers'
import { stamp } from '../../lib/time/zone'
import { num } from '../../lib/format'
import { SPAN_LABEL, spanDays } from '../../lib/plan/prompt'
import type { ReviewCard, ReviewModel } from '../../lib/plan/review'
import { calendar, dayLabel, shift } from './planReviewView'

const AR = num

export interface PlanDocData {
  readonly model: ReviewModel
  readonly orgName: string
  /** اسمُ الحساب لكلّ منصّة — رأسُ المنشور في المعاينة. */
  readonly authors: Readonly<Record<string, string>>
  /** أسماءُ المصادر بمعرّفاتها. */
  readonly sources: Readonly<Record<string, string>>
  readonly zone: string | null
}


function figure(n: number, label: string): Html {
  return html`<div class="pd-kpi"><b>${AR(n)}</b><span>${label}</span></div>`
}

function post(c: ReviewCard, d: PlanDocData): Html {
  const local = c.item.time
  const platform = c.item.platform as 'linkedin' | 'x'
  const frame = c.post === null
    ? html`<div class="pd-pending"><b>${platformLabel(platform)}</b><p class="m-0">${c.item.angle}</p><span class="hint">يُكتب الآن</span></div>`
    : raw(nativePost({
      platform, id: c.post.id, author: { name: d.authors[platform] ?? d.orgName, kind: null },
      text: c.post.text, when: dayLabel(c.item.day).split('،')[0] + ' ' + local,
      media: c.mediaId === null ? null : { id: c.mediaId, mime: c.mediaMime ?? 'image/png', composed: true, width: c.mediaWidth ?? null, height: c.mediaHeight ?? null },
      poster: null, metrics: null, variant: 'feed',
    }))
  return html`<article class="pd-post">
    <header class="pd-post-h"><span class="pf-logo rv-pf" data-pf="${platform}" aria-hidden="true">${raw(LOGOS[platform] ?? '')}</span>
      <bdi class="mono">${local}</bdi><span class="grow"></span><span class="chip">${c.post === null ? 'يُكتب' : postStatus(c.post.status).label}</span></header>
    ${frame}
    ${c.item.why === 'من خطّتك المرفوعة' ? html`` : html`<p class="hint m-0">${c.item.angle}</p>`}
  </article>`
}

export function planDocScreen(d: PlanDocData): string {
  const m = d.model
  const span = m.plan.span ?? 'week'
  const end = shift(m.plan.week, spanDays(span) - 1)
  const cards = [...m.cards].sort((a, b) => (a.item.day + a.item.time).localeCompare(b.item.day + b.item.time))
  const platforms = [...new Set(cards.map((c) => c.item.platform))]
  const days = new Set(cards.map((c) => c.item.day)).size
  const withImage = cards.filter((c) => c.mediaId !== null).length
  const approved = cards.filter((c) => c.post !== null && c.post.status !== 'draft').length
  const state = m.lockedAt !== null ? 'مثبَّتة · الإصدار ' + AR(m.version) : 'مسوّدة · الإصدار ' + AR(m.version)

  const hero = html`<header class="pd-hero">
    <span class="pd-echo" aria-hidden="true">${raw(echo({ width: 1200, height: 420, tone: 'deep', crest: 0.68, level: 0.55, scale: 1.3, density: 4, hairline: false, align: 'xMinYMax' }))}</span>
    <span class="pd-eyebrow">خطّةُ النشر · ${SPAN_LABEL[span]}</span>
    <h1 class="pd-title">${d.orgName}</h1>
    <p class="pd-dates m-0">${dayLabel(m.plan.week)} — ${dayLabel(end)}</p>
    <span class="pd-state">${state}</span>
    <div class="pd-kpis">${figure(cards.length, 'منشورًا')}${figure(platforms.length, platforms.length === 1 ? 'منصّة' : 'منصّات')}${figure(days, 'يومَ نشر')}${figure(withImage, 'بصورها')}${figure(approved, 'معتمَدة')}</div>
  </header>`

  const max = Math.max(1, ...platforms.map((p) => cards.filter((c) => c.item.platform === p).length))
  const mix = html`<section class="pd-sec" aria-labelledby="pd-mix"><h2 id="pd-mix">على أيّ منصّة</h2>
    <div class="pd-mix">${platforms.map((p) => {
      const n = cards.filter((c) => c.item.platform === p).length
      return html`<div class="pd-bar"><span class="pf-logo rv-pf" data-pf="${p}" aria-hidden="true">${raw(LOGOS[p] ?? '')}</span>
        <b>${platformLabel(p as never)}</b><progress max="${String(max)}" value="${String(n)}" aria-label="${platformLabel(p as never)}: ${AR(n)} منشورًا"></progress><span>${AR(n)}</span></div>`
    })}</div></section>`

  const cal = html`<section class="pd-sec" aria-labelledby="pd-cal"><h2 id="pd-cal">التقويم</h2>${calendar(m)}</section>`

  // ‏أسبوعًا أسبوعًا من يوم البداية، وفي الأسبوع أيّامُه
  const weeks: { label: string; cards: ReviewCard[] }[] = []
  for (let w = 0; w * 7 < spanDays(span); w += 1) {
    const from = shift(m.plan.week, w * 7)
    const to = shift(m.plan.week, w * 7 + 6)
    const inWeek = cards.filter((c) => c.item.day >= from && c.item.day <= to)
    if (inWeek.length > 0) weeks.push({ label: 'الأسبوع ' + AR(w + 1) + ' · ' + dayLabel(from, 'short') + '–' + dayLabel(to, 'short'), cards: inWeek })
  }
  const content = html`<section class="pd-sec" aria-labelledby="pd-content"><h2 id="pd-content">المحتوى</h2>
    ${weeks.map((w) => html`<section class="pd-week"><h3 class="pd-wh">${w.label}</h3>
      ${[...new Set(w.cards.map((c) => c.item.day))].map((day) => html`<div class="pd-day" id="d-${day}"><h4 class="pd-dh">${dayLabel(day)}</h4>
        <div class="pd-posts">${w.cards.filter((c) => c.item.day === day).map((c) => post(c, d))}</div></div>`)}
    </section>`)}</section>`

  const used = [...new Set(cards.map((c) => c.item.sourceId))].map((id) => d.sources[id]).filter((x): x is string => x !== undefined)
  const tail = html`<section class="pd-sec pd-tail">
    ${used.length === 0 ? html`` : html`<div><h2>من أين جاء المحتوى</h2><ul class="plain">${used.map((n) => html`<li><bdi>${n}</bdi></li>`)}</ul></div>`}
    ${m.versions.length === 0 ? html`` : html`<div><h2>الإصدارات</h2><ul class="plain">${m.versions.map((v) => html`<li>الإصدار ${AR(v.version)} — ثُبّت ${stamp(v.lockedAt, d.zone)} · ${AR(v.items)} بندًا · جُدول ${AR(v.scheduled)}</li>`)}</ul></div>`}
  </section>`

  const bar = html`<nav class="row gap-2 pd-tools" aria-label="أدوات العرض">
    <a class="btn btn-secondary btn-sm" href="/panel/plan">راجع وعدّل</a><span class="grow"></span>
    <button class="btn btn-secondary btn-sm" type="button" id="pd-print">اطبع أو احفظ PDF</button></nav>`

  return html`<div class="pd">${bar}${hero}${mix}${cal}${content}${tail}</div>`.value
}

/** زرُّ الطباعة وحدَه — والوثيقةُ تُقرأ بلا سكربت. */
export const PLAN_DOC_SCRIPT = `(function(){var b=document.getElementById('pd-print'); if(b)b.addEventListener('click',function(){window.print();});})();`
