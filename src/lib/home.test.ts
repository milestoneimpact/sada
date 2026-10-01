/** الرئيسيّة: فعلٌ واحدٌ بأولويّةٍ مكتوبة، وسبعُ محطّات، وزرٌّ لكلّ منصّة (D-177). */
import { describe, expect, it } from 'vitest'
import { viewChannels, type LinkedAccount } from './channels'
import { counted, NOUNS } from './format'
import { journeySteps, nextAction, platformTile, type HomeFacts, type PlatformCounts } from './home'

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
