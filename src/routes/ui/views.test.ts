/**
 * ما أمسكه تدقيقُ الواجهة لوحا لوحا (D-123) — **ويُحرَس هنا لئلّا يعود**.
 *
 * كلُّ اختبارٍ هنا عيبٌ رُئي في الشاشة مرسومةً لا في الشيفرة مقروءةً:
 * ترويسةٌ خام، وزرّان بلا درجة، وشعارٌ يغيب عن منصّةٍ ثالثة، ورمزٌ يقول
 * غيرَ ما يعنيه. **والعينُ ترى مرّةً، والاختبارُ يرى في كلّ دفعة.**
 */
import { describe, expect, it } from 'vitest'
import { FACES, REEM_KUFI } from '../../lib/ui/fonts'
import { readFileSync } from 'node:fs'
import { pivot, keyLabel } from '../../lib/pivot'
import { pivotPane } from './sections/pivot'
import { reportScreen } from './reportView'
import { draftsSection } from './sections/drafts'
import { tasksScreen } from './tasksView'
import { commandMore, commandTrigger } from './command'
import { ICON } from './icons'
import { TOKENS } from './tokens'
import { LOGOS } from './logos'
import { loginPage } from '../panelView'
import { STYLE } from './styles'
import { bar, status } from './parts'
import { refusedBody } from './oauthResult'
import { backNav, ICON_BYTES, shell, soloPage } from './shell'
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
import { panelPage } from '../panelView'
import { SCRIPT } from './panelScript'

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
    expect(windowLabel('24h')).toBe('24 ساعة')
    expect(windowLabel('7d')).toBe('7 أيّام')
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
    expect(html).toContain('الأوّلُ في نافذة 24 ساعة')
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
  it('اللصيقةُ «كلمةُ الإدارة» واسمُ السرّ بجانبها', () => {
    const html = loginPage({}, 'n')
    expect(html).toContain('كلمةُ الإدارة <span class="mono">ADMIN_TOKEN</span>')
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
    expect(print).toContain('--ink:#191b1f;')
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
 * ما قيل عن الشريحة يُقرأ تحت الصورة (D-162): كان يُقال في الوميض مرّةً ثمّ
 * يُرمى، فالبطاقةُ بعد التحديث لا تعرف أرُكّب العنوانُ أم سقط.
 */
describe('ما قيل عن الشريحة يُقرأ تحت الصورة (D-162)', () => {
  const draft: DraftRow = {
    id: 'd1', platform: 'linkedin', text: 'نصّ', rationale: null, status: 'draft', model: null,
    cost: 0, sourceId: null, sourceName: null, stale: false, approvedBy: null,
    approvedAt: null, createdAt: '2026-09-05 09:00:00', scheduledAt: null,
    accountName: null, dispatchedAt: null, publishCost: 0, originalText: null,
  }
  const card = (note: string | null, headline: string | null): string =>
    draftsSection({
      drafts: [draft],
      media: [{
        id: 'm1', postId: 'd1', mime: 'image/jpeg', bytes: 148_320, prompt: 'p', cost: 0.039,
        status: 'ready', note, headline,
      }],
      targets: [], earliest: '2026-09-06T09:15',
      writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true, pageOnly: [], peaks: {},
    })
  const NO_KEY = 'لا مفتاحَ متصفّحٍ مضبوط — اضبط CF_BROWSER_TOKEN و CF_AI_ACCOUNT_ID في أسرار Worker'
  const OFF = 'تركيبُ النصّ مُطفأٌ من الإعدادات'

  it('رُكّب: «على الصورة» والعنوانُ، و alt يحمله', () => {
    const html = card('', 'أثرٌ يُقاس')
    expect(html).toContain(status('ok', '●', 'على الصورة'))
    expect(html).toContain('«أثرٌ يُقاس»')
    expect(html).toContain('alt="صورةٌ مولَّدة وعليها: أثرٌ يُقاس"')
    expect(html).not.toContain('بلا نصٍّ فوقها')
  })

  it('سقط: «بلا نصٍّ فوقها» تحذيرًا، والسببُ مؤرَّخًا، والعنوانُ المقترح', () => {
    const html = card(NO_KEY, 'أثرٌ يُقاس')
    expect(html).toContain(status('warn', '!', 'بلا نصٍّ فوقها'))
    expect(html).toContain(`عند التوليد: ${NO_KEY}`)
    expect(html).toContain('والعنوانُ المقترح «أثرٌ يُقاس»')
    // وما لم يُرسَم لا يُقال في alt إنّه عليها
    expect(html).toContain('alt="صورةٌ مولَّدة تصاحب المنشور"')
  })

  /**
   * **والإطفاءُ قرارٌ لا عطل**: بطاقةُ الإعدادات تقول «وهذا ليس عطلا»، فتحذيرٌ
   * أصفرُ على كلّ صورةٍ يكذّبها. ويُطابَق بآخر السبب: سقوطُ الموجز يسبقه بـ«؛».
   */
  it('أُطفئ التركيب: رقاقةٌ ساكنة لا تحذير — ولو سبقه سقوطُ الموجز', () => {
    for (const note of [OFF, `لا مزوّدَ للكتابة (writer)؛ ${OFF}`]) {
      const html = card(note, null)
      expect(html).toContain(status('idle', '○', 'بلا نصٍّ فوقها'))
      expect(html).not.toContain(status('warn', '!', 'بلا نصٍّ فوقها'))
    }
  })

  it('صفٌّ قديمٌ أو رُكّب بلا عنوان: لا سطرَ — لا يُدّعى ما لم يُسجَّل', () => {
    for (const [note, headline] of [[null, null], [null, 'أثرٌ يُقاس'], ['', null]] as const) {
      const html = card(note, headline)
      expect(html).not.toContain('بلا نصٍّ فوقها')
      expect(html).not.toContain('على الصورة')
      expect(html).not.toContain('عند التوليد')
    }
  })

  it('العنوانُ والسببُ من خارجنا — يُهرَّبان في النصّ وفي alt', () => {
    const drawn = card('', '<b>x</b>"')
    expect(drawn).toContain('«&lt;b&gt;x&lt;/b&gt;&quot;»')
    expect(drawn).toContain('alt="صورةٌ مولَّدة وعليها: &lt;b&gt;x&lt;/b&gt;&quot;"')
    expect(drawn).not.toContain('<b>x</b>')
    const failed = card('تعذّر تصويرُ الشريحة: <img src=x>', '<i>y</i>')
    expect(failed).toContain('&lt;img src=x&gt;')
    expect(failed).toContain('«&lt;i&gt;y&lt;/i&gt;»')
    expect(failed).not.toContain('<img src=x>')
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

/** الطبعةُ الثانية (D-139): كلُّ قيمةٍ من السلّم، والكتلةُ آخرَ الورقة. */
describe('الطبعةُ الثانية (D-139)', () => {
  it('الرتبةُ الكبرى معرَّفةٌ وتُستعمل على العريض وحدَه، والرافدةُ بتدرّج', () => {
    expect(STYLE).toContain('--t-4xl:56px')
    expect(STYLE).toMatch(/@media\(min-width:1181px\)\{\.page-head h1\{font-size:var\(--t-4xl\)/)
    expect(STYLE).toMatch(/@media\(min-width:901px\)\{\.grid>\.tile:first-child \.v\{font-size:var\(--t-4xl\)/)
    // والرافدةُ سطحٌ من الثيم بلا تدرّجٍ منذ D-144، وقاعدتُها واحدةٌ منذ D-148
    expect(STYLE).toMatch(/\.rail\{background:var\(--chrome\); border-inline-start:1px solid var\(--line\);/)
    expect(STYLE).not.toContain('background-image:linear-gradient(180deg,var(--chrome)')
  })
})

/**
 * الطبعةُ الثالثة — المؤسّسيّة (D-143): وجهُ عرضٍ كوفيٌّ للعناوين، وشريطُ
 * المؤشّرات سطحٌ واحدٌ بفواصلَ من خيط، والرقمُ رقيقٌ، وأفعالُ القوائم هادئةٌ
 * بهدفِ لمسٍ باقٍ. والكتلةُ آخرَ الورقة فتغلب.
 */
describe('الطبعةُ الثالثة (D-143)', () => {
  it('وجهُ العرض معرَّفٌ رمزًا ومحمَّلٌ وجهًا ثالثًا بمسارٍ بلا فراغ', () => {
    expect(STYLE).toContain('--font-display:"Inter","Reem Kufi","Beiruti"')
    expect(STYLE).toMatch(/\.page-head h1,\.card h2,\.sec,[^{]*\{font-family:var\(--font-display\)\}/)
    expect(FACES).toContain(REEM_KUFI)
    expect(REEM_KUFI.path).toBe('/f/reem-kufi.9eccd028.woff2')
    expect(REEM_KUFI.path).not.toMatch(/\s/)
  })
  it('شريطُ المؤشّرات سطحٌ واحد، والرقمُ رقيق، والفعلُ الهادئ يبقى هدفَ لمس', () => {
    expect(STYLE).toContain('.grid.tiles{gap:1px; background:var(--line)')
    expect(STYLE).toContain('.grid.tiles>.tile{border:0; border-radius:0; box-shadow:none')
    expect(STYLE).toMatch(/\.tile \.v\{font-size:var\(--t-2xl\); font-weight:400;/)
    expect(STYLE).toMatch(/\.todo>li>a\.btn,\.todo>li>form \.btn\{background:transparent;[^}]*min-width:44px/)
    expect(STYLE.lastIndexOf('D-143')).toBeGreaterThan(STYLE.lastIndexOf('D-142'))
  })
})

/**
 * الطبعةُ الرابعة — الحبرُ والنحاس (D-144): الحبرُ هو اللونُ الأوّل، والنحاسُ
 * خيطٌ، والرافدةُ من الثيم لا ثيمٌ ثالث، والعلامةُ ثابتةٌ في الثيمين.
 */
describe('الطبعةُ الرابعة — الحبرُ والنحاس (D-144)', () => {
  it('الحبرُ لونُ البنية نهارًا وليلًا، والنحاسُ يجتاز نصّا', () => {
    const light = TOKENS.slice(TOKENS.indexOf('THEME:light'), TOKENS.indexOf('@media(prefers-color-scheme:dark)'))
    const dark = TOKENS.slice(TOKENS.indexOf(':root[data-theme="dark"]'))
    expect(light).toContain('--brand:#1f2430;')
    expect(light).toContain('--on-brand:#f7f5ef;')
    expect(light).toContain('--au:#7f6128;')
    expect(dark).toContain('--brand:#e9e6de;')
    expect(dark).toContain('--on-brand:#12141a;')
    expect(TOKENS).not.toContain('#12623e')
    expect(TOKENS).not.toContain('#82c69e')
  })
  it('الرافدةُ ترث الثيم، والعلامةُ حبرٌ ونحاسٌ ثابتان', () => {
    expect(TOKENS).not.toContain('THEME:rail')
    expect(TOKENS).toContain('--glyph-bg:#14161c; --glyph-fg:#e2c98f;')
    expect(STYLE).not.toContain('.rail::after{')
    expect(STYLE).toMatch(/\.glyph\{[^}]*background:var\(--glyph-bg\); color:var\(--glyph-fg\);/)
    expect(STYLE).toMatch(/nav\.tabs a\[aria-current=page\]::before\{[^}]*width:2px;[^}]*background:var\(--au\)\}/)
  })
  it('الأزرارُ الأوّليّةُ مصمتة، والبطاقاتُ مسطّحة، والتنبيهاتُ سطحٌ بخيط', () => {
    expect(STYLE).toContain('.p{background:var(--brand); color:var(--on-brand)}')
    expect(STYLE).toMatch(/\.card\{background:var\(--surface\); border:1px solid var\(--line\);[^}]*\}/)
    expect(STYLE).not.toMatch(/\n\.card\{[^}]*box-shadow:var/)
    expect(STYLE).toMatch(/\.flash\{[^}]*background:var\(--surface\);[^}]*border-inline-start:3px solid var\(--line-strong\)/)
    expect(STYLE).toContain('.flash.ok{border-inline-start-color:var(--ok)}')
  })
  it('رمزُ التبويب ولونُ المتصفّح من الطبعة نفسِها', () => {
    expect(ICON_BYTES).toContain('c9a962')
    expect(ICON_BYTES).toContain('14161c')
    expect(ICON_BYTES).not.toContain('82c69e')
    const html = shell('ت', '<p>x</p>', 'n1')
    expect(html).toContain('<meta name="theme-color" content="#1f2430">')
  })
})

/**
 * تصفيةُ الطبعات (D-148): محدّدٌ واحدٌ في المستوى الأعلى يُعلَن مرّةً. الحارسُ
 * في `audit_classes`، وهنا يُثبَّت أنّ الطبقاتِ التي كانت تُعاد صارت قاعدةً
 * واحدةً تحمل آخرَ قيمة.
 */
describe('تصفيةُ الطبعات (D-148)', () => {
  it('البطاقةُ والرافدةُ والمؤشّرُ الأوّل كلٌّ بقاعدةٍ واحدة تحمل آخرَ قيمة', () => {
    const count = (sel: string): number => STYLE.split('\n').filter((l) => l.startsWith(sel + '{')).length
    for (const sel of ['.card', '.rail', '.p', '.flash', '.tile .v', '.grid>.tile:first-child .v', '.rail-head', 'nav.tabs a[aria-current=page]']) {
      expect(count(sel), sel).toBe(1)
    }
    expect(STYLE).toContain('.grid>.tile:first-child .v{font-size:var(--t-3xl); color:var(--au); font-weight:400; letter-spacing:-1.2px}')
    expect(STYLE).toContain('.rail-head{padding:var(--s-6) var(--s-5) var(--s-5);')
    expect(STYLE).toContain('nav.tabs a[aria-current=page]{background:var(--surface-3); color:var(--ink); position:relative}')
    expect(STYLE).not.toMatch(/radial-gradient\([^)]*var\(--au\)/)
  })
})

/**
 * ما وراء المقاييس (D-149): ستّةَ عشرَ إصلاحًا ثبت كلٌّ منها بثلاثة خصوم.
 * تُثبَّت هنا الأسطرُ التي تحمل الإصلاحَ، والسلوكُ الذي يُقاس في المتصفّح
 * يُقاس بـ audit_design وscripts/snapshot_styles.
 */
describe('ما وراء المقاييس (D-149)', () => {
  it('الاتّجاه: هامشٌ منطقيٌّ واحد، وخيطُ القسم من البداية، وشريطُ المختار في النهاية، وسهمُ العودة إلى البداية', () => {
    expect(STYLE).toContain('.slice .stats{margin:0; margin-inline-start:auto; padding:0; border-top:0}')
    expect(STYLE).toMatch(/\.sec::after\{[^}]*linear-gradient\(to left,var\(--au\)/)
    expect(STYLE).toContain('.cmdk-o[aria-selected="true"]{background:var(--surface-2);\n  box-shadow:inset -3px 0 0 var(--brand)}')
    expect(STYLE).not.toMatch(/\.cmdk-g\{[^}]*letter-spacing/)
    expect(backNav('/panel#channels', 'القنوات')).toContain('→ القنوات')
    expect(backNav('/panel#channels', 'القنوات')).not.toContain('\u2190')
  })
  it('الوصول: حشوُ التمرير تحت الشريط، والرابطُ الهادئ بخيطٍ لا بلونٍ وحدَه، وحقلُ الأوامر يقول «هنا»', () => {
    expect(STYLE).toMatch(/html\{[^}]*scroll-padding-top:calc\(64px \+ var\(--s-3\)\)/)
    expect(STYLE).toMatch(/\.todo>li>a\.btn,\.todo>li>form \.btn\{[^}]*text-decoration:underline;[^}]*text-decoration-color:var\(--au\)/)
    expect(STYLE).toMatch(/\.pv th a\{[^}]*text-decoration:underline/)
    expect(STYLE).toContain('.cmdk-in:focus-within{box-shadow:inset 0 -2px 0 var(--au)}')
    expect(STYLE).toContain('.busy-note{')
  })
  it('الرموز: لا زمرّدَ في الوهج بصيغة rgba، والتاريخُ في مفتاح الرسم معزول، والرقمُ المحلّيُّ غربيٌّ في كلّ ICU', () => {
    expect(TOKENS).not.toContain('rgba(18,98,62')
    expect(TOKENS).not.toContain('rgba(130,198,158')
    const chart = readFileSync(new URL('./chart.ts', import.meta.url), 'utf8')
    expect(chart).toContain('· <span class="mono">${escapeHtml(peak.day.slice(5))}</span>')
    const time = readFileSync(new URL('./time.ts', import.meta.url), 'utf8')
    expect(time).toContain("toLocaleString('ar-u-nu-latn'")
  })
})

/** الشاشةُ المستقلّة تحمل العلامة (D-140): بابٌ إلى اللوحة قبل سهم العودة. */
describe('شريطُ العودة (D-140)', () => {
  it('العلامةُ أوّلًا بابًا إلى اللوحة، ثمّ السهم، ولا تنكمش', () => {
    const html = backNav('/panel#channels', 'القنوات')
    const home = html.indexOf('<a class="home" href="/panel"')
    const back = html.indexOf('→ القنوات')
    expect(home).toBeGreaterThan(0)
    expect(back).toBeGreaterThan(home)
    expect(html).toContain('<span class="glyph sm">')
    expect(STYLE).toContain('nav.back .home,nav.back .home .glyph{flex:none}')
    expect(STYLE).toContain('.glyph.sm svg{width:17px; height:17px}')
  })
})

/**
 * **العيّنةُ تستدعي الإطارَ من مصدره** (لاحقةُ D-140): كانت `render_screens`
 * تكتب شريطَ العودة حرفًا، فدُقّق شريطٌ ليس شريطَ المنتَج وضاعت علامةٌ أُضيفت
 * إليه. فلا يُكتب في العيّنات وسمٌ من وسوم الإطار — يُستدعى.
 */
describe('العيّناتُ لا تنسخ الإطار (D-140)', () => {
  it.each(['render_screens.ts', 'render_panel.ts', 'render_legal.ts'])('%s بلا وسمِ إطارٍ مكتوبٍ بيد', (name) => {
    const src = readFileSync(new URL(`../../../scripts/${name}`, import.meta.url), 'utf8')
    for (const tag of ['<nav class="back"', 'class="rail"', 'class="topbar"', 'class="theme"', 'class="rail-head"']) {
      expect(src, `${name} يكتب ${tag} بدل استدعاء مصدره`).not.toContain(tag)
    }
  })
})

describe('D-151 — قالبٌ واحدٌ للشاشة المستقلّة وقاموسٌ واحدٌ للمنصّات', () => {
  it('soloPage يبني التخطّي والعلامةَ والعودةَ والمحتوى ويحمل سكربتَ الثيم', () => {
    const html = soloPage('صدى — تجربة', { href: '/panel#posts', label: 'المنشورات' }, '<p>x</p>', 'n')
    expect(html).toContain('<a class="skip" href="#main">')
    expect(html).toContain('class="home"')
    expect(html).toContain('→ المنشورات')
    expect(html).toContain('<main id="main"><p>x</p></main>')
    expect(html).toContain('sada-theme')
  })

  it('بندُ خطّةٍ لمنصّةٍ خارج الاثنتين يحمل اسمَها لا مفتاحَها', async () => {
    const { planSection } = await import('./sections/plan')
    // النوعُ يحصر المنصّةَ في اثنتين، والخطّةُ تصل JSON من نموذجٍ لا يعرف النوع
    const html = planSection({
      plan: {
        id: 'w', week: '2026-09-13', model: 'm', status: 'draft', createdAt: '2026-09-12 08:00',
        plan: { rationale: 'ر', items: [
          { sourceId: 's', platform: 'youtube' as never, angle: 'ز', day: '2026-09-14', time: '09:00', why: 'س' },
        ] },
      },
      names: { s: 'مصدر' }, ready: true, analyzed: 2, now: new Date('2026-09-13T00:00:00Z'),
    })
    expect(html).toContain('YouTube')
    expect(html).not.toMatch(/>youtube</)
  })
})

describe('D-154 — رقاقةُ الحال دالّةٌ ورمزُها مرسوم', () => {
  it.each(['●', '○', '◍', '◔', '▲', '◆', '✓', '✕', '↑', '!'])('الحرفُ %s يُرسَم SVG بلون النصّ', (glyph) => {
    const html = status('ok', glyph, 'نصّ')
    expect(html).toContain('<span class="st ok"><span class="g"><svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">')
    expect(html).not.toContain(glyph)
    expect(html).toContain('</svg></span>نصّ</span>')
  })

  it('حرفٌ بلا رسمٍ يُطبَع مهرَّبًا، والسِّماتُ تُلحَق، والصنفُ الفارغ لا يترك فراغًا', () => {
    expect(status('warn', '<', 'x', 'title="t"')).toBe('<span class="st warn" title="t"><span class="g">&lt;</span>x</span>')
    expect(status('', '●', 'x')).toContain('<span class="st"><span class="g"><svg')
  })
})
