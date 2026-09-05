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
}

export const DEFAULTS: Settings = {
  paused: false,
  dailyAnalysisCap: 10,
  dailySpendCapUsd: 5,
}

/** حدود ما يُقبل. الحدّ الأعلى يحرس من خطأ إصبعٍ في اللوحة. */
export const LIMITS = {
  dailyAnalysisCap: { min: 0, max: 500 },
  dailySpendCapUsd: { min: 0, max: 100 },
} as const

export type SettingKey = 'paused' | 'daily_analysis_cap' | 'daily_spend_cap_usd'

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
    dailyAnalysisCap: toNumber(map.get('daily_analysis_cap'), DEFAULTS.dailyAnalysisCap, 'dailyAnalysisCap'),
    dailySpendCapUsd: toNumber(map.get('daily_spend_cap_usd'), DEFAULTS.dailySpendCapUsd, 'dailySpendCapUsd'),
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
  if (key === 'paused') {
    stored = raw === 'true' ? 'true' : 'false'
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
