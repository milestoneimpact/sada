import { describe, expect, it } from 'vitest'
import { routeMismatch } from './routes'

/**
 * **نموذجٌ بقي من مزوّدٍ سابق** (D-083).
 *
 * رُئي في اللوحة: بُدّل المزوّدُ إلى Cloudflare وبقيت نماذجُ Gemini
 * معروضةً، فحُفظ توجيهٌ لا يعمل — ولا شيءَ يقول ذلك حتّى أوّل نداءٍ مدفوع.
 */
describe('حارس التوجيه — ما بقي من مزوّد سابق لا يُحفَظ', () => {
  it('بُدّل المزوّد والنموذج هو نموذج السابق حرفا — يُردّ', () => {
    const said = routeMismatch(
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      { provider: 'cloudflare', model: 'gemini-2.5-flash' },
      true,
    )
    expect(said).not.toBeNull()
    expect(said).toContain('gemini')
    expect(said).toContain('حدّث')
  })

  it('وبُدّل المزوّد **والنموذج معه** — يمرّ، فهذا هو الصواب', () => {
    expect(
      routeMismatch(
        { provider: 'gemini', model: 'gemini-2.5-flash' },
        { provider: 'cloudflare', model: '@cf/black-forest-labs/flux-1-schnell' },
        true,
      ),
    ).toBeNull()
  })

  it('وبقاء المزوّد نفسِه مع نموذجه ليس عطلا — حفظ سعر لا يُردّ', () => {
    expect(
      routeMismatch(
        { provider: 'gemini', model: 'gemini-2.5-flash' },
        { provider: 'gemini', model: 'gemini-2.5-flash' },
        false,
      ),
    ).toBeNull()
  })

  it('ولا سابق يعني لا حكم — أوّل حفظ يمرّ', () => {
    expect(routeMismatch(null, { provider: 'cloudflare', model: 'gemini-2.5-flash' }, true)).toBeNull()
  })

  it('و`@cf/` عند غير Cloudflare **خطأ مقطوع به** — لا أحد غيرها يخدمها', () => {
    const said = routeMismatch(null, { provider: 'openai', model: '@cf/meta/llama-3.3-70b' }, false)
    expect(said).toContain('Workers AI')
  })

  it('و`@cf/` عند Cloudflare يمرّ', () => {
    expect(
      routeMismatch(null, { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b' }, true),
    ).toBeNull()
  })
})
