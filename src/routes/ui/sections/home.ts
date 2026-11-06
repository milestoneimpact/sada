/**
 * رأسُ الرئيسيّة (D-177 · D-194): **خطوتُك التالية، ثمّ القمعُ وشريطُ الأسبوع، ثمّ المنصّات**.
 *
 * ثلاثُ طبقاتٍ تجيب ثلاثةَ أسئلةٍ بترتيبها: ماذا أفعل الآن؟ أين أنا من الرحلة؟
 * وأيُّ منصّةٍ متّصلةٌ وأيُّها لا؟ وما تحتها (ما ينتظرك، وما وقع، والمال، وصحّةُ
 * الدورات) يبقى كما كان — لكن بعد الجواب لا قبله.
 *
 * والحكمُ كلُّه في `lib/home.ts` نقيًّا مختبَرًا؛ وهنا رسمٌ وتهريبٌ فحسب.
 */
import { escapeHtml } from '../escape'
import {
  journeySteps, nextAction,
  type HomeFacts, type JourneyStep,
} from '../../../lib/home'
import { parseSqliteUtc } from '../../../lib/format'
import { clock, localParts } from '../../../lib/time/zone'
import { platformLabel } from '../../../lib/oauth/providers'

import { LOGOS } from '../logos'
import { html, raw } from '../html'
import { stamp } from '../../../lib/time/zone'
import { SPAN_LABEL, spanDays } from '../../../lib/plan/prompt'
import type { StoredPlan } from '../../../lib/plan/job'
import { dayLabel, shift } from '../planReviewView'

const ar = (n: number): string => n.toLocaleString('ar-EG')
import { RUNG_MARK } from '../parts'
import { statusBadge } from '../components/badge'
import { dayBars } from '../chart'
import { total } from '../../../lib/home'


/*
 * ‏ومحطّةُ النشر تقول «فشلت» لا «ساقطة» (الخطّة 8.2): علامةُ السلّم المشتركة تبقى
 * ‏لدرجاته ونقاطه، والمحطّةُ هنا منشورٌ فشل — والكلمةُ كلمةُ المالك
 */
const STEP_LABEL: Readonly<Partial<Record<JourneyStep['state'], string>>> = { failed: 'فشلت' }

/**
 * القمع (D-194): **سبعُ محطّاتٍ أشرطةً بطولِ ما مرّ بكلٍّ منها** — بدل سبع بطاقاتٍ متساوية تُقرأ
 * كلُّها «تنتظر». والطولُ نسبةٌ إلى أكبرها، والمحطّةُ المميَّزة (ما يتكلّم عنه الفعلُ فوقها) وحدَها
 * بلون حالها؛ والباقي حبرٌ واحد (قياسٌ لا هويّة). والصفُّ كلُّه رابطٌ إلى موضع المحطّة.
 */
function leg(s: JourneyStep, i: number, focus: number, max: number): string {
  const mark = RUNG_MARK[s.state]
  const w = max === 0 ? 0 : Math.max(s.count === 0 ? 0 : 4, Math.round((s.count / max) * 100))
  return `<li data-state="${s.state}"${i === focus ? ' data-focus' : ''}><a href="${escapeHtml(s.href)}">
      <span class="fn-t"><b>${escapeHtml(s.title)}</b>${statusBadge(mark.cls, mark.g, escapeHtml(STEP_LABEL[s.state] ?? mark.label))}</span>
      <span class="fn-bar" aria-hidden="true"><span style="--w:${w}%"></span></span>
      <span class="fn-n num">${s.count}</span>
      <span class="fn-note">${escapeHtml(s.note)}</span></a></li>`
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/**
 * شريطُ الأسبوع (D-194): سبعةُ أيّامٍ من اليوم **بتوقيت المالك**، وفي كلٍّ نقطةٌ بلون منصّتها لكلّ
 * منشورٍ مجدول. واللونُ هويّةُ المنصّة لا قيمة، **والعددُ مكتوبٌ** فلا يُقرأ اللونُ وحدَه.
 */
function week(items: readonly { platform: string; at: string }[], now: Date, zone: string | null): string {
  const key = (d: Date): string => { const p = localParts(d, zone); return `${p.year}-${p.month}-${p.day}` }
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * 86_400_000))
  const by = new Map<string, string[]>()
  for (const it of items) {
    const at = parseSqliteUtc(it.at)
    if (at === null || at.getTime() < now.getTime() - 3_600_000) continue
    const k = key(at)
    by.set(k, [...(by.get(k) ?? []), it.platform])
  }
  const total = days.reduce((n, d) => n + (by.get(key(d))?.length ?? 0), 0)
  const cols = days.map((d, i) => {
    const p = localParts(d, zone)
    const pfs = by.get(key(d)) ?? []
    return `<li${i === 0 ? ' data-today' : ''}><span class="wk-d">${i === 0 ? 'اليوم' : WEEKDAYS[p.weekday]}</span>
      <span class="wk-n num">${p.day}</span>
      <span class="wk-dots" role="img" aria-label="${pfs.length} منشور">${pfs.slice(0, 6).map((pf) =>
        `<span class="wk-dot" data-pf="${escapeHtml(pf)}" data-tip="${escapeHtml(pf)}"></span>`).join('')}</span>
      <span class="wk-c num">${pfs.length === 0 ? '—' : pfs.length}</span></li>`
  }).join('')
  return `<div class="card home-card">
    <div class="card-head"><h2>هذا الأسبوع</h2><div class="grow"></div>
      <span class="ago">مجدول ${total}</span></div>
    <ol class="wk">${cols}</ol>
    <p class="hint wk-hint">${total === 0 ? 'لا شيء مجدول في الأيّام السبعة — اعتمد مسوّدةً واختر لها موعدًا.' : 'كلّ نقطة منشور بلون منصّته.'}</p>
  </div>`
}

/**
 * المحطّةُ المميَّزة — **ما يتكلّم عنه الفعلُ فوقها**، ثمّ الساقطة، ثمّ أوّلُ ما ينتظرك.
 *
 * كانت أوّلَ «تنتظرك» أو «فشلت» بترتيبها، فسبقت «المصدر» (تحليلٌ مدفوع) فشلَ منشورٍ
 * يقوله الفعلُ فوقها — والرحلةُ تقول غيرَ ما يقوله الفعل.
 */
function focusOf(trip: readonly JourneyStep[], step: JourneyStep['key'] | undefined): number {
  const live = (s: JourneyStep): boolean => s.state === 'now' || s.state === 'failed'
  const named = step === undefined ? -1 : trip.findIndex((s) => s.key === step && live(s))
  if (named >= 0) return named
  const failed = trip.findIndex((s) => s.state === 'failed')
  return failed >= 0 ? failed : trip.findIndex(live)
}

/** التحيّةُ بساعة المالك لا بساعة الخادم (D-265). */
export function greeting(now: Date, zone: string | null): string {
  const h = localParts(now, zone).hour
  return h >= 4 && h < 12 ? 'صباح الخير' : h >= 12 && h < 17 ? 'نهارك سعيد' : 'مساء الخير'
}

/** أربعةُ أرقامٍ من العدّ المجمَّع نفسِه — لا رقمَ يُخترَع. */
function stats(f: HomeFacts): string {
  const failed = Object.values(f.counts.perPlatform).reduce((n, p) => n + (p.recentFailed ?? p.failed), 0)
  const cells: readonly [string, number, string, string][] = [
    ['بانتظار قرارك', total(f.counts, 'draft'), '#posts', 'wait'],
    ['مجدولة', total(f.counts, 'queued'), '#posts', 'sched'],
    ['نُشرت هذا الأسبوع', f.counts.publishedWeek, '#results', 'ok'],
    ['فشلت هذا الأسبوع', failed, '#posts', failed > 0 ? 'bad' : 'idle'],
  ]
  return `<ul class="hstats">${cells.map(([k, n, href, tone]) =>
    `<li data-tone="${tone}"><a href="${escapeHtml(href)}"><span class="hs-k">${escapeHtml(k)}</span>
      <b class="hs-n num">${n}</b></a></li>`).join('')}</ul>`
}

/** ما كُتب في أربعة عشر يومًا بتوقيت المالك — من المنشورات المرسومة وحدها. */
/** «ما كُتب في أسبوعين» — في «الكلفة وما وقع» المطويّة منذ D-309: سجلٌّ يُقرأ لا قرارٌ يُتّخذ. */
export function activityCard(f: HomeFacts, now: Date): string {
  const key = (d: Date): string => { const p = localParts(d, f.zone); return `${p.year}-${p.month}-${p.day}` }
  const by = new Map<string, number>()
  for (const at of f.written ?? []) {
    const d = parseSqliteUtc(at)
    if (d !== null) by.set(key(d), (by.get(key(d)) ?? 0) + 1)
  }
  const rows = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getTime() - (13 - i) * 86_400_000)
    const p = localParts(d, f.zone)
    return { label: i === 13 ? 'اليوم' : `${p.day}/${p.month}`, value: by.get(key(d)) ?? 0 }
  })
  return `<div class="card home-card">
    <div class="card-head"><h2>ما كُتب في أسبوعين</h2><div class="grow"></div>
      <span class="ago">من آخر ستّين منشورًا</span></div>
    ${dayBars(rows, {
      title: 'لا منشورات في أسبوعين',
      html: 'اكتب فكرة في جملة، وصدى يحوّلها مسوّدة لكلّ قناة.',
      action: '<a class="btn btn-primary btn-sm" href="/panel#idea">اكتب فكرة</a>',
    })}
  </div>`
}

/**
 * **«يُنشر اليوم»** (D-267 · EASE د): ما يخرج قبل منتصف ليل المالك، بساعته ومنصّته — أوّلُ ما يُسأل عنه صباحًا.
 * من المجدول نفسِه الذي يرسم «هذا الأسبوع»، فلا استعلامَ جديد. وما مضى بأكثرَ من ساعةٍ يسقط كما يسقط هناك.
 */
function today(items: readonly { platform: string; at: string }[], now: Date, zone: string | null): string {
  const key = (d: Date): string => { const p = localParts(d, zone); return `${p.year}-${p.month}-${p.day}` }
  const list = items
    .map((it) => ({ platform: it.platform, at: it.at, d: parseSqliteUtc(it.at) }))
    .filter((it): it is { platform: string; at: string; d: Date } => it.d !== null && it.d.getTime() >= now.getTime() - 3_600_000 && key(it.d) === key(now))
    .sort((a, b) => a.d.getTime() - b.d.getTime())
  const rows = list.map((it) => `<li><bdi dir="ltr" class="num">${escapeHtml(clock(it.at, zone))}</bdi>
      <span class="td-pf">${LOGOS[it.platform] ?? ''}${escapeHtml(platformLabel(it.platform as never))}</span></li>`).join('')
  return `<div class="card home-card">
    <div class="card-head"><h2>يُنشر اليوم</h2><div class="grow"></div><span class="count">${list.length}</span></div>
    ${list.length === 0 ? '<p class="hint">لا شيء يُنشر اليوم.</p>' : `<ol class="td-list">${rows}</ol>`}
  </div>`
}

export function homeTop(f: HomeFacts, now: Date, kpis = '', lead = ''): string {
  const next = nextAction(f, now)
  const trip = journeySteps(f)
  const focus = focusOf(trip, next.step)
  /*
   * ‏**ولا تُقال الحالُ مرّتين** (D-289): منصّةٌ انقطعت أو قارب إذنُها يقولها شريطُ اللوحة فوق كلّ لوح بزرّه، فكانت الرئيسيّةُ
   * ‏تعيدها بطاقةً حمراءَ كاملةً تحته — أوّلَ ما يُرى في كلّ فتحة. فخطوةٌ عن منصّةٍ والشريطُ يقولها تُترك له، ويبقى التحيّةُ سطرًا.
   */
  // ‏والزرُّ يبقى بضغطةٍ واحدة صغيرًا بجانب التحيّة: الشريطُ يقول الحالَ، وهذا يصلحها
  const repeated = next.tone === 'bad' && next.href.startsWith('/oauth/')
  return `${repeated
    ? html`<div class="row gap-2 home-hello"><p class="hello m-0">${greeting(now, f.zone)}</p><span class="grow"></span>
        <a class="btn btn-secondary btn-sm" href="${next.href}">${next.label}</a></div>`.value
    : html`<div class="card card-alert next" data-tone="${next.tone}">
    <div class="next-body"><p class="hello">${greeting(now, f.zone)}</p><span class="next-k">خطوتُك التالية</span>
      <p class="next-t">${next.text}</p></div>
    <a class="btn btn-primary" href="${next.href}">${next.label}</a>
  </div>`.value}
  ${lead}
  ${stats(f)}
  ${kpis}

  <div class="home-pair">
    <div class="card home-card">
      <div class="card-head"><h2>رحلة المنشور</h2><div class="grow"></div>
        <span class="ago">كم مرّ بكلّ محطّة</span></div>
      <ol class="funnel">${trip.map((s, i) => leg(s, i, focus, Math.max(...trip.map((t) => t.count)))).join('')}</ol>
    </div>
    <div class="home-side">
    ${/* ‏ولا بطاقةَ منصّاتٍ هنا (D-309 · خطّة التصميم 5.5): صفحتُها «الحسابات»، والمنقطعةُ يقولها الشريطُ و«خطوتك التالية»؛
       ‏و«ما كُتب في أسبوعين» سجلٌّ لا قرار، فنزل إلى «الكلفة وما وقع» (قاعدةُ الحذف D-232) */''}
    ${today(f.scheduled ?? [], now, f.zone)}
    ${week(f.scheduled ?? [], now, f.zone)}
    </div>
  </div>`
}

/**
 * **«خطّةُ الشهر» أوّلَ الرئيسيّة** (D-289): الخطّةُ محورُ المنصّة، فهي أوّلُ ما يُرى — حالُها وتقدّمُ اعتمادها وأقربُ ثلاثة
 * منشوراتٍ فيها، وزرٌّ واحدٌ يتبع حالَها: بلا خطّة «ابنِ خطّة»، وتُكتب «تابع الكتابة»، وتنتظر «راجع واعتمد»، ومعتمَدةٌ
 * «ثبّت»، ومثبَّتةٌ «اعرض». **وقراءةٌ بلا جملةٍ جديدة**: الخطّةُ وعدُّها محمَّلان للوح «المنشورات» أصلًا.
 */
export function planCard(
  plan: StoredPlan | null,
  counts: { readonly written: number; readonly ready: number; readonly pending: number } | undefined,
  now: Date,
  zone: string | null,
): string {
  if (plan === null) {
    return html`<div class="card home-plan" role="region" aria-labelledby="hp-t">
      <div class="card-head"><h2 id="hp-t">خطّةُ الشهر</h2></div>
      <p class="m-0">لا خطّة بعد. ابنِ خطّة أسبوعٍ أو شهرٍ في أربع خطوات، أو ارفع خطّتك كما هي.</p>
      <div class="row gap-2 mt-3"><a class="btn btn-primary" href="/panel/plan/new">ابنِ خطّة</a><a class="btn btn-secondary" href="/panel/plan/import">عندي خطّة</a></div>
    </div>`.value
  }
  const total = plan.plan.items.length
  const c = counts ?? { written: 0, ready: 0, pending: 0 }
  const span = SPAN_LABEL[plan.span ?? 'week']
  const end = shift(plan.week, spanDays(plan.span ?? 'week') - 1)
  const locked = plan.lockedAt !== null && plan.lockedAt !== undefined
  const state = locked
    ? html`<span class="st ok">مثبَّتة · الإصدار ${ar(plan.version ?? 1)}</span>`
    : html`<span class="st idle">مسوّدة · الإصدار ${ar(plan.version ?? 1)}</span>`
  const go = locked
    ? { href: '/panel/plan/view', label: 'اعرض الخطّة' }
    : c.written < total
      ? { href: '/panel/plan/review', label: 'تابع الكتابة' }
      : c.pending > 0
        ? { href: '/panel/plan/review', label: 'راجع واعتمد (' + ar(c.pending) + ')' }
        : { href: '/panel/plan/review', label: 'ثبّت الخطّة' }
  const today = now.toISOString().slice(0, 10)
  const next = [...plan.plan.items].filter((i) => i.day >= today).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)).slice(0, 3)
  return html`<div class="card home-plan" role="region" aria-labelledby="hp-t">
    <div class="card-head"><h2 id="hp-t">خطّةُ ${span === 'شهر' ? 'الشهر' : span}</h2><span class="grow"></span>${state}</div>
    <p class="hint m-0">${dayLabel(plan.week)} — ${dayLabel(end)}</p>
    <div class="hp-prog"><progress max="${String(Math.max(1, total))}" value="${String(c.ready)}" aria-label="المعتمَد من الخطّة"></progress>
      <span><b>${ar(c.ready)}</b> معتمَدةً من ${ar(total)}${c.pending > 0 ? ' · ' + ar(c.pending) + ' تنتظرك' : ''}${c.written < total ? ' · ' + ar(total - c.written) + ' تُكتب' : ''}</span></div>
    ${next.length === 0 ? html`` : html`<ol class="hp-next" aria-label="أقربُ ما في الخطّة">${next.map((i) => html`<li>
      <span class="pf-logo rv-pf" data-pf="${i.platform}" aria-hidden="true">${raw(LOGOS[i.platform] ?? '')}</span>
      <b>${dayLabel(i.day)}</b><bdi class="mono">${stamp(i.day + ' ' + i.time, zone).slice(11, 16)}</bdi><span class="hp-a">${i.angle}</span></li>`)}</ol>`}
    <div class="row gap-2 mt-3"><a class="btn btn-primary" href="${go.href}">${go.label}</a>${locked ? html`` : html`<a class="btn btn-secondary" href="/panel/plan/view">اعرض الخطّة</a>`}</div>
  </div>`.value
}
