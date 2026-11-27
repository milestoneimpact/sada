/** D-436: الاستيرادُ والاعتمادُ الجماعيّ والمشاركة — الفحصُ نفسُه قبل البناء وبعده، والبقاءُ في المراجعة، والرابطُ يُنسخ ويُشارك. */
import { describe, expect, it } from 'vitest'
import { planPreviewScreen } from './planPreviewView'
import { planReviewScreen, shareLinkBox } from './planReviewView'
import { clientZoneOf } from '../review'
import { counted, NOUNS } from '../../lib/format'

const key = '00000000-0000-0000-0000-000000000000'
const long = 'نصٌّ كاملٌ يكفي ليكون منشورًا على المنصّة بلا ردٍّ من فحص الاعتماد، أطولُ من أربعين.'

describe('معاينةُ الاستيراد', () => {
  it('النصُّ القصير يُوسم «قصير» بسبب الاعتماد نفسِه، والمنصّةُ باسمها والتاريخُ عربيٌّ في bdi وللصفوف عناوين', () => {
    const csv = 'التاريخ,الوقت,المنصة,النص\n2099-01-04,09:00,linkedin,قصير جدًّا\n2099-01-05,13:00,x,' + long
    const out = planPreviewScreen({ key, csv, filled: {}, via: 'csv', widened: false, cost: 0 })
    expect(out).toContain('قصير')
    expect(out).toContain('النصّ أقصر من أن يكون منشورا')
    expect(out).toContain('class="is-bad"')
    expect(out).toContain('LinkedIn 1')
    expect(out).toMatch(/<th scope="row"><bdi>[^<]*يناير/)
    // ‏وفيه قصير: «اكتب» يبقى الأوّليّ
    expect(out).toMatch(/btn-primary[^>]*name="write" value="1"/)
  })

  it('في كلّ الصفوف نصٌّ صالح: «ابنِ كما هي» الأوّليّ، وإعادةُ الكتابة ثانويّةٌ وكلفتُها على زرّها', () => {
    const csv = 'التاريخ,الوقت,المنصة,النص\n2099-01-04,09:00,LinkedIn,' + long + '\n2099-01-05,13:00,X,' + long
    const out = planPreviewScreen({ key, csv, filled: {}, via: 'csv', widened: false, cost: 0 })
    expect(out).toMatch(/btn-primary[^>]*name="write" value="0"/)
    expect(out).toContain('أعد كتابتها بالذكاء (طلبَين مدفوعة)')
    expect(out).not.toContain('class="is-bad"')
  })
})

const items = [
  { sourceId: 's1', platform: 'linkedin', kind: 'text', angle: 'زاوية', day: '2026-11-10', time: '06:00', why: 'ل' },
  { sourceId: 's1', platform: 'x', kind: 'text', angle: 'زاوية', day: '2026-11-11', time: '07:00', why: 'ل' },
]
const model = (texts: readonly string[]) => ({
  plan: { id: 'pl1', week: '2026-11-10', plan: { rationale: '', items }, model: 'm', status: 'approved', createdAt: '2026-11-02 08:00:00', span: 'week',
    choices: { channels: ['linkedin', 'x'], cadence: {}, sources: 'all', ideas: [], assets: [], autoImage: true, imageStyle: 'illustration', startDay: '2026-11-10' } },
  version: 1, lockedAt: null, versions: [], gaps: { unwritten: 0, no_image: 0, pending: 2, clash: 0 },
  cards: items.map((item, i) => ({ index: i, key: 'k' + String(i), item, post: { id: 'p' + String(i), status: 'draft', text: texts[i]!, scheduledAt: null }, mediaId: null, gaps: ['pending'] })),
}) as never

describe('لوحةُ المراجعة', () => {
  it('«اعتمد المحدّد» يبقى في المراجعة (back=review)، وما يردّه الفحصُ مُبرَزٌ قبل الضغط', () => {
    const out = planReviewScreen(model(['قصير', long]), null)
    expect(out).toMatch(/id="rv-bulk"[\s\S]*?name="back" value="review"/)
    expect(out).not.toMatch(/value="approve" data-away/)
    expect(out.match(/class="card rv is-bad"/g)?.length).toBe(1)
    expect(out).toContain('data-all hidden><span>حدّد كلّ الظاهر</span>')
  })

  it('شريطُ الأقسام لا يتكرّر، والتقويمُ يبدأ من أوّل أيّام الخطّة', () => {
    const out = planReviewScreen(model([long, long]), null)
    expect(out).not.toContain('صفحات الخطّة')
    // ‏2026-11-10 ثلاثاء: الرأسُ يبدأ به ولا خاناتٍ فارغة قبله
    expect(out).toMatch(/aria-label="أيّام الخطّة"><span class="rv-wd" aria-hidden="true">ثلاثاء<\/span>/)
    expect(out).toContain('href="?d=2026-11-10#d-2026-11-10"')
  })

  it('التصفيةُ بالمنصّة وبـ«تنتظر» ويومٌ وحدَه — من العنوان، بلا سكربت', () => {
    const one = planReviewScreen(model([long, long]), null, { filter: { only: 'x' } })
    expect(one).not.toContain('id="c-0"')
    expect(one).toContain('id="c-1"')
    const day = planReviewScreen(model([long, long]), null, { filter: { day: '2026-11-10' } })
    expect(day).toContain('id="c-0"')
    expect(day).not.toContain('id="c-1"')
    expect(day).toContain('اعرض أسبوعه')
  })

  it('رابطُ العميل في حقلٍ للقراءة وحدها مع «انسخ الرابط» و«شارك»', () => {
    const out = shareLinkBox('رابطُ العميل جاهز', 'https://sada2.basserh.com/r/abc')
    expect(out).toMatch(/<input type="url" id="rv-link-u"[^>]*readonly value="https:\/\/sada2\.basserh\.com\/r\/abc"/)
    expect(out).toContain('data-copy="rv-link-u"')
    expect(out).toContain('data-share="rv-link-u" hidden')
  })
})

describe('المطابقةُ العدديّة ومنطقةُ العميل', () => {
  it('«3 منشورات» و«4 بنود» بدالّة الجمع', () => {
    expect(counted(3, NOUNS.post)).toBe('3 منشورات')
    expect(counted(4, NOUNS.item)).toBe('4 بنود')
    expect(counted(11, NOUNS.item)).toBe('11 بندًا')
  })

  it('منطقةُ UTC من متصفّح العميل لا تُعتمد: يُرسم بمنطقة المالك', () => {
    expect(clientZoneOf('sada_ctz=UTC')).toBeNull()
    expect(clientZoneOf('sada_ctz=Etc%2FUTC')).toBeNull()
    expect(clientZoneOf('sada_ctz=Asia%2FDubai')).toBe('Asia/Dubai')
  })
})
