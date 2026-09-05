import { describe, expect, it } from 'vitest'
import { authorizeAdmin } from './adminAuth'

/**
 * الرمز هنا ASCII لا عربية — وليس تفضيلا: ترويسة HTTP نصّ `latin-1`،
 * فرمزٌ عربيّ لا يمكن إرساله أصلا (`new Request` نفسه يرفضه). ولذلك
 * وُثّق في MANUAL-TASKS أن يُولَّد الرمز base64 أو ستّ عشريّا.
 */
function req(authorization?: string): Request {
  const headers = authorization === undefined ? {} : { Authorization: authorization }
  return new Request('https://sada2.basserh.com/admin/scan', { method: 'POST', headers })
}

describe('مغلق افتراضا — غياب السرّ يقفل لا يفتح', () => {
  it.each([undefined, ''])('يعطّل المسار حين ADMIN_TOKEN %p', async (value) => {
    expect((await authorizeAdmin(value, req('Bearer anything'))).kind).toBe('disabled')
  })

  it('يعطّله ولو جاء الطلب بلا ترويسة أصلا', async () => {
    expect((await authorizeAdmin(undefined, req())).kind).toBe('disabled')
  })
})

describe('حين يُضبط السرّ', () => {
  const SECRET = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'

  it('يقبل الرمز الصحيح', async () => {
    expect((await authorizeAdmin(SECRET, req(`Bearer ${SECRET}`))).kind).toBe('ok')
  })

  it.each([
    ['رمزا آخر', 'Bearer Zz9pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'],
    ['بادئة صحيحة وبقيّة خطأ', 'Bearer Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1j000'],
    ['الرمز بلا Bearer', 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'],
    ['نوع مصادقة آخر', 'Basic cm9vdDpyb290'],
    ['Bearer فارغ', 'Bearer '],
  ])('يرفض %s', async (_name, header) => {
    const verdict = await authorizeAdmin(SECRET, req(header))
    expect(verdict.kind === 'denied' || verdict.kind === 'no_header').toBe(true)
  })

  it('يميّز غياب الترويسة عن مخالفة الرمز', async () => {
    expect((await authorizeAdmin(SECRET, req())).kind).toBe('no_header')
    expect((await authorizeAdmin(SECRET, req('Bearer zzz'))).kind).toBe('denied')
  })

  it('لا يقبل رمزا يزيد محرفا ولا ينقص محرفا', async () => {
    expect((await authorizeAdmin(SECRET, req(`Bearer ${SECRET}x`))).kind).toBe('denied')
    expect((await authorizeAdmin(SECRET, req(`Bearer ${SECRET.slice(0, -1)}`))).kind).toBe('denied')
  })

  it('يتسامح مع مسافة حول الرمز لا داخله', async () => {
    expect((await authorizeAdmin(SECRET, req(`  Bearer ${SECRET}  `))).kind).toBe('ok')
    expect((await authorizeAdmin(SECRET, req(`Bearer ${SECRET} x`))).kind).toBe('denied')
  })

  it('يعيد طول ما أرسله المنادي — ولا يذكر طول المحفوظ', async () => {
    const verdict = await authorizeAdmin(SECRET, req('Bearer abc'))
    if (verdict.kind !== 'denied') throw new Error('توقّعنا رفضا')
    expect(verdict.presentedLength).toBe(3)
    expect(JSON.stringify(verdict)).not.toContain(String(SECRET.length))
  })
})

/**
 * أخطاءٌ وقعت فعلا أو توشك: كلٌّ منها يجعل رمزا «صحيحا» يُرفض، بلا أثرٍ
 * يدلّ على السبب. فتُختبر بأعيانها لا بالعموم.
 */
describe('أخطاء اللصق الشائعة', () => {
  const SECRET = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'

  it('سطرٌ جديد تسلّل إلى السرّ المحفوظ لا يُبطله', async () => {
    // يقع مع: echo "$T" | wrangler secret put — و echo يضيف سطرا
    expect((await authorizeAdmin(`${SECRET}\n`, req(`Bearer ${SECRET}`))).kind).toBe('ok')
    expect((await authorizeAdmin(`  ${SECRET}  `, req(`Bearer ${SECRET}`))).kind).toBe('ok')
  })

  it('قوسان زائدان يُرفضان، والطول يفضحهما', async () => {
    const verdict = await authorizeAdmin(SECRET, req(`Bearer <${SECRET}>`))
    if (verdict.kind !== 'denied') throw new Error('توقّعنا رفضا')
    expect(verdict.presentedLength).toBe(SECRET.length + 2)
  })

  it('رمزٌ مقلوب — TOKEN_ENC_KEY مكان ADMIN_TOKEN — يُرفض', async () => {
    const encKey = 'bXlUb2tlbkVuY0tleUJhc2U2NDMyQnl0ZXNIZXJlPT0='
    expect((await authorizeAdmin(SECRET, req(`Bearer ${encKey}`))).kind).toBe('denied')
  })
})
