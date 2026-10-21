import { describe, expect, it } from 'vitest'
import { fakeDb } from '../test/fakes'
import { BRIEF_MAX, EMPTY_BRIEF, readBrief, voiceSection, writeBrief } from './brief'
import { estimateMonth } from './estimate'

describe('موجزُ العميل (D-257)', () => {
  it('يُحفظ لكلّ منظّمة، والقنواتُ من قائمةٍ مغلقة، والنصُّ يُقصّ، والإيقاعُ على حدّيه', async () => {
    const db = fakeDb()
    db.raw.exec("INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'عميل', 'agency')")
    await writeBrief(db, 'org_b', { goal: 'x'.repeat(900), channels: ['linkedin', 'facebook', 'x', 'x'], perWeek: '99', tone: 'هادئة' })
    const b = await readBrief(db, 'org_b')
    expect(b.goal).toHaveLength(BRIEF_MAX)
    expect(b.channels).toEqual(['linkedin', 'x'])
    expect(b.perWeek).toBe(28)
    expect(await readBrief(db, 'org_owner')).toEqual(EMPTY_BRIEF)
  })

  it('الموجزُ الفارغ لا يغيّر الموجّه، والمكتوبُ قسمٌ بعنوانه', () => {
    expect(voiceSection(EMPTY_BRIEF)).toBe('')
    const v = voiceSection({ ...EMPTY_BRIEF, tone: 'هادئة واثقة', avoid: 'لا أسعار' })
    expect(v).toContain('## صوت العميل')
    expect(v).toContain('- النبرة: هادئة واثقة')
    expect(v).toContain('- ما لا يُقال: لا أسعار')
    expect(v).not.toContain('الهدف')
  })
})

describe('تقديرُ الشهر قبل البدء (D-257)', () => {
  it('المنشوراتُ من الإيقاع والقنوات، والكلفةُ ممّا أُنفق', () => {
    const e = estimateMonth({ perWeek: 3, channels: 2, autoImage: true, perDraft: 0.01, perImage: 0.02 })
    expect(e).toMatchObject({ posts: 24, images: 24 })
    expect(e.usd).toBeCloseTo(0.72)
  })

  it('ولا رقمَ بلا سابقة في الدفتر', () => {
    expect(estimateMonth({ perWeek: 3, channels: 1, autoImage: false, perDraft: null, perImage: null }).usd).toBeNull()
    expect(estimateMonth({ perWeek: 3, channels: 1, autoImage: true, perDraft: 0.01, perImage: null }).usd).toBeNull()
  })
})
