/**
 * حراسةُ المفاتيح (D-348): اختبارٌ يُحفظ، وتاريخٌ يُقرأ، وعطلٌ يُشتقّ منه إشعار.
 *
 * ## لماذا
 *
 * كان الاختبار يكتب «نجح» وحده في `providers.verified_at`. فمفتاحٌ يُرفض غدًا يبقى «اختُبر قبل يوم» حتّى تفشل به مهمّةٌ
 * حقيقيّة — ملفٌّ لا يُحلَّل أو خطّةٌ لا تُبنى — وهذا ما وقع بـ401 من Anthropic. فصار كلُّ اختبارٍ صفًّا في `provider_checks`:
 * يدويٌّ من اللوحة أو يوميٌّ من دورة الفجر، بنتيجته ورمزه وزمنه.
 *
 * ## والكلفة صفر
 *
 * الاختبارُ قراءةُ قائمة نماذج (`verifyKey` و`verifyCompat`) لا توليد، فلا رموزَ تُحسب ولا صفَّ في `cost_ledger` (D-008
 * يخصّ المدفوع). **ولا يُحفظ من جواب المزوّد نصّ**: `detail` من شرحنا نحن.
 */
import type { Db } from '../tokens'
import { listProviders, markVerified, type Provider } from '../providers'
import { verifyKey } from './verify'
import { verifyCompat } from './openaiCompat'

export type CheckSource = 'panel' | 'daily'

export interface CheckResult {
  readonly provider: string
  readonly ok: boolean
  readonly status: number | null
  readonly ms: number
  readonly detail: string
  readonly source: CheckSource
  readonly at: string
}

/** يحلّ مفتاحَ مزوّد من مصدره (الخزانة ثمّ سرّ Worker) — يُمرَّر من الطبقة التي تعرف أسماء الأسرار. */
export type KeyFor = (provider: Provider) => Promise<string | null>

/** ‏كم يُحفظ من التاريخ: ما يكفي لأعمدة الأسبوع وزيادة، ولا يتضخّم الجدول. */
const KEEP_DAYS = 30

/** يختبر مفتاحًا واحدًا، ويكتب صفّه، ويُثبت «اختُبر» إن نجح. لا يرمي. */
export async function testProviderKey(
  db: Db,
  provider: Provider,
  key: string | null,
  source: CheckSource,
  fetchImpl?: typeof fetch,
  now: () => number = Date.now,
): Promise<CheckResult> {
  const started = now()
  const result = key === null || key.trim() === ''
    ? { ok: false, detail: 'لا مفتاح لهذا المزوّد', status: null as number | null }
    : provider.kind === 'anthropic'
      ? await verifyKey('anthropic', key, fetchImpl)
      : provider.baseUrl === null
        ? { ok: false, detail: 'لا عنوان لهذا المزوّد', status: null as number | null }
        : await verifyCompat(provider.baseUrl, key, fetchImpl)
  const ms = Math.max(0, Math.round(now() - started))
  const status = 'status' in result ? result.status ?? null : null
  const at = new Date(now()).toISOString().replace('T', ' ').slice(0, 19)

  try {
    await db
      .prepare(
        // ‏إعدادٌ عامّ: المزوّدون يسكنون منظّمةَ المالك (D-277)
        `INSERT INTO provider_checks (provider, ok, status, ms, detail, source, at, org_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'org_owner')`,
      )
      .bind(provider.name, result.ok ? 1 : 0, status, ms, result.detail, source, at)
      .run()
    await db
      .prepare(`DELETE FROM provider_checks WHERE org_id = 'org_owner' AND at < datetime('now', ?1)`)
      .bind(`-${KEEP_DAYS} days`)
      .run()
  } catch (error) {
    // ‏سجلٌّ لم يُكتب لا يُسقط الاختبار: النتيجةُ تُقال للمالك على أيّ حال
    console.warn({ job: 'provider-check', failed: String(error) })
  }
  if (result.ok) await markVerified(db, provider.name).catch(() => undefined)

  return { provider: provider.name, ok: result.ok, status, ms, detail: result.detail, source, at }
}

/**
 * دورةُ الفجر: كلُّ مزوّدٍ **مفعَّلٍ له مفتاح** يُختبر مرّة. والمعطَّلُ لا يُختبر — المالكُ أوقفه عمدًا، وإشعارٌ عنه ضجيج.
 * ومزوّدٌ بلا مفتاح لا يُختبر أيضًا: «لا مفتاح» حالٌ تُرى في اللوحة، لا عطلٌ وقع الليلة.
 */
export async function dailyChecks(db: Db, keyFor: KeyFor, fetchImpl?: typeof fetch): Promise<CheckResult[]> {
  const out: CheckResult[] = []
  for (const provider of await listProviders(db)) {
    if (!provider.enabled) continue
    const key = await keyFor(provider)
    if (key === null) continue
    out.push(await testProviderKey(db, provider, key, 'daily', fetchImpl))
  }
  return out
}

export interface CheckRow {
  readonly provider: string
  readonly ok: boolean
  readonly status: number | null
  readonly ms: number | null
  readonly detail: string
  readonly source: CheckSource
  readonly at: string
}

/** آخرُ الاختبارات لكلّ مزوّد، الأقدمُ أوّلًا — لأعمدة «آخر سبعة» في اللوحة. */
export async function recentChecks(db: Db, perProvider = 7): Promise<Record<string, CheckRow[]>> {
  try {
    const { results } = await db
      .prepare(
        `SELECT provider, ok, status, ms, detail, source, at FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY provider ORDER BY at DESC, id DESC) AS n
             FROM provider_checks WHERE org_id = 'org_owner'
         ) WHERE n <= ?1 ORDER BY provider, at ASC, id ASC`,
      )
      .bind(perProvider)
      .all<{ provider: string; ok: number; status: number | null; ms: number | null; detail: string; source: CheckSource; at: string }>()
    const out: Record<string, CheckRow[]> = {}
    for (const r of results) (out[r.provider] ??= []).push({ ...r, ok: r.ok === 1 })
    return out
  } catch {
    return {}
  }
}

export interface FailingProvider {
  readonly provider: string
  readonly label: string
  readonly status: number | null
  readonly detail: string
  readonly at: string
}

/**
 * ‏**ما يُشتقّ منه الإشعار**: مزوّدٌ مفعَّلٌ آخرُ اختبارٍ له فشل. يزول وحده بأوّل نجاح، فلا جدولَ أحداثٍ يُنسى تنظيفه
 * (القاعدةُ نفسُها في `notices.ts`). ومرجعُه آخرُ اختبارٍ فاشل، فإشعارٌ قُرئ لا يعود إلّا بفشلٍ جديدٍ بعد نجاح.
 */
export async function failingProviders(db: Db): Promise<FailingProvider[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT c.provider, p.label, c.status, c.detail, c.at FROM provider_checks c
           JOIN providers p ON p.name = c.provider AND p.org_id = c.org_id
          WHERE c.org_id = 'org_owner' AND p.enabled = 1 AND c.ok = 0
            AND c.id = (SELECT MAX(id) FROM provider_checks x WHERE x.provider = c.provider AND x.org_id = c.org_id)
          ORDER BY c.at DESC`,
      )
      .all<FailingProvider>()
    return results
  } catch {
    return []
  }
}

/** ‏مرجعٌ ثابتٌ للعطل: يبدأ من أوّل فشلٍ بعد آخر نجاح، فلا يتبدّل كلَّ ليلةٍ والعطلُ نفسُه قائم. */
export async function failingSince(db: Db, provider: string): Promise<string | null> {
  try {
    const row = await db
      .prepare(
        `SELECT MIN(at) AS since FROM provider_checks
          WHERE org_id = 'org_owner' AND provider = ?1 AND ok = 0
            AND id > COALESCE((SELECT MAX(id) FROM provider_checks WHERE org_id = 'org_owner' AND provider = ?1 AND ok = 1), 0)`,
      )
      .bind(provider)
      .first<{ since: string | null }>()
    return row?.since ?? null
  } catch {
    return null
  }
}
