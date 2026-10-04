/**
 * مسارُ الخطّ (D-099) — وما يُختبَر فيه ثلاثةٌ لا واحد.
 *
 * ١ · **يُسلَّم بالبصمة**: المسارُ الذي ولّده السكربت يعطي بايتات.
 * ٢ · **وما عداه ‏٤٠٤**: اسمٌ مخترَعٌ أو بصمةٌ قديمةٌ لا تعطي شيئا.
 * ٣ · **والتخبئةُ دائمةٌ فعلا**: `immutable` هي كلُّ فائدة البصمة —
 *     وبدونها يُطلَب الخطُّ في كلّ فتحة، **وهي عينُ العلّة التي بُني
 *     المسارُ لإغلاقها**.
 */
import { describe, expect, it } from 'vitest'
import { fonts } from './fonts'
import { FACES, PLEX_AR_400, PLEX_AR_600, PLEX_SANS } from '../lib/ui/fonts'

const env = {} as never

describe('مسارُ الخطّ', () => {
  it('يُسلّم الأوجهَ الثلاثة بمساراتها', async () => {
    expect(FACES).toEqual([PLEX_AR_400, PLEX_AR_600, PLEX_SANS])
    for (const face of FACES) {
      const res = await fonts.request(face.path, {}, env)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('font/woff2')
      expect((await res.arrayBuffer()).byteLength).toBe(face.bytes)
    }
  })

  it('**والتخبئةُ دائمة** — وبدونها لا معنى للبصمة', async () => {
    const res = await fonts.request(PLEX_AR_400.path, {}, env)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })

  it.each([
    ['اسمٌ مخترَع', '/f/plex-ar-400.woff2'],
    ['بصمةٌ خاطئة', '/f/plex-ar-400.00000000.woff2'],
    ['أسرةٌ لا وجودَ لها', `/f/tajawal.${PLEX_AR_400.hash}.woff2`],
    // ‏وخطٌّ خرج من اللوحة (D-185) لا يُخدَم بمساره القديم ولو بقيت حزمتُه لخطوط الصور
    ['وجهٌ خرج من اللوحة', '/f/beiruti.39b09ced.woff2'],
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
    const one = await (await fonts.request(PLEX_SANS.path, {}, env)).arrayBuffer()
    const two = await (await fonts.request(PLEX_SANS.path, {}, env)).arrayBuffer()
    expect(one.byteLength).toBe(PLEX_SANS.bytes)
    expect(new Uint8Array(one)).toEqual(new Uint8Array(two))
  })

  /**
   * **و`woff2` يُعرَف بتوقيعه**: أوّلُ أربعةِ بايتاتٍ «wOF2».
   * فلو ولّد السكربتُ يوما ملفّا خاطئا — أو فُكّ `base64` فُكّا معطوبا —
   * لم يظهر ذلك في الطول، **وظهر هنا**.
   */
  it('البايتاتُ woff2 حقًّا لا نصٌّ أو ملفٌّ آخر', async () => {
    const bytes = new Uint8Array(await (await fonts.request(PLEX_AR_400.path, {}, env)).arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('wOF2')
  })

  /**
   * **وزوجُ Plex بوزنين وسقفٍ** (D-185): العربيُّ ‏٤٠٠ و‏٦٠٠، واللاتينيُّ مقصورٌ عليهما،
   * ولكلٍّ نطاقُه من ورقة حزمته — فالعربيُّ لا يأخذ الرقمَ واللاتينيُّ لا يأخذ الحرفَ
   * العربيّ. والمجموعُ تحت السقف المعلَن في `embed_ui_font.mjs`.
   */
  it('وزنان لا غير، ونطاقان لا يتداخلان، وتحت ‏١٤٠KB', () => {
    expect(FACES.map((f) => f.weight)).toEqual(['400', '600', '400 600'])
    expect(new Set(FACES.map((f) => f.family))).toEqual(new Set(['Plex Arabic', 'Plex Sans']))
    expect(PLEX_AR_400.unicodeRange).toMatch(/^U\+0600-06FF,/)
    expect(PLEX_AR_400.unicodeRange).not.toContain('U+0000-00FF')
    expect(PLEX_SANS.unicodeRange).toMatch(/^U\+0000-00FF,/)
    expect(PLEX_SANS.unicodeRange).not.toContain('U+0600')
    expect(FACES.reduce((n, f) => n + f.bytes, 0) / 1024).toBeLessThanOrEqual(140)
  })
})
