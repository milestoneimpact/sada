/**
 * **سلسلةُ المفاتيح** (D-349) — لكلّ مهمّةٍ نصّيّةٍ قائمةُ مزوّدين تُجرَّب بها بالترتيب، والمتعذّرُ يُتخطّى بحسب سببه.
 *
 * كانت كلُّ مهمّةٍ تنادي مزوّدًا واحدًا: مفتاحٌ رُفض أو حدٌّ بلغ فتسقط المهمّة، ولو كان في الخزانة مفتاحٌ آخرُ يعمل. هنا:
 *
 * - **الترتيب**: `mine` بالسلسلة كما كتبها المالك، و`cheap` بالأرخص أوّلًا بسعر المزوّد المحفوظ (دخولٌ + خروجٌ لكلّ مليون رمز) —
 *   فما سعرُه صفرٌ يتقدّم، وما لا سعرَ له يتأخّر (كلفتُه لا تُعرف). **والحصّةُ المجّانيّة لـ Workers AI لا تُحسب للنصّ** (تُحسب للصور وحدَها،
 *   `imagePricing.ts`): مزوّدٌ مجّانيٌّ يُعرَف بسعره المحفوظ صفرًا لا غير.
 * - **الحال** (`provider_health`): مفتاحٌ تعذّر يُعلَّم ويُتخطّى مدّةً بسببه، فلا يُدفع ثمنُ محاولةٍ خاسرةٍ في كلّ نداء. والمرفوضُ يُرفع
 *   علمُه حين يُحفظ له مفتاحٌ جديد (`clearHealth`).
 * - **السقف**: ثلاثُ محاولاتٍ للنداء الواحد — لا يطول الانتظار ولا تتراكم الكلفة.
 * - **ما لا ينتقل**: طلبٌ مرفوضٌ لمحتواه، ونموذجٌ غيرُ موجود، وجوابٌ وصل وحوسب عليه (`wantsFallback`). والمحاولةُ نفسُها تمرّ بحارس
 *   المزوّد وسقفه ومفتاحه ودفتره (D-008) — فلكلّ محاولةٍ مدفوعةٍ صفٌّ باسم مفتاحها.
 */
import type { Db } from '../tokens'
import { OWNER_ORG } from '../tenancy'
import { getProvider, type Provider } from '../providers'
import { readRoutes, type ChainOrder } from './routes'
import type { TaskName } from './registry'

export type DownWhy = 'key' | 'limit' | 'busy' | 'cap' | 'nokey'

/** كم يُتخطّى المتعذّرُ بسببه — بالدقائق. والسقفُ اليوميّ إلى منتصف الليل UTC (يُحسب عند الكتابة). */
export const DOWN_MINUTES: Readonly<Record<Exclude<DownWhy, 'cap'>, number>> = { key: 24 * 60, nokey: 24 * 60, limit: 5, busy: 2 }

/** أكثرُ ما يُجرَّب في النداء الواحد. */
export const MAX_ATTEMPTS = 3

export interface Down { readonly why: DownWhy; readonly until: string; readonly detail: string | null }

/** حالُ المفاتيح المتعذّرة الآن — وجدولٌ لم يُرحَّل: لا شيءَ متعذّر. */
export async function readHealth(db: Db, now: Date): Promise<ReadonlyMap<string, Down>> {
  const rows = await db.prepare('SELECT provider, why, down_until, detail FROM provider_health WHERE org_id = ? AND down_until > ?')
    .bind(OWNER_ORG, now.toISOString())
    .all<{ provider: string; why: DownWhy; down_until: string; detail: string | null }>()
    .then((r) => r.results).catch(() => [])
  return new Map(rows.map((r) => [r.provider, { why: r.why, until: r.down_until, detail: r.detail }]))
}

export async function markDown(db: Db, provider: string, why: DownWhy, now: Date, detail: string | null = null): Promise<void> {
  const until = why === 'cap'
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
    : new Date(now.getTime() + DOWN_MINUTES[why] * 60_000).toISOString()
  await db.prepare(`INSERT INTO provider_health (org_id, provider, why, down_until, detail) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (org_id, provider) DO UPDATE SET why = excluded.why, down_until = excluded.down_until, detail = excluded.detail, updated_at = datetime('now')`)
    .bind(OWNER_ORG, provider, why, until, detail === null ? null : detail.slice(0, 200)).run().catch(() => undefined)
}

/** مفتاحٌ جديدٌ حُفظ أو المالكُ أعاد التشغيل: يُرفع علمُ التعذّر فيُجرَّب من جديد. */
export async function clearHealth(db: Db, provider: string): Promise<void> {
  await db.prepare('DELETE FROM provider_health WHERE org_id = ? AND provider = ?').bind(OWNER_ORG, provider).run().catch(() => undefined)
}

/** سببُ التعذّر من رمز الحالة — `null` لما لا يُصلحه مزوّدٌ آخر. */
export function downWhy(status: number): DownWhy | null {
  if (status === 401 || status === 403) return 'key'
  if (status === 429) return 'limit'
  if (status === 500 || status === 502 || status === 503 || status === 529) return 'busy'
  return null
}

/** سعرُ المليون (دخولٌ + خروج) — و`null` إن لم يُضبط أحدُهما. */
export function unitPrice(p: Pick<Provider, 'priceIn' | 'priceOut'>): number | null {
  return p.priceIn === null || p.priceOut === null ? null : p.priceIn + p.priceOut
}

/** الترتيب: `mine` كما هو، و`cheap` بالسعر صعودًا وما لا سعرَ له آخرًا (والتعادلُ يُبقي الترتيبَ المكتوب). */
export function orderChain<T extends Pick<Provider, 'priceIn' | 'priceOut'>>(list: readonly T[], order: ChainOrder): T[] {
  if (order === 'mine') return [...list]
  return list.map((p, i) => ({ p, i, price: unitPrice(p) }))
    .sort((a, b) => (a.price === null ? 1 : 0) - (b.price === null ? 1 : 0) || (a.price ?? 0) - (b.price ?? 0) || a.i - b.i)
    .map((x) => x.p)
}

export interface Candidate { readonly provider: Provider; readonly model: string; readonly down: Down | null }

/**
 * المرشّحون بترتيبهم لمهمّة: الأوّلُ ثمّ السلسلة، المفعَّلون وحدَهم، مرتَّبين بنمط المهمّة — **والمتعذّرون آخرًا** لا محذوفين: إن تعذّر
 * الجميعُ جُرّب أقربُهم عودةً، فلا تسقط المهمّةُ لعلمٍ قديم. و`override`: مزوّدٌ بعينه للمقارنة (D-244) — وحدَه بلا سلسلة.
 */
export async function candidates(db: Db, task: TaskName, now: Date, override?: string): Promise<Candidate[]> {
  const route = (await readRoutes(db)).find((r) => r.task === task)!
  const names = override !== undefined && override !== '' && override !== route.provider
    ? [override]
    : [route.provider, ...route.chain.filter((n) => n !== route.provider)]
  const health = await readHealth(db, now)
  const found: Candidate[] = []
  for (const name of [...new Set(names)]) {
    const provider = await getProvider(db, name)
    if (provider === null || !provider.enabled) continue
    // ‏النموذجُ: الأوّلُ بنموذج توجيهه، وغيرُه بنموذج صفّه المحفوظ (فارغًا يُملأ عند النداء)
    found.push({ provider, model: name === route.provider ? route.model : provider.model ?? '', down: health.get(name) ?? null })
  }
  const ordered = orderChain(found.map((c) => ({ ...c, priceIn: c.provider.priceIn, priceOut: c.provider.priceOut })), override !== undefined && override !== '' && override !== route.provider ? 'mine' : route.order)
  const up = ordered.filter((c) => c.down === null)
  const down = ordered.filter((c) => c.down !== null).sort((a, b) => a.down!.until.localeCompare(b.down!.until))
  return [...up, ...down].map(({ provider, model, down: d }) => ({ provider, model, down: d }))
}

/** ما تقوله محاولةٌ واحدة: نجحت، أو تعذّر مزوّدُها فيُنتقل (بسببه)، أو فشلت فشلًا لا يُصلحه غيرُه فيُتوقّف. */
export type Attempt<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'next'; readonly why: DownWhy; readonly reason: string; readonly cost?: number }
  | { readonly kind: 'stop'; readonly reason: string; readonly retryable: boolean; readonly cost?: number }

export type ChainResult<T> =
  | { readonly kind: 'ok'; readonly value: T; readonly provider: string; readonly tried: readonly string[] }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean; readonly cost: number; readonly tried: readonly string[] }

/**
 * **جرّب السلسلة**: كلُّ مرشّحٍ بمحاولته حتّى ينجح أحدُها أو تُستنفد ثلاثٌ أو يتوقّف فشلٌ لا ينتقل. والمتعذّرُ يُعلَّم بسببه، والكلفةُ
 * التي وقعت في محاولةٍ فاشلة تُجمع (سُجّلت في دفترها داخل المحاولة) فلا تُقال صفرًا.
 */
export async function runChain<T>(db: Db, list: readonly Candidate[], now: Date, attempt: (c: Candidate) => Promise<Attempt<T>>): Promise<ChainResult<T>> {
  const tried: string[] = []
  const reasons: string[] = []
  const whys: DownWhy[] = []
  let cost = 0
  for (const c of list.slice(0, MAX_ATTEMPTS)) {
    tried.push(c.provider.name)
    const out = await attempt(c)
    if (out.kind === 'ok') {
      // ‏نجح بعد تعذّر: يُرفع علمُه — فالحدُّ القصيرُ لا يُبقيه متخطًّى بلا سبب
      if (c.down !== null) await clearHealth(db, c.provider.name)
      return { kind: 'ok', value: out.value, provider: c.provider.name, tried }
    }
    cost += out.cost ?? 0
    reasons.push(c.provider.label + ': ' + out.reason)
    if (out.kind === 'stop') return { kind: 'failed', reason: reasons.join(' — ثمّ '), retryable: out.retryable, cost, tried }
    whys.push(out.why)
    await markDown(db, c.provider.name, out.why, now, out.reason)
  }
  return {
    kind: 'failed',
    reason: list.length === 0 ? 'لا مزوّدَ مفعَّلًا لهذه المهمّة' : reasons.join(' — ثمّ '),
    // ‏حدٌّ أو انشغالٌ أو سقف: يُعاد لاحقًا. وكلُّها مفتاحٌ مرفوضٌ أو غائب: لا يُعاد حتّى يُصلَح — فلا يدور الطابورُ على ما لن ينجح
    retryable: whys.some((w) => w === 'limit' || w === 'busy' || w === 'cap'),
    cost, tried,
  }
}

/** سببُ الانتقال من خطأ النداء — أو `null`: فشلٌ يُتوقّف عنده. والجوابُ الذي حوسب عليه لا ينتقل. */
export function nextFrom(error: unknown): DownWhy | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null
  if ('spent' in error && (error as { spent: unknown }).spent !== undefined && (error as { spent: unknown }).spent !== null) return null
  return downWhy(Number((error as { status: unknown }).status))
}
