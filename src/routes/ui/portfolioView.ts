/**
 * **المحفظة** (D-272) — كلُّ شركاتك في شاشةٍ واحدة تُقرأ في ثلاث ثوانٍ: ستّةُ أرقامٍ مجموعةً فوق، ثمّ صفٌّ لكلّ شركةٍ بأرقامها وزرِّ
 * «افتحها». والفلاترُ روابطُ (الفترة · المنصّة · الشركة) تعمل بلا سكربت وتُحفظ في العنوان.
 */
import { escapeHtml } from './escape'
import { pageHead } from './parts'
import { filterBar, pctChange, statTile } from './components/filterbar'
import { LOGOS } from './logos'
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

export function portfolioScreen(rows: readonly PortfolioRow[], orgs: readonly OrgRow[], f: PortfolioFilter, active: string, before: readonly PortfolioRow[] = []): string {
  const t = totals(rows)
  const p = totals(before)
  const bar = filterBar([
    { kind: 'seg', label: 'الفترة', options: PERIODS.map((d) => ({ label: `${d} يومًا`, href: href(f, { period: d }), current: f.period === d })) },
    { kind: 'logos', label: 'المنصّة', options: [
      { label: 'كلّ المنصّات', href: href(f, { platform: null }), current: f.platform === null },
      ...PLATFORM_IDS.map((x) => ({ label: platformLabel(x), href: href(f, { platform: x }), current: f.platform === x, logo: LOGOS[x] ?? '' })),
    ] },
    ...(orgs.length < 2 ? [] : [{ kind: 'pick' as const, label: 'الشركة', options: [
      { label: 'كلّ الشركات', href: href(f, { org: null }), current: f.org === null },
      ...orgs.map((o) => ({ label: o.name, href: href(f, { org: o.id }), current: f.org === o.id })),
    ] }]),
  ], 'فلتر المحفظة')

  // ‏الأحوجُ أوّلًا: ما ينتظر قرارك وما فشل، ثمّ الحاليّة
  const need = (r: PortfolioRow): number => r.waiting + r.failed * 2
  const sorted = [...rows].sort((a, b) => need(b) - need(a) || (a.org.id === active ? -1 : b.org.id === active ? 1 : 0))
  /**
   * **بطاقةٌ لكلّ شركة** (Metricool · Sprout): الاسمُ، ثمّ سطرُ أرقامٍ صغيرٍ بما فيه شيءٌ وحدَه، ثمّ «افتحها». كانت جدولًا يصير على
   * الهاتف سبعةَ أسطرٍ لكلّ شركةٍ أغلبُها «—».
   */
  const fact = (k: string, n: number | string, tone = ''): string => `<span class="oc-f"${tone === '' ? '' : ` data-tone="${tone}"`}><b class="num">${n}</b>${escapeHtml(k)}</span>`
  const cards = sorted.map((r) => {
    const facts = [
      r.waiting > 0 ? fact('ينتظر قرارك', r.waiting, 'warn') : '',
      r.failed > 0 ? fact('فشل', r.failed, 'bad') : '',
      r.queued > 0 ? fact('مجدول', r.queued) : '',
      r.published > 0 ? fact('خرج', r.published) : '',
      r.engagement > 0 ? fact('تفاعل', r.engagement) : '',
      r.spend > 0 ? fact('أُنفق', escapeHtml(money(r.spend))) : '',
    ].filter((x) => x !== '')
    return `<article class="card card-inset oc"${r.org.id === active ? ' aria-current="true"' : ''}>
      <div class="oc-h"><b><bdi>${escapeHtml(r.org.name)}</bdi></b>${r.org.id === active ? '<span class="chip">الحاليّة</span>' : ''}
        <span class="oc-ch">${r.channels === 0 ? 'لا قنوات' : `${r.channels} ${r.channels === 1 ? 'قناة' : 'قنوات'}`}</span></div>
      <div class="oc-fs">${facts.length === 0 ? '<span class="oc-quiet">هادئة — لا شيء ينتظرك</span>' : facts.join('')}</div>
      <form method="POST" action="/panel/orgs/switch"><input type="hidden" name="org" value="${escapeHtml(r.org.id)}">
        <input type="hidden" name="next" value="/panel"><button class="btn ${r.waiting + r.failed > 0 ? 'btn-primary' : 'btn-secondary'} btn-sm" type="submit">افتحها</button></form>
    </article>`
  }).join('')

  return `${pageHead('المحفظة', 'كلُّ شركاتك', '')}
  ${bar}
  <div class="kpis">
    ${statTile({ label: 'ينتظر قرارك', value: String(t.waiting), note: t.queued === 0 ? 'لا شيء مجدول' : `و${t.queued} مجدولًا` })}
    ${statTile({ label: 'خرج', value: String(t.published), delta: pctChange(t.published, p.published), note: t.failed === 0 ? `في ${f.period} يومًا` : `وفشل ${t.failed}` })}
    ${statTile({ label: 'التفاعل', value: String(t.engagement), delta: pctChange(t.engagement, p.engagement), note: 'في اليوم الأوّل' })}
    ${statTile({ label: 'أُنفق', value: escapeHtml(money(t.spend)), delta: pctChange(Math.round(t.spend * 100), Math.round(p.spend * 100)), good: 'down', note: f.platform === null ? 'كلُّ المنصّات' : 'لكلّ المنصّات — لا يُقسَم' })}
  </div>
  ${rows.length === 0 ? '<p class="hint">لا شركةَ في محفظتك بعد.</p>' : `<div class="oc-grid">${cards}</div>`}`
}
