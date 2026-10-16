/**
 * لوحُ القنوات يقرأ صفَّ الإذن لا كلمةَ الحال (D-159).
 */
import { describe, expect, it } from 'vitest'
import { callbackStep, SETUP, tokenHealth, viewChannels, type LinkedAccount } from '../../lib/channels'
import { channelsSection, setupPane } from './channels'
import { pathArrows } from './parts'
import type { AppStatus } from '../../lib/oauth/apps'

const now = new Date('2026-09-27T12:00:00Z')
const acc = (over: Partial<LinkedAccount>): LinkedAccount => ({
  id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
  createdAt: '2026-09-01 00:00:00', expiresAt: '2026-11-01 00:00:00', ...over,
})

describe('حسابٌ مربوطٌ بلا صفّ tokens', () => {
  it('يُعرَض «منقطعة» بزرّ «أعد الربط» — لا «مربوطة» خضراء (D-166 · D-205)', () => {
    const html = channelsSection(viewChannels([acc({ expiresAt: null })], () => true), now)
    expect(html).toContain('data-health="broken"')
    expect(html).toContain('aria-label="أعد الربط LinkedIn"')
  })

  it('وبصفٍّ صالحٍ «متّصلة» وزرُّها «افتح» إلى شاشتها', () => {
    const html = channelsSection(viewChannels([acc({})], () => true), now)
    expect(html).toContain('data-health="connected"')
    expect(html).toContain('href="/panel/channels/linkedin"')
    expect(html).toContain('aria-label="افتح LinkedIn"')
  })

  it('والحسابُ الذي يحتاج تجديدًا وبلا صفٍّ لا يُعَدّ مرّتين', () => {
    const html = channelsSection(viewChannels([acc({ status: 'needs_reauth', expiresAt: null })], () => true), now)
    expect(html).toMatch(/تحتاج إعادةَ ربط<\/div>\s*<div class="kv-v">1</)
  })
})

/*
 * ‏**ما وجدته رحلاتُ المالك في القنوات وضبط التطبيق** (خطّ الأساس، 2026-10-04).
 */
describe('حالُ الإذن من الرمزين معًا (خطّة التصميم 5.7)', () => {
  // ‏بذرةُ الرحلة: إذنُ وصولٍ لساعتين، وإذنُ تجديدٍ لثلاثمئة يوم — كما يعطيه X وGoogle
  const x = acc({
    id: 'x1', platform: 'x', expiresAt: '2026-09-27 14:00:00',
    renewable: true, refreshExpiresAt: '2027-07-24 12:00:00',
  })

  it('ما يتجدّد وحده رقاقةٌ هادئة، لا «ينتهي الإذن اليوم» برتقاليّة', () => {
    expect(tokenHealth(x, now)).toMatchObject({ kind: 'auto' })
    // ‏وX بلا موعدٍ لإذن تجديده: يتجدّد كذلك
    expect(tokenHealth({ ...x, refreshExpiresAt: null }, now)).toEqual({ kind: 'auto', days: null, at: null })
  })

  it('والبطاقةُ والبلاطةُ لا تتعارضان: ما يتجدّد وحده «متّصلة» و«تحتاج إعادةَ ربط 0» (D-205)', () => {
    const html = channelsSection(viewChannels([x], () => true), now)
    expect(html).toContain('data-health="connected"')
    expect(html).toMatch(/تحتاج إعادةَ ربط<\/div>\s*<div class="kv-v">0</)
  })

  it('والتحذيرُ حين يقترب انقطاعُ الربط — والبلاطةُ تعدّه', () => {
    const near = { ...x, refreshExpiresAt: '2026-09-30 12:00:00' }
    expect(tokenHealth(near, now)).toMatchObject({ kind: 'soon', days: 3 })
    const html = channelsSection(viewChannels([near], () => true), now)
    expect(html).toContain('تحتاج إعادةَ ربطٍ خلال 3 أيّام')
    expect(html).toMatch(/تحتاج إعادةَ ربط<\/div>\s*<div class="kv-v">1</)
  })

  it('وبلا تجديدٍ يُعَدّ من إذن الوصول كما كان', () => {
    expect(tokenHealth(acc({ expiresAt: '2026-09-29 12:00:00' }), now)).toMatchObject({ kind: 'soon', days: 2 })
    expect(tokenHealth(acc({ expiresAt: '2026-09-20 12:00:00', renewable: false }), now)).toMatchObject({ kind: 'expired' })
    // ‏وإذنُ تجديدٍ انتهى لا يجدّد شيئًا
    expect(tokenHealth({ ...x, refreshExpiresAt: '2026-09-01 00:00:00', expiresAt: '2026-09-26 00:00:00' }, now))
      .toMatchObject({ kind: 'expired' })
    // ‏وإذنُ وصولٍ فات وإذنُ التجديد قائم: تأخّرت الدورة، لا انتهى الربط
    expect(tokenHealth({ ...x, expiresAt: '2026-09-27 09:00:00' }, now)).toMatchObject({ kind: 'overdue' })
  })
})

describe('الفعلُ الواحد يفتح الضبطَ أو الربط (D-111 · D-205)', () => {
  it('الناقصةُ سرّيها: «أكمل الإعداد» إلى حقل المعرّف في الإعداد', () => {
    const html = channelsSection(viewChannels([], () => false), now)
    expect(html).toContain('href="/panel/channels/instagram?tab=setup#ci-instagram"\n         aria-label="أكمل الإعداد Instagram">أكمل الإعداد</a>')
    expect(html).not.toContain('اعرضها')
  })

  it('والجاهزةُ للربط بزرٍّ أوّليٍّ «اربط»', () => {
    const html = channelsSection(viewChannels([], (n) => n.startsWith('TIKTOK')), now)
    expect(html).toContain('<a class="btn btn-primary btn-sm" href="/oauth/tiktok/start"\n         aria-label="اربط TikTok">اربط</a>')
  })
})

describe('دليلُ الضبط', () => {
  const app = (platform: string, over: Partial<AppStatus> = {}): AppStatus => ({
    platform: platform as AppStatus['platform'], source: 'none', clientId: null, hint: null,
    updatedAt: null, updatedBy: null, secretNames: ['A', 'B'], verifiedAt: null, verifiedKind: null, ...over,
  })
  const pane = (platform: string, over: Partial<AppStatus> = {}, accounts: LinkedAccount[] = []): string =>
    setupPane(viewChannels(accounts, () => false).find((v) => v.spec.id === platform)!, app(platform, over), 'https://sada2.basserh.com')

  it('سرُّ Worker الغالب: يُقال أين يُبدَّل، واسمُ المتغيّر خلف «للمطوّر» وحدَه (D-218)', () => {
    const html = pane('linkedin', { source: 'worker_secret', clientId: 'cid', secretNames: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'] })
    const dev = html.indexOf('<details class="setup mt-2"><summary>للمطوّر</summary>')
    expect(dev).toBeGreaterThan(-1)
    expect(html.indexOf('LINKEDIN_CLIENT_SECRET')).toBeGreaterThan(dev)
    expect(html.slice(dev)).toContain('wrangler secret put LINKEDIN_CLIENT_SECRET')
  })

  it('وشريطُ أفعال المساعد يلتصق في أسفله، والحاويةُ لا تحبسه (D-218)', async () => {
    const { sheet } = await import('../../test/css')
    const { STYLE } = await import('./styles')
    const css = sheet(STYLE)
    expect(css.rule('.guide .wiz-bar')).toMatchObject({ position: 'sticky', bottom: '0' })
    expect(css.rule('.guide').overflow).toBe('clip')
  })

  it('النموذجان يعودان إلى تبويب الإعداد، والحقلان يردّان الفراغَ وحده', () => {
    const html = pane('instagram')
    expect(html).toContain('<input type="hidden" name="return" value="platform:instagram:setup">')
    expect((html.match(/pattern="\\S\.\*"/g) ?? []).length).toBe(2)
    // ‏و«احذف» لا يحجبه حقلٌ مطلوبٌ فارغ
    expect(pane('instagram', { source: 'vault', clientId: 'cid', hint: '••' })).toMatch(/formaction="\/panel\/channels\/app\/delete" formnovalidate/)
  })

  it('تحت «رابطُ العودة» رقمُ خطوته، والتنبيهُ بعد الخطوات بعنوانه', () => {
    for (const [platform, step] of [['instagram', 3], ['linkedin', 1], ['youtube', 5], ['tiktok', 5], ['x', 3]] as const) {
      expect(callbackStep(SETUP[platform]!), platform).toBe(step)
    }
    const html = pane('instagram')
    const label = html.indexOf('رابطُ العودة</label>')
    const field = html.slice(label, html.indexOf('</div>', html.indexOf('class="copy"', label)))
    expect(field).toContain('والصقه في الخطوة 3 أعلاه')
    expect(field).not.toContain('REELS')
    expect(html.indexOf('<b>انتبه.</b>')).toBeGreaterThan(html.indexOf('<ol class="steps">'))
    expect(html.indexOf('<b>انتبه.</b>')).toBeLessThan(label)
  })

  it('ويبقى الدليلُ مفتوحًا حتّى يُربَط حسابٌ أو يجوز الفحص — و«افحص الزوج» ظاهر', () => {
    expect(pane('tiktok', { source: 'vault', clientId: 'k', hint: '••' })).toMatch(/<details class="card card-inset guide" open>/)
    expect(pane('tiktok', { source: 'vault', clientId: 'k', hint: '••', verifiedKind: 'accepted' })).not.toMatch(/<details class="card card-inset guide" open>/)
    expect(pane('tiktok', { source: 'vault', clientId: 'k', hint: '••', verifiedKind: 'bad_secret' },
      [acc({ platform: 'tiktok' })])).toMatch(/<details class="card card-inset guide" open>/)
    expect(pane('tiktok', { source: 'vault', clientId: 'k', hint: '••' }, [acc({ platform: 'tiktok' })])).not.toMatch(/<details class="card card-inset guide" open>/)
  })
})

/*
 * ‏ر-1: «Instagram ← API setup ← Business login settings» كان يُرسَم مقطعًا لاتينيًّا واحدًا
 * ‏من اليسار، فيقرؤه العربيُّ معكوسًا. والسهمُ بين علامتَي RLM يأخذ اتّجاهَ الفقرة.
 */
describe('مسارُ البوّابة يُقرأ من اليمين', () => {
  it('كلُّ سهمٍ بين كلمتين لاتينيّتين محاطٌ بعلامتَي RLM', () => {
    const html = pathArrows('Instagram ← API setup ← Business login settings ← الصق')
    expect(html.match(/\u200F<span class="arw"[^>]*>.*?<\/span>\u200F/g)?.length).toBe(3)
    for (const guide of Object.values(SETUP)) {
      for (const text of [...guide.before.map((b) => b.what), guide.whereId, guide.whereSecret]) {
        const out = pathArrows(text)
        expect(out).not.toContain('←')
        expect(out.split('<span class="arw"').length - 1, text)
          .toBe(out.split('\u200F<span class="arw"').length - 1)
      }
    }
  })
})

describe('بطاقةُ «الحسابات» تقول حالًا واحدة (D-205)', () => {
  /*
   * ‏كانت البطاقةُ تقول «مربوطة» خضراءَ في رأسها و«انتهى الإذن» حمراءَ تحتها لحسابٍ واحد. فالحالُ
   * ‏من `channelHealth` وحدَه، ولا شارةَ حالٍ ثانيةٌ في البطاقة، ولا «إذنُ الوصول» ولا «إذنُ التجديد».
   */
  it('حسابٌ انتهى إذنُه بلا تجديد: «منقطعة» وحدَها، وزرُّها «أعد الربط»', () => {
    const views = viewChannels([acc({ expiresAt: '2026-08-01 00:00:00' })], () => true)
    const html = channelsSection(views, now)
    const li = html.slice(html.indexOf('id="ch-linkedin"'), html.indexOf('id="ch-', html.indexOf('id="ch-linkedin"') + 1))
    expect(li).toContain('data-health="broken"')
    expect(li).toContain('منقطعة')
    expect(li).not.toContain('مربوطة')
    expect(li).not.toContain('انتهى الإذن')
    expect(li).toContain('href="/oauth/linkedin/start"')
    expect((li.match(/class="btn /g) ?? []).length).toBe(1)
  })

  it('ولا «إذن الوصول» ولا «إذن التجديد» في اللوح', () => {
    const html = channelsSection(viewChannels([acc({})], () => true), now)
    expect(html).not.toMatch(/إذنُ? ?(الوصول|التجديد)/)
  })

  it('والمنقطعةُ أوّلًا، ثمّ ما يحتاج إعدادًا، ثمّ المتّصلة', () => {
    const views = viewChannels([
      acc({}),
      acc({ id: 'x:1', platform: 'x', status: 'needs_reauth' }),
    ], (name) => !name.startsWith('TIKTOK_'))
    const html = channelsSection(views, now)
    const order = [...html.matchAll(/data-health="([a-z]+)"/g)].map((m) => m[1])
    expect(order[0]).toBe('broken')
    expect(order.indexOf('connected')).toBeGreaterThan(order.lastIndexOf('setup'))
  })

  it('وما لم يُبنَ سطرُ «قريبًا» لا بطاقات', () => {
    const html = channelsSection(viewChannels([], () => true), now)
    expect(html).toMatch(/<p class="hint mt-5">قريبًا: /)
    expect(html).not.toContain('data-health="unbuilt"')
  })
})
