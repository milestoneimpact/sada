/**
 * مسارُ الأنماط (D-091) — وثلاثةٌ تُثبَت فيه.
 *
 * ١ · **يُسلَّم ببصمته**، ويحمل الأنماطَ لا شيئا آخر.
 * ٢ · **والتخبئةُ دائمة** — وهي كلُّ فائدة البصمة. وبدونها تُطلَب الورقةُ
 *     في كلّ فتحة، **وهي عينُ العلّة التي بُني المسارُ لإغلاقها**.
 * ٣ · **والتعليقاتُ لا تُشحَن** — أربعةٌ وخمسون كيلوبايتا منها، وهي
 *     وثائقُ المطوّر لا المتصفّح.
 */
import { describe, expect, it } from 'vitest'
import { assets } from './assets'
import { STYLE_BODY, STYLE_PATH, stripCss, stripJs } from '../lib/ui/asset'

const env = {} as never

describe('مسارُ الأنماط', () => {
  it('يُسلّم الورقةَ بمسارها', async () => {
    const res = await assets.request(STYLE_PATH, {}, env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/css; charset=utf-8')
    expect(await res.text()).toBe(STYLE_BODY)
  })

  it('**والتخبئةُ دائمة** — وبدونها لا معنى للبصمة', async () => {
    const res = await assets.request(STYLE_PATH, {}, env)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })

  it.each([
    ['بصمةٌ خاطئة', '/a/s.00000000.css'],
    ['بلا بصمة', '/a/s.css'],
    ['مسارٌ مخترَع', '/a/anything.js'],
    ['صعودٌ في المسار', '/a/..%2F..%2Fpanel'],
  ])('٤٠٤ — %s', async (_name, path) => {
    expect((await assets.request(path, {}, env)).status).toBe(404)
  })

  /**
   * **والبصمةُ تتبع المحتوى.** لو ثبتت على تبديلٍ في الأنماط لبقي
   * المتصفّحُ على ورقةٍ قديمة **سنةً كاملة** — فالتخبئةُ `immutable`.
   */
  it('البصمةُ تتبدّل بتبدّل المحتوى', () => {
    expect(STYLE_PATH).toMatch(/^\/a\/s\.[0-9a-f]{8}\.css$/)
  })
})

describe('نزعُ التعليقات', () => {
  it('**لا تعليقَ في الورقة المشحونة** — ولا في المصدر يُحذَف', () => {
    expect(STYLE_BODY).not.toContain('/*')
    expect(STYLE_BODY).not.toContain('*/')
  })

  it('والقواعدُ تبقى — النزعُ لا يقصّ محدّدا', () => {
    for (const rule of [':root{', '.draft{', '.bulkbar{', '@media', '--brand:', '.pv{']) {
      expect(STYLE_BODY).toContain(rule)
    }
  })

  /**
   * **والنزعُ يوفّر أكثرَ من نصف الورقة** — قِيس، ولا يُقدَّر.
   *
   * والحدُّ هنا **أدنى** لا أعلى: يسقط الاختبارُ لو عاد النزعُ لا يعمل
   * (نُقلت التعليقاتُ إلى شكلٍ لا يُمسَك مثلا).
   */
  it('ويوفّر أكثرَ من ثلث ما يُشحَن', async () => {
    const { STYLE } = await import('./ui/styles')
    expect(STYLE_BODY.length).toBeLessThan(STYLE.length * 0.67)
  })
})

/**
 * نزعُ تعليقات JavaScript — **بسطرٍ كاملٍ لا بموضع**.
 *
 * و`//` تقع داخل تعابيرَ نمطيّة: في عدّاد الطول `RE_URL` فيها
 * `https?:\/\/`. **ونزعٌ بالموضع يقصّ التعبيرَ فيسقط النصُّ كلُّه** —
 * خطأُ صياغةٍ يُبيّض الصفحة.
 */
describe('نزعُ تعليقات السكربت', () => {
  it('ينزع سطرَ التعليق', () => {
    expect(stripJs('  // شرحٌ\nvar a=1;')).toBe('var a=1;')
  })

  it('**ولا يمسّ شرطتين داخل تعبيرٍ نمطيّ**', () => {
    const source = 'var RE=/https?:\\/\\/\\S+/gu;'
    expect(stripJs(source)).toBe(source)
  })

  it('ولا شرطتين داخل سلسلة', () => {
    const source = "var u='https://basserh.com';"
    expect(stripJs(source)).toBe(source)
  })

  it('وينزع تعليقَ الكتلة', () => {
    expect(stripJs('/* شرحٌ\n طويل */\nvar a=1;')).toBe('var a=1;')
  })
})

describe('نزعُ تعليقات الأنماط', () => {
  it('ينزع الكتلةَ ويُبقي القاعدة', () => {
    expect(stripCss('/* لماذا */\n.a{color:red}')).toBe('.a{color:red}')
  })

  it('ولا يمسّ محتوى القاعدة', () => {
    expect(stripCss('.a{content:"▾"}')).toBe('.a{content:"▾"}')
  })
})
