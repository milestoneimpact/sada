/**
 * **المحفظة** (D-271) — كلُّ الشركات في جدولٍ واحد: ما ينتظر، وما جُدول، وما خرج وما فشل، والتفاعل، والإنفاق، والقنوات.
 * يُفلتَر بالشركة والمنصّة والفترة، **ويُقصَر على شركات من يراه** (`listOrgs` بـ `whoNow`، D-270).
 *
 * **خمسةُ استعلاماتٍ مجمَّعةٍ بـ `org_id`** لا استعلامٌ لكلّ شركة: محفظةُ عشرين شركةً لا تصير مئةَ نداء. والأرقامُ من مصادرها:
 * «خرج» بأوّل محاولةٍ ناجحةٍ في الفترة، والتفاعلُ نافذةُ ‏24 ساعة (D-253)، والإنفاقُ من `cost_ledger` (D-008) **ولا يُفلتَر بالمنصّة**:
 * كلفةُ الكتابة والصور لا منصّةَ لها في الدفتر، فيُقال ذلك ولا يُقسَم تخمينًا.
 */
import type { Db } from './tokens'
import { listOrgs, type OrgRow } from './tenancy'

export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]

export interface PortfolioRow {
  readonly org: OrgRow
  readonly waiting: number
  readonly queued: number
  readonly published: number
  readonly failed: number
  readonly engagement: number
  readonly spend: number
  readonly channels: number
}

export interface PortfolioFilter {
  readonly period: Period
  readonly platform: string | null
  readonly org: string | null
}

type Count = { org_id: string; n: number }

export async function portfolio(db: Db, f: PortfolioFilter, now: Date): Promise<PortfolioRow[]> {
  const since = new Date(now.getTime() - f.period * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
  const p = f.platform
  const read = <T>(sql: string, ...args: unknown[]): Promise<T[]> =>
    db.prepare(sql).bind(...args).all<T>().then((r) => r.results).catch(() => [])
  const [state, outcome, engage, spend, channels] = await Promise.all([
    read<{ org_id: string; waiting: number; queued: number }>(
      `SELECT org_id, SUM(status = 'draft') AS waiting, SUM(status = 'queued') AS queued FROM posts
        WHERE (?1 IS NULL OR platform = ?1) GROUP BY org_id`, p),
    read<{ org_id: string; published: number; failed: number }>(
      `SELECT p.org_id AS org_id,
              COUNT(DISTINCT CASE WHEN a.status = 'succeeded' THEN p.id END) AS published,
              COUNT(DISTINCT CASE WHEN a.status = 'failed' AND p.status = 'failed' THEN p.id END) AS failed
         FROM posts p JOIN publish_attempts a ON a.post_id = p.id
        WHERE a.at >= ?2 AND (?1 IS NULL OR p.platform = ?1) GROUP BY p.org_id`, p, since),
    read<Count>(
      `SELECT p.org_id AS org_id, SUM(COALESCE(m.reactions, 0) + COALESCE(m.comments, 0) + COALESCE(m.shares, 0)) AS n
         FROM posts p JOIN metrics m ON m.post_id = p.id AND m.window = '24h'
        WHERE p.status = 'published' AND (?1 IS NULL OR p.platform = ?1)
          AND (SELECT min(a.at) FROM publish_attempts a WHERE a.post_id = p.id AND a.status = 'succeeded') >= ?2
        GROUP BY p.org_id`, p, since),
    read<{ org_id: string; t: number }>('SELECT org_id, SUM(total) AS t FROM cost_ledger WHERE at >= ? GROUP BY org_id', since),
    read<Count>(
      `SELECT org_id, COUNT(*) AS n FROM accounts WHERE status = 'active' AND (?1 IS NULL OR platform = ?1) GROUP BY org_id`, p),
  ])
  const by = <T extends { org_id: string }>(rows: readonly T[]): Map<string, T> => new Map(rows.map((r) => [r.org_id, r]))
  const s = by(state), o = by(outcome), e = by(engage), c = by(spend), ch = by(channels)
  return (await listOrgs(db))
    .filter((org) => f.org === null || org.id === f.org)
    .map((org) => ({
      org,
      waiting: Number(s.get(org.id)?.waiting ?? 0),
      queued: Number(s.get(org.id)?.queued ?? 0),
      published: Number(o.get(org.id)?.published ?? 0),
      failed: Number(o.get(org.id)?.failed ?? 0),
      engagement: Number(e.get(org.id)?.n ?? 0),
      spend: Number(c.get(org.id)?.t ?? 0),
      channels: Number(ch.get(org.id)?.n ?? 0),
    }))
}

export function totals(rows: readonly PortfolioRow[]): Omit<PortfolioRow, 'org'> {
  const sum = (k: Exclude<keyof PortfolioRow, 'org'>): number => rows.reduce((t, r) => t + r[k], 0)
  return {
    waiting: sum('waiting'), queued: sum('queued'), published: sum('published'), failed: sum('failed'),
    engagement: sum('engagement'), spend: sum('spend'), channels: sum('channels'),
  }
}
