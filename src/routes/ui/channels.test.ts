/**
 * لوحُ القنوات يقرأ صفَّ الإذن لا كلمةَ الحال (D-159).
 */
import { describe, expect, it } from 'vitest'
import { callbackStep, SETUP, tokenHealth, viewChannels, type LinkedAccount } from '../../lib/channels'
import { channelsSection, setupPane, tokenDays } from './channels'
import { pathArrows } from './parts'
import type { AppStatus } from '../../lib/oauth/apps'

const now = new Date('2026-09-27T12:00:00Z')
const acc = (over: Partial<LinkedAccount>): LinkedAccount => ({
  id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
  createdAt: '2026-09-01 00:00:00', expiresAt: '2026-11-01 00:00:00', ...over,
})

describe('حسابٌ مربوطٌ بلا صفّ tokens', () => {
  it('يُعرَض «مربوطة بلا إذن» ويدخل «ما ينتظرك الآن» بزرّ «أعد الربط»', () => {
    const html = channelsSection(viewChannels([acc({ expiresAt: null })], () => true), now)
    expect(html).toContain('مربوطة بلا إذن')
    expect(html).toContain('بلا إذنٍ محفوظ')
    expect(html).toContain('ما ينتظرك الآن')
    expect(html).toContain('أعد ربط LinkedIn')
    expect(html).not.toContain('اربط حسابا آخر')
  })

  it('وبصفٍّ صالحٍ يبقى «مربوطة» ولا ينتظر شيءٌ منه', () => {
    const html = channelsSection(viewChannels([acc({})], () => true), now)
    expect(html).toContain('>مربوطة<')
    expect(html).not.toContain('مربوطة بلا إذن')
    // ‏وما ينتظر هو المنصّاتُ الجاهزةُ للربط وحدها (ر-1) — لا LinkedIn
    const todo = html.slice(html.indexOf('ما ينتظرك الآن'), html.indexOf('</ul>', html.indexOf('ما ينتظرك الآن')))
    expect(todo).not.toContain('<b>LinkedIn</b>')
    expect(html).toContain('اربط حسابا آخر')
  })

  it('والحسابُ الذي يحتاج تجديدًا لا يُعَدّ مرّتين', () => {
    const html = channelsSection(viewChannels([acc({ status: 'needs_reauth', expiresAt: null })], () => true), now)
    expect(html).toContain('تحتاج تجديدا')
    expect(html).not.toContain('مربوطة بلا إذن')
    expect((html.match(/ما ينتظرك الآن/g) ?? []).length).toBe(1)
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
    const chip = tokenDays(x.expiresAt, now, x)
    expect(chip).toContain('يتجدّد تلقائيًّا')
    expect(chip).not.toContain('st warn')
    // ‏وX بلا موعدٍ لإذن تجديده: يتجدّد كذلك
    expect(tokenHealth({ ...x, refreshExpiresAt: null }, now)).toEqual({ kind: 'auto', days: null, at: null })
  })

  it('والبطاقةُ والبلاطةُ لا تتعارضان: لا تحذيرَ تحت «تحتاج تجديدا 0»', () => {
    const html = channelsSection(viewChannels([x], () => true), now)
    expect(html).not.toContain('ينتهي الإذن اليوم')
    expect(html).toContain('يتجدّد تلقائيًّا')
    expect(html).toMatch(/تحتاج تجديدا<\/div>\s*<div class="v">0</)
  })

  it('والتحذيرُ حين يقترب موعدُ إذن التجديد — والبلاطةُ تعدّه', () => {
    const near = { ...x, refreshExpiresAt: '2026-09-30 12:00:00' }
    expect(tokenHealth(near, now)).toMatchObject({ kind: 'soon', days: 3 })
    const html = channelsSection(viewChannels([near], () => true), now)
    expect(html).toContain('يبقى 3 أيّام للإذن')
    expect(html).toMatch(/تحتاج تجديدا<\/div>\s*<div class="v">1</)
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

describe('«ما ينتظرك الآن» يفتح الضبطَ ويبقي الجاهزةَ للربط', () => {
  it('الناقصةُ سرّيها: «اضبط Instagram» إلى حقل المعرّف في الإعداد، لا «اعرضها»', () => {
    const html = channelsSection(viewChannels([], () => false), now)
    expect(html).toContain('<a class="btn g sm" href="/panel/channels/instagram?tab=setup#ci-instagram">اضبط Instagram</a>')
    // ‏وزرُّ البطاقة إلى الموضع نفسِه باسمه
    expect(html).toContain('<a class="btn p sm" href="/panel/channels/instagram?tab=setup#ci-instagram">اضبط Instagram</a>')
    expect(html).not.toContain('اعرضها')
    expect(html).not.toContain('اضبط سرّيه')
  })

  it('والجاهزةُ للربط تبقى فيها بزرٍّ أوّليٍّ «اربط TikTok»', () => {
    const html = channelsSection(viewChannels([], (n) => n.startsWith('TIKTOK')), now)
    const todo = html.slice(html.indexOf('ما ينتظرك الآن'), html.indexOf('</ul>', html.indexOf('ما ينتظرك الآن')))
    expect(todo).toContain('<b>TikTok</b>')
    expect(todo).toContain('<a class="btn p sm" href="/oauth/tiktok/start">اربط TikTok</a>')
  })
})

describe('دليلُ الضبط', () => {
  const app = (platform: string, over: Partial<AppStatus> = {}): AppStatus => ({
    platform: platform as AppStatus['platform'], source: 'none', clientId: null, hint: null,
    updatedAt: null, updatedBy: null, secretNames: ['A', 'B'], verifiedAt: null, verifiedKind: null, ...over,
  })
  const pane = (platform: string, over: Partial<AppStatus> = {}, accounts: LinkedAccount[] = []): string =>
    setupPane(viewChannels(accounts, () => false).find((v) => v.spec.id === platform)!, app(platform, over), 'https://sada2.basserh.com')

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
    expect(pane('tiktok', { source: 'vault', clientId: 'k', hint: '••' })).toMatch(/<details class="guide" open>/)
    expect(pane('tiktok', { source: 'vault', clientId: 'k', hint: '••', verifiedKind: 'accepted' })).not.toMatch(/<details class="guide" open>/)
    expect(pane('tiktok', { source: 'vault', clientId: 'k', hint: '••', verifiedKind: 'bad_secret' },
      [acc({ platform: 'tiktok' })])).toMatch(/<details class="guide" open>/)
    expect(pane('tiktok', { source: 'vault', clientId: 'k', hint: '••' }, [acc({ platform: 'tiktok' })])).not.toMatch(/<details class="guide" open>/)
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
