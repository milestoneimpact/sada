import { describe, expect, it } from 'vitest'
import { DESK_CHARS, deskQueue, deskText } from './desk'
import { defaultTarget, draftsSection } from './drafts'
import { planCard } from './home'
import { daysAr, monthJourney } from '../../../lib/plan/month'
import { expiredText, relinkHref, RELINK } from '../../../lib/notices'
import { noticesScreen } from '../noticesView'
import type { DraftRow } from '../../../lib/draft/store'

const NOW = new Date('2026-10-15T12:00:00Z')
const row = (id: string, status: string, accountName: string | null = null): DraftRow =>
  ({ id, status, platform: 'linkedin', accountName, text: `نصّ ${id}`, createdAt: '2026-10-15 09:00:00', scheduledAt: null }) as unknown as DraftRow
const PERSON = { id: 'a1', platform: 'linkedin' as const, label: 'عمر · LinkedIn' }
const PAGE = { id: 'a2', platform: 'linkedin' as const, label: 'بصائر · LinkedIn', page: true }
const NONE = { dots: [], next: null, blocked: false } as never

describe('D-440 · الرئيسيّة والمسوّدات والتنبيهات', () => {
  it('«اعتمد» في الرئيسيّة يجدول حين يكون بجوار الشخصيّ صفحة، والوجهةُ ظاهرة', () => {
    const html = deskQueue([row('w', 'draft')], NOW, [PERSON, PAGE], [])
    expect(html).toContain('value="approve-schedule"')
    expect(html).toContain('name="account" value="a1"')
    expect(html).toMatch(/اعتمد · غدًا 9:00 ص<\/button><span class="ago">على <bdi>عمر · LinkedIn<\/bdi><\/span>/)
  })

  it('الحسابُ المسمّى للمسوّدة يغلب، وحسابان شخصيّان بديلان لا افتراض بينهما', () => {
    expect(defaultTarget(row('w', 'draft', 'بصائر'), [PERSON, PAGE])?.id).toBe('a2')
    const peers = [PERSON, { id: 'a3', platform: 'linkedin' as const, label: 'سارة · LinkedIn' }]
    expect(defaultTarget(row('w', 'draft'), peers)).toBeNull()
    expect(defaultTarget(row('w', 'draft'), [{ ...PERSON, platform: 'x' as const }])).toBeNull()
  })

  it('البطاقة الفاشلة تقول سببها و«أعد المحاولة» ظاهرين، لا في الطيّة', () => {
    const d = { ...row('f', 'failed'), failure: 'http_500: Internal', model: null, cost: 0, rationale: null, sourceId: null, sourceName: null,
      stale: false, approvedBy: null, approvedAt: null, dispatchedAt: null, publishCost: 0, originalText: null } as unknown as DraftRow
    const html = draftsSection({
      drafts: [d], media: [], targets: [], earliest: '2026-10-16T09:00', writable: [], now: NOW, ready: true,
      pageOnly: [], peaks: {}, mediaReady: { infographic: NONE, image: NONE, video: NONE },
    } as never)
    const card = html.slice(html.indexOf('id="d-f"'))
    const fold = card.indexOf('<details class="draft-more"')
    expect(card.indexOf('أعد المحاولة')).toBeGreaterThan(0)
    expect(card.indexOf('أعد المحاولة')).toBeLessThan(fold)
    expect(card.indexOf('id="s-f"')).toBeLessThan(fold)
    expect(card).not.toContain('سببُه وزرّ إعادته في')
  })

  it('إشعارُ فشل النشر يحمل «أعد النشر» نموذجًا إلى requeue', () => {
    const html = noticesScreen({
      notices: [{ ref: 'publish:p1', kind: 'publish', tone: 'bad', text: 'فشل', href: '/panel/journey/p1', action: 'افتح المنشور',
        at: NOW.toISOString(), form: { action: '/panel/drafts/requeue', id: 'p1', label: 'أعد النشر' } }],
      reads: [], now: NOW,
    })
    expect(html).toMatch(/<form class="inline" method="POST" action="\/panel\/drafts\/requeue"[^>]*><input type="hidden" name="id" value="p1">/)
    expect(html).toContain('أعد النشر')
    expect(html.match(/btn-primary/g)).toHaveLength(1)
  })

  it('إذنٌ انتهى: جملةٌ واحدة وفعلٌ واحد', () => {
    expect(expiredText('X')).toBe('انتهى إذن X — والنشر عليه متوقّف.')
    expect(expiredText('LinkedIn', 'عمر')).toBe('انتهى إذن LinkedIn (عمر) — والنشر عليه متوقّف.')
    expect(RELINK).toBe('أعد الربط')
    expect(relinkHref('x')).toBe('/oauth/x/start')
  })

  it('الأيّامُ بمعدودها، والخطّةُ إلى مجلّدها في Drive لا إلى 01-plan', () => {
    expect([1, 2, 4, 10, 11].map(daysAr)).toEqual(['يوم واحد', 'يومين', '4 أيّام', '10 أيّام', '11 يومًا'])
    const j = monthJourney({ period: '2026-11', hasPlan: false, reviewed: false, items: 0, approved: 0, queued: 0, published: 0, failed: 0 }, '2026-10-28')
    expect(j.alerts[0]).toBe('شهر 2026-11 يبدأ بعد 4 أيّام بلا خطّة، فضع ملفّه في «مجلّد الخطّة في Drive».')
  })

  it('صفُّ القرار يحمل سطرين لا المنشورَ كلَّه', () => {
    const long = 'كلمة '.repeat(100)
    expect(deskText(long).length).toBeLessThanOrEqual(DESK_CHARS + 1)
    expect(deskText(long).endsWith('…')).toBe(true)
    expect(deskText('سطر\n  ثان')).toBe('سطر ثان')
  })

  it('بطاقةُ خطّة الشهر بلا ذكر GitHub', () => {
    expect(planCard(null, undefined, NOW, null)).not.toContain('GitHub')
  })
})
