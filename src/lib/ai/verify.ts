/**
 * التحقّق من مفتاح مزوّد.
 *
 * **مفتاحٌ يُحفظ ولا يُختبر يُكتشف فسادُه في أوّل مهمّةٍ حقيقيّة** — وقتها
 * يكون قد أفسد شيئا: مسحا ليليّا، أو منشورا مجدولا. فالاختبار نداءٌ
 * رخيصٌ يقع الآن بدل أن يقع العطل لاحقا.
 *
 * ولكلّ مزوّد نداءُ تحقّقٍ مختلف: هذا هو الحدّ الذي يمنع «إضافة أيّ جهة
 * من اللوحة». **الواجهة لا تخترع عميل HTTP لخدمةٍ لم تُكتب**، ولا يُخفى
 * ذلك بزرٍّ جميل. وما نستطيعه أنّ سائقا جديدا ملفٌّ واحد وسطرٌ هنا.
 */
import type { ProviderName } from './registry'

export type VerifyResult =
  | { readonly ok: true; readonly detail: string }
  | { readonly ok: false; readonly detail: string; readonly status: number | null }

/**
 * تُختار نداءاتٌ **لا تكلّف رموزا**: قوائمُ نماذجَ لا توليدٌ.
 * واختبارٌ يكلّف مالا يُتجنَّب فيبقى المفتاح غير مُتحقَّق منه.
 */
const ENDPOINTS: Readonly<Record<ProviderName, (key: string) => Request>> = {
  anthropic: (key) =>
    new Request('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    }),
  gemini: (key) =>
    new Request('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': key },
    }),
}

/** يميّز «مفتاح خطأ» من «الخدمة متعبة» — وعلاجهما مختلف. */
function explain(status: number): string {
  if (status === 401 || status === 403) return 'المفتاح مرفوض — تحقّق أنّه صحيح ولم يُلغَ'
  if (status === 429) return 'المفتاح صحيح على الأرجح، لكنّ الحدّ بلغ — أعد المحاولة لاحقا'
  if (status >= 500) return 'الخدمة متعبة الآن، لا المفتاح — أعد المحاولة'
  if (status === 404) return 'العنوان غير موجود — قد تكون الواجهة تغيّرت'
  return `ردّت الخدمة ${status}`
}

export async function verifyKey(
  provider: ProviderName,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyResult> {
  if (key.trim().length === 0) {
    return { ok: false, detail: 'لا مفتاح لهذا المزوّد', status: null }
  }

  let response: Response
  try {
    response = await fetchImpl(ENDPOINTS[provider](key.trim()))
  } catch (error) {
    return {
      ok: false,
      status: null,
      detail: `تعذّر الوصول: ${error instanceof Error ? error.message : 'عطل شبكة'}`,
    }
  }

  if (response.ok) return { ok: true, detail: 'المفتاح يعمل' }
  return { ok: false, detail: explain(response.status), status: response.status }
}
