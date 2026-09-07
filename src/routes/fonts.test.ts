/**
 * مسارُ الخطّ (D-089) — وما يُختبَر فيه ثلاثةٌ لا واحد.
 *
 * ١ · **يُسلَّم بالبصمة**: المسارُ الذي ولّده السكربت يعطي بايتات.
 * ٢ · **وما عداه ‏٤٠٤**: اسمٌ مخترَعٌ أو بصمةٌ قديمةٌ لا تعطي شيئا.
 * ٣ · **والتخبئةُ دائمةٌ فعلا**: `immutable` هي كلُّ فائدة البصمة —
 *     وبدونها يُطلَب الخطُّ في كلّ فتحة، **وهي عينُ العلّة التي بُني
 *     المسارُ لإغلاقها**.
 */
import { describe, expect, it } from 'vitest'
import { fonts } from './fonts'
import { BEIRUTI, FACES, INTER } from '../lib/ui/fonts'

const env = {} as never

describe('مسارُ الخطّ', () => {
  it('يُسلّم الوجهين بمساريهما', async () => {
    for (const face of FACES) {
      const res = await fonts.request(face.path, {}, env)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('font/woff2')
      expect((await res.arrayBuffer()).byteLength).toBe(face.bytes)
    }
  })

  it('**والتخبئةُ دائمة** — وبدونها لا معنى للبصمة', async () => {
    const res = await fonts.request(BEIRUTI.path, {}, env)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })

  it.each([
    ['اسمٌ مخترَع', '/f/beiruti.woff2'],
    ['بصمةٌ خاطئة', '/f/beiruti.00000000.woff2'],
    ['أسرةٌ لا وجودَ لها', '/f/tajawal.39b09ced.woff2'],
    ['صعودٌ في المسار', '/f/..%2F..%2Fpanel'],
  ])('٤٠٤ — %s', async (_name, path) => {
    const res = await fonts.request(path, {}, env)
    expect(res.status).toBe(404)
  })

  /**
   * **والبايتاتُ تُفكّ مرّةً**: الخريطةُ في `fonts.ts` تحفظ المفكوك،
   * وطلبان يعطيان الطولَ نفسَه — فلو أفسد الحفظُ شيئا ظهر هنا.
   */
  it('طلبان متتاليان يعطيان البايتات نفسَها', async () => {
    const one = await (await fonts.request(INTER.path, {}, env)).arrayBuffer()
    const two = await (await fonts.request(INTER.path, {}, env)).arrayBuffer()
    expect(one.byteLength).toBe(INTER.bytes)
    expect(new Uint8Array(one)).toEqual(new Uint8Array(two))
  })

  /**
   * **و`woff2` يُعرَف بتوقيعه**: أوّلُ أربعةِ بايتاتٍ «wOF2».
   * فلو ولّد السكربتُ يوما ملفّا خاطئا — أو فُكّ `base64` فُكّا معطوبا —
   * لم يظهر ذلك في الطول، **وظهر هنا**.
   */
  it('البايتاتُ woff2 حقًّا لا نصٌّ أو ملفٌّ آخر', async () => {
    const bytes = new Uint8Array(await (await fonts.request(BEIRUTI.path, {}, env)).arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('wOF2')
  })
})
