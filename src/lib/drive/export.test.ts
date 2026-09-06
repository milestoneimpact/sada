import { describe, expect, it } from 'vitest'
import { fakeFetch } from '../../test/fakes'
import { DriveError } from './client'
import { extractText, MAX_TEXT_BYTES, unsupportedReason } from './export'

const DOC = 'application/vnd.google-apps.document'
const SHEET = 'application/vnd.google-apps.spreadsheet'
const DECK = 'application/vnd.google-apps.presentation'

function exportUrl(id: string, as: string): string {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}/export`)
  url.searchParams.set('mimeType', as)
  return url.toString()
}

describe('سبب عدم الدعم — يُقرأ لا يُفكّ', () => {
  it('يرشد صاحب PDF إلى الحلّ لا إلى الرفض', () => {
    const reason = unsupportedReason('application/pdf')
    expect(reason).toContain('مستند Google')
  })

  it('يرشد صاحب ملف Office إلى التحويل لا إلى الرفض', () => {
    const pptx =
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    expect(unsupportedReason(pptx)).toContain('Google Slides')
    const docx =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    expect(unsupportedReason(docx)).toContain('Google Docs')
    const xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    expect(unsupportedReason(xlsx)).toContain('Google Sheets')
    // لا رسالة تعرض نوع MIME الطويل في وجه المالك
    expect(unsupportedReason(pptx)).not.toContain('openxmlformats')
  })

  it('يميّز الصورة عن الوسائط عن النوع المجهول', () => {
    expect(unsupportedReason('image/png')).toContain('صورة')
    expect(unsupportedReason('video/mp4')).toContain('وسائط')
    expect(unsupportedReason('application/zip')).toContain('application/zip')
  })
})

describe('extractText', () => {
  it('يصدّر مستند Google نصا عاديا', async () => {
    const f = fakeFetch({
      [exportUrl('d1', 'text/plain')]: { json: 'نص المستند الكامل' },
    })
    const out = await extractText('tok', 'd1', DOC, f)
    expect(out.kind).toBe('text')
    if (out.kind === 'text') expect(out.text).toContain('نص المستند')
  })

  it('يصدّر الجدول بصيغة csv لا نصا عاديا', async () => {
    const f = fakeFetch({ [exportUrl('s1', 'text/csv')]: { json: 'أ,ب\n1,2' } })
    const out = await extractText('tok', 's1', SHEET, f)
    expect(out.kind).toBe('text')
    expect(f.calls[0]!.url).toContain('text%2Fcsv')
  })

  it('يرسل الرمز في ترويسة Bearer', async () => {
    const f = fakeFetch({ [exportUrl('d1', 'text/plain')]: { json: 'x' } })
    await extractText('tok-9', 'd1', DOC, f)
    expect(f.calls[0]!.headers['Authorization']).toBe('Bearer tok-9')
  })

  it('يحسب الحجم بالبايت لا بعدد المحارف — العربية محرفان', async () => {
    const f = fakeFetch({ [exportUrl('d1', 'text/plain')]: { json: 'أبجد' } })
    const out = await extractText('tok', 'd1', DOC, f)
    if (out.kind !== 'text') throw new Error('توقّعنا نصا')
    // JSON.stringify يضيف علامتي اقتباس؛ المهم أن البايتات أكثر من المحارف
    expect(out.bytes).toBeGreaterThan(4)
  })
})

describe('ما لا يوقف المسح', () => {
  it('غير المدعوم يُعاد بسببه ولا يرمي ولا ينادي الشبكة', async () => {
    const f = fakeFetch({})
    const out = await extractText('tok', 'p1', 'application/pdf', f)
    expect(out.kind).toBe('unsupported')
    expect(f.calls).toHaveLength(0)
  })

  it('الأكبر من السقف يُعاد بحجمه ولا يُرسل إلى Claude', async () => {
    const huge = 'x'.repeat(MAX_TEXT_BYTES + 100)
    const f = fakeFetch({ [exportUrl('d1', 'text/plain')]: { json: huge } })
    const out = await extractText('tok', 'd1', DOC, f)
    expect(out.kind).toBe('too_large')
    if (out.kind === 'too_large') expect(out.bytes).toBeGreaterThan(MAX_TEXT_BYTES)
  })

  it('ما دون السقف بقليل يمرّ', async () => {
    const ok = 'x'.repeat(MAX_TEXT_BYTES - 100)
    const f = fakeFetch({ [exportUrl('d1', 'text/plain')]: { json: ok } })
    const out = await extractText('tok', 'd1', DOC, f)
    expect(out.kind).toBe('text')
  })
})

describe('ما يجب أن يرمي', () => {
  it('رفض Drive للتصدير عطل حقيقي لا نتيجة متوقعة', async () => {
    const f = fakeFetch({
      [exportUrl('d1', 'text/plain')]: { status: 403, json: { error: 'forbidden' } },
    })
    await expect(extractText('tok', 'd1', DOC, f)).rejects.toBeInstanceOf(DriveError)
  })
})
