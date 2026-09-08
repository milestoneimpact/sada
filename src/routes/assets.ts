/**
 * `‎/a/:file` — ورقةُ الأنماط من مسارٍ مخبَّأ (D-101).
 *
 * ## ولا جلسةَ عليه
 *
 * كمسار الخطّ (D-099): يعطي بايتاتٍ بلا جلسة. **ولا يحرس شيئا** — ورقةُ
 * أنماطٍ لا تقول عن النظام حرفا، ولا تحمل اسمَ مصدرٍ ولا حالَ قناة.
 *
 * **وقبل كلّ حارس**: تطلبه صفحةُ الدخول نفسُها، ولا جلسةَ بعدُ ليُحرَس
 * بها. وحارسٌ يردّه يُخرج شاشةَ دخولٍ بلا أنماط.
 *
 * ## والمطابقةُ على المسار الكامل
 *
 * لا يُقرأ الاسمُ ليُبنى منه مسارُ ملفّ — **ولا ملفّاتِ قرصٍ هنا أصلا**.
 * فما لا يطابق البصمةَ المعروفةَ يُردّ ‏٤٠٤.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { STYLE_BODY, STYLE_PATH } from '../lib/ui/asset'
import { BASE_HEADERS } from '../lib/security/headers'

export const assets = new Hono<{ Bindings: Env }>()

assets.get('/a/:file', (c) => {
  if (`/a/${c.req.param('file')}` !== STYLE_PATH) {
    return new Response('لا مورد', {
      status: 404,
      headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(STYLE_BODY, {
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'text/css; charset=utf-8',
      // **سنةٌ و`immutable`**: البصمةُ في الاسم، فالورقةُ بهذا الاسم لا
      // تتبدّل أبدا — و`immutable` تمنع السؤالَ عنها ولو أُعيد التحميلُ بالقوّة
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
})
