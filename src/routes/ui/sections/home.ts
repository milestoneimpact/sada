/**
 * رأسُ الرئيسيّة (D-177): **خطوتُك التالية، ثمّ الرحلة، ثمّ المنصّات**.
 *
 * ثلاثُ طبقاتٍ تجيب ثلاثةَ أسئلةٍ بترتيبها: ماذا أفعل الآن؟ أين أنا من الرحلة؟
 * وأيُّ منصّةٍ متّصلةٌ وأيُّها لا؟ وما تحتها (ما ينتظرك، وما وقع، والمال، وصحّةُ
 * الدورات) يبقى كما كان — لكن بعد الجواب لا قبله.
 *
 * والحكمُ كلُّه في `lib/home.ts` نقيًّا مختبَرًا؛ وهنا رسمٌ وتهريبٌ فحسب.
 */
import { escapeHtml } from '../escape'
import type { ChannelView } from '../../../lib/channels'
import {
  journeySteps, nextAction, platformTile,
  type HomeFacts, type JourneyStep, type PlatformTile,
} from '../../../lib/home'
import { untilTime } from '../../../lib/format'
import { LOGOS } from '../logos'
import { RUNG_MARK, status } from '../parts'

const TILE_MARK: Readonly<Record<PlatformTile['tone'], string>> = { ok: '●', bad: '▲', warn: '◍', idle: '○' }

function step(s: JourneyStep, i: number, focus: number): string {
  const mark = RUNG_MARK[s.state]
  // ‏**وأوّلُ محطّةٍ تنتظرك وحدَها تُلوَّن أرضًا** — خمسُ بطاقاتٍ كهرمانيّة تُقرأ ضجيجًا
  return `<li data-state="${s.state}"${i === focus ? ' data-focus' : ''}><a href="${escapeHtml(s.href)}">
      <span class="j-n" aria-hidden="true">${i + 1}</span>
      <span class="j-body"><b>${escapeHtml(s.title)}</b>
        ${status(mark.cls, mark.g, escapeHtml(mark.label))}
        <span class="j-note">${escapeHtml(s.note)}</span></span></a></li>`
}

function tile(t: PlatformTile, nextAt: string | null, now: Date): string {
  const meta = t.tone === 'ok'
    ? nextAt === null ? 'لا شيءَ مجدولٌ عليها' : `التالي ${untilTime(nextAt, now)}`
    : t.tone === 'bad' ? 'النشرُ عليها متوقّف' : t.tone === 'warn' ? 'ضغطةٌ واحدةٌ تربطها' : 'سرّا التطبيق أوّلًا'
  return `<div class="pf" data-pf="${escapeHtml(t.id)}">
    <div class="pf-head"><span class="pf-logo">${LOGOS[t.id] ?? ''}</span>
      <span class="pf-name"><b>${escapeHtml(t.label)}</b>
        ${t.account === null ? '' : `<span class="ago"><bdi>${escapeHtml(t.account)}</bdi></span>`}</span></div>
    ${status(t.tone, TILE_MARK[t.tone], escapeHtml(t.status))}
    <span class="ago">${escapeHtml(t.linkOnly ? 'يربط ولا ينشر بعد' : meta)}</span>
    <a class="btn ${t.button.primary ? 'p' : 'g'} sm" href="${escapeHtml(t.button.href)}"
      aria-label="${escapeHtml(`${t.button.label} — ${t.label}`)}">${escapeHtml(t.button.label)}</a>
  </div>`
}

export function homeTop(f: HomeFacts, now: Date): string {
  const next = nextAction(f)
  const trip = journeySteps(f)
  const focus = trip.findIndex((s) => s.state === 'now' || s.state === 'failed')
  const built = f.channels.filter((c: ChannelView) => c.state !== 'unbuilt')
  const soon = f.channels.filter((c: ChannelView) => c.state === 'unbuilt').map((c) => c.spec.label)
  const linked = built.filter((c) => platformTile(c).tone === 'ok').length
  return `<div class="next" data-tone="${next.tone}">
    <div class="next-body"><span class="next-k">خطوتُك التالية</span>
      <p class="next-t">${escapeHtml(next.text)}</p></div>
    <a class="btn p" href="${escapeHtml(next.href)}">${escapeHtml(next.label)}</a>
  </div>

  <div class="card home-card">
    <div class="card-head"><h2>رحلةُ المنشور</h2><div class="grow"></div>
      <span class="ago">اضغط أيَّ محطّةٍ لتذهب إليها</span></div>
    <ol class="trip">${trip.map((s, i) => step(s, i, focus)).join('')}</ol>
  </div>

  <div class="card home-card">
    <div class="card-head"><h2>المنصّات</h2><div class="grow"></div>
      <span class="ago">متّصلة ${linked} من ${built.length}</span></div>
    <div class="pfgrid">${built
      .map((c) => tile(platformTile(c), f.counts.perPlatform[c.spec.id]?.nextAt ?? null, now))
      .join('')}</div>
    ${soon.length === 0 ? '' : `<p class="hint">قريبًا: ${soon.map(escapeHtml).join(' · ')}</p>`}
  </div>`
}
