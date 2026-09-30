/**
 * شاشةُ المنصّة: التبويباتُ والمصغَّرات.
 *
 * **وما يُفحَص هنا أنّ الفرزَ لا يُخفي** — وهو الشرطُ الذي قام عليه.
 */
import { describe, expect, it } from 'vitest'
import { platformScreen, readinessLadder, showOf, type PostMedia } from './ui/platformView'
import { status } from './ui/parts'
import { viewChannels, type LinkedAccount } from '../lib/channels'
import type { PlatformPost } from '../lib/platform/screen'

const now = new Date('2026-09-06T12:00:00Z')

const accounts: LinkedAccount[] = [
  { id: 'a1', platform: 'x', kind: 'member', displayName: '@omar', status: 'active',
    createdAt: '2026-09-01T00:00:00Z', expiresAt: null },
]
const view = viewChannels(accounts, () => true).find((v) => v.spec.id === 'x')!

const post = (id: string, status: string): PlatformPost => ({
  id, text: `نصُّ ${id}`, status, scheduledAt: null, createdAt: '2026-09-05T00:00:00Z',
  accountName: '@omar', platformPostId: null, publishedAt: null, lastError: null, lastFailedAt: null,
  hasMedia: false, costUsd: 0,
})

const POSTS: PlatformPost[] = [
  post('p1', 'published'), post('p2', 'published'),
  post('p3', 'queued'), post('p4', 'failed'), post('p5', 'draft'),
]

function screen(over: Partial<Parameters<typeof platformScreen>[0]> = {}): string {
  return platformScreen({
    health: {},
    view, posts: POSTS, now,
    tally: { published: 2, queued: 1, failed: 1, drafts: 1, spend: 0, lastPublishedAt: null },
    scopes: {}, metrics: {}, media: {},
    // ‏الدليلُ يسكن الشاشةَ منذ D-111 — فتحتاجها حالُ التطبيق وأصلُ اللوحة
    app: undefined, baseUrl: 'https://sada2.basserh.com',
    ...over,
  })
}

describe('التبويباتُ تفرز ولا تُخفي', () => {
  /**
   * D-046 قال: «الفاشلةُ تُعرض مع الناجحة **فشلٌ لا يُرى لا يُعالَج**».
   * والفرزُ يخدم القاعدةَ نفسَها **بشرط أن يكون العددُ معروضا دائما**:
   * من يقف على «الكلّ» يرى «فشل ١» بلا أن يفتحه.
   */
  it('العددُ على كلّ تبويبٍ معروضٌ ولو لم يُفتَح', () => {
    const html = screen()
    expect(html).toContain('فشل<span class="count">1</span>')
    expect(html).toContain('نُشر<span class="count">2</span>')
  })

  /** وتبويبٌ افتراضيٌّ يُخفي الفشلَ هو عينُ ما حذّر منه D-046. */
  it('والافتراضُ «الكلّ» لا «نُشر»', () => {
    const html = screen()
    expect(html).toContain('نصُّ p4') // الفاشلُ ظاهرٌ بلا فرز
    expect(html).toContain('aria-current="page"')
    // والمفتوحُ هو «الكلّ»
    expect(/class="ftab on"[^>]*>الكلّ/.test(html)).toBe(true)
  })

  it('والفرزُ يعرض ما طُلب وحده', () => {
    const html = screen({ show: 'failed' })
    expect(html).toContain('نصُّ p4')
    expect(html).not.toContain('نصُّ p1')
  })

  /** ويعمل بلا سكربت: روابطُ استعلامٍ لا أزرار. */
  it('والتبويباتُ روابطُ استعلام', () => {
    const html = screen()
    expect(html).toContain('href="/panel/channels/x?show=failed"')
    expect(html).not.toMatch(/<button[^>]*class="ftab/)
  })

  it('وتبويبٌ فارغٌ لا يُعرَض — إلّا «الكلّ»', () => {
    const html = screen({ posts: [post('p1', 'published')] })
    expect(html).not.toContain('show=failed')
    expect(html).toContain('الكلّ')
  })

  it('وقيمةٌ لا نعرفها تعود إلى «الكلّ» ولا تُفرغ الشاشة', () => {
    expect(showOf('لا-شيء')).toBe('all')
    expect(showOf(undefined)).toBe('all')
    expect(showOf('failed')).toBe('failed')
  })
})

describe('والوسائطُ تُعرَض لا يُقال إنّ هناك وسيطا', () => {
  const media: Record<string, PostMedia[]> = {
    p1: [{ id: 'm1', mime: 'image/png', status: 'ready' }],
    p2: [{ id: 'm2', mime: 'video/mp4', status: 'ready' }],
    p3: [{ id: 'm3', mime: 'image/png', status: 'rejected' }],
  }

  it('الصورةُ تُرسَم من مسارٍ خلف الجلسة', () => {
    const html = screen({ media })
    expect(html).toContain('src="/panel/media/m1"')
    expect(html).toContain('alt="صورةٌ مولَّدة')
  })

  /** والفيديو `<video>` لا `<img>` — **ولا تشغيلَ آليّ**. */
  it('والمقطعُ يُرسَم video بلا تشغيلٍ آليّ', () => {
    const html = screen({ media })
    expect(html).toContain('<video src="/panel/media/m2"')
    expect(html).not.toContain('autoplay')
    expect(html).toContain('muted')
  })

  /** كلفتُها دُفعت، وإخفاؤها يجعل سطرا في الدفتر بلا ما يقابله. */
  it('والمرفوضةُ تُعرَض مُعلَّمةً لا تُخفى', () => {
    const html = screen({ media })
    expect(html).toContain('src="/panel/media/m3"')
    expect(html).toContain('مرفوضة')
  })

  /** وصفٌّ يقول إنّ له وسيطا ولا وسيطَ يُقرأ: يُقال ولا يُخفى. */
  it('ووسيطٌ مفقودٌ يُقال', () => {
    const orphan = [{ ...post('p9', 'published'), hasMedia: true }]
    expect(screen({ posts: orphan, media: {} })).toContain('وسيطٌ لا يُقرأ')
  })

  it('ولا مصغَّرَ حيث لا وسيط', () => {
    expect(screen({ media: {} })).not.toContain('class="thumbs"')
  })
})

/**
 * الدليلُ يسكن الشاشةَ لا اللوح (D-111).
 *
 * **وقِيس سببُ النقل**: كتلةُ الدليل ‏١٢٦٥px من بطاقةٍ ‏١٦٢٠ — ‏٧٨٪ منها
 * وثيقة. وفتحُها يُطيل بطاقتَها ولا يُطيل جارتَها، **فيُمزَّق صفُّ الشبكة
 * بـ‏١٤٣٩px**. والبطاقةُ حالٌ، والشاشةُ وثيقة.
 */
describe('الدليلُ يسكن شاشةَ المنصّة', () => {
  const app = {
    platform: 'x' as const, source: 'none' as const,
    clientId: null, hint: null, updatedAt: null, updatedBy: null,
    secretNames: ['X_CLIENT_ID', 'X_CLIENT_SECRET'] as readonly [string, string],
    verifiedAt: null, verifiedKind: null,
  }

  it('**وبلا تطبيقٍ مضبوطٍ يُعرَض الدليلُ هنا**', () => {
    const html = screen({ app })
    expect(html).toContain('ضبطُ التطبيق ودليلُه')
    expect(html).toContain('دليلُ ضبط التطبيق')
    // **ورابطُ العودة يُعرَض للنسخ حيث يُضبَط** — لا في لوحٍ آخر
    expect(html).toContain('oauth/x/callback')
  })

  /**
   * **وترويسةٌ بلا جسدٍ لا تُرسَم** (لاحقةُ D-123).
   *
   * حالُ التطبيق تُقرأ لمنصّتين، فشاشاتُ YouTube وTikTok وInstagram
   * تصل بلا `app` — **وكانت تنتهي بعنوان «ضبطُ التطبيق» تحته لا شيء**.
   */
  it('وبلا حالِ تطبيقٍ لا عنوانَ يعد بدليلٍ لا يأتي', () => {
    const html = screen({ app: undefined })
    expect(html).not.toContain('ضبطُ التطبيق ودليلُه')
  })

  /** **ولا تُعيد الشاشةُ المالكَ إلى اللوح** — كانت تقول «الدليلُ هناك». */
  it('ولا تُحيل إلى لوح القنوات طلبا للدليل', () => {
    expect(screen({ app })).not.toContain('افتح الدليل')
  })

  it('وبلا حالِ تطبيقٍ لا يُعرَض شيءٌ ولا يرمي', () => {
    expect(() => screen({ app: undefined })).not.toThrow()
  })
})

/**
 * سجلُّ صحّة الحساب (D-129): ترويسةٌ بجسدٍ دائم، وما لم يقع يُقال لا يُرسَم.
 */
describe('سجلُّ صحّة الحساب', () => {
  it('بلا سجلٍّ: رُبط، ولم يُجدَّد بعد، ولا إذنَ محفوظا', () => {
    const html = screen({})
    expect(html).toContain('<h3 class="sec">سجلُّ صحّة الحساب</h3>')
    expect(html).toContain('لم يُجدَّد بعدُ')
    expect(html).toContain('لا إذنَ وصولٍ محفوظا')
  })

  it('وبسجلٍّ: آخرُ تجديدٍ وموعدُ الانتهاء والتنبيهاتُ بأسمائها', () => {
    const html = screen({
      health: {
        a1: {
          status: 'active', expiresAt: '2026-10-01 00:00:00', refreshExpiresAt: '2027-01-01 00:00:00',
          refreshedAt: '2026-09-10 03:00:00', needsReauthAt: null,
          alerts: [{ kind: 'access', threshold: 7, at: '2026-09-24 03:00:00' }, { kind: 'refresh', threshold: 0, at: '2027-01-01 03:00:00' }],
        },
      },
    })
    expect(html).toContain('جُدّد آخرَ مرّةٍ')
    expect(html).toContain('إذنُ الوصول ينتهي')
    expect(html).toContain('إذنُ الوصول يقترب — بقي 7 أيّام')
    expect(html).toContain('إذنُ التجديد انتهى')
    expect(html).toContain('<span class="dot bad"></span>')
  })
})

describe('ختمُ السقوط في سجلّ الصحّة (D-131)', () => {
  it('حسابٌ ساقطٌ يقول متى سقط، والقائمُ لا يقول شيئا', () => {
    const base = { status: 'needs_reauth', expiresAt: null, refreshExpiresAt: null, refreshedAt: null, alerts: [] }
    const dropped = screen({ health: { a1: { ...base, needsReauthAt: '2026-09-10 03:00:00' } } })
    expect(dropped).toContain('سقط الإذن')
    expect(dropped).toContain('والنشرُ متوقّفٌ عليه منذها')
    const fine = screen({ health: { a1: { ...base, status: 'active', needsReauthAt: null } } })
    expect(fine).not.toContain('سقط الإذن')
  })
})

/**
 * علامةُ الدرجة انتقلت إلى `parts` (D-163) — ونقاطُ المسوّدات تقرؤها كذلك.
 * **والسلّمُ يُرسَم كما كان**: الحالاتُ الأربعُ برمزها ولونها وكلمتها.
 */
describe('علامةُ الدرجة من مصدرها الواحد (D-163)', () => {
  it('السلّمُ ما زال يرسم ●/◍/○/▲ بكلماتها بعد النقل', () => {
    const html = readinessLadder({
      rungs: (['done', 'now', 'waiting', 'failed'] as const).map((state, i) => ({
        key: 'app' as const, title: `درجة ${i}`, state, note: 'ما وقع',
      })),
      verdict: { kind: 'bad', text: 'لا تنشر' },
      next: null,
    })
    const want: [string, string, string][] = [
      ['ok', '●', 'تامّة'], ['warn', '◍', 'تنتظرك'], ['idle', '○', 'تنتظر'], ['bad', '▲', 'ساقطة'],
    ]
    for (const [cls, glyph, label] of want) expect(html).toContain(status(cls, glyph, label))
  })
})

