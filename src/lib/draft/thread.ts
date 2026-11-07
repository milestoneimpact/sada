/**
 * ‏**سلسلةُ X من نصٍّ واحد** (D-324) — سطرٌ فيه `---` وحدَها بين كلّ تغريدتين.
 *
 * ## لماذا نصٌّ واحد لا صفٌّ لكلّ تغريدة
 *
 * ‏عمودا `thread_id` و`thread_order` في `posts` منذ 0001 (وبقيا في كلّ إعادة بناء حتّى 0022)، **وصفٌّ لكلّ تغريدة يعني
 * ‏N بطاقاتٍ وN اعتماداتٍ وN مواعيد لقرارٍ واحد**، وتراجعًا يُطارد أخواته. فالسلسلةُ منشورٌ واحد: يُكتب ويُعتمَد ويُجدوَل
 * ‏ويُتراجَع عنه مرّةً، ونوعُه `thread` (القيدُ في 0022 يقبله)، **وتغريداتُه تُشتقّ من نصّه عند كلّ قراءة** — فالنصُّ الذي
 * ‏اعتمده المالكُ هو ما يُنشَر، ولا نسخةَ ثانيةً تفترق عنه. والعمودان باقيان بلا قراءة.
 *
 * ‏والنشرُ تغريدةً تغريدة، **ولكلّ تغريدةٍ مفتاحُها (`<مفتاح المنشور>#n`) وعلامتُها** في `request_json` لمحاولة المنشور — ذاك
 * ‏ما يُستأنَف منه (`publish/xThread.ts`)، بلا جدولٍ جديدٍ ولا ترحيل.
 *
 * ## والفاصلُ سطرٌ وحدَه
 *
 * ‏`---` داخل جملة نصٌّ، وأربعُ شرطاتٍ نصّ: الفاصلُ ما لا يُكتب في منشورٍ عاديّ. **وLinkedIn لا سلسلةَ لها**: نصُّها كما كُتب.
 */
import { estimatePostCost } from '../cost'
import { containsUrl } from '../idempotency'
import type { PublishPlatform } from '../oauth/providers'
import { postLength } from './length'
import { PLATFORMS } from './prompt'

/** الفاصلُ كما يكتبه المالك — سطرٌ لا شيءَ فيه غيرُه. */
export const THREAD_SEPARATOR = '---'

/** أطولُ سلسلةٍ تُقبَل: كلُّ تغريدةٍ نداءٌ مدفوع (D-003)، وخمسٌ وعشرون أكثرُ ممّا يُقرأ. */
export const THREAD_MAX = 25

const SEPARATOR_LINE = /^[ \t]*---[ \t]*$/m

/** تغريداتُ النصّ بترتيبها — ولغير X النصُّ كلُّه واحد كما كُتب. */
export function tweetsOf(platform: string, text: string): string[] {
  if (platform !== 'x') return [text]
  const parts = text.replace(/\r\n?/g, '\n').split(SEPARATOR_LINE).map((p) => p.trim()).filter((p) => p !== '')
  return parts.length === 0 ? [text.trim()] : parts
}

/** أهذا النصُّ سلسلة؟ X وتغريدتان فأكثر. */
export function isThread(platform: string, text: string): boolean {
  return tweetsOf(platform, text).length > 1
}

/** أطولُ تغريدةٍ بحساب منصّتها — وهي ما يُقاس عليه العدّادُ والحدّ. */
export function longestTweet(platform: 'linkedin' | 'x', text: string): number {
  return Math.max(...tweetsOf(platform, text).map((t) => postLength(t, platform)))
}

/**
 * ‏ما يُردّ عليه نصُّ X **تغريدةً تغريدة** — أو `null`. ورقمُ التغريدة في السبب، فلا يبحث المالكُ أيَّها طالت.
 */
export function threadProblem(text: string): string | null {
  const tweets = tweetsOf('x', text)
  if (tweets.length > THREAD_MAX) return `السلسلة ${tweets.length} تغريدةً والحدّ ${THREAD_MAX}`
  const limit = PLATFORMS.x.hardLimit
  for (const [i, t] of tweets.entries()) {
    const n = postLength(t, 'x')
    if (n <= limit) continue
    return tweets.length === 1
      ? `النصّ ${n} محرفا بحساب X وهي تقبل ${limit}`
      : `التغريدة ${i + 1} من ${tweets.length} طولها ${n} محرفًا بحساب X وهي تقبل ${limit}`
  }
  return null
}

/**
 * ‏ما سيُدفَع للمنصّة عند النشر (D-069) — **وللسلسلة مجموعُ تغريداتها**، والرابطُ يُحسب للتغريدة التي هو فيها.
 */
export function publishCostOf(platform: PublishPlatform, text: string): number {
  return tweetsOf(platform, text).reduce((sum, t) => sum + estimatePostCost(platform, containsUrl(t)), 0)
}
