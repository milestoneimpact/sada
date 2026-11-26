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
import { money } from './format'
import { getProvider } from './providers'
import { readSettingsBoth, type OrgKey, type Settings } from './settings'
import { OWNER_ORG } from './tenancy'
import type { Db } from './tokens'

/** `org`: سقفُ هذا العميل بعينه لا السقفُ العامّ (D-295) — يُقال في السبب. */
export type CapScope = 'org'

export type Blocker =
  | { readonly kind: 'paused' }
  | { readonly kind: 'analysis_cap'; readonly used: number; readonly cap: number; readonly scope?: CapScope }
  | { readonly kind: 'spend_cap'; readonly used: number; readonly cap: number; readonly scope?: CapScope }
  /** سقفٌ خاصّ بمزوّد — Anthropic لا يستهلك حصّة Gemini. */
  | { readonly kind: 'provider_cap'; readonly provider: string; readonly used: number; readonly cap: number }
  /** مزوّدٌ عطّله المالك بمفتاحه محفوظا. */
  | { readonly kind: 'provider_disabled'; readonly provider: string }
  /** سقفُ المقاطع اليوميّ بالعدد (D-168) — يحجب التحريكَ وحده لا غيرَه. */
  | { readonly kind: 'video_cap'; readonly used: number; readonly cap: number; readonly scope?: CapScope }

export interface Allowance {
  readonly allowed: boolean
  readonly blocker: Blocker | null
  /** الإعداداتُ العامّة (منظّمة المالك). */
  readonly settings: Settings
  /** الاستهلاكُ العامّ اليوم على المنظّمات كلِّها. */
  readonly usage: DailyUsage
  /**
   * العميلُ إن كان غيرَ منظّمة المالك (D-295): سقوفُه الفعّالة (العامُّ وفوقه ما كتبه) واستهلاكُه وحدَه.
   * **والسقفُ العامُّ يبقى فوق الكلّ**: يُفحَص أوّلًا على المجموع، ثمّ سقفُ العميل على ما أنفقه هو.
   */
  readonly org?: {
    readonly settings: Settings
    readonly usage: DailyUsage
    /** ما كتبه العميلُ لنفسه (D-415) — «سقفُ العميل» بوجود صفّه لا بتساوي القيم. */
    readonly overridden: ReadonlySet<OrgKey>
  }
  /** ما أُنفق على مقاطع هذه المنظّمة منذ أوّل الشهر (D-414) — للّوح؛ والحجزُ يعيد الحسابَ في جملته. */
  readonly videoMonth?: number
}

export interface DailyUsage {
  /** نداءات Anthropic اليوم — مقروءةً من الدفتر لا من عدّادٍ موازٍ. */
  readonly analyses: number
  /**
   * **كلُّ ما أُنفق اليوم** من الدفتر كلِّه — لا تحليلُ Anthropic وحدَه (D-169).
   *
   * كان المجموعُ `provider = 'anthropic' AND operation LIKE 'analyze:%'`، فالكتابةُ
   * والخطّةُ والموجزُ والصورةُ واللقطةُ والنشرُ خارجه: «سقف الإنفاق اليوميّ»
   * يسمّي نفسَه ولا يحرس إلّا بعضَه، و«المستهلَك اليوم» تحته يُنقص ما أُنفق.
   */
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
export async function usageToday(db: Db, org?: string): Promise<DailyUsage> {
  const both = await usageTodayBoth(db, org ?? OWNER_ORG)
  return both.all
}

/** استهلاكُ اليوم عامًّا ولمنظّمةٍ بعينها — **في الجملة نفسِها** (D-295)، فلا يفترق رقمان. */
export async function usageTodayBoth(db: Db, org: string): Promise<{ readonly all: DailyUsage; readonly mine: DailyUsage; readonly videoMonth: number }> {
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
           coalesce(sum(CASE WHEN at >= date('now') AND provider = 'anthropic' AND operation LIKE 'analyze:%'
                             THEN 1 ELSE 0 END), 0) AS analyses,
           coalesce(sum(CASE WHEN at >= date('now') THEN total ELSE 0 END), 0) AS spend,
           coalesce(sum(CASE WHEN at >= date('now') AND operation LIKE 'video:%' THEN 1 ELSE 0 END), 0) AS clips,
           coalesce(sum(CASE WHEN at >= date('now') AND org_id = ?1 AND provider = 'anthropic' AND operation LIKE 'analyze:%'
                             THEN 1 ELSE 0 END), 0) AS my_analyses,
           coalesce(sum(CASE WHEN at >= date('now') AND org_id = ?1 THEN total ELSE 0 END), 0) AS my_spend,
           coalesce(sum(CASE WHEN at >= date('now') AND org_id = ?1 AND operation LIKE 'video:%' THEN 1 ELSE 0 END), 0) AS my_clips,
           -- ‏‏وما أُنفق على مقاطع هذه المنظّمة منذ أوّل الشهر — من القراءة نفسِها لا من جملةٍ ثانية
           coalesce(sum(CASE WHEN org_id = ?1 AND operation LIKE 'video:%' THEN total ELSE 0 END), 0) AS my_video_month
           FROM cost_ledger
          -- السقفُ العامّ على المنظّمات كلِّها، وسقفُ العميل على صفوفه وحدَها — من القراءة نفسِها
          WHERE org_id IN (SELECT id FROM orgs) AND at >= strftime('%Y-%m-01 00:00:00', 'now')`,
      )
      .bind(org)
      .first<{ analyses: number; spend: number; clips: number; my_analyses: number; my_spend: number; my_clips: number; my_video_month: number }>()
    return {
      videoMonth: row?.my_video_month ?? 0,
      all: { analyses: row?.analyses ?? 0, spend: row?.spend ?? 0, clips: row?.clips ?? 0 },
      mine: { analyses: row?.my_analyses ?? 0, spend: row?.my_spend ?? 0, clips: row?.my_clips ?? 0 },
    }
  } catch {
    // دفترٌ لا يُقرأ لا يُفتح به الباب: يُفترض السقف مستهلَكا
    const spent = { analyses: Number.POSITIVE_INFINITY, spend: Number.POSITIVE_INFINITY, clips: Number.POSITIVE_INFINITY }
    return { all: spent, mine: spent, videoMonth: Number.POSITIVE_INFINITY }
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
export function videoCapGate(used: number, cap: number, scope?: CapScope): VideoCapGate {
  const tag = scope === undefined ? {} : { scope }
  return { used, cap, blocker: used >= cap ? { kind: 'video_cap', used, cap, ...tag } : null }
}

/** حارسُ المقاطع للعميل: العامُّ أوّلًا، ثمّ سقفُه هو إن كتب لنفسه سقفًا (D-295). */
export function videoCapFor(a: Allowance): VideoCapGate {
  const all = videoCapGate(a.usage.clips, a.settings.dailyVideoCap)
  if (all.blocker !== null || a.org === undefined) return all
  if (a.org.settings.dailyVideoCap === a.settings.dailyVideoCap) return all
  return videoCapGate(a.org.usage.clips, a.org.settings.dailyVideoCap, 'org')
}

/**
 * ما يُحرَس — **والحارسُ يسأل عمّا يحرسه** (D-169).
 *
 * كان حارسًا واحدًا لكلّ شيء، فسقفُ **عدد التحليلات** يوقف ما لا صلةَ له به:
 * بلغ المالكُ عشرةَ تحليلاتٍ فتوقّف نشرُ منشوراتٍ اعتمدها وجدولها، وتوقّف
 * مسحُ Drive وهو لا يكلّف شيئًا، وحُجبت الصورةُ والمقطع. والآن:
 *
 * | الحارس | ما يوقفه |
 * |---|---|
 * | الإيقاف | كلَّ شيء — وهو قرارُ المالك الصريح |
 * | سقفُ التحليل (عدد) | التحليلَ وحدَه |
 * | سقفُ الإنفاق (مال) | ما يولّد بمال: التحليلُ والكتابةُ والخطّةُ والصورةُ والمقطع |
 *
 * **والنشرُ لا يوقفه سقفُ المال**: منشورٌ اعتمده المالكُ وجدوله قرارٌ مكتوب
 * (D-006)، وكلفتُه تُعَدّ في المجموع فتوقف ما يُولَّد بعدها. والمسحُ مجّانيٌّ
 * فلا يوقفه إلّا الإيقاف.
 */
export type Duty = 'analyze' | 'draft' | 'plan' | 'image' | 'video' | 'publish' | 'scan'

const PAID: ReadonlySet<Duty> = new Set(['analyze', 'draft', 'plan', 'image', 'video'])

/**
 * ميزانيّةُ مقاطع الشهر الفعّالة لهذا العميل ومن أين جاءت (D-415): صفُّه إن كتبه لنفسه، وإلّا الافتراضُ العامّ.
 * **بوجود الصفّ لا بتساوي القيمتين** — تحتها الزرُّ ورسالةُ الردّ وصفحةُ الإعدادات معًا، فلا تفترق.
 */
export function videoMonthCapOf(a: Allowance): { readonly cap: number; readonly scope: 'org' | 'global' } {
  if (a.org !== undefined && a.org.overridden.has('monthly_video_cap_usd')) return { cap: a.org.settings.monthlyVideoCapUsd, scope: 'org' }
  return { cap: a.settings.monthlyVideoCapUsd, scope: 'global' }
}

/** الحكمُ نفسُه بلا قراءة — لمن قرأ الإعدادَ والاستهلاكَ مرّةً ويسأل عن عملين. */
export function blockerFor(duty: Duty, settings: Settings, usage: DailyUsage, scope?: CapScope): Blocker | null {
  if (settings.paused) return { kind: 'paused' }
  const tag = scope === undefined ? {} : { scope }
  if (duty === 'analyze' && usage.analyses >= settings.dailyAnalysisCap) {
    return { kind: 'analysis_cap', used: usage.analyses, cap: settings.dailyAnalysisCap, ...tag }
  }
  if (PAID.has(duty) && usage.spend >= settings.dailySpendCapUsd) {
    return { kind: 'spend_cap', used: usage.spend, cap: settings.dailySpendCapUsd, ...tag }
  }
  return null
}

/**
 * أيُسمح لهذه المنظّمة؟ (D-295): الإيقافُ والسقفُ العامُّ على المجموع أوّلًا، ثمّ سقفُ العميل على ما أنفقه هو
 * إن كان غيرَ منظّمة المالك. جملتان لا أربع: الإعداداتُ العامّةُ والفعّالةُ من قراءةٍ واحدة، والاستهلاكان كذلك.
 */
export async function checkAllowance(db: Db, duty: Duty, org: string = OWNER_ORG): Promise<Allowance> {
  const both = await readSettingsBoth(db, org)
  const usage = await usageTodayBoth(db, org)
  const settings = both.global
  let blocker = blockerFor(duty, settings, usage.all)
  if (org === OWNER_ORG) return { allowed: blocker === null, blocker, settings, usage: usage.all, videoMonth: usage.videoMonth }
  const mine = { settings: both.effective, usage: usage.mine, overridden: both.overridden }
  if (blocker === null && both.overridden.size > 0) blocker = blockerFor(duty, mine.settings, mine.usage, 'org')
  return { allowed: blocker === null, blocker, settings, usage: usage.all, org: mine, videoMonth: usage.videoMonth }
}

/** سببٌ يُقرأ، لا رمزُ خطأ. */
export function blockerReason(blocker: Blocker): string {
  switch (blocker.kind) {
    case 'paused':
      return 'النظام موقوف مؤقتا بقرار المالك — لا نداء مدفوع ولا نشر'
    case 'analysis_cap':
      return `بلغ ${blocker.scope === 'org' ? 'سقف هذا العميل من التحليل' : 'سقف التحليل اليوميّ'}: ${blocker.used} من ${blocker.cap}`
    case 'spend_cap':
      return `بلغ ${blocker.scope === 'org' ? 'سقف إنفاق هذا العميل' : 'سقف الإنفاق اليوميّ'}: ${money(blocker.used)} من ${money(blocker.cap)}`
    case 'provider_cap':
      return `بلغ سقف ${blocker.provider} اليوميّ: ${money(blocker.used)} من ${money(blocker.cap)}`
    case 'provider_disabled':
      return `${blocker.provider} معطَّل بقرار المالك`
    case 'video_cap':
      return blocker.cap === 0
        ? `${blocker.scope === 'org' ? 'سقف مقاطع هذا العميل' : 'سقف المقاطع اليوميّ'} صفر بقرار المالك — لا تحريك`
        : `بلغ ${blocker.scope === 'org' ? 'سقف مقاطع هذا العميل' : 'سقف المقاطع اليوميّ'}: ${blocker.used} من ${blocker.cap} — يُفتح غدًا، أو ارفعه من «الحدود»`
  }
}
