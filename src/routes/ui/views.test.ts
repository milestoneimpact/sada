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
import type { DraftRow } from '../../lib/draft/store'

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
    expect(html).toContain('<th scope="row">LinkedIn</th>')
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
    accountName: null, dispatchedAt: null, publishCost: 0,
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
      phase: null, gates: [],
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

  it('واسمُ المزوّد يأخذ سطرَه في الجوّال، والعلامةُ في الشريط هناك وحدَه', () => {
    expect(STYLE).toContain('.prow .pn{flex:1 1 100%}')
    expect(STYLE).toContain('.topbar .glyph.tb{display:none')
    expect(STYLE).toContain('.topbar .glyph.tb{display:grid}')
  })
})

describe('صفحةُ الدخول تقول ما تطلب بالعربيّة', () => {
  it('اللصيقةُ «رمزُ الإدارة» واسمُ السرّ بجانبها', () => {
    const html = loginPage({}, 'n')
    expect(html).toContain('رمزُ الإدارة <span class="mono">ADMIN_TOKEN</span>')
  })
})
