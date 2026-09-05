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
    const row = await db
      .prepare(
        `SELECT count(*) AS analyses, coalesce(sum(total), 0) AS spend
           FROM cost_ledger
          WHERE provider = 'anthropic'
            AND operation LIKE 'analyze:%'
            AND at >= date('now')`,
      )
      .first<{ analyses: number; spend: number }>()
    return { analyses: row?.analyses ?? 0, spend: row?.spend ?? 0 }
  } catch {
    // دفترٌ لا يُقرأ لا يُفتح به الباب: يُفترض السقف مستهلَكا
    return { analyses: Number.POSITIVE_INFINITY, spend: Number.POSITIVE_INFINITY }
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

  if (!record.enabled) return { kind: 'provider_disabled', provider }
  if (record.dailyCap === null) return null

  const used = await spendTodayFor(db, provider)
  if (used >= record.dailyCap) {
    return { kind: 'provider_cap', provider, used, cap: record.dailyCap }
  }
  return null
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
  }
}
