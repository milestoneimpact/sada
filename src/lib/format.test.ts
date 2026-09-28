import { describe, expect, it } from 'vitest'
import { kb, money, parseSqliteUtc, relativeTime } from './format'

const NOW = new Date('2026-09-05T12:00:00Z')

/** يبني طابعا بصيغة SQLite قبل `NOW` بمقدارٍ معلوم. */
function ago(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

describe('parseSqliteUtc', () => {
  it('يقرأ صيغة SQLite كـ UTC لا كتوقيتٍ محلّي', () => {
    const date = parseSqliteUtc('2026-09-05 08:12:44')
    expect(date?.toISOString()).toBe('2026-09-05T08:12:44.000Z')
  })

  it('يقرأ ISO أيضا', () => {
    expect(parseSqliteUtc('2026-09-05T08:12:44Z')?.getUTCHours()).toBe(8)
  })

  it('يعيد null لما ليس تاريخا', () => {
    expect(parseSqliteUtc('ليس تاريخا')).toBeNull()
  })
})

describe('relativeTime — بمثنّى عربيّ صحيح', () => {
  it.each([
    [30, 'الآن'],
    [60, 'قبل دقيقة'],
    [120, 'قبل دقيقتين'],
    [300, 'قبل 5 دقيقة'],
    [3600, 'قبل ساعة'],
    [7200, 'قبل ساعتين'],
    [3600 * 5, 'قبل 5 ساعة'],
    [86400, 'أمس'],
    [86400 * 2, 'قبل يومين'],
    [86400 * 4, 'قبل 4 أيام'],
    [86400 * 15, 'قبل 15 يوما'],
    [86400 * 45, 'قبل شهر'],
    [86400 * 70, 'قبل شهرين'],
    [86400 * 400, 'قبل أكثر من سنة'],
  ])('قبل %i ثانية → %s', (seconds, expected) => {
    expect(relativeTime(ago(seconds), NOW)).toBe(expected)
  })

  it('لا يقول «قبل ٢ ساعة» — المثنّى ليس جمعا', () => {
    expect(relativeTime(ago(7200), NOW)).not.toContain('2 ساعة')
    expect(relativeTime(ago(120), NOW)).not.toContain('2 دقيقة')
  })

  it('طابعٌ فاسد يُعاد كما هو لا يُسقط الصفحة', () => {
    expect(relativeTime('ليس تاريخا', NOW)).toBe('ليس تاريخا')
  })

  it('تاريخٌ في المستقبل لا يعطي رقما سالبا', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString().replace('T', ' ').slice(0, 19)
    expect(relativeTime(future, NOW)).toBe('الآن')
  })
})

describe('money — دقّةٌ تناسب الحجم', () => {
  it.each([
    [0, '0.00$'],
    [0.0004231, '0.0004$'],
    [0.42, '0.420$'],
    [12.5, '12.50$'],
  ])('%d → %s', (value, expected) => {
    expect(money(value)).toBe(expected)
  })

  it('لا يُفقِد كسرا صغيرا بالتقريب — وهو حال أوّل نداء', () => {
    expect(money(0.0004231)).not.toBe('0.00$')
  })
})

describe('kb — معادلةٌ واحدةٌ للحجم (D-158)', () => {
  it('يقرّب إلى أقرب كيلوبايت', () => {
    expect(kb(25_500)).toBe('25KB')
    expect(kb(1_536)).toBe('2KB')
    expect(kb(0)).toBe('0KB')
  })
})
