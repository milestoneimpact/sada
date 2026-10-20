/**
 * صفحةُ المنصّة صفحةَ حساب (D-172): الرأسُ، وما تطلبه المنصّة، والقادمُ
 * تصاعديًّا، وما نُشر تحت أيّامه، والإعدادُ في تبويبه.
 */
import { describe, expect, it } from 'vitest'
import { filterOf, platformScreen, readinessLadder, tabOf, type PlatformScreenData } from './ui/platformView'
import { statusBadge, type Tone } from './ui/components/badge'
import { viewChannels, type LinkedAccount } from '../lib/channels'
import { platformNeeds } from '../lib/platform/needs'
import type { TimelineRow } from '../lib/platform/timeline'

const now = new Date('2026-09-06T12:00:00Z')

const accounts: LinkedAccount[] = [
  { id: 'a1', platform: 'x', kind: 'member', displayName: '@omar', status: 'active',
    createdAt: '2026-09-01T00:00:00Z', expiresAt: null },
]
const view = viewChannels(accounts, () => true).find((v) => v.spec.id === 'x')!

const row = (over: Partial<TimelineRow> & Pick<TimelineRow, 'id' | 'status'>): TimelineRow => ({
  text: `نصّ ${over.id}`, scheduledAt: null, createdAt: '2026-09-05 00:00:00', dispatchedAt: null,
  accountName: '@omar', accountKind: 'member', sourceName: null, platformPostId: null, publishedAt: null,
  failedAt: null, failure: null, tries: 0, lastTryAt: null, openTries: 0, hasMedia: false, costUsd: 0,
  sortAt: '2026-09-05 00:00:00', ...over,
})

function screen(over: Partial<PlatformScreenData> = {}): string {
  return platformScreen({
    health: {}, view, posts: [], now,
    tally: { published: 1, queued: 1, failed: 1, drafts: 1, spend: 0, lastPublishedAt: '2026-09-05 22:30:00' },
    counts: { waiting: 1, ready: 0, queued: 1, published: 1, failed: 1, missingMedia: 0 },
    needs: platformNeeds('x'),
    upcoming: [row({ id: 'u1', status: 'queued', scheduledAt: '2026-09-07 06:00:00', sortAt: '2026-09-07 06:00:00' })],
    history: {
      rows: [
        row({ id: 'p1', status: 'published', platformPostId: '1874', publishedAt: '2026-09-05 22:30:00', sortAt: '2026-09-05 22:30:00' }),
        row({ id: 'p2', status: 'failed', failure: 'token_expired', failedAt: '2026-09-04 09:00:00', sortAt: '2026-09-04 09:00:00' }),
      ],
      next: null,
    },
    waiting: [], filter: 'all', tab: 'posts', costs: {},
    scopes: {}, metrics: {}, media: {}, zone: 'Asia/Riyadh', flash: null,
    // ‏الدليلُ يسكن الشاشةَ منذ D-111 — فتحتاجها حالُ التطبيق وأصلُ اللوحة
    app: undefined, baseUrl: 'https://sada2.basserh.com',
    ...over,
  })
}

describe('صفحة حساب', () => {
  it('القادم قبل ما نُشر، وكلّ بعنوانه', () => {
    const html = screen()
    expect(html.indexOf('id="upcoming"')).toBeGreaterThan(0)
    expect(html.indexOf('id="upcoming"')).toBeLessThan(html.indexOf('id="history"'))
    expect(html).toContain('id="p-u1"')
  })

  it('ورأس اليوم بتوقيت المالك — 22:30 UTC هو الأحد في الرياض لا السبت', () => {
    const html = screen()
    expect(html).toContain('الأحد 6 سبتمبر 2026')
    expect(html).not.toContain('السبت 5 سبتمبر 2026')
    // والساعةُ المحلّيّةُ كبيرة، ولا UTC تحتها (D-201): منطقتُه هو فلا تُسمّى
    expect(html).toContain('<b class="np-clock">1:30 ص</b>')
    expect(html).not.toContain('22:30 UTC')
  })

  it('وبلا كعكة منطقة تُجمَع الأيّام بتوقيت الرياض ويُقال ذلك (D-201)', () => {
    const html = screen({ zone: null })
    expect(html).toContain('الأحد 6 سبتمبر 2026')
    expect(html).toContain('<b class="np-clock">1:30 ص</b>')
    expect(html).toContain('بتوقيت الرياض')
    expect(html).not.toContain('UTC')
  })

  it('والفاشل في يومه ومعه سببُه بالعربيّة وفعلُه — لا رمز الناشر', () => {
    const html = screen()
    expect(html).toContain('انتهى الإذن قبل الإرسال')
    expect(html).not.toContain('token_expired')
    expect(html).toContain('action="/panel/drafts/requeue"')
    expect(html).toContain('value="platform:x:waiting"')
  })

  it('والمنشور برابطه عند المنصّة', () => {
    expect(screen()).toContain('https://x.com/i/web/status/1874')
  })

  it('ومعاينة ببنية المنصّة لكلّ صفّ، بلا رقم مخترَع', () => {
    const html = screen()
    expect(html).toContain('class="np np-x np-compact"')
    expect(html).not.toContain('<b>0</b>')
  })

  it('وسبع محطّات فيما تطلبه المنصّة، بقواعدها من الثوابت', () => {
    const html = screen()
    expect((html.match(/<li class="(ok|warn|bad|idle)"><a class="card card-interactive" href=/g) ?? []).length).toBe(7)
    expect(html).toContain('حتّى 280 محرف موزون')
  })

  it('والإعداد في تبويبه لا في صدر الصفحة', () => {
    expect(screen()).not.toContain('أتنشر الآن؟')
    expect(screen({ tab: 'setup' })).toContain('أتنشر الآن؟')
  })

  it('وغلاف الحساب نقش الصدى الفاتح خلف شعار المنصّة، مخفيّ عن قارئ الشاشة (D-229)', () => {
    const cover = /<div class="acct-cover" aria-hidden="true">([\s\S]*?)<\/div>/.exec(screen())?.[1] ?? ''
    expect(cover).toContain('acct-echo')
    expect(cover).toContain('data-echo="light"')
    expect(cover).toContain('acct-mark')
  })

  it('و`?show=` القديم يُترجَم ولا يُكسَر رابط محفوظ', () => {
    expect(tabOf(undefined, 'drafts')).toBe('waiting')
    expect(tabOf('setup', undefined)).toBe('setup')
    expect(tabOf('لا-شيء', undefined)).toBe('posts')
    expect(filterOf(undefined, 'failed')).toBe('failed')
    expect(filterOf('<x>', undefined)).toBe('all')
  })
})

describe('والوسائط تُعرَض لا يُقال إنّ هناك وسيطا', () => {
  it('الصورة في موضعها من الإطار ومن مسار خلف الجلسة', () => {
    const html = screen({ media: { u1: [{ id: 'm1', mime: 'image/png', status: 'ready', note: '' }] } })
    expect(html).toContain('src="/panel/media/m1"')
    // ‏الشريحةُ المركّبة بمقاس المنصّة: النسبةُ معلومةٌ فتُحجَز قبل التحميل
    expect(html).toContain('width="1200" height="675"')
  })

  it('والمقطع video بلا تشغيل آليّ، وغلافُه الصورة التي حُرّك منها', () => {
    const html = screen({
      media: { u1: [
        { id: 'v1', mime: 'video/mp4', status: 'ready', note: null },
        { id: 'm1', mime: 'image/png', status: 'ready', note: '' },
      ] },
    })
    expect(html).toContain('<video src="/panel/media/v1" poster="/panel/media/m1"')
    expect(html).not.toContain('autoplay')
  })

  it('والمرفوضة لا تُرسم في الإطار', () => {
    const html = screen({ media: { u1: [{ id: 'm9', mime: 'image/png', status: 'rejected', note: '' }] } })
    expect(html).not.toContain('/panel/media/m9')
  })
})

describe('الدليل يسكن شاشة المنصّة', () => {
  const app = {
    platform: 'x' as const, source: 'none' as const,
    clientId: null, hint: null, updatedAt: null, updatedBy: null,
    secretNames: ['X_CLIENT_ID', 'X_CLIENT_SECRET'] as readonly [string, string],
    verifiedAt: null, verifiedKind: null,
  }

  it('**وبلا تطبيق مضبوط يُعرَض الدليل هنا**', () => {
    const html = screen({ app, tab: 'setup' })
    expect(html).toContain('ضبط التطبيق ودليلُه')
    expect(html).toContain('دليل ضبط التطبيق')
    // **ورابطُ العودة يُعرَض للنسخ حيث يُضبَط** — لا في لوحٍ آخر
    expect(html).toContain('oauth/x/callback')
  })

  /**
   * **وترويسةٌ بلا جسدٍ لا تُرسَم** (لاحقةُ D-123).
   *
   * حالُ التطبيق تُقرأ لمنصّتين، فشاشاتُ YouTube وTikTok وInstagram
   * تصل بلا `app` — **وكانت تنتهي بعنوان «ضبطُ التطبيق» تحته لا شيء**.
   */
  it('وبلا حال تطبيق لا عنوان يعد بدليل لا يأتي', () => {
    const html = screen({ app: undefined, tab: 'setup' })
    expect(html).not.toContain('ضبط التطبيق ودليلُه')
  })

  /** **ولا تُعيد الشاشةُ المالكَ إلى اللوح** — كانت تقول «الدليلُ هناك». */
  it('ولا تُحيل إلى لوح القنوات طلبا للدليل', () => {
    expect(screen({ app, tab: 'setup' })).not.toContain('افتح الدليل')
  })

  it('وبلا حال تطبيق لا يُعرَض شيء ولا يرمي', () => {
    expect(() => screen({ app: undefined })).not.toThrow()
  })
})

/**
 * سجلُّ صحّة الحساب (D-129): ترويسةٌ بجسدٍ دائم، وما لم يقع يُقال لا يُرسَم.
 */
describe('سجلّ صحّة الحساب', () => {
  it('بلا سجلّ: رُبط، ولم يُجدَّد بعد، ولا إذن محفوظا', () => {
    const html = screen({ tab: 'setup' })
    expect(html).toContain('<h3 class="sec">سجلّ صحّة الحساب</h3>')
    expect(html).toContain('لم يُجدَّد بعد')
    expect(html).toContain('لا إذن وصول محفوظا')
  })

  it('وبسجلّ: آخر تجديد وموعد الانتهاء والتنبيهات بأسمائها', () => {
    const html = screen({
      tab: 'setup',
      health: {
        a1: {
          status: 'active', expiresAt: '2026-10-01 00:00:00', refreshExpiresAt: '2027-01-01 00:00:00',
          refreshedAt: '2026-09-10 03:00:00', needsReauthAt: null,
          alerts: [{ kind: 'access', threshold: 7, at: '2026-09-24 03:00:00' }, { kind: 'refresh', threshold: 0, at: '2027-01-01 03:00:00' }],
        },
      },
    })
    expect(html).toContain('جُدّد آخر مرّة')
    expect(html).toContain('إذن الوصول ينتهي')
    expect(html).toContain('إذن الوصول يقترب — بقي 7 أيّام')
    expect(html).toContain('إذن التجديد انتهى')
    expect(html).toContain('<span class="dot bad"></span>')
  })
})

describe('ختم السقوط في سجلّ الصحّة (D-131)', () => {
  it('حساب ساقط يقول متى سقط، والقائم لا يقول شيئا', () => {
    const base = { status: 'needs_reauth', expiresAt: null, refreshExpiresAt: null, refreshedAt: null, alerts: [] }
    const dropped = screen({ tab: 'setup', health: { a1: { ...base, needsReauthAt: '2026-09-10 03:00:00' } } })
    expect(dropped).toContain('سقط الإذن')
    expect(dropped).toContain('والنشر متوقّف عليه منذها')
    const fine = screen({ tab: 'setup', health: { a1: { ...base, status: 'active', needsReauthAt: null } } })
    expect(fine).not.toContain('سقط الإذن')
  })
})

/**
 * علامةُ الدرجة انتقلت إلى `parts` (D-163) — ونقاطُ المسوّدات تقرؤها كذلك.
 * **والسلّمُ يُرسَم كما كان**: الحالاتُ الأربعُ برمزها ولونها وكلمتها.
 */
describe('علامة الدرجة من مصدرها الواحد (D-163)', () => {
  it('السلّم ما زال يرسم ●/◍/○/▲ بكلماتها بعد النقل', () => {
    const html = readinessLadder({
      rungs: (['done', 'now', 'waiting', 'failed'] as const).map((state, i) => ({
        key: 'app' as const, title: `درجة ${i}`, state, note: 'ما وقع',
      })),
      verdict: { kind: 'bad', text: 'لا تنشر' },
      next: null,
    })
    const want: [Tone, string, string][] = [
      ['ok', '●', 'تامّة'], ['warn', '◍', 'تنتظرك'], ['idle', '○', 'تنتظر'], ['bad', '▲', 'فشلت'],
    ]
    for (const [cls, glyph, label] of want) expect(html).toContain(statusBadge(cls, glyph, label))
  })
})


/*
 * ‏**ما وجدته رحلاتُ المالك على صفحة المنصّة** (خطّ الأساس، 2026-10-04).
 */
describe('رحلات المالك على صفحة المنصّة', () => {
  // ‏ر-2: «اكتب» يفتح نموذجَ الكتابة في لوح المنشورات، لا جدولَ المصادر الذي لا كتابةَ فيه
  it('أزرار «اكتب» الثلاثة تقود إلى نموذج الكتابة لا إلى المصادر', () => {
    const quiet = { waiting: 0, ready: 0, queued: 0, published: 0, failed: 0, missingMedia: 0 }
    // ‏حسابٌ بإذنٍ محفوظ: الزرُّ الأوّليّ «اكتب» لا «أعد الربط»
    const signed = viewChannels([{ ...accounts[0]!, expiresAt: '2026-10-01 00:00:00' }], () => true).find((v) => v.spec.id === 'x')!
    const head = screen({
      view: signed, counts: quiet,
      app: {
        platform: 'x', source: 'vault', clientId: 'cid', hint: '••••', updatedAt: null, updatedBy: null,
        secretNames: ['X_CLIENT_ID', 'X_CLIENT_SECRET'], verifiedAt: null, verifiedKind: 'accepted',
      },
      health: { a1: { status: 'active', expiresAt: '2026-10-01 00:00:00', refreshExpiresAt: null, refreshedAt: null, needsReauthAt: null, alerts: [] } },
    })
    expect(head).toContain('<a class="btn btn-primary" href="/panel#write">اكتب منشورًا من مصدر</a>')
    const empty = screen({ tab: 'waiting', waiting: [] })
    expect(empty).toContain('<a class="btn btn-secondary btn-sm" href="/panel#write">اكتب من مصدر</a>')
    for (const html of [head, empty, screen()]) expect(html).not.toContain('/panel#sources')
  })

  // ‏ر-1: «إذنُ الوصول ينتهي الآن · والتجديدُ الآن» لحسابٍ سليم — `relativeTime` للماضي وحده
  it('سجلّ الصحّة يعدّ الموعد القادم إلى الأمام، والفائت إلى الخلف', () => {
    const live = screen({
      tab: 'setup',
      health: { a1: {
        status: 'active', expiresAt: '2026-09-06 14:00:00', refreshExpiresAt: '2027-07-03 12:00:00',
        refreshedAt: null, needsReauthAt: null, alerts: [],
      } },
    })
    const log = live.slice(live.indexOf('سجلّ صحّة الحساب'))
    const text = log.slice(0, log.indexOf('</ul>')).replace(/<[^>]+>/g, '')
    expect(text).toContain('إذن الوصول ينتهي بعد ساعتين · والتجديد ينتهي بعد 300 يومًا')
    expect(text).not.toContain('الآن')
    const lapsed = screen({
      tab: 'setup',
      health: { a1: {
        status: 'active', expiresAt: '2026-09-06 10:00:00', refreshExpiresAt: null,
        refreshedAt: null, needsReauthAt: null, alerts: [],
      } },
    })
    expect(lapsed.replace(/<[^>]+>/g, '')).toContain('إذن الوصول انتهى قبل ساعتين')
  })

  // ‏ر-1: منصّةٌ بلا حساب لا تقول «2 من 7 جاهزة» ولا تعرض عدّاداتٍ أصفارًا ولا صورةَ حساب
  it('منصّة بلا حساب مربوط: «اربطها أوّلًا»، ولا خضرة ولا أصفار ولا صورة', () => {
    const bare = viewChannels([], () => false).find((v) => v.spec.id === 'instagram')!
    const html = screen({
      view: bare, needs: platformNeeds('instagram'),
      tally: { published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null },
      counts: { waiting: 0, ready: 0, queued: 0, published: 0, failed: 0, missingMedia: 0 },
      upcoming: [], history: { rows: [], next: null },
    })
    expect(html).toContain('اربطها أوّلًا')
    expect(html).not.toMatch(/\d من 7 جاهزة/)
    const stations = html.slice(html.indexOf('class="needs-list"'), html.indexOf('</ol>', html.indexOf('class="needs-list"')))
    expect(stations.match(/<li class="ok">/g)).toBeNull()
    expect(stations).toContain('بعد الربط')
    expect(html).not.toContain('class="acct-counts"')
    expect(html).not.toContain('class="acct-av"')
    // ‏والاسمُ مرّةً: العنوانُ وحده، بلا سطرِ المنصّة فوقه
    expect(html.match(/>Instagram</g)?.length ?? 0).toBeLessThanOrEqual(2)
    expect(html).toContain('<h1>Instagram</h1>')
  })

  it('ومنصّة مربوطة لم تنشر بعد تقول ذلك سطرًا، لا ثلاثة أصفار', () => {
    const html = screen({
      counts: { waiting: 0, ready: 0, queued: 0, published: 0, failed: 0, missingMedia: 0 },
      tally: { published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null },
    })
    expect(html).toContain('<ul class="acct-counts"><li>لم يُنشر شيء بعد</li></ul>')
    expect(html).not.toContain('<b>0</b> نُشر')
    expect(html).toContain('class="acct-av"')
  })
})

describe('سجلّ الصحّة بمنطقة المالك (D-203)', () => {
  it('عنوان التحويم بمنطقته لا بالرياض حين تُعرف', () => {
    const health = { a1: { status: 'active', expiresAt: '2026-10-01 00:00:00', refreshExpiresAt: null, refreshedAt: null, needsReauthAt: null, alerts: [] } } as const
    const ny = screen({ tab: 'setup', zone: 'America/New_York', health })
    expect(ny).toContain('title="2026-09-30 20:00"')
    expect(ny).not.toContain('title="2026-10-01 03:00')
    const unknown = screen({ tab: 'setup', zone: null, health })
    expect(unknown).toContain('title="2026-10-01 03:00 بتوقيت الرياض"')
  })
})
