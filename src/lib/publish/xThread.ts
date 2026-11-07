/**
 * ‏**سلسلةُ X — تغريدةً بعد تغريدة** (D-324).
 *
 * ‏الناشرُ (`publisher.ts`) يفحص المنشورَ كلَّه مرّةً — الاعتمادُ والحسابُ والإذنُ والنطاقُ والوسيط — ويكتب محاولتَه الواحدة
 * ‏`sent`، ثمّ يسلّم التغريداتِ إلى هنا. **ولكلّ تغريدةٍ الترتيبُ نفسُه الذي للمنشور الواحد**:
 *
 *   ١ · مفتاحُها `<مفتاح المنشور>#<رقمها>` (D-004) — **ونجحت في محاولةٍ سابقة؟ لا تُرسَل**، ويُردّ على معرّفها
 *   ٢ · تُعلَّم `sent` قبل الإرسال (D-269): أُرسلت ولم يُعرَف جوابُها؟ تقف السلسلةُ ويُقال
 *   ٣ · **كلفتُها في الدفتر قبل أن تُعدّ** (D-008) — كلُّ تغريدةٍ طلبٌ مدفوع، وبرابطٍ ثلاثةَ عشرَ ضعفًا
 *   ٤ · ترسل ردًّا على التي قبلها (`reply.in_reply_to_tweet_id`)، والوسيطُ مع الأولى وحدها
 *   ٥ · `succeeded` بمعرّفها، أو `failed` بسببه — **والسلسلةُ تقف عند أوّل ما لم ينجح**
 *
 * ## وأين تُحفَظ علاماتُ التغريدات
 *
 * ‏في `request_json` لمحاولة المنشور نفسِها (`tweets`)، تُكتب قبل كلّ إرسالٍ وبعده — **لا صفٌّ في `publish_attempts` لكلّ
 * ‏تغريدة**: كلُّ قارئٍ للنشر (التقريرُ والبوّاباتُ والمحاورُ وذروةُ الساعات) يربط المنشورَ بمحاولته الناجحة، فعشرُ تغريداتٍ
 * ‏ناجحةٍ كانت تعدّه عشرة. **ولا جدولٌ جديد**: ما يحتاجه الاستئنافُ قائمٌ في صفوف المحاولات، وترحيلٌ لا يلزم لا يُكتب.
 * ‏و`request_json` لا يُمحى عند الفشل (الناشرُ يكتب السببَ في `response_json`)، فالإعادةُ تقرأ علاماتِ كلّ محاولةٍ قبلها.
 *
 * ‏فالإعادةُ — من الطابور على ‏429، أو بـ«أعده» بعد رفض — **تبدأ من أوّل تغريدةٍ لم تنجح وتردّ على آخر ما نجح**. ولا
 * ‏تُرسَل تغريدةٌ نجحت مرّتين ولا تُدفَع مرّتين.
 *
 * ‏**ونصٌّ تبدّل بعد أن نُشر بعضُه** (أُعيد إلى المسوّدة وعُدّل) لا يُكمَل فوق ما نُشر: بصمةُ كلّ تغريدةٍ نجحت تُقارَن بنصّها
 * ‏الآن، والفرقُ يُقال (`thread_changed`) ولا يُرسَل شيء — سلسلةٌ أوّلُها قديمٌ وآخرُها جديد ليست ما اعتمده أحد.
 */
import { estimatePostCost, recordCost } from '../cost'
import { containsUrl } from '../idempotency'
import { isTimeout } from '../net/timeout'
import { digest } from '../security/digest'
import type { Db } from '../tokens'
import { PublishError, publishX, type PublishResult } from './platforms'

export interface ThreadPost {
  readonly id: string
  readonly org_id: string
  readonly idempotency_key: string
}

/** محاولةُ المنشور الجارية: معرّفُها وما كُتب في `request_json` قبل الإرسال. */
export interface ThreadAttempt {
  readonly id: string
  readonly request: Readonly<Record<string, unknown>>
}

/** علامةُ تغريدةٍ في `request_json.tweets`. */
export interface TweetMark {
  readonly no: number
  readonly key: string
  /** بصمةُ نصّها لا نصُّها: ما يُقارَن به لا يحتاج أن يُنسَخ. */
  readonly digest: string
  readonly status: 'sent' | 'succeeded' | 'failed'
  readonly id?: string
  readonly error?: string
}

async function fingerprintOf(text: string): Promise<string> {
  const bytes = await digest(text)
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** تفصيلُ الخطأ بلا بادئة المنصّة: «x: رفض النشر (…)» ← «رفض النشر (…)». */
function detailOf(error: unknown): string {
  if (error instanceof PublishError) return error.message.replace(/^x:\s*/, '')
  return isTimeout(error) ? 'unconfirmed_send: timeout' : 'unconfirmed_send: network'
}

/**
 * ‏ما عُلِّم لكلّ تغريدةٍ في المحاولات السابقة — **والنجاحُ يغلب ما بعده**: تغريدةٌ نجحت مرّةً نجحت.
 */
async function priorMarks(db: Db, post: ThreadPost, current: string): Promise<Map<number, TweetMark>> {
  const { results } = await db
    .prepare('SELECT id, request_json FROM publish_attempts WHERE post_id = ? AND org_id = ? ORDER BY attempt_no')
    .bind(post.id, post.org_id)
    .all<{ id: string; request_json: string }>()
  const out = new Map<number, TweetMark>()
  for (const row of results) {
    if (row.id === current) continue
    let marks: unknown
    try {
      marks = (JSON.parse(row.request_json) as { tweets?: unknown }).tweets
    } catch {
      continue
    }
    if (!Array.isArray(marks)) continue
    for (const m of marks as TweetMark[]) {
      if (typeof m?.no !== 'number') continue
      if (out.get(m.no)?.status === 'succeeded') continue
      out.set(m.no, m)
    }
  }
  return out
}

/** ينشر السلسلةَ ويعيد معرّفَ أوّل تغريدة — وهو ما يُحفَظ في محاولة المنشور الواحدة. */
export async function publishXThread(
  db: Db,
  post: ThreadPost,
  attempt: ThreadAttempt,
  tweets: readonly string[],
  accessToken: string,
  fetchImpl: typeof fetch,
  mediaId: string | null,
): Promise<PublishResult> {
  const before = await priorMarks(db, post, attempt.id)
  const marks: TweetMark[] = []
  // ‏العلاماتُ تُكتب في محاولة المنشور قبل الإرسال وبعده — والكتابةُ قبل الإرسال هي ما يجعل الإعادةَ تعرف
  const keep = async (): Promise<void> => {
    await db
      .prepare('UPDATE publish_attempts SET request_json = ? WHERE id = ? AND org_id = ?')
      .bind(JSON.stringify({ ...attempt.request, tweets: marks }), attempt.id, post.org_id)
      .run()
  }
  const ids: string[] = []
  let previous: string | null = null
  for (const [i, tweet] of tweets.entries()) {
    const no = i + 1
    const key = `${post.idempotency_key}#${no}`
    const print = await fingerprintOf(tweet)
    const was = before.get(no)

    // ١ · نجحت من قبل: لا تُرسَل، ويُردّ على معرّفها
    if (was?.status === 'succeeded' && typeof was.id === 'string' && was.id !== '') {
      if (was.digest !== print) {
        throw new PublishError(
          `thread_changed: التغريدة ${no} نُشرت على X بنصٍّ غيرِ الذي في المنشور الآن، فلا تُكمَل السلسلةُ فوقها`,
          409,
          false,
        )
      }
      marks.push(was)
      previous = was.id
      ids.push(previous)
      continue
    }
    // ٢ · أُرسلت ولم يُعرَف جوابُها (قُتل الاستدعاءُ وسطَ النداء): لا تُرسَل ثانيةً قبل أن يتحقّق المالك
    if (was?.status === 'sent') {
      throw new PublishError(`thread_unconfirmed: التغريدة ${no} أُرسلت ولم يُعرَف جوابُها — تحقّق على X قبل أن تعيدها`, 0, false)
    }
    marks.push({ no, key, digest: print, status: 'sent' })
    await keep()

    // ٣ · الكلفةُ قبل الإرسال (D-008)
    const hasUrl = containsUrl(tweet)
    const unitCost = estimatePostCost('x', hasUrl)
    if (unitCost > 0) {
      await recordCost(db, {
        provider: 'x',
        operation: hasUrl ? 'create_post_with_url' : 'create_post',
        units: 1,
        unitCost,
        refId: post.id,
        org: post.org_id,
      })
    }

    // ٤ · ردًّا على التي قبلها، والوسيطُ مع الأولى وحدها
    let out: PublishResult
    try {
      out = await publishX(accessToken, tweet, fetchImpl, i === 0 ? mediaId : null, previous)
    } catch (error) {
      const detail = detailOf(error)
      marks[marks.length - 1] = { no, key, digest: print, status: 'failed', error: detail.slice(0, 300) }
      await keep()
      // ‏والسببُ يقول أين وقفت وما مضى: «أعده» يكمل من هنا ولا يعيد ما نُشر
      const said = `x: التغريدة ${no} من ${tweets.length} لم تُنشَر (${detail})${
        ids.length === 0 ? '' : ` — نُشرت قبلها ${ids.length} ولا تُعاد، والإعادةُ تُكمل منها`}`
      throw error instanceof PublishError
        ? new PublishError(said, error.status, error.retryable)
        : new PublishError(said, 0, false)
    }

    // ٥ · نجحت
    marks[marks.length - 1] = { no, key, digest: print, status: 'succeeded', id: out.platformPostId }
    await keep()
    previous = out.platformPostId
    ids.push(previous)
  }
  return { platformPostId: ids[0]!, request: { thread: tweets.length }, response: { thread: ids } }
}
