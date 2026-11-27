/** القمعُ وشريطُ الأسبوع في الرسم (D-194). */
import { describe, expect, it } from 'vitest'
import { activityCard, homeTop, planCard } from './home'
import { setupHref, viewChannels } from '../../../lib/channels'
import type { HomeFacts } from '../../../lib/home'

const NOW = new Date('2026-10-04T12:00:00Z')
const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  channels: viewChannels([], () => true), counts: { perPlatform: {}, publishedWeek: 0 }, paused: false,
  sources: { total: 2, analyzed: 2 }, withoutImage: 0, withImage: 0, openSuggestions: 0,
  firsts: { waiting: null, unscheduled: null, withoutImage: null }, pulses: [], blocker: null, zone: null, ...over,
})

describe('لوحة القيادة (D-194)', () => {
  it('رحلةُ المنشور سبعُ مراحلَ على خطٍّ عموديّ، لكلٍّ دائرةُ حالٍ واسمٌ وعدد — بلا أشرطة (D-381 · SPEC-v1 §6.1)', () => {
    const html = homeTop(facts({ sources: { total: 4, analyzed: 4 } }), NOW)
    const ol = html.slice(html.indexOf('<ol class="jsteps">'), html.indexOf('</ol>', html.indexOf('<ol class="jsteps">')))
    expect(ol.match(/class="js-dot"/g)).toHaveLength(7)
    expect(ol.match(/class="js-n num"/g)).toHaveLength(7)
    expect(html).not.toContain('fn-bar')
    expect(html).not.toContain('--w:')
    // ‏ومرحلةٌ «تامّة» لم يمرّ بها شيء لا تلبس «تامّة»
    for (const li of ol.split('<li').slice(1)) {
      if (/class="js-n num">0</.test(li)) expect(li).not.toContain('data-state="done"')
    }
    // ‏والرحلةُ في العمود الأضيق بعد الأسبوع
    expect(html.indexOf('class="home-main"')).toBeLessThan(html.indexOf('<ol class="jsteps">'))
    expect(html.indexOf('<ol class="wk">')).toBeLessThan(html.indexOf('<ol class="jsteps">'))
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
    const wk = html.slice(html.indexOf('<ol class="wk">'), html.indexOf('class="hint wk-hint"'))
    const days = wk.split(/<li(?=[ >])(?! class)/).slice(1).filter((x) => !x.startsWith('><bdi'))
    expect(days).toHaveLength(7)
    expect(wk).toContain('<li data-today><details class="wk-day" name="wk"><summary><span class="wk-d">اليوم</span>')
    expect(days[0]).toContain('data-pf="linkedin"')
    expect(days[0]).not.toContain('data-pf="x"')
    expect(days[1]).toContain('data-pf="x"')
    expect(html).toContain('مجدول 2')
    // ‏ويومٌ فيه منشوراتٌ يُفتح بقائمته (D-381)، واليومُ منها في خانته المميَّزة — لا صندوقَ «يُنشر اليوم» ثانيًا تحته (§6.1.5)
    expect(days[1]).toContain('<details class="wk-day" name="wk"><summary>')
    expect(days[0]).toContain('<ol class="td-list wk-pop">')
    expect(days[0]).toContain('LinkedIn')
    expect(html).not.toContain('يُنشر اليوم')
  })
  it('وأسبوع فارغ يقول ما يفعله المالك', () => {
    expect(homeTop(facts(), NOW)).toContain('لا شيء مجدول في الأيّام السبعة')
  })
  it('التحيّة بساعة المالك، والأرقام الأربعة من العدّ المجمَّع (D-265)', () => {
    const html = homeTop(facts({ zone: 'Asia/Riyadh', counts: { perPlatform: {
      x: { draft: 3, approved: 0, queued: 2, published: 5, failed: 1, recentFailed: 1, nextAt: null } }, publishedWeek: 4 } }), NOW)
    // ‏‏D-355: التحيّةُ في رأس الرئيسيّة
    expect(html).toContain('<p class="hello m-0">نهارك سعيد</p>')
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
    // ‏في خانة اليوم المميَّزة (§6.1.5): أوّلُ قائمةٍ في الشريط
    const td = html.slice(html.indexOf('<ol class="td-list wk-pop">'), html.indexOf('</ol>', html.indexOf('<ol class="td-list wk-pop">')))
    expect(td.match(/<li>/g)).toHaveLength(2)
    expect(td.indexOf('LinkedIn')).toBeLessThan(td.indexOf('X'))
  })
  it('ويومٌ فارغٌ يقول ذلك', () => {
    const html = homeTop(facts(), NOW)
    const today = html.slice(html.indexOf('<li data-today>'), html.indexOf('</li>', html.indexOf('<li data-today>')))
    expect(today).toContain('aria-label="لا منشور"')
    expect(today).not.toContain('<details')
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
    expect(html).not.toContain('class="jsteps"')
    expect(html).not.toContain('هذا الأسبوع')
    expect(html).not.toContain('hello-status')
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
    // ‏والتنبيهُ أعلى الصفحة يقولها بزرّه (§4.4)، فلا صفَّ «خطوتُك التالية» لها في «ما ينتظرك»
    expect(html).not.toContain('class="todo-next"')
    expect(html).not.toContain('href="/oauth/linkedin/start"')
    expect(html).toContain('data-home-new')
  })
  it('سطرُ حالٍ واحد تحت التحيّة، ثمّ «ما ينتظرك» أوّلَ البطاقات، وخطوتُك التالية أوّلُ صفوفها بزرٍّ أوّليٍّ واحد (D-381)', () => {
    const html = homeTop(facts({ counts: { perPlatform: { x: { draft: 2, approved: 0, queued: 0, published: 1, failed: 0, nextAt: null } }, publishedWeek: 1 } }), NOW,
      '', '', '', { rows: '<li>بند</li>', tools: '<a class="btn btn-secondary btn-sm" href="#sources">مراجعة المصادر</a>' })
    expect(html).toMatch(/<p class="hello-status m-0"><a href="#desk"><b class="num">2<\/b> بانتظار قرارك<\/a> · <b class="num">0<\/b> مجدولة هذا الأسبوع<\/p>/)
    const box = html.slice(html.indexOf('id="hw-t"'), html.indexOf('class="hstats"'))
    expect(box.indexOf('class="todo-next"')).toBeLessThan(box.indexOf('<li>بند</li>'))
    expect(box.match(/btn-primary/g)).toHaveLength(1)
    expect(box).toContain('مراجعة المصادر')
    expect(html.indexOf('id="hw-t"')).toBeLessThan(html.indexOf('class="hstats"'))
  })
  it('«ينتظر قرارك» قبل «ما ينتظرك» حين ينتظر شيء، والصيانةُ بعد صفّين تحت «و N غيرُها» (D-431)', () => {
    const busy = facts({ counts: { perPlatform: { x: { draft: 2, approved: 0, queued: 0, published: 1, failed: 0, nextAt: null } }, publishedWeek: 1 } })
    const html = homeTop(busy, NOW, '<div class="card desk" id="desk"></div>', '', '', { rows: '<li>أ</li><li>ب</li>', tools: '', rest: ['<li>ج</li>', '<li>د</li>'] })
    expect(html.indexOf('id="desk"')).toBeLessThan(html.indexOf('id="hw-t"'))
    expect(html).toContain('<summary><span>و2 غيرُها</span></summary>')
    expect(html.indexOf('<li>ج</li>')).toBeGreaterThan(html.indexOf('<details class="fold">'))
  })
  it('ومعتمَدةٌ بلا موعدٍ ولا مسوّدة: الطابورُ أوّلًا وسطرُ الحال يعدّها ويربطها (D-432)', () => {
    const none = facts({ counts: { perPlatform: { x: { draft: 0, approved: 2, queued: 0, published: 1, failed: 0, nextAt: null } }, publishedWeek: 1 } })
    const html = homeTop(none, NOW, '<div class="card desk" id="desk"><span class="count" data-desk-n>2</span></div>', '', '', { rows: '<li>أ</li>', tools: '' })
    expect(html.indexOf('id="desk"')).toBeLessThan(html.indexOf('id="hw-t"'))
    expect(html).toContain('<a href="#desk"><b class="num">2</b> بانتظار قرارك</a>')
  })
  it('ولا شيء ينتظر: حالٌ فارغةٌ إيجابيّة لا قائمةٌ خالية', () => {
    const linked = viewChannels([{ id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
      createdAt: '2026-09-01 00:00:00', expiresAt: '2026-12-01 00:00:00' }], () => true)
    const html = homeTop(facts({ channels: linked, counts: { perPlatform: { x: { draft: 0, approved: 0, queued: 0, published: 1, failed: 0, nextAt: null } }, publishedWeek: 1 } }), NOW)
    expect(html).toContain('لا شيء ينتظرك الآن')
    expect(html).not.toContain('class="todo')
  })
  it('والصفرُ في صفّ الأرقام بسطرٍ يقول ما يعنيه', () => {
    const html = homeTop(facts({ counts: { perPlatform: { x: { draft: 0, approved: 0, queued: 0, published: 1, failed: 0, nextAt: null } }, publishedWeek: 1 } }), NOW)
    expect(html.match(/class="hs-z"/g)).toHaveLength(3)
    expect(html).toContain('لا فشل هذا الأسبوع')
  })
})

describe('«خطّةُ أسبوع» انقضى أسبوعُها (D-381 · SPEC-v1 §6.1)', () => {
  const plan = (week: string) => ({ week, span: 'week', version: 1, lockedAt: null,
    plan: { items: [{ day: week, time: '09:00', platform: 'x', angle: 'زاوية' }] } }) as never
  it('وسمُ «خطّة منتهية» وزرٌّ أوّليٌّ واحد إلى بناء خطّة الأسبوع الحاليّ، بلا «تابع الكتابة» ولا أقربِ منشوراتٍ مضت', () => {
    const html = planCard(plan('2026-09-20'), { written: 0, ready: 0, pending: 0 }, NOW, null)
    expect(html).toContain('<span class="st warn">خطّة منتهية</span>')
    // ‏ومن الباب الواحد (D-387)
    expect(html).toContain('<a class="btn btn-primary" href="/panel/new">أنشئ خطّة الأسبوع الحاليّ</a>')
    expect(html).not.toContain('تابع الكتابة')
    expect(html).not.toContain('class="hp-next"')
    expect(html.match(/btn-primary/g)).toHaveLength(1)
    expect(html).toContain('<b>0</b> من 1 معتمَدة')
  })
  it('وخطّةُ الأسبوع الجاري بلا وسم، وزرُّها يتبع حالَها', () => {
    const html = planCard(plan('2026-10-04'), { written: 0, ready: 0, pending: 0 }, NOW, null)
    expect(html).not.toContain('خطّة منتهية')
    expect(html).toContain('تابع الكتابة')
  })
})
