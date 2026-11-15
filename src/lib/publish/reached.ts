/**
 * ‏**أبلغ المنشورُ منصّتَه؟** (مراجعة D-322) — من صفوف `publish_attempts` وحدها، بجملةٍ واحدة يقرؤها الحذفُ (`privacy/trash.ts`)
 * ‏وقائمةُ البطاقة (`draft/store.ts`)، فلا يفترق ما يُرسم معطَّلًا عمّا يردّه الخادم.
 *
 * ‏كان الحذفُ يسأل عن `sent` و`succeeded` وحدهما. والناشرُ يكتب كلَّ عطلٍ `failed` (`publisher.ts`)، ومنه ما لا يقول أنُشر أم لا:
 * ‏مهلةٌ أو انقطاعٌ (`unconfirmed_send`)، و5xx، وقبولٌ بلا معرّف؛ **وسلسلةُ X نُشر بعضُها** محاولتُها `failed` وعلاماتُ ما نُشر منها في
 * ‏`request_json.tweets` (`xThread.ts`) — وهي ذاكرةُ D-004 الوحيدة لها: تُحذف فتُكتب المسوّدةُ ثانيةً بالمفتاح نفسِه وتُرسَل مرّتين.
 *
 * ‏**فالسؤالُ مقلوب**: لا «أنُشر؟» بل «أثبت أنّه لم يُرسَل؟». ولكلّ محاولةٍ رتبة، وللمنشور أعلاها:
 *
 *   ٣ · `open`  — محاولةٌ `sent` مفتوحة: يُنشر الآن أو قُتل الاستدعاءُ وسطَه (D-269)
 *   ٢ · `out`   — `succeeded`، أو معرّفُ منشورٍ محفوظ، أو تغريدةٌ علامتُها `succeeded`
 *   ١ · `maybe` — تغريدةٌ علامتُها `sent`، أو عطلٌ لم يثبت أنّه قبل الإرسال
 *   ٠ · لم يُرسَل يقينًا — **وعلاماتُ السلسلة تحكم إن وُجدت** (وما سوّاه المالكُ «لم أجدها» صار `failed`، `settleTweet`)؛ وإلّا فحارسٌ
 *       قبل الإرسال (`preflight` · `pre_send` · `sweep` · `dead_letter`)، أو `media_bytes_missing`، أو **ردٌّ قاطعٌ 4xx**
 *
 * ‏**وما لم يُعرف فهو «ربما»**: عطلٌ جديدٌ يُضاف غدًا بسببٍ لم يُسمَّ هنا يُبقي المنشورَ سجلًّا ولا يُحذف — الاتّجاهُ الآمن.
 */

/** رتبةُ منشورٍ من محاولاته: أعلاها. و`null` حين لا محاولة. */
export type Reach = 'open' | 'out' | 'maybe' | null

/** ‏`request_json` و`response_json` نصٌّ يُكتب بـ`JSON.stringify` — ونصٌّ لا يُقرأ لا يُسقط الجملة (`json_valid` قبل كلّ قراءة). */
const json = (col: string): string => `CASE WHEN json_valid(${col}) THEN ${col} END`

/**
 * ‏رتبةُ محاولةٍ واحدة (٠–٣) — تعبيرُ SQL على صفٍّ من `publish_attempts` باسمه في الجملة (`pa` افتراضًا). والمنشورُ `MAX` منها.
 */
export function attemptReachSql(pa = 'pa'): string {
  const req = json(`${pa}.request_json`)
  const res = json(`${pa}.response_json`)
  const tweets = `(SELECT MAX(CASE json_extract(t.value, '$.status') WHEN 'succeeded' THEN 2 WHEN 'sent' THEN 1 ELSE 0 END)
                     FROM json_each(${req}, '$.tweets') t)`
  const unsent = `(coalesce(json_extract(${res}, '$.preflight'), 0) = 1
       OR coalesce(json_extract(${res}, '$.pre_send'), 0) = 1
       OR coalesce(json_extract(${res}, '$.sweep'), 0) = 1
       OR coalesce(json_extract(${res}, '$.dead_letter'), 0) = 1
       OR substr(coalesce(json_extract(${res}, '$.error'), ''), 1, 8) = 'pre_send'
       OR coalesce(json_extract(${res}, '$.error'), '') = 'media_bytes_missing'
       OR coalesce(json_extract(${res}, '$.status'), 0) BETWEEN 400 AND 499)`
  return `(CASE
      WHEN ${pa}.status = 'sent' THEN 3
      WHEN ${pa}.status IN ('succeeded', 'skipped_duplicate') OR ${pa}.platform_post_id IS NOT NULL THEN 2
      ELSE coalesce(${tweets}, CASE WHEN ${unsent} THEN 0 ELSE 1 END)
    END)`
}

/** الرتبةُ رقمًا كما تعيدها `MAX` ← اسمُها. */
export function reachOf(rank: number | null | undefined): Reach {
  return rank === 3 ? 'open' : rank === 2 ? 'out' : rank === 1 ? 'maybe' : null
}
