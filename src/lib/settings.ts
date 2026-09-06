/**
 * الإعدادات التشغيليّة.
 *
 * القيم نصوصٌ في القاعدة، وأنواعٌ مضبوطة هنا. والتحقّق في الشيفرة حيث
 * يُختبَر، لا في قيدٍ في القاعدة يصعب تغييره حين تُضاف قيمةٌ جديدة.
 *
 * **وكلّ قيمة لها حدٌّ أعلى.** سقفٌ يقبل مليونا ليس سقفا؛ وحقلُ إدخالٍ
 * في لوحةٍ يقبل ما يُكتب فيه بابٌ لخطأ إصبعٍ يكلّف مالا.
 */
import type { Db } from './tokens'

export interface Settings {
  /** حين يُرفع: لا نداء مدفوع ولا نشر — في كلّ مسار، لا في الواجهة. */
  readonly paused: boolean
  readonly dailyAnalysisCap: number
  readonly dailySpendCapUsd: number
  /**
   * أيُدرج المسحُ اليوميّ ما تغيّر في طابور الفهم بلا أمر؟
   * افتراضه مطفأ: إنفاقٌ يبدأ بلا قرارٍ صريح ليس ميزة.
   */
  readonly autoEnqueue: boolean
  /**
   * سقفُ الترويج الأسبوعيّ بالدولار — **ومنه وحده يأتي مبلغُ التوصية.**
   *
   * وافتراضُه صفر، ومعناه **لا توصيةَ تُكتب أصلا**: رقمٌ نؤلّفه نحن
   * رقمٌ بلا مصدر، والتوصيةُ هنا تقترح مالا لا كتابة (D-058).
   */
  readonly weeklyPromoCapUsd: number
}

export const DEFAULTS: Settings = {
  paused: false,
  dailyAnalysisCap: 10,
  dailySpendCapUsd: 5,
  autoEnqueue: false,
  weeklyPromoCapUsd: 0,
}

/** حدود ما يُقبل. الحدّ الأعلى يحرس من خطأ إصبعٍ في اللوحة. */
export const LIMITS = {
  dailyAnalysisCap: { min: 0, max: 500 },
  dailySpendCapUsd: { min: 0, max: 100 },
  weeklyPromoCapUsd: { min: 0, max: 500 },
} as const

export type SettingKey =
  | 'paused'
  | 'daily_analysis_cap'
  | 'daily_spend_cap_usd'
  | 'auto_enqueue'
  | 'weekly_promo_cap_usd'

function toNumber(raw: string | undefined, fallback: number, key: keyof typeof LIMITS): number {
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  const { min, max } = LIMITS[key]
  return Math.min(Math.max(value, min), max)
}

/**
 * يقرأ الإعدادات كلّها في استعلامٍ واحد.
 *
 * وما نقص يعود إلى افتراضه: صفٌّ محذوف أو ترحيلٌ لم يُطبَّق **لا يفتح
 * الباب** — `paused` تعود `false` لأنّ الافتراض تشغيلٌ لا توقّف، لكنّ
 * السقوف تعود إلى قيمها المحافظة لا إلى اللانهاية.
 */
export async function readSettings(db: Db): Promise<Settings> {
  let rows: { key: string; value: string }[] = []
  try {
    const result = await db
      .prepare('SELECT key, value FROM settings')
      .all<{ key: string; value: string }>()
    rows = result.results
  } catch {
    // جدولٌ غير موجود (ترحيل لم يُطبَّق): الافتراضات المحافظة لا العطل
    return DEFAULTS
  }

  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    paused: map.get('paused') === 'true',
    // مفاتيح الخطر تُقرأ بالمطابقة الحرفيّة لا بالتساهل: غيابها أو فسادها
    // يعني «مطفأ»، ولا يُفتح باب إنفاقٍ بقيمةٍ لم تُفهَم
    autoEnqueue: map.get('auto_enqueue') === 'true',
    dailyAnalysisCap: toNumber(map.get('daily_analysis_cap'), DEFAULTS.dailyAnalysisCap, 'dailyAnalysisCap'),
    dailySpendCapUsd: toNumber(map.get('daily_spend_cap_usd'), DEFAULTS.dailySpendCapUsd, 'dailySpendCapUsd'),
    weeklyPromoCapUsd: toNumber(
      map.get('weekly_promo_cap_usd'), DEFAULTS.weeklyPromoCapUsd, 'weeklyPromoCapUsd',
    ),
  }
}

export interface WriteResult {
  readonly key: SettingKey
  readonly value: string
  /** ما قُبل فعلا بعد القصّ على الحدود — قد يخالف ما أُرسل. */
  readonly stored: string
  readonly clamped: boolean
}

/** يكتب قيمةً واحدة، مقصوصةً على حدودها، ومعها مَن غيّرها. */
export async function writeSetting(
  db: Db,
  key: SettingKey,
  raw: string,
  updatedBy: string,
): Promise<WriteResult> {
  let stored: string
  if (key === 'paused' || key === 'auto_enqueue') {
    stored = raw === 'true' ? 'true' : 'false'
  } else if (key === 'weekly_promo_cap_usd') {
    stored = String(toNumber(raw, DEFAULTS.weeklyPromoCapUsd, 'weeklyPromoCapUsd'))
  } else {
    const limitKey = key === 'daily_analysis_cap' ? 'dailyAnalysisCap' : 'dailySpendCapUsd'
    const fallback = key === 'daily_analysis_cap' ? DEFAULTS.dailyAnalysisCap : DEFAULTS.dailySpendCapUsd
    stored = String(toNumber(raw, fallback, limitKey))
  }

  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_by, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    )
    .bind(key, stored, updatedBy)
    .run()

  return { key, value: raw, stored, clamped: stored !== raw }
}
