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
  firstRun, journeySteps, nextAction,
  type FirstRun, type HomeFacts, type JourneyStep,
} from '../../../lib/home'
import { channelHealth } from '../../../lib/channels'
import { num, parseSqliteUtc } from '../../../lib/format'
import { clock, localParts } from '../../../lib/time/zone'
import { platformLabel } from '../../../lib/oauth/providers'

import { LOGOS } from '../logos'
import { html, raw, type Html } from '../html'
import { card } from '../components/card'
// ‏باسمٍ آخر: «button» اسمُ حقلٍ في حال المنصّة (`h.button`)، وحارسُ القالب يقرأ الاسم
import { button as kitButton } from '../components/button'
import { stamp } from '../../../lib/time/zone'
import { SPAN_LABEL, spanDays } from '../../../lib/plan/prompt'
import type { StoredPlan } from '../../../lib/plan/job'
import { dayLabel, shift } from '../planReviewView'

const ar = num
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
  /*
   * ‏**ولونُ التحذير للمحطّة التي تنتظر المالكَ الآن وحدَها** (D-325 · Refactoring UI «أخفِ الثانويّ»): كانت خمسٌ من سبعٍ
   * ‏تلبس شارةَ «تنتظرك» البرتقاليّةَ نفسَها، فلا تقول أيُّها. فما ينتظره ولم يُسمَّ يبقى «تنتظرك» برمزه وكلمته بحبرٍ محايد
   * ‏— والحالُ نصٌّ لا لون (D-043) — وما فشل يبقى أحمر: الفشلُ ليس انتظارًا
   */
  const tone = s.state === 'now' && i !== focus ? 'idle' : mark.cls
  return `<li data-state="${s.state}"${i === focus ? ' data-focus' : ''}><a href="${escapeHtml(s.href)}">
      <span class="fn-t"><b>${escapeHtml(s.title)}</b>${statusBadge(tone, mark.g, escapeHtml(STEP_LABEL[s.state] ?? mark.label))}</span>
      <span class="fn-bar" aria-hidden="true"><span style="--w:${w}%"></span></span>
      <span class="fn-n num">${s.count}</span>
      <span class="fn-note">${escapeHtml(s.note)}</span></a></li>`
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
/**
 * **والاسمُ القصيرُ على الهاتف** (D-325): «الأربعاء» ‏15px ثخينًا أعرضُ من عمودٍ ‏43px عند ‏390، فالتصقت الأسماءُ بجاراتها
 * («الخميسالجمعة») — والصفحةُ لا تفيض فلم يره مدقّق. فالاسمُ بلا «ال» تحت «sm»، والكاملُ فوقها، واحدٌ يُرى ويُقرأ في المرّة.
 */
const WEEKDAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
/** والحرفُ الواحدُ تحت «xs» كتقويم الهاتف — و«الخميس» وحدَه ‏42px لا يسعه عمودُ ‏320 ولو قصُر. */
const WEEKDAYS_MIN = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']

/**
 * شريطُ الأسبوع (D-194): سبعةُ أيّامٍ من اليوم **بتوقيت المالك**، وفي كلٍّ مربّعُ شعارٍ بلون منصّتها لكلّ
 * منشورٍ مجدول. **والشعارُ يحمل المنصّةَ لا لونُه** (D-325): كانت نقطةً بلونها وحدَه، وX وTikTok أسودان لا
 * يُفرَّقان (ΔE_OK ‏1.7) — فصار المربّعُ برمزه الأبيض كمربّعات البطاقات، والعددُ مكتوبٌ، والأسماءُ في اسم اليوم.
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
    // ‏والمنصّاتُ بأسمائها في اسم النقاط وتلميحها (D-323): كان التلميحُ على كلّ نقطةٍ معرّفَها الخامّ («linkedin») على
    // ‏وسمٍ لا يأخذ التركيز داخل صورةٍ لا يُقرأ ما فيها — فاللونُ وحدَه كان يقول المنصّة. والاسمُ الآن لقارئ الشاشة وللّمس
    const names = pfs.map((pf) => platformLabel(pf)).join(' · ')
    const day = i === 0
      ? 'اليوم'
      : html`<span class="wk-long" aria-hidden="true">${WEEKDAYS[p.weekday] ?? ''}</span><span class="wk-short" aria-hidden="true">${
        WEEKDAYS_SHORT[p.weekday] ?? ''}</span><span class="wk-min" aria-hidden="true">${WEEKDAYS_MIN[p.weekday] ?? ''}</span><span class="vh">${WEEKDAYS[p.weekday] ?? ''}</span>`.value
    return `<li${i === 0 ? ' data-today' : ''}><span class="wk-d">${day}</span>
      <span class="wk-n num">${p.day}</span>
      <span class="wk-dots" role="img" aria-label="${pfs.length === 0 ? 'لا منشور' : escapeHtml(String(pfs.length) + ' منشور: ' + names)}"${
        pfs.length === 0 ? '' : ' tabindex="0" data-tip="' + escapeHtml(names) + '"'}>${pfs.slice(0, 6).map((pf) =>
        `<span class="wk-pf" data-pf="${escapeHtml(pf)}">${LOGOS[pf] ?? ''}</span>`).join('')}</span>
      <span class="wk-c num">${pfs.length === 0 ? '—' : pfs.length}</span></li>`
  }).join('')
  return `<div class="card home-card">
    <div class="card-head"><h2>هذا الأسبوع</h2><div class="grow"></div>
      <span class="ago">مجدول ${total}</span></div>
    <ol class="wk">${cols}</ol>
    <p class="hint wk-hint">${total === 0 ? 'لا شيء مجدول في الأيّام السبعة — اعتمد مسوّدةً واختر لها موعدًا.' : 'كلّ مربّعٍ منشورٌ بشعار منصّته.'}</p>
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
  /*
   * ‏**والحافّةُ الملوّنة لما ليس صفرًا وحدَه، و«بانتظار قرارك» محايدة** (D-325 · خطّة التصميم 3.2): كانت الأربعُ ملوّنةً معًا
   * ‏— تحذيرٌ وجيّدٌ وعلامةٌ وخطر — وصفرٌ بلونه يُقرأ حالًا لم تقع، و«بانتظار قرارك» برتقاليّةٌ والخطّةُ تقول «ليست تحذيرًا»
   */
  const cells: readonly [string, number, string, string][] = [
    ['بانتظار قرارك', total(f.counts, 'draft'), '#posts', 'wait'],
    ['مجدولة', total(f.counts, 'queued'), '#posts', 'sched'],
    ['نُشرت هذا الأسبوع', f.counts.publishedWeek, '#results', 'ok'],
    ['فشلت هذا الأسبوع', failed, '#posts', 'bad'],
  ]
  return `<ul class="hstats">${cells.map(([k, n, href, tone]) =>
    `<li data-tone="${n === 0 ? 'idle' : tone}"><a href="${escapeHtml(href)}"><span class="hs-k">${escapeHtml(k)}</span>
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

const FR_MARK = {
  done: { g: '●', cls: 'ok', label: 'تمّت' },
  now: { g: '◍', cls: 'warn', label: 'الآن' },
  waiting: { g: '○', cls: 'idle', label: 'تنتظر' },
} as const

/**
 * ‏**قائمةُ البدء «1 من 3»** (خطّة التصميم 5.5 «أوّل تشغيل» · D-326) — بعد «خطوتك التالية» لا بدلَها: الخطوةُ التالية تبقى
 * ‏أوّلَ الرئيسيّة بزرّها الأوّليّ الواحد، والقائمةُ تقول أين المالكُ من البدء وكم بقي، **بلا زرٍّ أوّليٍّ ثانٍ**. ولكلّ خطوةٍ
 * ‏فعلُها حين تكون الآن: الأولى **أسماءُ المنصّات، كلٌّ رابطٌ إلى مساعد ضبط تطبيقها عند حقل المعرّف** (`setupHref`) أو إلى
 * ‏ربطها إن ضُبط — فلا «المزيد» ثمّ «الحسابات» ثمّ الطيّةُ قبل أوّل حقل (ر-1·أوّل) — والثانيةُ بابُ الفكرة (لا تحتاج Drive)،
 * ‏والثالثةُ أوّلُ مسوّدةٍ تنتظر.
 */
function firstRunCard(run: FirstRun, f: HomeFacts, now: Date): string {
  const done = run.steps.filter((x) => x.done).length
  const doors = f.channels
    .filter((c) => c.spec.built && c.accounts.length === 0)
    .map((c) => ({ c, h: channelHealth(c, now) }))
    .filter((x) => x.h.button !== null && (x.h.kind === 'setup' || x.h.kind === 'connectable'))
    .map((x, i) => html`${i === 0 ? '' : ' · '}<a class="tap" href="${x.h.button!.href}">${x.c.spec.label}</a>`)
  const text: Readonly<Record<FirstRun['steps'][number]['key'], { what: string; why: string; act: Html }>> = {
    link: {
      what: 'اربط أوّل حساب',
      why: 'صدى يكتب ولا ينشر حتّى تربط منصّة. لكلّ منصّةٍ تطبيقٌ يُضبط مرّةً واحدة بمساعدٍ مرقّم، ثمّ «اربط».',
      act: doors.length === 0 ? html`` : html`<span class="why">اختر منصّة: ${doors}</span>`,
    },
    material: {
      what: 'أضف ما يُكتب منه',
      why: 'فكرةٌ بجملة، أو مقطعٌ يُرفع، أو ملفٌّ في مجلّد Drive المشترَك.',
      act: html`<span class="why mt-2">${raw(kitButton({ label: 'اكتب فكرتك', href: '/panel#idea', size: 'sm' }))}</span>`,
    },
    approve: {
      what: 'اعتمد أوّل منشور',
      why: 'يُجدوَل في موعده ثمّ يُنشر — ولا يُنشر شيءٌ قبل اعتمادك.',
      act: html`<span class="why mt-2">${raw(kitButton({ label: 'راجع المسوّدات', href: f.firsts.waiting === null ? '#posts' : '#d-' + f.firsts.waiting, size: 'sm' }))}</span>`,
    },
  }
  const rows = run.steps.map((x, i) => {
    const state = x.done ? 'done' : i === run.current ? 'now' : 'waiting'
    const mark = FR_MARK[state]
    const t = text[x.key]
    return html`<li class="${mark.cls + (state === 'now' ? ' at' : '')}" data-step="${i + 1}">
        <span class="step-n" aria-hidden="true">${i + 1}</span>
        <span class="body"><span class="what">${t.what}</span><span class="why">${t.why}</span>${state === 'now' ? t.act : ''}</span>
        ${raw(statusBadge(mark.cls, mark.g, mark.label))}
      </li>`
  })
  // ‏و`div` بدورٍ لا `section`: اللوحُ نفسُه `section` (`data-pane`)، وما يُقرأ حتّى أوّلِ إغلاقٍ له يُقرأ لوحًا كاملًا
  // ‏والعدّادُ يقول الخطوةَ الآن («الخطوة 3 من 3»)، والشريطُ ما تمّ (2): كان «3 من 3» بجوار شريطٍ بثلثين، فيُقرأ «اكتملت»
  // ‏وما زالت خطوةٌ باقية، ويسمع قارئُ الشاشة رقمين متناقضين (مراجعة D-326)
  // ‏وبدوالّ العُدّة (دمجُ D-326 مع سقّاطة D-325): البطاقةُ بـ`card()` وعنوانُها يسمّي المنطقةَ والشريط، والفعلُ بـ`button()`
  const body = html`<div class="hp-prog"><progress max="3" value="${done}" aria-labelledby="fr-t"></progress><span data-fr-count>الخطوة ${run.current + 1} من 3</span></div>
    <ol class="steps wiz mt-3">${rows}</ol>`.value
  return html`<div class="mb-3">${raw(card({ id: 'first-run', title: 'البدء في ثلاث خطوات', titleId: 'fr-t', attrs: 'role="region" aria-labelledby="fr-t"', body }))}</div>`.value
}

/**
 * ‏`entry`: بابُ الكتابة في سطر التحيّة (D-326 · «أنشئ من كلّ مكان»): «منشور جديد ▾» ثانويٌّ بجانب التحيّة على الهاتف، حيث
 * ‏لا ترويسةَ تحمله — فلا يُبحث عن الكتابة خلف زرٍّ عائمٍ بلا اسمٍ يُرى، ولا زرَّ أوّليًّا ثانيًا في البطاقة.
 */
export function homeTop(f: HomeFacts, now: Date, kpis = '', lead = '', entry = ''): string {
  const next = nextAction(f, now)
  const trip = journeySteps(f)
  const focus = focusOf(trip, next.step)
  const run = firstRun(f)
  /*
   * ‏**والمؤشّراتُ مخفيّةٌ حتّى تتوفّر بيانات** (خطّة التصميم 5.5 · D-326): رئيسيّةٌ لا مصدرَ فيها ولا منشورَ ولا موعد كانت تُري
   * ‏أربعةَ أصفار، وقمعًا بسبع محطّاتٍ فارغة، وأسبوعًا خاليًا — شاشتين من لا شيء فوق ما يفعله المالكُ أوّلًا.
   */
  const written = (['draft', 'approved', 'queued', 'published', 'failed'] as const).reduce((n, k) => n + total(f.counts, k), 0)
  const bare = run !== null && f.sources.total === 0 && written === 0 && (f.scheduled ?? []).length === 0
  /*
   * ‏**ولا تُقال الحالُ مرّتين** (D-289): منصّةٌ انقطعت أو قارب إذنُها يقولها شريطُ اللوحة فوق كلّ لوح بزرّه، فكانت الرئيسيّةُ
   * ‏تعيدها بطاقةً حمراءَ كاملةً تحته — أوّلَ ما يُرى في كلّ فتحة. فخطوةٌ عن منصّةٍ والشريطُ يقولها تُترك له، ويبقى التحيّةُ سطرًا.
   */
  // ‏والزرُّ يبقى بضغطةٍ واحدة صغيرًا بجانب التحيّة: الشريطُ يقول الحالَ، وهذا يصلحها
  const repeated = next.tone === 'bad' && next.href.startsWith('/oauth/')
  const hello = entry === ''
    ? html`<p class="hello">${greeting(now, f.zone)}</p>`
    : html`<div class="row gap-2"><p class="hello">${greeting(now, f.zone)}</p><span class="grow"></span>${raw(entry)}</div>`
  return `${repeated
    ? html`<div class="row gap-2 home-hello"><p class="hello m-0">${greeting(now, f.zone)}</p><span class="grow"></span>${raw(entry)}
        <a class="btn btn-secondary btn-sm" href="${next.href}">${next.label}</a></div>`.value
    : html`<div class="card card-alert next" data-tone="${next.tone}">
    <div class="next-body">${hello}<span class="next-k">خطوتُك التالية</span>
      <p class="next-t">${next.text}</p></div>
    <a class="btn btn-primary" href="${next.href}">${next.label}</a>
  </div>`.value}
  ${run === null ? '' : firstRunCard(run, f, now)}
  ${lead}
  ${bare ? '' : stats(f)}
  ${kpis}

  ${bare ? '' : html`<div class="home-pair">
    <div class="card home-card">
      <div class="card-head"><h2>رحلة المنشور</h2><div class="grow"></div>
        <span class="ago">كم مرّ بكلّ محطّة</span></div>
      <ol class="funnel">${raw(trip.map((s, i) => leg(s, i, focus, Math.max(...trip.map((t) => t.count)))).join(''))}</ol>
    </div>
    <div class="home-side">
    ${/* ‏ولا بطاقةَ منصّاتٍ هنا (D-309 · خطّة التصميم 5.5): صفحتُها «الحسابات»، والمنقطعةُ يقولها الشريطُ و«خطوتك التالية»؛
       ‏و«ما كُتب في أسبوعين» سجلٌّ لا قرار، فنزل إلى «الكلفة وما وقع» (قاعدةُ الحذف D-232) */''}
    ${raw(today(f.scheduled ?? [], now, f.zone))}
    ${raw(week(f.scheduled ?? [], now, f.zone))}
    </div>
  </div>`.value}`
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
