/**
 * شاشةُ **مراجعة الخطّة** (D-286) — البندُ ومسوّدتُه في بطاقة، و«ما ينقص» فوقها، و«ثبّت الخطّة» تحتها.
 *
 * تقويمٌ مصغَّرٌ في الرأس (كلُّ يومٍ بعدد بنوده، رابطٌ إلى يومه)، ثمّ البطاقاتُ مجموعةً بأيّامها. ولكلّ بطاقةٍ أفعالُها الأربعة،
 * ومربّعُ تحديدٍ مربوطٌ بنموذج الجملة (`form="rv-bulk"`) فلا تتداخل النماذج. **وبلا سكربتٍ يعمل كلُّ شيء**: الأفعالُ نماذج،
 * والسكربتُ يُظهر شريطَ الجملة حين يُحدَّد شيءٌ ويعدّه.
 */
import { html, raw, type Html } from './html'
import { pageHead } from './parts'
import { LOGOS } from './logos'
import { platformLabel } from '../../lib/oauth/providers'
import { stamp } from '../../lib/time/zone'
import { SPAN_LABEL, spanDays } from '../../lib/plan/prompt'
import { GAP_LABEL, type Gap, type ReviewCard, type ReviewModel } from '../../lib/plan/review'

const AR = (n: number): string => n.toLocaleString('ar-EG')

function dayLabel(day: string, style: 'long' | 'short' = 'long'): string {
  const at = new Date(day + 'T12:00:00Z')
  return Number.isNaN(at.getTime())
    ? day
    : at.toLocaleDateString('ar-EG', style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' } : { day: 'numeric', timeZone: 'UTC' })
}

function shift(day: string, n: number): string {
  const at = new Date(day + 'T00:00:00Z')
  at.setUTCDate(at.getUTCDate() + n)
  return at.toISOString().slice(0, 10)
}

const STATUS: Readonly<Record<string, { tone: string; text: string }>> = {
  draft: { tone: 'warn', text: 'تنتظر اعتمادك' },
  approved: { tone: 'ok', text: 'معتمَدة' },
  edited: { tone: 'ok', text: 'معتمَدة بعد تعديل' },
  queued: { tone: 'ok', text: 'مجدولة' },
  published: { tone: 'ok', text: 'نُشرت' },
  failed: { tone: 'bad', text: 'تعثّر نشرُها' },
}

function card(c: ReviewCard, planId: string, zone: string | null): Html {
  const local = stamp(c.item.day + ' ' + c.item.time, zone).slice(11, 16)
  const st = c.post === null ? { tone: 'idle', text: 'تُكتب' } : STATUS[c.post.status] ?? { tone: 'idle', text: c.post.status }
  const hidden = html`<input type="hidden" name="id" value="${planId}"><input type="hidden" name="index" value="${String(c.index)}"><input type="hidden" name="key" value="${c.key}">`
  return html`<article class="card rv" id="c-${String(c.index)}" data-gaps="${c.gaps.join(' ')}">
    <header class="rv-h">
      <label class="rv-sel"><input type="checkbox" name="sel" form="rv-bulk" value="${String(c.index)}|${c.key}|${c.post?.id ?? ''}" aria-label="حدّد بند ${platformLabel(c.item.platform as never)} ${local}"></label>
      <span class="pf-logo rv-pf" data-pf="${c.item.platform}" aria-hidden="true">${raw(LOGOS[c.item.platform] ?? '')}</span>
      <b>${platformLabel(c.item.platform as never)}</b><bdi class="mono">${local}</bdi>
      <span class="grow"></span>
      <span class="st ${st.tone}">${st.text}</span>
    </header>
    <div class="rv-b">
      ${c.mediaId === null ? html`` : html`<img class="rv-thumb" src="/panel/media/${c.mediaId}" alt="" loading="lazy" width="96" height="96">`}
      <div class="rv-t">${c.post === null
        ? html`<p class="hint m-0">${c.item.angle}</p>`
        : html`<p class="m-0 rv-text" dir="auto">${c.post.text}</p><p class="hint m-0 mt-1">${c.item.angle}</p>`}</div>
    </div>
    ${/* ‏و«تنتظر اعتمادك» في شارة الحال وحدَها على البطاقة — لا مرّتين */''}
    ${c.gaps.filter((g) => g !== 'pending').length === 0 ? html`` : html`<div class="row gap-2">${c.gaps.filter((g) => g !== 'pending').map((g) => html`<span class="chip">${GAP_LABEL[g]}</span>`)}</div>`}
    <div class="row gap-2 rv-acts">
      ${c.post !== null && c.post.status === 'draft'
        ? html`<form class="inline" method="POST" action="/panel/plan/review/approve" data-busy="جار…">${hidden}<input type="hidden" name="post" value="${c.post.id}"><button class="btn btn-primary btn-sm" type="submit">اعتمد</button></form>`
        : html``}
      ${c.post === null || c.post.status === 'published' ? html`` : html`<a class="btn btn-secondary btn-sm" href="/panel?open=${encodeURIComponent(c.post.id)}#ed">عدّل</a>`}
      <form class="inline" method="POST" action="/panel/plan/review/delay">${hidden}<button class="btn btn-secondary btn-sm" type="submit" name="days" value="1">أخّر يومًا</button><button class="btn btn-secondary btn-sm" type="submit" name="days" value="7">أسبوعًا</button></form>
      <form class="inline" method="POST" action="/panel/plan/review/drop" data-confirm="احذف هذا البند من الخطّة؟ ومسوّدتُه تُرفض وتبقى بكلفتها.">${hidden}<button class="btn btn-quiet btn-sm" type="submit">احذف</button></form>
    </div>
  </article>`
}

function calendar(m: ReviewModel): Html {
  const start = m.plan.week
  const days = spanDays(m.plan.span ?? 'week')
  const counts = new Map<string, number>()
  for (const c of m.cards) counts.set(c.item.day, (counts.get(c.item.day) ?? 0) + 1)
  const cells: Html[] = []
  // ‏الأسبوعُ يبدأ الأحد في الرأس، فيومُ بدايةٍ غيرُه يُزاح بخاناتٍ فارغة
  const lead = new Date(start + 'T12:00:00Z').getUTCDay()
  for (let i = 0; i < lead; i += 1) cells.push(html`<span class="rv-cd" aria-hidden="true"></span>`)
  for (let i = 0; i < days; i += 1) {
    const day = shift(start, i)
    const n = counts.get(day) ?? 0
    cells.push(n === 0
      ? html`<span class="rv-cd" aria-hidden="true"><b>${dayLabel(day, 'short')}</b></span>`
      : html`<a class="rv-cd is-on" href="#d-${day}"><b>${dayLabel(day, 'short')}</b><span>${AR(n)}</span></a>`)
  }
  return html`<nav class="rv-cal" aria-label="أيّام الخطّة">${['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((d) => html`<span class="rv-wd" aria-hidden="true">${d}</span>`)}${cells}</nav>`
}

function gapsBar(m: ReviewModel): Html {
  const order: Gap[] = ['unwritten', 'pending', 'no_image', 'clash']
  const present = order.filter((g) => m.gaps[g] > 0)
  if (present.length === 0) return html`<p class="rv-ok m-0" role="status"><b>لا ينقص شيء</b> — الخطّةُ جاهزةٌ للتثبيت.</p>`
  return html`<div class="row gap-2 rv-gaps" role="status"><b>ما ينقص:</b>${present.map((g) => {
    const first = m.cards.find((c) => c.gaps.includes(g))
    return html`<a class="chip" href="#c-${String(first?.index ?? 0)}">${AR(m.gaps[g])} ${GAP_LABEL[g]}</a>`
  })}</div>`
}

export function planReviewScreen(m: ReviewModel, zone: string | null): string {
  const span = SPAN_LABEL[m.plan.span ?? 'week']
  const end = shift(m.plan.week, spanDays(m.plan.span ?? 'week') - 1)
  const state = m.lockedAt !== null
    ? html`<span class="st ok">مثبَّتة · الإصدار ${AR(m.version)}</span>`
    : m.versions.length > 0
      ? html`<span class="st warn">عُدّلت بعد التثبيت · الإصدار ${AR(m.version)} غير مثبَّت</span>`
      : html`<span class="st idle">مسوّدة · الإصدار ${AR(m.version)}</span>`
  const head = pageHead('المنشورات', 'راجع الخطّة', span + ' · ' + dayLabel(m.plan.week) + ' – ' + dayLabel(end))
  const written = m.cards.filter((c) => c.post !== null).length
  const approved = m.cards.filter((c) => c.post !== null && c.post.status !== 'draft').length
  const progress = written < m.cards.length
    ? html`<p class="hint m-0" role="status">كُتب ${AR(written)} من ${AR(m.cards.length)} — صدى يكتب الباقي الآن بصوره. حدّث الصفحة بعد قليل.</p>`
    : html``
  const byDay = new Map<string, ReviewCard[]>()
  for (const c of [...m.cards].sort((a, b) => (a.item.day + a.item.time).localeCompare(b.item.day + b.item.time))) {
    byDay.set(c.item.day, [...(byDay.get(c.item.day) ?? []), c])
  }
  const list = [...byDay.entries()].map(([day, cards]) => html`<section class="rv-day" aria-labelledby="d-${day}">
      <h2 class="rv-dh" id="d-${day}">${dayLabel(day)}</h2>
      <div class="rv-cards">${cards.map((c) => card(c, m.plan.id, zone))}</div></section>`)
  const versions = m.versions.length === 0 ? html`` : html`<details class="fold mt-4"><summary><span>الإصدارات المثبَّتة (${AR(m.versions.length)})</span></summary>
      <ul class="plain">${m.versions.map((v) => html`<li>الإصدار ${AR(v.version)} — ثُبّت ${stamp(v.lockedAt, zone)}، ${AR(v.items)} بندًا، جُدول منها ${AR(v.scheduled)}${v.lockedBy === null ? '' : ' · ' + v.lockedBy}</li>`)}</ul></details>`
  const pin = m.lockedAt !== null
    ? html`<span class="hint">ثُبّت هذا الإصدار — أيُّ تعديلٍ يفتح إصدارًا جديدًا ويبقى هذا كما هو.</span>`
    : html`<form class="inline" method="POST" action="/panel/plan/pin" data-busy="جار التثبيت…" data-confirm="${'ثبّت الإصدار ' + AR(m.version) + '؟ يُجدوَل ' + AR(approved) + ' منشورًا معتمَدًا في مواعيده' + (m.cards.length - approved > 0 ? '، ويبقى ' + AR(m.cards.length - approved) + ' بلا اعتمادٍ لا يُجدوَل' : '') + '.'}">
        <input type="hidden" name="id" value="${m.plan.id}"><button class="btn btn-primary" type="submit"${approved === 0 ? raw(' disabled') : ''}>ثبّت الخطّة</button></form>`
  return html`${raw(head)}
    <div class="row gap-2 mb-3">${state}<span class="grow"></span><a class="btn btn-secondary btn-sm" href="/panel/plan/new">خطّة جديدة</a></div>
    ${progress}
    ${calendar(m)}
    ${gapsBar(m)}
    <form method="POST" action="/panel/plan/review/bulk" id="rv-bulk" class="rv-bulk card card-inset">
      <input type="hidden" name="id" value="${m.plan.id}">
      <span id="rv-n">حدّد بنودًا لفعلٍ واحدٍ عليها</span><span class="grow"></span>
      <button class="btn btn-secondary btn-sm" type="submit" name="do" value="approve">اعتمد المحدَّد</button>
      <button class="btn btn-secondary btn-sm" type="submit" name="do" value="delay">أخّرها يومًا</button>
      <button class="btn btn-quiet btn-sm" type="submit" name="do" value="drop" data-confirm="احذف البنودَ المحدَّدة من الخطّة؟">احذفها</button>
    </form>
    ${list}
    ${versions}
    <div class="rv-foot card"><span class="grow">${AR(approved)} معتمَدةً من ${AR(m.cards.length)}${m.gaps.pending > 0 ? ' · ' + AR(m.gaps.pending) + ' تنتظر اعتمادك' : ''}</span>${pin}</div>`.value
}

/** يُظهر شريطَ الجملة حين يُحدَّد شيءٌ ويعدّه — وبلا سكربتٍ يبقى ظاهرًا ويعمل. */
export const PLAN_REVIEW_SCRIPT = `(function(){
  var bar=document.getElementById('rv-bulk'), n=document.getElementById('rv-n'); if(!bar||!n)return;
  function upd(){var k=document.querySelectorAll('input[name="sel"]:checked').length; bar.hidden=k===0; n.textContent=k.toLocaleString('ar-EG')+' محدَّدًا';}
  document.addEventListener('change',function(e){if(e.target&&e.target.name==='sel')upd();});
  upd();
})();`
