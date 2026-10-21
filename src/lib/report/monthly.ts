/**
 * **تقريرُ الشهر لكلّ عميل** (D-262 · AGENCY-PLAN و-٦) — ما خرج، وما نجح، وما أُنفق، وما هو قادم. في صفحةٍ واحدة تُطبع PDF.
 *
 * **وكلُّ رقمٍ من القاعدة بمنظّمته**: المنشورُ «خرج» بأوّل محاولةٍ ناجحة (`publish_attempts`)، والتفاعلُ نافذةُ ‏24 ساعة كما في
 * «ما ينجح» (D-253)، والإنفاقُ من `cost_ledger` (D-008). **وما لم يُقَس لا يُقال**: منشورٌ بلا قياسٍ يُعدّ خارجًا ولا يدخل الترتيب،
 * وأرجحُ موعدٍ لا يُذكر قبل ثمانية منشوراتٍ مقيسة.
 */
import type { Db } from '../tokens'
import { readFacts, whatWorks, type PostFact } from '../insights/whatWorks'

export interface MonthlyReport {
  readonly month: string
  readonly published: Readonly<Record<string, number>>
  readonly measured: number
  readonly engagement: number
  readonly top: readonly PostFact[]
  readonly spend: number
  readonly spendBy: Readonly<Record<string, number>>
  readonly upcoming: number
  readonly slot: string | null
  readonly why: string | null
}

/** `YYYY-MM` صالحٌ أو الشهرُ الجاري. */
export function monthOf(raw: string | undefined, now: Date): string {
  return raw !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : now.toISOString().slice(0, 7)
}

export function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + by)
  return d.toISOString().slice(0, 7)
}

export async function monthlyReport(db: Db, org: string, month: string, zone: string | null): Promise<MonthlyReport> {
  const from = `${month}-01 00:00:00`
  const to = `${shiftMonth(month, 1)}-01 00:00:00`
  const [out, costs, next, facts] = await Promise.all([
    db.prepare(`SELECT platform, COUNT(*) AS n FROM (
                  SELECT p.platform AS platform, min(pa.at) AS first FROM posts p
                    JOIN publish_attempts pa ON pa.post_id = p.id AND pa.status = 'succeeded'
                   WHERE p.org_id = ? GROUP BY p.id) WHERE first >= ? AND first < ? GROUP BY platform`)
      .bind(org, from, to).all<{ platform: string; n: number }>().then((r) => r.results).catch(() => []),
    db.prepare('SELECT provider, SUM(total) AS t FROM cost_ledger WHERE org_id = ? AND at >= ? AND at < ? GROUP BY provider')
      .bind(org, from, to).all<{ provider: string; t: number }>().then((r) => r.results).catch(() => []),
    db.prepare("SELECT COUNT(*) AS n FROM posts WHERE org_id = ? AND status = 'queued' AND scheduled_at >= ?")
      .bind(org, to).first<{ n: number }>().catch(() => null),
    readFacts(db, org, null),
  ])
  const inMonth = facts.filter((f) => f.publishedAt >= from && f.publishedAt < to)
  const works = whatWorks(facts, zone)
  const spendBy = Object.fromEntries(costs.map((c) => [c.provider, c.t]))
  return {
    month,
    published: Object.fromEntries(out.map((r) => [r.platform, r.n])),
    measured: inMonth.length,
    engagement: inMonth.reduce((s, f) => s + f.engagement, 0),
    top: [...inMonth].sort((a, b) => b.engagement - a.engagement).slice(0, 3),
    spend: costs.reduce((s, c) => s + c.t, 0),
    spendBy,
    upcoming: next?.n ?? 0,
    slot: works.slot?.label ?? null,
    why: works.slot === null ? works.why : null,
  }
}

/**
 * **التقريرُ نصًّا للبريد** (D-268) — الأرقامُ نفسُها التي تُعرض، سطرًا سطرًا، بلا HTML: يُقرأ في أيّ بريدٍ وعلى أيّ هاتف.
 * ولا رابطَ يُبنى من مدخل، ولا رمزَ ولا سرّ — ما يخرج إلى البريد هو ما في الصفحة وحدَه.
 */
export function reportText(r: MonthlyReport, orgName: string, label: (platform: string) => string, money: (usd: number) => string): string {
  const out = Object.values(r.published).reduce((s, n) => s + n, 0)
  const lines = [
    `تقرير ${r.month} — ${orgName}`,
    '',
    `خرج: ${out}${out === 0 ? '' : ` (${Object.entries(r.published).map(([p, n]) => `${label(p)} ${n}`).join('، ')})`}`,
    `التفاعل: ${r.engagement} من ${r.measured} منشورًا قِيس`,
    `أُنفق: ${money(r.spend)}`,
    `قادم: ${r.upcoming} مجدولًا بعد هذا الشهر`,
    `أرجح موعد: ${r.slot ?? (r.why ?? 'لم يُقَس بعد')}`,
  ]
  if (r.top.length > 0) {
    lines.push('', 'أنجح ثلاثة:')
    r.top.forEach((f, i) => lines.push(`${i + 1}. ${label(f.platform)} — ${f.engagement} تفاعلًا — ${[...f.text].slice(0, 80).join('')}`))
  }
  lines.push('', 'وما لم يُقَس لا يُقال.')
  return lines.join('\n')
}
