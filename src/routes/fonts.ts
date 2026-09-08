/**
 * `‎/f/:file` — خطّا اللوحة من أصلنا لا من شبكةٍ ثالثة (D-099).
 *
 * ## ولماذا مسارٌ لا ضمٌّ في الوثيقة
 *
 * `data:` URI في `@font-face` يعمل — **ويُحمَّل مع كلّ فتحةٍ للصفحة**.
 * ولوحةٌ تُفتَح عشرَ مرّاتٍ في اليوم تدفع ‏١٠٣KB في كلّ مرّة، ولا
 * يخبّئها المتصفّح لأنّها ليست موردا له عنوان.
 *
 * **فمسارٌ ببصمةٍ في اسمه**: يُخبَّأ للأبد (`immutable`)، ويُبدَّل اسمُه
 * إذا بُدّل الخطّ — فلا شيخوخةَ ولا إبطالٌ يدويّ.
 *
 * ## ولا جلسةَ عليه
 *
 * كـ `/m/:token` (D-050)، هذا مسارٌ يعطي بايتاتٍ بلا جلسة. **والفرقُ
 * أنّه لا يحرس شيئا**: الخطُّ عامٌّ برخصةٍ مفتوحة، ولا يقول عن النظام
 * حرفا. فلا توقيعَ ولا مدّة — والحراسةُ الوحيدةُ أنّ ما لا يُطابق
 * بصمةً معروفةً يُردّ ‏٤٠٤.
 *
 * ## والبصمةُ تُطابَق كاملةً
 *
 * لا يُقرأ الاسمُ ليُبنى منه مسارُ ملفّ — **ولا ملفّاتِ قرصٍ هنا أصلا**،
 * والوجوهُ في الحزمة. فالمطابقةُ على المسار الكامل كما ولّده السكربت،
 * وما عداه ‏٤٠٤.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { FACES } from '../lib/ui/fonts'
import { BASE_HEADERS } from '../lib/security/headers'

export const fonts = new Hono<{ Bindings: Env }>()

/**
 * البايتاتُ تُفكَّ مرّةً في كلّ عاملٍ لا مرّةً في كلّ طلب.
 *
 * فكُّ `base64` لمئةِ كيلوبايتٍ عملٌ يُذكَر، **ويتكرّر بلا فائدة**: الوجهُ
 * لا يتبدّل ما دام العاملُ حيًّا. والخريطةُ تُملأ عند أوّل طلب.
 */
const decoded = new Map<string, Uint8Array>()

function bytesOf(b64: string): Uint8Array {
  const cached = decoded.get(b64)
  if (cached !== undefined) return cached
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  decoded.set(b64, out)
  return out
}

fonts.get('/f/:file', (c) => {
  const path = `/f/${c.req.param('file')}`
  const face = FACES.find((f) => f.path === path)
  if (face === undefined) {
    return new Response('لا خطّ', {
      status: 404,
      headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(bytesOf(face.b64) as unknown as BodyInit, {
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'font/woff2',
      // **سنةٌ و`immutable`**: البصمةُ في الاسم، فالملفُّ بهذا الاسم لا
      // يتبدّل أبدا. و`immutable` تمنع المتصفّحَ من السؤال عنه ثانيةً
      // ولو أُعيد تحميلُ الصفحة بالقوّة
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
})
