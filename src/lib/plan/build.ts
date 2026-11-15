/**
 * **بناءُ الخطّة في الخلفيّة، وحالُه يُرى** (D-332).
 *
 * ## ما كان
 *
 * «حلّل وابنِ الخطّة» كان ينادي المخطِّطَ **داخل طلب الصفحة**: المالكُ يضغط ثمّ ينتظر صفحةً بيضاء دقيقةً أو أكثر بلا كلمة، ونداءُ
 * مزوّدٍ متوافقٍ مع OpenAI يُقطع عند ‏30 ثانية (`guardedFetch`) — فخطّةُ شهرٍ تعود «تعذّر الوصول: aborted due to timeout» بعد أن انتظر.
 *
 * ## ما صار
 *
 * الضغطةُ تكتب **حالَ البناء** في KV وترسل رسالةً إلى طابور التوليد وتفتح شاشةَ «صدى يبني خطّتك» — فيها الخطواتُ وما اكتمل منها
 * وكم مضى. والمستهلكُ يخطّط (جزءًا جزءًا، وكلُّ جزءٍ يُحدَّث حالُه)، ثمّ يرسل بنودَ الخطّة للكتابة، ثمّ يختم الحالَ «تمّ» فتنتقل
 * الشاشةُ إلى الخطّة حيث تظهر المنشوراتُ تباعًا. **والمالكُ يغادر متى شاء**: البناءُ لا يتعلّق بصفحته.
 *
 * ## والحالُ في D1 (D-362)
 *
 * كان في KV، وقراءةُ KV من غير موضع كتابتها قد تتأخّر دقيقة: فشل البناءُ في 39 ثانية وبقيت الشاشةُ على «تنتظر». صار صفًّا في
 * `plan_builds` (`d1BuildStore`) يُقرأ كما كُتب. ومفتاحُه المنظّمة، فبناءٌ واحدٌ لكلّ عميلٍ في المرّة —
 * **وضغطةٌ ثانيةٌ والأوّلُ يجري تفتح شاشتَه ولا تبدأ نداءً مدفوعًا ثانيًا**.
 */
export type BuildState = 'queued' | 'planning' | 'done' | 'failed'

export interface PlanBuild {
  readonly id: string
  readonly state: BuildState
  /** كم جزءًا خُطّط، من كم (`planWindows`). */
  readonly done: number
  readonly total: number
  /** ISO — متى ضُغط الزرّ. */
  readonly startedAt: string
  /** سببُ الفشل، أو جملةُ «خُطّط» حين يتمّ. */
  readonly note?: string
  readonly planId?: string
}

/** ما يلزمنا من KV — فيُزيَّف في الاختبار بخريطة. */
export interface BuildStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>
}

const TTL_SECONDS = 60 * 60

/** المخزنُ في D1 — بواجهة KV نفسِها، فلا يتغيّر قارئٌ ولا كاتب. وما انقضت مدّتُه لا يُقرأ. */
export function d1BuildStore(db: { prepare(sql: string): { bind(...v: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } } }): BuildStore {
  return {
    async get(key) {
      const row = await db.prepare("SELECT value FROM plan_builds WHERE key = ? AND expires_at > datetime('now')").bind(key).first<{ value: string }>()
      return row?.value ?? null
    },
    async put(key, value, options) {
      const ttl = Math.max(60, options?.expirationTtl ?? TTL_SECONDS)
      await db.prepare(`INSERT INTO plan_builds (key, value, expires_at) VALUES (?, ?, datetime('now', '+' || ? || ' seconds'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`).bind(key, value, ttl).run()
    },
  }
}
/** بناءٌ لم يتحرّك حالُه ربعَ ساعةٍ انقطع: طابورُ Cloudflare يمهل المستهلكَ ربعَ ساعة، وما بعدها لا أحدَ يكمله. */
export const STALE_MS = 15 * 60 * 1000

const keyOf = (org: string): string => `plan-build:${org}`

export async function readBuild(kv: BuildStore, org: string): Promise<PlanBuild | null> {
  try {
    const raw = await kv.get(keyOf(org))
    if (raw === null) return null
    const v = JSON.parse(raw) as Partial<PlanBuild>
    if (typeof v.id !== 'string' || typeof v.startedAt !== 'string') return null
    const state: BuildState = v.state === 'planning' || v.state === 'done' || v.state === 'failed' ? v.state : 'queued'
    return {
      id: v.id, state, startedAt: v.startedAt,
      done: Number.isFinite(v.done) ? Math.max(0, Math.floor(Number(v.done))) : 0,
      total: Number.isFinite(v.total) ? Math.max(1, Math.floor(Number(v.total))) : 1,
      ...(typeof v.note === 'string' ? { note: v.note } : {}),
      ...(typeof v.planId === 'string' ? { planId: v.planId } : {}),
    }
  } catch {
    return null
  }
}

export async function writeBuild(kv: BuildStore, org: string, build: PlanBuild): Promise<void> {
  await kv.put(keyOf(org), JSON.stringify(build), { expirationTtl: TTL_SECONDS })
}

/** أيجري بناءٌ الآن؟ — في الطابور أو يخطّط، ولم ينقطع. */
export function running(build: PlanBuild | null, now: Date): boolean {
  return build !== null && (build.state === 'queued' || build.state === 'planning') && now.getTime() - Date.parse(build.startedAt) < STALE_MS
}

/** الحالُ كما تُعرَض: الجاري الذي انقطع يُقرأ فشلًا بسببه، فلا تدور الشاشةُ إلى الأبد. */
export function shownBuild(build: PlanBuild, now: Date): PlanBuild {
  if ((build.state === 'queued' || build.state === 'planning') && !running(build, now)) {
    return { ...build, state: 'failed', note: 'انقطع البناءُ قبل أن يكتمل — أعد المحاولة من «خطّة جديدة». وما خُطّط منه مسجَّلٌ بكلفته.' }
  }
  return build
}
