/**
 * حارس الإنفاق: مفتاح الإيقاف والسقفان.
 *
 * **زرٌّ في واجهةٍ لا يوقف شيئا.** ما يوقف هو فحصٌ يقع قبل النداء لا
 * بعده — كما وقع حارس الإدارة قبل نداء Google لا بعده (D-019).
 *
 * وسقفان لا واحد: مستندٌ ضخم قد يكلّف أكثر من عشرة صغار، فسقف العدد
 * وحده لا يحرس منه؛ وسقف المال وحده لا يحرس من طوفان ملفّاتٍ صغيرة
 * يستنزف حصّة الطابور وصفوف D1.
 *
 * وسقفٌ ثالثٌ للمقاطع بعددها (D-168): سعرُها يُسجَّل صفرًا موسومًا فلا يبلغ
 * سقفَ المال، **وهو خارج `checkAllowance`** — يحجب التحريكَ وحده، ولا يوقف
 * تحليلًا ولا صورة.
 *
 * ويُقاس اليوم بـ UTC لا بتوقيت الرياض: `cost_ledger` يكتب
 * `datetime('now')` وهو UTC، وقياسٌ بمنطقةٍ أخرى يجعل السقف يُفتح مرّتين
 * أو لا يُفتح — والاتّساق أهمّ من موافقة الساعة المحليّة.
 */
import { spendTodayFor } from './ai/spend'
import { getProvider } from './providers'
import { readSettings, type Settings } from './settings'
import type { Db } from './tokens'

export type Blocker =
  | { readonly kind: 'paused' }
  | { readonly kind: 'analysis_cap'; readonly used: number; readonly cap: number }
  | { readonly kind: 'spend_cap'; readonly used: number; readonly cap: number }
  /** سقفٌ خاصّ بمزوّد — Anthropic لا يستهلك حصّة Gemini. */
  | { readonly kind: 'provider_cap'; readonly provider: string; readonly used: number; readonly cap: number }
  /** مزوّدٌ عطّله المالك بمفتاحه محفوظا. */
  | { readonly kind: 'provider_disabled'; readonly provider: string }
  /** سقفُ المقاطع اليوميّ بالعدد (D-168) — يحجب التحريكَ وحده لا غيرَه. */
  | { readonly kind: 'video_cap'; readonly used: number; readonly cap: number }

export interface Allowance {
  readonly allowed: boolean
  readonly blocker: Blocker | null
  readonly settings: Settings
  readonly usage: DailyUsage
}

export interface DailyUsage {
  /** نداءات Anthropic اليوم — مقروءةً من الدفتر لا من عدّادٍ موازٍ. */
  readonly analyses: number
  readonly spend: number
  /**
   * نداءاتُ الفيديو اليوم (D-168) — **صفوفُ الدفتر لا صفوفُ `media`**.
   *
   * الصفُّ في `media` لا يُكتب إلّا بعد النجاح، وصفُّ الدفتر قبل النداء
   * (D-008). فمحاولةٌ سقطت بعد أن بلغت المزوّدَ تُعدّ هنا ولا تُعدّ هناك —
   * **وقد تكون حوسبت**. والعدُّ من الأعلى يمنع أكثر ممّا يسمح.
   */
  readonly clips: number
}

/**
 * استهلاك اليوم من `cost_ledger` نفسه.
 *
 * لا عدّادَ موازٍ: رقمان لنفس الشيء يفترقان يوما ولا يُعرف الصادق. والدفتر
 * يُكتب **قبل** النجاح (D-008)، فهو الأعلى والأصدق — وحارسٌ يبني على
 * الأصدق يمنع أكثر ممّا يسمح، وذاك الاتّجاه الصحيح للخطأ.
 */
export async function usageToday(db: Db): Promise<DailyUsage> {
  try {
    /*
     * **والمقاطعُ في الاستعلام نفسِه لا في ثانٍ** (D-168): `checkAllowance`
     * تُقرأ في كلّ نداءٍ وفي كلّ فتحةٍ للوحة، فيصل العدُّ إلى `animateForPost`
     * وإلى نقطة «المقاطع» تحت الزرّ بقراءةٍ واحدة — ولا يفترقان.
     *
     * والشرطُ على التحليل انتقل من `WHERE` إلى `CASE` بحرفه: ما كان يُعَدّ
     * يُعَدّ، وما كان يُجمَع يُجمَع.
     */
    const row = await db
      .prepare(
        `SELECT
           coalesce(sum(CASE WHEN provider = 'anthropic' AND operation LIKE 'analyze:%'
                             THEN 1 ELSE 0 END), 0) AS analyses,
           coalesce(sum(CASE WHEN provider = 'anthropic' AND operation LIKE 'analyze:%'
                             THEN total ELSE 0 END), 0) AS spend,
           coalesce(sum(CASE WHEN operation LIKE 'video:%' THEN 1 ELSE 0 END), 0) AS clips
           FROM cost_ledger
          WHERE at >= date('now')`,
      )
      .first<{ analyses: number; spend: number; clips: number }>()
    return { analyses: row?.analyses ?? 0, spend: row?.spend ?? 0, clips: row?.clips ?? 0 }
  } catch {
    // دفترٌ لا يُقرأ لا يُفتح به الباب: يُفترض السقف مستهلَكا
    return {
      analyses: Number.POSITIVE_INFINITY,
      spend: Number.POSITIVE_INFINITY,
      clips: Number.POSITIVE_INFINITY,
    }
  }
}

/**
 * أيُسمح بنداءٍ مدفوع الآن؟
 *
 * الترتيب مقصود: الإيقاف أوّلا لأنّه قرارُ المالك الصريح، ولا يُنقَض
 * بسقفٍ لم يُبلغ. ثمّ العدد، ثمّ المال.
 */
/**
 * حارسٌ خاصّ بمزوّد، فوق الحارس العامّ.
 *
 * يُفحَص **بعد** العامّ لا قبله: الإيقاف والسقف الكلّيّ يخصّان النظام
 * كلّه، وسقفُ مزوّدٍ تفصيلٌ تحته. ومَن قدّم التفصيل على الجملة قال
 * «Gemini متاح» ونظامُه موقوف.
 */
export async function checkProvider(db: Db, provider: string): Promise<Blocker | null> {
  const record = await getProvider(db, provider)
  if (record === null) return null
  // والدفترُ يُسأل حيث يُحتاج وحدَه: المعطَّلُ والمزوّدُ بلا سقفٍ لا يُقرأ إنفاقُهما
  const used = record.enabled && record.dailyCap !== null ? await spendTodayFor(db, provider) : 0
  return providerBlocker({ name: provider, enabled: record.enabled, dailyCap: record.dailyCap }, used)
}

/**
 * حكمُ الحارس الخاصّ من حقائقه — **نقيٌّ، يناديه `checkProvider` ولوحُ
 * المسوّدات معًا** (D-163).
 *
 * كان الحكمُ لا يُبلَغ إلّا بقراءة D1، فاللوحُ الذي يريد أن يقول قبل الضغط
 * «المزوّدُ معطَّل» ينسخه أو يسكت. **والنسخةُ تفترق عن أصلها عند أوّل
 * تصحيح**، فتقول النقطةُ «جاهز» والدالّةُ تردّ.
 */
export function providerBlocker(
  record: { readonly name: string; readonly enabled: boolean; readonly dailyCap: number | null },
  spentToday: number,
): Blocker | null {
  if (!record.enabled) return { kind: 'provider_disabled', provider: record.name }
  if (record.dailyCap === null) return null
  if (spentToday >= record.dailyCap) {
    return { kind: 'provider_cap', provider: record.name, used: spentToday, cap: record.dailyCap }
  }
  return null
}

/** حكمُ سقف المقاطع ومعه رقماه — فالنقطةُ تقول كم بقي، والرسالةُ كم بلغ. */
export interface VideoCapGate {
  readonly used: number
  readonly cap: number
  readonly blocker: Blocker | null
}

/**
 * أيُحرَّك مقطعٌ آخرُ اليوم؟ — **نقيٌّ، يناديه `animateForPost` ولوحُ
 * المسوّدات معًا** (D-168)، كما يُنادى `providerBlocker`.
 *
 * ## لماذا بالعدد
 *
 * سعرُ نموذج الفيديو لم يُقرأ من لوحة Cloudflare (M-16)، فيُسجَّل صفرًا
 * موسومًا — **وصفرٌ لا يبلغ سقفَ مالٍ أبدًا**. ثمّ إنّ `usageToday` لا تجمع
 * في المال إلّا Anthropic، فالمقطعُ لا يدخل سقفَ الإنفاق ولو سُعِّر.
 *
 * ## ولماذا دائمًا لا «ما دام السعرُ مجهولًا»
 *
 * لا مسارَ في الشيفرة يكتب سعرًا بعد. **وحدٌّ مشروطٌ بسعرٍ يُطفأ يومَ يُكتب
 * السعر** فيعود البابُ مفتوحًا، وسقفُ المال لا يرى المقطعَ أصلًا. والعددُ
 * يحرس ما لا يحرسه المال — حلقةَ إعادةٍ على منشوراتٍ شتّى — كما يحرس سقفُ
 * التحليل بجانب سقف الإنفاق: **سقفان لا واحد**.
 *
 * والمنعُ عند البلوغ لا بعد التجاوز، وصفرٌ يُغلق التحريكَ كلَّه.
 */
export function videoCapGate(used: number, cap: number): VideoCapGate {
  return { used, cap, blocker: used >= cap ? { kind: 'video_cap', used, cap } : null }
}

export async function checkAllowance(db: Db): Promise<Allowance> {
  const settings = await readSettings(db)
  const usage = await usageToday(db)

  let blocker: Blocker | null = null
  if (settings.paused) {
    blocker = { kind: 'paused' }
  } else if (usage.analyses >= settings.dailyAnalysisCap) {
    blocker = { kind: 'analysis_cap', used: usage.analyses, cap: settings.dailyAnalysisCap }
  } else if (usage.spend >= settings.dailySpendCapUsd) {
    blocker = { kind: 'spend_cap', used: usage.spend, cap: settings.dailySpendCapUsd }
  }

  return { allowed: blocker === null, blocker, settings, usage }
}

/** سببٌ يُقرأ، لا رمزُ خطأ. */
export function blockerReason(blocker: Blocker): string {
  switch (blocker.kind) {
    case 'paused':
      return 'النظام موقوف مؤقتا بقرار المالك — لا نداء مدفوع ولا نشر'
    case 'analysis_cap':
      return `بلغ سقف التحليل اليوميّ: ${blocker.used} من ${blocker.cap}`
    case 'spend_cap':
      return `بلغ سقف الإنفاق اليوميّ: ${blocker.used.toFixed(4)}$ من ${blocker.cap}$`
    case 'provider_cap':
      return `بلغ سقف ${blocker.provider} اليوميّ: ${blocker.used.toFixed(4)}$ من ${blocker.cap}$`
    case 'provider_disabled':
      return `${blocker.provider} معطَّل بقرار المالك`
    case 'video_cap':
      return blocker.cap === 0
        ? 'سقف المقاطع اليوميّ صفر بقرار المالك — لا تحريك'
        : `بلغ سقف المقاطع اليوميّ: ${blocker.used} من ${blocker.cap} — يُفتح غدًا، أو ارفعه من «الحدود»`
  }
}
