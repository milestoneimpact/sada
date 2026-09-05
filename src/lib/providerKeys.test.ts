import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from './crypto'
import { fakeDb, type FakeDb } from '../test/fakes'
import {
  deleteKey, fingerprint, listRecords, markVerified, maskKey,
  readRecord, resolveKey, saveKey, setDailyCap, setEnabled,
} from './providerKeys'

const ENC = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const ANTHROPIC = 'sk-ant-api03-QQQQQQQQQQQQQQQQQQQQQQQQQQQQ7f2a'
const GEMINI = 'AIzaSyBBBBBBBBBBBBBBBBBBBBBBBBBBBB9x1c'

let db: FakeDb
beforeEach(() => {
  db = fakeDb()
})

describe('التقنيع — ما يُعرض بدل المفتاح', () => {
  it('يبقي أوّله وآخره فقط', () => {
    const hint = maskKey(ANTHROPIC)
    expect(hint).toBe('sk-ant-…7f2a')
    expect(hint).not.toContain('QQQQ')
  })

  it('يميّز نسختين بآخرهما', () => {
    expect(maskKey(ANTHROPIC)).not.toBe(maskKey(`${ANTHROPIC.slice(0, -4)}0000`))
  })

  it('القصير يُقنَّع كلّه — لا يبقى منه ما يُعرض بأمان', () => {
    expect(maskKey('short')).toBe('•••••')
    expect(maskKey('short')).not.toContain('s')
  })
})

describe('البصمة', () => {
  it('تتساوى للمفتاح نفسه وتختلف لغيره', async () => {
    expect(await fingerprint(ANTHROPIC)).toBe(await fingerprint(ANTHROPIC))
    expect(await fingerprint(ANTHROPIC)).not.toBe(await fingerprint(GEMINI))
  })

  it('تتجاهل المسافات — فلا يُظنّ المفتاح نفسه جديدا', async () => {
    expect(await fingerprint(` ${ANTHROPIC}\n`)).toBe(await fingerprint(ANTHROPIC))
  })

  it('لا تكشف المفتاح', async () => {
    const print = await fingerprint(ANTHROPIC)
    expect(ANTHROPIC).not.toContain(print)
    expect(print.length).toBeLessThan(20)
  })
})

describe('الحفظ والاسترجاع', () => {
  it('يحفظ مشفَّرا ويسترجعه كاملا', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    const resolved = await resolveKey(db, ENC, 'gemini', undefined)
    expect(resolved.key).toBe(GEMINI)
    expect(resolved.source).toBe('vault')
  })

  it('**لا يُخزَّن المفتاح مقروءا في أيّ عمود**', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    const row = db.raw.prepare('SELECT * FROM provider_keys').get() as Record<string, unknown>
    const all = JSON.stringify(row)
    expect(all).not.toContain(GEMINI)
    expect(all).not.toContain(GEMINI.slice(8, 24))
  })

  it('نصٌّ مشفَّر لا يُنقل من مزوّدٍ إلى آخر ولو نُسخ الصفّ', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    db.raw.exec(
      `INSERT INTO provider_keys (provider, key_enc, key_iv, hint, fingerprint)
       SELECT 'anthropic', key_enc, key_iv, hint, fingerprint FROM provider_keys WHERE provider='gemini'`,
    )
    // الربط السياقيّ يمنع الفكّ باسم مزوّدٍ آخر
    expect((await resolveKey(db, ENC, 'anthropic', undefined)).key).toBeNull()
  })

  it('مفتاح تشفيرٍ آخر لا يفكّ الخزانة', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    const other = toBase64(crypto.getRandomValues(new Uint8Array(32)))
    expect((await resolveKey(db, other, 'gemini', undefined)).key).toBeNull()
  })

  it('يستبدل المفتاح ولا يكرّر الصفّ', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    await saveKey(db, ENC, 'gemini', `${GEMINI}-new`, 'panel')
    const count = db.raw.prepare('SELECT count(*) AS n FROM provider_keys').get() as { n: number }
    expect(count.n).toBe(1)
    expect((await resolveKey(db, ENC, 'gemini', undefined)).key).toBe(`${GEMINI}-new`)
  })

  it('يعرف أنّ المفتاح لم يتغيّر — فلا يُطلب اختبارٌ بلا داع', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    expect((await saveKey(db, ENC, 'gemini', GEMINI, 'panel')).unchanged).toBe(true)
    expect((await saveKey(db, ENC, 'gemini', `${GEMINI}x`, 'panel')).unchanged).toBe(false)
  })

  it('مفتاحٌ جديد يُلغي شهادة التحقّق السابقة', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    await markVerified(db, 'gemini')
    expect((await readRecord(db, 'gemini'))?.verifiedAt).not.toBeNull()

    await saveKey(db, ENC, 'gemini', `${GEMINI}-different`, 'panel')
    expect((await readRecord(db, 'gemini'))?.verifiedAt).toBeNull()
  })

  it('إعادةُ حفظ المفتاح نفسه تُبقي شهادته', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    await markVerified(db, 'gemini')
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    expect((await readRecord(db, 'gemini'))?.verifiedAt).not.toBeNull()
  })

  it('يرفض المفتاح الفارغ', async () => {
    await expect(saveKey(db, ENC, 'gemini', '   ', 'panel')).rejects.toThrow()
  })
})

describe('**سرّ Worker يغلب الخزانة دائما**', () => {
  it('يُستعمل السرّ ولو كانت الخزانة مملوءة', async () => {
    await saveKey(db, ENC, 'anthropic', 'vault-key-aaaaaaaaaaaa', 'panel')
    const resolved = await resolveKey(db, ENC, 'anthropic', 'worker-secret-bbbbbbbb')
    expect(resolved.key).toBe('worker-secret-bbbbbbbb')
    expect(resolved.source).toBe('worker_secret')
  })

  it('سرٌّ فارغ لا يُعدّ سرّا — فتُستعمل الخزانة', async () => {
    await saveKey(db, ENC, 'anthropic', 'vault-key-aaaaaaaaaaaa', 'panel')
    expect((await resolveKey(db, ENC, 'anthropic', '   ')).source).toBe('vault')
  })

  it('بلا سرٍّ ولا خزانة: لا مفتاح ولا عطل', async () => {
    expect(await resolveKey(db, ENC, 'gemini', undefined)).toEqual({ key: null, source: 'none' })
  })
})

describe('التعطيل والسقف', () => {
  it('المعطَّل لا يُستعمل — والتعطيل تعطيلٌ لا علامةٌ في شاشة', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    await setEnabled(db, 'gemini', false, 'panel')
    expect((await resolveKey(db, ENC, 'gemini', undefined)).key).toBeNull()
  })

  it('والمفتاح يبقى محفوظا — يُطفأ ولا يُفقَد', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    await setEnabled(db, 'gemini', false, 'panel')
    await setEnabled(db, 'gemini', true, 'panel')
    expect((await resolveKey(db, ENC, 'gemini', undefined)).key).toBe(GEMINI)
  })

  it('السقف يُقصّ على المدى', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    await setDailyCap(db, 'gemini', 9999, 'panel')
    expect((await readRecord(db, 'gemini'))?.dailyCap).toBe(100)
    await setDailyCap(db, 'gemini', -5, 'panel')
    expect((await readRecord(db, 'gemini'))?.dailyCap).toBe(0)
  })

  it('null يزيله فيعود إلى السقف العامّ', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    await setDailyCap(db, 'gemini', 3, 'panel')
    await setDailyCap(db, 'gemini', null, 'panel')
    expect((await readRecord(db, 'gemini'))?.dailyCap).toBeNull()
  })

  it('الحذف يمحو الصفّ كلّه', async () => {
    await saveKey(db, ENC, 'gemini', GEMINI, 'panel')
    await deleteKey(db, 'gemini')
    expect(await readRecord(db, 'gemini')).toBeNull()
    expect(await listRecords(db)).toHaveLength(0)
  })
})

describe('حين ينقص الجدول', () => {
  it('ترحيلٌ لم يُطبَّق: لا مفتاح ولا عطل', async () => {
    db.raw.exec('DROP TABLE provider_keys')
    expect(await readRecord(db, 'gemini')).toBeNull()
    expect(await listRecords(db)).toEqual([])
    expect((await resolveKey(db, ENC, 'gemini', undefined)).source).toBe('none')
  })

  it('وسرُّ Worker يظلّ يعمل — الخزانة إضافةٌ لا شرط', async () => {
    db.raw.exec('DROP TABLE provider_keys')
    expect((await resolveKey(db, ENC, 'anthropic', 'worker-key')).source).toBe('worker_secret')
  })
})
