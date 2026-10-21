/** القمعُ وشريطُ الأسبوع في الرسم (D-194). */
import { describe, expect, it } from 'vitest'
import { homeTop } from './home'
import { viewChannels } from '../../../lib/channels'
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
    expect(homeTop(facts(), NOW)).toContain('لا منشورات في أسبوعين')
    const html = homeTop(facts({ written: ['2026-10-04 08:00:00', '2026-10-04 09:00:00', '2026-10-01 09:00:00'] }), NOW)
    expect(html.match(/class="db-bar/g)).toHaveLength(14)
    expect(html).toContain('<title>اليوم: 2</title>')
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
