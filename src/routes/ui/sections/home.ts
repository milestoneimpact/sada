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
import { byNeed, type ChannelView } from '../../../lib/channels'
import {
  journeySteps, nextAction, platformTile,
  type HomeFacts, type JourneyStep, type PlatformTile,
} from '../../../lib/home'
import { parseSqliteUtc, untilTime } from '../../../lib/format'
import { localParts } from '../../../lib/time/zone'

import { LOGOS } from '../logos'
import { RUNG_MARK } from '../parts'
import { statusBadge } from '../components/badge'

const TILE_MARK: Readonly<Record<PlatformTile['tone'], string>> = { ok: '●', bad: '▲', warn: '◍', idle: '○' }

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
      <span class="wk-dots" aria-label="${pfs.length} منشور">${pfs.slice(0, 6).map((pf) =>
        `<span class="wk-dot" data-pf="${escapeHtml(pf)}" title="${escapeHtml(pf)}"></span>`).join('')}</span>
      <span class="wk-c num">${pfs.length === 0 ? '—' : pfs.length}</span></li>`
  }).join('')
  return `<div class="card home-card">
    <div class="card-head"><h2>هذا الأسبوع</h2><div class="grow"></div>
      <span class="ago">مجدولٌ ${total}</span></div>
    <ol class="wk">${cols}</ol>
    <p class="hint wk-hint">${total === 0 ? 'لا شيءَ مجدولٌ في الأيّام السبعة — اعتمد مسوّدةً واختر لها موعدًا.' : 'كلُّ نقطةٍ منشورٌ بلون منصّته.'}</p>
  </div>`
}

function tile(t: PlatformTile, nextAt: string | null, now: Date): string {
  const meta = t.tone === 'ok'
    ? nextAt === null ? 'لا شيءَ مجدولٌ عليها' : `التالي ${untilTime(nextAt, now)}`
    : t.tone === 'bad' ? 'النشرُ عليها متوقّف' : t.tone === 'warn' ? 'ضغطةٌ واحدةٌ تربطها' : 'سرّا التطبيق أوّلًا'
  return `<div class="card pf" data-pf="${escapeHtml(t.id)}">
    <div class="pf-head"><span class="pf-logo">${LOGOS[t.id] ?? ''}</span>
      <span class="pf-name"><b>${escapeHtml(t.label)}</b>
        ${t.account === null ? '' : `<span class="ago"><bdi>${escapeHtml(t.account)}</bdi></span>`}</span></div>
    ${statusBadge(t.tone, TILE_MARK[t.tone], escapeHtml(t.status))}
    <span class="ago">${escapeHtml(t.linkOnly ? 'يربط ولا ينشر بعد' : meta)}</span>
    <a class="btn ${t.button.primary ? 'btn-primary' : 'btn-secondary'} btn-sm" href="${escapeHtml(t.button.href)}"
      aria-label="${escapeHtml(`${t.button.label} — ${t.label}`)}">${escapeHtml(t.button.label)}</a>
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

export function homeTop(f: HomeFacts, now: Date, kpis = ''): string {
  const next = nextAction(f, now)
  const trip = journeySteps(f)
  const focus = focusOf(trip, next.step)
  const built = f.channels.filter((c: ChannelView) => c.state !== 'unbuilt')
  const soon = f.channels.filter((c: ChannelView) => c.state === 'unbuilt').map((c) => c.spec.label)
  const linked = built.filter((c) => platformTile(c, now).tone === 'ok').length
  return `<div class="card card-alert next" data-tone="${next.tone}">
    <div class="next-body"><span class="next-k">خطوتُك التالية</span>
      <p class="next-t">${escapeHtml(next.text)}</p></div>
    <a class="btn btn-primary" href="${escapeHtml(next.href)}">${escapeHtml(next.label)}</a>
  </div>
  ${kpis}

  <div class="home-pair">
    <div class="card home-card">
      <div class="card-head"><h2>رحلةُ المنشور</h2><div class="grow"></div>
        <span class="ago">كم مرّ بكلّ محطّة</span></div>
      <ol class="funnel">${trip.map((s, i) => leg(s, i, focus, Math.max(...trip.map((t) => t.count)))).join('')}</ol>
    </div>
    <div class="home-side">
    ${week(f.scheduled ?? [], now, f.zone)}
  <div class="card home-card">
    <div class="card-head"><h2>المنصّات</h2><div class="grow"></div>
      <span class="ago">متّصلة ${linked} من ${built.length}</span></div>
    <div class="pfgrid">${byNeed(built, now)
      .map((c) => tile(platformTile(c, now), f.counts.perPlatform[c.spec.id]?.nextAt ?? null, now))
      .join('')}</div>
    ${soon.length === 0 ? '' : `<p class="hint">قريبًا: ${soon.map(escapeHtml).join(' · ')}</p>`}
  </div>
    </div>
  </div>`
}
