import { describe, expect, it } from 'vitest'
import { kb, money, moneyDigits, parseSqliteUtc, relativeTime, attemptsLeft, shortAgo, untilTime } from './format'

const NOW = new Date('2026-09-05T12:00:00Z')

/** يبني طابعا بصيغة SQLite قبل `NOW` بمقدارٍ معلوم. */
function ago(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

describe('parseSqliteUtc', () => {
  it('يقرأ صيغة SQLite كـ UTC لا كتوقيت محلّي', () => {
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
    [300, 'قبل 5 دقائق'],
    [3600, 'قبل ساعة'],
    [7200, 'قبل ساعتين'],
    [3600 * 5, 'قبل 5 ساعات'],
    [86400, 'أمس'],
    [86400 * 2, 'قبل يومين'],
    [86400 * 4, 'قبل 4 أيّام'],
    [86400 * 10, 'قبل 10 أيّام'],
    [86400 * 11, 'قبل 11 يومًا'],
    [86400 * 15, 'قبل 15 يومًا'],
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

  it('طابع فاسد يُعاد كما هو لا يُسقط الصفحة', () => {
    expect(relativeTime('ليس تاريخا', NOW)).toBe('ليس تاريخا')
  })

  it('تاريخ في المستقبل لا يعطي رقما سالبا', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString().replace('T', ' ').slice(0, 19)
    expect(relativeTime(future, NOW)).toBe('الآن')
  })
})

describe('money — دقّة تناسب الحجم', () => {
  it.each([
    [0, '0.00$'],
    [0.0004231, '0.0004$'],
    [0.42, '0.420$'],
    [12.5, '12.50$'],
  ])('%d → %s', (value, expected) => {
    expect(moneyDigits(value)).toBe(expected)
    expect(money(value)).toBe(`\u2066${expected}\u2069`)
  })

  it('لا يُفقِد كسرا صغيرا بالتقريب — وهو حال أوّل نداء', () => {
    expect(moneyDigits(0.0004231)).not.toBe('0.00$')
  })
})

describe('kb — معادلة واحدة للحجم (D-158)', () => {
  it('يقرّب إلى أقرب كيلوبايت', () => {
    expect(kb(25_500)).toBe('25KB')
    expect(kb(1_536)).toBe('2KB')
    expect(kb(0)).toBe('0KB')
  })
})

describe('attemptsLeft', () => {
  it('تفرد وتثنّي وتجمع: لا «بقيت 1 محاولات»', () => {
    expect(attemptsLeft(0)).toBe('لم تبق محاولات')
    expect(attemptsLeft(1)).toBe('بقيت محاولة واحدة')
    expect(attemptsLeft(2)).toBe('بقيت محاولتان')
    expect(attemptsLeft(3)).toBe('بقيت 3 محاولات')
    expect(attemptsLeft(10)).toBe('بقيت 10 محاولات')
    expect(attemptsLeft(11)).toBe('بقيت 11 محاولة')
  })
})

describe('untilTime و shortAgo (D-172)', () => {
  const now = new Date('2026-09-06T12:00:00Z')
  it('ما بقي حتّى موعد', () => {
    expect(untilTime('2026-09-06 14:00:00', now)).toBe('بعد ساعتين')
    expect(untilTime('2026-09-07 13:00:00', now)).toBe('غدًا')
    expect(untilTime('2026-09-09 13:00:00', now)).toBe('بعد 3 أيّام')
    expect(untilTime('2026-09-06 11:00:00', now)).toBe('الآن')
  })
  it('والوقت القصير داخل الإطار', () => {
    expect(shortAgo('2026-09-06 11:55:00', now)).toBe('5 د')
    expect(shortAgo('2026-09-06 09:00:00', now)).toBe('3 س')
    expect(shortAgo('2026-09-04 12:00:00', now)).toBe('2 ي')
    expect(shortAgo('2026-08-20 12:00:00', now)).toBe('20 أغسطس')
  })
})

describe('المدّة بأكبر وحدة تصدق (D-194)', () => {
  it('دقائق ثمّ ساعات ثمّ أيّام — لا «48599 دقيقة»', async () => {
    const { duration } = await import('./format')
    expect(duration(48599 * 60)).toBe('34 يومًا')
    expect(duration(120 * 60)).toBe('ساعتَين')
    expect(duration(5 * 60)).toBe('5 دقائق')
    expect(duration(30)).toBe('دقيقةً واحدة')
  })
})
