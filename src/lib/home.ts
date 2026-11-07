/**
 * الصفحةُ الرئيسيّة — **الرحلةُ أوّلًا لا الدفتر** (D-177).
 *
 * كانت «نظرة عامّة» تفتح على المال وصحّة الدورات: أربعةُ أرقامِ إنفاقٍ وتحليل،
 * ثمّ رسمُ الإنفاق، ثمّ «هل الآلةُ تعمل؟». والرحلةُ نفسُها (مصدرٌ ← مسوّدةٌ ←
 * صورةٌ ← اعتمادٌ ← موعدٌ ← نشرٌ ← نتائج) لم تكن في شاشةٍ واحدة: قائمةُ اليوم
 * الأوّل تختفي بعد أوّل مسوّدة، و«ما تطلبه» في صفحة المنصّة وحدها. فقال المالك:
 * «لا أستطيع أن أجد المراحل».
 *
 * فهنا ثلاثةُ أشياءَ نقيّة تُختبَر بلا قاعدة:
 * - `nextAction`: **فعلٌ واحدٌ** بأولويّةٍ مكتوبة — ما يوقف النشرَ أوّلًا.
 * - `journeySteps`: سبعُ محطّاتٍ بعدّها وحالها ورابطها.
 *
 * وما يُقرأ من القاعدة استعلامان مجمَّعان (`journeyCounts`) — لا قراءةُ الجداول.
 */
import type { Db } from './tokens'
import type { ChannelView } from './channels'
import type { Blocker } from './limits'
import type { Pulse } from './ops/heartbeat'
import { channelHealth, unsignedAccounts } from './channels'
import { counted, money, NOUNS, relativeTime } from './format'
import { clock, zoneNote } from './time/zone'

/** عدُّ المنشورات بحالها لكلّ منصّة — ومن القاعدة كلِّها لا من الستّين الأخيرة. */
export interface PlatformCounts {
  readonly draft: number
  readonly approved: number
  readonly queued: number
  readonly published: number
  readonly failed: number
  /**
   * ما فشل منها **في السبعة الأيّام الأخيرة** — بوقت آخر محاولةٍ فاشلة. فهو وحدَه
   * يُحمِّر الرئيسيّة: فشلٌ قديمٌ واحدٌ كان يُبقيها حمراءَ أبدًا فوق كلّ فعل،
   * وسببُه وزرُّ إعادته في صفحة منصّته. وغيابُه (عيّنةٌ لا تعرفه) يعني «كلُّه حديث».
   */
  readonly recentFailed?: number
  /** أقربُ موعدٍ في الطابور، بصيغة القاعدة. */
  readonly nextAt: string | null
}

export interface JourneyCounts {
  readonly perPlatform: Readonly<Record<string, PlatformCounts>>
  /** ما نُشر في السبعة الأيّام الأخيرة — من المحاولات الناجحة. */
  readonly publishedWeek: number
}

export const NO_COUNTS: JourneyCounts = { perPlatform: {}, publishedWeek: 0 }

const EMPTY: PlatformCounts = { draft: 0, approved: 0, queued: 0, published: 0, failed: 0, recentFailed: 0, nextAt: null }

/** نافذةُ «الحديث»: ما نُشر هذا الأسبوع، وما فشل فيه. */
const WEEK_MS = 7 * 86_400_000

/**
 * استعلامان مجمَّعان — **ولا تُسحَب الصفوف**.
 *
 * و`approved` يجمع `approved` و`edited`: سؤالٌ واحدٌ عند المالك (D-062).
 * وجدولٌ لم يُرحَّل يُقرأ صفرًا: الرئيسيّةُ تُفتح خاليةً ولا تسقط.
 */
export async function journeyCounts(db: Db, org: string, now: Date): Promise<JourneyCounts> {
  try {
    const since = new Date(now.getTime() - WEEK_MS).toISOString().slice(0, 19).replace('T', ' ')
    /*
     * ‏ووقتُ الفشل من آخر محاولةٍ فاشلة — فلا عمودَ «updated_at» في `posts`، وطريقا
     * الفشل في الناشر كلاهما يكتب محاولته قبل الحال. ومنشورٌ فاشلٌ بلا محاولةٍ
     * (صفٌّ قديم) يُؤرَّخ بموعده ثمّ بإنشائه — فلا يُحسَب حديثًا إلى الأبد
     */
    const { results } = await db
      .prepare(
        `SELECT platform, status, COUNT(*) AS n,
                MIN(CASE WHEN status = 'queued' THEN scheduled_at END) AS next_at,
                SUM(CASE WHEN status = 'failed' AND coalesce(
                      (SELECT MAX(pa.at) FROM publish_attempts pa
                        WHERE pa.post_id = posts.id AND pa.status = 'failed'),
                      scheduled_at, created_at) >= ? THEN 1 ELSE 0 END) AS recent
           FROM posts WHERE org_id = ? GROUP BY platform, status`,
      )
      .bind(since, org)
      .all<{ platform: string; status: string; n: number; next_at: string | null; recent: number | null }>()
    const perPlatform: Record<string, PlatformCounts> = {}
    for (const row of results) {
      const base = perPlatform[row.platform] ?? EMPTY
      const key = row.status === 'edited' ? 'approved' : row.status
      if (key !== 'draft' && key !== 'approved' && key !== 'queued' && key !== 'published' && key !== 'failed') continue
      perPlatform[row.platform] = {
        ...base,
        [key]: base[key] + row.n,
        recentFailed: (base.recentFailed ?? 0) + (key === 'failed' ? row.recent ?? 0 : 0),
        nextAt: key === 'queued' ? row.next_at : base.nextAt,
      }
    }
    const week = await db
      .prepare(
        `SELECT COUNT(DISTINCT pa.post_id) AS n FROM publish_attempts pa JOIN posts p ON p.id = pa.post_id
          WHERE p.org_id = ? AND pa.status = 'succeeded' AND pa.at >= ?`,
      )
      .bind(org, since)
      .first<{ n: number }>()
    return { perPlatform, publishedWeek: week?.n ?? 0 }
  } catch {
    return NO_COUNTS
  }
}

/** مجموعُ حالٍ على المنصّات كلّها. */
export function total(counts: JourneyCounts, key: Exclude<keyof PlatformCounts, 'nextAt' | 'recentFailed'>): number {
  return Object.values(counts.perPlatform).reduce((n, p) => n + p[key], 0)
}

/** فشلُ الأسبوع لمنصّة — وما لم يُعدّ بوقته يُعدّ حديثًا كلُّه. */
function recentFailures(p: PlatformCounts): number {
  return p.recentFailed ?? p.failed
}

/** فشلُ الأسبوع على المنصّات كلّها. */
function sumRecent(counts: JourneyCounts): number {
  return Object.values(counts.perPlatform).reduce((n, p) => n + recentFailures(p), 0)
}

/** أوّلُ منصّةٍ فيها فشلٌ حديث، وعددُه — ومنها الأحمرُ في الرئيسيّة كلِّها. */
function recentFailure(counts: JourneyCounts): { platform: string; n: number } | null {
  for (const [platform, p] of Object.entries(counts.perPlatform)) {
    const n = recentFailures(p)
    if (n > 0) return { platform, n }
  }
  return null
}

/** أقربُ موعدٍ على المنصّات كلّها، ومنصّتُه. */
export function nextScheduled(counts: JourneyCounts): { platform: string; at: string } | null {
  let best: { platform: string; at: string } | null = null
  for (const [platform, p] of Object.entries(counts.perPlatform)) {
    if (p.nextAt !== null && (best === null || p.nextAt < best.at)) best = { platform, at: p.nextAt }
  }
  return best
}

/**
 * أوّلُ ما ينتظر في كلّ محطّة — **معرّفُ بطاقةٍ مرسومةٍ في «المنشورات»**.
 *
 * كانت المحطّاتُ الأربعُ كلُّها `#posts`: المحطّةُ تعرف العددَ ولا تعرف المكان،
 * فينزل المالكُ إلى رأس لوحٍ طولُه آلافُ البكسلات (‏١٢٩٠px على الهاتف حتّى
 * «اعتمد»، و‏٣٠٩٠ حتّى «جدوِل»). **والمعرّفُ من الستّين المرسومة نفسِها لا
 * من استعلامٍ ثانٍ**: بطاقةٌ لم تُرسَم مرساةٌ لا تجد شيئًا فترتدّ إلى الرئيسيّة.
 * وغيابُه يُبقي `#posts`. وهذا جسرٌ إلى روابط اللوح المفلترة (الخطّة 5.5/6).
 */
export interface HomeFirsts {
  /** أوّلُ مسوّدةٍ تنتظر القرار — بترتيب اللوح، الأحدثُ أوّلًا. */
  readonly waiting: string | null
  /** أوّلُ معتمَدٍ بلا موعد. */
  readonly unscheduled: string | null
  /** أوّلُ مفتوحٍ بلا صورة. */
  readonly withoutImage: string | null
}

/** ما تقرؤه الرئيسيّة — حقائقُ في اليد، ولا شيءَ يُحسَب مرّتين. */
export interface HomeFacts {
  readonly channels: readonly ChannelView[]
  readonly counts: JourneyCounts
  readonly paused: boolean
  readonly sources: { readonly total: number; readonly analyzed: number }
  /** مسوّداتٌ لم يُبَتّ فيها ولا صورةَ جاهزةَ لها — من الستّين الأخيرة. */
  readonly withoutImage: number
  readonly withImage: number
  readonly openSuggestions: number
  readonly firsts: HomeFirsts
  /** نبضُ الدورات (D-158) — ومنه يُعرف أنّ الإرسالَ توقّف والحبّةُ خضراء. */
  readonly pulses: readonly Pulse[]
  /** حاجزُ الكتابة المدفوعة — من `blockerFor('draft', …)` الذي يحكم به الزرُّ نفسُه. */
  readonly blocker: Blocker | null
  /** منطقةُ المالك من كعكته (D-173) — ومنها ساعةُ انفتاح السقف بتوقيته. */
  readonly zone: string | null
  /** ما جُدول ولم يُنشر بعد — منصّتُه وموعدُه (UTC)، لشريط الأسبوع (D-194). */
  readonly scheduled?: readonly { readonly platform: string; readonly at: string }[]
  /** متى كُتب كلُّ منشورٍ من الستّين المرسومة (UTC) — لأعمدة الأيّام (D-265). */
  readonly written?: readonly string[]
}

export type StepState = 'done' | 'now' | 'waiting' | 'failed'

/**
 * مرساةُ بطاقةٍ في «المنشورات» — أو رأسُ اللوح إن لم تُعرَف.
 *
 * ‏`d-` البطاقةُ كلُّها، و`s-` نموذجُ جدولتها، و`i-` لوحُ صورتها. **وما لم يُرسَم
 * منها على بطاقةٍ بعينها** (معتمَدٌ بلا قناةٍ لا نموذجَ جدولةٍ له) تنزل `show()`
 * إلى البطاقة نفسِها (`panelScript.ts`) — فلا يرتدّ الرابطُ إلى الرئيسيّة.
 */
function cardAt(id: string | null, part: 'd' | 's' | 'i'): string {
  return id === null ? '#posts' : `#${part}-${id}`
}

/**
 * سجلُّ ما فشل على منصّة — **صفُّ الفشل بسببه وزرِّ إعادته**، لا رأسُ صفحتها.
 * كان «افتح LinkedIn» يُنزل إلى رأسها وزرُّ «أعده» على بُعد ‏٩٠٩px (ر-8).
 */
function failedHref(platform: string): string {
  return `/panel/channels/${encodeURIComponent(platform)}?filter=failed#history`
}

export interface JourneyStep {
  readonly key: 'source' | 'draft' | 'image' | 'approve' | 'schedule' | 'publish' | 'results'
  readonly title: string
  readonly state: StepState
  /** سطرٌ واحدٌ تحت العنوان: العددُ بعربيّةٍ صحيحة وما يعنيه. */
  readonly note: string
  readonly href: string
  /**
   * كم مرّ بالمحطّة — **طولُ شريطها في القمع** (D-194). المصادرُ كلُّها، ثمّ ما كُتب، ثمّ ما
   * رُسمت صورتُه، ثمّ ما اعتُمد فما بعده، ثمّ ما جُدول فما بعده، ثمّ ما نُشر، ثمّ ما ينتظر من النتائج.
   */
  readonly count: number
}

/**
 * سبعُ محطّات — **وحالُ كلٍّ من عدّها لا من ترتيبها**.
 *
 * فالمحطّةُ «تنتظرك» حين فيها ما يحتاج قرارك، و«تامّة» حين مرّ بها شيء،
 * و«تنتظر» حين لم يصلها شيءٌ بعد. والنشرُ وحده «يسقط»: منشورٌ فشل.
 */
type Leg = Omit<JourneyStep, 'count'>

export function journeySteps(f: HomeFacts): JourneyStep[] {
  const c = f.counts
  const drafts = total(c, 'draft')
  const approved = total(c, 'approved')
  const queued = total(c, 'queued')
  const published = total(c, 'published')
  const failed = total(c, 'failed')
  const pending = f.sources.total - f.sources.analyzed
  const next = nextScheduled(c)
  const written = drafts + approved + queued + published + failed

  /*
   * ‏و«لا مصدر» لا تنتظرك حين في الرحلة منشورات: المقطعُ المرفوع والخطّةُ من ملفٍّ
   * يكتبان بلا Drive (D-180، D-181)، فمحطّةٌ «تنتظرك» قبلها تخطف التركيزَ ممّا ينتظر فعلًا
   */
  const source: Leg = f.sources.total === 0
    ? written > 0
      ? { key: 'source', title: 'المصدر', state: 'done', note: 'لا ملفّ في Drive — وهو اختياريّ', href: '#sources' }
      : { key: 'source', title: 'المصدر', state: 'now', note: 'لا ملفّ بعد — امسح مجلّد Drive', href: '#sources' }
    : pending > 0
      ? { key: 'source', title: 'المصدر', state: 'now', note: `ينتظر التحليل ${counted(pending, NOUNS.source)}`, href: '#sources' }
      : { key: 'source', title: 'المصدر', state: 'done', note: `حُلّل ${counted(f.sources.analyzed, NOUNS.source)}`, href: '#sources' }

  // ‏و«المسوّدة» محطّةُ الكتابة: بطاقتُها آخرُ اللوح (‏٥٢٩٢px على الهاتف)، و`#posts` يُنزل إلى أوّله
  const draft: Leg = written > 0
    ? { key: 'draft', title: 'المسوّدة', state: 'done', note: `كُتبت ${counted(written, NOUNS.draft)}`, href: '#write' }
    : f.sources.analyzed > 0
      ? { key: 'draft', title: 'المسوّدة', state: 'now', note: 'اكتب أوّل مسوّدة من مصدر محلَّل', href: '#write' }
      : { key: 'draft', title: 'المسوّدة', state: 'waiting', note: 'بعد تحليل مصدر', href: '#write' }

  const image: Leg = f.withoutImage > 0
    ? { key: 'image', title: 'الصورة', state: 'now', note: `بلا صورة: ${counted(f.withoutImage, NOUNS.draft)}`, href: cardAt(f.firsts.withoutImage, 'i') }
    : f.withImage > 0
      ? { key: 'image', title: 'الصورة', state: 'done', note: `رُسمت ${counted(f.withImage, NOUNS.image)}`, href: '#posts' }
      : { key: 'image', title: 'الصورة', state: 'waiting', note: 'إنفوجرافيك من نصّ المنشور', href: '#posts' }

  // ‏والفاشلُ مرّ بالاعتماد والموعد قبل أن يسقط: القيدُ في القاعدة لا يُدخل الطابورَ بلا اعتماد
  const approve: Leg = drafts > 0
    ? { key: 'approve', title: 'الاعتماد', state: 'now', note: `تنتظر قرارك ${counted(drafts, NOUNS.draft)}`, href: cardAt(f.firsts.waiting, 'd') }
    : approved + queued + published + failed > 0
      ? { key: 'approve', title: 'الاعتماد', state: 'done', note: 'لا شيء ينتظر قرارك', href: '#posts' }
      : { key: 'approve', title: 'الاعتماد', state: 'waiting', note: 'لا يُنشر شيء قبل اعتمادك', href: '#posts' }

  // ‏و«تامّةٌ» بما جُدول ولو نُشر كلُّه: طابورٌ فارغٌ بعد النشر ليس «بعد الاعتماد»
  const schedule: Leg = approved > 0
    ? { key: 'schedule', title: 'الموعد', state: 'now', note: `بلا موعد: ${counted(approved, NOUNS.post)}`, href: cardAt(f.firsts.unscheduled, 's') }
    : queued > 0
      ? { key: 'schedule', title: 'الموعد', state: 'done', note: `جُدول ${counted(queued, NOUNS.post)}`, href: '#posts' }
      : published + failed > 0
        ? { key: 'schedule', title: 'الموعد', state: 'done', note: 'لا موعد قادم — مضى ما جُدول', href: '#posts' }
        : { key: 'schedule', title: 'الموعد', state: 'waiting', note: 'بعد الاعتماد', href: '#posts' }

  // ‏والسقوطُ بفشل الأسبوع وحده — كما في «خطوتك التالية»، فلا تقول المحطّةُ غيرَ ما يقوله الفعل
  const recent = recentFailure(c)
  const publish: Leg = recent !== null
    ? {
        key: 'publish', title: 'النشر', state: 'failed',
        note: `فشل ${counted(sumRecent(c), NOUNS.post)} — والسبب في صفحة المنصّة`,
        href: failedHref(recent.platform),
      }
    : c.publishedWeek > 0
      ? { key: 'publish', title: 'النشر', state: 'done', note: `نُشر هذا الأسبوع ${counted(c.publishedWeek, NOUNS.post)}`, href: '#channels' }
      : next !== null
        ? { key: 'publish', title: 'النشر', state: 'waiting', note: 'التالي في موعده', href: `/panel/channels/${next.platform}` }
        : published > 0
          ? { key: 'publish', title: 'النشر', state: 'done', note: `نُشر ${counted(published, NOUNS.post)}`, href: '#channels' }
          : failed > 0
            // ‏والقديمُ يُذكَر ولا يُسقِط: «في موعده بعد الجدولة» عن منشورٍ جُدول وسقط كذب
            ? {
                key: 'publish', title: 'النشر', state: 'waiting',
                note: `فشل ${counted(failed, NOUNS.post)} قبل أسبوع فأكثر`,
                href: failedHref(Object.entries(c.perPlatform).find(([, p]) => p.failed > 0)?.[0] ?? ''),
              }
            : { key: 'publish', title: 'النشر', state: 'waiting', note: 'في موعده بعد الجدولة', href: '#channels' }

  const results: Leg = f.openSuggestions > 0
    ? { key: 'results', title: 'النتائج', state: 'now', note: `تنتظر قرارك ${counted(f.openSuggestions, NOUNS.suggestion)}`, href: '/panel/report' }
    : published > 0
      ? { key: 'results', title: 'النتائج', state: 'done', note: 'التقرير الأسبوعيّ', href: '/panel/report' }
      : { key: 'results', title: 'النتائج', state: 'waiting', note: 'بعد أوّل نشر', href: '/panel/report' }

  const counts: Readonly<Record<JourneyStep['key'], number>> = {
    source: f.sources.total, draft: written, image: f.withImage,
    approve: approved + queued + published + failed, schedule: queued + published + failed,
    publish: published, results: f.openSuggestions,
  }
  return [source, draft, image, approve, schedule, publish, results].map((s) => ({ ...s, count: counts[s.key] }))
}

export interface NextAction {
  readonly tone: 'bad' | 'warn' | 'ok'
  readonly text: string
  readonly label: string
  readonly href: string
  /**
   * المحطّةُ التي يتكلّم عنها الفعل — **ومنها تُميَّز المحطّةُ في الرحلة**.
   * كانت أوّلَ «تنتظرك» بترتيبها: «المصدر — ينتظر التحليل» مميَّزةً والفعلُ
   * فوقها يقول «فشل منشور». فلا تقول الرحلةُ غيرَ ما يقوله الفعل.
   */
  readonly step?: JourneyStep['key']
}

/**
 * دورةُ الإرسال إن تأخّرت أو فشلت — **فلا يخرج منشورٌ مجدولٌ في موعده**.
 *
 * و`publish` لا تُحسَب هنا: فشلُ دفعتها فشلُ منشوراتٍ يقوله فرعُ الفشل بسببه،
 * ولا موعدَ لها فلا تتأخّر. والإرسالُ وحده يعني «لا شيءَ يخرج» (D-158).
 */
function stalledDispatch(pulses: readonly Pulse[]): Pulse | null {
  return pulses.find((p) => p.job === 'dispatch' && (p.state === 'late' || p.state === 'failed')) ?? null
}

/**
 * حبّةُ النظام في الرأس — **من النبض لا من مفتاح الإيقاف وحده**.
 *
 * كانت `paused ? 'موقوف' : 'يعمل'`، فبقيت خضراءَ والدوراتُ متوقّفةٌ منذ ثلاثة
 * أيّام، والإشارةُ الوحيدةُ في بطاقة «هل الآلةُ تعمل؟» على بُعد ثلاث شاشات.
 * و`tone` صنفُ الحبّة: `on` و`off` (برتقاليّ) و`bad`.
 */
export function systemPill(paused: boolean, pulses: readonly Pulse[]): { readonly tone: 'on' | 'off' | 'bad'; readonly text: string } {
  if (paused) return { tone: 'off', text: 'موقوف مؤقتا' }
  if (stalledDispatch(pulses) !== null) return { tone: 'bad', text: 'النشر متوقّف' }
  if (pulses.some((p) => p.state === 'late' || p.state === 'failed')) return { tone: 'off', text: 'يعمل بتأخّر' }
  return { tone: 'on', text: 'يعمل' }
}

/**
 * متى يُفتح سقفُ اليوم — **بتوقيت المالك، والرياض حين لا يُعرف** (D-201).
 *
 * والدفترُ يُجمَع بيوم UTC (`limits.ts`)، فالسقفُ يُفتح عند منتصف ليله. وقولُ
 * «منتصف الليل UTC» وحده يُلزم المالكَ بحسابٍ في رأسه (الخطّة 8.2).
 */
function capReopens(now: Date, zone: string | null): string {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return `الساعة ${clock(midnight, zone)}${zoneNote(zone)}`
}

/**
 * لماذا زرُّ الكتابة معطَّل — **سببٌ وموضعُ إصلاحه** (الخطّة 7.1).
 *
 * كان الزرُّ مفعَّلًا والسقفُ بالغ: يُضغَط فيُردّ، ويُرمى المالكُ إلى رأس اللوح
 * برسالةٍ «بلغ سقف الإنفاق» بلا ما يفعله. والحكمُ من `blockerFor('draft', …)`
 * نفسِه الذي يحكم به النداء، فلا يفترق الزرُّ عن الحارس.
 */
export function writeBlock(
  blocker: Blocker | null,
  now: Date,
  zone: string | null,
): { readonly text: string; readonly label: string; readonly href: string } | null {
  if (blocker === null) return null
  if (blocker.kind === 'paused') {
    return { text: 'النظام موقوف بقرارك — فلا كتابة.', label: 'استأنف من الحدود', href: '#limits' }
  }
  if (blocker.kind === 'spend_cap') {
    return {
      text: `بلغت سقف الإنفاق اليوم: ${money(blocker.used)} من ${money(blocker.cap)}. يُفتح ${capReopens(now, zone)}.`,
      label: 'ارفع السقف من الحدود',
      href: '#c2',
    }
  }
  return null
}

/**
 * **فعلٌ واحد** — والترتيبُ مكتوبٌ لا مُستنتَج:
 * ما يوقف النشرَ صامتًا (إذنٌ انتهى، حسابٌ بلا إذن، إيقاف، إرسالٌ متوقّف، فشل)،
 * ثمّ ما يوقف التوليد (سقفُ اليوم)، ثمّ ما يفتح الطريق (ربطُ منصّة، مصدر)،
 * ثمّ ما ينتظر قرارك (مسوّدات، مواعيد).
 */
export function nextAction(f: HomeFacts, now: Date = new Date()): NextAction {
  const stale = f.channels.find((c) => c.state === 'needs_reauth')
  if (stale !== undefined) {
    return {
      tone: 'bad', text: `انتهى إذن ${stale.spec.label} — والنشر عليها متوقّف حتّى تجدّده.`,
      label: `جدّد إذن ${stale.spec.label}`, href: `/oauth/${stale.spec.id}/start`,
    }
  }
  const unsigned = f.channels.find((c) => unsignedAccounts(c).length > 0)
  if (unsigned !== undefined) {
    return {
      tone: 'bad', text: `${unsigned.spec.label} محفوظة بلا إذن — أوّل منشور مجدول عليها يسقط.`,
      label: `أعد ربط ${unsigned.spec.label}`, href: `/oauth/${unsigned.spec.id}/start`,
    }
  }
  if (f.paused) {
    return { tone: 'warn', text: 'النظام موقوف بقرارك — لا مسح ولا تحليل ولا نشر.', label: 'استأنف من الإعدادات', href: '#limits' }
  }
  /*
   * ‏والإرسالُ المتوقّف قبل الفشل: الفشلُ يُرى بسببه، والتوقّفُ صامت — كانت الحبّةُ
   * ‏خضراءَ و«خطوتك التالية» كما هي ودوراتُ النشر متوقّفةٌ منذ ثلاثة أيّام
   */
  const stall = stalledDispatch(f.pulses)
  if (stall !== null) {
    const when = stall.beat === null ? '' : relativeTime(stall.beat.at, now)
    return {
      tone: 'bad',
      text: stall.state === 'failed'
        ? `النشر المجدول متوقّف — فشل الإرسال آخر مرّة${when === '' ? '' : ` (${when})`}، فلا يخرج منشور في موعده.`
        : `النشر المجدول متوقّف — آخر مرّة عمل فيها الإرسال ${when}، فلا يخرج منشور في موعده.`,
      label: 'افحص الآلة', href: '#machine', step: 'publish',
    }
  }
  // ‏وفشلُ الأسبوع وحده: القديمُ يبقى بسببه وزرِّ إعادته في صفحة منصّته، ولا يحجب كلَّ فعلٍ بعده
  const failure = recentFailure(f.counts)
  if (failure !== null) {
    const label = f.channels.find((c) => c.spec.id === failure.platform)?.spec.label ?? failure.platform
    return {
      tone: 'bad', text: `فشل على ${label} ${counted(failure.n, NOUNS.post)} — والسبب وزرّ الإعادة في سجلّها.`,
      label: failure.n === 1 ? 'أصلح المنشور' : 'أصلح المنشورات', href: failedHref(failure.platform), step: 'publish',
    }
  }
  // ‏وسقفُ اليوم لا يوقف النشر (D-169) ويوقف كلَّ ما يُولَّد: يُقال هنا لا في بلاطةٍ على بُعد شاشتين
  if (f.blocker?.kind === 'spend_cap') {
    return {
      tone: 'warn',
      text: `بلغ إنفاق اليوم سقفَه: ${money(f.blocker.used)} من ${money(f.blocker.cap)}. لا كتابة ولا صورة حتّى ${
        capReopens(now, f.zone)}، والنشر ماض في موعده.`,
      label: 'ارفع السقف', href: '#c2',
    }
  }
  const linked = f.channels.some((c) => c.state === 'linked')
  if (!linked) {
    return { tone: 'warn', text: 'لا منصّة متّصلة — صدى يكتب ولا ينشر حتّى تربط واحدة.', label: 'اربط أوّل منصّة', href: '#channels' }
  }
  const drafts = total(f.counts, 'draft')
  const approved = total(f.counts, 'approved')
  // ‏و«لا مصدر» حين لا شيءَ أصلًا: المقطعُ والخطّةُ من ملفٍّ يكتبان بلا Drive (D-180، D-181)
  const written = drafts + approved + total(f.counts, 'queued') + total(f.counts, 'published') + total(f.counts, 'failed')
  if (f.sources.total === 0 && written === 0) {
    return { tone: 'warn', text: 'لا مصدر بعد — ضع ملفًّا في مجلّد Drive المشترَك ثمّ امسحه.', label: 'اذهب إلى المصادر', href: '#sources', step: 'source' }
  }
  const pending = f.sources.total - f.sources.analyzed
  if (drafts === 0 && f.sources.analyzed === 0 && pending > 0) {
    return { tone: 'ok', text: `ينتظر التحليل ${counted(pending, NOUNS.source)} — ومنه تُكتب المسوّدات.`, label: 'حلّل مصدرًا', href: '#sources', step: 'source' }
  }
  // ‏والزرُّ يُنزل إلى البطاقة التي يتكلّم عنها — الأولى بترتيب اللوح — لا إلى رأسه
  if (drafts > 0) {
    return {
      tone: 'ok', text: `تنتظر قرارك ${counted(drafts, NOUNS.draft)} — ولا يُنشر شيء قبله.`,
      label: 'راجع المسوّدات', href: cardAt(f.firsts.waiting, 'd'), step: 'approve',
    }
  }
  if (approved > 0) {
    return {
      tone: 'ok', text: `معتمَد بلا موعد: ${counted(approved, NOUNS.post)}.`,
      label: 'حدّد المواعيد', href: cardAt(f.firsts.unscheduled, 's'), step: 'schedule',
    }
  }
  const next = nextScheduled(f.counts)
  if (next !== null) {
    const label = f.channels.find((c) => c.spec.id === next.platform)?.spec.label ?? next.platform
    return { tone: 'ok', text: `كلّ شيء على المسار — والتالي على ${label}.`, label: `افتح ${label}`, href: `/panel/channels/${next.platform}` }
  }
  /*
   * ‏**والدورةُ الجديدةُ من فكرة** (D-190): «اكتب من فكرتك» لا يحتاج مصدرًا ولا تحليلًا — جملةٌ
   * ‏تكفي — فهو أقصرُ الأبواب، وكان الفعلُ «اكتب من مصدر» يَعِد بما لا يُوفى بلا مصدرٍ محلَّل.
   * ‏وإلى البطاقة نفسِها: `#posts` كان يُنزل إلى رأس اللوح، والبطاقةُ في آخره.
   */
  return {
    tone: 'ok',
    text: f.sources.total === 0
      ? 'لا شيء ينتظرك — اكتب فكرتك بجملة، أو ارفع مقطعًا، لتبدأ دورةً جديدة.'
      : 'لا شيء ينتظرك — اكتب فكرتك بجملة، أو من مصدر محلَّل، لتبدأ دورةً جديدة.',
    label: 'اكتب من فكرة', href: '#idea', step: 'draft',
  }
}


/**
 * ‏**قائمةُ البدء «1 من 3»** (خطّة التصميم 5.5 «أوّل تشغيل» · D-326): اربط أوّل حساب، ثمّ أضف ما يُكتب منه، ثمّ اعتمد أوّل
 * ‏منشور. كانت الرئيسيّةُ الخالية «خطوتُك التالية» وحدَها، ولا يرى المالكُ أين هو من البدء ولا كم بقي. **وتُحسب من الحقائق نفسِها**
 * ‏فلا عمودَ ولا علامةَ تُخزَّن: الخطوةُ تتمّ بوقوعها، والقائمةُ تختفي حين تكتمل.
 *
 * ‏**ومن نشر مرّةً لا يعود إلى البدء** (أو فشل نشرُه: الفشلُ بعد اعتمادٍ وموعد) ولو انقطعت حساباتُه بعدها — تلك يقولها الشريطُ
 * ‏و«خطوتك التالية»، لا قائمةُ أوّلِ يوم. و«المادّة» مصدرٌ في Drive أو أيُّ منشورٍ كُتب (من فكرةٍ بلا مصدر، أو من مقطع).
 */
export interface FirstRun {
  readonly steps: readonly { readonly key: 'link' | 'material' | 'approve'; readonly done: boolean }[]
  /** أوّلُ ما لم يتمّ (من الصفر). */
  readonly current: number
}

export function firstRun(f: HomeFacts): FirstRun | null {
  if (total(f.counts, 'published') + total(f.counts, 'failed') > 0) return null
  const approved = total(f.counts, 'approved') + total(f.counts, 'queued')
  const written = total(f.counts, 'draft') + approved
  const steps = [
    { key: 'link' as const, done: f.channels.some((c) => c.accounts.length > 0) },
    { key: 'material' as const, done: f.sources.total > 0 || written > 0 },
    { key: 'approve' as const, done: approved > 0 },
  ]
  const current = steps.findIndex((s) => !s.done)
  return current < 0 ? null : { steps, current }
}
