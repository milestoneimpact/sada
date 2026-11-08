/**
 * ‏**سلسلةُ X — تغريدةً بعد تغريدة** (D-324).
 *
 * ‏الناشرُ (`publisher.ts`) يفحص المنشورَ كلَّه مرّةً — الاعتمادُ والحسابُ والإذنُ والنطاقُ والوسيط — ويكتب محاولتَه الواحدة
 * ‏`sent`، ثمّ يسلّم التغريداتِ إلى هنا. **ولكلّ تغريدةٍ الترتيبُ نفسُه الذي للمنشور الواحد**:
 *
 *   ١ · مفتاحُها `<مفتاح المنشور>#<رقمها>` (D-004) — **ونجحت في محاولةٍ سابقة؟ لا تُرسَل**، ويُردّ على معرّفها
 *   ٢ · **كلفتُها في الدفتر قبل أن تُعدّ** (D-008) — كلُّ تغريدةٍ طلبٌ مدفوع، وبرابطٍ ثلاثةَ عشرَ ضعفًا
 *   ٣ · تُعلَّم `sent` قبل الإرسال (D-269): أُرسلت ولم يُعرَف جوابُها؟ تقف السلسلةُ ويُقال. وعطلُ القاعدة في ٢ أو ٣ لم يُرسِل
 *       شيئًا، فيُرمى `pre_send` قابلًا للإعادة (تحقّق D-320 على main)
 *   ٤ · ترسل ردًّا على التي قبلها (`reply.in_reply_to_tweet_id`)، والوسيطُ مع الأولى وحدها
 *   ٥ · `succeeded` بمعرّفها، أو `failed` حين **ردّتها X ردًّا قاطعًا** (4xx ومنه ‏429) — **والسلسلةُ تقف عند أوّل ما لم ينجح**
 *
 * ## وما لم يُعرَف جوابُه يبقى `sent` (مراجعة D-324)
 *
 * ‏المهلةُ وانقطاعُ الشبكة و5xx وجوابٌ بلا `data.id` لا تقول أنُشرت أم لا — وعلى X قد تكون نُشرت. فكانت تُعلَّم `failed`
 * ‏ويُقال «لم تُنشَر … والإعادةُ تُكمل منها»، فيرسل «أعده» التغريدةَ ثانيةً **فتتكرّر في السلسلة وتُدفع مرّتين**. فتبقى علامتُها
 * ‏`sent` والسببُ `thread_unconfirmed` («لم يُؤكَّد» لا «لم تُنشَر»)، و«أعده» يرفضها (`requeue` ← `unsettledTweet`) **حتّى يقول
 * ‏المالكُ ما وجده على X** (`settleTweet`): «لم أجدها» تُعلّمها فاشلةً فتُرسَل، و«وجدتُها» برابطها تُعلّمها ناجحةً بمعرّفها فيُردّ عليها.
 * ‏وتحديثُ العلامة بعد نجاحٍ إن سقط يُقال كذلك: نُشرت ولم يُحفظ معرّفُها، فالإعادةُ لا تعيدها.
 *
 * ## والسلسلةُ لحسابٍ واحد
 *
 * ‏كلُّ علامةٍ تحمل `author` — معرّفَ الحساب على X (`accounts.external_id`). و«أعده» يمحو الحساب، فإن جُدولت على حسابٍ آخر
 * ‏ردّتها الجدولةُ (`threadAuthor` في `schedulePost`)، **وإن وصلت الناشرَ ردّها هنا** (`thread_account`) ولا يُرسَل شيء: ردٌّ من
 * ‏حسابٍ على تغريدة حسابٍ آخر سلسلةٌ مشقوقةٌ بين حسابين.
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
import { changedRows } from '../dbResult'
import { containsUrl } from '../idempotency'
import { isTimeout } from '../net/timeout'
import { digest } from '../security/digest'
import type { Db } from '../tokens'
import { PublishError, publishX, type PublishResult } from './platforms'

export interface ThreadPost {
  readonly id: string
  readonly org_id: string
  readonly idempotency_key: string
  /** معرّفُ الحساب على X — ما تُنسَب إليه كلُّ تغريدة، فلا تُكمَل السلسلةُ من حسابٍ آخر. */
  readonly external_id: string
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
  /** معرّفُ الحساب على X الذي أرسلها (`accounts.external_id`). */
  readonly author?: string
  readonly id?: string
  readonly error?: string
  /** «قال المالكُ ما وجده على X» (`settleTweet`): `found` أو `missing`. */
  readonly settled?: 'found' | 'missing'
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

/** ‏ما وقع لطلبٍ لم يُعرَف جوابُه — بجملةٍ تُقرأ في الشاشة لا برمز (D-172). */
function unknownOf(error: unknown): string {
  if (error instanceof PublishError) {
    return error.status >= 500 && /data\.id/.test(error.message)
      ? 'قبلتها X بلا معرّف'
      : `ردّت X بعطلٍ في خادمها (${error.status})`
  }
  return isTimeout(error) ? 'انقضت المهلة قبل جوابها' : 'انقطع الاتّصال قبل جوابها'
}

/** علامةٌ وصفُّ المحاولة الذي يحملها — فتُكتب التسويةُ في موضعها. */
interface Held {
  readonly mark: TweetMark
  readonly attempt: { readonly id: string; readonly status: string; readonly request: Record<string, unknown> }
}

/**
 * ‏ما عُلِّم لكلّ تغريدةٍ في المحاولات السابقة — **والنجاحُ يغلب ما بعده**: تغريدةٌ نجحت مرّةً نجحت.
 */
async function heldMarks(db: Db, postId: string, org: string, current: string | null): Promise<Map<number, Held>> {
  const { results } = await db
    .prepare('SELECT id, status, request_json FROM publish_attempts WHERE post_id = ? AND org_id = ? ORDER BY attempt_no')
    .bind(postId, org)
    .all<{ id: string; status: string; request_json: string }>()
  const out = new Map<number, Held>()
  for (const row of results) {
    if (row.id === current) continue
    let request: Record<string, unknown>
    try {
      request = JSON.parse(row.request_json) as Record<string, unknown>
    } catch {
      continue
    }
    const marks = request['tweets']
    if (!Array.isArray(marks)) continue
    for (const m of marks as TweetMark[]) {
      if (typeof m?.no !== 'number') continue
      if (out.get(m.no)?.mark.status === 'succeeded') continue
      out.set(m.no, { mark: m, attempt: { id: row.id, status: row.status, request } })
    }
  }
  return out
}

async function priorMarks(db: Db, post: ThreadPost, current: string): Promise<Map<number, TweetMark>> {
  const held = await heldMarks(db, post.id, post.org_id, current)
  return new Map([...held].map(([no, h]) => [no, h.mark]))
}

/**
 * ‏**أوّلُ تغريدةٍ أُرسلت ولم يُعرَف جوابُها** في سلسلة المنشور — أو `null`. يقرؤها «أعده» فيرفض ما دامت معلّقة (كما يرفض
 * ‏محاولةً بقيت `sent`، D-269)، ويقرؤها «قل ما وجدت» فيسوّيها.
 */
export async function unsettledTweet(db: Db, postId: string, org: string): Promise<number | null> {
  const held = await heldMarks(db, postId, org, null)
  const open = [...held.values()].filter((h) => h.mark.status === 'sent').map((h) => h.mark.no).sort((a, b) => a - b)
  return open[0] ?? null
}

/**
 * ‏**الحسابُ الذي نُشر منه أوّلُ السلسلة** (`external_id`) — أو `null` إن لم يُنشَر منها شيء. تقرؤه الجدولةُ فتردّ حسابًا آخر.
 */
export async function threadAuthor(db: Db, postId: string, org: string): Promise<string | null> {
  const held = await heldMarks(db, postId, org, null)
  for (const h of [...held.values()].sort((a, b) => a.mark.no - b.mark.no)) {
    if (h.mark.status === 'succeeded') return h.mark.author ?? ''
  }
  return null
}

/** معرّفُ تغريدةٍ من رابطها على X (`…/status/<id>`) أو المعرّفُ وحده — أو `null`. */
export function tweetIdOf(link: string): string | null {
  const raw = link.trim()
  if (/^\d{5,25}$/.test(raw)) return raw
  const m = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/[A-Za-z0-9_]{1,30}\/status(?:es)?\/(\d{5,25})(?:[/?#]|$)/i.exec(raw)
  return m?.[1] ?? null
}

export type Settled = { readonly ok: true; readonly no: number } | { readonly ok: false; readonly reason: string }

/**
 * ‏**المالكُ يقول ما وجده على X** (مراجعة D-324) — للتغريدة التي أُرسلت ولم يُعرَف جوابُها.
 *
 * ‏`null`: لم يجدها، فتُعلَّم `failed` بيده فتُرسَل في الإعادة. ورابطُها: وجدها، فتُعلَّم `succeeded` بمعرّفها فيُردّ عليها ولا تُرسَل.
 * ‏**والفاشلُ وحده يُسوّى**: منشورٌ في الطابور لم ينتهِ أمرُه، ومحاولةٌ بقيت `sent` (قُتل الاستدعاءُ وسطَها) حارسُها D-269.
 */
export async function settleTweet(db: Db, org: string, postId: string, found: { readonly link: string } | null): Promise<Settled> {
  const post = await db
    .prepare("SELECT status FROM posts WHERE id = ? AND org_id = ? AND platform = 'x'")
    .bind(postId, org)
    .first<{ status: string }>()
  if (post === null) return { ok: false, reason: 'لا منشور بهذا المعرّف' }
  if (post.status !== 'failed') return { ok: false, reason: `حالتُه «${post.status}» — والتسويةُ للفاشل وحده` }
  const held = await heldMarks(db, postId, org, null)
  const open = [...held.values()].filter((h) => h.mark.status === 'sent').sort((a, b) => a.mark.no - b.mark.no)[0]
  if (open === undefined) return { ok: false, reason: 'لا تغريدةَ معلّقةً في هذه السلسلة' }
  if (open.attempt.status === 'sent') return { ok: false, reason: 'أُرسلت محاولة ولم يُعرف ردُّها — تحقّق على المنصّة أوّلا' }
  let mark: TweetMark
  if (found === null) {
    mark = { ...open.mark, status: 'failed', settled: 'missing' }
  } else {
    const id = tweetIdOf(found.link)
    if (id === null) return { ok: false, reason: 'ألصق رابطَ التغريدة من X كما هو (…/status/…) أو معرّفَها وحده' }
    mark = { ...open.mark, status: 'succeeded', id, settled: 'found' }
  }
  const marks = (open.attempt.request['tweets'] as TweetMark[]).map((m) => (m.no === mark.no ? mark : m))
  const moved = await db
    .prepare('UPDATE publish_attempts SET request_json = ? WHERE id = ? AND org_id = ? AND request_json = ?')
    .bind(JSON.stringify({ ...open.attempt.request, tweets: marks }), open.attempt.id, org, JSON.stringify(open.attempt.request))
    .run()
  // ‏شرطُ الصفّ نفسِه: ضغطتان معًا لا تكتبان قولين
  if (!changedRows(moved)) {
    return { ok: false, reason: 'تغيّرت حالُها قبل الحفظ — أعد تحميل الصفحة' }
  }
  return { ok: true, no: mark.no }
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

    // ١ · نجحت من قبل: لا تُرسَل، ويُردّ على معرّفها — **ومن الحساب نفسِه وحده**
    if (was?.status === 'succeeded' && typeof was.id === 'string' && was.id !== '') {
      if (was.author !== post.external_id) {
        throw new PublishError(
          `thread_account: التغريدة ${no} نُشرت من حسابٍ آخر على X، فلا تُكمَل السلسلةُ من هذا الحساب`,
          409,
          false,
        )
      }
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
    // ٢ · أُرسلت ولم يُعرَف جوابُها ولم يقل المالكُ ما وجد: لا تُرسَل ثانيةً — و«أعده» يرفضها قبل أن تصل هنا
    if (was?.status === 'sent') {
      throw new PublishError(`thread_unconfirmed: التغريدة ${no} من ${tweets.length} أُرسلت ولم يُؤكَّد نشرُها — تحقّق على X ثمّ قل ما وجدت`, 0, false)
    }
    const author = post.external_id
    const sofar = ids.length === 0 ? '' : ` — نُشرت قبلها ${ids.length} ولا تُعاد`

    /*
     * ‏٣ · **الكلفةُ قبل العلامة، والعلامةُ قبل الإرسال** (D-008 · D-269 · تحقّق D-320 على main). كانت العلامةُ تُحفَظ `sent`
     * ‏ثمّ يُكتب الدفتر، فسقوطُ D1 في الدفتر يرمي خطأً عاديًّا يصنّفه الناشرُ «unconfirmed_send» نهائيًّا، وتبقى علامةُ تغريدةٍ لم
     * ‏تبلغ X «أُرسلت» يردّ بها «أعده» حتّى يسوّيها المالك. فعطلٌ هنا قبل أيّ نداءٍ يُرمى `pre_send` قابلًا للإعادة كما في التغريدة
     * ‏الواحدة (`ledger` في الناشر)، ويعيده الطابورُ من هذه التغريدة. وعلامةٌ سقط حفظُها بعد قيد الكلفة تُقيَّد ثانيةً في الإعادة:
     * ‏الدفترُ أكثرُ من الحقيقة بتغريدةٍ لا أقلّ، وهو الاتّجاهُ الآمن (D-008). وعلامةٌ حُفظت ولم يصل جوابُ حفظها تبقى `sent` فلا تُرسَل.
     */
    const hasUrl = containsUrl(tweet)
    const unitCost = estimatePostCost('x', hasUrl)
    try {
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
      marks.push({ no, key, digest: print, author, status: 'sent' })
      await keep()
    } catch (error) {
      throw new PublishError(
        `pre_send: التغريدة ${no} من ${tweets.length} لم تُرسَل، فلم يُكتب دفترُها أو علامتُها (${String(error).slice(0, 120)})${sofar}`,
        503,
        true,
      )
    }

    // ٤ · ردًّا على التي قبلها، والوسيطُ مع الأولى وحدها
    let out: PublishResult
    try {
      out = await publishX(accessToken, tweet, fetchImpl, i === 0 ? mediaId : null, previous)
    } catch (error) {
      const detail = detailOf(error)
      // ‏**ردٌّ قاطع** (4xx ومنه ‏429): لم تُنشَر يقينًا، فالإعادةُ تكمل منها ولا تعيد ما نُشر
      if (error instanceof PublishError && error.status >= 400 && error.status < 500) {
        marks[marks.length - 1] = { no, key, digest: print, author, status: 'failed', error: detail.slice(0, 300) }
        await keep()
        throw new PublishError(
          `x: التغريدة ${no} من ${tweets.length} لم تُنشَر (${detail})${sofar === '' ? '' : `${sofar}، والإعادةُ تُكمل منها`}`,
          error.status,
          error.retryable,
        )
      }
      // ‏**وما لم يُعرَف جوابُه** (مهلةٌ أو شبكةٌ أو 5xx أو بلا معرّف): قد تكون على X — تبقى `sent` ولا تُعاد وحدها
      marks[marks.length - 1] = { no, key, digest: print, author, status: 'sent', error: detail.slice(0, 300) }
      await keep()
      throw new PublishError(
        `thread_unconfirmed: التغريدة ${no} من ${tweets.length} أُرسلت ولم يُؤكَّد نشرُها (${unknownOf(error)})${sofar} — تحقّق على X ثمّ قل ما وجدت`,
        0,
        false,
      )
    }

    // ٥ · نجحت — **وعلامتُها إن لم تُحفظ قيل ذلك**: نُشرت ومعرّفُها هنا، والعلامةُ في القاعدة ما زالت `sent`
    marks[marks.length - 1] = { no, key, digest: print, author, status: 'succeeded', id: out.platformPostId }
    try {
      await keep()
    } catch {
      throw new PublishError(
        `thread_unconfirmed: التغريدة ${no} من ${tweets.length} نُشرت (معرّفها ${out.platformPostId}) ولم يُحفَظ ذلك — قل ما وجدت على X`,
        0,
        false,
      )
    }
    previous = out.platformPostId
    ids.push(previous)
  }
  return { platformPostId: ids[0]!, request: { thread: tweets.length }, response: { thread: ids } }
}
