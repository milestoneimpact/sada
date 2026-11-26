/**
 * **تقريرُ الشهر** (D-262) — يُقرأ في خمس ثوانٍ: أربعةُ أرقامٍ (ما خرج، والتفاعل، وما أُنفق، وما هو قادم)، ثمّ ما خرج لكلّ منصّة،
 * ثمّ أنجحُ ثلاثة منشورات، ثمّ أرجحُ موعد. **ويُطبع PDF** بزرٍّ واحدٍ لا يحتاج غيرَ المتصفّح.
 */
import { escapeHtml } from './escape'
import { pageHead } from './parts'
import { notice, toastRegion } from './components/toast'
import { money } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { shiftMonth, type MonthlyReport } from '../../lib/report/monthly'

const PROVIDER: Readonly<Record<string, string>> = { anthropic: 'الكتابة (Claude)', gemini: 'Gemini', google: 'Google', x: 'X', linkedin: 'LinkedIn',
  // ‏‏تقديرُ المالك لا سعرٌ مقروء (D-415)
  'cloudflare:estimate': 'Cloudflare — المقاطع (تقدير، price_unverified)' }

export const MONTHLY_SCRIPT = `document.querySelectorAll('[data-print]').forEach(function(b){b.addEventListener('click',function(){window.print()})})`

export function monthlyScreen(r: MonthlyReport, orgName: string, flash: { readonly kind: 'ok' | 'warn' | 'bad'; readonly text: string } | null = null): string {
  const out = Object.values(r.published).reduce((s, n) => s + n, 0)
  const tile = (k: string, v: string, note: string): string =>
    `<div class="card tile"><div class="kv-k">${escapeHtml(k)}</div><div class="kv-v">${v}</div><div class="note">${note}</div></div>`
  const nav = `<div class="row gap-2">
      <a class="btn btn-secondary btn-sm" href="/panel/client/report?month=${shiftMonth(r.month, -1)}">الشهر السابق</a>
      <a class="btn btn-secondary btn-sm" href="/panel/client/report?month=${shiftMonth(r.month, 1)}">التالي</a>
      <button class="btn btn-secondary btn-sm" type="button" data-print>اطبعه PDF</button>
      <form class="inline" method="POST" action="/panel/client/report/send" data-busy="جار الإرسال…">
        <input type="hidden" name="month" value="${escapeHtml(r.month)}">
        <button class="btn btn-primary btn-sm" type="submit">أرسله إلى بريدي</button></form></div>`
  const platforms = Object.entries(r.published).sort((a, b) => b[1] - a[1])
  const top = r.top.map((f, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(platformLabel(f.platform as never))}</td>
      <td dir="auto">${escapeHtml([...f.text].slice(0, 90).join(''))}${[...f.text].length > 90 ? '…' : ''}</td><td>${f.engagement}</td></tr>`).join('')
  const spend = Object.entries(r.spendBy).sort((a, b) => b[1] - a[1])
    .map(([p, t]) => `<tr><td>${escapeHtml(PROVIDER[p] ?? p)}</td><td>${escapeHtml(money(t))}</td></tr>`).join('')

  return `${flash === null ? '' : toastRegion(notice({ tone: flash.kind, html: escapeHtml(flash.text), alert: flash.kind === 'bad' }))}${pageHead('التقرير', `تقريرُ ${escapeHtml(r.month)}`, `<bdi>${escapeHtml(orgName)}</bdi> — ما خرج، وما نجح، وما أُنفق، وما هو قادم. <b>وما لم يُقَس لا يُقال.</b>`)}
  <div class="split mb-4"><span></span>${nav}</div>
  <div class="grid tiles c4 mb-4">
    ${tile('خرج', String(out), platforms.length === 0 ? 'لا منشورَ هذا الشهر' : platforms.map(([p, n]) => `${escapeHtml(platformLabel(p as never))} ${n}`).join(' · '))}
    ${tile('التفاعل', String(r.engagement), `${r.measured} منشورًا قِيس بعد يومه الأوّل`)}
    ${tile('أُنفق', escapeHtml(money(r.spend)), r.estimated > 0
      ? 'من دفتر الإنفاق، ومعه تقديرُ المقاطع ' + escapeHtml(money(r.estimated)) + ' (تقدير) خارجَه'
      : 'من دفتر الإنفاق، كلُّ نداءٍ مدفوع')}
    ${tile('قادم', String(r.upcoming), 'مجدولٌ بعد هذا الشهر')}
  </div>
  <div class="card mb-4"><h2>أرجحُ موعد</h2><p class="m-0">${r.slot === null ? escapeHtml(r.why ?? 'لم يُقَس بعد.') : `<b>${escapeHtml(r.slot)}</b> — من كلّ ما قِيس لهذا العميل.`}</p></div>
  <div class="card mb-4"><h2>أنجحُ ثلاثة</h2>${top === '' ? '<p class="hint m-0">لا منشورَ مقيسًا هذا الشهر.</p>'
    : `<div class="scroll"><table><thead><tr><th>#</th><th>المنصّة</th><th>المنشور</th><th>التفاعل</th></tr></thead><tbody>${top}</tbody></table></div>`}</div>
  <div class="card"><h2>الإنفاق</h2>${spend === '' ? '<p class="hint m-0">لا إنفاقَ مسجَّلًا هذا الشهر.</p>'
    : `<div class="scroll"><table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead><tbody>${spend}</tbody></table></div>`}</div>`
}
