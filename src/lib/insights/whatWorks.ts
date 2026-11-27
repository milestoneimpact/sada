/**
 * «ما ينجح» — **ما يقوله تاريخُ حسابك عن الوقت والشكل والطول، مقيسًا أو لا يُقال** (D-253).
 *
 * يمدّ ساعاتِ الذروة (`schedule/peak.ts`، D-106) إلى أربعة أبعاد: **اليوم** و**فترة اليوم** بمنطقة المالك،
 * و**الشكل** (نصّ · صورة · فيديو) و**الطول**. والقاعدةُ قاعدتُها: لا حكمَ قبل ثمانية منشوراتٍ مقيسة،
 * ولا خانةَ تُرشَّح بأقلّ من ثلاثة، والوسيطُ لا المتوسّط.
 *
 * ## والتوقّعُ تقديرٌ يقول عيّنتَه
 *
 * لكلّ خانةٍ «درجةٌ» تنكمش نحو وسيط الحساب كلِّه بقدر قلّة منشوراتها:
 * `(n·وسيطها + K·الوسيطُ العامّ) ÷ (n + K)` بـ `K = 3`. فخانةٌ من ثلاثة منشوراتٍ لا تقفز فوق خانةٍ من عشرين
 * بمنشورٍ انتشر. **وأفضلُ موعدٍ** حاصلُ ضرب نسبتَي اليوم والفترة في الوسيط العامّ — تقديرٌ يفترض أنّ اليوم
 * والفترة مستقلّان، ويُقال بعيّنته لا رقمًا مطلقًا.
 *
 * والتفاعلُ (إعجابٌ وتعليقٌ ومشاركة) في نافذة ‏٢٤ ساعة لا الظهور: LinkedIn لا يعطي الظهورَ لمنشور عضو (D-048).
 */
import type { Db } from '../tokens'
import { localParts } from '../time/zone'
import { parseSqliteUtc } from '../format'

export const MIN_POSTS = 8
export const PER_BUCKET = 3
const K = 3

export type Format = 'text' | 'image' | 'video'

export interface PostFact {
  readonly id: string
  readonly platform: string
  readonly publishedAt: string
  readonly format: Format
  readonly chars: number
  readonly engagement: number
  readonly impressions: number | null
  readonly text: string
}

export interface Bucket {
  readonly key: string
  readonly label: string
  readonly posts: number
  readonly median: number
  /** الوسيطُ منكمشًا نحو العامّ بقدر العيّنة. */
  readonly score: number
  /** الدرجةُ ÷ الوسيط العامّ — ‏1 يعني «كالمعتاد». */
  readonly lift: number
}

export interface Dimension {
  readonly title: string
  readonly buckets: readonly Bucket[]
  /** أعلى خانةٍ بلغت ثلاثة منشورات — أو `null`. */
  readonly best: Bucket | null
}

export interface WhatWorks {
  readonly samples: number
  readonly overall: number
  /** `null` حين لم تبلغ العيّنةُ ثمانية — والسببُ في `why`. */
  readonly dims: readonly Dimension[] | null
  readonly slot: { readonly label: string; readonly expected: number; readonly posts: number } | null
  readonly advice: readonly string[]
  readonly why: string | null
}

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const BANDS: readonly { key: string; label: string; from: number; to: number }[] = [
  { key: 'dawn', label: 'الفجر (4–9)', from: 4, to: 9 },
  { key: 'morning', label: 'الضحى (9–12)', from: 9, to: 12 },
  { key: 'noon', label: 'الظهيرة (12–16)', from: 12, to: 16 },
  { key: 'evening', label: 'المساء (16–20)', from: 16, to: 20 },
  { key: 'night', label: 'الليل (20–4)', from: 20, to: 28 },
]
const FORMATS: Readonly<Record<Format, string>> = { text: 'نصّ', image: 'صورة', video: 'فيديو' }
const LENGTHS: readonly { key: string; label: string; max: number }[] = [
  { key: 'short', label: 'قصير (حتّى 300 حرف)', max: 300 },
  { key: 'mid', label: 'متوسّط (300–1200)', max: 1200 },
  { key: 'long', label: 'طويل (فوق 1200)', max: Infinity },
]

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

export function bandOf(hour: number): (typeof BANDS)[number] {
  const h = hour < 4 ? hour + 24 : hour
  return BANDS.find((b) => h >= b.from && h < b.to) ?? BANDS[4]!
}

function dimension(title: string, facts: readonly PostFact[], keyOf: (f: PostFact) => { key: string; label: string }, overall: number, order: readonly string[]): Dimension {
  const groups = new Map<string, { label: string; xs: number[] }>()
  for (const f of facts) {
    const { key, label } = keyOf(f)
    const g = groups.get(key) ?? { label, xs: [] }
    g.xs.push(f.engagement)
    groups.set(key, g)
  }
  const buckets = order
    .filter((k) => groups.has(k))
    .map((key) => {
      const g = groups.get(key)!
      const med = median(g.xs)
      const score = (g.xs.length * med + K * overall) / (g.xs.length + K)
      return { key, label: g.label, posts: g.xs.length, median: med, score, lift: overall === 0 ? 1 : score / overall }
    })
  const ranked = buckets.filter((b) => b.posts >= PER_BUCKET).sort((a, b) => b.score - a.score)
  return { title, buckets, best: ranked[0] ?? null }
}

/** «2.1 ضعف» أو «أكثر بـ35٪» — والفرقُ دون ‏20٪ لا يُقال: ضجيجٌ لا نمط. */
function ratio(a: number, b: number): string | null {
  if (b <= 0 || a <= 0) return null
  const r = a / b
  if (r < 1.2) return null
  return r >= 2 ? `نحو ${r.toFixed(1)} ضعف` : `أكثر بـ${Math.round((r - 1) * 100)}٪ من`
}

/** يحسب «ما ينجح» من وقائعَ قُرئت — **دالّةٌ صرفة**، والاستعلامُ في `readWhatWorks`. */
export function whatWorks(facts: readonly PostFact[], zone: string | null): WhatWorks {
  const samples = facts.length
  if (samples < MIN_POSTS) {
    return { samples, overall: 0, dims: null, slot: null, advice: [], why: `يُقال بعد ${MIN_POSTS} منشورات مقيسة — قِيس ${samples}` }
  }
  const overall = median(facts.map((f) => f.engagement))
  const parts = new Map(facts.map((f) => [f.id, localParts(parseSqliteUtc(f.publishedAt) ?? new Date(0), zone)]))
  const day = dimension('اليوم', facts, (f) => { const d = parts.get(f.id)!.weekday; return { key: String(d), label: DAYS[d]! } },
    overall, ['6', '0', '1', '2', '3', '4', '5'])
  const band = dimension('فترة اليوم', facts, (f) => { const b = bandOf(parts.get(f.id)!.hour); return { key: b.key, label: b.label } },
    overall, BANDS.map((b) => b.key))
  const format = dimension('الشكل', facts, (f) => ({ key: f.format, label: FORMATS[f.format] }), overall, ['text', 'image', 'video'])
  const length = dimension('الطول', facts, (f) => { const l = LENGTHS.find((x) => f.chars <= x.max)!; return { key: l.key, label: l.label } },
    overall, LENGTHS.map((l) => l.key))

  const slot = day.best !== null && band.best !== null
    ? { label: `${day.best.label} في ${band.best.label}`, expected: Math.round(overall * day.best.lift * band.best.lift), posts: day.best.posts + band.best.posts }
    : null

  const advice: string[] = []
  const compare = (d: Dimension, noun: string): void => {
    const ok = d.buckets.filter((b) => b.posts >= PER_BUCKET).sort((a, b) => b.score - a.score)
    if (ok.length < 2) return
    const top = ok[0]!, low = ok[ok.length - 1]!
    const r = ratio(top.score, low.score)
    if (r === null) return
    advice.push(r.startsWith('نحو')
      ? `${noun} «${top.label}» تجلب ${r} تفاعل «${low.label}» (${top.posts} و${low.posts} منشورًا).`
      : `${noun} «${top.label}» تفاعلُها ${r} «${low.label}» (${top.posts} و${low.posts} منشورًا).`)
  }
  compare(format, 'منشوراتُ')
  compare(length, 'المنشوراتُ')
  compare(day, 'منشوراتُ يوم')
  compare(band, 'منشوراتُ')
  return { samples, overall, dims: [day, band, format, length], slot, advice, why: null }
}

/** الوقائعُ من القاعدة: كلُّ منشورٍ نُشر وقِيس في نافذة ‏٢٤ ساعة، بمنصّته أو للمنصّات كلّها. */
export async function readFacts(db: Db, org: string | null, platform: string | null): Promise<PostFact[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS id, p.platform AS platform, min(pa.at) AS publishedAt, p.text AS text,
              CASE WHEN EXISTS (SELECT 1 FROM media md WHERE md.post_id = p.id AND md.mime LIKE 'video/%') THEN 'video'
                   WHEN EXISTS (SELECT 1 FROM media md WHERE md.post_id = p.id AND md.mime LIKE 'image/%' AND md.status = 'ready') THEN 'image'
                   ELSE 'text' END AS format,
              COALESCE(m.reactions, 0) + COALESCE(m.comments, 0) + COALESCE(m.shares, 0) AS engagement,
              m.impressions AS impressions
         FROM posts p
         JOIN publish_attempts pa ON pa.post_id = p.id AND pa.status = 'succeeded'
         JOIN metrics m ON m.post_id = p.id AND m.window = '24h'
        WHERE (?1 IS NULL OR p.org_id = ?1) AND (?2 IS NULL OR p.platform = ?2)
        GROUP BY p.id
        ORDER BY publishedAt DESC
        LIMIT 2000`,
    )
    .bind(org, platform)
    .all<{ id: string; platform: string; publishedAt: string; text: string; format: Format; engagement: number; impressions: number | null }>()
    .catch(() => ({ results: [] as never[] }))
  return results.map((r) => ({ ...r, chars: [...(r.text ?? '')].length }))
}
