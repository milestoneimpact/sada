/**
 * «النتائج» تُقرأ وتوصل (ر-7 · ر-10) — والعددُ بعربيّةٍ صحيحة (D-177).
 *
 * كانت الشاشةُ بلا رابطٍ واحد، وعنوانُها تاريخان خامّان ثانيهما خارج الأسبوع،
 * وتكتب «1 منشورا خرجت». والفحصُ هنا على الوسم المرسوم لا على الدوالّ.
 */
import { describe, expect, it } from 'vitest'
import { reportBody, reportScreen } from './reportView'
import { machineCard } from './parts'
import { barChart } from './chart'
import { summarize, type ReportPost, type StoredReport } from '../../lib/report/weekly'
import type { Pulse } from '../../lib/ops/heartbeat'

const NOW = new Date('2026-10-04T09:00:00Z')
const FROM = new Date('2026-09-21T00:00:00Z')
const TO = new Date('2026-09-28T00:00:00Z')

/**
 * ما لا يُكتب بعد D-177: رقمٌ ثمّ معدودٌ مفردٌ في غير موضعه. **والكلمةُ تامّة**:
 * «5 منشورات» صوابٌ وأوّلُها «منشورا»، فلا يتبعها حرف.
 */
const BAD_COUNT = /\d+ (منشورا|مزوّدا|دورةٌ|يوما|نداءً)(?![\u0621-\u064A])/

const post = (
  id: string, window: ReportPost['window'], impressions: number | null, interactions: number | null,
  text = `السطرُ الأوّل من ${id}\nوسطرٌ ثانٍ لا يُعرَض`,
): ReportPost => ({
  id, platform: 'x', text, publishedAt: '2026-09-22 10:00:00', window, impressions, interactions,
})

const stored = (id: string, from: Date, to: Date, posts: readonly ReportPost[]): StoredReport => {
  const body = summarize(posts, from, to, 0.5)
  return { id, from: body.from, to: body.to, createdAt: '2026-09-28 04:14:00', body }
}

describe('عنوانُ الأسبوع (خطّة التصميم ٥٫٨)', () => {
  /** **سبعةُ أيّامٍ لا ثمانية**: الحدُّ الأعلى الاثنينُ التالي، فآخرُ يومٍ الأحدُ قبله. */
  it('«أسبوع 21 إلى 27 سبتمبر» لا «2026-09-21 — 2026-09-28»', () => {
    const html = reportBody(summarize([], FROM, TO, 0), NOW)
    expect(html).toContain('<h1>أسبوع 21 إلى 27 سبتمبر</h1>')
    expect(html).not.toContain('2026-09-28')
  })

  it('وأسبوعٌ يعبر شهرًا يسمّي الشهرين', () => {
    const html = reportBody(summarize([], TO, new Date('2026-10-05T00:00:00Z'), 0), NOW)
    expect(html).toContain('<h1>أسبوع 28 سبتمبر إلى 4 أكتوبر</h1>')
  })

  /** و«ما مضى» بالمدى نفسِه لا بمعرّفٍ خامّ، والعمودُ بأوّل يومٍ وحده فتبدأ الأعمدةُ من خطٍّ واحد. */
  it('و«ما مضى» بالأسماء نفسِها، والرابطُ بمعرّفه كما كان', () => {
    const html = reportScreen({
      reports: [
        stored('2026-09-21', FROM, TO, []),
        stored('2026-09-14', new Date('2026-09-14T00:00:00Z'), FROM, []),
      ],
      current: null, suggestions: [], promoCapUsd: 0, now: NOW,
    })
    expect(html).toContain('href="/panel/report/2026-09-21">21 إلى 27 سبتمبر</a>')
    expect(html).toContain('href="/panel/report/2026-09-14">14 إلى 20 سبتمبر</a>')
    expect(html).toContain('class="bar-name" href="/panel/report/2026-09-21">21 سبتمبر</a>')
    expect(html).not.toMatch(/>2026-09-\d\d</)
  })
})

describe('التقريرُ يوصل (ر-7)', () => {
  /** **كلُّ صفِّ منصّةٍ يوصل إلى شاشتها** — مقاييسُ كلِّ منشورٍ هناك. */
  it('صفُّ المنصّة رابطٌ إلى منشوراتها', () => {
    const html = reportBody(summarize([post('a', '72h', 1975, 58)], FROM, TO, 0), NOW)
    expect(html).toContain('<a class="tap" href="/panel/channels/x">اعرض منشوراتها</a>')
  })

  /**
   * **والمنشورُ الوحيدُ يُرى ولو لم يُرتَّب.** كان الأسبوعُ بمنشورٍ واحدٍ يقول
   * «لا ترتيب» فلا يعرف المالكُ أيُّ منشورٍ جلب ‏١٩٧٥ ظهورًا.
   */
  it('والمنشورُ الوحيدُ بسطره الأوّل وأرقامه ورابطِ سجلّه', () => {
    const html = reportBody(summarize([post('p-1', '72h', 1975, 58)], FROM, TO, 0), NOW)
    expect(html).toContain('<h2>منشورُ الأسبوع</h2>')
    expect(html).toContain('في نافذة 72 ساعة')
    expect(html).toContain('السطرُ الأوّل من p-1')
    expect(html).not.toContain('وسطرٌ ثانٍ')
    expect(html).toContain('<b>1975</b>ظهور')
    expect(html).toContain('<b>58</b>تفاعل')
    expect(html).toContain('href="/panel/journey/p-1">سجلُّه</a>')
    expect(html).not.toContain('لا ترتيبَ في هذا الأسبوع')
  })

  /** وتقريرٌ كُتب قبل الحقل يُقرأ كما كُتب — شهادةٌ لا يُعاد حسابُها. */
  it('وتقريرٌ قديمٌ بلا `only` يبقى على فقرته', () => {
    const { only: _only, ...old } = summarize([post('p-1', '72h', 1975, 58)], FROM, TO, 0)
    const html = reportBody(old, NOW)
    expect(html).toContain('لا ترتيبَ في هذا الأسبوع')
    expect(html).toContain('<h2>الأفضلُ داخل نافذته</h2>')
  })

  it('والأوّلُ في الترتيب يوصل إلى سجلّه كذلك', () => {
    const html = reportBody(summarize([post('a', '24h', 100, 50), post('b', '24h', 100, 10)], FROM, TO, 0), NOW)
    expect(html).toContain('href="/panel/journey/a">سجلُّه</a>')
  })

  /** **«ضع السقف» رابطٌ إلى حقله** لا نصٌّ بخطٍّ أحاديّ — فيفتح الإعداداتِ عنده. */
  it('وبلا سقفِ ترويجٍ رابطٌ إلى حقله في الإعدادات', () => {
    const html = reportScreen({ reports: [], current: null, suggestions: [], promoCapUsd: 0, now: NOW })
    expect(html).toContain('<a class="tap" href="/panel#c3">ضع سقفَ الترويج الأسبوعيّ</a>')
    expect(html).not.toContain('<span class="mono">سقفَ الترويج')
  })
})

describe('هذا الشهر تحت الرأس (ر-10)', () => {
  it('سطرٌ صغيرٌ برقم الشهر، والرقمُ يفتح حدودَ الإنفاق', () => {
    const html = reportScreen({
      reports: [], current: stored('2026-09-21', FROM, TO, []), suggestions: [],
      promoCapUsd: 0, now: NOW, month: { total: 0.39, utc: false },
    })
    expect(html).toMatch(/<div class="sub">هذا الشهر حتّى اليوم:\s*<a class="tap" href="\/panel#c2">0\.390\$<\/a><\/div>/)
  })

  it('ويُرسَم ولو لم يُكتب تقريرٌ بعد، ويقول «بتوقيت الرياض» حين غابت منطقةُ المالك (D-201)', () => {
    const html = reportScreen({
      reports: [], current: null, suggestions: [], promoCapUsd: 0, now: NOW, month: { total: 0, utc: true },
    })
    expect(html).toContain('href="/panel#c2">0.00$</a> بتوقيت الرياض')
  })
})

describe('العددُ ومعدودُه (D-177)', () => {
  it('«خرج منشورٌ واحد، وقِيس» لا «1 منشورا خرجت»', () => {
    const html = reportBody(summarize([post('a', '72h', 1975, 58)], FROM, TO, 0), NOW)
    expect(html).toContain('خرج منشورٌ واحد، وقِيس.')
    expect(html).toContain('منشورٌ واحد · قِيس 1')
    expect(html).not.toMatch(BAD_COUNT)
  })

  it('واثنان وخمسةٌ وأحدَ عشرَ بصيغها', () => {
    const two = reportBody(summarize([post('a', '24h', 100, 50), post('b', '24h', 100, 10)], FROM, TO, 0), NOW)
    expect(two).toContain('خرج منشوران، قِيس منهما <b>2</b>.')
    expect(two).toContain('بين <b>منشورَين</b> في النافذة نفسِها')
    const five = reportBody(summarize(['a', 'b', 'c', 'd', 'e'].map((id) => post(id, null, null, null)), FROM, TO, 0), NOW)
    expect(five).toContain('خرج 5 منشورات، قِيس منها <b>0</b>.')
    const eleven = reportBody(summarize(Array.from({ length: 11 }, (_, i) => post(`p${i}`, null, null, null)), FROM, TO, 0), NOW)
    expect(eleven).toContain('خرج 11 منشورًا')
    for (const html of [two, five, eleven]) expect(html).not.toMatch(BAD_COUNT)
  })

  /** «تأخّرت أو سقطت دورتان» — والفعلُ قبل المعدود فلا يُطابَق مثنّاه. */
  it('ورأسُ «هل الآلةُ تعمل؟» يعدّ الدوراتِ بعربيّةٍ صحيحة', () => {
    const late = (job: Pulse['job']): Pulse => ({ job, label: job, state: 'late', beat: null, lateBy: 600 })
    expect(machineCard([late('scan')], NOW)).toContain('تأخّرت أو سقطت دورةٌ واحدة')
    expect(machineCard([late('scan'), late('alerts')], NOW)).toContain('تأخّرت أو سقطت دورتان')
    const five = machineCard(['scan', 'alerts', 'metrics', 'report', 'publish'].map((j) => late(j as Pulse['job'])), NOW)
    expect(five).toContain('تأخّرت أو سقطت 5 دورات')
    expect(five).not.toMatch(BAD_COUNT)
  })

  it('ووصفُ «أين يذهب المال» لقارئ الشاشة بلا «3 مزوّدا»', () => {
    const html = barChart([{ label: 'Anthropic', value: 0.8 }, { label: 'X — النشر والقياس', value: 0.027 }], { unit: 'money' })
    const label = /aria-label="([^"]+)"/.exec(html)?.[1] ?? ''
    expect(label).toContain('خدمتان')
    expect(label).not.toMatch(BAD_COUNT)
  })
})

describe('ثلاثةُ أرقامٍ بفرقها في رأس «النتائج» (D-208)', () => {
  const week = (impressions: number | null, interactions: number | null, spendUsd: number) => ({
    version: 1, from: '2026-10-05', to: '2026-10-12', published: 2, measured: 2,
    platforms: [{ platform: 'x', published: 2, measured: 2, impressions, impressionsFrom: 2, interactions, interactionsFrom: 2 }],
    top: null, spendUsd, notes: [],
  }) as never

  it('الظهورُ والتفاعلُ والإنفاقُ بفرقها عن الأسبوع الذي قبله، كلمةً لا لونًا', async () => {
    const { weekKpis } = await import('./reportView')
    const html = weekKpis(week(1200, 30, 1.5), week(1000, 40, 1.5))
    expect(html).toContain('<div class="kv-k">الظهور</div><div class="kv-v">1,200</div><div class="note">أكثرُ بـ20٪ من الأسبوع الماضي</div>')
    expect(html).toContain('أقلُّ بـ25٪ من الأسبوع الماضي')
    expect(html).toContain('كالأسبوع الماضي')
  })

  it('وما لم يُقَس يقول ذلك، ولا فرقَ بلا أسبوعٍ قبله', async () => {
    const { weekKpis } = await import('./reportView')
    const html = weekKpis(week(null, null, 0), null)
    expect(html).toContain('<div class="kv-v">لم يُقَس</div>')
    expect(html).toContain('لا أسبوعَ قبله يُقارَن به')
    expect(weekKpis(week(null, 5, 0), week(10, 5, 0))).toContain('لا يُقارَن: أحدُ الأسبوعين لم يُقَس')
  })

  it('والشاشةُ تقارن التقريرَ الحاليَّ بالذي بعده في القائمة', () => {
    const reports = [
      { id: '2026-W42', body: week(1200, 30, 2), createdAt: '' },
      { id: '2026-W41', body: week(600, 30, 2), createdAt: '' },
    ] as never as StoredReport[]
    const html = reportScreen({ reports, current: reports[0]!, suggestions: [], promoCapUsd: 0, now: new Date('2026-10-13T08:00:00Z') })
    expect(html).toContain('أكثرُ بـ100٪ من الأسبوع الماضي')
  })
})
