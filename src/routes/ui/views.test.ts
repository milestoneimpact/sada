/**
 * ما أمسكه تدقيقُ الواجهة لوحا لوحا (D-123) — **ويُحرَس هنا لئلّا يعود**.
 *
 * كلُّ اختبارٍ هنا عيبٌ رُئي في الشاشة مرسومةً لا في الشيفرة مقروءةً:
 * ترويسةٌ خام، وزرّان بلا درجة، وشعارٌ يغيب عن منصّةٍ ثالثة، ورمزٌ يقول
 * غيرَ ما يعنيه. **والعينُ ترى مرّةً، والاختبارُ يرى في كلّ دفعة.**
 */
import { describe, expect, it } from 'vitest'
import { pivot, keyLabel } from '../../lib/pivot'
import { pivotPane } from './sections/pivot'
import { reportScreen } from './reportView'
import { draftsSection } from './sections/drafts'
import { tasksScreen } from './tasksView'
import { commandMore, commandTrigger } from './command'
import { ICON } from './icons'
import { LOGOS } from './logos'
import { loginPage } from '../panelView'
import { STYLE } from './styles'
import { bar } from './parts'
import { refusedBody } from './oauthResult'
import { scopeSet } from '../../lib/oauth/scopes'
import type { DraftRow } from '../../lib/draft/store'
import { windowLabel } from '../../lib/metrics/job'
import { platformLabel } from '../../lib/oauth/providers'
import { gatesOf, type GateFacts } from '../../lib/gates'
import { journeyBody, stationHref } from './journeyView'
import { driveFileUrl } from '../../lib/drive/sync'
import { tokenDays } from './channels'
import { securitySection } from './sections/security'
import { PROVIDERS } from '../../lib/ai/registry'
import { SCRIPT, panelPage } from '../panelView'

describe('اللوحُ المحوريّ يقرأ الأسماءَ لا المفاتيح', () => {
  it('مفتاحُ القاعدة له اسمٌ، وما ليس له اسمٌ يُعرَض بحرفه', () => {
    expect(keyLabel('status', 'published')).toBe('نُشرت')
    expect(keyLabel('platform', 'linkedin')).toBe('LinkedIn')
    expect(keyLabel('type', 'thread')).toBe('سلسلة')
    expect(keyLabel('status', 'weird')).toBe('weird')
    expect(keyLabel('day', '2026-09-07')).toBe('2026-09-07')
  })

  it('والترويساتُ تُرسَم بالاسم — **وكانت تُرسَم `published`**', () => {
    const table = pivot(
      [{ platform: 'linkedin', account: 'a', status: 'published', day: '2026-09-07',
         type: 'text', attempts: 1, succeeded: true, cost: 0 }],
      { rows: 'platform', cols: 'status', measure: 'count' },
    )
    const html = pivotPane({
      table, rows: 'platform', cols: 'status', measure: 'count', sinceDays: 30,
      capped: false, cap: 1500,
    })
    expect(html).toContain('<th scope="col">نُشرت</th>')
    // ورأسُ صفّ المنصّة رابطٌ إلى شاشتها منذ D-132 — والاسمُ فيه لا المفتاح
    expect(html).toContain('title="شاشةُ LinkedIn">LinkedIn</a></th>')
    expect(html).not.toMatch(/>published</)
    expect(html).not.toMatch(/>linkedin</)
  })
})

describe('زرّا التوصية لهما درجة', () => {
  it('القبولُ أوّليٌّ والرفضُ ثانويّ — **ولا `ghost`**', () => {
    const html = reportScreen({
      reports: [], current: null, promoCapUsd: 20, now: new Date('2026-09-06T09:00:00Z'),
      suggestions: [{
        postId: 'p1', platform: 'x', text: 'نصّ', budgetUsd: 10, currency: 'USD',
        reason: 'لأنّه الأوّل', createdAt: '2026-09-05 09:00:00',
      }],
    })
    expect(html).toContain('value="accepted" class="p"')
    expect(html).toContain('value="rejected" class="g"')
    expect(html).not.toContain('ghost')
  })
})

describe('شعارُ المسوّدة من مصدره الواحد', () => {
  const draft = (platform: DraftRow['platform']): DraftRow => ({
    id: 'd1', platform, text: 'نصّ', rationale: null, status: 'draft', model: null,
    cost: 0, sourceId: null, sourceName: null, stale: false, approvedBy: null,
    approvedAt: null, createdAt: '2026-09-05 09:00:00', scheduledAt: null,
    accountName: null, dispatchedAt: null, publishCost: 0, originalText: null
  })
  const section = (platform: DraftRow['platform']): string =>
    draftsSection({
      drafts: [draft(platform)], media: [], targets: [], earliest: '2026-09-06T09:15',
      writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true, pageOnly: [], peaks: {},
    })

  it('منصّةٌ ثالثةٌ لها شعارُها — **وكانت تُرسَم بلا شعار**', () => {
    expect(section('tiktok')).toContain(LOGOS['tiktok'])
    expect(section('linkedin')).toContain(LOGOS['linkedin'])
  })
})

describe('الرمزُ يقول ما يعنيه', () => {
  it('زرُّ البحث عدسةٌ لا شبكةُ «نظرة عامّة»', () => {
    expect(commandTrigger()).toContain(ICON.search)
    expect(commandTrigger()).not.toContain(ICON.overview)
  })

  it('و«المزيد» نقاطٌ لا زائد — الزائدُ يقول «أنشئ»', () => {
    expect(commandMore()).toContain(ICON.more)
    expect(commandMore()).not.toContain(ICON.add)
  })
})

describe('ما يُكتب في الوسم يُرسَم في الورقة', () => {
  it('صفُّ المهمّة العاجلة له قاعدة، وقائمةُ الملحوظات بلا نقاط', () => {
    expect(STYLE).toContain('tr.urgent td{')
    expect(STYLE).toContain('ul.plain{list-style:none')
    const html = tasksScreen({
      phase: null, gates: [], env: 'staging',
      rows: [{
        code: 'M-99', title: 'مهمّة', ifLeft: 'يقف', unblocks: 'gate',
        state: false, measured: '', done: () => false,
      } as never],
    })
    expect(html).toContain('<tr class="urgent">')
  })

  it('والفرقُ عن أمس حبرٌ لا حالة — إنفاقٌ نزل ليس تحذيرا', () => {
    expect(STYLE).toContain('.delta.up,.delta.down{color:var(--ink-2)}')
    expect(STYLE).not.toContain('.delta.down{color:var(--warn)}')
  })

  /**
   * **وأربعٌ في خمسة أعمدةٍ تترك عمودا أبيض** (لاحقةُ D-123). كانت قاعدةُ
   * D-102 تفتح خمسةً لكلّ «c4» فوق ‏١٩٢٠، **وبعد D-119 العددُ يقرّر الصنف**.
   */
  it('ولا عمودَ خامسَ يُفرَض على شبكةٍ من أربع', () => {
    expect(STYLE).not.toMatch(/min-width:1920px\)\{\.grid\.c4/)
    expect(STYLE).toContain('.c5{grid-template-columns:repeat(5,1fr)}')
  })

  it('واسمُ المزوّد يأخذ سطرَه في الجوّال، والعلامةُ في الشريط هناك وحدَه', () => {
    expect(STYLE).toContain('.prow .pn{flex:1 1 100%}')
    expect(STYLE).toContain('.topbar .glyph.tb{display:none')
    expect(STYLE).toContain('.topbar .glyph.tb{display:grid}')
  })
})

describe('نافذةُ القياس تُقرأ اسما لا مفتاحا (D-124)', () => {
  it('«24h» تُقال «٢٤ ساعة»، وما ليس في القاموس يُعرَض بحرفه', () => {
    expect(windowLabel('24h')).toBe('‏٢٤ ساعة')
    expect(windowLabel('7d')).toBe('‏٧ أيّام')
    expect(windowLabel('90d')).toBe('90d')
  })

  it('والتقريرُ لا يكتب مفتاحَ `CHECK` في جملةٍ عربيّة', () => {
    const html = reportScreen({
      reports: [], suggestions: [], promoCapUsd: 0, now: new Date('2026-09-06T09:00:00Z'),
      current: {
        id: '2026-08-31', createdAt: '2026-09-01 03:00:00',
        body: {
          version: 1, from: '2026-08-24', to: '2026-08-31', published: 2, measured: 2,
          spendUsd: 1, platforms: [], notes: [],
          top: { window: '24h', basis: 'count', cohort: 2,
            post: { id: 'p', platform: 'x', text: 'نصّ', publishedAt: '2026-08-25 09:00:00',
              impressions: 10, interactions: 3, window: '24h' } },
        },
      } as never,
    })
    expect(html).toContain('الأوّلُ في نافذة ‏٢٤ ساعة')
    expect(html).not.toContain('نافذة 24h')
  })
})

describe('رموزُ الليل على الجذر وحدَه (D-124)', () => {
  /**
   * زرُّ «ليليّ» يحمل `data-theme="dark"` قيمةً لا حالا. **ومحدّدٌ بلا قيدٍ
   * يجعل الزرَّ وحدَه ليليّا** — حبرُ الليل على أرض النهار، ‏٢٫٣٨:١.
   */
  it('المحدّدُ مقيّدٌ بالجذر فلا يلبسه زرٌّ يحمل السمةَ قيمةً', () => {
    expect(STYLE).toContain(':root[data-theme="dark"]{')
    expect(STYLE).not.toMatch(/\n\[data-theme="dark"\]\{/)
  })
})

describe('صفحةُ الدخول تقول ما تطلب بالعربيّة', () => {
  it('اللصيقةُ «رمزُ الإدارة» واسمُ السرّ بجانبها', () => {
    const html = loginPage({}, 'n')
    expect(html).toContain('رمزُ الإدارة <span class="mono">ADMIN_TOKEN</span>')
  })
})

/**
 * **مقياسُ المفتاح الظاهر أمسك أربعةً في أوّل تشغيل** (D-125 · `N-4`):
 * `linkedin: 4` في بوّابة التأسيس، و`linkedin` في رحلة المنشور، و`anthropic`
 * في «على ماذا»، و`24h` في سبب التوصية. **وكلُّها من جنس D-123**: مفتاحٌ
 * في مكان اسم. فصار للمنصّة اسمٌ بجانب معرِّفها في موضعٍ واحد.
 */
describe('المفتاحُ لا يُعرَض — الاسمُ يُعرَض (D-125)', () => {
  it('اسمُ المنصّة بجانب معرِّفها، وما ليس في القاموس بحرفه', () => {
    expect(platformLabel('linkedin')).toBe('LinkedIn')
    expect(platformLabel('tiktok')).toBe('TikTok')
    expect(platformLabel('mastodon')).toBe('mastodon')
  })

  it('وبوّابةُ التأسيس تعدّ بالاسم — **وكانت تعدّ `linkedin: 4`**', () => {
    const facts = {
      publishedPerPlatform: { linkedin: 4, x: 2 }, ledgerPerPlatform: { linkedin: 4, x: 2 },
      publishedWithMedia: {}, linkedInVersionDue: false,
    } as unknown as GateFacts
    const text = gatesOf(facts).flatMap((g) => g.items).map((i) => i.evidence).join('\n')
    expect(text).toContain('LinkedIn: 4 · X: 2')
    expect(text).not.toMatch(/\blinkedin: /)
  })

  it('والرحلةُ تسمّي منصّتَها', () => {
    const html = journeyBody({
      postId: 'p1', platform: 'linkedin', status: 'published', spent: 0, text: 'نصّ',
      stations: [{ kind: 'draft', title: 'كُتبت', at: '2026-09-05 09:00:00', detail: '',
        cost: null, model: null, state: 'done' }],
    }, new Date('2026-09-06T09:00:00Z'))
    expect(html).toContain('<i class="led"></i>LinkedIn</span>')
    expect(html).not.toMatch(/<i class="led"><\/i>linkedin</)
  })

  it('و«على ماذا» في سجلّ التدقيق اسمُ المزوّد لا مفتاحُه، وما ليس مزوّدا ولا منصّةً بحرفه', () => {
    expect(PROVIDERS.anthropic.name).toBe('Anthropic')
    const now = new Date('2026-09-06T09:00:00Z')
    const audit = (target: string): string => securitySection({
      sessions: [], factors: { passkeys: [] }, now,
      audit: [{ at: '2026-09-06 08:00:00', actor: 'panel:token', action: 'provider.key',
        target, detail: null, ip: null }],
    } as never).audit
    expect(audit('anthropic')).toContain('<span class="chip">Anthropic</span>')
    expect(audit('x')).toContain('<span class="chip">X</span>')
    expect(audit('d-42')).toContain('<span class="chip">d-42</span>')
  })

  /**
   * **والليليُّ في المدقّق البصريّ أمسك علّةَ إنتاجٍ في أوّل تشغيل**:
   * رابطُ الوثيقة بلون `--brand-deep` — وهو في الليل أرضُ ضغطٍ لا حبرٌ —
   * ‏٣٫٠٩:١ على أرض الليل. **فالحبرُ من `--brand` المقيس في الثيمات الثلاثة**،
   * و`--brand-deep` لا يُكتب حبرا في موضع.
   */
  it('ولا `--brand-deep` حبرا — هو أرضُ ضغطٍ في الليل لا حبرٌ', () => {
    // ولا يُتَّهم `border-color` — الحدُّ ليس حبرا
    expect(STYLE).not.toMatch(/[^-]color:var\(--brand-deep\)/)
    expect(STYLE).toContain('.doc a{color:var(--brand)')
  })
})

/**
 * **والورقُ أبيضُ في الثيمين** (D-125): مدقّقُ الطباعة قاس الوثيقةَ مطبوعةً
 * من الليليّ فوجد الترويساتِ ‏١٫٣٣:١ — حبرُ الليل على ورقٍ أبيض. فتُعاد
 * قيَمُ النهار على الجذر في الطباعة **بالمحدّد نفسِه الذي يحمل الليل**،
 * لتغلبَه بالترتيب لا بالوزن.
 */
describe('الورقُ أبيضُ في الثيمين (D-125)', () => {
  it('كتلةُ الطباعة تعيد حبرَ النهار على محدّد الليل نفسِه', () => {
    const print = STYLE.slice(STYLE.indexOf('THEME:print'))
    expect(print).toContain(':root,:root:not([data-theme="light"]),:root[data-theme="dark"]{')
    expect(print).toContain('--ink:#14291d;')
    expect(print).toContain('--bg:#ffffff;')
    expect(print).toContain('color-scheme:light;')
  })
})

/**
 * **الرحلةُ بلوحة المفاتيح أمسكت ثلاثةً في أوّل مشي** (D-125): حلقةُ تركيزٍ
 * على محرّر المسوّدة تُكتب لونا في مكان ظلٍّ فتُحسَب `none`، وزرُّ «حدّث»
 * يُعطَّل لحظةَ يُركَّز على القائمة فيقفز عنه `Tab`، ورابطُ العودة ‏٤٠px عرضا.
 */
describe('ما مشاه Tab (D-125)', () => {
  it('حلقةُ محرّر المسوّدة ظلٌّ مقيسٌ لا لونٌ في مكان ظلّ', () => {
    expect(STYLE).toContain('.draft-text:focus{outline:none; border-color:var(--brand); box-shadow:0 0 0 3px var(--ring)}')
    expect(STYLE).not.toContain('box-shadow:var(--ring)}')
  })

  it('و«حدّث» لا يُعطَّل وهي تُجلَب — busy يحرس التكرار', () => {
    expect(SCRIPT).toContain("btn.setAttribute('aria-busy','true')")
    expect(SCRIPT).not.toContain('btn.disabled=true')
  })

  it('ورابطُ العودة هدفُ لمسٍ عرضا كما هو ارتفاعا', () => {
    expect(STYLE).toMatch(/nav\.back a\{[^}]*min-width:var\(--tap\)/)
  })
})

/**
 * المرحلةُ الثالثة — الإمكاناتُ الرخيصة (D-126): **لا استعلامَ مدفوعًا،
 * وكلُّ رابطٍ يُبنى من معرِّفٍ لا من نصّ.**
 */
describe('من المحطّة إلى موضعها (D-126)', () => {
  it('كلُّ نوعٍ يقود إلى حيث يُفعَل به شيء', () => {
    expect(stationHref('source', 'x')).toEqual({ href: '/panel#sources', label: 'المصادر' })
    expect(stationHref('decision', 'x').href).toBe('/panel#posts')
    expect(stationHref('publish', 'linkedin')).toEqual({ href: '/panel/channels/linkedin', label: 'شاشةُ LinkedIn' })
    expect(stationHref('metrics', 'a b').href).toBe('/panel/channels/a%20b')
  })

  it('والرحلةُ ترسم الرابطَ في كلّ محطّة', () => {
    const html = journeyBody({
      postId: 'p1', platform: 'x', status: 'published', spent: 0, text: 'نصّ',
      stations: [
        { kind: 'source', title: 'ملفّ', at: null, detail: '', cost: null, model: null, state: 'done' },
        { kind: 'publish', title: 'نُشرت', at: null, detail: '', cost: null, model: null, state: 'done' },
      ],
    }, new Date('2026-09-06T09:00:00Z'))
    expect(html).toContain('<a class="btn g sm stop-go" href="/panel#sources">المصادر ←</a>')
    expect(html).toContain('<a class="btn g sm stop-go" href="/panel/channels/x">شاشةُ X ←</a>')
  })
})

describe('«افتح في Drive» لا يُبنى من نصّ (D-126)', () => {
  it('معرِّفٌ بصيغة Drive يصير رابطًا، وما سواه لا', () => {
    expect(driveFileUrl('1AbC_dEf-GhIjK')).toBe('https://drive.google.com/file/d/1AbC_dEf-GhIjK/view')
    expect(driveFileUrl('a/b')).toBeNull()
    expect(driveFileUrl('"><script>')).toBeNull()
    expect(driveFileUrl('short')).toBeNull()
  })
})

describe('عدُّ الأيّام على البطاقة (D-126)', () => {
  const now = new Date('2026-09-12T12:00:00Z')
  it('أسبوعٌ فأقلُّ تحذير، وما انتهى خطر، وما فوقُ رقاقةٌ هادئة، ولا رمزَ لا شيء', () => {
    expect(tokenDays(null, now)).toBe('')
    expect(tokenDays('2026-09-10 00:00:00', now)).toContain('st bad')
    expect(tokenDays('2026-09-10 00:00:00', now)).toContain('انتهى الإذن')
    expect(tokenDays('2026-09-12 20:00:00', now)).toContain('ينتهي الإذن اليوم')
    expect(tokenDays('2026-09-14 12:00:00', now)).toContain('يبقى 2 يومان للإذن')
    expect(tokenDays('2026-09-19 12:00:00', now)).toContain('st warn')
    expect(tokenDays('2026-10-30 12:00:00', now)).toContain('<span class="chip"')
    expect(tokenDays('2026-10-30 12:00:00', now)).toContain('الإذن 48 يوما')
    expect(tokenDays('not-a-date', now)).toBe('')
  })
})

/**
 * المرحلةُ الثالثة — الموجةُ الثانية (D-127): فرزٌ بالمنصّة وترتيب، و«ما مضى» رسمًا.
 */
describe('فرزٌ بالمنصّة وترتيب (D-127)', () => {
  const draft = (id: string, platform: DraftRow['platform'], createdAt: string, cost: number): DraftRow => ({
    id, platform, text: 'نصّ', rationale: null, status: 'draft', model: null,
    cost: 0, sourceId: null, sourceName: null, stale: false, approvedBy: null,
    approvedAt: null, createdAt, scheduledAt: null,
    accountName: null, dispatchedAt: null, publishCost: cost, originalText: null
  })
  const html = draftsSection({
    drafts: [draft('a', 'linkedin', '2026-09-05 09:00:00', 0.02), draft('b', 'x', '2026-09-06 09:00:00', 0.05)],
    media: [], targets: [], earliest: '2026-09-06T09:15',
    writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true, pageOnly: [], peaks: {},
  })

  it('تبويبُ المنصّات من المسوّدات نفسِها، بالاسم وبالعدد، والافتراضُ الكلّ', () => {
    expect(html).toContain('data-platform-tab="all" aria-pressed="true">كلُّ المنصّات<span class="count">2</span>')
    expect(html).toContain('data-platform-tab="linkedin" aria-pressed="false"\n      >LinkedIn<span class="count">1</span>')
    expect(html).toContain('data-platform-tab="x"')
    expect(html).not.toContain('data-platform-tab="tiktok"')
  })

  it('والترتيبُ قائمةٌ افتراضُها الأحدث، والبطاقةُ تحمل مفتاحَيه', () => {
    expect(html).toContain('<select id="draft-order"')
    expect(html).toContain('<option value="new" selected>')
    expect(html).toContain(`data-created="${Date.parse('2026-09-06T09:00:00Z')}" data-cost="0.05"`)
  })

  it('والشريحةُ مخفيّةٌ بلا JavaScript — والقائمةُ كاملة', () => {
    expect(html).toContain('id="draft-platform" aria-label="فرزُ المسوّدات بالمنصّة" hidden')
    expect(SCRIPT).toContain("platform=b.dataset.platformTab")
    expect(SCRIPT).toContain("order=orderSel.value; reorder();")
  })
})

describe('حقلُ الأمر على اللمس (D-127)', () => {
  it('textarea.mono يُذكَر باسمه في طبقة اللمس — وإلّا قرّبه iOS', () => {
    expect(STYLE).toMatch(/@media\(pointer:coarse\)\{[\s\S]*textarea\.mono,\.cmd-text\{font-size:var\(--t-lg\)\}/)
  })
})

describe('«ما مضى» رسمًا (D-127)', () => {
  const report = (id: string, published: number, measured: number) => ({
    id, createdAt: '2026-09-01 03:00:00',
    body: { version: 1, from: id, to: id, published, measured, spendUsd: 1, platforms: [], notes: [], top: null },
  })
  it('أسابيعُ بترتيبها، ومع كلّ عمودٍ عددُ المقيس، والجزئيُّ مخطَّط', () => {
    const html = reportScreen({
      reports: [report('2026-09-07', 5, 5), report('2026-08-31', 8, 3)] as never,
      current: null, suggestions: [], promoCapUsd: 0, now: new Date('2026-09-08T09:00:00Z'),
    })
    expect(html).toContain('class="chart bars history"')
    const first = html.indexOf('href="/panel/report/2026-09-07"')
    const second = html.indexOf('href="/panel/report/2026-08-31"')
    expect(first).toBeGreaterThan(-1)
    expect(first).toBeLessThan(second)
    expect(html).toContain('<b>8</b> <span class="sub">قِيس 3</span>')
    expect(html).toContain('bar-fill part')
    expect(html.match(/bar-fill part/g)).toHaveLength(1)
  })
})

/**
 * المرحلةُ الرابعة — ما يحتاج ترحيلًا (D-128): الفرقُ سطرًا سطرًا من الأصل
 * المحفوظ، مطويًّا، وبعلامةٍ قبل اللون.
 */
describe('ما تغيّر قبل الاعتماد (D-128)', () => {
  const base = (over: Partial<DraftRow>): DraftRow => ({
    id: 'd1', platform: 'linkedin', text: 'أوّل\nثانٍ معدَّل', rationale: null, status: 'edited', model: null,
    cost: 0, sourceId: null, sourceName: null, stale: false, approvedBy: 'omar',
    approvedAt: '2026-09-05 09:00:00', createdAt: '2026-09-05 08:00:00', scheduledAt: null,
    accountName: null, dispatchedAt: null, publishCost: 0, originalText: 'أوّل\nثانٍ',
    ...over,
  })
  const section = (d: DraftRow): string =>
    draftsSection({
      drafts: [d], media: [], targets: [], earliest: '2026-09-06T09:15',
      writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true, pageOnly: [], peaks: {},
    })

  it('المعدَّلةُ تحمل فرقَها مطويًّا: المحذوفُ بـ«−» والمضافُ بـ«+»', () => {
    const html = section(base({}))
    expect(html).toContain('<details class="diff">')
    expect(html).toContain('ما تغيّر قبل الاعتماد <span class="chip">2 سطران</span>')
    expect(html).toContain('<span class="dl del">− ثانٍ</span>')
    expect(html).toContain('<span class="dl add">+ ثانٍ معدَّل</span>')
    expect(html).toContain('<span class="dl same">  أوّل</span>')
  })

  it('والمعتمَدةُ كما كُتبت، والمعدَّلةُ بلا أصلٍ محفوظ، لا فرقَ لهما', () => {
    expect(section(base({ status: 'approved', originalText: null }))).not.toContain('class="diff"')
    expect(section(base({ originalText: null }))).not.toContain('class="diff"')
  })
})

/**
 * رأسُ الصفّ بابٌ إلى شاشته (D-132): منصّةٌ لها شاشةٌ تصير رابطًا، وما سواه اسم.
 */
describe('رأسُ صفّ الجدول المحوريّ (D-132)', () => {
  const facts = [{ platform: 'linkedin', account: 'a', status: 'published', day: '2026-09-07',
    type: 'text', attempts: 1, succeeded: true, cost: 0 }]
  it('صفُّ المنصّة رابطٌ إلى شاشتها، وصفُّ الحال اسمٌ كما كان', () => {
    const byPlatform = pivotPane({
      table: pivot(facts, { rows: 'platform', cols: null, measure: 'count' }),
      rows: 'platform', cols: null, measure: 'count', sinceDays: 30, capped: false, cap: 1500,
    })
    expect(byPlatform).toContain('<th scope="row"><a href="/panel/channels/linkedin" title="شاشةُ LinkedIn">LinkedIn</a></th>')
    const byStatus = pivotPane({
      table: pivot(facts, { rows: 'status', cols: null, measure: 'count' }),
      rows: 'status', cols: null, measure: 'count', sinceDays: 30, capped: false, cap: 1500,
    })
    expect(byStatus).toContain('<th scope="row">نُشرت</th>')
    expect(byStatus).not.toContain('/panel/channels/')
  })
})


/**
 * **الامتلاءُ ليس واحدًا** (D-134): سقفٌ بُلغ أحمرُ، وعملٌ اكتمل أخضر —
 * والشريطُ وعلامتُه تحته لونٌ واحد.
 */
describe('شريطُ المقدار (D-134)', () => {
  it('السقفُ المبلوغ أحمرُ f، والاكتمالُ done — وكلاهما بنصّ', () => {
    const capped = bar(10, 10)
    expect(capped).toContain('<i class="f"')
    expect(capped).toContain('بلغ السقف')
    expect(capped).not.toContain('done')

    const done = bar(2, 2, 'كلّها محلَّلة')
    expect(done).toContain('<i class="done"')
    expect(done).toContain('class="cap done"')
    expect(done).not.toContain('class="f"')
    expect(STYLE).toContain('.bar i.done{background:var(--ok)}')
  })

  it('وما لم يمتلئ بلا لونِ حالٍ ولا نصّ', () => {
    const part = bar(1, 2, 'كلّها محلَّلة')
    expect(part).toContain('<i class=""')
    expect(part).not.toContain('cap')
  })
})

/** بطاقةُ الجدول: العدُّ وزرُّ CSV في رأسها، والشرحُ تحته (D-137). */
describe('رأسُ بطاقة الجدول المحوريّ (D-137)', () => {
  it('الزرُّ في الرأس مع العدّ، ورأسُ اللوح موجود', () => {
    const rows = [
      { day: '2026-09-01', platform: 'x', account: 'a', status: 'published', costUsd: 0.1, week: '2026-W36', month: '2026-09' },
      { day: '2026-09-02', platform: 'linkedin', account: 'b', status: 'failed', costUsd: 0.2, week: '2026-W36', month: '2026-09' },
    ] as never
    const html = pivotPane({ rows: 'platform', cols: 'status', measure: 'count', sinceDays: 30, table: pivot(rows, { rows: 'platform', cols: 'status', measure: 'count' }), capped: false, cap: 5000 } as never)
    expect(html).toContain('<h1>الجدول المحوريّ</h1>')
    const split = html.indexOf('<div class="split">')
    const acts = html.indexOf('<div class="row acts">', split)
    const csv = html.indexOf('نزّل الجدولَ CSV', acts)
    const hint = html.indexOf('ملفُّ CSV يحمل', csv)
    expect(acts).toBeGreaterThan(split)
    expect(csv).toBeGreaterThan(acts)
    expect(hint).toBeGreaterThan(csv)
    expect(html).toContain(' download>')
  })
})

/** بطاقةُ الخطوات في شاشة الرفض: عمودان على العريض (D-137). */
describe('بطاقةُ الخطوات (D-137)', () => {
  it('الخطواتُ ثمّ جانبٌ فيه البابُ و«إن نجح»', () => {
    const html = refusedBody({ platform: 'linkedin', reason: 'unauthorized_scope_error', requested: scopeSet('linkedin'), identityRetry: true })
    const card = html.indexOf('<div class="card guide"')
    const steps = html.indexOf('<ol class="steps">', card)
    const aside = html.indexOf('<div class="guide-aside">', steps)
    const outcome = html.indexOf('<div class="outcome">', aside)
    expect(card).toBeGreaterThan(0)
    expect(steps).toBeGreaterThan(card)
    expect(aside).toBeGreaterThan(steps)
    expect(outcome).toBeGreaterThan(aside)
    expect(STYLE).toContain('.card.guide{display:grid')
  })
})
