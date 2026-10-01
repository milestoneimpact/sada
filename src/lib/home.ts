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
  /** أقربُ موعدٍ في الطابور، بصيغة القاعدة. */
  readonly nextAt: string | null
}

export interface JourneyCounts {
  readonly perPlatform: Readonly<Record<string, PlatformCounts>>
  /** ما نُشر في السبعة الأيّام الأخيرة — من المحاولات الناجحة. */
  readonly publishedWeek: number
}

export const NO_COUNTS: JourneyCounts = { perPlatform: {}, publishedWeek: 0 }

const EMPTY: PlatformCounts = { draft: 0, approved: 0, queued: 0, published: 0, failed: 0, nextAt: null }

/**
 * استعلامان مجمَّعان — **ولا تُسحَب الصفوف**.
 *
 * و`approved` يجمع `approved` و`edited`: سؤالٌ واحدٌ عند المالك (D-062).
 * وجدولٌ لم يُرحَّل يُقرأ صفرًا: الرئيسيّةُ تُفتح خاليةً ولا تسقط.
 */
export async function journeyCounts(db: Db, now: Date): Promise<JourneyCounts> {
  try {
    const { results } = await db
      .prepare(
        `SELECT platform, status, COUNT(*) AS n,
                MIN(CASE WHEN status = 'queued' THEN scheduled_at END) AS next_at
           FROM posts GROUP BY platform, status`,
      )
      .all<{ platform: string; status: string; n: number; next_at: string | null }>()
    const perPlatform: Record<string, PlatformCounts> = {}
    for (const row of results) {
      const base = perPlatform[row.platform] ?? EMPTY
      const key = row.status === 'edited' ? 'approved' : row.status
      if (key !== 'draft' && key !== 'approved' && key !== 'queued' && key !== 'published' && key !== 'failed') continue
      perPlatform[row.platform] = {
        ...base,
        [key]: base[key] + row.n,
        nextAt: key === 'queued' ? row.next_at : base.nextAt,
      }
    }
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
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
export function total(counts: JourneyCounts, key: Exclude<keyof PlatformCounts, 'nextAt'>): number {
  return Object.values(counts.perPlatform).reduce((n, p) => n + p[key], 0)
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

  const source: JourneyStep = f.sources.total === 0
    ? { key: 'source', title: 'المصدر', state: 'now', note: 'لا ملفّ بعد — امسح مجلّد Drive', href: '#sources' }
    : pending > 0
      ? { key: 'source', title: 'المصدر', state: 'now', note: `ينتظر التحليلَ ${counted(pending, NOUNS.source)}`, href: '#sources' }
      : { key: 'source', title: 'المصدر', state: 'done', note: `حُلّل ${counted(f.sources.analyzed, NOUNS.source)}`, href: '#sources' }

  const written = drafts + approved + queued + published + failed
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

  const approve: JourneyStep = drafts > 0
    ? { key: 'approve', title: 'الاعتماد', state: 'now', note: `تنتظر قرارك ${counted(drafts, NOUNS.draft)}`, href: '#posts' }
    : approved + queued + published > 0
      ? { key: 'approve', title: 'الاعتماد', state: 'done', note: 'لا شيءَ ينتظر قرارك', href: '#posts' }
      : { key: 'approve', title: 'الاعتماد', state: 'waiting', note: 'لا يُنشر شيءٌ قبل اعتمادك', href: '#posts' }

  const schedule: JourneyStep = approved > 0
    ? { key: 'schedule', title: 'الموعد', state: 'now', note: `بلا موعد: ${counted(approved, NOUNS.post)}`, href: '#posts' }
    : queued > 0
      ? { key: 'schedule', title: 'الموعد', state: 'done', note: `جُدول ${counted(queued, NOUNS.post)}`, href: '#posts' }
      : { key: 'schedule', title: 'الموعد', state: 'waiting', note: 'بعد الاعتماد', href: '#posts' }

  const failedPlatform = Object.entries(c.perPlatform).find(([, p]) => p.failed > 0)?.[0]
  const publish: JourneyStep = failed > 0
    ? {
        key: 'publish', title: 'النشر', state: 'failed',
        note: `فشل ${counted(failed, NOUNS.post)} — والسببُ في صفحة المنصّة`,
        href: `/panel/channels/${failedPlatform ?? ''}`,
      }
    : c.publishedWeek > 0
      ? { key: 'publish', title: 'النشر', state: 'done', note: `نُشر هذا الأسبوع ${counted(c.publishedWeek, NOUNS.post)}`, href: '#channels' }
      : next !== null
        ? { key: 'publish', title: 'النشر', state: 'waiting', note: 'التالي في موعده', href: `/panel/channels/${next.platform}` }
        : { key: 'publish', title: 'النشر', state: published > 0 ? 'done' : 'waiting', note: published > 0 ? `نُشر ${counted(published, NOUNS.post)}` : 'في موعده بعد الجدولة', href: '#channels' }

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
  const failedEntry = Object.entries(f.counts.perPlatform).find(([, p]) => p.failed > 0)
  if (failedEntry !== undefined) {
    const label = f.channels.find((c) => c.spec.id === failedEntry[0])?.spec.label ?? failedEntry[0]
    return {
      tone: 'bad', text: `فشل على ${label} ${counted(failedEntry[1].failed, NOUNS.post)} — والسببُ وزرُّ الإعادة في صفحتها.`,
      label: `افتح ${label}`, href: `/panel/channels/${failedEntry[0]}`,
    }
  }
  const linked = f.channels.some((c) => c.state === 'linked')
  if (!linked) {
    return { tone: 'warn', text: 'لا منصّةَ متّصلة — صدى يكتب ولا ينشر حتّى تربط واحدة.', label: 'اربط أوّلَ منصّة', href: '#channels' }
  }
  if (f.sources.total === 0) {
    return { tone: 'warn', text: 'لا مصدرَ بعد — ضع ملفًّا في مجلّد Drive المشترَك ثمّ امسحه.', label: 'اذهب إلى المصادر', href: '#sources' }
  }
  const drafts = total(f.counts, 'draft')
  const pending = f.sources.total - f.sources.analyzed
  if (drafts === 0 && f.sources.analyzed === 0 && pending > 0) {
    return { tone: 'ok', text: `ينتظر التحليلَ ${counted(pending, NOUNS.source)} — ومنه تُكتب المسوّدات.`, label: 'حلّل مصدرًا', href: '#sources' }
  }
  if (drafts > 0) {
    return { tone: 'ok', text: `تنتظر قرارك ${counted(drafts, NOUNS.draft)} — ولا يُنشر شيءٌ قبله.`, label: 'راجع المسوّدات', href: '#posts' }
  }
  const approved = total(f.counts, 'approved')
  if (approved > 0) {
    return { tone: 'ok', text: `معتمَدٌ بلا موعد: ${counted(approved, NOUNS.post)}.`, label: 'حدّد المواعيد', href: '#posts' }
  }
  const next = nextScheduled(f.counts)
  if (next !== null) {
    const label = f.channels.find((c) => c.spec.id === next.platform)?.spec.label ?? next.platform
    return { tone: 'ok', text: `كلُّ شيءٍ على المسار — والتالي على ${label}.`, label: `افتح ${label}`, href: `/panel/channels/${next.platform}` }
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
