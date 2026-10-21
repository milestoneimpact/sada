/**
 * **المحفظة** (D-271) — كلُّ شركاتك في شاشةٍ واحدة تُقرأ في ثلاث ثوانٍ: ستّةُ أرقامٍ مجموعةً فوق، ثمّ صفٌّ لكلّ شركةٍ بأرقامها وزرِّ
 * «افتحها». والفلاترُ روابطُ (الفترة · المنصّة · الشركة) تعمل بلا سكربت وتُحفظ في العنوان.
 */
import { escapeHtml } from './escape'
import { pageHead } from './parts'
import { tabs } from './components/tabs'
import { statusBadge } from './components/badge'
import { money } from '../../lib/format'
import { platformLabel, PLATFORM_IDS } from '../../lib/oauth/providers'
import { PERIODS, totals, type PortfolioFilter, type PortfolioRow } from '../../lib/portfolio'
import type { OrgRow } from '../../lib/tenancy'

function href(f: PortfolioFilter, change: Partial<PortfolioFilter>): string {
  const n = { ...f, ...change }
  const q = new URLSearchParams()
  if (n.period !== 30) q.set('days', String(n.period))
  if (n.platform !== null) q.set('p', n.platform)
  if (n.org !== null) q.set('org', n.org)
  const s = q.toString()
  return `/panel/portfolio${s === '' ? '' : `?${s}`}`
}

export function portfolioScreen(rows: readonly PortfolioRow[], orgs: readonly OrgRow[], f: PortfolioFilter, active: string): string {
  const t = totals(rows)
  const tile = (k: string, v: string, note: string): string =>
    `<div class="card tile"><div class="kv-k">${escapeHtml(k)}</div><div class="kv-v">${v}</div><div class="note">${note}</div></div>`
  const period = tabs('الفترة', PERIODS.map((d) => ({ label: `${d} يومًا`, href: href(f, { period: d }), current: f.period === d })), { sub: true })
  const platform = tabs('المنصّة', [
    { label: 'كلّ المنصّات', href: href(f, { platform: null }), current: f.platform === null },
    ...PLATFORM_IDS.map((p) => ({ label: platformLabel(p), href: href(f, { platform: p }), current: f.platform === p })),
  ], { sub: true })
  const company = orgs.length < 2 ? '' : tabs('الشركة', [
    { label: 'كلّ الشركات', href: href(f, { org: null }), current: f.org === null },
    ...orgs.map((o) => ({ label: o.name, href: href(f, { org: o.id }), current: f.org === o.id })),
  ], { sub: true })

  const cell = (n: number, bad = false): string => n === 0 ? '<span class="ago">—</span>' : bad ? statusBadge('bad', '▲', String(n)) : `<b>${n}</b>`
  const body = rows.map((r) => `<tr${r.org.id === active ? ' aria-current="true"' : ''}>
      <td><b><bdi>${escapeHtml(r.org.name)}</bdi></b>${r.org.id === active ? ' <span class="chip">الحاليّة</span>' : ''}</td>
      <td>${cell(r.waiting)}</td><td>${cell(r.queued)}</td><td>${cell(r.published)}</td><td>${cell(r.failed, true)}</td>
      <td>${cell(r.engagement)}</td><td>${r.spend === 0 ? '<span class="ago">—</span>' : escapeHtml(money(r.spend))}</td><td>${cell(r.channels)}</td>
      <td><form class="inline" method="POST" action="/panel/orgs/switch"><input type="hidden" name="org" value="${escapeHtml(r.org.id)}">
        <input type="hidden" name="next" value="/panel"><button class="btn btn-secondary btn-sm" type="submit">افتحها</button></form></td></tr>`).join('')

  return `${pageHead('المحفظة', 'كلُّ شركاتك', `ما ينتظر وما خرج وما أُنفق لكلّ شركةٍ في ${f.period} يومًا${f.platform === null ? '' : ` على ${escapeHtml(platformLabel(f.platform as never))}`}. <b>والإنفاقُ لا يُفلتَر بالمنصّة</b>: كلفةُ الكتابة والصور لا منصّةَ لها.`)}
  ${period}${platform}${company}
  <div class="grid tiles c3 mt-4 mb-4">
    ${tile('ينتظر قرارك', String(t.waiting), 'مسوّدةٌ لم تُعتمَد')}
    ${tile('مجدول', String(t.queued), 'ينتظر موعده')}
    ${tile('خرج', String(t.published), `في ${f.period} يومًا`)}
    ${tile('فشل', String(t.failed), t.failed === 0 ? 'لا فشل' : 'افتح الشركة لترى السبب')}
    ${tile('التفاعل', String(t.engagement), 'تفاعلُ اليوم الأوّل لما خرج')}
    ${tile('أُنفق', escapeHtml(money(t.spend)), 'من دفتر الإنفاق')}
  </div>
  ${rows.length === 0 ? '<p class="hint">لا شركةَ في محفظتك بعد.</p>' : `<div class="card"><div class="scroll"><table>
    <thead><tr><th>الشركة</th><th>ينتظر</th><th>مجدول</th><th>خرج</th><th>فشل</th><th>التفاعل</th><th>أُنفق</th><th>قنوات</th><th></th></tr></thead>
    <tbody>${body}</tbody></table></div></div>`}`
}
