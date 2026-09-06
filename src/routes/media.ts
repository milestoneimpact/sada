/**
 * `‎/m/:token` — النافذةُ العامّة الموقّتة على وسيطٍ في R2 (D-050).
 *
 * ## مَن يفتحها ليس متصفّحا
 *
 * خادمُ Instagram أو TikTok أو YouTube يسحب الوسيطَ بنفسه: **لا جلسةَ
 * له ولا كعكة**. فهذه هي النافذةُ الوحيدة في صدى التي تعطي بايتاتٍ بلا
 * جلسة — ولذلك حُرست بأربعةٍ لا بواحد:
 *
 * ١ · **توقيعٌ** بمفتاحٍ مشتقٍّ من أسرار Worker: المعرّفُ وحده لا يفتح.
 * ٢ · **مدّةٌ** خمسَ عشرةَ دقيقة، تُفحَص في كلّ طلب.
 * ٣ · **وسيطٌ بعينه**: التوقيعُ يشمل المعرّف، فلا يفتح رابطٌ غيرَه.
 * ٤ · **حالٌ**: ما رُفض من الوسائط لا يُسلَّم ولو صحّ توقيعُه.
 *
 * ## ولا يُقال أيُّ الأربعة سقط
 *
 * الجوابُ 404 في كلّ الحالات: توقيعٌ خاطئ، أو منتهٍ، أو معرّفٌ لا وجود
 * له. **والتفريقُ يعطي المهاجمَ مقياسا** — «هذا المعرّف موجودٌ ولكنّ
 * توقيعك خطأ» تقول له أين يُلحّ.
 *
 * والسببُ الحقيقيّ يُكتب في السجلّ عندنا، لا في الجواب عنده.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { verifyMediaToken } from '../lib/media/link'
import { BASE_HEADERS } from '../lib/security/headers'

export const media = new Hono<{ Bindings: Env }>()

/** جوابٌ واحدٌ لكلّ رفض — ولا يُفرَّق بين أسبابه. */
function notFound(): Response {
  return new Response('لا وسيط', {
    status: 404,
    headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

media.get('/m/:token', async (c) => {
  const verdict = await verifyMediaToken(c.env.TOKEN_ENC_KEY, c.req.param('token')).catch(
    () => ({ ok: false as const, reason: 'malformed' as const }),
  )
  if (!verdict.ok) {
    console.log({ job: 'media_link', denied: verdict.reason })
    return notFound()
  }

  const row = await c.env.DB
    .prepare(`SELECT r2_key, mime, status FROM media WHERE id = ?`)
    .bind(verdict.mediaId)
    .first<{ r2_key: string; mime: string; status: string }>()
    .catch(() => null)

  // ما رُفض لا يُسلَّم ولو صحّ توقيعُه: المالك حكم عليه، والتوقيعُ أقدمُ
  // من حكمه — ورابطٌ وُقّع قبل الرفض يبقى صالحا دقائقَ بعده
  if (row === null || row.status !== 'ready') {
    console.log({ job: 'media_link', denied: 'not_ready' })
    return notFound()
  }

  const object = await c.env.MEDIA.get(row.r2_key)
  if (object === null) {
    console.log({ job: 'media_link', denied: 'no_bytes' })
    return notFound()
  }

  return new Response(object.body as unknown as BodyInit, {
    headers: {
      ...BASE_HEADERS,
      'Content-Type': row.mime,
      // **لا تخزين مشترك**: وسيطٌ خلف نافذةٍ موقّتة لا يُترَك في وسيطٍ
      // عامّ بعد أن تُغلق. و`private` تمنع أن تحتفظ به شبكةُ توصيل
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex, nofollow',
      // ويُدهَس ما ورثه من BASE_HEADERS: المنصّةُ تسحبه من أصلٍ آخر
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  })
})
