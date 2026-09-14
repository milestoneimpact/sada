/**
 * الإعدادات التشغيليّة.
 *
 * القيم نصوصٌ في القاعدة، وأنواعٌ مضبوطة هنا. والتحقّق في الشيفرة حيث
 * يُختبَر، لا في قيدٍ في القاعدة يصعب تغييره حين تُضاف قيمةٌ جديدة.
 *
 * **وكلّ قيمة لها حدٌّ أعلى.** سقفٌ يقبل مليونا ليس سقفا؛ وحقلُ إدخالٍ
 * في لوحةٍ يقبل ما يُكتب فيه بابٌ لخطأ إصبعٍ يكلّف مالا.
 */
import { checkProviderUrl } from './ai/urlGuard'
import { DEFAULT_TILES, normalizeTiles, parseTiles } from './dashboard'
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
   * عنوانُ قناة التنبيهات (D-109) — **وفارغٌ يعني «لا قناة»**.
   *
   * ولا يُخزَّن مشفَّرا لأنّه **ليس سرّا**: عنوانٌ يقبل رسالةً، لا مفتاحٌ
   * يفتح حسابا. **وخلطُهما يُرخِّص التشفيرَ حيث يجب ويُثقله حيث لا يلزم.**
   */
  readonly alertWebhook: string
  /**
   * بطاقاتُ لوح المالك بمعرِّفاتها، مفصولةً بفاصلة (D-119).
   *
   * **ومصفّاةٌ دائما**: ما تقرؤه هذه الوحدةُ هو ما يُعرَض حرفا بحرف.
   */
  readonly dashboardTiles: string
  /**
   * سقفُ الترويج الأسبوعيّ بالدولار — **ومنه وحده يأتي مبلغُ التوصية.**
   *
   * وافتراضُه صفر، ومعناه **لا توصيةَ تُكتب أصلا**: رقمٌ نؤلّفه نحن
   * رقمٌ بلا مصدر، والتوصيةُ هنا تقترح مالا لا كتابة (D-058).
   */
  readonly weeklyPromoCapUsd: number
  /**
   * أيُركَّب العنوانُ العربيُّ فوق الصورة؟ (D-085)
   *
   * **وافتراضُه مُشغَّل** — خلافا لبقيّة مفاتيح الإنفاق. والسبب أنّه
   * **لا يُنفِق شيئا ما لم يُضبَط `CF_BROWSER_TOKEN`**: بلا رمزٍ لا
   * نداءَ ولا لقطة. فالمفتاحُ هنا ليس بابَ إنفاقٍ يُفتَح، هو **إطفاءٌ
   * لمن ضبط الرمزَ ثمّ أراد صورةً نظيفةً بلا نصّ**.
   */
  readonly imageOverlay: boolean
}

export const DEFAULTS: Settings = {
  paused: false,
  dailyAnalysisCap: 10,
  dailySpendCapUsd: 5,
  autoEnqueue: false,
  weeklyPromoCapUsd: 0,
  imageOverlay: true,
  // ‏وافتراضُها فراغ: **قناةٌ تُنشأ بقرارٍ لا بغفلة**
  alertWebhook: '',
  // والأربعُ التي كانت مكتوبةً في الشيفرة — **فلا شاشةَ فارغةً في أوّل يوم**
  dashboardTiles: DEFAULT_TILES.join(','),
}

/** حدود ما يُقبل. الحدّ الأعلى يحرس من خطأ إصبعٍ في اللوحة. */
export const LIMITS = {
  dailyAnalysisCap: { min: 0, max: 500 },
  dailySpendCapUsd: { min: 0, max: 100 },
  weeklyPromoCapUsd: { min: 0, max: 500 },
} as const

/**
 * مفاتيحُ الإعدادات — **قائمةٌ حيّةٌ يُشتَقّ منها النوع** (D-110).
 *
 * كانت نوعا وحدَه، **وقائمةُ السماح في المسار مجموعةَ نصوصٍ تُكتب يدا**.
 * فأُضيف `alert_webhook` إلى النوع في D-109 **ونُسي في المجموعة**: الحقلُ
 * يُعرَض، ويُضغَط «احفظ»، **ويردّ الخادمُ ‏٤٠٠ صامتة**.
 *
 * **ولا تُمسَك بالأنواع**: النوعُ يُمحى عند البناء، والمجموعةُ نصوصٌ في
 * التشغيل. **فيُبنى الاثنان من مصدرٍ واحد** — ومفتاحٌ يُضاف غدا يدخلهما
 * معا أو لا يدخل أيّهما.
 */
export const SETTING_KEYS = [
  'paused',
  'daily_analysis_cap',
  'daily_spend_cap_usd',
  'auto_enqueue',
  'weekly_promo_cap_usd',
  'image_overlay',
  'alert_webhook',
  'dashboard_tiles',
] as const

export type SettingKey = (typeof SETTING_KEYS)[number]

/**
 * اسمُ الإعداد بجانب مفتاحه — **في موضعٍ واحد** (D-134).
 *
 * كان القاموسُ في `panel.ts` ناقصًا ثلاثةً، فقرأ المالكُ في «ما وقع اليوم»
 * `dashboard_tiles` و`weekly_promo_cap_usd` بحرفهما. **والقائمةُ تُقاس
 * على `SETTING_KEYS`**: مفتاحٌ يُضاف بلا اسمٍ يُردّ في الاختبار.
 */
export const SETTING_LABEL: Readonly<Record<SettingKey, string>> = {
  paused: 'الإيقاف المؤقّت',
  daily_analysis_cap: 'سقف التحليل اليوميّ',
  daily_spend_cap_usd: 'سقف الإنفاق اليوميّ',
  auto_enqueue: 'الإدراج الآليّ',
  weekly_promo_cap_usd: 'سقف الترويج الأسبوعيّ',
  image_overlay: 'تركيب النصّ على الصورة',
  alert_webhook: 'قناة التنبيهات',
  dashboard_tiles: 'بطاقات اللوح',
}

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(key)
}

/** ما ليس مفتاحَ إعدادٍ يُعاد بحرفه — القاموسُ لا يخترع. */
export function settingLabel(key: string): string {
  return isSettingKey(key) ? SETTING_LABEL[key] : key
}

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
    // **وهذا يُقرأ بالعكس**: غيابُه يعني «مشغَّل»، لأنّه لا يفتح إنفاقا —
    // والرمزُ وحده هو الذي يفتحه. فمَن لم يضبط شيئا لا يقع عليه نداء
    imageOverlay: map.get('image_overlay') !== 'false',
    // ‏وعنوانٌ فاسدٌ يُقرأ فارغا: قناةٌ لا تعمل خيرٌ من نداءٍ إلى مجهول
    alertWebhook: map.get('alert_webhook') ?? '',
    // **والاختيارُ يُصفَّى عند القراءة كما يُصفَّى عند الكتابة** (D-119):
    // معرِّفٌ زال من الكتالوج يُتخطّى، وفراغٌ يعود إلى الافتراض
    dashboardTiles: parseTiles(map.get('dashboard_tiles')).join(','),
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
  if (key === 'paused' || key === 'auto_enqueue' || key === 'image_overlay') {
    stored = raw === 'true' ? 'true' : 'false'
  } else if (key === 'alert_webhook') {
    /*
     * **والعنوانُ يُحرَس عند الحفظ لا عند الإرسال وحدَه** (D-109).
     *
     * حارسٌ عند الإرسال يمنع النداء، **ويترك المالكَ يظنّ قناتَه مضبوطة
     * حتّى يقع الحدثُ فلا يصل** — وذاك أسوأُ وقتٍ لاكتشاف العطل.
     * فيُردّ العنوانُ في وجهه وهو ينظر.
     */
    const trimmed = raw.trim()
    if (trimmed === '') stored = ''
    else {
      const verdict = checkProviderUrl(trimmed)
      stored = verdict.ok ? verdict.url : ''
    }
  } else if (key === 'dashboard_tiles') {
    /*
     * **ويُصفَّى بقواعد القراءة نفسِها** (D-119).
     *
     * فلا يُخزَّن معرِّفٌ لا يُقرأ، ولا يُخزَّن سبعةٌ ليُقرأ منها ستّ.
     * **وحقلٌ يقبل ما لا يَعرض يُري المالكَ أنّه حفظ ما لم يُحفَظ.**
     */
    stored = normalizeTiles(raw)
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
