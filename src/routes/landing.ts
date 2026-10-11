/**
 * صفحةُ الهبوط على جذر النطاق — **بابٌ لا لوحة** (الجلسة ب، المهمّة ١ · D-193).
 *
 * كان `sada2.basserh.com` وحدَه يُردّ ‏٤٠٤: المالكُ يكتب النطاقَ فيصل إلى «لا توجد»، ثمّ يبحث
 * عن طريقه إلى `/panel`. فصار الجذرُ يقول ما صدى في شاشةٍ واحدة، وبزرٍّ أوّليٍّ واحد إلى اللوحة.
 *
 * **ومن معه جلسةٌ سارية لا يرى الصفحةَ أصلًا**: ‏303 إلى `/panel` قبل أيّ رسم. ولذلك لا تُخزَّن
 * في ذاكرةٍ عامّة (`no-store` و`Vary: Cookie`): ردٌّ واحدٌ يختلف بالكعكة لا يُشارَك بين زائرَين.
 *
 * ولا شيءَ فيها من حساب المالك ولا من قاعدته — نصٌّ ثابتٌ وشعارات، بلا نموذجٍ ولا سكربت.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { htmlHeaders } from '../lib/security/headers'
import { loadSession } from '../lib/session'
import { shell } from './ui/shell'
import { brandMoment } from './ui/moment'
import { LOGOS } from './ui/logos'

export const landing = new Hono<{ Bindings: Env }>()

/** المنصّاتُ التي ينشر عليها صدى اليوم — بترتيب لوحة القنوات. */
const PLATFORMS: readonly (readonly [key: string, label: string])[] = [
  ['linkedin', 'LinkedIn'], ['x', 'X'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'],
]

const STEPS: readonly (readonly [title: string, line: string])[] = [
  ['مصادرُك', 'تضع ملفّاتك في مجلّد Google Drive، وصدى يقرؤها ويفهم ما يستحقّ النشر.'],
  ['مسوّداتٌ تعتمدها', 'يكتب لكلّ منصّةٍ نصَّها ويصمّم صورتها — ولا يُنشر شيءٌ قبل أن تعتمده.'],
  ['نشرٌ في موعده', 'يجدول ما اعتمدتَه وينشره، ويقيس ما وصل، وكلفةُ كلّ طلبٍ ظاهرة.'],
]

export function landingBody(): string {
  const steps = STEPS.map(([t, l], i) =>
    `<li><span class="land-n" aria-hidden="true">${['١', '٢', '٣'][i]}</span><span><b>${t}</b><span>${l}</span></span></li>`).join('')
  const pfs = PLATFORMS.map(([k, label]) =>
    `<li class="land-pf" role="img" aria-label="${label}" title="${label}">${LOGOS[k] ?? ''}</li>`).join('')
  // ‏**والبابُ لحظةُ العلامة** (D-196): السطحُ العميقُ والنقشُ بجانب المحتوى لا خلفَه، كالدخول —
  // ‏لحظةٌ واحدةٌ ابنٌ مباشرٌ لـ«.auth-split»، والرمزُ فيها فلا يُكرَّر فوق الاسم. والمحتوى كما كان.
  return `<div class="auth-split">${brandMoment()}<div class="wrap"><main class="land">
  <h1>صدى</h1>
  <p class="land-lede">تضع ملفّاتك، وصدى يكتب ويصمّم ويجدول — والقرارُ الأخيرُ لك.</p>
  <a class="btn btn-primary land-cta" href="/panel">ادخل إلى لوحتك</a>
  <ol class="land-steps">${steps}</ol>
  <ul class="land-pfs" aria-label="المنصّات">${pfs}</ul>
  <footer class="land-foot"><a class="tap" href="/privacy">سياسة الخصوصيّة</a><a class="tap" href="/terms">شروط الاستعمال</a></footer>
</main></div></div>`
}

/** الصفحةُ كاملةً بغلافها — لحظةُ العلامة تطلب شريطَ المتصفّح بأرضها (`moment`). */
export function landingPage(nonce: string): string {
  return shell('صدى', landingBody(), nonce, '', {
      indexable: true,
      moment: true,
      description: 'صدى: تضع ملفّاتك، وهو يكتب ويصمّم ويجدول على LinkedIn وX وYouTube وTikTok وInstagram — والقرارُ الأخيرُ لك.',
    })
}

landing.get('/', async (c) => {
  if (await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN) !== null) {
    return new Response(null, { status: 303, headers: { Location: '/panel', 'Cache-Control': 'no-store', Vary: 'Cookie' } })
  }
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  return new Response(
    landingPage(nonce),
    { headers: { ...htmlHeaders(nonce), 'Cache-Control': 'no-store', Vary: 'Cookie' } },
  )
})
