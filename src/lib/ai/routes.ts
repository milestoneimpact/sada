/**
 * توجيه المهامّ — من الشيفرة إلى المالك.
 *
 * كان ثابتا في `registry.ts`. وصار جدولا يقرؤه المالك ويكتبه من اللوحة:
 * يجرّب الرخيص في الفهم ويُبقي الغالي في الكتابة، **بلا نشرٍ ولا شيفرة**.
 *
 * والشيفرة تبقى مرجع الافتراض حين لا صفّ — فنظامٌ بجدولٍ فارغ يعمل، ولا
 * ينتظر أن يُملأ.
 */
import { IMPLEMENTED, ROUTES, type TaskName } from './registry'
import type { Db } from '../tokens'
import { OWNER_ORG } from '../tenancy'

export interface TaskRoute {
  readonly task: TaskName
  readonly provider: string
  readonly model: string
  readonly why: string
  readonly implemented: boolean
  /** أمن اللوحة هو أم من الافتراض في الشيفرة؟ */
  readonly custom: boolean
  /** المزوّدُ الاحتياطيّ (D-348) — يُجرَّب مرّةً حين يردّ الأوّلُ بخطأ مفتاحٍ أو حدٍّ أو انشغال. و`null`: بلا احتياط. */
  readonly fallback: string | null
}

export async function readRoutes(db: Db): Promise<TaskRoute[]> {
  let saved = new Map<string, { provider: string; model: string; fallback: string | null }>()
  // إعدادٌ عامّ: يسكن منظّمةَ المالك (D-277). والاحتياطُ (D-348) عمودٌ قد لا يكون رُحّل بعد: قراءتُه تسقط وحدَها
  // ثمّ تُقرأ الجملةُ بلا عموده — فقاعدةٌ قبل 0050 تعمل بتوجيهها كما كانت لا بالافتراض
  const read = (sql: string) => db.prepare(sql).bind(OWNER_ORG).all<{ task: string; provider: string; model: string; fallback?: string | null }>()
  try {
    const { results } = await read('SELECT task, provider, model, fallback FROM task_routes WHERE org_id = ?')
      .catch(() => read('SELECT task, provider, model FROM task_routes WHERE org_id = ?'))
    saved = new Map(results.map((r) => [r.task, { provider: r.provider, model: r.model, fallback: r.fallback ?? null }]))
  } catch {
    saved = new Map()
  }

  return (Object.keys(ROUTES) as TaskName[]).map((task) => {
    const fallback = ROUTES[task]
    const chosen = saved.get(task)
    return {
      task,
      provider: chosen?.provider ?? fallback.provider,
      model: chosen?.model ?? fallback.model,
      why: fallback.why,
      implemented: IMPLEMENTED.has(task),
      custom: chosen !== undefined,
      fallback: chosen?.fallback ?? null,
    }
  })
}

/**
 * توجيهُ مهمّةٍ واحدة — **ولا يعود فارغا**.
 *
 * كانت المهامُّ الثلاث تقرأ الجدول كلَّه ثمّ تبحث فيه، وكلُّ واحدةٍ تحمل
 * فرعا لِـ «لا توجيه لهذه المهمّة» **لا يقع أبدا**: `readRoutes` تُسقِط
 * على مفاتيح `ROUTES` كلِّها، فكلُّ `TaskName` فيها بالضرورة. وفرعٌ لا
 * يقع لا يُختبَر، ومَن قرأه ظنّ الحالةَ ممكنةً فاحتاط لها في موضعٍ آخر.
 *
 * فالنوعُ هنا يقول الحقيقة: توجيهٌ دائما، من اللوحة إن كُتب ومن الشيفرة
 * إن لم يُكتَب.
 */
export async function routeFor(db: Db, task: TaskName): Promise<{ provider: string; model: string; fallback: string | null }> {
  const routes = await readRoutes(db)
  const found = routes.find((r) => r.task === task)
  return found ?? { provider: ROUTES[task].provider, model: ROUTES[task].model, fallback: null }
}

/**
 * **أيُستحقّ الاحتياط؟** (D-348) — خطأٌ يعني «هذا المفتاحُ أو هذا المزوّدُ لا يخدم الآن» فيخدم غيرُه:
 * مفتاحٌ مرفوض (401 · 403)، أو حدٌّ بلغ (429)، أو انشغالٌ أو تعطّل (500 · 502 · 503 · 529).
 * **وما سواها لا**: طلبٌ مرفوضٌ لمحتواه أو نموذجٌ غيرُ موجود (400 · 404 · 422) يُرفض عند الثاني كذلك، وجوابٌ بُتر وقد حوسب عليه لا يُعاد.
 */
export const FALLBACK_STATUSES: ReadonlySet<number> = new Set([401, 403, 429, 500, 502, 503, 529])
export function wantsFallback(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false
  const status = Number((error as { status: unknown }).status)
  // ‏‎502 «بُتر الجواب» يحمل ما أُنفق: لا يُعاد عند غيره
  if ('spent' in error && (error as { spent: unknown }).spent !== undefined && (error as { spent: unknown }).spent !== null) return false
  return FALLBACK_STATUSES.has(status)
}

export async function writeRoute(
  db: Db,
  task: TaskName,
  provider: string,
  model: string,
  by: string,
  /** المزوّدُ الاحتياطيّ (D-348): `undefined` يبقيه كما هو، و`null` يمحوه. */
  fallback?: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO task_routes (task, provider, model, updated_by, updated_at, org_id)
       -- إعدادٌ عامّ: يسكن منظّمةَ المالك
       VALUES (?, ?, ?, ?, datetime('now'), ?)
       ON CONFLICT(task) DO UPDATE SET
         provider = excluded.provider, model = excluded.model,
         updated_by = excluded.updated_by, updated_at = datetime('now')`,
    )
    .bind(task, provider, model, by, OWNER_ORG)
    .run()
  if (fallback !== undefined) {
    await db.prepare('UPDATE task_routes SET fallback = ? WHERE task = ? AND org_id = ?').bind(fallback, task, OWNER_ORG).run()
  }
}

/**
 * **نموذجٌ بقي من مزوّدٍ سابق** (D-083).
 *
 * رُئي في اللوحة: بُدّل المزوّدُ إلى Cloudflare **وبقيت نماذجُ Gemini
 * معروضةً**، فحُفظ توجيهٌ لا يعمل — ولا شيء يقول ذلك حتّى أوّل نداءٍ
 * مدفوع.
 *
 * والدرجُ في المتصفّح صار يُفرَّغ عند التبديل، **لكنّ الشاشةَ ليست
 * حارسا**: من حفظ قبل أن يصل الجلب، أو أرسل النموذجَ من طرفيّة، يمرّ.
 *
 * وحكمان لا ثالث لهما — **وكلاهما يقينيّ لا استدلال**:
 *
 * ١ · بُدّل المزوّدُ **والنموذجُ هو نموذجُ السابق حرفا**. فهذا ليس
 *     اختيارا: هو ما بقي في الحقل.
 * ٢ · معرّفٌ يبدأ بـ `@cf/` عند مزوّدٍ ليس Cloudflare. **ولا أحدَ غيرُها
 *     يخدم هذه المعرّفات** — فهو خطأٌ مقطوعٌ به لا مشتبَهٌ فيه.
 *
 * وما عداهما يمرّ: **حارسٌ يخمّن يمنع اختيارا صحيحا**، وذاك أسوأُ من
 * أن يمرّ خطأٌ يُكشَف عند أوّل اختبار.
 */
export function routeMismatch(
  previous: { readonly provider: string; readonly model: string } | null,
  next: { readonly provider: string; readonly model: string },
  providerIsCloudflare: boolean,
): string | null {
  if (
    previous !== null &&
    previous.provider !== next.provider &&
    previous.model.trim() === next.model.trim() &&
    next.model.trim() !== ''
  ) {
    return (
      `بدّلت المزوّد إلى «${next.provider}» والنموذج ما زال «${next.model}» — ` +
      `وهو نموذج «${previous.provider}». اضغط «حدّث» بجانب الدرج واختر من نماذجه.`
    )
  }
  if (next.model.trim().startsWith('@cf/') && !providerIsCloudflare) {
    return (
      `«${next.model}» معرّف نموذج في Workers AI، ولا يخدمه «${next.provider}». ` +
      'اختر مزوّد Cloudflare، أو اختر نموذجا من نماذج هذا المزوّد.'
    )
  }
  return null
}
