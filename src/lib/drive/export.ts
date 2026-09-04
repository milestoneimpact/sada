/**
 * استخراج نصّ المصدر من Drive.
 *
 * القرار (D-016): المصادر **مستندات Google الأصلية**، لا PDF.
 *
 * لماذا يهمّ هذا هندسيا: مستند Google لا يحمل بايتات في Drive — تُصدَّره
 * الواجهة نصا جاهزا في نداء واحد. أما PDF فيلزمه تحليل داخل Worker، وسقف
 * المعالجة على الخطة المجانية عشر ميلي ثانية: ملف بستة ميجابايت يتجاوزه
 * قبل أن يبدأ. فالقرار ليس تفضيلا، هو ما يجعل الطبقة ممكنة أصلا.
 *
 * وما ليس مستند Google لا يُرمى ولا يُسكت عنه: يُعاد بسبب مفهوم يظهر
 * للمالك، فيعرف لماذا تُجوهل ملفاته.
 */
import { DriveError } from './client'

/** ما تصدّره الواجهة لكل نوع أصلي. */
const EXPORT_AS: Readonly<Record<string, string>> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}

/**
 * سقف النص المستخرج.
 *
 * ليس حدّ Drive — هو حدّنا نحن: النص يُرسل إلى Claude، وكل محرف يُحاسَب
 * في `cost_ledger`. مستند يتجاوز هذا يُبلَّغ عنه بدل أن يُنفق عليه صامتا.
 */
export const MAX_TEXT_BYTES = 512 * 1024

export type ExtractOutcome =
  | { readonly kind: 'text'; readonly text: string; readonly bytes: number }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'too_large'; readonly bytes: number }

export function isExportable(mimeType: string): boolean {
  return mimeType in EXPORT_AS
}

/** ملفات Office: Drive يحوّلها، فالرسالة تقول كيف لا أنها مرفوضة. */
const OFFICE_HINT: Readonly<Record<string, string>> = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'عرض PowerPoint — افتحه بـ Google Slides ثم «حفظ بصيغة عروض Google»',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'مستند Word — افتحه بـ Google Docs ثم «حفظ بصيغة مستندات Google»',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'جدول Excel — افتحه بـ Google Sheets ثم «حفظ بصيغة جداول Google»',
  'application/msword': 'مستند Word قديم — افتحه بـ Google Docs واحفظه مستند Google',
  'application/vnd.ms-powerpoint': 'عرض PowerPoint قديم — افتحه بـ Google Slides واحفظه',
  'application/vnd.ms-excel': 'جدول Excel قديم — افتحه بـ Google Sheets واحفظه',
}

/** سبب مفهوم للمالك، لا رمز خطأ. */
export function unsupportedReason(mimeType: string): string {
  const office = OFFICE_HINT[mimeType]
  if (office !== undefined) return office
  if (mimeType === 'application/pdf') {
    return 'PDF غير مدعوم — حوّله إلى «مستند Google» (فتح بـ Google Docs ثم حفظ)'
  }
  if (mimeType.startsWith('image/')) return 'صورة — لا نص فيها تُقرأ منه'
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
    return 'وسائط — خارج نطاق المرحلة الأولى'
  }
  if (mimeType === 'application/vnd.google-apps.form') return 'نموذج Google — لا محتوى نصيا'
  return `النوع ${mimeType} غير مدعوم — المدعوم: مستند Google وجدول وعرض`
}

/**
 * يصدّر ملفا واحدا نصا.
 *
 * لا يرمي على «غير مدعوم» ولا على «أكبر من اللازم»: كلاهما نتيجة متوقعة
 * تُعاد لتُسجَّل، لا عطل يوقف المسح كله على ملف واحد.
 */
export async function extractText(
  token: string,
  fileId: string,
  mimeType: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractOutcome> {
  const exportAs = EXPORT_AS[mimeType]
  if (exportAs === undefined) {
    return { kind: 'unsupported', reason: unsupportedReason(mimeType) }
  }

  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}/export`)
  url.searchParams.set('mimeType', exportAs)

  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new DriveError(`drive: تعذّر تصدير ${fileId}`, response.status)
  }

  const text = await response.text()
  const bytes = new TextEncoder().encode(text).byteLength
  if (bytes > MAX_TEXT_BYTES) {
    return { kind: 'too_large', bytes }
  }
  return { kind: 'text', text, bytes }
}
