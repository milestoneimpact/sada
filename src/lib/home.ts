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
 * - `platformTile`: حالُ كلّ منصّةٍ **وزرٌّ واحد** يناسبها.
 *
 * وما يُقرأ من القاعدة استعلامان مجمَّعان (`journeyCounts`) — لا قراءةُ الجداول.
 */
import type { Db } from './tokens'
import type { ChannelView } from './channels'
import { unsignedAccounts } from './channels'
import { counted, NOUNS } from './format'

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
export async function journeyCounts(db: Db, now: Date): Promise<JourneyCounts> {
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
           FROM posts GROUP BY platform, status`,
      )
      .bind(since)
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
      .prepare(`SELECT COUNT(DISTINCT post_id) AS n FROM publish_attempts WHERE status = 'succeeded' AND at >= ?`)
      .bind(since)
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
}

export type StepState = 'done' | 'now' | 'waiting' | 'failed'

export interface JourneyStep {
  readonly key: 'source' | 'draft' | 'image' | 'approve' | 'schedule' | 'publish' | 'results'
  readonly title: string
  readonly state: StepState
  /** سطرٌ واحدٌ تحت العنوان: العددُ بعربيّةٍ صحيحة وما يعنيه. */
  readonly note: string
  readonly href: string
}

/**
 * سبعُ محطّات — **وحالُ كلٍّ من عدّها لا من ترتيبها**.
 *
 * فالمحطّةُ «تنتظرك» حين فيها ما يحتاج قرارك، و«تامّة» حين مرّ بها شيء،
 * و«تنتظر» حين لم يصلها شيءٌ بعد. والنشرُ وحده «يسقط»: منشورٌ فشل.
 */
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
  const source: JourneyStep = f.sources.total === 0
    ? written > 0
      ? { key: 'source', title: 'المصدر', state: 'done', note: 'لا ملفّ في Drive — وهو اختياريّ', href: '#sources' }
      : { key: 'source', title: 'المصدر', state: 'now', note: 'لا ملفّ بعد — امسح مجلّد Drive', href: '#sources' }
    : pending > 0
      ? { key: 'source', title: 'المصدر', state: 'now', note: `ينتظر التحليلَ ${counted(pending, NOUNS.source)}`, href: '#sources' }
      : { key: 'source', title: 'المصدر', state: 'done', note: `حُلّل ${counted(f.sources.analyzed, NOUNS.source)}`, href: '#sources' }

  const draft: JourneyStep = written > 0
    ? { key: 'draft', title: 'المسوّدة', state: 'done', note: `كُتبت ${counted(written, NOUNS.draft)}`, href: '#posts' }
    : f.sources.analyzed > 0
      ? { key: 'draft', title: 'المسوّدة', state: 'now', note: 'اكتب أوّلَ مسوّدةٍ من مصدرٍ محلَّل', href: '#posts' }
      : { key: 'draft', title: 'المسوّدة', state: 'waiting', note: 'بعد تحليل مصدر', href: '#posts' }

  const image: JourneyStep = f.withoutImage > 0
    ? { key: 'image', title: 'الصورة', state: 'now', note: `بلا صورة: ${counted(f.withoutImage, NOUNS.draft)}`, href: '#posts' }
    : f.withImage > 0
      ? { key: 'image', title: 'الصورة', state: 'done', note: `رُسمت ${counted(f.withImage, NOUNS.image)}`, href: '#posts' }
      : { key: 'image', title: 'الصورة', state: 'waiting', note: 'إنفوجرافيك من نصّ المنشور', href: '#posts' }

  // ‏والفاشلُ مرّ بالاعتماد والموعد قبل أن يسقط: القيدُ في القاعدة لا يُدخل الطابورَ بلا اعتماد
  const approve: JourneyStep = drafts > 0
    ? { key: 'approve', title: 'الاعتماد', state: 'now', note: `تنتظر قرارك ${counted(drafts, NOUNS.draft)}`, href: '#posts' }
    : approved + queued + published + failed > 0
      ? { key: 'approve', title: 'الاعتماد', state: 'done', note: 'لا شيءَ ينتظر قرارك', href: '#posts' }
      : { key: 'approve', title: 'الاعتماد', state: 'waiting', note: 'لا يُنشر شيءٌ قبل اعتمادك', href: '#posts' }

  // ‏و«تامّةٌ» بما جُدول ولو نُشر كلُّه: طابورٌ فارغٌ بعد النشر ليس «بعد الاعتماد»
  const schedule: JourneyStep = approved > 0
    ? { key: 'schedule', title: 'الموعد', state: 'now', note: `بلا موعد: ${counted(approved, NOUNS.post)}`, href: '#posts' }
    : queued > 0
      ? { key: 'schedule', title: 'الموعد', state: 'done', note: `جُدول ${counted(queued, NOUNS.post)}`, href: '#posts' }
      : published + failed > 0
        ? { key: 'schedule', title: 'الموعد', state: 'done', note: 'لا موعدَ قادم — مضى ما جُدول', href: '#posts' }
        : { key: 'schedule', title: 'الموعد', state: 'waiting', note: 'بعد الاعتماد', href: '#posts' }

  // ‏والسقوطُ بفشل الأسبوع وحده — كما في «خطوتك التالية»، فلا تقول المحطّةُ غيرَ ما يقوله الفعل
  const recent = recentFailure(c)
  const publish: JourneyStep = recent !== null
    ? {
        key: 'publish', title: 'النشر', state: 'failed',
        note: `فشل ${counted(sumRecent(c), NOUNS.post)} — والسببُ في صفحة المنصّة`,
        href: `/panel/channels/${recent.platform}`,
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
                note: `فشل ${counted(failed, NOUNS.post)} قبل أسبوعٍ فأكثر`,
                href: `/panel/channels/${Object.entries(c.perPlatform).find(([, p]) => p.failed > 0)?.[0] ?? ''}`,
              }
            : { key: 'publish', title: 'النشر', state: 'waiting', note: 'في موعده بعد الجدولة', href: '#channels' }

  const results: JourneyStep = f.openSuggestions > 0
    ? { key: 'results', title: 'النتائج', state: 'now', note: `تنتظر قرارك ${counted(f.openSuggestions, NOUNS.suggestion)}`, href: '/panel/report' }
    : published > 0
      ? { key: 'results', title: 'النتائج', state: 'done', note: 'التقريرُ الأسبوعيّ', href: '/panel/report' }
      : { key: 'results', title: 'النتائج', state: 'waiting', note: 'بعد أوّل نشر', href: '/panel/report' }

  return [source, draft, image, approve, schedule, publish, results]
}

export interface NextAction {
  readonly tone: 'bad' | 'warn' | 'ok'
  readonly text: string
  readonly label: string
  readonly href: string
}

/**
 * **فعلٌ واحد** — والترتيبُ مكتوبٌ لا مُستنتَج:
 * ما يوقف النشرَ صامتًا (إذنٌ انتهى، حسابٌ بلا إذن، إيقاف، فشل)، ثمّ ما يفتح
 * الطريق (ربطُ منصّة، مصدر)، ثمّ ما ينتظر قرارك (مسوّدات، مواعيد).
 */
export function nextAction(f: HomeFacts): NextAction {
  const stale = f.channels.find((c) => c.state === 'needs_reauth')
  if (stale !== undefined) {
    return {
      tone: 'bad', text: `انتهى إذنُ ${stale.spec.label} — والنشرُ عليها متوقّفٌ حتّى تجدّده.`,
      label: `جدّد إذن ${stale.spec.label}`, href: `/oauth/${stale.spec.id}/start`,
    }
  }
  const unsigned = f.channels.find((c) => unsignedAccounts(c).length > 0)
  if (unsigned !== undefined) {
    return {
      tone: 'bad', text: `${unsigned.spec.label} محفوظةٌ بلا إذن — أوّلُ منشورٍ مجدولٍ عليها يسقط.`,
      label: `أعد ربط ${unsigned.spec.label}`, href: `/oauth/${unsigned.spec.id}/start`,
    }
  }
  if (f.paused) {
    return { tone: 'warn', text: 'النظامُ موقوفٌ بقرارك — لا مسحَ ولا تحليلَ ولا نشر.', label: 'استأنف من الإعدادات', href: '#settings' }
  }
  // ‏وفشلُ الأسبوع وحده: القديمُ يبقى بسببه وزرِّ إعادته في صفحة منصّته، ولا يحجب كلَّ فعلٍ بعده
  const failure = recentFailure(f.counts)
  if (failure !== null) {
    const label = f.channels.find((c) => c.spec.id === failure.platform)?.spec.label ?? failure.platform
    return {
      tone: 'bad', text: `فشل على ${label} ${counted(failure.n, NOUNS.post)} — والسببُ وزرُّ الإعادة في صفحتها.`,
      label: `افتح ${label}`, href: `/panel/channels/${failure.platform}`,
    }
  }
  const linked = f.channels.some((c) => c.state === 'linked')
  if (!linked) {
    return { tone: 'warn', text: 'لا منصّةَ متّصلة — صدى يكتب ولا ينشر حتّى تربط واحدة.', label: 'اربط أوّلَ منصّة', href: '#channels' }
  }
  const drafts = total(f.counts, 'draft')
  const approved = total(f.counts, 'approved')
  // ‏و«لا مصدر» حين لا شيءَ أصلًا: المقطعُ والخطّةُ من ملفٍّ يكتبان بلا Drive (D-180، D-181)
  const written = drafts + approved + total(f.counts, 'queued') + total(f.counts, 'published') + total(f.counts, 'failed')
  if (f.sources.total === 0 && written === 0) {
    return { tone: 'warn', text: 'لا مصدرَ بعد — ضع ملفًّا في مجلّد Drive المشترَك ثمّ امسحه.', label: 'اذهب إلى المصادر', href: '#sources' }
  }
  const pending = f.sources.total - f.sources.analyzed
  if (drafts === 0 && f.sources.analyzed === 0 && pending > 0) {
    return { tone: 'ok', text: `ينتظر التحليلَ ${counted(pending, NOUNS.source)} — ومنه تُكتب المسوّدات.`, label: 'حلّل مصدرًا', href: '#sources' }
  }
  if (drafts > 0) {
    return { tone: 'ok', text: `تنتظر قرارك ${counted(drafts, NOUNS.draft)} — ولا يُنشر شيءٌ قبله.`, label: 'راجع المسوّدات', href: '#posts' }
  }
  if (approved > 0) {
    return { tone: 'ok', text: `معتمَدٌ بلا موعد: ${counted(approved, NOUNS.post)}.`, label: 'حدّد المواعيد', href: '#posts' }
  }
  const next = nextScheduled(f.counts)
  if (next !== null) {
    const label = f.channels.find((c) => c.spec.id === next.platform)?.spec.label ?? next.platform
    return { tone: 'ok', text: `كلُّ شيءٍ على المسار — والتالي على ${label}.`, label: `افتح ${label}`, href: `/panel/channels/${next.platform}` }
  }
  // ‏و«اكتب من مصدر» وعدٌ لا يُوفى بلا مصدر: فالدورةُ الجديدةُ من مقطعٍ يُرفَع
  if (f.sources.total === 0) {
    return { tone: 'ok', text: 'لا شيءَ ينتظرك — ارفع مقطعًا أو استورد خطّةً لتبدأ دورةً جديدة.', label: 'ارفع مقطعًا', href: '#videos' }
  }
  return { tone: 'ok', text: 'لا شيءَ ينتظرك — اكتب من مصدرٍ محلَّلٍ لتبدأ دورةً جديدة.', label: 'اكتب من مصدر', href: '#posts' }
}

export interface PlatformTile {
  readonly id: string
  readonly label: string
  readonly tone: 'ok' | 'bad' | 'warn' | 'idle'
  readonly status: string
  /** اسمُ الحساب المربوط إن كان. */
  readonly account: string | null
  readonly button: { readonly label: string; readonly href: string; readonly primary: boolean }
  /** يربط ولا ينشر (مرتبة `link`). */
  readonly linkOnly: boolean
}

/**
 * حالٌ واحدٌ وزرٌّ واحد لكلّ منصّة — **من حال القناة نفسِه** الذي يقرؤه لوحُ المنصّات.
 * والمحفوظةُ بلا إذنٍ تُقال حمراءَ لا خضراء (D-166).
 */
export function platformTile(v: ChannelView): PlatformTile {
  const id = v.spec.id
  const active = v.accounts.find((a) => a.status === 'active') ?? v.accounts[0]
  const base = { id, label: v.spec.label, account: active?.displayName ?? null, linkOnly: v.spec.stage === 'link' }
  if (v.state === 'needs_reauth' || unsignedAccounts(v).length > 0) {
    return { ...base, tone: 'bad', status: 'تحتاج تجديدًا', button: { label: 'جدّد الإذن', href: `/oauth/${id}/start`, primary: true } }
  }
  if (v.state === 'linked') {
    return { ...base, tone: 'ok', status: 'متّصلة', button: { label: 'افتح', href: `/panel/channels/${id}`, primary: false } }
  }
  if (v.state === 'connectable') {
    return { ...base, tone: 'warn', status: 'جاهزةٌ للربط', button: { label: 'اربط', href: `/oauth/${id}/start`, primary: true } }
  }
  return { ...base, tone: 'idle', status: 'تحتاج إعدادًا', button: { label: 'أكمل الإعداد', href: `/panel/channels/${id}?tab=setup`, primary: false } }
}
