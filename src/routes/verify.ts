/**
 * ملفّاتُ إثبات ملكيّة النطاق — **تُنشَر مع الشيفرة لا تُرفَع يدا** (D-094).
 *
 * ## ما هي
 *
 * تطلب المنصّاتُ إثباتَ أنّ من يضبط التطبيق يملك النطاق: تعطي ملفّا
 * باسمٍ فريدٍ ومحتوى فريد، ويجب أن يُخدَم على جذر النطاق حرفا بحرف.
 * TikTok تطلبه قبل أن تقبل **رابطَ عودة** على نطاقٍ مخصَّص.
 *
 * ## ولماذا في الشيفرة لا في رفعٍ يدويّ
 *
 * صدى **Worker لا استضافةُ ملفّات**: لا مجلَّدَ جذرٍ يُلقى فيه ملفّ.
 * ووضعُه في R2 يجعله بايتاتٍ لا يشير إليها شيءٌ في المستودع — فمن قرأ
 * الشيفرةَ بعد سنةٍ لا يعرف لماذا يُخدَم، **ومن أعاد بناءَ الدلو محاه
 * فسقطت المراجعةُ صامتة**.
 *
 * وهي حجّةُ `legal.ts` نفسُها: «تُنشر مع الشيفرة، ويُتحقَّق من فتحها في
 * سجلّ النشر نفسه» (D-038).
 *
 * ## وليست سرّا
 *
 * **الغرضُ منها أن تُقرأ من الخارج بلا إذن.** فلا تدخل أسرارَ Worker،
 * ولا يمسّها منعُ الفهرسة: مَن أراد إخفاءَها أبطلها.
 *
 * ## والمحتوى حرفٌ بحرف
 *
 * المنصّةُ تقارن النصَّ كما أعطته. **وسطرٌ جديدٌ في آخره قد يُسقط
 * المطابقة** — والملفُّ المنزَّل من TikTok ثمانيةٌ وستّون بايتا بلا سطرٍ
 * جديد. فيُخدَم كما هو، ويحرسه اختبار.
 */
import { Hono } from 'hono'
import type { Env } from '../env'

export interface SiteVerification {
  /** المنصّةُ الطالبة — يُقرأ ليُعرَف لماذا يبقى الملفّ. */
  readonly platform: string
  /** اسمُ الملفّ كما تطلبه المنصّة — بلا شرطةٍ مائلة. */
  readonly file: string
  /** المحتوى حرفا بحرف، بلا سطرٍ جديدٍ في آخره. */
  readonly body: string
  /** ما يُفتَح به — فملفٌّ لا يُعرَف سببُه يُحذَف يوما فتسقط المراجعة. */
  readonly why: string
}

export const VERIFICATIONS: readonly SiteVerification[] = [
  {
    platform: 'tiktok',
    file: 'tiktokN1WYOuMzZInIGczXYTbkHqsu05KyYWy0.txt',
    body: 'tiktok-developers-site-verification=N1WYOuMzZInIGczXYTbkHqsu05KyYWy0',
    why:
      'إثبات ملكيّة النطاق في TikTok for Developers — ' +
      'وبدونه لا يُقبَل رابط العودة، فلا يعمل الربط (M-14).',
  },
]

export const verify = new Hono<{ Bindings: Env }>()

for (const record of VERIFICATIONS) {
  verify.get(`/${record.file}`, (c) =>
    c.body(record.body, 200, {
      'Content-Type': 'text/plain; charset=utf-8',
      // **ولا تُخمَّن**: مطابِقُ المنصّة يقرأ بايتاتٍ لا صفحة
      'X-Content-Type-Options': 'nosniff',
      // ساعةٌ تكفي: يُقرأ مرّةً عند التحقّق ثمّ نادرا
      'Cache-Control': 'public, max-age=3600',
    }),
  )
}
