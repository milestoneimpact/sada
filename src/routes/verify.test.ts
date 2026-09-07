/**
 * **الملفُّ يُخدَم حرفا بحرف — أو لا يُخدَم.**
 *
 * مطابِقُ المنصّة يقارن النصَّ كما أعطاه. **وبايتٌ زائدٌ يُسقط المطابقة**
 * — ثمّ يُقال «لم يُتحقَّق» بلا سببٍ يُقرأ، فيُظنّ العطلُ في النطاق أو
 * في شهادته.
 *
 * فالمحتوى يُقارَن بمصدره، والترويسةُ تُفحَص، **والوصولُ بلا جلسة**:
 * ملفٌّ خلف باب دخولٍ لا يُثبت شيئا لأحد.
 */
import { describe, expect, it } from 'vitest'
import { app } from '../index'
import { VERIFICATIONS } from './verify'

const env = {
  SADA_ENV: 'staging',
  PUBLIC_BASE_URL: 'https://sada2.basserh.com',
  DRIVE_FOLDER_ID: 'folder',
}

describe('إثباتُ ملكيّة النطاق', () => {
  it('كلُّ ملفٍّ يُخدَم على جذر النطاق', async () => {
    for (const record of VERIFICATIONS) {
      const response = await app.request(`/${record.file}`, {}, env)
      expect(response.status, record.file).toBe(200)
      expect(await response.text(), record.file).toBe(record.body)
    }
  })

  it('**وبلا جلسة** — ملفٌّ خلف بابٍ لا يُثبت شيئا', async () => {
    for (const record of VERIFICATIONS) {
      const response = await app.request(`/${record.file}`, { headers: {} }, env)
      expect(response.status, record.file).toBe(200)
    }
  })

  it('ونصٌّ صِرفٌ لا يُخمَّن نوعُه', async () => {
    for (const record of VERIFICATIONS) {
      const response = await app.request(`/${record.file}`, {}, env)
      expect(response.headers.get('Content-Type')).toContain('text/plain')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    }
  })

  /**
   * **ولا بايتَ زائد.** سطرٌ جديدٌ في آخر المحتوى قد يُسقط المطابقة عند
   * بعض المنصّات — والملفُّ المنزَّل من TikTok بلا واحد.
   */
  it('ولا فراغَ في طرفٍ ولا سطرَ جديد', () => {
    for (const record of VERIFICATIONS) {
      expect(record.body, record.platform).toBe(record.body.trim())
      expect(record.body, record.platform).not.toContain('\n')
    }
  })

  it('واسمُ الملفّ مسارٌ واحدٌ لا مسارات', () => {
    for (const record of VERIFICATIONS) {
      expect(record.file, record.platform).not.toContain('/')
      expect(record.file, record.platform).not.toContain('..')
      expect(record.file.length, record.platform).toBeGreaterThan(4)
    }
  })

  /** **ولكلٍّ سببٌ مكتوب**: ملفٌّ لا يُعرَف سببُه يُحذَف يوما فتسقط المراجعة. */
  it('ولكلٍّ سببٌ يُقرأ', () => {
    for (const record of VERIFICATIONS) {
      expect(record.why.length, record.platform).toBeGreaterThan(30)
    }
  })

  it('وما ليس في السجلّ لا يُخدَم — ولا يُخترَع ملفّ', async () => {
    const response = await app.request('/tiktokLA-SHAY-HUNA.txt', {}, env)
    expect(response.status).toBe(404)
  })
})
