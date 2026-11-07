/**
 * **نظامُ التصميم كما يُرسَم** (D-325): ما قاسه تقييمُ النضج في الوسم المرسوم — لا في الوثيقة ولا في الدالّة.
 *
 * كلُّ «describe» هنا علّةٌ قِيست قبل أن تُصلَح، وسقطت حالاتُه على أساس الفرع (`856ca24`): القمعُ يلبس خمسَ شاراتِ «تنتظرك»
 * برتقاليّةً من سبع؛ والأزرارُ المعطَّلةُ المكتوبةُ باليد بلا سببٍ يُرى؛ وأسماءُ الأيّام في شريط الأسبوع أعرضُ من عمودها على
 * الهاتف؛ ووزنُ التلميح ‏500 خارج زوج الوزنين.
 */
import { describe, expect, it } from 'vitest'
import { STYLE } from './styles'
import { sheet } from '../../test/css'
import { homeTop } from './sections/home'
import { draftsSection } from './sections/drafts'
import { planSection } from './sections/plan'
import { planReviewScreen } from './planReviewView'
import { menuAction } from './components/menu'
import { loginPage } from '../panelView'
import { viewChannels } from '../../lib/channels'
import { infographicReadiness, imageReadiness, videoReadiness } from '../../lib/media/readiness'
import { videoCapGate } from '../../lib/limits'
import { slideGate } from '../../lib/image/gate'
import type { HomeFacts } from '../../lib/home'
import type { DraftRow } from '../../lib/draft/store'
import type { MediaView } from './sections/drafts'

const css = sheet(STYLE)
const NOW = new Date('2026-10-04T12:00:00Z')
const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  channels: viewChannels([], () => true), counts: { perPlatform: {}, publishedWeek: 0 }, paused: false,
  sources: { total: 2, analyzed: 2 }, withoutImage: 0, withImage: 0, openSuggestions: 0,
  firsts: { waiting: null, unscheduled: null, withoutImage: null }, pulses: [], blocker: null, zone: null, ...over,
})

describe('القمعُ يُبرز ما ينتظرك الآن وحدَه (D-325 · خطّة التصميم 3.2)', () => {
  // ‏مصدرٌ ينتظر التحليل، ومسوّدتان بلا صورة، ومسوّدتان تنتظران الاعتماد، ومعتمدةٌ بلا موعد، واقتراحٌ مفتوح: خمسُ «تنتظرك»
  const busy = facts({
    sources: { total: 3, analyzed: 2 }, withoutImage: 2, openSuggestions: 1,
    counts: { perPlatform: { x: { draft: 2, approved: 1, queued: 0, published: 0, failed: 0, recentFailed: 0, nextAt: null } }, publishedWeek: 0 },
  })
  const funnel = (html: string): string[] => {
    const ol = html.slice(html.indexOf('<ol class="funnel">'), html.indexOf('</ol>', html.indexOf('<ol class="funnel">')))
    return ol.split('<li').slice(1)
  }

  it('خمسُ محطّاتٍ تنتظرك، وشارةٌ برتقاليّةٌ واحدة: المحطّةُ المميَّزة', () => {
    const legs = funnel(homeTop(busy, NOW))
    expect(legs.filter((l) => l.includes('data-state="now"')).length).toBeGreaterThanOrEqual(4)
    const warn = legs.filter((l) => l.includes('class="st warn"'))
    expect(warn).toHaveLength(1)
    expect(warn[0]).toContain('data-focus')
  })

  it('والأخرى «تنتظرك» برمزها وكلمتها بحبرٍ محايد — الحالُ نصٌّ لا لون', () => {
    for (const l of funnel(homeTop(busy, NOW)).filter((x) => x.includes('data-state="now"') && !x.includes('data-focus'))) {
      expect(l).toContain('class="st idle"')
      expect(l).toContain('تنتظرك')
    }
  })

  it('وحافّةُ الرقم ملوّنةٌ لما ليس صفرًا وحدَه، و«بانتظار قرارك» بلا برتقاليّ', () => {
    const tones = [...homeTop(busy, NOW).matchAll(/<li data-tone="([a-z]+)"><a href="[^"]*"><span class="hs-k">([^<]+)</g)]
      .map((m) => [m[2], m[1]])
    expect(tones).toEqual([['بانتظار قرارك', 'wait'], ['مجدولة', 'idle'], ['نُشرت هذا الأسبوع', 'idle'], ['فشلت هذا الأسبوع', 'idle']])
    expect(css.rule('.hstats [data-tone=wait] a')['border-inline-start-color']).not.toBe('var(--warn)')
  })
})

describe('شريطُ الأسبوع على الهاتف: الاسمُ بقدر عموده (D-325)', () => {
  it('كلُّ يومٍ بثلاثة أطوالٍ يُرى أحدُها بقدر العمود، والاسمُ الكاملُ لقارئ الشاشة دائمًا', () => {
    const html = homeTop(facts(), NOW)
    expect(html).toContain('<span class="wk-long" aria-hidden="true">الاثنين</span><span class="wk-short" aria-hidden="true">اثنين</span>' +
      '<span class="wk-min" aria-hidden="true">ن</span><span class="vh">الاثنين</span>')
    expect(css.rule('.wk-short').display).toBe('none')
    expect(css.rule('.wk-min').display).toBe('none')
    expect(css.rule('.wk-long', '@media(max-width:599px)').display).toBe('none')
    expect(css.rule('.wk-short', '@media(max-width:599px)').display).toBe('inline')
    expect(css.rule('.wk-d', '@media(max-width:599px)')['font-size']).toBe('var(--t-caption)')
    expect(css.rule('.wk-short', '@media(max-width:359px)').display).toBe('none')
    expect(css.rule('.wk-min', '@media(max-width:359px)').display).toBe('inline')
  })
})

describe('الوزنان ‏400 و‏600 وحدهما (tokens.ts · D-185)', () => {
  it('لا «font-weight» في الورقة غيرهما — والتلميحُ ‏500 كان يسقط إلى ‏400 بلا خطٍّ مضمَّن', () => {
    const weights = new Set(css.decls().filter((d) => d.prop === 'font-weight').map((d) => d.value))
    for (const w of weights) expect(['400', '600', 'inherit'], w).toContain(w)
  })
})

/**
 * زرٌّ معطَّلٌ بسببٍ يُرى (D-325 · خطّة التصميم 7.1). العقدُ في `button()`: `aria-describedby` إلى سطرٍ ظاهر؛ والوسمُ المكتوبُ
 * باليد كان يكتب `disabled` وحدَه. `audit_disabled` يقيسه مرسومًا، وهنا يُسأل كلُّ موضعٍ أُصلح.
 */
describe('زرٌّ معطَّلٌ يقول لماذا (D-325)', () => {
  /** كلُّ زرٍّ معطَّلٍ في الوسم يصف نفسَه بمعرّفٍ موجودٍ فيه نصّ. */
  const reasons = (html: string): string[] => {
    const out: string[] = []
    for (const m of html.matchAll(/<button\b[^>]*>/g)) {
      const tag = m[0]
      if (!/\sdisabled(?=[\s>])|aria-disabled="true"/.test(tag) || /aria-busy="true"/.test(tag)) continue
      const id = /aria-describedby="([^"]+)"/.exec(tag)?.[1]
      if (id === undefined) { out.push(`بلا سبب: ${tag}`); continue }
      // ‏العنصرُ كلُّه حتّى إغلاقِ وسمه — سطرُ الجاهزيّة «p» فيه شاراتٌ ورموز، ونصُّه بعدها
      const target = new RegExp(`<([a-z]+)\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html)
      if (target === null || (target[2] ?? '').replace(/<[^>]+>/g, '').trim() === '') out.push(`سببٌ فارغٌ أو مفقود: ${tag}`)
    }
    return out
  }

  it('«ثبّت الخطّة» بلا بندٍ معتمَد: معطَّلٌ وسببُه سطرٌ تحته', () => {
    const items = [{ sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية', day: '2026-11-08', time: '06:00', why: 'ل' }]
    const m = {
      plan: { id: 'pl1', week: '2026-11-08', plan: { rationale: '', items }, model: 'm', status: 'approved', createdAt: '2026-11-02 08:00:00', span: 'week',
        choices: { channels: ['linkedin'], cadence: {}, sources: 'all', ideas: [], assets: [], autoImage: true, imageStyle: 'illustration', startDay: '2026-11-08' } },
      version: 1, lockedAt: null, versions: [], gaps: { unwritten: 0, no_image: 0, pending: 1, clash: 0 },
      cards: [{ index: 0, key: 'k0', item: items[0], post: { id: 'p0', status: 'draft', text: 'نصّ', scheduledAt: null }, mediaId: null, gaps: ['pending'] }],
    } as never
    const html = planReviewScreen(m, null)
    expect(html).toMatch(/<button class="btn btn-primary" type="submit" disabled aria-describedby="rv-pin-why">ثبّت الخطّة<\/button>/)
    expect(html).toContain('id="rv-pin-why">اعتمد بندًا واحدًا على الأقلّ')
    expect(reasons(html)).toEqual([])
  })

  it('أزرارُ الصورة والفيديو المحجوبة: السببُ سطرُ الجاهزيّة الظاهرُ لكلّ بطاقة، لا تلميحٌ على زرٍّ لا يُركَّز', () => {
    const blocked = {
      infographic: infographicReadiness({ blocker: null, browser: { key: false, account: false }, briefReady: true }),
      image: imageReadiness({ blocker: null, provider: { label: 'Gemini', refusal: null },
        slide: slideGate({ overlay: true, hasBrowserKey: false, hasAccount: false }), briefReady: false }),
      video: videoReadiness({ face: 'env', blocker: null, clips: videoCapGate(2, 2) }),
    }
    const d: DraftRow = {
      id: 'd1', platform: 'linkedin', text: 'نصّ', rationale: null, status: 'draft', model: null,
      cost: 0, sourceId: null, sourceName: null, stale: false, approvedBy: null,
      approvedAt: null, createdAt: '2026-09-05 09:00:00', scheduledAt: null,
      accountName: null, dispatchedAt: null, publishCost: 0, originalText: null,
    }
    const base = { targets: [], earliest: '2026-09-06T09:15', writable: [], now: new Date('2026-09-06T09:00:00Z'), ready: true, pageOnly: [], peaks: {}, mediaReady: blocked }
    // ‏بلا صورة: «ولّد إنفوجرافيك» و«ولّد صورةً فنّيّة»
    const none = draftsSection({ ...base, drafts: [d], media: [] })
    expect(none).toMatch(/<button class="btn btn-secondary btn-sm" type="submit" disabled aria-describedby="why-info-d1">ولّد إنفوجرافيك<\/button>/)
    expect(reasons(none)).toEqual([])
    // ‏ومع صورة: «حرّكها فيديو» والتبديلُ المحجوب
    const media = {
      id: 'm1', postId: 'd1', mime: 'image/png', status: 'ready', model: 'infographic:x', cost: 0.01, bytes: 2048, prompt: '', note: '',
      headline: 'عنوان', width: 1200, height: 628,
    } as unknown as MediaView
    const ready = draftsSection({ ...base, drafts: [d], media: [media] })
    expect(ready).toContain('aria-describedby="why-video-d1"')
    expect(reasons(ready)).toEqual([])
  })

  it('«خطّط الأسبوع» والمزوّدُ غير جاهز: السببُ تحت الزرّين مربوطٌ بهما', () => {
    const html = planSection({ plan: null, now: NOW, ready: false, analyzed: 0, names: {}, zone: null } as never)
    expect(html).toMatch(/disabled aria-describedby="pl-why"/)
    expect(reasons(html)).toEqual([])
  })

  it('بندُ القائمة المحجوب يصف نفسَه بسببه المكتوب تحته', () => {
    const html = menuAction({ label: 'ولّد صورة', action: '/panel/media/generate', fields: { id: 'd1' }, blocked: 'بلا مفتاح المتصفّح' })
    expect(reasons(html)).toEqual([])
  })

  it('وأزرارُ الدخول حين يُوقَف: معطَّلةٌ وسببُها السطرُ فوقها', () => {
    for (const step of ['email', 'code'] as const) {
      const html = loginPage({ step, blocked: true, error: 'محاولاتٌ كثيرة من هذا العنوان.' })
      expect(html, step).toContain('aria-describedby="login-why"')
      expect(reasons(html), step).toEqual([])
    }
  })
})
