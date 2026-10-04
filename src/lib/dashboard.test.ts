/**
 * لوحُ المالك — **والكتالوجُ يُفحَص كما تُفحَص الشيفرة**.
 */
import { describe, expect, it } from 'vitest'
import {
  chosenTiles, DEFAULT_TILES, normalizeTiles, parseTiles,
  TILE_MAX, TILE_MIN, TILES, type TileSource,
} from './dashboard'

const fmt = { money: (n: number) => `${n.toFixed(2)}$` }

const src: TileSource = {
  paused: false,
  pulses: [],
  autoEnqueue: true,
  slide: { missing: [] },
  analysisCap: 10,
  spendCap: 5,
  usedAnalyses: 6,
  usedSpend: 1.84,
  spendBy: [{ calls: 40, total: 18.2 }, { calls: 6, total: 5.21 }],
  spendMonth: { total: 9.4, utc: false },
  series: [{ day: '09-01', total: 1 }, { day: '09-02', total: 3 }],
  sources: [{ analyzed: true, stale: false }, { analyzed: false, stale: false }],
  providers: [{ configured: true, calls: 40 }, { configured: false, calls: 0 }],
  routing: [{ ready: true, implemented: true }, { ready: false, implemented: true }],
  drafts: [
    { status: 'draft', scheduledAt: null },
    { status: 'approved', scheduledAt: '2026-09-12T09:00:00Z' },
  ],
  targets: [{ platform: 'linkedin' }, { platform: 'x' }],
  outbox: [{ status: 200, error: null }, { status: 500, error: 'ردّت القناة' }],
  alertWebhook: 'https://example.com/hook',
  planReady: false,
}

describe('الكتالوج', () => {
  it('لا معرِّفَ مكرَّر — والمعرِّفُ مفتاحُ التخزين', () => {
    const ids = TILES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  /** **وكلُّ بطاقةٍ تُحسَب بلا رمي**: بطاقةٌ ترمي تُسقط اللوحةَ كلَّها. */
  it('وكلُّ بطاقةٍ تعطي رقما من بياناتٍ حاضرة', () => {
    for (const t of TILES) {
      const v = t.of(src, fmt)
      expect(v.value, t.id).toBeTypeOf('string')
      expect(v.value.length, t.id).toBeGreaterThan(0)
    }
  })

  /**
   * **ولا واحدةَ تسقط على لوحةٍ فارغة.**
   *
   * أوّلُ يومٍ لا مصادرَ فيه ولا مزوّدين ولا سجلَّ إنفاق — **والقسمةُ على
   * صفرٍ تعطي `NaN` فيُعرَض للمالك حرفا**.
   */
  it('ولا بطاقةَ تعطي NaN على لوحةٍ فارغة', () => {
    const empty: TileSource = {
      ...src,
      usedAnalyses: 0, usedSpend: 0, spendBy: [], spendMonth: { total: 0, utc: true },
      series: [], sources: [], providers: [], routing: [],
      drafts: [], targets: [], outbox: [], alertWebhook: '',
    }
    for (const t of TILES) {
      const v = t.of(empty, fmt)
      expect(v.value, t.id).not.toMatch(/NaN|Infinity|undefined/)
      expect(v.note ?? '', t.id).not.toMatch(/NaN|Infinity|undefined/)
    }
  })

  it('والافتراضُ كلُّه من الكتالوج', () => {
    const ids = new Set(TILES.map((t) => t.id))
    for (const id of DEFAULT_TILES) expect(ids.has(id), id).toBe(true)
    expect(DEFAULT_TILES.length).toBeGreaterThanOrEqual(TILE_MIN)
    expect(DEFAULT_TILES.length).toBeLessThanOrEqual(TILE_MAX)
  })
})

describe('قراءةُ الاختيار', () => {
  it('فارغٌ أو غائبٌ يعود إلى الافتراض', () => {
    expect(parseTiles(undefined)).toEqual(DEFAULT_TILES)
    expect(parseTiles('')).toEqual(DEFAULT_TILES)
    expect(parseTiles('   ')).toEqual(DEFAULT_TILES)
  })

  it('ويحفظ الترتيبَ كما اختاره', () => {
    expect(parseTiles('spend_30d,analyses_today,drafts_waiting'))
      .toEqual(['spend_30d', 'analyses_today', 'drafts_waiting'])
  })

  /**
   * **ومعرِّفٌ زال من الكتالوج لا يُسقط الشاشة.**
   *
   * بطاقةٌ تُحذف غدا تترك معرِّفَها عند مالكٍ اختارها. **ولو رُمي لبقي
   * لوحُه أبيضَ حتّى يفتح الإعدادات** — وهو لا يعرف أنّ عليه أن يفتحها.
   */
  it('ومعرِّفٌ لا يعرفه الكتالوجُ يُتخطّى ولا يُسقط ما سواه', () => {
    expect(parseTiles('analyses_today,لا_وجودَ_لها,spend_today'))
      .toEqual(['analyses_today', 'spend_today'])
  })

  it('والمكرَّرُ يُكتب مرّةً', () => {
    expect(parseTiles('spend_today,spend_today,analyses_today'))
      .toEqual(['spend_today', 'analyses_today'])
  })

  /** **وصفٌّ من سبعٍ لا يُقرأ صفّا**: الزائدُ يُقَصّ عند الحدّ. */
  it('وما زاد على الحدّ يُقَصّ', () => {
    const all = TILES.map((t) => t.id).join(',')
    expect(parseTiles(all)).toHaveLength(TILE_MAX)
  })

  /** وما نقص عن الحدّ الأدنى ليس لوحا — فيعود إلى الافتراض. */
  it('وما نقص عن الأدنى يعود إلى الافتراض', () => {
    expect(parseTiles('spend_today')).toEqual(DEFAULT_TILES)
    expect(parseTiles('لا_شيء,ولا_هذه')).toEqual(DEFAULT_TILES)
  })

  /** **والتصفيةُ عند الكتابة هي عينُها عند القراءة** — فلا يُخزَّن ما لا يُقرأ. */
  it('والمخزَّنُ يوافق المقروء', () => {
    const raw = 'spend_today, لا_وجودَ_لها ,spend_today,drafts_waiting'
    expect(normalizeTiles(raw)).toBe('spend_today,drafts_waiting')
    expect(parseTiles(normalizeTiles(raw))).toEqual(parseTiles(raw))
  })
})

describe('البطاقاتُ بأعيانها', () => {
  it('تُردّ مرتَّبةً كما اختارها', () => {
    const got = chosenTiles('drafts_waiting,analyses_today')
    expect(got.map((t) => t.id)).toEqual(['drafts_waiting', 'analyses_today'])
    expect(got[0]?.label).toBe('مسوّدات تنتظرك')
  })

  /** **وواحدةٌ ليست لوحا**: تعود إلى الافتراض لا إلى بطاقةٍ وحيدة. */
  it('وواحدةٌ وحدَها تعود إلى الافتراض', () => {
    expect(chosenTiles('drafts_waiting').map((t) => t.id)).toEqual(DEFAULT_TILES)
  })

  it('ومسوّدةٌ واحدةٌ تنتظر من اثنتين', () => {
    const spec = TILES.find((t) => t.id === 'drafts_waiting')
    expect(spec?.of(src, fmt)).toMatchObject({ value: '1', em: '/ 2' })
  })

  it('وتنبيهٌ ردَّته القناةُ يُعَدّ فاشلا', () => {
    const spec = TILES.find((t) => t.id === 'alerts_out')
    expect(spec?.of(src, fmt)).toMatchObject({ value: '1', em: '/ 2', note: '1 ردَّتها القناة' })
  })

  /**
   * **والمتقادمُ ينتظر وإن حُلِّل** — وهي دلالةُ الشاشة قبل الكتالوج،
   * نُقلت كما هي: `!analyzed || stale`. **ونقلٌ يغيّر المعنى صامتا
   * أسوأُ من نقلٍ يكسر.**
   */
  it('ومصدرٌ حُلِّل ثمّ تغيّر يُعَدّ منتظِرا', () => {
    const spec = TILES.find((t) => t.id === 'sources_analyzed')
    const withStale: TileSource = {
      ...src,
      sources: [{ analyzed: true, stale: true }, { analyzed: true, stale: false }],
    }
    expect(spec?.of(withStale, fmt)).toMatchObject({ value: '1', note: '1 تنتظر تحليلا' })
  })

  /*
   * ‏مراجعة الرحلات: **«حالُ النظام» حكمُ الحبّة نفسُه.** كانت البطاقةُ «يعمل» من مفتاح الإيقاف وحده،
   * ‏والحبّةُ في رأس الشاشة نفسِها «النشر متوقّف» من نبض الإرسال — جوابان متناقضان.
   */
  it('و«حالُ النظام» من النبض كحبّة الرأس — لا «يعمل» والإرسالُ متوقّف', () => {
    const spec = TILES.find((t) => t.id === 'system_state')!
    const stalled: TileSource = {
      ...src,
      pulses: [{ job: 'dispatch', label: 'الإرسال', state: 'late', beat: null, lateBy: 3 * 86_400 }],
    }
    expect(spec.of(stalled, fmt).value).toBe('النشر متوقّف')
    expect(spec.of(src, fmt).value).toBe('يعمل')
    expect(spec.of({ ...stalled, paused: true }, fmt).value).toBe('موقوف مؤقتا')
  })

  it('وذروةُ الإنفاق أعلى يومٍ لا آخرُه', () => {
    const spec = TILES.find((t) => t.id === 'peak_spend_day')
    expect(spec?.of(src, fmt)).toMatchObject({ value: '3.00$', note: 'يوم 09-02' })
  })
})

/** الملاحظةُ تتبع الرقم: صفرٌ مجدولٌ «لا موعدَ»، لا «له موعد» (D-134). */
describe('مجدولٌ للنشر (D-134)', () => {
  it('صفرٌ يقول «لا موعدَ في الطابور»', () => {
    const spec = TILES.find((t) => t.id === 'scheduled')!
    const none = { ...src, drafts: [{ status: 'draft', scheduledAt: null }] }
    expect(spec.of(none, fmt)).toMatchObject({ value: '0', note: 'لا موعدَ في الطابور' })
    expect(spec.of(src, fmt).note).toBe('له موعدٌ في الطابور')
  })
})

describe('بطاقتا الإنفاق (ر-10)', () => {
  const tile = (id: string) => TILES.find((t) => t.id === id)!

  /** **«هذا الشهر» رقمٌ في اللوح لا يُستنتَج** — ورابعُ الافتراض. */
  it('«إنفاق هذا الشهر» من أوّل الشهر، وفي الافتراض مكانَ «30 يومًا»', () => {
    expect(DEFAULT_TILES).toContain('spend_month')
    expect(DEFAULT_TILES).not.toContain('spend_30d')
    const v = tile('spend_month').of(src, fmt)
    expect(v.value).toBe('9.40$')
    expect(v.note).toBe('منذ أوّل الشهر')
    // ‏وحين غابت منطقةُ المالك يُقال إنّه بـ UTC ولا يُترك ليُظنّ بتوقيته
    expect(tile('spend_month').of({ ...src, spendMonth: { total: 1, utc: true } }, fmt).note)
      .toContain('UTC')
  })

  /** **ووصفُ «30 يومًا» صادق**: آخرُ ثلاثين يومًا، لا «المجموعُ الشهريّ». */
  it('و«30 يومًا» تجمع الدفترَ كلَّه وتعدّه بعربيّةٍ صحيحة', () => {
    expect(tile('spend_30d').why).not.toContain('الشهريّ')
    const v = tile('spend_30d').of(src, fmt)
    expect(v.value).toBe('23.41$')
    expect(v.note).toBe('46 طلبًا إلى خدمتَين')
    const one = tile('spend_30d').of({ ...src, spendBy: [{ calls: 6, total: 0.8 }] }, fmt)
    expect(one.note).toBe('6 طلبات إلى خدمةٍ واحدة')
  })

  /** والعددُ ومعدودُه من `counted` في كلّ بطاقة (D-177). */
  it('ولا «1 مزوّدا» ولا «30 يوما» في بطاقةٍ ولا في وصفها', () => {
    for (const t of TILES) {
      const v = t.of(src, fmt)
      const text = `${t.label} ${t.why} ${v.value} ${v.em ?? ''} ${v.note ?? ''}`
      expect(text, t.id).not.toMatch(/\d+ (منشورا|مزوّدا|دورةٌ|يوما|نداءً)(?![\u0621-\u064A])/)
    }
  })
})
