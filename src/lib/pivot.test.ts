/**
 * اللوحُ المحوريّ — **ويُختبَر بالحساب لا بالتشغيل**.
 */
import { describe, expect, it } from 'vitest'
import {
  cellText, DIMENSIONS, type Fact, keyLabel, MEASURES, NO_KEY,
  pivot, readCols, readDimension, readMeasure, toCsv,
} from './pivot'

const f = (o: Partial<Fact>): Fact => ({
  platform: 'linkedin', account: 'شخصيّ', status: 'published',
  day: '2026-09-07', type: 'text', attempts: 1, succeeded: true, cost: 0,
  ...o,
})

describe('الجدول', () => {
  it('يجمع بمحورين ويعطي العدد', () => {
    const t = pivot(
      [
        f({ platform: 'linkedin', status: 'published' }),
        f({ platform: 'linkedin', status: 'published' }),
        f({ platform: 'x', status: 'failed', succeeded: false }),
      ],
      { rows: 'platform', cols: 'status', measure: 'count' },
    )
    expect(t.rowKeys).toEqual(['linkedin', 'x'])
    expect(t.colKeys).toEqual(['published', 'failed'])
    expect(t.cells[0]).toEqual([2, null])
    expect(t.cells[1]).toEqual([null, 1])
    expect(t.grand).toBe(3)
  })

  /**
   * **وخليّةٌ خاليةٌ فراغٌ لا صفر.**
   *
   * صفرٌ يقول «قِيس فكان صفرا»، والفراغُ يقول «لا شيءَ هنا». **وخلطُهما
   * يجعل جدولا فارغا يُقرأ فشلا تامّا** — نسبةُ نجاحٍ صفر في خانةٍ لم
   * يُنشَر فيها شيءٌ أصلا.
   */
  it('وخليّةٌ لا صفوفَ فيها تعود null لا صفرا', () => {
    const t = pivot([f({ platform: 'x' })], { rows: 'platform', cols: 'status', measure: 'success_rate' })
    expect(t.cells[0]?.[0]).toBe(100)
    const t2 = pivot([], { rows: 'platform', cols: null, measure: 'count' })
    expect(t2.grand).toBeNull()
    expect(t2.rowKeys).toEqual([])
  })

  /**
   * **ولا يُجمَع متوسّطٌ على متوسّط** — والمجموعُ يُحسَب من الخام.
   *
   * صفٌّ فيه خليّتان: واحدةٌ ‏١٠٠٪ من منشورٍ واحد، وأخرى ‏٠٪ من تسعة.
   * **فالمجموعُ ‏١٠٪ لا ‏٥٠٪** — ومنشورٌ واحدٌ لا يزن كتسعة.
   */
  it('ومجموعُ الصفّ يُحسَب من الخام لا من متوسّطات الخلايا', () => {
    const rows: Fact[] = [
      f({ platform: 'x', status: 'a', succeeded: true }),
      ...Array.from({ length: 9 }, () => f({ platform: 'x', status: 'b', succeeded: false })),
    ]
    const t = pivot(rows, { rows: 'platform', cols: 'status', measure: 'success_rate' })
    expect(t.cells[0]).toEqual([0, 100])
    expect(t.rowTotals[0]).toBe(10)
    expect(t.grand).toBe(10)
  })

  it('وبلا محورٍ ثانٍ يبقى عمودٌ واحد', () => {
    const t = pivot([f({}), f({ platform: 'x' })], { rows: 'platform', cols: null, measure: 'count' })
    expect(t.colKeys).toEqual([''])
    expect(t.cells).toEqual([[1], [1]])
  })

  it('والكلفةُ تُجمَع، والمحاولاتُ تُتوسَّط', () => {
    const rows = [f({ cost: 1.5, attempts: 1 }), f({ cost: 2.25, attempts: 3 })]
    expect(pivot(rows, { rows: 'platform', cols: null, measure: 'cost' }).grand).toBeCloseTo(3.75)
    expect(pivot(rows, { rows: 'platform', cols: null, measure: 'attempts' }).grand).toBe(2)
  })
})

describe('الترتيب', () => {
  it('الزمنُ يصعد', () => {
    const t = pivot(
      [f({ day: '2026-09-09' }), f({ day: '2026-09-01' }), f({ day: '2026-09-05' })],
      { rows: 'day', cols: null, measure: 'count' },
    )
    expect(t.rowKeys).toEqual(['2026-09-01', '2026-09-05', '2026-09-09'])
  })

  /** **وما ليس زمنا ينزل بالحجم**: عينٌ تمسح عمودا تبدأ من أعلاه. */
  it('وما سواه ينزل بالحجم', () => {
    const t = pivot(
      [f({ platform: 'x' }), f({ platform: 'linkedin' }), f({ platform: 'linkedin' })],
      { rows: 'platform', cols: null, measure: 'count' },
    )
    expect(t.rowKeys).toEqual(['linkedin', 'x'])
  })

  /** **و«بلا موعد» تُذيَّل**: حقيقةٌ تُقال ولا تتصدّر. */
  it('و«بلا موعد» آخرُ الصفوف مهما كثرت', () => {
    const t = pivot(
      [f({ day: '' }), f({ day: '' }), f({ day: '' }), f({ day: '2026-09-01' })],
      { rows: 'day', cols: null, measure: 'count' },
    )
    expect(t.rowKeys).toEqual(['2026-09-01', NO_KEY])
  })
})

describe('الأسبوعُ والشهر', () => {
  it('الأسبوعُ يبدأ الاثنين', () => {
    // ‏٢٠٢٦-٠٩-٠٧ اثنين، و‏٢٠٢٦-٠٩-١٣ أحدٌ — فهما أسبوعٌ واحد
    const t = pivot(
      [f({ day: '2026-09-07' }), f({ day: '2026-09-13' }), f({ day: '2026-09-14' })],
      { rows: 'week', cols: null, measure: 'count' },
    )
    expect(t.rowKeys).toHaveLength(2)
    expect(t.cells[0]).toEqual([2])
    expect(t.cells[1]).toEqual([1])
  })

  it('والشهرُ سبعةُ محارف', () => {
    const t = pivot(
      [f({ day: '2026-09-30' }), f({ day: '2026-10-01' })],
      { rows: 'month', cols: null, measure: 'count' },
    )
    expect(t.rowKeys).toEqual(['2026-09', '2026-10'])
  })

  /** وتاريخٌ لا يُقرأ لا يُسقط الجدول — **يُذيَّل بلا مفتاح**. */
  it('وتاريخٌ فاسدٌ لا يُسقط الجدول', () => {
    const t = pivot([f({ day: 'ليس تاريخا' }), f({ day: '2026-09-07' })],
      { rows: 'week', cols: null, measure: 'count' })
    expect(t.rowKeys).toContain(NO_KEY)
    expect(t.grand).toBe(2)
  })
})

describe('ما يأتي من الشبكة', () => {
  it('بُعدٌ لا يُعرَف يعود إلى افتراضه', () => {
    expect(readDimension('platform', 'status')).toBe('platform')
    expect(readDimension('DROP TABLE', 'status')).toBe('status')
    expect(readDimension(undefined, 'day')).toBe('day')
  })

  it('و«none» عمودٌ واحدٌ لا عطل', () => {
    expect(readCols('none')).toBeNull()
    expect(readCols('')).toBeNull()
    expect(readCols('ما لا يُعرَف')).toBeNull()
    expect(readCols('week')).toBe('week')
  })

  it('وقياسٌ لا يُعرَف يعود إلى افتراضه', () => {
    expect(readMeasure('cost', 'count')).toBe('cost')
    expect(readMeasure('؟', 'count')).toBe('count')
  })

  /** **وكلُّ بُعدٍ له لصيقة** — وبُعدٌ يُضاف بلا اسمٍ يُعرَض معرِّفا. */
  it('ولا بُعدَ ولا قياسَ بلا اسمٍ عربيّ', async () => {
    const { DIMENSION_LABEL, MEASURE_LABEL } = await import('./pivot')
    for (const d of DIMENSIONS) expect(DIMENSION_LABEL[d], d).toBeTruthy()
    for (const m of MEASURES) expect(MEASURE_LABEL[m], m).toBeTruthy()
  })
})

describe('نصُّ الخليّة', () => {
  it('الفراغُ فراغٌ لا صفر', () => {
    for (const m of MEASURES) expect(cellText(null, m)).toBe('')
  })

  it('ولكلّ قياسٍ وحدتُه في الخليّة', () => {
    expect(cellText(3, 'count')).toBe('3')
    expect(cellText(66.6, 'success_rate')).toBe('67٪')
    expect(cellText(1.5, 'cost')).toBe('1.50$')
    expect(cellText(0, 'cost')).toBe('0$')
    expect(cellText(2.25, 'attempts')).toBe('2.3')
  })
})

/**
 * **ما يُعرَض يُنزَّل** (D-126): الملفُّ يُقابَل بالجدول خليّةً خليّة، بالأسماء
 * التي تُرسَم لا بالمفاتيح، وبالنصّ الذي يُكتب في الخليّة.
 */
describe('CSV — ما يُعرَض يُنزَّل', () => {
  const facts: Fact[] = [
    f({ platform: 'linkedin', status: 'published', day: '2026-09-01', cost: 0.5 }),
    f({ platform: 'linkedin', status: 'failed', day: '2026-09-02', cost: 0 }),
    f({ platform: 'x', status: 'published', day: '2026-09-02', cost: 0.25 }),
  ]

  it('يطابق الجدولَ خليّةً خليّة، بالأسماء لا بالمفاتيح', () => {
    const spec = { rows: 'platform', cols: 'status', measure: 'count' } as const
    const table = pivot(facts, spec)
    const csv = toCsv(table, spec)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n').map((l) => l.split(','))
    expect(lines[0]).toEqual(['المنصّة', ...table.colKeys.map((c) => keyLabel('status', c)), 'الكلّ'])
    table.rowKeys.forEach((r, i) => {
      expect(lines[i + 1]).toEqual([
        keyLabel('platform', r),
        ...table.cells[i]!.map((v) => cellText(v, 'count')),
        cellText(table.rowTotals[i]!, 'count'),
      ])
    })
    expect(lines[lines.length - 1]).toEqual([
      'الكلّ', ...table.colTotals.map((v) => cellText(v, 'count')), cellText(table.grand, 'count'),
    ])
    expect(csv).not.toContain('published')
    expect(csv).not.toContain('linkedin')
  })

  it('وبلا محورٍ ثانٍ عمودٌ واحدٌ ولا صفَّ مجاميع', () => {
    const spec = { rows: 'platform', cols: null, measure: 'cost' } as const
    const csv = toCsv(pivot(facts, spec), spec)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines[0]).toBe('المنصّة,الكلفة')
    expect(lines).toHaveLength(3)
    expect(lines.some((l) => l.startsWith('الكلّ'))).toBe(false)
  })

  it('والخليّةُ التي تبدأ بصيغةٍ تُعقَّم، وما فيه فاصلٌ يُحاط', () => {
    const spec = { rows: 'account', cols: null, measure: 'count' } as const
    const table = pivot([
      f({ account: '=HYPERLINK("x")' }), f({ account: 'a,b' }), f({ account: '-1' }),
    ], spec)
    const csv = toCsv(table, spec)
    expect(csv).toContain('"\'=HYPERLINK(""x"")"')
    expect(csv).toContain('"a,b"')
    expect(csv).toContain("'-1")
  })
})
