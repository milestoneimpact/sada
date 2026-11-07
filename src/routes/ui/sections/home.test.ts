/** القمعُ وشريطُ الأسبوع في الرسم (D-194). */
import { describe, expect, it } from 'vitest'
import { activityCard, homeTop } from './home'
import { setupHref, viewChannels } from '../../../lib/channels'
import type { HomeFacts } from '../../../lib/home'

const NOW = new Date('2026-10-04T12:00:00Z')
const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  channels: viewChannels([], () => true), counts: { perPlatform: {}, publishedWeek: 0 }, paused: false,
  sources: { total: 2, analyzed: 2 }, withoutImage: 0, withImage: 0, openSuggestions: 0,
  firsts: { waiting: null, unscheduled: null, withoutImage: null }, pulses: [], blocker: null, zone: null, ...over,
})

describe('لوحة القيادة (D-194)', () => {
  it('القمع سبع محطّات بأشرطة نسبتُها إلى أكبرها', () => {
    const html = homeTop(facts({ sources: { total: 4, analyzed: 4 } }), NOW)
    expect(html.match(/class="fn-bar"/g)).toHaveLength(7)
    expect(html).toContain('style="--w:100%"')
  })
  it('شريط الأسبوع سبعة أيّام أوّلُها «اليوم»، ونقطة لكلّ منشور في يومه بتوقيت المالك', () => {
    const html = homeTop(facts({
      zone: 'Asia/Riyadh',
      scheduled: [
        { platform: 'linkedin', at: '2026-10-04 20:00:00' },
        { platform: 'x', at: '2026-10-04 22:30:00' }, // ‏01:30 بتوقيت الرياض: الغد لا اليوم
        { platform: 'x', at: '2026-09-30 10:00:00' }, // ‏مضى: لا يُعدّ
      ],
    }), NOW)
    const wk = html.slice(html.indexOf('<ol class="wk">'), html.indexOf('</ol>', html.indexOf('<ol class="wk">')))
    expect(wk.match(/<li/g)).toHaveLength(7)
    expect(wk).toContain('<li data-today><span class="wk-d">اليوم</span>')
    const days = wk.split('<li').slice(1)
    expect(days[0]).toContain('data-pf="linkedin"')
    expect(days[0]).not.toContain('data-pf="x"')
    expect(days[1]).toContain('data-pf="x"')
    expect(html).toContain('مجدول 2')
  })
  it('وأسبوع فارغ يقول ما يفعله المالك', () => {
    expect(homeTop(facts(), NOW)).toContain('لا شيء مجدول في الأيّام السبعة')
  })
  it('التحيّة بساعة المالك، والأرقام الأربعة من العدّ المجمَّع (D-265)', () => {
    const html = homeTop(facts({ zone: 'Asia/Riyadh', counts: { perPlatform: {
      x: { draft: 3, approved: 0, queued: 2, published: 5, failed: 1, recentFailed: 1, nextAt: null } }, publishedWeek: 4 } }), NOW)
    expect(html).toContain('<p class="hello">نهارك سعيد</p>')
    expect(html.match(/class="hs-n num">(\d+)</g)!.map((m) => m.replace(/\D/g, ''))).toEqual(['3', '2', '4', '1'])
  })
  it('أعمدة الأيّام من تواريخ الكتابة الحقيقيّة، وبلا شيء رسمٌ فارغ لا أعمدة مسطّحة', () => {
    // ‏والبطاقةُ في «الكلفة وما وقع» المطويّة منذ D-309، لا في رأس الرئيسيّة
    expect(homeTop(facts(), NOW)).not.toContain('ما كُتب في أسبوعين')
    expect(activityCard(facts(), NOW)).toContain('لا منشورات في أسبوعين')
    const html = activityCard(facts({ written: ['2026-10-04 08:00:00', '2026-10-04 09:00:00', '2026-10-01 09:00:00'] }), NOW)
    expect(html.match(/class="db-bar/g)).toHaveLength(14)
    // ‏وعددُ اليوم مكتوبٌ فوق عموده (آخرُ الصفّ) لا في «<title>» يظهر بالفأرة وحدها (مراجعة D-323)، ويقرؤه قارئُ الشاشة من الجدول
    expect(html).not.toContain('<title>')
    expect(html).toMatch(/<li><span style="[^"]*">2<\/span><\/li><\/ol>/)
    expect(html).toContain('<th scope="row">اليوم</th><td>2</td>')
    expect(html).toContain('والمجموع 3')
    expect(html).toContain('<div class="vh"><table>')
  })
})

describe('«يُنشر اليوم» (D-267 · EASE د)', () => {
  it('ما يخرج قبل منتصف ليل المالك، بساعته ومنصّته ومرتّبًا', () => {
    const html = homeTop(facts({
      zone: 'Asia/Riyadh',
      scheduled: [
        { platform: 'x', at: '2026-10-04 18:00:00' },
        { platform: 'linkedin', at: '2026-10-04 14:00:00' },
        { platform: 'x', at: '2026-10-04 22:30:00' }, // ‏01:30 بتوقيت الرياض: الغد
      ],
    }), NOW)
    const td = html.slice(html.indexOf('<ol class="td-list">'), html.indexOf('</ol>', html.indexOf('<ol class="td-list">')))
    expect(td.match(/<li>/g)).toHaveLength(2)
    expect(td.indexOf('LinkedIn')).toBeLessThan(td.indexOf('X'))
  })
  it('ويومٌ فارغٌ يقول ذلك', () => {
    expect(homeTop(facts(), NOW)).toContain('لا شيء يُنشر اليوم.')
  })
})

describe('قائمةُ البدء في الرئيسيّة (D-326 · خطّة التصميم 5.5)', () => {
  const zero = (over: Partial<HomeFacts> = {}): HomeFacts => facts({ channels: viewChannels([], () => false), sources: { total: 0, analyzed: 0 }, ...over })
  it('رئيسيّةٌ خالية: «1 من 3»، والخطوةُ الأولى روابطُ إلى مساعد ضبط كلّ منصّةٍ مبنيّة عند حقل معرّفها', () => {
    const html = homeTop(zero(), NOW)
    expect(html).toContain('id="first-run"')
    expect(html).toMatch(/data-fr-count>الخطوة 1 من 3</)
    expect(html).toContain('<progress max="3" value="0"')
    for (const p of ['linkedin', 'x', 'instagram']) expect(html).toContain(`href="${setupHref(p)}"`)
    // ‏والخطوةُ التالية تبقى أوّلَ الرئيسيّة بزرّها الأوّليّ الواحد، والقائمةُ بعدها بلا زرٍّ أوّليّ
    expect(html.indexOf('خطوتُك التالية')).toBeLessThan(html.indexOf('id="first-run"'))
    const list = html.slice(html.indexOf('id="first-run"'), html.indexOf('</ol>', html.indexOf('id="first-run"')))
    expect(list).not.toContain('btn-primary')
  })
  it('والمؤشّراتُ مخفيّةٌ حتّى تتوفّر بيانات: لا أرقامَ أربعة ولا قمعَ ولا أسبوعَ فارغًا', () => {
    const html = homeTop(zero(), NOW)
    expect(html).not.toContain('class="hstats"')
    expect(html).not.toContain('class="funnel"')
    expect(html).not.toContain('هذا الأسبوع')
  })
  it('منصّةٌ ضُبط تطبيقُها تُربط من القائمة مباشرةً', () => {
    expect(homeTop(zero({ channels: viewChannels([], (n) => n.startsWith('TIKTOK')) }), NOW)).toContain('href="/oauth/tiktok/start"')
  })
  it('حسابٌ مربوطٌ ولا مادّة: «2 من 3» وبابُ الفكرة', () => {
    const linked = viewChannels([{ id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
      createdAt: '2026-09-01 00:00:00', expiresAt: '2026-11-01 00:00:00' }], () => true)
    const html = homeTop(facts({ channels: linked, sources: { total: 0, analyzed: 0 } }), NOW)
    expect(html).toMatch(/data-fr-count>الخطوة 2 من 3</)
    expect(html).toContain('href="/panel#idea"')
  })
  /*
   * ‏**العدّادُ يقول الخطوةَ لا عددَ ما تمّ** (مراجعة D-326): كان «3 من 3» والشريطُ ثلثان وما زالت خطوةٌ باقية — و«3 من 3» تُقرأ
   * ‏«اكتملت». فالنصُّ «الخطوة 3 من 3» والشريطُ ما تمّ (2)، ولا يتناقضان.
   */
  it('حسابٌ ومسوّدةٌ تنتظر ولم يُعتمَد شيء (اليومُ الأوّل): «الخطوة 3 من 3» والشريطُ 2 — لا «3 من 3» وكأنّها اكتملت', () => {
    const linked = viewChannels([{ id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
      createdAt: '2026-09-01 00:00:00', expiresAt: '2026-11-01 00:00:00' }], () => true)
    const html = homeTop(facts({ channels: linked, sources: { total: 0, analyzed: 0 },
      counts: { perPlatform: { linkedin: { draft: 2, approved: 0, queued: 0, published: 0, failed: 0, nextAt: null } }, publishedWeek: 0 } }), NOW)
    expect(html).toMatch(/data-fr-count>الخطوة 3 من 3</)
    expect(html).toContain('<progress max="3" value="2"')
  })
  it('ومن نشر مرّةً لا يرى القائمة', () => {
    const html = homeTop(facts({ counts: { perPlatform: { x: { draft: 0, approved: 0, queued: 0, published: 1, failed: 0, nextAt: null } }, publishedWeek: 1 } }), NOW)
    expect(html).not.toContain('id="first-run"')
  })
})

describe('بابُ الكتابة في سطر التحيّة (D-326 · «أنشئ من كلّ مكان»)', () => {
  it('ما يُمرَّر بابًا يُرسَم في سطر التحيّة نفسِه، قبل «خطوتُك التالية»', () => {
    const html = homeTop(facts(), NOW, '', '', '<details data-home-new></details>')
    const hello = html.indexOf('class="hello')
    expect(html.indexOf('data-home-new')).toBeGreaterThan(hello)
    expect(html.indexOf('data-home-new')).toBeLessThan(html.indexOf('خطوتُك التالية'))
  })
  it('وكذلك حين تكون التحيّةُ سطرًا وحدَها (الشريطُ يقول المنصّةَ المنقطعة)', () => {
    const html = homeTop(facts({ channels: viewChannels([{ id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'needs_reauth',
      createdAt: '2026-09-01 00:00:00', expiresAt: null }], () => true) }), NOW, '', '', '<details data-home-new></details>')
    expect(html).toContain('home-hello')
    expect(html).toContain('data-home-new')
  })
})
