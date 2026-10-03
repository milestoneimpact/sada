/** الرئيسيّة: فعلٌ واحدٌ بأولويّةٍ مكتوبة، وسبعُ محطّات، وزرٌّ لكلّ منصّة (D-177). */
import { describe, expect, it } from 'vitest'
import { viewChannels, type LinkedAccount } from './channels'
import { counted, NOUNS } from './format'
import { journeyCounts, journeySteps, nextAction, platformTile, type HomeFacts, type PlatformCounts } from './home'
import { fakeDb } from '../test/fakes'

const acc = (over: Partial<LinkedAccount>): LinkedAccount => ({
  id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
  createdAt: '2026-09-01 00:00:00', expiresAt: '2026-11-01 00:00:00', ...over,
})
const counts = (over: Partial<PlatformCounts> = {}): PlatformCounts =>
  ({ draft: 0, approved: 0, queued: 0, published: 0, failed: 0, nextAt: null, ...over })

const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  channels: viewChannels([acc({})], () => true),
  counts: { perPlatform: {}, publishedWeek: 0 },
  paused: false,
  sources: { total: 2, analyzed: 2 },
  withoutImage: 0,
  withImage: 0,
  openSuggestions: 0,
  ...over,
})

describe('counted', () => {
  it('واحدٌ بوصفه، واثنان بالمثنّى، والجمعُ إلى عشرة، والتمييزُ بعدها', () => {
    expect(counted(1, NOUNS.draft)).toBe('مسوّدةٌ واحدة')
    expect(counted(2, NOUNS.post)).toBe('منشوران')
    expect(counted(5, NOUNS.source)).toBe('5 مصادر')
    expect(counted(11, NOUNS.post)).toBe('11 منشورًا')
    expect(counted(30, NOUNS.day)).toBe('30 يومًا')
  })
})

describe('nextAction', () => {
  it('الإذنُ المنتهي أوّلًا — وزرُّه يجدّد مباشرةً', () => {
    const f = facts({
      channels: viewChannels([acc({ status: 'needs_reauth' })], () => true),
      counts: { perPlatform: { linkedin: counts({ draft: 4 }) }, publishedWeek: 0 },
    })
    expect(nextAction(f)).toMatchObject({ tone: 'bad', href: '/oauth/linkedin/start' })
  })

  it('والفشلُ قبل المسوّدات، ويفتح صفحةَ منصّته', () => {
    const f = facts({ counts: { perPlatform: { linkedin: counts({ draft: 3 }), x: counts({ failed: 1 }) }, publishedWeek: 0 } })
    const a = nextAction(f)
    expect(a.tone).toBe('bad')
    expect(a.href).toBe('/panel/channels/x')
    expect(a.text).toContain('منشورٌ واحد')
  })

  it('ولا منصّةَ متّصلة: اربط أوّلًا', () => {
    expect(nextAction(facts({ channels: viewChannels([], () => true) })).label).toBe('اربط أوّلَ منصّة')
  })

  it('ثمّ المسوّداتُ بعددٍ صحيح، ثمّ المواعيد، ثمّ «على المسار»', () => {
    expect(nextAction(facts({ counts: { perPlatform: { linkedin: counts({ draft: 2 }) }, publishedWeek: 0 } })).text)
      .toContain('مسوّدتان')
    expect(nextAction(facts({ counts: { perPlatform: { linkedin: counts({ approved: 3 }) }, publishedWeek: 0 } })).label)
      .toBe('حدّد المواعيد')
    const calm = nextAction(facts({
      counts: { perPlatform: { linkedin: counts({ queued: 1, nextAt: '2026-10-02 09:00:00' }) }, publishedWeek: 0 },
    }))
    expect(calm).toMatchObject({ tone: 'ok', href: '/panel/channels/linkedin' })
  })

  it('والفشلُ القديمُ لا يحجب ما بعده — يُحمِّر فشلُ الأسبوع وحده', () => {
    const old = facts({ counts: { perPlatform: { linkedin: counts({ draft: 2 }), x: counts({ failed: 3, recentFailed: 0 }) }, publishedWeek: 0 } })
    expect(nextAction(old)).toMatchObject({ tone: 'ok', label: 'راجع المسوّدات' })
    const fresh = facts({ counts: { perPlatform: { linkedin: counts({ draft: 2 }), x: counts({ failed: 3, recentFailed: 1 }) }, publishedWeek: 0 } })
    const a = nextAction(fresh)
    expect(a).toMatchObject({ tone: 'bad', href: '/panel/channels/x' })
    expect(a.text).toContain('منشورٌ واحد')
  })

  it('و«لا مصدر» حين لا شيءَ أصلًا — والمقطعُ والخطّةُ يكتبان بلا Drive', () => {
    const none = { total: 0, analyzed: 0 }
    expect(nextAction(facts({ sources: none }))).toMatchObject({ tone: 'warn', href: '#sources' })
    // ‏مسوّداتٌ من مقطعٍ مرفوع: تُراجَع، لا «اذهب إلى المصادر»
    expect(nextAction(facts({ sources: none, counts: { perPlatform: { youtube: counts({ draft: 2 }) }, publishedWeek: 0 } })))
      .toMatchObject({ tone: 'ok', label: 'راجع المسوّدات' })
    expect(nextAction(facts({ sources: none, counts: { perPlatform: { youtube: counts({ approved: 1 }) }, publishedWeek: 0 } })).label)
      .toBe('حدّد المواعيد')
    // ‏ونُشر كلُّه بلا مصدر: الدورةُ الجديدةُ من مقطعٍ لا «من مصدرٍ محلَّل»
    const idle = nextAction(facts({ sources: none, counts: { perPlatform: { youtube: counts({ published: 4 }) }, publishedWeek: 0 } }))
    expect(idle).toMatchObject({ tone: 'ok', href: '#videos' })
    expect(idle.text).not.toContain('مصدرٍ محلَّل')
  })
})

describe('journeySteps', () => {
  it('سبعٌ بترتيبها، وكلُّها رابط', () => {
    const steps = journeySteps(facts())
    expect(steps.map((s) => s.key)).toEqual(['source', 'draft', 'image', 'approve', 'schedule', 'publish', 'results'])
    for (const s of steps) expect(s.href).not.toBe('')
  })

  it('ما ينتظرك «تنتظرك»، والفشلُ يسقط، وما لم يصله شيءٌ «تنتظر»', () => {
    const steps = journeySteps(facts({
      sources: { total: 3, analyzed: 1 },
      counts: { perPlatform: { linkedin: counts({ draft: 2, approved: 1 }), x: counts({ failed: 1 }) }, publishedWeek: 0 },
      withoutImage: 3,
    }))
    const by = Object.fromEntries(steps.map((s) => [s.key, s]))
    expect(by['source']!.state).toBe('now')
    expect(by['source']!.note).toBe('ينتظر التحليلَ مصدران')
    expect(by['approve']!).toMatchObject({ state: 'now', note: 'تنتظر قرارك مسوّدتان' })
    expect(by['schedule']!).toMatchObject({ state: 'now', note: 'بلا موعد: منشورٌ واحد' })
    expect(by['publish']!).toMatchObject({ state: 'failed', href: '/panel/channels/x' })
    expect(by['results']!.state).toBe('waiting')
  })

  it('«المصدر» تامّةٌ حين في الرحلة منشوراتٌ بلا Drive، و«تنتظرك» حين لا شيء', () => {
    const none = { total: 0, analyzed: 0 }
    const empty = Object.fromEntries(journeySteps(facts({ sources: none })).map((s) => [s.key, s]))
    expect(empty['source']!).toMatchObject({ state: 'now', href: '#sources' })
    const fed = Object.fromEntries(journeySteps(facts({
      sources: none, counts: { perPlatform: { youtube: counts({ draft: 1, published: 2 }) }, publishedWeek: 0 },
    })).map((s) => [s.key, s]))
    expect(fed['source']!.state).toBe('done')
    expect(fed['approve']!.state).toBe('now')
  })

  it('«الموعد» تامّةٌ بعد نشر كلِّ ما جُدول — لا «بعد الاعتماد»', () => {
    const by = Object.fromEntries(journeySteps(facts({
      counts: { perPlatform: { linkedin: counts({ published: 5 }) }, publishedWeek: 2 },
    })).map((s) => [s.key, s]))
    expect(by['approve']!.state).toBe('done')
    expect(by['schedule']!).toMatchObject({ state: 'done', note: 'لا موعدَ قادم — مضى ما جُدول' })
    expect(by['publish']!.state).toBe('done')
    // ‏والمجدولُ يُعدّ بعدده ما دام في الطابور
    const queued = journeySteps(facts({
      counts: { perPlatform: { linkedin: counts({ queued: 2, published: 5, nextAt: '2026-10-05 09:00:00' }) }, publishedWeek: 0 },
    })).find((s) => s.key === 'schedule')!
    expect(queued).toMatchObject({ state: 'done', note: 'جُدول منشوران' })
  })

  it('والنشرُ لا يسقط بفشلٍ قديم — يُذكَر ولا يُحمِّر', () => {
    const old = journeySteps(facts({
      counts: { perPlatform: { x: counts({ failed: 2, recentFailed: 0 }) }, publishedWeek: 0 },
    }))
    const publish = old.find((s) => s.key === 'publish')!
    expect(publish).toMatchObject({ state: 'waiting', href: '/panel/channels/x', note: 'فشل منشوران قبل أسبوعٍ فأكثر' })
    expect(old.some((s) => s.state === 'failed')).toBe(false)
    const fresh = journeySteps(facts({
      counts: { perPlatform: { x: counts({ failed: 2, recentFailed: 1 }) }, publishedWeek: 0 },
    })).find((s) => s.key === 'publish')!
    expect(fresh).toMatchObject({ state: 'failed', note: 'فشل منشورٌ واحد — والسببُ في صفحة المنصّة' })
  })
})

/** العدُّ من القاعدة: **وفشلُ الأسبوع بوقت آخر محاولةٍ فاشلة** لا بحال المنشور وحده. */
describe('journeyCounts', () => {
  const now = new Date('2026-10-03T12:00:00Z')

  it('يعدّ الفاشلَ كلَّه، والحديثَ منه بآخر محاولةٍ فاشلةٍ في سبعة أيّام', async () => {
    const db = fakeDb()
    db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
      VALUES ('a1', 'x', 'member', 'abc', 'عمر', 'active')`)
    const post = (id: string, scheduled: string, created: string): void => {
      db.raw.prepare(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_by, approved_at,
                            account_id, scheduled_at, created_at)
         VALUES (?, 'x', 'text', 'نصّ', 'failed', ?, 'omar', '2026-09-01 00:00:00', 'a1', ?, ?)`,
      ).run(id, `k-${id}`, scheduled, created)
    }
    const attempt = (postId: string, no: number, status: string, at: string): void => {
      db.raw.prepare(
        `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
         VALUES (?, ?, ?, ?, '{}', ?, ?)`,
      ).run(`${postId}-${no}`, postId, `k-${postId}`, no, status, at)
    }
    // ‏قديمٌ: آخرُ فشله قبل عشرة أيّام
    post('old', '2026-09-20 09:00:00', '2026-09-19 00:00:00')
    attempt('old', 1, 'failed', '2026-09-23 09:00:00')
    // ‏حديثٌ: جُدول قديمًا وأُعيد فسقط أمس — والمحاولةُ الأخيرةُ هي التي تؤرّخه
    post('fresh', '2026-09-01 09:00:00', '2026-08-30 00:00:00')
    attempt('fresh', 1, 'failed', '2026-09-01 09:00:00')
    attempt('fresh', 2, 'failed', '2026-10-02 09:00:00')
    // ‏بلا محاولة: يُؤرَّخ بموعده — قديم
    post('bare', '2026-09-10 09:00:00', '2026-09-09 00:00:00')

    const c = await journeyCounts(db, now)
    expect(c.perPlatform['x']).toMatchObject({ failed: 3, recentFailed: 1 })
    expect(nextAction(facts({ counts: c }))).toMatchObject({ tone: 'bad', href: '/panel/channels/x' })

    // ‏ويمضي الأسبوعُ على الحديث فتهدأ الرئيسيّة
    const later = await journeyCounts(db, new Date('2026-10-12T12:00:00Z'))
    expect(later.perPlatform['x']).toMatchObject({ failed: 3, recentFailed: 0 })
    expect(nextAction(facts({ counts: later })).tone).toBe('ok')
  })
})

describe('platformTile', () => {
  it('حالٌ واحدٌ وزرٌّ واحد لكلّ حال', () => {
    const [li] = viewChannels([acc({})], () => true)
    expect(platformTile(li!)).toMatchObject({ tone: 'ok', status: 'متّصلة', account: 'عمر', button: { label: 'افتح' } })

    const [stale] = viewChannels([acc({ status: 'needs_reauth' })], () => true)
    expect(platformTile(stale!).button).toMatchObject({ label: 'جدّد الإذن', href: '/oauth/linkedin/start', primary: true })

    // ‏محفوظةٌ بلا إذن (بلا صفٍّ في tokens) حمراءُ لا خضراء (D-166)
    const [unsigned] = viewChannels([acc({ expiresAt: null })], () => true)
    expect(platformTile(unsigned!).tone).toBe('bad')

    const views = viewChannels([], (name) => name.startsWith('X_'))
    const x = views.find((v) => v.spec.id === 'x')!
    expect(platformTile(x).button.label).toBe('اربط')
    const tiktok = views.find((v) => v.spec.id === 'tiktok')!
    expect(platformTile(tiktok).button).toMatchObject({ label: 'أكمل الإعداد', href: '/panel/channels/tiktok?tab=setup' })
  })
})
