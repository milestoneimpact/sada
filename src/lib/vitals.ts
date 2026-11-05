/**
 * القياسُ الميدانيّ لسرعة اللوحة (D-299) — خطّةُ السهولة ٢، الأفقُ ١ · ١.
 *
 * ## لماذا
 *
 * المختبرُ (Playwright على نسخةٍ محلّيّة) يقول «سريع»، والميدانُ لم يُسأل: لا رقمَ واحدًا عن اللوحة على
 * هاتف المالك وشبكته. وweb.dev تعرّف ثلاثةَ أرقامٍ تُقاس **في الميدان** لا في المختبر: أوّلُ محتوًى كبير
 * (LCP)، والاستجابةُ للّمس (INP)، وثباتُ التخطيط (CLS)، وتُحكَم عند المئين ‏75 بحدودٍ معلنة.
 *
 * ## ما يُحفَظ وما لا يُحفَظ
 *
 * المنظّمةُ والمقياسُ والقيمةُ والصفحةُ مطبَّعةً (بلا معرّفات) ونوعُ الجهاز والوقت — **لا هويّةَ ولا عنوانَ ولا
 * وكيلَ مستخدم**. والحكمُ يُحسَب عند القراءة من الحدود، فلا يُخزَّن عمودٌ لا يُقرأ. وسقفٌ يوميّ للصفوف، وما فوق
 * ثلاثين يومًا يُمحى عند الكتابة.
 */
import type { Db } from './tokens'

export const METRICS = ['LCP', 'INP', 'CLS'] as const
export type Metric = (typeof METRICS)[number]
export const DEVICES = ['phone', 'desktop'] as const
export type Device = (typeof DEVICES)[number]
export type Rating = 'good' | 'needs-improvement' | 'poor'

/** حدودُ web.dev عند المئين ‏75: [جيّدٌ حتّى، ضعيفٌ فوق]. LCP وINP بالملّي ثانية، وCLS نسبة. */
export const THRESHOLDS: Readonly<Record<Metric, readonly [number, number]>> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
}
/** نافذةُ القراءة بالأيّام. */
export const WINDOW_DAYS = 7
/** ما فوقها يُمحى عند كلّ كتابة. */
export const RETENTION_DAYS = 30
/** سقفُ الصفوف لكلّ منظّمةٍ في اليوم — ثلاثُ عيّناتٍ لكلّ فتحة، فمئتا فتحة. */
export const DAILY_CAP = 600
/** دون هذا العدد في النافذة لا يُحكَم: عيّنةٌ أو اثنتان ضجيج. */
export const MIN_SAMPLES = 10
/** أعلى قيمةٍ تُقبَل: عشرُ دقائق بالملّي ثانية. ما فوقها عطلٌ في القياس لا بطءٌ في اللوحة. */
export const MAX_VALUE = 600_000

export function isMetric(s: string): s is Metric {
  return (METRICS as readonly string[]).includes(s)
}

export function isDevice(s: string): s is Device {
  return (DEVICES as readonly string[]).includes(s)
}

export function rate(metric: Metric, value: number): Rating {
  const [good, poor] = THRESHOLDS[metric]
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor'
}

/**
 * المسارُ مطبَّعًا: صفحاتُ اللوحة وحدَها، والمعرّفاتُ تُطمَس (`/panel/drafts/8f2…` ← `/panel/drafts/:id`)،
 * والاستعلامُ والمرساةُ يُحذَفان، والطولُ محدود. و`null` لما ليس من اللوحة.
 */
export function pageKey(path: string): string | null {
  const bare = path.split(/[?#]/)[0] ?? ''
  if (!bare.startsWith('/panel')) return null
  const parts = bare.split('/').map((seg) =>
    seg !== '' && (/^\d+$/.test(seg) || /^[0-9a-f-]{8,}$/i.test(seg) || seg.length > 24) ? ':id' : seg,
  )
  return parts.join('/').slice(0, 80)
}

/** المئينُ ‏75 بأقرب رتبة (nearest rank): لا استيفاءَ بين قيمتين. */
export function p75(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(0.75 * sorted.length) - 1)] ?? null
}

export interface VitalSample {
  readonly metric: Metric
  readonly value: number
  readonly page: string
  readonly device: Device
}

/** يحفظ عيّنةً — أو يردّها بلا أثرٍ حين يُبلَغ سقفُ اليوم. */
export async function recordVital(db: Db, org: string, s: VitalSample): Promise<'stored' | 'capped'> {
  const today = await db
    .prepare("SELECT count(*) AS n FROM web_vitals WHERE org_id = ? AND at >= date('now')")
    .bind(org)
    .first<{ n: number }>()
  if ((today?.n ?? 0) >= DAILY_CAP) return 'capped'
  await db
    .prepare('INSERT INTO web_vitals (org_id, metric, value, page, device) VALUES (?, ?, ?, ?, ?)')
    .bind(org, s.metric, s.value, s.page, s.device)
    .run()
  await db
    .prepare("DELETE FROM web_vitals WHERE org_id = ? AND at < datetime('now', ?)")
    .bind(org, `-${RETENTION_DAYS} days`)
    .run()
  return 'stored'
}

export interface MetricSummary {
  readonly p75: number | null
  readonly n: number
  /** `null` حين تقلّ العيّناتُ عن `MIN_SAMPLES`: لا حكمَ على ضجيج. */
  readonly rating: Rating | null
}

export interface VitalsSummary {
  readonly days: number
  readonly samples: number
  readonly byMetric: Readonly<Record<Metric, Readonly<Record<Device, MetricSummary>>>>
  /** أبطأُ صفحةٍ على الهاتف بـ LCP، بثلاث عيّناتٍ فأكثر. */
  readonly slowest: { readonly page: string; readonly p75: number } | null
}

/** قراءةٌ واحدةٌ للنافذة، والحسابُ هنا: الصفوفُ محدودةٌ بالسقف اليوميّ. */
export async function vitalsSummary(db: Db, org: string, days: number = WINDOW_DAYS): Promise<VitalsSummary> {
  const rows = await db
    .prepare("SELECT metric, device, page, value FROM web_vitals WHERE org_id = ? AND at >= datetime('now', ?)")
    .bind(org, `-${days} days`)
    .all<{ metric: Metric; device: Device; page: string; value: number }>()
  const list = rows.results
  const byMetric = {} as Record<Metric, Record<Device, MetricSummary>>
  for (const m of METRICS) {
    byMetric[m] = {} as Record<Device, MetricSummary>
    for (const d of DEVICES) {
      const values = list.filter((r) => r.metric === m && r.device === d).map((r) => r.value)
      const q = p75(values)
      byMetric[m][d] = { p75: q, n: values.length, rating: q !== null && values.length >= MIN_SAMPLES ? rate(m, q) : null }
    }
  }
  const byPage = new Map<string, number[]>()
  for (const r of list) {
    if (r.metric !== 'LCP' || r.device !== 'phone') continue
    byPage.set(r.page, [...(byPage.get(r.page) ?? []), r.value])
  }
  let slowest: VitalsSummary['slowest'] = null
  for (const [page, values] of byPage) {
    if (values.length < 3) continue
    const q = p75(values)
    if (q !== null && (slowest === null || q > slowest.p75)) slowest = { page, p75: q }
  }
  return { days, samples: list.length, byMetric, slowest }
}

/** القيمةُ بوحدتها بلغة المالك: الثواني لما يُرى، والملّي ثانية للّمس، والنسبةُ للثبات. */
export function formatVital(metric: Metric, value: number): string {
  if (metric === 'CLS') return (Math.round(value * 100) / 100).toFixed(2)
  if (metric === 'LCP') return `${(Math.round(value / 100) / 10).toFixed(1)} ثانية`
  return `${Math.round(value)} ملّي ثانية`
}
