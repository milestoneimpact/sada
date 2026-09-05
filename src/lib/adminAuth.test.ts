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
    expect(await authorizeAdmin(value, req('Bearer anything'))).toBe('disabled')
  })

  it('يعطّله ولو جاء الطلب بلا ترويسة أصلا', async () => {
    expect(await authorizeAdmin(undefined, req())).toBe('disabled')
  })
})

describe('حين يُضبط السرّ', () => {
  const SECRET = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'

  it('يقبل الرمز الصحيح', async () => {
    expect(await authorizeAdmin(SECRET, req(`Bearer ${SECRET}`))).toBe('ok')
  })

  it.each([
    ['رمزا آخر', 'Bearer Zz9pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'],
    ['بادئة صحيحة وبقيّة خطأ', 'Bearer Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1j000'],
    ['الرمز بلا Bearer', 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'],
    ['نوع مصادقة آخر', 'Basic cm9vdDpyb290'],
    ['Bearer فارغ', 'Bearer '],
  ])('يرفض %s', async (_name, header) => {
    expect(await authorizeAdmin(SECRET, req(header))).toBe('denied')
  })

  it('يرفض الطلب بلا ترويسة', async () => {
    expect(await authorizeAdmin(SECRET, req())).toBe('denied')
  })

  it('لا يقبل رمزا يزيد محرفا ولا ينقص محرفا', async () => {
    expect(await authorizeAdmin(SECRET, req(`Bearer ${SECRET}x`))).toBe('denied')
    expect(await authorizeAdmin(SECRET, req(`Bearer ${SECRET.slice(0, -1)}`))).toBe('denied')
  })

  it('يتسامح مع مسافة حول الترويسة لا داخل الرمز', async () => {
    expect(await authorizeAdmin(SECRET, req(`  Bearer ${SECRET}  `))).toBe('ok')
    expect(await authorizeAdmin(SECRET, req(`Bearer ${SECRET} x`))).toBe('denied')
  })
})
