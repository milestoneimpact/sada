/**
 * ما أمسكه تدقيقُ الواجهة لوحا لوحا (D-123) — **ويُحرَس هنا لئلّا يعود**.
 *
 * كلُّ اختبارٍ هنا عيبٌ رُئي في الشاشة مرسومةً لا في الشيفرة مقروءةً:
 * ترويسةٌ خام، وزرّان بلا درجة، وشعارٌ يغيب عن منصّةٍ ثالثة، ورمزٌ يقول
 * غيرَ ما يعنيه. **والعينُ ترى مرّةً، والاختبارُ يرى في كلّ دفعة.**
 */
import { describe, expect, it } from 'vitest'
import { FACES } from '../../lib/ui/fonts'
import { readFileSync } from 'node:fs'
import { pivot, keyLabel } from '../../lib/pivot'
import { pivotPane } from './sections/pivot'
import { reportScreen } from './reportView'
import { byUrgency, draftsSection } from './sections/drafts'
import { tasksScreen } from './tasksView'
import { commandTrigger } from './command'
import { railHtml } from './rail'
import { GLYPH_ICON, ICON } from './icons'
import { LOGOS } from './logos'
import { loginPage, worthCell } from '../panelView'
import { secondFactorPage } from '../authView'
import { landingPage } from '../landing'
import { runInNewContext } from 'node:vm'
import { THEME_SCRIPT } from './scripts'
import { serverErrorPage } from './errorView'
import { STYLE } from './styles'
import { sheet, type Decl, type Sheet } from '../../test/css'
import { bar, fileName, glyph, pathArrows } from './parts'
import { statusBadge } from './components/badge'
import { refusedBody } from './oauthResult'
import { backNav, ICON_BYTES, shell, soloPage } from './shell'
import { soloNav } from './rail'
import { scopeSet } from '../../lib/oauth/scopes'
import type { DraftRow } from '../../lib/draft/store'
import { windowLabel } from '../../lib/metrics/job'
import { platformLabel } from '../../lib/oauth/providers'
import { gatesOf, type GateFacts } from '../../lib/gates'
import { journeyBody, stationHref } from './journeyView'
import { noteOf } from '../../lib/image/job'
import { driveFileUrl } from '../../lib/drive/sync'
import { channelHealth } from '../../lib/channels'
import { securitySection } from './sections/security'
import { PROVIDERS } from '../../lib/ai/registry'
import { panelPage } from '../panelView'
import { SCRIPT } from './panelScript'
import { imageReadiness, infographicReadiness, videoReadiness } from '../../lib/media/readiness'
import { slideGate } from '../../lib/image/gate'
import { videoCapGate } from '../../lib/limits'
import { CQ, MARK, MOMENT, PRINT, THEME, atLeast, below, narrower } from './tokens'
import { nativePost } from './nativePost'
import { channelsSection } from './channels'
import { viewChannels } from '../../lib/channels'
import { planSection } from './sections/plan'

/** نقاطٌ تامّةٌ كلُّها — لما لا يُختبَر فيه السطرُ نفسُه (D-163). */
const READY = {
  infographic: infographicReadiness({ blocker: null, browser: { key: true, account: true }, briefReady: true }),
  image: imageReadiness({
    blocker: null, provider: { label: 'Gemini', refusal: null },
    slide: slideGate({ overlay: true, hasBrowserKey: true, hasAccount: true }), briefReady: true,
  }),
  video: videoReadiness({ face: 'env', blocker: null, clips: videoCapGate(0, 2) }),
}

/**
 * الورقةُ تُسأل قواعدَ لا نصًّا (N-13): المحدّدُ في سياقه وقيمتُه الساريةُ
 * بترتيب المصدر — فلا يُسقط الاختبارَ تعليقٌ ولا إعادةُ لفّ، ولا تجتازه قاعدةٌ
 * خرجت من كتلتها أو قائمةٌ لاحقةٌ غلبت. **وهي المعلَنُ لا المحسوب**: لا
 * خصوصيّةَ بين محدّدين ولا وراثة (المحسوبُ لـ scripts/snapshot_styles).
 * ولا تُحلَّل حتى تُسأل، فقوسٌ مكسورٌ يُسقط اختباراتِ الورقة بأسمائها وحدَها.
 */
const css = sheet(STYLE)

/** تصريحاتٌ في أيّ سياقٍ تحقّق شرطًا — مكتوبةً قاعدةً تُقرأ في رسالة السقوط. */
const found = (test: (d: Decl) => boolean): string[] =>
  css.decls().filter(test).map((d) => `${d.at} ${d.selectors.join(',')}{${d.prop}:${d.value}}`.trim())

/** أيسبق التصريحُ `a` التصريحَ `b` في سريان المحدّد؟ المختصَرُ بعد المفصَّل يمحوه. */
const precedes = (selector: string, a: string, b: string): boolean => {
  const keys = Object.keys(css.rule(selector))
  return keys.includes(a) && keys.indexOf(a) < keys.indexOf(b)
}

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
    expect(html).toContain('value="accepted" class="btn btn-primary"')
    expect(html).toContain('value="rejected" class="btn btn-secondary"')
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
      mediaReady: READY,
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
    const more = railHtml({ inPanel: true }).split('<details class="more-sheet">')[1] ?? ''
    expect(more).toContain(ICON.more)
    expect(more).not.toContain(ICON.add)
  })
})

describe('ما يُكتب في الوسم يُرسَم في الورقة', () => {
  it('صفُّ المهمّة العاجلة له قاعدة، وقائمةُ الملحوظات بلا نقاط', () => {
    expect(css.where('tr.urgent td')).toContain('')
    expect(css.rule('ul.plain')['list-style']).toBe('none')
    const html = tasksScreen({
      phase: null, gates: [], env: 'staging',
      rows: [{
        code: 'M-99', title: 'مهمّة', ifLeft: 'يقف', unblocks: 'gate',
        state: false, measured: '', done: () => false,
      } as never],
    })
    expect(html).toContain('<tr class="urgent">')
  })

  it('ورمزٌ بين علامتَي اقتباسٍ خلفيّتين في المهمّة يُرسَم رمزًا لا علاماتٍ يراها المالك (D-202)', () => {
    const html = tasksScreen({
      phase: null, gates: [], env: 'staging',
      rows: [{
        code: 'M-99', title: 'مهمّة', ifLeft: 'يُسجَّل `price_unverified` بصفر', unblocks: 'gate',
        state: false, measured: '', done: () => false,
      } as never],
    })
    expect(html).toContain('<bdi class="mono" dir="ltr">price_unverified</bdi>')
    expect(html).not.toContain('`')
  })

  it('والفرقُ عن أمس حبرٌ لا حالة — إنفاقٌ نزل ليس تحذيرا', () => {
    for (const s of ['.delta.up', '.delta.down']) expect(css.rule(s).color, s).toBe('var(--ink-2)')
    // ‏ولا في سياقٍ آخر ولا في محدّدٍ أخصّ: «.x .delta.down» تحذيرٌ كذلك
    expect(found((d) => d.prop === 'color' && d.value === 'var(--warn)' &&
      d.selectors.some((s) => /\.delta\.down\b/.test(s)))).toEqual([])
  })

  /**
   * **وأربعٌ في خمسة أعمدةٍ تترك عمودا أبيض** (لاحقةُ D-123). كانت قاعدةُ
   * D-102 تفتح خمسةً لكلّ «c4» فوق ‏١٩٢٠، **وبعد D-119 العددُ يقرّر الصنف**.
   */
  it('ولا عمودَ خامسَ يُفرَض على شبكةٍ من أربع', () => {
    // ‏في أيّ سياق، لا عند ‏١٩٢٠ وحدَه: شبكةُ الأربع لا تُعطى خمسةَ أعمدة
    expect(found((d) => d.prop === 'grid-template-columns' && /repeat\(5/.test(d.value) &&
      d.selectors.some((s) => /\.c4\b/.test(s)))).toEqual([])
    expect(css.rule('.c5')['grid-template-columns']).toBe('repeat(5,1fr)')
  })

  it('واسمُ المزوّد يأخذ سطرَه حين تضيق قائمتُه، والعلامةُ في الشريط حيث لا رافدة', () => {
    // ‏بعرض القائمة لا بعرض الشاشة (مراجعة D-187): «sm» تركت الاسمَ ‏0px عند ‏600 و‏900
    const narrow = `@container plist ${narrower('prow')}`
    expect(css.rule('.plist').container).toBe('plist/inline-size')
    expect(css.rule('.prow .pn', narrow).flex).toBe('1 1 100%')
    expect(css.rule('.prow>summary', narrow)['flex-wrap']).toBe('wrap')
    expect(css.rule('.prow .pm', narrow).display).toBe('none')
    // ‏وقواعدُ اللفّ كلُّها في الحاوية وحدَها، وبعد قواعد الصفّ الأصليّة فلا تُدهَس بتساوي المحدّد
    for (const s of ['.prow .pn', '.prow>summary', '.prow .pm', '.prow .pst', '.prow .pv']) {
      expect(css.where(s), s).toEqual(['', narrow])
      const order = css.rules().map((r) => `${r.at}|${r.selectors.join(',')}`)
      expect(order.indexOf(`${narrow}|${s}`), s).toBeGreaterThan(order.indexOf(`|${s}`))
    }
    expect(css.rule('.topbar .glyph.tb').display).toBe('none')
    // ‏والعلامةُ في الشريط حيث لا رافدة: ما دون «md» كلُّه (D-187)
    expect(css.rule('.topbar .glyph.tb', `@media${below('md')}`).display).toBe('grid')
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
   *
   * **وكلُّ رمزٍ يُعلَن على الجذر وحدَه** — تعميمُ الحالة (D-165): رمزٌ على
   * محدّدٍ غير الجذر يلبسه كلُّ عنصرٍ طابقه وما تحته، زرًّا ليليًّا كان أو
   * رافدةً بثيمٍ ثالث (D-144). **والاستثناءُ الواحد** `[data-density="compact"]`:
   * زرُّ «مضغوط» يحمل السمةَ قيمةً فيلبس ‏`--density:.72` وحدَه — **ولا أثرَ
   * له**، لأنّ ‏`--s-*d` تُحسَب على الجذر وتُورَث محسوبة. فإن صار شيءٌ تحت
   * الجذر يقرأ ‏`var(--density)`، قُيِّد المحدّدُ بـ`:root` كما قُيِّد الليل.
   *
   * **و«الجذر» محدّدٌ مركّبٌ وحدَه**: `:root` وما يقيّده هو من سمةٍ أو
   * `:not()`، ولا رابطَ بعده. كان الشرطُ «يبدأ بـ`:root`»، **فاجتازه
   * `:root [data-theme="dark"]` — عيبُ D-124 نفسُه بمسافةٍ واحدة** — و`:root .rail`
   * ثيمًا ثالثًا للرافدة. والمحدّدُ مطبَّعٌ في `test/css`: الفراغُ حول «>» و«+»
   * و«~» محذوف، فما بقي منه بعد الجذر رابطُ نسب.
   */
  const ROOT = /^:root(?:\[[^\]]*\]|:not\((?:[^()]|\([^()]*\))*\))*$/
  const DENSITY = '[data-density="compact"]'

  /** كلُّ محدّدٍ يعلن رمزًا وليس الجذرَ ولا الكثافة، بسياقه. */
  const offRoot = (c: Sheet): string[] => c.rules()
    .filter((r) => Object.keys(r.decls).some((p) => p.startsWith('--')))
    .flatMap((r) => r.selectors.filter((s) => s !== DENSITY && !ROOT.test(s)).map((s) => `${r.at} ${s}`.trim()))

  it('المحدّدُ مقيّدٌ بالجذر فلا يلبسه زرٌّ يحمل السمةَ قيمةً', () => {
    expect(css.where(':root[data-theme="dark"]')).toContain('')
    expect(css.where('[data-theme="dark"]')).toEqual([])
    expect(offRoot(css), 'رمزٌ على غير الجذر يلبسه كلُّ ما طابقه').toEqual([])
    expect(css.where(DENSITY), 'الكثافةُ مستثناةٌ ما بقيت قاعدتُها وحدَها في المستوى الأعلى').toEqual([''])
  })

  /**
   * **والثابتُ يُمسك ما تحت الجذر لا ما يبدأ به** — كلُّ صفٍّ هنا اجتاز
   * الشرطَ القديم أخضرَ. يُلحَق آخرَ الورقة فلا مرساةَ تنكسر، والجذرُ في طرق
   * الليل الثلاث (الزرُّ والنظامُ والطباعة) مقبولٌ بالسؤال الذي فوق.
   */
  it.each([
    ['الزرُّ الليليُّ تحت الجذر بمسافةٍ واحدة', ':root [data-theme="dark"]{--ink:#ebe9e3; --bg:#12141a}',
      [':root [data-theme="dark"]']],
    ['الرافدةُ بثيمٍ ثالثٍ تحت الجذر', ':root .rail{--bg:#14161c; --ink:#ebe9e3}', [':root .rail']],
    ['تحت الجذر الليليّ في تفضيل النظام', '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .card{--surface:#000}}',
      ['@media(prefers-color-scheme:dark) :root:not([data-theme="light"]) .card']],
    ['ابنُ الجذر المباشر، والفراغُ حول الرابط لا يخفيه', ':root > body{--ink:#191b1f}', [':root>body']],
  ])('ويُمسك %s', (_name, tail, caught) => {
    // ‏ما زاده الذيلُ وحدَه: عيبٌ في الورقة نفسِها يُسقط السؤالَ الذي فوق لا هذه الصفوف
    expect(offRoot(sheet(STYLE + '\n' + tail)).slice(offRoot(css).length)).toEqual(caught)
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
    // ‏والفعلُ بالعربيّة وحدَه، ومفتاحُه في العنوان لمن سأل لا سطرًا تحته (D-202)
    expect(audit('x')).not.toContain('<div class="mono">provider.key</div>')
    expect(audit('x')).toContain('title="provider.key"')
  })

  /**
   * **والليليُّ في المدقّق البصريّ أمسك علّةَ إنتاجٍ في أوّل تشغيل**:
   * رابطُ الوثيقة بلون `--brand-deep` — وهو في الليل أرضُ ضغطٍ لا حبرٌ —
   * ‏٣٫٠٩:١ على أرض الليل. **فالحبرُ من `--brand` المقيس في الثيمات الثلاثة**،
   * و`--brand-deep` لا يُكتب حبرا في موضع.
   */
  it('ولا `--brand-deep` حبرا — هو أرضُ ضغطٍ في الليل لا حبرٌ', () => {
    // ولا يُتَّهم `border-color` — الحدُّ ليس حبرا
    expect(found((d) => d.prop === 'color' && d.value.includes('var(--brand-deep)'))).toEqual([])
    expect(css.rule('.doc a').color).toBe('var(--link)')
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
    const DAY = { '--ink': THEME.light['--ink'], '--bg': '#ffffff', 'color-scheme': 'light' }
    for (const s of [':root', ':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
      expect(css.rule(s, '@media print'), s).toMatchObject(DAY)
    }
    // **والسريانُ بالترتيب**: الطباعةُ من الليليّ تغلب الليلَ في طريقيه —
    // كتلةُ الطباعة لو سبقت الليلَ لبقي حبرُه على الورق
    expect(css.rule(':root[data-theme="dark"]', ['', '@media print'])).toMatchObject(DAY)
    expect(css.rule(':root:not([data-theme="light"])', ['@media(prefers-color-scheme:dark)', '@media print'])).toMatchObject(DAY)
  })
})

/**
 * **الرحلةُ بلوحة المفاتيح أمسكت ثلاثةً في أوّل مشي** (D-125): حلقةُ تركيزٍ
 * على محرّر المسوّدة تُكتب لونا في مكان ظلٍّ فتُحسَب `none`، وزرُّ «حدّث»
 * يُعطَّل لحظةَ يُركَّز على القائمة فيقفز عنه `Tab`، ورابطُ العودة ‏٤٠px عرضا.
 */
describe('ما مشاه Tab (D-125)', () => {
  it('حلقةُ محرّر المسوّدة ظلٌّ مقيسٌ لا لونٌ في مكان ظلّ', () => {
    expect(css.rule('.draft-text:focus')).toMatchObject({
      outline: 'none', 'border-color': 'var(--focus)', 'box-shadow': '0 0 0 var(--ring-w) var(--ring)',
    })
    expect(found((d) => d.prop === 'box-shadow' && d.value === 'var(--ring)')).toEqual([])
  })

  it('و«حدّث» لا يُعطَّل وهي تُجلَب — busy يحرس التكرار', () => {
    expect(SCRIPT).toContain("btn.setAttribute('aria-busy','true')")
    expect(SCRIPT).not.toContain('btn.disabled=true')
  })

  it('ورابطُ العودة هدفُ لمسٍ عرضا كما هو ارتفاعا', () => {
    expect(css.rule('nav.back a')['min-width']).toBe('var(--tap)')
  })
})

/**
 * المرحلةُ الثالثة — الإمكاناتُ الرخيصة (D-126): **لا استعلامَ مدفوعًا،
 * وكلُّ رابطٍ يُبنى من معرِّفٍ لا من نصّ.**
 */
describe('من المحطّة إلى موضعها (D-126)', () => {
  it('كلُّ نوعٍ يقود إلى حيث يُفعَل به شيء', () => {
    expect(stationHref('source', 'x')).toEqual({ href: '/panel/library#sources', label: 'المكتبة' })
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
    // ‏والسهمُ مرسومٌ يشير إلى نهاية السطر، لا حرفٌ من خطّ النظام (D-167)
    expect(html).toContain(`<a class="btn btn-secondary btn-sm stop-go" href="/panel/library#sources">المكتبة${ICON.go}</a>`)
    expect(html).toContain(`<a class="btn btn-secondary btn-sm stop-go" href="/panel/channels/x">شاشةُ X${ICON.go}</a>`)
    expect(html).not.toContain('\u2190')
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

describe('حالُ المنصّة من موعد ربطها (D-126 · D-205)', () => {
  const now = new Date('2026-09-12T12:00:00Z')
  const at = (expiresAt: string | null) => channelHealth(viewChannels([{
    id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
    createdAt: '2026-09-01 00:00:00', expiresAt,
  }], () => true).find((v) => v.spec.id === 'linkedin')!, now)
  it('أسبوعٌ فأقلُّ «تحتاج إعادةَ ربط» بعدده، وما انتهى «منقطعة»، وما فوقُ «متّصلة»', () => {
    expect(at(null)).toMatchObject({ kind: 'broken', label: 'منقطعة' })
    expect(at('2026-09-10 00:00:00')).toMatchObject({ kind: 'broken', tone: 'bad' })
    expect(at('2026-09-12 20:00:00').label).toBe('تحتاج إعادةَ ربطٍ اليوم')
    expect(at('2026-09-14 12:00:00').label).toBe('تحتاج إعادةَ ربطٍ خلال يومين')
    expect(at('2026-09-17 12:00:00').label).toBe('تحتاج إعادةَ ربطٍ خلال 5 أيّام')
    expect(at('2026-09-19 12:00:00')).toMatchObject({ kind: 'expiring', tone: 'warn' })
    expect(at('2026-09-21 12:00:00')).toMatchObject({ kind: 'connected', label: 'متّصلة' })
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
      mediaReady: READY,
  })

  it('تبويبُ المنصّات من المسوّدات نفسِها، بالاسم وبالعدد، والافتراضُ الكلّ', () => {
    expect(html).toContain('data-platform-tab="all" aria-pressed="true">كلُّ المنصّات<span class="count">2</span>')
    expect(html).toContain('data-platform-tab="linkedin" aria-pressed="false"\n      >LinkedIn<span class="count">1</span>')
    expect(html).toContain('data-platform-tab="x"')
    expect(html).not.toContain('data-platform-tab="tiktok"')
  })

  it('والترتيبُ قائمةٌ افتراضُها الأهمّ أوّلًا (D-215)، والبطاقةُ تحمل مفاتيحَه', () => {
    expect(html).toContain('<select id="draft-order"')
    expect(html).toContain('<option value="urgent" selected>')
    expect(html).toContain('<option value="new">')
    expect(html).toMatch(/data-rank="\d"/)
    expect(html).toContain(`data-created="${Date.parse('2026-09-06T09:00:00Z')}" data-cost="0.05"`)
  })

  it('والشريحةُ مخفيّةٌ بلا JavaScript — والقائمةُ كاملة', () => {
    expect(html).toContain('id="draft-platform" aria-label="فرزُ المسوّدات بالمنصّة" hidden')
    expect(SCRIPT).toContain("platform=b.dataset.platformTab")
    expect(SCRIPT).toContain("order=orderSel.value; reorder();")
  })
})

describe('حقلُ الأمر على اللمس (D-127)', () => {
  /*
   * ‏كان يُذكَر باسمه في طبقة اللمس ليكبر إلى ‏١٧٫٥. **وصار كلُّ حقلٍ ‏١٦ في كلّ عرض**
   * ‏(D-185 · نمطُ «input»)، وهي ما يكفي iOS — فلا قاعدةَ للّمس تُنسى في حقلٍ جديد.
   */
  it('textarea.mono وحقلُ الأمر بنمط «input» في كلّ عرض — ولا قاعدةَ لمسٍ لهما', () => {
    for (const s of ['textarea.mono', '.cmd-text']) {
      expect(css.rule(s)['font-size'], s).toBe('var(--t-input)')
      expect(css.rule(s, '@media(pointer:coarse)')['font-size'], s).toBeUndefined()
    }
    expect(css.rule(':root')['--t-input']).toBe('16px')
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
      mediaReady: READY,
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
        status: 'ready', note, headline, model: 'gemini', width: null, height: null,
      }],
      targets: [], earliest: '2026-09-06T09:15',
      writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true, pageOnly: [], peaks: {},
      mediaReady: READY,
    })
  const NO_KEY = 'لا مفتاحَ متصفّحٍ مضبوط — اضبط CF_BROWSER_TOKEN و CF_AI_ACCOUNT_ID في أسرار Worker'
  const OFF = 'تركيبُ النصّ مُطفأٌ من الإعدادات'

  it('رُكّب: «على الصورة» والعنوانُ، و alt يحمله', () => {
    const html = card('', 'أثرٌ يُقاس')
    expect(html).toContain(statusBadge('ok', '●', 'على الصورة'))
    expect(html).toContain('«أثرٌ يُقاس»')
    expect(html).toContain('alt="صورةٌ مولَّدة وعليها: أثرٌ يُقاس"')
    expect(html).not.toContain('بلا نصٍّ فوقها')
  })

  it('سقط: «بلا نصٍّ فوقها» تحذيرًا، والسببُ مؤرَّخًا، والعنوانُ المقترح', () => {
    const html = card(NO_KEY, 'أثرٌ يُقاس')
    expect(html).toContain(statusBadge('warn', '!', 'بلا نصٍّ فوقها'))
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
      expect(html).toContain(statusBadge('idle', '○', 'بلا نصٍّ فوقها'))
      expect(html).not.toContain(statusBadge('warn', '!', 'بلا نصٍّ فوقها'))
    }
  })

  /**
   * **وأطولُ سببٍ يُحفَظ يبقى يُقرأ كما قيل**: خطأُ شبكةٍ طويلٌ قبل السبب
   * كان يُقصّ مع ذيله عند ‏300، فيسقط «مُطفأ» وتصير الرقاقةُ صفراء، أو يسقط
   * المفتاحُ الذي يُصلحه المالك. والسببُ هنا كما تكتبه المهمّةُ حرفًا.
   */
  it('وسقوطُ موجزٍ طويل قبل السبب: التصنيفُ والسببُ الثاني كما هما', () => {
    const noise = `تعذّر الموجزُ البصريّ: anthropic: 400 ${'{"type":"error"} '.repeat(30)}`
    const off = noteOf({ brief: null, detail: noise }, { reason: OFF })
    const quiet = card(off, 'أثرٌ يُقاس')
    expect(quiet).toContain(statusBadge('idle', '○', 'بلا نصٍّ فوقها'))
    expect(quiet).not.toContain(statusBadge('warn', '!', 'بلا نصٍّ فوقها'))
    expect(quiet).toContain(`؛ ${OFF}`)

    const missing = noteOf({ brief: null, detail: noise }, { reason: NO_KEY })
    const loud = card(missing, 'أثرٌ يُقاس')
    expect(loud).toContain(statusBadge('warn', '!', 'بلا نصٍّ فوقها'))
    expect(loud).toContain(`؛ ${NO_KEY}`)
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
  it('السقفُ المبلوغ أحمرُ full، والاكتمالُ done — وكلاهما بنصّ', () => {
    const capped = bar(10, 10)
    expect(capped).toContain('<i class="full"')
    expect(capped).toContain('بلغ السقف')
    expect(capped).not.toContain('done')

    const done = bar(2, 2, 'كلّها محلَّلة')
    expect(done).toContain('<i class="done"')
    expect(done).toContain('class="cap done"')
    expect(done).not.toContain('class="f"')
    expect(css.rule('.bar i.done').background).toBe('var(--ok)')
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
    expect(html).toContain('<h1>النتائج</h1>')
    // ‏والجدولُ تبويبُ «تحليلٌ مفصّل» في «النتائج»، ومرساتُه القديمةُ قسمُه (D-204)
    expect(html).toContain('<a class="tab-item" href="#pivot" aria-current="page"><span>تحليلٌ مفصّل</span></a>')
    expect(html).toContain('<div data-sub id="pivot">')
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
    const card = html.indexOf('<div class="card guide')
    const steps = html.indexOf('<ol class="steps">', card)
    const aside = html.indexOf('<div class="guide-aside">', steps)
    const outcome = html.indexOf('<div class="outcome">', aside)
    expect(card).toBeGreaterThan(0)
    expect(steps).toBeGreaterThan(card)
    expect(aside).toBeGreaterThan(steps)
    expect(outcome).toBeGreaterThan(aside)
    expect(css.rule('.card.guide:not(.card-inset)', `@media${atLeast('md')}`).display).toBe('grid')
  })
})

/** الطبعةُ الثانية (D-139): كلُّ قيمةٍ من السلّم، والكتلةُ آخرَ الورقة. */
describe('الطبعةُ الثانية (D-139)', () => {
  it('الرتبةُ الكبرى سقطت مع السلّم القديم (D-185)، والرافدةُ بلا تدرّج', () => {
    // ‏عنوانُ الصفحة ‏٢٨ والرقمُ البطل ‏٤٠ من رمزيهما في كلّ عرض، ولا قاعدةَ للعريض
    expect(css.rule(':root')['--t-4xl']).toBeUndefined()
    expect(css.rule('.page-head h1', '@media(min-width:1181px)')['font-size']).toBeUndefined()
    expect(css.rule('.page-head h1')).toMatchObject({ 'font-size': 'var(--t-h1)', 'line-height': 'var(--lh-h1)', 'font-weight': '600' })
    expect(css.rule('.grid>.tile:first-child .kv-v')).toMatchObject({ 'font-size': 'var(--t-display)', 'line-height': 'var(--lh-display)' })
    // والرافدةُ سطحٌ من الثيم بلا تدرّجٍ منذ D-144، وقاعدتُها واحدةٌ منذ D-148، وعلى أرض الصفحة منذ D-187
    expect(css.rule('.rail')).toMatchObject({ background: 'var(--bg)', 'border-inline-start': 'var(--bd)' })
    expect(css.rule('.rail')['background-image']).toBeUndefined()
    expect(found((d) => d.value.includes('linear-gradient(') && d.selectors.some((x) => x.startsWith('.rail')))).toEqual([])
  })
})

/**
 * الطبعةُ الثالثة — المؤسّسيّة (D-143): وجهُ عرضٍ كوفيٌّ للعناوين، وشريطُ
 * المؤشّرات سطحٌ واحدٌ بفواصلَ من خيط، والرقمُ رقيقٌ، وأفعالُ القوائم هادئةٌ
 * بهدفِ لمسٍ باقٍ. والكتلةُ آخرَ الورقة فتغلب.
 */
describe('الطبعةُ الثالثة (D-143)', () => {
  /*
   * ‏كان وجهُ العرض الكوفيُّ للعناوين (D-143). **وخرج في المرحلة ١ من D-183** (D-185):
   * ‏زوجُ Plex للنصّ كلِّه، والكوفيُّ في «صدى» وحدها مسارًا. فلا رمزَ للوجه ولا قاعدةَ
   * ‏تطلبه، ولا وجهَ ثالث، والخطُّ على الجذر بلا اصطناع ثخانة.
   */
  it('وجهُ العرض سقط: زوجُ Plex على الجذر، ولا قاعدةَ تطلب خطًّا آخر', () => {
    expect(css.rule(':root')['--font-display']).toBeUndefined()
    expect(css.rule(':root')['--font-ui']).toMatch(/^"Plex Arabic","Plex Sans",/)
    expect(css.rule('html')).toMatchObject({ 'font-family': 'var(--font-ui)', 'font-synthesis': 'none' })
    expect(found((d) => d.prop === 'font-family' && !['inherit', 'var(--font-ui)'].includes(d.value))).toEqual([])
    expect(FACES.map((f) => f.path)).toEqual(FACES.map((f) => f.path.replace(/\s/g, '')))
    expect(FACES.every((f) => f.family === 'Plex Arabic' || f.family === 'Plex Sans')).toBe(true)
  })
  it('شريطُ المؤشّرات سطحٌ واحد، والرقمُ رقيق، والفعلُ الهادئ يبقى هدفَ لمس', () => {
    expect(css.rule('.grid.tiles')).toMatchObject({ gap: '1px', background: 'var(--line)' })
    expect(css.rule('.grid.tiles>.tile')).toMatchObject({ border: '0', 'border-radius': '0', 'box-shadow': 'none' })
    expect(css.rule('.tile .kv-v')).toMatchObject({ 'font-size': 'var(--t-h1)', 'font-weight': '400' })
    for (const s of ['.todo>li>a.btn', '.todo>li>form .btn']) {
      expect(css.rule(s), s).toMatchObject({ background: 'transparent', 'min-width': 'var(--tap)' })
    }
  })
})

/**
 * الطبعةُ الرابعة — الحبرُ والنحاس (D-144): الحبرُ هو اللونُ الأوّل، والنحاسُ
 * خيطٌ، والرافدةُ من الثيم لا ثيمٌ ثالث، والعلامةُ ثابتةٌ في الثيمين.
 */
describe('الطبعةُ الرابعة — الحبرُ والنحاس (D-144)', () => {
  it('الحبرُ لونُ البنية نهارًا وليلًا، والنحاسُ يجتاز نصّا', () => {
    // ‏والزرُّ «الأخضرُ العميق» من لوحة الهويّة نهارًا، والذهبُ برونزٌ على هيولاه (D-196)
    expect(css.rule(':root')).toMatchObject({ '--brand': '#0b2f31', '--on-brand': '#faf6f0', '--au': '#7b5e20' })
    // ‏والليلُ بطريقيه: الزرُّ الصريح، وتفضيلُ النظام حين لا يُختار النهار — رملٌ بحبرٍ عميق
    const NIGHT = { '--brand': '#e8e1d6', '--on-brand': '#0b2f31' }
    expect(css.rule(':root[data-theme="dark"]')).toMatchObject(NIGHT)
    expect(css.rule(':root:not([data-theme="light"])', '@media(prefers-color-scheme:dark)')).toMatchObject(NIGHT)
    // ‏الزمرّدُ المتقاعد لا يعود في قيمة — والتعليقُ الذي يؤرّخه لا يُسقط شيئًا
    expect(found((d) => /#12623e|#82c69e/i.test(d.value))).toEqual([])
  })
  it('الرافدةُ ترث الثيم، والعلامةُ حبرٌ ونحاسٌ ثابتان', () => {
    // ‏لا ثيمَ ثالثًا للرافدة: لا رمزَ يُعاد عليها في أيّ سياق
    expect(css.where('.rail')).toContain('')
    for (const at of css.where('.rail')) {
      expect(Object.keys(css.rule('.rail', at)).filter((p) => p.startsWith('--')), at).toEqual([])
    }
    expect(css.where('.rail::after')).toEqual([])
    // ‏والعلامةُ قيمةٌ واحدةٌ في كلّ ثيمٍ وفي الطباعة: **نعناعٌ على عمق** كأيقونة التطبيق في اللوحة
    // ‏(D-196، وكانت حبرًا ونحاسًا). **ولا تساوي رمزًا آخر**: الذهبُ يُعَدّ بقيمتها، فرابطٌ أو حالٌ
    // ‏بلونها يصير موضعَ ذهب — وذهبان لا ثلاثة، فليست ذهبًا أصلًا. والبُعدُ ΔE_OK في validate_contrast
    expect(css.rule(':root')).toMatchObject({ '--mark-bg': MARK['--mark-bg'], '--mark-fg': MARK['--mark-fg'] })
    expect(MARK).toEqual({ '--mark-bg': '#0b2f31', '--mark-fg': '#4cd1b6' })
    for (const [prop, value] of Object.entries(MARK)) {
      expect(new Set(css.decls().filter((d) => d.prop === prop).map((d) => d.value)), prop).toEqual(new Set([value]))
    }
    for (const mode of ['light', 'dark'] as const) {
      for (const k of ['--link', '--ok', '--au', '--brand', '--selected', '--selection'] as const) {
        expect(THEME[mode][k], `${mode} ${k}`).not.toBe(MARK['--mark-fg'])
      }
    }
    // ‏**ولا رمزَ في الورقة كلِّها بقيمته أو بإحالةٍ إليه** (مراجعة D-196): كان الفحصُ على مفاتيح «THEME» وحدها،
    // ‏فمرّ «--moment-accent» في «:root» بقيمة الشريط حرفًا — ونصٌّ بلونه على أبيض ‏١٫٨٩:١ لم يُسقط شيئًا
    expect(found((d) => d.prop.startsWith('--') && d.prop !== '--mark-fg' &&
      (d.value.toLowerCase() === MARK['--mark-fg'] || /^var\(\s*--mark-fg\s*\)$/.test(d.value)))).toEqual([])
    expect(css.rule('.glyph')).toMatchObject({ background: 'var(--mark-bg)', color: 'var(--mark-fg)' })
    expect(css.rule('nav.tabs a[aria-current=page]::before')).toMatchObject({ width: 'var(--stroke)', background: 'var(--au)' })
  })
  it('الأزرارُ الأوّليّةُ مصمتة، والبطاقاتُ بحدٍّ وظلٍّ خفيف، والتنبيهاتُ سطحٌ بخيط', () => {
    expect(css.rule('.btn-primary')).toMatchObject({ background: 'var(--brand)', color: 'var(--on-brand)' })
    // ‏مراجعةُ D-144 «بطاقةٌ مسطّحة» (D-187): الحدُّ أوضح والظلُّ الأوّل يسنده
    expect(css.rule('.card')).toMatchObject({
      background: 'var(--surface)', border: 'var(--bd)', 'box-shadow': 'var(--sh-1)', padding: 'var(--pad-card)',
    })
    // ‏والإشعارُ صيغةُ «card-alert» (D-189): حافّةٌ ‏٤px بلون الحال، والسطحُ والحدُّ والظلُّ الأوّل
    expect(css.rule('.toast-note')).toMatchObject({ background: 'var(--surface)', 'border-inline-start': 'var(--s-1) solid var(--line)' })
    expect(css.rule('.toast-note.ok')['border-inline-start-color']).toBe('var(--ok)')
    expect(css.rule('.card-alert')['border-inline-start']).toBe('var(--s-1) solid var(--ok)')
  })
  it('رمزُ التبويب ولونُ المتصفّح من الطبعة نفسِها', () => {
    // ‏أيقونةُ التطبيق في اللوحة: مربّعٌ «أخضرُ عميق» مصمتٌ وشريطٌ نعناعيّ — لونا العلامة نفسُهما (D-196)
    expect(ICON_BYTES).toContain(`fill="${MARK['--mark-bg']}"`)
    expect(ICON_BYTES).toContain(`stroke="${MARK['--mark-fg']}"`)
    expect(ICON_BYTES).not.toMatch(/linearGradient|c9a962|14161c|82c69e/)
    const html = shell('ت', '<p>x</p>', 'n1')
    // ‏وسمان بشرط الوضع من أرض الصفحة، لا حبرُ الهويّة في الوضعين (D-183)
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME.light['--bg']}"`)
    expect(html).toContain(`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME.dark['--bg']}"`)
    expect(html).not.toContain('content="#1f2430"')
  })
})

/**
 * تصفيةُ الطبعات (D-148): محدّدٌ واحدٌ في المستوى الأعلى يُعلَن مرّةً. الحارسُ
 * في `audit_classes`، وهنا يُثبَّت أنّ الطبقاتِ التي كانت تُعاد صارت قاعدةً
 * واحدةً تحمل آخرَ قيمة.
 */
describe('تصفيةُ الطبعات (D-148)', () => {
  it('البطاقةُ والرافدةُ والمؤشّرُ الأوّل كلٌّ بقاعدةٍ واحدة تحمل آخرَ قيمة', () => {
    // ‏تعريفُ audit_classes نفسُه: القاعدةُ في المستوى الأعلى محدّدُها كاملًا هذا
    const count = (sel: string): number => css.rules().filter((r) => r.at === '' && r.selectors.join(',') === sel).length
    for (const sel of ['.card', '.rail', '.btn-primary', '.toast-note', '.tile .kv-v', '.grid>.tile:first-child .kv-v', '.rail-head', 'nav.tabs a[aria-current=page]']) {
      expect(count(sel), sel).toBe(1)
    }
    expect(css.rule('.grid>.tile:first-child .kv-v')).toMatchObject({
      'font-size': 'var(--t-display)', color: 'var(--au)', 'font-weight': '400',
    })
    // ‏والتضييقُ بنسبةٍ على الرقم البطل وحدَه (‏-.01em، خطّة التصميم 4.3)، لا ببكسلٍ لكلّ رتبة
    expect(css.rule('.tile .kv-v')).toMatchObject({ direction: 'ltr', 'letter-spacing': '0' })
    expect(css.rule('.grid>.tile:first-child .kv-v')['letter-spacing']).toBe('-.01em')
    expect(css.rule('.rail-head').padding).toBe('var(--s-6) var(--s-5) var(--s-5)')
    expect(css.rule('nav.tabs a[aria-current=page]')).toMatchObject({
      background: 'var(--selected)', color: 'var(--ink)', position: 'relative',
    })
    expect(found((d) => d.value.includes('radial-gradient(') && d.value.includes('var(--au)'))).toEqual([])
  })
})

/**
 * ما وراء المقاييس (D-149): ستّةَ عشرَ إصلاحًا ثبت كلٌّ منها بثلاثة خصوم.
 * تُثبَّت هنا الأسطرُ التي تحمل الإصلاحَ، والسلوكُ الذي يُقاس في المتصفّح
 * يُقاس بـ audit_design وscripts/snapshot_styles.
 */
describe('ما وراء المقاييس (D-149)', () => {
  it('الاتّجاه: هامشٌ منطقيٌّ واحد، وخيطُ القسم من البداية، وشريطُ المختار في النهاية، وسهمُ العودة إلى البداية', () => {
    expect(css.rule('.slice .stats')).toMatchObject({ margin: '0', 'margin-inline-start': 'auto', padding: '0', 'border-top': '0' })
    expect(precedes('.slice .stats', 'margin', 'margin-inline-start')).toBe(true)
    // ‏وخيطُ القسم النحاسيُّ سقط مع ميزانيّة النحاس (D-187): لا قاعدةَ له في أيّ سياق
    expect(css.where('.sec::after')).toEqual([])
    expect(css.rule('.cmdk-o[aria-selected="true"]')).toMatchObject({
      background: 'var(--surface-2)', 'box-shadow': 'inset calc(-1 * var(--ring-w)) 0 0 var(--brand)',
    })
    expect(css.where('.cmdk-g')).toContain('')
    for (const at of css.where('.cmdk-g')) expect(css.rule('.cmdk-g', at)['letter-spacing'], at).toBeUndefined()
    // ‏وسهمُ العودة مرسومٌ يشير إلى البداية — اليمين هنا — لا حرفٌ من خطّ النظام (D-167)
    expect(backNav('/panel#channels', 'القنوات')).toContain(`${ICON.back}القنوات</a>`)
    expect(ICON.back).toContain('m13 6 6 6-6 6')
    expect(backNav('/panel#channels', 'القنوات')).not.toMatch(/[\u2190\u2192]/)
  })
  it('الوصول: حشوُ التمرير تحت الشريط، والرابطُ الهادئ بخيطٍ لا بلونٍ وحدَه، وحقلُ الأوامر يقول «هنا»', () => {
    expect(css.rule('html')['scroll-padding-top']).toBe('calc(var(--topbar) + var(--s-3))')
    // ‏والخطُّ تحت الرابط الهادئ بلونه لا بالنحاس (D-187): لا نحاسَ تحت رابطٍ في أيّ قاعدة
    for (const s of ['.todo>li>a.btn', '.todo>li>form .btn']) {
      expect(css.rule(s), s).toMatchObject({ 'text-decoration': 'underline', color: 'var(--link)' })
      expect(css.rule(s)['text-decoration-color'], s).toBeUndefined()
    }
    expect(found((d) => d.prop.startsWith('text-decoration') && d.value.includes('var(--au)'))).toEqual([])
    expect(css.rule('.pv th a')['text-decoration']).toBe('underline')
    expect(css.rule('.cmdk-in:focus-within')['box-shadow']).toBe('inset 0 calc(-1 * var(--stroke)) 0 var(--focus)')
    expect(css.where('.busy-note')).toContain('')
  })
  it('الرموز: لا زمرّدَ في الوهج بصيغة rgba، والتاريخُ في مفتاح الرسم معزول، والرقمُ المحلّيُّ غربيٌّ في كلّ ICU', () => {
    expect(found((d) => /rgba\(18,98,62|rgba\(130,198,158/i.test(d.value))).toEqual([])
    const chart = readFileSync(new URL('./chart.ts', import.meta.url), 'utf8')
    // ‏والتاريخُ «14 أكتوبر» لا «10-14» (D-202)
    expect(chart).toContain('· ${escapeHtml(dayKeyLabel(peak.day))}')
    expect(chart).not.toContain('.slice(5)')
    const time = readFileSync(new URL('./time.ts', import.meta.url), 'utf8')
    expect(time).toContain("toLocaleString('ar-u-nu-latn'")
  })
})

/** الشاشةُ المستقلّة تحمل العلامة (D-140): بابٌ إلى اللوحة قبل سهم العودة. */
describe('شريطُ العودة (D-140)', () => {
  it('العلامةُ أوّلًا بابًا إلى اللوحة، ثمّ السهم، ولا تنكمش', () => {
    const html = backNav('/panel#channels', 'القنوات')
    const home = html.indexOf('<a class="home" href="/panel"')
    const back = html.indexOf(`${ICON.back}القنوات`)
    expect(home).toBeGreaterThan(0)
    expect(back).toBeGreaterThan(home)
    expect(html).toContain('<span class="glyph glyph-sm">')
    for (const s of ['nav.back .home', 'nav.back .home .glyph']) expect(css.rule(s).flex, s).toBe('none')
    // ‏والعلامةُ الصغيرةُ مربّعٌ من السلّم (‏٣٢)، ورسمُها نسبةٌ منه كالكبيرة (D-189)
    expect(css.rule('.glyph-sm')).toMatchObject({ width: 'var(--s-8)', height: 'var(--s-8)' })
    expect(css.rule('.glyph svg')).toMatchObject({ width: '56%', height: '56%' })
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
    for (const tag of ['<nav class="back"', 'class="rail"', 'class="topbar"', 'class="theme"', 'class="seg"', 'class="rail-head"']) {
      expect(src, `${name} يكتب ${tag} بدل استدعاء مصدره`).not.toContain(tag)
    }
  })
})

describe('D-151 — قالبٌ واحدٌ للشاشة المستقلّة وقاموسٌ واحدٌ للمنصّات', () => {
  it('soloPage يبني التخطّي والعلامةَ والعودةَ والمحتوى ويحمل سكربتَ الثيم', () => {
    const html = soloPage('صدى — تجربة', { href: '/panel#posts', label: 'المنشورات' }, '<p>x</p>', 'n')
    expect(html).toContain('<a class="skip" href="#main">')
    expect(html).toContain('class="home"')
    expect(html).toContain(`${ICON.back}المنشورات`)
    expect(html).toContain('<main id="main"><p>x</p></main>')
    expect(html).toContain('sada-theme')
  })

  /*
   * **والصفحةُ المستقلّةُ جزءٌ من التطبيق** (D-178): رافدةٌ على العريض وشريطٌ في
   * الجوّال، والقسمُ معلَّمٌ في الوسم، والثيمُ مرّةً واحدة.
   */
  it('soloPage برافدته: قسمُه معلَّم، ومساراتُه إلى اللوحة، والمنصّةُ الحاليّةُ تحته، والثيمُ لا يتكرّر', () => {
    const html = soloPage('صدى — LinkedIn', { href: '/panel#channels', label: 'الحسابات' }, '<p>x</p>', 'n', '', undefined,
      soloNav('accounts', 'linkedin'))
    expect(html).toContain('<aside class="rail">')
    expect(html).toContain('<a href="/panel#posts" data-bar>')
    expect(html).toContain('<a href="/panel/tasks">')
    expect(html).toContain('<a href="/panel/accounts" aria-current="true">')
    // ‏ولا قائمةَ منصّاتٍ تحت «الحسابات» (D-205): الرافدةُ سبعة
    expect(html).not.toContain('class="plat"')
    expect((html.match(/id="theme"/g) ?? []).length).toBe(1)

    const tasks = soloPage('صدى — مهامّ', { href: '/panel', label: 'اللوحة' }, '<p>x</p>', 'n', '', undefined, soloNav('tasks'))
    expect(tasks).toContain('<a href="/panel/tasks" aria-current="page">')
    expect(tasks).not.toContain('class="plat"')
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

  it('موعدُ البند بمنطقة المالك حين تُعرف (D-203)، والبندُ مخزَّنٌ بـ UTC', async () => {
    const { planSection } = await import('./sections/plan')
    const input = {
      plan: {
        id: 'w', week: '2026-09-13', model: 'm', status: 'draft' as const, createdAt: '2026-09-12 08:00',
        plan: { rationale: 'ر', items: [
          { sourceId: 's', platform: 'x' as const, angle: 'ز', day: '2026-09-14', time: '09:00', why: 'س' },
        ] },
      },
      names: { s: 'مصدر' }, ready: true, analyzed: 2, now: new Date('2026-09-13T00:00:00Z'),
    }
    expect(planSection({ ...input, zone: 'America/New_York' })).toContain('<div class="mono">2026-09-14 05:00</div>')
    expect(planSection(input)).toContain('<div class="mono">2026-09-14 12:00 بتوقيت الرياض</div>')
  })
})

describe('D-154 — رقاقةُ الحال دالّةٌ ورمزُها مرسوم', () => {
  // ‏و«↓» معها منذ D-185: سهمُ الفرق عن الأمس سهمٌ لا مثلّث («▲» يعني «ساقط» في الحال)
  it.each(['●', '○', '◍', '◔', '▲', '◆', '✓', '✕', '↑', '↓', '!'])('الحرفُ %s يُرسَم بمواصفة icon() بلون النصّ', (g) => {
    const html = statusBadge('ok', g, 'نصّ')
    // ‏شبكةُ ‏٢٤ وثخانةُ ‏١٫٨ بلا تعبئة — مواصفةُ الأيقونات نفسُها (D-103 · D-185)
    expect(html).toContain('<span class="st ok"><span class="st-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"')
    expect(html).not.toContain(g)
    expect(html).toContain('</svg></span>نصّ</span>')
  })

  it('ورموزُ الحال من GLYPH_ICON وحدَها: ثخانةٌ واحدة، ولا تعبئة، ولا «▼» بعدُ', () => {
    for (const [g, svg] of Object.entries(GLYPH_ICON)) {
      expect(glyph(g), g).toBe(svg)
      expect([...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => m[1]), g).toEqual(['1.8'])
      expect(svg, g).not.toMatch(/fill="currentColor"/)
    }
    expect(glyph('▼')).toBe('▼')
  })

  it('حرفٌ بلا رسمٍ يُطبَع مهرَّبًا، والسِّماتُ تُلحَق، والصنفُ الفارغ لا يترك فراغًا', () => {
    expect(statusBadge('warn', '<', 'x', 'title="t"')).toBe('<span class="st warn" title="t"><span class="st-ic">&lt;</span>x</span>')
    expect(statusBadge('', '●', 'x')).toContain('<span class="st"><span class="st-ic"><svg')
  })
})

/**
 * نقاطُ الجاهزيّة تحت زرَّي الصورة والمقطع (D-163) — **ما ستقوله الدالّةُ
 * بعد الضغط يُقال قبله**، وزرٌّ تسقط نقطتُه يُعطَّل وسببُه بجانبه.
 */
describe('نقاطُ الجاهزيّة تحت زرَّي الصورة والمقطع (D-163)', () => {
  const draft = (id: string, state: DraftRow['status'] = 'draft'): DraftRow => ({
    id, platform: 'linkedin', text: 'نصّ', rationale: null, status: state, model: null,
    cost: 0, sourceId: null, sourceName: null, stale: false, approvedBy: null,
    approvedAt: null, createdAt: '2026-09-05 09:00:00', scheduledAt: null,
    accountName: null, dispatchedAt: null, publishCost: 0, originalText: null,
  })
  const picture = (postId: string, mime = 'image/png') => ({
    id: `m-${postId}-${mime.slice(0, 5)}`, postId, mime, bytes: 1000, prompt: '', cost: 0,
    status: 'ready' as const, note: null, headline: null, model: 'gemini', width: null, height: null,
  })
  const section = (
    drafts: DraftRow[],
    over: { media?: ReturnType<typeof picture>[]; mediaReady?: typeof READY } = {},
  ): string =>
    draftsSection({
      drafts, media: over.media ?? [], targets: [], earliest: '2026-09-06T09:15',
      writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true, pageOnly: [], peaks: {},
      mediaReady: over.mediaReady ?? READY,
    })
  const withImage = (slide: ReturnType<typeof slideGate>, over: Partial<Parameters<typeof imageReadiness>[0]> = {}) =>
    ({
      ...READY,
      image: imageReadiness({
        blocker: null, provider: { label: 'Gemini', refusal: null }, slide, briefReady: true, ...over,
      }),
    })
  const ON = slideGate({ overlay: true, hasBrowserKey: true, hasAccount: true })

  it('سطرُ كلِّ زرٍّ بعده داخل «بلا صورة»: الإنفوجرافيك أوّلًا، والفنّيّةُ في طيّتها (D-174)', () => {
    const html = section([draft('d1')])
    // ‏واللوحُ يحمل مرساتَه `i-…` (محطّة «الصورة» في الرئيسيّة)، فيُطلَب بصنفه لا بوسمه كاملًا
    const box = html.slice(html.indexOf('<div class="pic none"'), html.indexOf('<div class="draft-meta">'))
    expect(box).toContain('id="i-d1"')
    const info = box.indexOf('ولّد إنفوجرافيك')
    const art = box.indexOf('ولّد صورةً فنّيّة')
    expect(info).toBeGreaterThan(-1)
    expect(box.indexOf('<p class="hint ready">')).toBeGreaterThan(info)
    expect(box.indexOf('<details class="art">')).toBeGreaterThan(box.indexOf('<p class="hint ready">'))
    expect(box.indexOf('<p class="hint ready">', art)).toBeGreaterThan(art)
    expect(box).toContain(statusBadge('ok', '●', 'المتصفّح', 'title="تامّة — يصوّر الصفحة"'))
    expect(box).toContain(statusBadge('ok', '●', 'الصياغة', 'title="تامّة — نموذجُ الكتابة يستخرج المحتوى"'))
    expect(box).toContain(statusBadge('ok', '●', 'الحدود', 'title="تامّة — مفتوحةٌ اليوم"'))
    expect(box).toContain(statusBadge('ok', '●', 'المزوّد', 'title="تامّة — Gemini"'))
    expect(box).toContain('<b>إنفوجرافيك من نصّ المنشور</b>')
    // ‏والزرّان يرسلان نمطَهما — والدالّةُ تأخذ الإنفوجرافيك حين يغيب
    expect(box).toContain('<input type="hidden" name="style" value="infographic">')
    expect(box).toContain('<input type="hidden" name="style" value="illustration">')
  })

  it('والإنفوجرافيك بلا مفتاح المتصفّح معطَّلٌ وسببُه بجانبه — والفنّيّةُ لا تتبعه', () => {
    const noBrowser = {
      ...READY,
      infographic: infographicReadiness({ blocker: null, browser: { key: false, account: true }, briefReady: true }),
    }
    const html = section([draft('d1')], { mediaReady: noBrowser })
    expect(html).toContain('<button class="btn btn-primary btn-sm" type="submit" disabled>ولّد إنفوجرافيك</button>')
    expect(html).toContain('<span class="ago">بلا مفتاح المتصفّح</span><a class="tap" href="/panel/tasks">ما عليك</a>')
    expect(html).toContain('<button class="btn btn-secondary btn-sm" type="submit">ولّد صورةً فنّيّة</button>')

    // ‏ونموذجُ الكتابة الساقطُ ينتظرك ولا يُعطِّل: المحتوى من النصّ مباشرةً
    const noWriter = {
      ...READY,
      infographic: infographicReadiness({ blocker: null, browser: { key: true, account: true }, briefReady: false }),
    }
    const plain = section([draft('d1')], { mediaReady: noWriter })
    expect(plain).toContain('<button class="btn btn-primary btn-sm" type="submit">ولّد إنفوجرافيك</button>')
    expect(plain).toContain('<span class="ago">المحتوى من النصّ مباشرةً</span>')
  })

  it('وسطرُ المقطع بعد «حرّكها فيديو» — ولا زرَّ ولا سطرَ حين يوجد مقطع', () => {
    const noClip = section([draft('d1')], { media: [picture('d1')] })
    expect(noClip).toContain('حرّكها فيديو')
    expect(noClip.indexOf(statusBadge('ok', '●', 'المفتاح', 'title="تامّة — من أسرار Worker"')))
      .toBeGreaterThan(noClip.indexOf('حرّكها فيديو'))

    const withClip = section([draft('d1')], { media: [picture('d1'), picture('d1', 'video/mp4')] })
    expect(withClip).not.toContain('حرّكها فيديو')
    expect(withClip).not.toContain('class="hint ready"')
    expect(withClip).toContain('ارفض الصورة')
  })

  it('ولا سطرَ لمسوّدةٍ مرفوضةٍ أو منشورة — لا زرَّ فوقه', () => {
    expect(section([draft('d1', 'rejected')])).not.toContain('class="hint ready"')
    expect(section([draft('d1', 'published')], { media: [picture('d1')] })).not.toContain('class="hint ready"')
  })

  it('يُبنى مرّةً: ثلاثُ مسوّداتٍ فيها السطران نفسُهما حرفًا', () => {
    const html = section([draft('a'), draft('b'), draft('c')])
    const lines = [...html.matchAll(/<p class="hint ready">[\s\S]*?<\/p>/g)].map((m) => m[0])
    expect(lines).toHaveLength(6)
    expect(new Set(lines).size).toBe(2)
  })

  it('والنقطةُ الساقطةُ تعطّل الزرَّ وسببُها ورابطُها بجانبه', () => {
    const blocked = {
      infographic: infographicReadiness({ blocker: { kind: 'paused' }, browser: { key: true, account: true }, briefReady: true }),
      image: imageReadiness({
        blocker: { kind: 'paused' }, provider: { label: 'Gemini', refusal: null }, slide: ON, briefReady: true,
      }),
      video: videoReadiness({ face: 'none', blocker: null, clips: videoCapGate(0, 2) }),
    }
    const empty = section([draft('d1')], { mediaReady: blocked })
    expect(empty).toContain('<button class="btn btn-primary btn-sm" type="submit" disabled>ولّد إنفوجرافيك</button>')
    expect(empty).toContain('<button class="btn btn-secondary btn-sm" type="submit" disabled>ولّد صورةً فنّيّة</button>')
    expect(empty).toContain('<span class="ago">موقوفٌ بقرارك</span><a class="tap" href="#settings">افتح الحدود</a>')

    const pictured = section([draft('d1')], { media: [picture('d1')], mediaReady: blocked })
    expect(pictured).toContain('<button class="btn btn-secondary btn-sm" type="submit" disabled>حرّكها فيديو</button>')
    expect(pictured).toContain('<span class="ago">لا مفتاحَ لـ Workers AI</span>')

    // وما ينتظرك لا يعطّل: الصورةُ تخرج بلا عنوان، والزرُّ يعمل
    const waiting = section([draft('d1')], {
      mediaReady: withImage(slideGate({ overlay: true, hasBrowserKey: false, hasAccount: true })),
    })
    expect(waiting).toContain('<button class="btn btn-secondary btn-sm" type="submit">ولّد صورةً فنّيّة</button>')
    expect(waiting).toContain('<span class="ago">بلا مفتاح المتصفّح</span><a class="tap" href="/panel/tasks">ما عليك</a>')
  })

  /*
   * **وسقفُ المقاطع يقوله السطرُ قبل الضغط** (D-168): الوجهُ والحدودُ تامّان،
   * والمقاطعُ بلغت سقفَها — فالزرُّ معطَّلٌ وسببُه ورابطُه إلى الحدود بجانبه.
   */
  it('وسقفُ المقاطع يُعطِّل «حرّكها فيديو» وسببُه بجانبه — وتحته يقول كم بقي', () => {
    const full = { ...READY, video: videoReadiness({ face: 'env', blocker: null, clips: videoCapGate(2, 2) }) }
    const html = section([draft('d1')], { media: [picture('d1')], mediaReady: full })
    expect(html).toContain('<button class="btn btn-secondary btn-sm" type="submit" disabled>حرّكها فيديو</button>')
    expect(html).toContain('<span class="ago">بلغ سقفَ المقاطع اليوميّ</span><a class="tap" href="#settings">افتح الحدود</a>')
    // ‏وسقفُ المقاطع يحجب التحريكَ وحده: زرّا الصورة على مسوّدةٍ أخرى يعملان
    const other = section([draft('d2')], { mediaReady: full })
    expect(other).toContain('<button class="btn btn-primary btn-sm" type="submit">ولّد إنفوجرافيك</button>')
    expect(other).toContain('<button class="btn btn-secondary btn-sm" type="submit">ولّد صورةً فنّيّة</button>')

    const under = section([draft('d1')], { media: [picture('d1')] })
    expect(under).toContain('<button class="btn btn-secondary btn-sm" type="submit">حرّكها فيديو</button>')
    expect(under).toContain(statusBadge('ok', '●', 'المقاطع', 'title="تامّة — بقي 2 من 2 اليوم"'))
  })

  it('واسمُ المزوّد يكتبه المالك — فيُهرَّب في النقطة والسبب', () => {
    const html = section([draft('d1')], {
      mediaReady: withImage(ON, { provider: { label: '<img onerror=x>', refusal: { kind: 'no_key' } } }),
    })
    expect(html).not.toContain('<img onerror')
    expect(html).toContain('<span class="ago">لا مفتاحَ لـ &lt;img onerror=x&gt;</span>')
  })

  it('و«بلا حرف» يتبع الشريحة: مطفأةٌ فبلا حرف، ومركَّبةٌ فعنوان، وناقصةٌ فبعدُ', () => {
    const at = (overlay: boolean, hasBrowserKey: boolean): string =>
      section([draft('d1')], { mediaReady: withImage(slideGate({ overlay, hasBrowserKey, hasAccount: true })) })
    expect(at(false, true)).toContain('مشهدٌ من موجزٍ يترجم النصّ، <b>بلا حرف</b>')
    expect(at(true, true)).toContain('<b>وفوقه عنوانٌ من كلمتين أو ثلاث</b>')
    expect(at(true, true)).not.toContain('بلا حرف')
    expect(at(true, false)).toContain('<b>بلا عنوانٍ فوقه بعد</b>')
  })

  it('وسببُ السطر لا يمتدّ مئتي بكسل: قاعدةُ «بلا صورة» على ابنها المباشر وحده', () => {
    expect(css.rule('.pic.none > .ago').flex).toBe('1 1 12.5rem')
    expect(css.rule('.art-row > .ago').flex).toBe('1 1 12.5rem')
    expect(css.rules().some((r) => r.selectors.includes('.pic.none .ago'))).toBe(false)
    expect(Object.keys(css.rule('.hint.ready')).length).toBeGreaterThan(0)
    // والورقةُ لا تلوّن «a» عامّةً — فرابطُ الإصلاح بلا قاعدته يخرج أزرقَ المتصفّح (رُئي في اللقطة)
    expect(css.rule('.hint.ready a').color).toBe('var(--link)')
  })
})

/**
 * الجوّالُ واللمسُ والرموز (D-167). والورقةُ تُسأل قواعدَ وترتيبًا لا نصًّا:
 * العلّتان الأوليان قاعدتان **صحيحتان في موضعٍ خطأ** — تغلبهما قاعدةٌ لاحقةٌ
 * بتساوي المحدّد — فالاختبارُ يسأل عن الموضع كما يسأل عن القيمة.
 */
describe('D-167 — الجوّالُ واللمسُ والرموز', () => {
  const rules = css.rules()
  const at = (selector: string, ctx = ''): number =>
    rules.findIndex((r) => r.at === ctx && r.selectors.includes(selector.replace(/\s*>\s*/g, '>')))
  const TOUCH = '@media(pointer:coarse)'

  it('طبقةُ اللمس آخرُ الورقة، وحقلُ اللوحة فيها باسمه — فلا يُقرّبه iOS', () => {
    const first = rules.findIndex((r) => r.at === TOUCH)
    expect(first).toBeGreaterThan(0)
    // ‏ما بعد أوّل قاعدةٍ فيها كلُّه منها: قاعدةٌ تُكتب بعدها تغلبها بتساوي المحدّد
    expect(rules.slice(first).filter((r) => r.at !== TOUCH).map((r) => r.selectors.join(','))).toEqual([])
    // ‏وحقلُ اللوحة ‏١٦ في كلّ عرض (D-185): لا يُقرّبه iOS بلا قاعدةٍ في طبقة اللمس
    expect(css.rule('.cmdk-in input')['font-size']).toBe('var(--t-input)')
    expect(found((d) => d.at === TOUCH && d.prop === 'font-size')).toEqual([])
    expect(at('.cmdk-in input', TOUCH)).toBe(-1)
  })

  it('رقمُ المؤشّر يصغر على الجوّال من الرمز لا بقاعدة (D-185)', () => {
    const phone = '@media(max-width:599px)'
    expect(css.rule(':root', phone)).toMatchObject({ '--t-display': '32px', '--t-h1': '24px', '--t-body': '17px' })
    expect(css.rule('.tiles>.tile:first-child .v', `@media${below('md')}`)['font-size']).toBeUndefined()
    expect(css.rule('.tiles .v', `@media${below('md')}`)['font-size']).toBeUndefined()
  })

  it('شريطُ الإبهام من السلّم، ولا حرفَ بالبكسل في الورقة كلّها', () => {
    const bar = `@media${below('md')}`
    // ‏نمطُ «caption» ‏13/20/600، والعدُّ يرثه من قاعدته الأولى (خطّة التصميم 5.3)
    expect(css.rule('nav.tabs > a[data-bar] span:not(.count)', bar)).toMatchObject({
      'font-size': 'var(--t-caption)', 'line-height': 'var(--lh-caption)', 'font-weight': '600',
    })
    expect(css.rule('nav.tabs .count', bar)).toMatchObject({ 'min-width': 'var(--s-5)', padding: '0 var(--s-1)' })
    // ‏والعددُ مكوّنُ «Count» (D-189): قاعدتُه واحدةٌ يرثها العددُ في الرافدة والشريط والتبويب
    expect(css.rule('.count')).toMatchObject({ 'font-size': 'var(--t-caption)', 'line-height': 'var(--lh-caption)', 'font-weight': '600' })
    expect(found((d) => d.prop === 'font-size' && /^\d/.test(d.value))).toEqual([])
    // ‏وحشوُ المحتوى فوق الشريط رتبةٌ لا مجموعُ رتبتين (‏٨٠ خارجَ السلّم)
    expect(css.rule('.content', bar)['padding-bottom']).toBe('calc(var(--s-16) + var(--safe-b))')
    expect(css.rule(':root')['--safe-b']).toBe('env(safe-area-inset-bottom,0px)')
  })

  it('لا حرفَ رمزٍ في «content»: سهمُ الطيّ مثلّثٌ من حدود، والمطويُّ يشير إلى نهاية السطر', () => {
    expect(found((d) => d.prop === 'content' && /[▾▸▲▼←→⌘]|\\2[05]/.test(d.value))).toEqual([])
    for (const s of ['.g-tog::after']) {
      expect(css.rule(s), s).toMatchObject({
        content: "''", 'border-inline': '.3em solid transparent', 'border-block-start': '.4em solid',
      })
    }
    expect(css.rule('.setup>summary::before')).toMatchObject({
      'border-block': '.3em solid transparent', 'border-inline-start': '.4em solid', 'border-inline-end': '0',
    })
    expect(css.rule('.setup[open]>summary::before')).toMatchObject({
      'border-inline': '.3em solid transparent', 'border-block-start': '.4em solid', 'border-block-end': '0',
    })
  })

  it('والسهمُ مرسومٌ بقدر حرفه، والاختصارُ «Ctrl K» نصًّا لا «⌘» (D-185)', () => {
    expect(glyph('↓')).toBe(GLYPH_ICON['↓'])
    // ‏«⌘» ليس في Plex ولا في أيّ وجهٍ مضمَّن، ورسمُه يقول «ماك» لمن لا يملكه (خطّة التصميم 3.4)
    expect(commandTrigger()).toContain('<kbd class="kbd">Ctrl K</kbd>')
    expect(commandTrigger()).not.toContain('⌘')
    expect('command' in ICON).toBe(false)
    // ‏والرمزُ بمقاسٍ من أربعة (خطّة التصميم 3.4 · D-189): ‏٢٠ في الزرّ، و‏١٦ بجوار نصٍّ ‏١٥،
    // ‏و‏١٤ في الرقاقة — وسهمُ المسار وحدَه بقدر حرف السطر («1em»)
    expect(css.rule('.btn>svg')).toMatchObject({ width: 'var(--icon-md)', height: 'var(--icon-md)' })
    expect(css.rule('nav.back a>svg:not(.wordmark)')).toMatchObject({ width: 'var(--icon-sm)', height: 'var(--icon-sm)' })
    expect(css.rule('a.chip>svg')).toMatchObject({ width: 'var(--icon-xs)', height: 'var(--icon-xs)' })
    expect(css.rule('.arw svg')).toMatchObject({ width: '1em', height: '1em' })
    expect(css.where('.cmdk-open svg')).toEqual([])
    expect(css.rule('.cmdk-open>svg')).toMatchObject({ width: 'var(--icon-sm)', height: 'var(--icon-sm)' })
    // ‏وأيقونةُ الحال ‏١٤ داخل الشارة وبجوار السطر الصغير (خطّة التصميم 3.4)
    for (const s of ['.delta .ar svg', '.why-ic svg', '.st-ic svg']) expect(css.rule(s), s).toMatchObject({ width: 'var(--icon-xs)', height: 'var(--icon-xs)' })
    expect(css.rule(':root')).toMatchObject({ '--icon-xs': '14px', '--icon-sm': '16px', '--icon-md': '20px', '--icon-lg': '24px' })
  })

  it('وسهمُ المسار في الأدلّة مرسومٌ عند العرض لا حرفًا (D-185)', () => {
    const html = pathArrows('Credentials ← Create credentials → x')
    expect(html).not.toMatch(/[←→]/)
    expect(html).toContain(`<span class="arw" role="img" aria-label="ثمّ">${ICON.go}</span>`)
    expect(html).toContain(`<span class="arw" role="img" aria-label="ثمّ">${ICON.back}</span>`)
  })

  it('واسمُ الملفّ معزولٌ بلا امتداده، وكاملٌ في العنوان (خطّة التصميم 4.4/8)', () => {
    expect(fileName('تقرير الأثر السنويّ 2026.docx')).toBe('<bdi title="تقرير الأثر السنويّ 2026.docx">تقرير الأثر السنويّ 2026</bdi>')
    expect(fileName('<x>')).toBe('<bdi title="&lt;x&gt;">&lt;x&gt;</bdi>')
  })

  it('والجانبُ منطقيّ: الفاصلُ في نهاية السطر، والطبقةُ بعرض الرابط، والمحاذاةُ بداية', () => {
    expect(css.rule('.chip')).toMatchObject({ margin: 'var(--s-0) 0 0', 'margin-inline-end': 'var(--s-1)' })
    expect(precedes('.chip', 'margin', 'margin-inline-end')).toBe(true)
    // ‏و«.mono» لاتينيّةُ الاتّجاه، فنهايةُ السطر العربيّ بدايتُها هي
    expect(css.rule('.chip.mono')['margin-inline']).toBe('var(--s-1) 0')
    expect(css.rule('.tap::after')['inset-inline']).toBe('0')
    expect(css.rule('th')['text-align']).toBe('start')
    expect(found((d) => /^(margin|padding|border)-(left|right)|^(left|right)$/.test(d.prop) ||
      (['text-align', 'float', 'clear'].includes(d.prop) && /^(left|right)$/.test(d.value)))).toEqual([])
  })
})

/**
 * المرحلة ٠ من خطّة التصميم — الإتقانُ السريع (D-183). كلُّ اختبارٍ هنا علّةٌ
 * قِيست في التشخيص، ويُسأل عنها المصدرُ لا الصورة.
 */
describe('المرحلة ٠ — الإتقانُ السريع (D-183)', () => {
  it('كتلتا الليل نصٌّ واحد من «THEME.dark»، والطباعةُ من «PRINT»', () => {
    const viaButton = Object.entries(css.rule(':root[data-theme="dark"]'))
    const viaSystem = Object.entries(css.rule(':root:not([data-theme="light"])', '@media(prefers-color-scheme:dark)'))
    // ‏الترتيبُ والقيمةُ معًا: نصٌّ واحدٌ بعد تطبيع الفراغ، لا «متقاربان»
    expect(viaSystem).toEqual(viaButton)
    expect(viaButton.map(([k]) => k)).toEqual(Object.keys(THEME.dark))
    expect(Object.keys(THEME.dark)).toEqual(Object.keys(THEME.light))
    for (const s of [':root', ':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
      expect(Object.keys(css.rule(s, '@media print')), s).toEqual(Object.keys(PRINT))
    }
  })

  it('رمزُ الحال باسمه: لا أرضَ له ولا حدّ، ولا يلبس صنفَ الزرّ الشبحيّ', () => {
    const html = statusBadge('warn', '!', 'تنتظرك')
    expect(html).toContain('<span class="st-ic">')
    expect(html).not.toMatch(/class="g"/)
    // ‏ولا قاعدةَ في أيّ سياقٍ تعطي الرمزَ أرضًا أو حدًّا أو لونًا غيرَ لون حبّته
    expect(found((d) => d.selectors.some((x) => /\.st-ic\b/.test(x)) &&
      /^(background|border|color|box-shadow)/.test(d.prop))).toEqual([])
  })

  it('التحذيرُ برتقاليٌّ بعيدٌ عن النحاس، ولا إطارَ مكتوبًا بلونه في الوسم', () => {
    expect([THEME.light['--warn'], THEME.light['--warn-wash']]).toEqual(['#b45309', '#fdf4ec'])
    // ‏**مجمَّدان** (D-196): حبّةُ تحذير الليل على أرضها على الحدّ (Lc ‏٥٠)، وبُعدُه عن الذهب على الحدّ
    // ‏(ΔE_OK ‏٩٫٥)؛ وأرضُ النهار والتحذيرُ عليها على الحدّ (‏4.5:1). من يدفئ الأرضَ أو يُميل التحذيرَ يبدّل هنا
    expect([THEME.dark['--warn'], THEME.dark['--warn-wash']]).toEqual(['#f2823b', '#231206'])
    expect(THEME.light['--bg']).toBe('#f9f4ec')
    const now = new Date('2026-09-27T12:00:00Z')
    const html = channelsSection(viewChannels([{
      id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
      createdAt: '2026-09-01 00:00:00', expiresAt: null,
    }], () => true), now)
    expect(html).toContain('data-health="broken"')
    expect(html).not.toMatch(/style="[^"]*var\(--(warn|ok|bad)\)/)
  })

  it('الزرُّ والحقلُ على اللمس بقياسهما على الحاسوب — والحقلُ ‏١٦ في كلّ عرض (D-185)', () => {
    const TOUCH = '@media(pointer:coarse)'
    for (const s of ['button', '.btn', 'textarea']) expect(css.rule(s, TOUCH)['font-size'], s).toBeUndefined()
    expect(css.rule('textarea')['font-size']).toBe('var(--t-input)')
    expect(css.rule('button')['min-height']).toBe('var(--tap)')
  })

  it('مربّعُ المنصّة والعلامةُ بحلقةٍ ليلًا، ونهارًا كما كانا', () => {
    expect(css.rule('.pf-logo')['box-shadow']).toBe('0 0 0 1px var(--logo-ring)')
    expect(css.rule('.glyph')['box-shadow']).toContain('0 0 0 1px var(--mark-ring)')
    expect([THEME.dark['--logo-ring'], THEME.dark['--mark-ring']]).toEqual(['#4a6362', '#4a6362'])
    expect([THEME.light['--logo-ring'], THEME.light['--mark-ring']]).toEqual(['transparent', 'var(--line)'])
  })

  it('الرابطُ والزرُّ الهادئ بحبر «--link» وخطٍّ تحته', () => {
    expect([THEME.dark['--ink-2'], THEME.dark['--link']]).toEqual(['#cad3d3', '#8ee0d0'])
    for (const s of ['.g-tog', '.setup>summary', '.history .bar-name', '.todo>li>a.btn']) {
      expect(css.rule(s), s).toMatchObject({ color: 'var(--link)', 'text-decoration': 'underline' })
    }
    // ‏ولا حبرَ رابطٍ من «--brand» بعد اليوم: الهويّةُ للفعل الأوّليّ
    for (const s of ['.tap', '.pv th a', '.doc a', '.hint.ready a']) expect(css.rule(s).color, s).toBe('var(--link)')
  })

  it('«قبل …» لا تُسبَق بـ«منذ»: الجملةُ من relativeTime كاملة', () => {
    const now = new Date('2026-09-06T09:00:00Z')
    // ‏حسابان فتُرسم صفوفُهما بموعد ربطهما (D-205: الحسابُ الواحدُ اسمُه في رأس البطاقة)
    const channels = channelsSection(viewChannels(['a1', 'a2'].map((id) => ({
      id, platform: 'linkedin' as const, kind: 'member' as const, displayName: 'عمر', status: 'active' as const,
      createdAt: '2026-09-06 08:36:00', expiresAt: '2026-11-01 00:00:00',
    })), () => true), now)
    const plan = planSection({
      plan: null, names: {}, ready: true, analyzed: 1, now,
      lastAttempt: { at: '2026-09-06 08:36:00', detail: 'failed: انقطع' },
    })
    // ‏والعددُ بمعدوده: كان «1 مصدرا محلَّلا»
    expect(plan).toContain('مصدرٌ واحدٌ محلَّل')
    for (const html of [channels, plan]) {
      expect(html).toMatch(/قبل 24 دقيقة/)
      expect(html).not.toMatch(/منذ\s+(قبل|الآن|أمس)/)
    }
  })
})

describe('لا رمزَ خارج زوج Plex في نصٍّ يُكتب بعد التحميل (D-185)', () => {
  /*
   * `audit_fonts` يقيس الصفحةَ كما تُرسَم، ولا يضغط زرًّا. فما يكتبه سكربتٌ بعد النقر
   * («نُسخ ✓») وما يظهر في دليل ضبطٍ لا تغطّيه العيّنات يُفحَص هنا من مصدره.
   */
  const FORBIDDEN = /[✓✕▲▼◐◍■▾⋯⌘]|[\u{1F300}-\u{1FAFF}]/u
  it('السكربتاتُ وأدلّةُ الضبط', async () => {
    const scripts = await import('./scripts')
    const { SCRIPT } = await import('./panelScript')
    const { SETUP } = await import('../../lib/channels')
    const texts: [string, string][] = [
      ...Object.entries(scripts).filter(([, v]) => typeof v === 'string') as [string, string][],
      ['panelScript', SCRIPT],
      ...Object.entries(SETUP).flatMap(([k, g]) =>
        Object.entries(g).filter(([, v]) => typeof v === 'string').map(([f, v]) => [`${k}.${f}`, v as string] as [string, string])),
    ]
    for (const [name, text] of texts) expect(FORBIDDEN.test(text), name).toBe(false)
  })
})

/*
 * ‏مراجعة الرحلات: **الإشعارُ لا يقع على القرار، والرابطُ لا يُفيض الخطّة.**
 *
 * ‏ر-0: كان الإشعارُ العائمُ في الجوّال عند ‏80px من الأسفل وصفُّ البتّ ملتصقٌ عند ‏64px، فغطّى خطأُ
 * ‏«اعتمد» زرَّي «اعتمد» و«ارفض» حتّى يُغلَق. ر-5: رابطٌ في نصّ صفٍّ دفع المعاينةَ ‏101px جانبًا.
 */
describe('الإشعارُ لا يغطّي البتّ، والرابطُ لا يُفيض الخطّة (مراجعة ر-0 ور-5)', () => {
  it('في الجوّال يطفو الإشعارُ تحت الشريط العلويّ لا حيث يلتصق صفُّ البتّ، وفي العريض في الزاوية', () => {
    const phone = css.rule('.toast')
    expect(phone.top).toBe('calc(var(--topbar) + var(--s-3))')
    expect(phone.bottom).toBeUndefined()
    // ‏و«--topbar» ارتفاعُ الشريط العلويّ نفسُه (‏٦٤)؛ وصفُّ البتّ يلتصق بالأسفل
    expect(css.rule('.topbar')['min-height']).toBe('var(--topbar)')
    expect(css.rule(':root')['--topbar']).toBe('64px')
    const act = css.where('.draft-foot.act')
    expect(act.length).toBeGreaterThan(0)
    for (const at of act) expect(css.rule('.draft-foot.act', at).bottom ?? '', at).toContain('var(--s-16)')
    const wide = css.rule('.toast', ['', `@media${atLeast('md')}`])
    expect(wide.top).toBe('auto')
    expect(wide.bottom).toBe('var(--s-6)')
  })

  it('ونصُّ صفّ الخطّة يُكسَر حيث لزم، وخلايا الجوّال كلُّها', () => {
    expect(css.rule('.pi-text')['overflow-wrap']).toBe('anywhere')
    expect(css.rule('.pi td', `@media${below('sm')}`)['overflow-wrap']).toBe('anywhere')
  })
})

/**
 * المرحلة ٢أ من خطّة التصميم — الرموز (D-187): اللوحةُ المغلقة، والظلالُ الثلاثة،
 * ونصفُ القطر بالدور، ونقاطُ الانكسار الثلاث، والنحاسُ في أدواره الثلاثة. يُسأل
 * المصدرُ هنا، ويُقاس المرسومُ في `audit_design` (النحاسُ لكلّ شاشة) و`validate_contrast`
 * (الأزواجُ) و`audit_tokens` (القائمةُ المغلقة).
 */
describe('المرحلة ٢أ — الرموز (D-187)', () => {
  it('اللوحةُ من القسم 3.2 قيمةً قيمة في الوضعين', () => {
    // ‏اللوحةُ من لوحة الهويّة (D-196 · docs/BRAND.md): ورقٌ على رمل نهارًا، وأرضُ الغلاف ليلًا
    expect(THEME.light).toMatchObject({
      '--bg': '#f9f4ec', '--surface': '#ffffff', '--surface-2': '#f1efeb', '--surface-3': '#e8e1d6',
      '--line': '#d9d2c6', '--line-soft': '#e7e3db', '--field': '#718383',
      '--ink': '#0a2021', '--ink-2': '#364748', '--ink-3': '#5a6969',
      '--brand': '#0b2f31', '--brand-hover': '#113b3d', '--brand-press': '#154445', '--on-brand': '#faf6f0',
      '--link': '#0e6b66', '--selection': '#cceae7', '--au': '#7b5e20',
      '--ok': '#0e4304', '--ok-wash': '#edf8eb', '--bad': '#b3261e', '--bad-wash': '#fcefee',
    })
    expect(THEME.dark).toMatchObject({
      '--bg': '#020f11', '--surface': '#041a1c', '--surface-2': '#082528', '--surface-3': '#0b2f31',
      '--line': '#1e383a', '--line-soft': '#11282a', '--field': '#657b7b', '--ink-3': '#92a0a0',
      '--brand': '#e8e1d6', '--brand-hover': '#dfd8cc', '--brand-press': '#d8d0c3', '--on-brand': '#0b2f31',
      '--selection': '#103f3b', '--au': '#c9a96a', '--ok': '#62bc6b', '--bad': '#f49595', '--bad-wash': '#271111', '--ok-wash': '#0f1c0f',
    })
    // ‏ورموزُ ما قبل اللوحة لا تعود في أيّ سياق: لا سطحَ ثالثَ ولا حدَّ «أقوى» ولا مادّةَ ولا وهج
    for (const gone of ['--chrome', '--line-strong', '--brand-soft', '--brand-wash', '--glow', '--hair', '--sheen', '--bloom']) {
      expect(found((d) => d.prop === gone || d.value.includes(`var(${gone})`)), gone).toEqual([])
    }
  })

  it('الحدُّ الوظيفيُّ للحقل والزرّ الثانويّ، والتركيزُ بحبر الرابط', () => {
    expect(css.rule('select').border).toBe('var(--bd-field)')
    expect(css.rule(':root')['--bd-field']).toBe('1px solid var(--field)')
    expect(css.rule('.btn-secondary')['border-color']).toBe('var(--field)')
    expect(css.rule(':focus-visible').outline).toBe('var(--stroke) solid var(--focus)')
    expect(css.rule(':root')['--ring']).toBe('color-mix(in srgb,var(--focus) 25%,transparent)')
    expect(THEME.light['--focus']).toBe('var(--link)')
  })

  it('رموزُ التفاعل باسمها: التمريرُ والضغطُ والمحدَّدُ والتحديدُ والستارةُ والحوار', () => {
    expect(css.rule('.btn-secondary:hover', '@media(hover:hover)').background).toBe('var(--hover)')
    expect(css.rule('.btn-secondary:active:not(:disabled)').background).toBe('var(--press)')
    expect(css.rule('.btn-primary:hover', '@media(hover:hover)').background).toBe('var(--brand-hover)')
    expect(css.rule('.btn-primary:active:not(:disabled)').background).toBe('var(--brand-press)')
    expect(css.rule('nav.tabs a[aria-current=page]').background).toBe('var(--selected)')
    expect(css.rule('::selection')).toMatchObject({ background: 'var(--selection)', color: 'var(--ink)' })
    expect(css.rule('.cmdk-veil').background).toBe('var(--scrim)')
    expect(css.rule('.cmdk')).toMatchObject({ background: 'var(--dialog)', border: 'var(--bd)', 'box-shadow': 'var(--sh-3)' })
    // ‏والحوارُ من العُدّة على السطح نفسِه فوق الستارة نفسِها (خطّة التصميم 3.7 و7.9 · D-189)
    expect(css.rule('.dlg')).toMatchObject({ background: 'var(--dialog)', border: 'var(--bd)', 'box-shadow': 'var(--sh-3)' })
    expect(css.rule('.dlg::backdrop').background).toBe('var(--scrim)')
    // ‏والستارةُ من الثيم لا ثابتةٌ في الجذر (كانت واحدةً للوضعين، D-105)
    expect([THEME.light['--scrim'], THEME.dark['--scrim']]).toEqual(['rgba(6,26,28,.48)', 'rgba(1,8,9,.7)'])
  })

  it('ثلاثةُ ظلالٍ في الوضعين، والبطاقةُ التفاعليّةُ ترتفع بالثاني وحدَّها الوظيفيّ', () => {
    for (const mode of ['light', 'dark'] as const) {
      expect(Object.keys(THEME[mode]).filter((k) => /^--sh-/.test(k)), mode).toEqual(['--sh-1', '--sh-2', '--sh-3'])
    }
    expect(THEME.light['--sh-1']).toBe('0 1px 2px rgba(11,40,42,.07), 0 1px 1px rgba(11,40,42,.04)')
    expect(THEME.dark['--sh-3']).toBe('0 16px 40px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.4)')
    expect(css.rule('.ch:hover', '@media(hover:hover)')).toMatchObject({
      'box-shadow': 'var(--sh-2)', 'border-color': 'var(--field)',
    })
    expect(css.where('.ch:hover')).toEqual(['@media(hover:hover)'])
  })

  it('نصفُ القطر من القائمة المغلقة، بالدور', () => {
    const r = css.rule(':root')
    expect([r['--r-inline'], r['--r-control'], r['--r-card'], r['--r-sheet'], r['--r-pill']]).toEqual(['4px', '8px', '12px', '16px', '999px'])
    // ‏وكلُّ زاويةٍ من القائمة: الورقةُ السفليّة ‏١٦ في زاويتيها العلويّتين وصفرٌ في السفليّتين (D-189)
    const values = new Set(css.decls().filter((d) => d.prop === 'border-radius').map((d) => d.value))
    expect([...values].filter((v) => !v.split(' ').every((p) => /^(0|50%|var\(--r-(inline|control|card|sheet|pill)\))$/.test(p)))).toEqual([])
    expect(css.rule('.dlg.sheet', '@media(max-width:599px)')['border-radius']).toBe('var(--r-sheet) var(--r-sheet) 0 0')
    expect(css.rule('button')['border-radius']).toBe('var(--r-control)')
    expect(css.rule('.card')['border-radius']).toBe('var(--r-card)')
    expect(css.rule('.mono')['border-radius']).toBe('var(--r-inline)')
  })

  it('رموزُ التخطيط بقيمتيها، ونقاطُ الانكسار ثلاثٌ من «BP»', () => {
    expect(css.rule(':root')).toMatchObject({
      '--pad-card': 'var(--s-6d)', '--gap-card': 'var(--s-6d)', '--gap-section': 'var(--s-12d)', '--gutter': 'var(--s-8d)',
    })
    expect(css.rule(':root', `@media${below('sm')}`)).toMatchObject({
      '--pad-card': 'var(--s-4)', '--gap-card': 'var(--s-4)', '--gap-section': 'var(--s-8)', '--gutter': 'var(--s-4)',
    })
    // ‏كلُّ استعلامِ عرضٍ في الورقة من «BP»: لا ‏720 ولا ‏960 ولا ‏1180
    const widths = (kind: string): Set<number> => new Set(css.rules().flatMap((rule) =>
      [...rule.at.matchAll(new RegExp(`${kind}[^@]*?(?:min|max)-width:(\\d+)px`, 'g'))].map((m) => Number(m[1]))))
    const allowed = new Set(Object.values({ xs: 360, sm: 600, md: 900, lg: 1200 }).flatMap((v) => [v, v - 1]))
    expect([...widths('@media')].filter((w) => !allowed.has(w))).toEqual([])
    // ‏وحدُّ الحاوية من «CQ» وحدها (مراجعة D-187): الصفُّ يلتفّ بعرض قائمته لا بعرض الشاشة
    expect([...widths('@container')].sort((a, b) => a - b)).toEqual(Object.values(CQ).map((v) => v - 1).sort((a, b) => a - b))
  })

  it('النحاسُ في أدواره الثلاثة لا غير، بقيمته الكاملة', () => {
    // ‏**والذهبُ بقيمته لا باسمه** (مراجعة D-196): كلُّ رمزٍ قيمتُه ذهبٌ أو إحالةٌ إليه ذهبٌ، فلا اسمَ ثانيًا له
    const values = new Set(css.decls().filter((d) => d.prop === '--au' || d.prop === '--mark-fg').map((d) => d.value.toLowerCase()))
    const aliases = css.decls().filter((d) => d.prop.startsWith('--') && d.prop !== '--au' && d.prop !== '--mark-fg' &&
      (values.has(d.value.toLowerCase()) || /^var\(\s*--(au|mark-fg)\s*\)$/.test(d.value))).map((d) => d.prop)
    expect(aliases).toEqual([])
    const copper = found((d) => /var\(--(au|mark-fg)\)/.test(d.value))
    expect(copper).toEqual([
      '.glyph{color:var(--mark-fg)}',
      'nav.tabs a[aria-current=page]::before{background:var(--au)}',
      '.grid>.tile:first-child .kv-v{color:var(--au)}',
      // ‏والعلامةُ في لحظتها هي العلامة: دورٌ واحدٌ بمحدّدين، في القالب T6 وحده
      '.moment-glyph{color:var(--mark-fg)}',
    ])
    // ‏والعلامةُ مرّةً في الشاشة: حيث الرافدةُ ظاهرةٌ يغيب بابُ اللوحة من شريط العودة
    expect(css.rule('.app nav.back .home', `@media${atLeast('md')}`).display).toBe('none')
  })
})

/**
 * سلاسلُ الأصناف من الجذر إلى كلّ عنصرٍ يحمل الصنفَ `target` في وسمٍ مرسوم — لمطابقة
 * المحدّد بالعنصر بلا متصفّح. والوسمُ من قوالبنا فهو مغلقٌ صحيحًا.
 */
function classChains(html: string, target: string): string[][][] {
  const chains: string[][][] = []
  const stack: string[][] = []
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)([^>]*)>/gi)) {
    const [, close, tag = '', attrs = ''] = m
    if (close === '/') {
      stack.pop()
      continue
    }
    const cls = (/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/).filter(Boolean)
    if (cls.includes(target)) chains.push([...stack, cls])
    if (!VOID.test(tag) && !attrs.trimEnd().endsWith('/')) stack.push(cls)
  }
  return chains
}

/**
 * القيمةُ التي تسري على عنصرٍ سلسلتُه هذه، من محدّداتِ أصنافٍ ومسافاتٍ وحدها («.a .b.c»)
 * في المستوى الأعلى: الأخصُّ ثمّ الأخيرُ في المصدر. وما سوى ذلك من المحدّدات لا يُطابَق.
 */
function cascaded(chain: readonly string[][], prop: string): string | undefined {
  let best: { spec: number; value: string } | undefined
  for (const d of css.decls()) {
    if (d.at !== '' || d.prop !== prop) continue
    for (const sel of d.selectors) {
      const parts = sel.split(' ')
      if (!parts.every((p) => /^(\.[\w-]+)+$/.test(p))) continue
      const want = parts.map((p) => p.slice(1).split('.'))
      const has = (el: readonly string[] | undefined, cls: readonly string[]): boolean =>
        el !== undefined && cls.every((c) => el.includes(c))
      if (!has(chain.at(-1), want.at(-1) ?? [])) continue
      let i = chain.length - 2
      let ok = true
      for (let k = want.length - 2; k >= 0 && ok; k--) {
        while (i >= 0 && !has(chain[i], want[k] ?? [])) i--
        ok = i >= 0
        i--
      }
      const spec = want.flat().length
      if (ok && (best === undefined || spec >= best.spec)) best = { spec, value: d.value }
    }
  }
  return best?.value
}

describe('مراجعةُ المرحلة ٢أ (D-187)', () => {
  /**
   * **ووصفُ YouTube أخو المسرح لا ابنُه**: «.np-desc» خارج «.np-stage» وعلى أرضه الداكنة،
   * فكان وسمُه «--brand» ‏#16181d على ‏#0b0c10 — ‏١٫١٠:١ نهارًا، أسودَ على أسود. ولا عيّنةَ
   * مرسومةً تفتح وصفًا بوسم، فيُسأل هنا كلُّ وسمٍ في الإطار الداكن عن لونه الساري.
   */
  it('كلُّ وسمٍ على الإطار الداكن بحبر المسرح — والوصفُ المطويُّ منه', () => {
    const post = (platform: 'youtube' | 'tiktok' | 'linkedin'): string => nativePost({
      platform, id: 'v1', author: { name: 'عمر', kind: 'member' }, when: '2 ي', media: null, poster: null,
      metrics: null, variant: 'compact', text: 'عنوانٌ #قصير\nوصفٌ فيه #وسم و #tag',
    })
    const tube = classChains(post('youtube'), 'np-tag')
    // ‏وسمُ العنوان على المسرح، ووسما الوصف في «.np-desc» خارجه
    expect(tube.filter((c) => c.some((el) => el.includes('np-desc')))).toHaveLength(2)
    expect(tube.filter((c) => c.some((el) => el.includes('np-stage')))).toHaveLength(1)
    for (const chain of [...tube, ...classChains(post('tiktok'), 'np-tag')]) {
      expect(cascaded(chain, 'color'), chain.map((el) => el.join('.')).join(' > ')).toBe('var(--np-on-stage)')
    }
    // ‏وعلى الإطار الفاتح يبقى الوسمُ بحبر العلامة
    for (const chain of classChains(post('linkedin'), 'np-tag')) expect(cascaded(chain, 'color')).toBe('var(--brand)')
    // ‏ولا سياقَ آخرَ يُعيد تلوينه — الطباعةُ ترسم المسرحَ أبيضَ بحبرٍ داكن من الرموز نفسِها
    expect(found((d) => d.at !== '' && d.prop === 'color' && d.selectors.some((s) => /\.np-tag\b/.test(s)))).toEqual([])
    expect([THEME.light['--brand'], THEME.light['--np-stage']]).toEqual(['#0b2f31', '#0b0c10'])
  })

  /**
   * **وصفُّ المنشور ثلاثةُ أعمدةٍ حين تسعها قائمتُه وحدها**: بـ«md» عاد ثلاثةً عند ‏900 في ‏604px
   * (الرافدةُ ‏256)، فصار عمودُ الأفعال ‏0px وفاضت الصفحةُ ‏154px. والحاويةُ «.np-list».
   */
  it('صفُّ المنشور يلتفّ بعرض قائمته لا بعرض الشاشة', () => {
    const narrow = `@container np-list ${narrower('npRow')}`
    // ‏**واسمُ الحاوية مفصولٌ عن شرطه**: «np-list(» دالّةٌ في CSS لا اسم، فيُسقط المتصفّحُ
    // الكتلةَ كلَّها صامتًا — وقع هذا في كتابتها الأولى، والقياسُ لم يتغيّر بكسلًا
    expect(css.rules().map((r) => r.at).filter((at) => /@container\s+[\w-]+\(/.test(at))).toEqual([])
    expect(css.rule('.np-list').container).toBe('np-list/inline-size')
    expect(css.rule('.np-row', narrow)['grid-template-columns']).toBe('minmax(0,1fr)')
    for (const s of ['.np-row', '.np-when', '.np-under']) expect(css.where(s), s).toEqual(['', narrow])
    // ‏والحدُّ يسع ما لا ينكمش: الوقتُ ‏8.5rem والإطارُ ‏555 وفجوتان ‏20 وأعرضُ فعلٍ مقيس ‏174
    expect(CQ.npRow).toBeGreaterThanOrEqual(136 + 555 + 2 * 20 + 174)
  })
})

describe('مراجعةُ المرحلة ٢ب (D-189)', () => {
  /**
   * **ومقياسُ الاستحقاق بعرض درجته**: صنفُ التخطيط «.fill» (حقلٌ يأخذ ما بقي من صفّه) حمل
   * «min-width:min(12em,100%)!important» واسمَ عنصر المقياس نفسَه، فغلب عرضَ الدرجة: ‏0.86 و0.61
   * ممتلئتان على ‏1440، و0.61 ترسم ‏76٪ على ‏390. فصار «grow-field»، ولا قاعدةَ تحدّ عرضَ المقياس.
   */
  it('عنصرُ المقياس عرضُه نسبةُ درجته وحدَها — لا حدَّ أدنى ولا أقصى ولا «flex» من صنفٍ آخر', () => {
    const WIDTH = ['width', 'min-width', 'max-width', 'inline-size', 'min-inline-size', 'max-inline-size', 'flex', 'flex-basis', 'flex-grow']
    for (const [worth, pct] of [[0.61, 61], [0.86, 86], [0.05, 5], [1, 100]] as const) {
      const html = worthCell(worth)
      expect(html).toContain(`<span class="fill" style="width:${pct}%;`)
      const chains = classChains(html, 'fill')
      expect(chains).toHaveLength(1)
      for (const prop of WIDTH) expect(cascaded(chains[0] ?? [], prop), `${worth} ${prop}`).toBeUndefined()
    }
    // ‏ولا سياقَ (وسائطُ أو حاوية) يسمّي «.fill» خارج المقياس
    expect(found((d) => d.selectors.some((sel) => /\.fill(?![\w-])/.test(sel) && !/\.worth\b/.test(sel)))).toEqual([])
    // ‏والحقلُ الممتدّ باسمه
    expect(css.rule('.grow-field')['min-width']).toMatch(/^min\(12em,100%\)/)
  })

  /**
   * **وشريطُ التبويب يلتفّ ولا يتمرّر**: كان «overflow-x:auto» بشريطٍ مخفيّ، فحاويةُ التمرير
   * تقصّ المحورين — حلقةُ التركيز خطّان — وغاب «فشلت» و«مرفوضة» على حاسوبٍ ‏900 خلف حافّةٍ لا
   * تبلغها العجلة، و«الإعداد !» عن الهاتف بلا أثر. والهندسةُ في «audit_mobile» (٨) على ستّة عروض.
   */
  it('شريطُ التبويب يلتفّ في كلّ سياق: لا تمريرَ ولا شريطَ مخفيًّا يقصّ تبويبًا أو حلقتَه', () => {
    expect(css.rule('.tab-bar')['flex-wrap']).toBe('wrap')
    expect(found((d) => d.selectors.some((sel) => /\.tab-(bar|sub|item)\b/.test(sel)) &&
      (/^overflow/.test(d.prop) || d.prop === 'scrollbar-width'))).toEqual([])
    // ‏والفرعيُّ يرث الالتفافَ ولا يعيد كتابته
    expect(css.rule('.tab-sub')['flex-wrap']).toBeUndefined()
  })

  /**
   * **وشريطُ العودة يلتفّ قبل أن يُغطّى نصُّه**: اتّسع المقطعُ (‏١٤٤ ← ‏١٦٣px) فانكمش رابطُ العودة
   * عند ‏٣٢٠ إلى ‏٤٩px ونصُّه ‏٨٦ — «المنشو» تحت المبدّل. فالمبدّلُ ينزل سطرًا إلى طرفه حين لا
   * يسعهما سطر، وحشوُه على الهاتف ‏٨ كما كان. والقياسُ في «audit_mobile» (٧).
   */
  it('شريطُ العودة يلتفّ، والمبدّلُ في طرف سطره، وحشوُه على الهاتف أضيق', () => {
    expect(css.rule('nav.back')['flex-wrap']).toBe('wrap')
    expect(css.rule('nav.back .seg')['margin-inline-start']).toBe('auto')
    expect(css.rule('nav.back .seg button', `@media${below('sm')}`)['padding-inline']).toBe('var(--s-2)')
    // ‏ولا يُفرض على رابط العودة حدٌّ أقصى يقصّ نصَّه
    expect(found((d) => d.selectors.some((sel) => sel.startsWith('nav.back a')) &&
      /^(max-width|overflow|text-overflow|white-space)$/.test(d.prop))).toEqual([])
  })
})

/**
 * الهويّةُ من لوحتها (D-196 · docs/BRAND.md): ما تبدّل في الورقة مع الرموز — القمعُ بحبرٍ واحد
 * والمميَّزةُ وحدَها بلون حالها، ورمزُ القسم الحاليّ وخطُّ العنوان بحبر الرابط، والقفلُ كما في اللوحة،
 * ولحظةُ العلامة في القالب T6 وحده.
 */
describe('الهويّةُ من لوحتها (D-196)', () => {
  it('القمعُ حبرٌ واحد، والمحطّةُ المميَّزةُ وحدَها بلون حالها — لا أرضَ تحذيرٍ على سطحٍ رمليّ (D-194 · D-196)', () => {
    expect(css.rule('.fn-bar > span').background).toBe('var(--ink-2)')
    expect(css.rule('.funnel li[data-focus][data-state=now] .fn-bar > span').background).toBe('var(--warn)')
    expect(css.rule('.funnel li[data-state=now] a')).toEqual({})
  })

  it('رمزُ القسم الحاليّ وخطُّ عنوان الصفحة بحبر الرابط — لا ذهبَ رابعًا', () => {
    expect(css.rule('nav.tabs a[aria-current=page] svg').color).toBe('var(--link)')
    expect(css.rule('.page-head h1::after')).toMatchObject({ width: 'var(--s-6)', height: 'var(--stroke)', background: 'var(--link)' })
    // ‏وتمريرُ شريط العودة لونٌ وخطّ: الثانويُّ وحبرُ العلامة ليلًا متقاربان ضوءًا
    expect(css.rule('nav.back a:hover', '@media(hover:hover)')['text-decoration']).toBe('underline')
  })

  it('القفلُ كما في اللوحة: الاسمُ أوّلًا في الشيفرة فيقع الرمزُ يسارَه', () => {
    const order = (html: string): boolean => html.indexOf('class="wordmark"') < html.indexOf('class="glyph')
    expect(order(backNav('/panel', 'اللوحة'))).toBe(true)
    const login = loginPage({}, 'n')
    expect(login.indexOf('class="wordmark"')).toBeLessThan(login.indexOf('class="moment-glyph"'))
  })

  it('لحظةُ العلامة في الدخول مرّةً، بلا رمزٍ ثانٍ فوق النموذج، ومخفيّةٌ في الورق', () => {
    const login = loginPage({}, 'n')
    expect(login.match(/class="moment"/g)).toHaveLength(1)
    expect(login).not.toContain('<div class="glyph">')
    expect(login).toContain('أصوات اليوم .. لقرارات أفضل')
    expect(css.rule('.moment', '@media print').display).toBe('none')
    // ‏والنصُّ على العمق عاجيٌّ و«نعناعٌ فاتح» لا نعناع (‏Lc ‏٦٣ لحرفٍ صغير)
    expect(css.rule('.moment-line').color).toBe('var(--moment-ink)')
    expect(css.rule(':root')).toMatchObject({ '--moment-ink': '#f4faf9' })
    expect(css.rule(':root')['--moment-accent']).toBeUndefined()
    expect(css.rule('.moment-glyph').color).toBe('var(--mark-fg)')
  })
})

/** صفحاتُ لحظة العلامة بوجوهها كلِّها — القالب T6. */
const T6_PAGES: ReadonlyArray<readonly [string, string]> = [
  ['صفحة الهبوط (D-193)', landingPage('n')],
  ['الدخول بمفتاح', loginPage({ passkeys: true }, 'n')],
  ['الدخول بكلمة الإدارة', loginPage({}, 'n')],
  ['الدخول موقوفًا', loginPage({ blocked: true, error: 'موقوف' }, 'n')],
  ['العامل الثاني كاملًا', secondFactorPage({ csrf: 'c', challenge: 'x', rpId: 'sada2.basserh.com', hasPasskey: true, hasTotp: true, hasRecovery: true, error: 'رمزٌ غير صحيح' }, 'n')],
  ['العامل الثاني برمزٍ وحده', secondFactorPage({ csrf: 'c', challenge: 'x', rpId: 'sada2.basserh.com', hasPasskey: false, hasTotp: true, hasRecovery: false, error: null }, 'n')],
  ['العامل الثاني بلا عامل', secondFactorPage({ csrf: 'c', challenge: 'x', rpId: 'sada2.basserh.com', hasPasskey: false, hasTotp: false, hasRecovery: false, error: null }, 'n')],
]

/**
 * أسلافُ كلّ عنصرٍ يحقّق `hit` في وسمٍ مرسوم — اسمُ الوسم وسماتُه، من الجذر إليه. والوسمُ من
 * قوالبنا فهو مغلقٌ صحيحًا (كـ`classChains`).
 */
function ancestry(html: string, hit: (tag: string, attrs: string) => boolean): Array<Array<{ tag: string, attrs: string }>> {
  const out: Array<Array<{ tag: string, attrs: string }>> = []
  const stack: Array<{ tag: string, attrs: string }> = []
  const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr|path|rect|circle)$/i
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)([^>]*)>/gi)) {
    const [, close, tag = '', attrs = ''] = m
    if (close === '/') {
      stack.pop()
      continue
    }
    if (hit(tag, attrs)) out.push([...stack])
    if (!VOID.test(tag) && !attrs.trimEnd().endsWith('/')) stack.push({ tag: tag.toLowerCase(), attrs })
  }
  return out
}

/**
 * ‏**مراجعةُ D-196: ما كان يُحرَس في `npm run audit` وحده يُحرَس هنا** — لحظتان داخل نموذج العامل الثاني
 * اجتازتا `npm run ci` كلَّه (‏2434 اختبارًا)، وقاعدةُ الموضع لا تحتاج متصفّحًا. وما يلي ممّا وجدته المراجعة.
 */
describe('مراجعةُ الهويّة (D-196)', () => {
  it('لحظةٌ واحدةٌ في كلّ صفحة T6، ابنٌ مباشرٌ لـ.auth-split، ولا نقشَ في سطح عمل', () => {
    const WORK = /^(form|table|dialog|nav|fieldset)$/
    const WORK_ATTR = /\brole="(alert|status|dialog)"|\bclass="[^"]*\b(toast|toast-note|card-alert|kv-v)\b/
    for (const [name, html] of T6_PAGES) {
      expect(html.match(/class="moment"/g), name).toHaveLength(1)
      const parents = classChains(html, 'moment').map((chain) => chain.at(-2))
      expect(parents, name).toEqual([['auth-split']])
      // ‏والنقشُ بعلامته على الـsvg نفسِه أو بغلافه — لا يقع في نموذجٍ ولا جدولٍ ولا تنبيهٍ ولا حال
      const echoes = ancestry(html, (tag, attrs) => /\bdata-echo=/.test(attrs) || /\bclass="echo\b/.test(attrs))
      expect(echoes.length, name).toBeGreaterThan(0)
      for (const chain of echoes) {
        const bad = chain.filter((a) => WORK.test(a.tag) || WORK_ATTR.test(a.attrs)).map((a) => a.tag)
        expect(bad, name).toEqual([])
        expect(chain.some((a) => /\bclass="moment"/.test(a.attrs)), name).toBe(true)
      }
      // ‏ولا حقلَ ولا نموذجَ داخل اللحظة: «لا شيءَ خلف حقل»
      const inMoment = ancestry(html, (tag) => /^(form|input|select|textarea|table|button)$/i.test(tag))
        .filter((chain) => chain.some((a) => /\bclass="moment"/.test(a.attrs)))
      expect(inMoment, name).toEqual([])
    }
  })

  it('صفحةُ ‏500 معلَّمةٌ سطحًا لا نقشَ فيه، فيردّ الحارسُ نقشًا تحتها', () => {
    const page = serverErrorPage('n', 'r-1', null)
    expect(page).toContain('<div data-no-echo="500">')
    expect(page.indexOf('data-no-echo')).toBeLessThan(page.indexOf('حدث خطأ من جهتنا'))
  })

  it('العلامةُ «صدى» وحدها في اللحظة (D-203): لا «SADA» ولا سطرٌ إنجليزيّ، والشعارُ العربيُّ باقٍ', () => {
    const login = loginPage({}, 'n')
    expect(login).not.toContain('moment-sada')
    expect(login).not.toContain('moment-en')
    expect(login).not.toMatch(/SADA|Today|better decisions/)
    expect(login).toContain('<p class="moment-line">أصوات اليوم .. لقرارات أفضل</p>')
    expect(css.where('.moment-en')).toEqual([])
    expect(css.where('.moment-sada')).toEqual([])
  })

  it('الشريطُ بارتفاعه لا بنصيب الشاشة', () => {
    expect(css.rule('.auth-split')['grid-template-rows']).toBe('auto 1fr')
    for (const sel of ['.moment .echo', '.moment-line']) {
      expect(css.rule(sel, `@media${below('md')} and (max-height:40rem)`).display, sel).toBe('none')
    }
    expect(css.rule('.moment', `@media${below('md')} and (max-height:40rem)`)['min-height']).toBe('0')
  })

  it('لحظةُ العلامة بألوانها في التباين العالي: أرضُ النقش سمةٌ لا تُفرَض، فلا يُفرَض رمزُها', () => {
    expect(css.rule('.moment', '@media(forced-colors:active)')['forced-color-adjust']).toBe('none')
  })

  it('اسمُ القفل في شريط العودة ليس أيقونة: «a>svg» لا يسحقه ‏16×16', () => {
    const iconRules = found((d) => d.prop === 'width' && d.selectors.some((sel) => /^nav\.back a>svg/.test(sel)))
    expect(iconRules.length).toBeGreaterThan(0)
    for (const r of iconRules) expect(r).toContain(':not(.wordmark)')
    expect(backNav('/panel', 'اللوحة')).toMatch(/<a class="home"[^>]*><svg class="wordmark"/)
  })

  it('شريطُ المتصفّح بأرض اللحظة دون «md» في صفحتَي اللحظة، وسكربتا الثيم لا يكتبان فوقه', () => {
    const tag = `<meta name="theme-color" media="${below('md')}" content="${MOMENT.ground}">`
    for (const [name, html] of T6_PAGES) {
      expect(html, name).toContain(tag)
      // ‏الأوّلُ المطابِق هو الساري: يسبق وسمَي الوضعين
      expect(html.indexOf(tag), name).toBeLessThan(html.indexOf('<meta name="theme-color" media="(prefers-color-scheme'))
    }
    expect(shell('ت', '<p>x</p>', 'n1')).not.toContain(MOMENT.ground)
    // ‏ويُشغَّل سكربتُ الإقلاع بوضعٍ مختار: وسما الوضعين يتبعانه، ووسمُ اللحظة كما هو
    const html = loginPage({}, 'n')
    const boot = /<script nonce="n">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
    expect(boot).toContain('sada-theme')
    const metas = [...html.matchAll(/<meta name="theme-color"([^>]*)>/g)].map(([, a = '']) => ({
      media: /media="([^"]*)"/.exec(a)?.[1] ?? '', content: /content="([^"]*)"/.exec(a)?.[1] ?? '',
      dataset: /data-c="([^"]*)"/.test(a) ? { c: /data-c="([^"]*)"/.exec(a)?.[1] } : {},
    }))
    const doc = {
      documentElement: { dataset: {} as Record<string, string> },
      querySelectorAll: (sel: string) => metas.filter((m) => !sel.includes('[data-c]') || m.dataset.c !== undefined),
      getElementById: () => null,
    }
    for (const [script, run] of [
      [boot, () => runInNewContext(boot, { document: doc, localStorage: { getItem: (k: string) => (k === 'sada-theme' ? 'dark' : null) } })],
    ] as const) {
      expect(script.length).toBeGreaterThan(0)
      run()
    }
    expect(metas.map((m) => m.content)).toEqual([MOMENT.ground, THEME.dark['--bg'], THEME.dark['--bg']])
    // ‏ومبدّلُ الثيم كذلك: «ليليّ» ثمّ «النظام»
    const box = { querySelectorAll: () => [] }
    const doc2 = { ...doc, getElementById: () => box }
    runInNewContext(THEME_SCRIPT, { document: doc2, localStorage: { getItem: () => 'light', setItem() {}, removeItem() {} } })
    expect(metas.map((m) => m.content)).toEqual([MOMENT.ground, THEME.light['--bg'], THEME.light['--bg']])
  })
})

describe('اللوحُ بالأهمّ أوّلًا و«الأرشيف» (D-215)', () => {
  const at = (h: number) => `2026-09-06 ${String(h).padStart(2, '0')}:00:00`
  const row = (id: string, status: string, h: number) => ({ id, status, createdAt: at(h) }) as unknown as Parameters<typeof byUrgency>[0][number]

  it('ما فشل، ثمّ ما ينتظر، ثمّ المعتمَد، ثمّ المجدول، ثمّ ما انتهى — والأحدثُ أوّلًا في الرتبة', () => {
    const out = byUrgency([
      row('pub', 'published', 9), row('q', 'queued', 9), row('ok', 'approved', 9),
      row('old', 'draft', 1), row('new', 'draft', 8), row('rej', 'rejected', 9), row('bad', 'failed', 2),
    ]).map((d) => d.id)
    expect(out).toEqual(['bad', 'new', 'old', 'ok', 'q', 'pub', 'rej'])
  })

  it('«قيد العمل» افتراضٌ يحمل سلالَه، و«الأرشيف» يجمع ما نُشر وما رُفض', () => {
    expect(SCRIPT).toContain("var bucket='active'")
    expect(SCRIPT).toContain("bucketOf.indexOf(c.dataset.status)")
  })
})
