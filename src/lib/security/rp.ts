/**
 * هويّةُ الطرف المعتمِد (Relying Party) — النطاق الذي تُوقَّع عليه المفاتيح.
 *
 * **وهي مأخوذةٌ من `PUBLIC_BASE_URL` حرفيّا، لا مجموعةً بين النطاقين.**
 *
 * وكان يغريني أن أجعلها `basserh.com` فيعمل مفتاحٌ واحدٌ على الإنتاج
 * والتجريب معا. وهو ما يخالف قاعدة المشروع: النطاقان لا يُخلطان في
 * callback ولا في ثابتٍ ولا في وثيقة. وأثرُه الأمنيّ أوضح من أثره
 * التنظيميّ: مفتاحٌ سُجّل على لوحة التجريب يصير مفتاحا يفتح الإنتاج —
 * فتضيع الحدودُ التي بُنيت البيئتان عليها.
 *
 * فالمالك يسجّل مفتاحا على كلّ بيئة. وهي كلفةُ دقيقةٍ مرّةً واحدة.
 */

export interface RelyingParty {
  /** اسمُ النطاق وحده: `sada2.basserh.com`. */
  readonly id: string
  /** الأصلُ كاملا كما يراه المتصفّح: `https://sada2.basserh.com`. */
  readonly origin: string
  /** ما يُعرض في نافذة المتصفّح. */
  readonly name: string
}

export function relyingParty(publicBaseUrl: string): RelyingParty {
  let url: URL
  try {
    url = new URL(publicBaseUrl)
  } catch {
    // بيئةٌ بلا عنوانٍ صالح: لا تُخترع قيمة. `localhost` يجعل التسجيل
    // يفشل فشلا مفهوما بدل أن ينجح على نطاقٍ لا يقصده أحد
    return { id: 'localhost', origin: 'http://localhost', name: 'صدى' }
  }
  return {
    id: url.hostname,
    origin: url.origin,
    name: `صدى · ${url.hostname}`,
  }
}
