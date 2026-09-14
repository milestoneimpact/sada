/**
 * «ما وقع اليوم» (D-127) — **يُروى ممّا في اليد، ولا يُختَرع ولا يُترَك.**
 */
import { describe, expect, it } from 'vitest'
import { todayFeed, TODAY_CAP } from './today'

const now = new Date('2026-09-12T15:00:00Z')

describe('ما وقع اليوم', () => {
  it('يصفّي إلى يوم UTC، ويسمّي المنصّةَ والفعلَ بالاسم لا بالمفتاح', () => {
    const { items, more } = todayFeed({
      now,
      audit: [
        { at: '2026-09-12 09:10:00', action: 'provider.key', target: 'anthropic', detail: null },
        { at: '2026-09-11 23:59:59', action: 'settings.write', target: null, detail: null },
        { at: '2026-09-12 08:00:00', action: 'session.open', target: null, detail: null },
        { at: '2026-09-12 10:00:00', action: 'login.denied', target: null, detail: null },
      ],
      drafts: [
        { status: 'approved', platform: 'linkedin', createdAt: '2026-09-11 08:00:00', approvedAt: '2026-09-12 11:00:00' },
        { status: 'rejected', platform: 'x', createdAt: '2026-09-12 07:00:00', approvedAt: '2026-09-12 07:30:00' },
        { status: 'draft', platform: 'x', createdAt: '2026-09-12 12:00:00', approvedAt: null },
        { status: 'draft', platform: 'x', createdAt: '2026-09-10 12:00:00', approvedAt: null },
      ],
      facts: [
        { day: '2026-09-12', platform: 'linkedin', status: 'published', succeeded: true },
        { day: '2026-09-12', platform: 'x', status: 'failed', succeeded: false },
        { day: '2026-09-11', platform: 'x', status: 'published', succeeded: true },
      ],
    })
    expect(more).toBe(0)
    expect(items.map((x) => x.text)).toEqual([
      'كُتبت مسوّدةٌ لـX تنتظر قرارك',
      'اعتمدتَ مسوّدةً لـLinkedIn',
      'محاولة دخول مرفوضة',
      'تبديل مفتاح — Anthropic',
      'رفضتَ مسوّدةً لـX',
      'نُشر منشورٌ على LinkedIn',
      'فشل النشرُ على X',
    ])
    expect(items.find((x) => x.text.startsWith('فشل'))!.kind).toBe('bad')
    expect(items.find((x) => x.text.startsWith('محاولة'))!.kind).toBe('bad')
    expect(items.find((x) => x.text.startsWith('نُشر'))).toMatchObject({ at: null, kind: 'ok', go: '/panel/channels/linkedin', goLabel: 'شاشةُ LinkedIn' })
    expect(items.some((x) => x.text.includes('جلسة'))).toBe(false)
    expect(JSON.stringify(items)).not.toContain('linkedin»')
  })

  /** ضغطتا «احفظ» على البطاقات سطرٌ واحدٌ بعدده — والمختلفُ لا يُطوى (D-134). */
  it('والفعلُ الواحدُ مرّتين سطرٌ واحدٌ بعدده، ومفتاحُ الإعداد اسمٌ', () => {
    const { items } = todayFeed({
      now,
      audit: [
        { at: '2026-09-12 14:58:00', action: 'settings.write', target: 'dashboard_tiles', detail: null },
        { at: '2026-09-12 14:59:00', action: 'settings.write', target: 'dashboard_tiles', detail: null },
        { at: '2026-09-12 14:59:30', action: 'settings.write', target: 'weekly_promo_cap_usd', detail: null },
        { at: '2026-09-12 14:50:00', action: 'settings.write', target: 'dashboard_tiles', detail: null },
      ],
      drafts: [], facts: [],
    })
    expect(items.map((x) => x.text)).toEqual([
      'تغيير إعداد — سقف الترويج الأسبوعيّ',
      'تغيير إعداد — بطاقات اللوح — 3 مرّات',
    ])
    expect(items[1]!.at).toBe('2026-09-12 14:59:00')
    expect(JSON.stringify(items)).not.toContain('dashboard_tiles')
  })

  it('ويومٌ بلا شيء قائمةٌ فارغة — لا «لا يُعرَف»', () => {
    expect(todayFeed({ now, audit: [], drafts: [], facts: [] })).toEqual({ items: [], more: 0 })
  })

  it('والسقفُ يُقال عددًا لا يُصمَت عنه', () => {
    const audit = Array.from({ length: TODAY_CAP + 5 }, (_, n) => ({
      at: `2026-09-12 0${Math.min(9, n)}:${String(n).padStart(2, '0')}:00`, action: 'settings.write', target: `k${n}`, detail: null,
    }))
    const { items, more } = todayFeed({ now, audit, drafts: [], facts: [] })
    expect(items).toHaveLength(TODAY_CAP)
    expect(more).toBe(5)
  })
})
