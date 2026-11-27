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
import { todayKey } from '../../../lib/time/zone'
import { SPAN_LABEL, spanDays } from '../../../lib/plan/prompt'
import type { StoredPlan } from '../../../lib/plan/job'
import { dayLabel, shift } from '../planReviewView'

const ar = num
import { RUNG_MARK } from '../parts'
import { statusBadge } from '../components/badge'
import { glyph } from '../icons'
import { dayBars } from '../chart'
import { total } from '../../../lib/home'


/*
 * ‏ومحطّةُ النشر تقول «فشلت» لا «ساقطة» (الخطّة 8.2): علامةُ السلّم المشتركة تبقى
 * ‏لدرجاته ونقاطه، والمحطّةُ هنا منشورٌ فشل — والكلمةُ كلمةُ المالك
 */
const STEP_LABEL: Readonly<Partial<Record<JourneyStep['state'], string>>> = { failed: 'فشلت' }

/**
 * ‏**رحلةُ المنشور خطَّ مراحلَ عموديًّا** (SPEC-v1 §6.1 · D-381، بدل أشرطة D-194): الشريطُ بطول العدد كان يُقرأ «تقدّمًا» وهو
 * ‏عدد، فتطول «المسوّدة» وتقصر «النتائج» ولا يُفهم لماذا. فصارت كلُّ مرحلةٍ دائرةَ حالٍ على خطٍّ واحد، واسمَها وعددَها وسطرَها.
 * ‏**والمرحلةُ المميَّزة وحدَها مغسولةٌ بلون حالها** (`--warn-wash` لما ينتظرك، `--bad-wash` لما فشل) — سبعُ برتقاليّاتٍ ضجيج.
 * ‏ومرحلةٌ «تامّة» لم يمرّ بها شيء (النتائج 0) لا تلبس «تامّة»: تُرسَم «تنتظر» — فلا يُقرأ الصفرُ إنجازًا.
 */
function leg(s: JourneyStep, i: number, focus: number): string {
  const shown = s.state === 'done' && s.count === 0 ? 'waiting' : s.state
  const mark = RUNG_MARK[shown]
  const tone = shown === 'now' && i !== focus ? 'idle' : mark.cls
  return `<li data-state="${shown}"${i === focus ? ' data-focus' : ''}><a href="${escapeHtml(s.href)}">
      <span class="js-dot" data-tone="${tone}" aria-hidden="true">${glyph(mark.g)}</span>
      <span class="js-t"><b>${escapeHtml(s.title)}</b>${statusBadge(tone, mark.g, escapeHtml(STEP_LABEL[shown] ?? mark.label))}</span>
      <span class="js-n num">${s.count}</span>
      <span class="js-note">${escapeHtml(s.note)}</span></a></li>`
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
 * ‏**«هذا الأسبوع» ويُنشر اليومَ فيه** (SPEC-v1 §6.1 · D-381): كانا بطاقتين، و«يُنشر اليوم» صندوقٌ كاملٌ لعبارةٍ فارغة. فصار اليومُ
 * ‏أوّلَ الشريط بإطار العلامة، وما يخرج فيه قائمةٌ تحت الشريط بساعته ومنصّته. وسبعةُ أيّامٍ من اليوم **بتوقيت المالك**، في كلٍّ
 * ‏مربّعُ شعارٍ بلون منصّته (`--pf-*`) لكلّ منشورٍ مجدول وعددُها. **والمربّعُ لا النقطة** (D-325 باقٍ، أقوى من نصّ المواصفة):
 * ‏نقطةُ X ونقطةُ TikTok سوداوان لا تُفرَّقان (ΔE_OK ‏1.7)، والرمزُ الأبيضُ يفرّقهما. **ويومٌ فيه منشوراتٌ يُفتح** (`details` باسمٍ
 * ‏واحد، فلا يُفتح يومان معًا): قائمةُ منشوراته بساعاتها، بلا سكربت ومن لوحة المفاتيح.
 */
function week(items: readonly { platform: string; at: string }[], now: Date, zone: string | null): string {
  const key = (d: Date): string => { const p = localParts(d, zone); return `${p.year}-${p.month}-${p.day}` }
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * 86_400_000))
  const by = new Map<string, { platform: string; at: string; d: Date }[]>()
  for (const it of items) {
    const at = parseSqliteUtc(it.at)
    if (at === null || at.getTime() < now.getTime() - 3_600_000) continue
    const k = key(at)
    by.set(k, [...(by.get(k) ?? []), { platform: it.platform, at: it.at, d: at }])
  }
  for (const v of by.values()) v.sort((x, y) => x.d.getTime() - y.d.getTime())
  const total = days.reduce((n, d) => n + (by.get(key(d))?.length ?? 0), 0)
  const timed = (list: readonly { platform: string; at: string }[]): string => list.map((it) => html`<li><bdi dir="ltr" class="num">${clock(it.at, zone)}</bdi>
      <span class="td-pf">${raw(LOGOS[it.platform] ?? '')}${platformLabel(it.platform as never)}</span></li>`.value).join('')
  const cols = days.map((d, i) => {
    const p = localParts(d, zone)
    const list = by.get(key(d)) ?? []
    const pfs = list.map((x) => x.platform)
    // ‏والمنصّاتُ بأسمائها في اسم المربّعات (D-323): اللونُ وحدَه لا يقول المنصّة
    const names = pfs.map((pf) => platformLabel(pf)).join(' · ')
    const day = i === 0
      ? 'اليوم'
      : html`<span class="wk-long" aria-hidden="true">${WEEKDAYS[p.weekday] ?? ''}</span><span class="wk-short" aria-hidden="true">${
        WEEKDAYS_SHORT[p.weekday] ?? ''}</span><span class="wk-min" aria-hidden="true">${WEEKDAYS_MIN[p.weekday] ?? ''}</span><span class="vh">${WEEKDAYS[p.weekday] ?? ''}</span>`.value
    const cell = `<span class="wk-d">${day}</span>
      <span class="wk-n num">${p.day}</span>
      <span class="wk-dots" role="img" aria-label="${pfs.length === 0 ? 'لا منشور' : escapeHtml(String(pfs.length) + ' منشور: ' + names)}">${pfs.slice(0, 6).map((pf) =>
        `<span class="wk-pf" data-pf="${escapeHtml(pf)}">${LOGOS[pf] ?? ''}</span>`).join('')}</span>
      <span class="wk-c num">${pfs.length === 0 ? '—' : pfs.length}</span>`
    // ‏واليومُ يُفتح كغيره (§6.1.5): ما يخرج اليومَ في خانته المميَّزة، لا صندوقًا ثانيًا تحت الشريط
    const body = list.length === 0 ? cell
      : html`<details class="wk-day" name="wk"><summary>${raw(cell)}</summary><ol class="td-list wk-pop">${raw(timed(list))}</ol></details>`.value
    return `<li${i === 0 ? ' data-today' : ''}>${body}</li>`
  }).join('')
  return `<div class="card home-card" role="region" aria-labelledby="wk-t">
    <div class="card-head"><h2 id="wk-t">هذا الأسبوع</h2><div class="grow"></div>
      <span class="ago">مجدول ${total}</span></div>
    <ol class="wk">${cols}</ol>
    <p class="hint wk-hint">${total === 0 ? 'لا شيء مجدول في الأيّام السبعة — اعتمد مسوّدةً واختر لها موعدًا.' : 'كلّ مربّعٍ منشورٌ بشعار منصّته، وافتح اليوم لترى ساعاته.'}</p>
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

/**
 * ‏أربعةُ أرقامٍ من العدّ المجمَّع نفسِه — لا رقمَ يُخترَع — **في بطاقةٍ واحدةٍ مضغوطة** (SPEC-v1 §6.1، 5.4): كانت أربعَ بطاقاتٍ
 * ‏أصفارًا تحتلّ أفضلَ مساحة. **والصفرُ لا يُرى بلا سياق** (مبدأ «الثقة»): تحته سطرٌ يقول ماذا يعني وماذا يُفعل.
 */
function stats(f: HomeFacts): string {
  const failed = Object.values(f.counts.perPlatform).reduce((n, p) => n + (p.recentFailed ?? p.failed), 0)
  // ‏والحافّةُ الملوّنة لما ليس صفرًا وحدَه، و«بانتظار قرارك» محايدة (D-325)
  const cells: readonly [string, number, string, string, string][] = [
    ['بانتظار قرارك', total(f.counts, 'draft'), '#posts', 'wait', 'لا مسوّدة تنتظرك'],
    ['مجدولة', total(f.counts, 'queued'), '#posts', 'sched', 'اعتمد مسوّدةً واختر موعدها'],
    ['نُشرت هذا الأسبوع', f.counts.publishedWeek, '#results', 'ok', 'لم يُنشر شيء بعد'],
    ['فشلت هذا الأسبوع', failed, '#posts', 'bad', 'لا فشل هذا الأسبوع'],
  ]
  return `<ul class="hstats">${cells.map(([k, n, href, tone, zero]) =>
    `<li data-tone="${n === 0 ? 'idle' : tone}"><a href="${escapeHtml(href)}"><span class="hs-k">${escapeHtml(k)}</span>
      <b class="hs-n num">${n}</b>${n === 0 ? `<span class="hs-z">${escapeHtml(zero)}</span>` : ''}</a></li>`).join('')}</ul>`
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

/** ما يُمرَّر إلى «ما ينتظرك»: صفوفُها (`<li>`) وأدواتُها الثانويّة (المسح ومراجعة المصادر). */
export interface Waiting {
  readonly rows: string
  readonly tools: string
  /** ‏صفوفُ الصيانة بعد الصفّين الأوّلين (D-431): تُطوى تحت «و N غيرُها» فلا تدفع القرارَ تحت الطيّة */
  readonly rest?: readonly string[]
}

/** عددُ ما يُنشر في الأيّام السبعة من الآن — العددُ نفسُه الذي يقوله «هذا الأسبوع». */
function weekCount(items: readonly { at: string }[], now: Date): number {
  return items.filter((it) => {
    const at = parseSqliteUtc(it.at)
    return at !== null && at.getTime() >= now.getTime() - 3_600_000 && at.getTime() < now.getTime() + 7 * 86_400_000
  }).length
}

/**
 * ‏**الرئيسيّة بترتيب SPEC-v1 §6.1** (D-381، بدل ترتيب D-177 وتخطيط D-355): التحيّةُ وسطرُ حالٍ واحد وبابُ الكتابة، ثمّ «ما
 * ‏ينتظرك» بعرض اللوح — **وخطوتُك التالية أوّلُ صفوفها** لا سطرًا مستقلًّا فوقها (موضعٌ بارزٌ واحد، وزرٌّ أوّليٌّ واحد فيه) — ثمّ
 * ‏البدءُ إن كان، وما ينتظر قرارَك، والأرقامُ صفًّا واحدًا، ثمّ عمودان: الأسبوعُ (2/3) والرحلةُ (1/3)، ثمّ الخطّة.
 *
 * ‏`entry`: «منشور جديد» في سطر التحيّة — أوّليٌّ، ويُرسَم حيث لا ترويسةَ تحمله (D-326)، فلا زرّان بالاسم نفسِه في شاشة.
 */
export function homeTop(f: HomeFacts, now: Date, kpis = '', lead = '', entry = '', waiting: Waiting = { rows: '', tools: '' }): string {
  const next = nextAction(f, now)
  const trip = journeySteps(f)
  const focus = focusOf(trip, next.step)
  const run = firstRun(f)
  // ‏والمؤشّراتُ مخفيّةٌ حتّى تتوفّر بيانات (D-326)
  const written = (['draft', 'approved', 'queued', 'published', 'failed'] as const).reduce((n, k) => n + total(f.counts, k), 0)
  const bare = run !== null && f.sources.total === 0 && written === 0 && (f.scheduled ?? []).length === 0
  // ‏ولا تُقال الحالُ مرّتين (D-289 · §4.4): منصّةٌ انقطعت يقولها تنبيهُ النظام أعلى الصفحة بزرّه، فلا صفَّ لها هنا
  const repeated = next.tone === 'bad' && next.href.startsWith('/oauth/')
  // ‏و«لا شيء ينتظرك» من `nextAction` ليست بندًا: هي الحالُ الفارغةُ نفسُها، فتُقال فيها لا صفًّا
  const idle = next.tone === 'ok' && next.text.startsWith('لا شيء ينتظرك')
  // ‏‏والعددُ عددُ ما في طابور القرار لا المسوّدات وحدها (مراجعة D-432): المعتمَدةُ بلا موعدٍ قرارٌ ينتظرك أيضًا
  const deskN = Number(/data-desk-n>(\d+)</.exec(kpis)?.[1] ?? 0)
  const waitingN = Math.max(total(f.counts, 'draft'), deskN)
  const status = html`<p class="hello-status m-0">${waitingN > 0 ? html`<a href="#desk"><b class="num">${String(waitingN)}</b> بانتظار قرارك</a>` : html`<b class="num">${String(waitingN)}</b> بانتظار قرارك`} · <b class="num">${String(weekCount(f.scheduled ?? [], now))}</b> مجدولة هذا الأسبوع</p>`
  const head = html`<div class="home-head"><div class="hello-t"><p class="hello m-0">${greeting(now, f.zone)}</p>${bare ? html`` : status}</div><span class="grow"></span>${raw(entry)}</div>`
  const nextRow = repeated || idle ? '' : html`<li class="todo-next" data-tone="${next.tone}"><span class="dot ${next.tone}"></span>
      <span><span class="next-k">خطوتُك التالية</span> ${next.text}</span>
      <span class="todo-go"><a class="btn btn-primary btn-sm" href="${next.href}">${next.label}</a></span></li>`.value
  const rest = waiting.rest ?? []
  const rows = nextRow + waiting.rows
  const box = html`<div class="card home-waiting" role="region" aria-labelledby="hw-t">
    <div class="card-head"><h2 id="hw-t">ما ينتظرك</h2></div>
    ${rows === ''
      ? html`<div class="empty empty-ok"><p class="empty-t m-0"><span class="dot ok"></span> لا شيء ينتظرك الآن</p><p class="hint m-0">${idle ? next.text : 'كلّ ما بُني مضبوط.'}</p>${idle ? html`<p class="m-0 mt-2"><a class="btn btn-primary btn-sm" href="${next.href}">${next.label}</a></p>` : html``}</div>`
      : html`<ul class="todo todo-act">${raw(rows)}</ul>`}
    ${rest.length === 0 ? html`` : html`<details class="fold"><summary><span>و${String(rest.length)} غيرُها</span></summary><ul class="todo todo-act">${raw(rest.join(''))}</ul></details>`}
    ${waiting.tools === '' ? html`` : html`<div class="row gap-2 mt-3">${raw(waiting.tools)}</div>`}
  </div>`
  // ‏‏**القرارُ قبل الصيانة** (D-431): ما ينتظر قرارك أوّلًا حين يكون، فـ«اعتمد · غدًا» في الشاشة الأولى على الهاتف
  const deskFirst = kpis !== ''
  return `${head.value}
  ${deskFirst ? kpis : ''}
  ${box.value}
  ${run === null ? '' : firstRunCard(run, f, now)}
  ${bare ? '' : stats(f)}
  ${/* ‏وطابورُ القرار بعد الأرقام (§6.1): بطاقةٌ بمنشورين كاملين كانت تدفع الأرقامَ تحت الطيّة، والخطوةُ الأولى في «ما ينتظرك» أصلًا */''}
  ${deskFirst ? '' : kpis}
  ${bare ? '' : html`<div class="home-grid">
    <div class="home-main">${raw(week(f.scheduled ?? [], now, f.zone))}</div>
    <aside class="home-aside" aria-label="رحلة المنشور">
      <div class="card home-card">
        <div class="card-head"><h2>رحلة المنشور</h2><div class="grow"></div>
          <span class="ago">كم مرّ بكلّ مرحلة</span></div>
        <ol class="jsteps">${raw(trip.map((s, i) => leg(s, i, focus)).join(''))}</ol>
      </div>
    </aside>
  </div>`.value}
  ${lead}`
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
      ${/* ‏و«عندي خطّة» رابطٌ ثانويٌّ إلى بطاقة الاستيراد في اللوح نفسِه (D-422): خرج من «منشور جديد ▾» (D-417) فبقي بلا بابٍ في الرئيسيّة */''}
      ${/* ‏بابٌ واحد (D-387): يكتبها المساعد، أو من ملفّ، أو من GitHub — والاختيارُ في صفحته لا هنا */''}
      <p class="m-0">لا خطّة بعد. يكتبها المساعد في أربع خطوات، أو ترفع خطّتك من ملفّ، أو تُزامن حزمتك من GitHub.</p>
      <div class="row gap-2 mt-3"><a class="btn btn-primary" href="/panel/new">منشورات جديدة</a><a class="tap" href="/panel#plan-import">عندي خطّة (CSV)</a></div>
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
  /*
   * ‏**وخطّةٌ انقضى أسبوعُها تقول ذلك** (SPEC-v1 §6.1 · D-381): كانت الرئيسيّةُ تعرض أسبوع 4-10 أكتوبر واليومُ 16 نوفمبر، وزرُّها
   * ‏«تابع الكتابة» لخطّةٍ لن تُنشر. فوسمُ تحذير «خطّة منتهية»، والزرُّ الأوّليُّ الواحدُ يبني خطّةَ الأسبوع الحاليّ (المسارُ القائم).
   * ‏واليومُ بتوقيت المالك لا بـ UTC
   */
  const today = todayKey(now, zone)
  const expired = end < today
  const go = expired
    ? { href: '/panel/new', label: 'أنشئ خطّة الأسبوع الحاليّ' }
    : locked
    ? { href: '/panel/plan/view', label: 'اعرض الخطّة' }
    : c.written < total
      ? { href: '/panel/plan/review', label: 'تابع الكتابة' }
      : c.pending > 0
        ? { href: '/panel/plan/review', label: 'راجع واعتمد (' + ar(c.pending) + ')' }
        : { href: '/panel/plan/review', label: 'ثبّت الخطّة' }
  const next = expired ? [] : [...plan.plan.items].filter((i) => i.day >= today).sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)).slice(0, 3)
  return html`<div class="card home-plan" role="region" aria-labelledby="hp-t">
    <div class="card-head"><h2 id="hp-t">خطّةُ ${span === 'شهر' ? 'الشهر' : span}</h2><span class="grow"></span>${expired ? html`<span class="st warn">خطّة منتهية</span>` : html``}${state}</div>
    <p class="hint m-0">${dayLabel(plan.week)} — ${dayLabel(end)}</p>
    <div class="hp-prog"><progress max="${String(Math.max(1, total))}" value="${String(c.ready)}" aria-label="المعتمَد من الخطّة"></progress>
      <span><b>${ar(c.ready)}</b> من ${ar(total)} معتمَدة${c.pending > 0 ? ' · ' + ar(c.pending) + ' تنتظرك' : ''}${c.written < total ? ' · ' + ar(total - c.written) + ' تُكتب' : ''}</span></div>
    ${next.length === 0 ? html`` : html`<ol class="hp-next" aria-label="أقربُ ما في الخطّة">${next.map((i) => html`<li>
      <span class="pf-logo rv-pf" data-pf="${i.platform}" aria-hidden="true">${raw(LOGOS[i.platform] ?? '')}</span>
      <b>${dayLabel(i.day)}</b><bdi class="mono">${i.time}</bdi><span class="hp-a">${i.angle}</span></li>`)}</ol>`}
    <div class="row gap-2 mt-3"><a class="btn btn-primary" href="${go.href}">${go.label}</a>${locked && !expired ? html`` : html`<a class="btn btn-secondary" href="/panel/plan/view">اعرض الخطّة</a>`}<a class="tap" href="/panel#plan-import">عندي خطّة (CSV)</a></div>
  </div>`.value
}
