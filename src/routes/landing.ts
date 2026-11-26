/**
 * الموقعُ العامّ — **موقعٌ كاملٌ لا بابُ دخول** (D-416، وكان بابًا في D-193).
 *
 * رفضت مراجعةُ TikTok رابطَ الموقع: «يجب أن يقود إلى موقعٍ خارجيٍّ مكتمل، لا صفحةَ هبوطٍ ولا صفحةَ دخول».
 * وكان الجذرُ بطلًا بزرٍّ واحدٍ إلى اللوحة. فصار للموقع رأسٌ يتنقّل بين صفحاته، وتذييلٌ يحمل الوثيقتين،
 * وصفحاتٌ تقول ما صدى ولمن وكيف يستعمل كلَّ منصّة — بالعربيّة أوّلًا، وبنسخةٍ إنجليزيّةٍ كاملة في `/en`
 * لأنّ المراجِعين يقرؤون الإنجليزيّة. و«ادخل» رابطٌ ثانويٌّ في الرأس لا مضمونُ الصفحة.
 *
 * **وما يُقال هنا يقابله ما في الشيفرة**: النطاقاتُ من `lib/oauth/scopes.ts`، والتشفيرُ من `tokens.ts`،
 * والاعتمادُ قبل النشر من `publish/`. وعدٌ لا يقع يُسقط المراجعةَ كما يُسقطها الغياب.
 *
 * ومن معه جلسةٌ سارية يُحوَّل من الجذر وحدَه إلى `/panel` (‏303، `no-store` و`Vary: Cookie`)؛
 * والصفحاتُ الأخرى عامّةٌ تُخزَّن كالوثيقتين. ولا نموذجَ ولا سكربتَ فيها سوى سكربتَي الغلاف.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { htmlHeaders, publicPageHeaders } from '../lib/security/headers'
import { loadSession } from '../lib/session'
import { shell, GLYPH_SVG } from './ui/shell'
import { html, raw, type Html } from './ui/html'
import { LOGOS } from './ui/logos'
import { cardClass } from './ui/components/card'
import { operator } from './legal'

export const landing = new Hono<{ Bindings: Env }>()

type Lang = 'ar' | 'en'

/** المنصّاتُ بترتيب لوحة القنوات. */
const PLATFORMS: readonly (readonly [key: string, label: string])[] = [
  ['linkedin', 'LinkedIn'], ['x', 'X'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['instagram', 'Instagram'],
]

const NAV: Record<Lang, readonly (readonly [href: string, label: string])[]> = {
  ar: [['/features', 'المزايا'], ['/about', 'عن صدى'], ['/contact', 'تواصل'], ['/en', 'English']],
  en: [['/en#features', 'Features'], ['/about#en', 'About'], ['/contact#en', 'Contact'], ['/', 'العربيّة']],
}

function header(lang: Lang): Html {
  const links = NAV[lang].map(([h, l]) =>
    html`<a class="tap" lang="${l === 'English' ? 'en' : l === 'العربيّة' ? 'ar' : lang}" href="${h}">${l}</a>`)
  const home = lang === 'ar' ? '/' : '/en'
  const enter = lang === 'ar' ? 'ادخل' : 'Sign in'
  return html`<header class="site-head"><a class="site-brand" href="${home}"><span class="site-mark" aria-hidden="true">${raw(GLYPH_SVG)}</span><b>${lang === 'ar' ? 'صدى' : 'SADA'}</b></a>
<nav class="site-nav" aria-label="${lang === 'ar' ? 'الموقع' : 'Site'}">${links}<a class="tap site-enter" href="/panel">${enter}</a></nav></header>`
}

function footer(lang: Lang): Html {
  const ar = lang === 'ar'
  return html`<footer class="site-foot"><nav aria-label="${ar ? 'روابط الموقع' : 'Site links'}">
<a class="tap" href="/privacy${ar ? '' : '#en'}">${ar ? 'سياسة الخصوصيّة' : 'Privacy Policy'}</a>
<a class="tap" href="/terms${ar ? '' : '#en'}">${ar ? 'شروط الاستعمال' : 'Terms of Service'}</a>
<a class="tap" href="/about${ar ? '' : '#en'}">${ar ? 'عن صدى' : 'About'}</a>
<a class="tap" href="/contact${ar ? '' : '#en'}">${ar ? 'تواصل' : 'Contact'}</a>
<a class="tap" href="/features">${ar ? 'المزايا' : 'Features (Arabic)'}</a>
<a class="tap" href="${ar ? '/en' : '/'}" lang="${ar ? 'en' : 'ar'}">${ar ? 'English' : 'العربيّة'}</a></nav>
<p>${ar ? 'صدى — إدارةُ المحتوى ونشرُه لفرق التواصل والوكالات.' : 'SADA — content management and publishing for social media teams and agencies.'}</p></footer>`
}

function mail(contact: string | null, lang: Lang): Html {
  if (contact === null) {
    return html`${lang === 'ar' ? 'لم يُضبط بريد تواصل بعد على هذا النشر.' : 'No contact address is configured on this deployment yet.'}`
  }
  return html`<a class="tap" href="mailto:${contact}"><span class="mono">${contact}</span></a>`
}

function cards(items: readonly (readonly [string, string])[]): Html {
  return html`<ul class="site-grid">${items.map(([t, l]) => html`<li class="${cardClass()}"><b>${t}</b><span>${l}</span></li>`)}</ul>`
}

function platformRow(): Html {
  return html`<ul class="site-pfs">${PLATFORMS.map(([k, label]) =>
    html`<li>${raw((LOGOS[k] ?? '').replace('aria-hidden="true"', `role="img" aria-label="${label}"`))}<span>${label}</span></li>`)}</ul>`
}

const FEATURES_AR: readonly (readonly [string, string])[] = [
  ['مصادرُ من Google Drive', 'تضع ملفّاتك في مجلّد Drive أو ترفعها أو تلصق روابطها، وصدى يقرؤها ويلخّصها ويقترح ما يستحقّ النشر.'],
  ['مسوّدةٌ لكلّ منصّة', 'يكتب لكلّ منصّةٍ نصَّها بطولها ونبرتها، ويصمّم صورتها، ويعدّ وصفَ المقطع.'],
  ['الاعتمادُ قبل النشر', 'لا يُنشر شيءٌ قبل أن يقرأه صاحبُ الحساب أو ناشرٌ من فريقه ويعتمده بيده — وللعميل رابطُ مراجعةٍ إن شاء.'],
  ['الجدولة', 'تقويمٌ للشهر والأسبوع واليوم، وما اعتمدتَه يُنشر في موعده.'],
  ['القياس', 'ما وصل من كلّ منشور، وتقريرُ شهرٍ لكلّ عميل.'],
  ['شفافيّةُ الكلفة', 'كلُّ طلبٍ مدفوعٍ مسجَّلٌ في دفتر الكلفة قبل أن يُعدّ ناجحًا، وسقوفٌ يومًا وشهرًا.'],
]

const FEATURES_EN: readonly (readonly [string, string])[] = [
  ['Sources from Google Drive', 'Add files to a Drive folder, upload them, or paste links; SADA reads and summarises them and suggests what is worth sharing.'],
  ['Drafts per platform', 'A post for each platform in its own length and tone, with a designed image and a video description.'],
  ['Approval before publishing', 'Nothing is published until the account owner, or a publisher on their team, reads and approves it. Clients can review through a private link.'],
  ['Scheduling', 'A month, week and day calendar; approved posts go out on time.'],
  ['Measurement', 'Results for each post and a monthly report per client.'],
  ['Cost transparency', 'Every paid request is recorded in a cost ledger before it counts as done, with daily and monthly caps.'],
]

const FAQ_AR: readonly (readonly [string, string])[] = [
  ['هل ينشر صدى شيئًا وحده؟', 'لا. كلُّ منشورٍ ينتظر اعتمادًا بشريًّا، ثمّ يُنشر على الحساب الذي ربطه صاحبُه وحده.'],
  ['هل تُباع بياناتي أو تُشارَك مع معلنين؟', 'لا. لا إعلانات ولا تتبّع ولا تحليلات من طرفٍ ثالث، ولا تُرسَل بيانات المنصّات إلى أحد.'],
  ['كيف تُحفظ أذونات حساباتي؟', 'مشفّرةً بـ AES-GCM في قاعدة البيانات، ومفتاحُ التشفير في أسرار الخادم وحدها.'],
  ['هل أستطيع فصل حسابٍ؟', 'نعم، في أيّ وقت: يُحذف إذنُه المشفّر، وتُلغى منشوراته المجدولة، ويُطلب من المنصّة إبطالُ الوصول.'],
  ['لمن صدى؟', 'لفرق التواصل الاجتماعيّ والوكالات التي تدير حساباتها وحسابات عملائها، كلُّ عميلٍ معزولٌ عن غيره.'],
]

const FAQ_EN: readonly (readonly [string, string])[] = [
  ['Does SADA post anything on its own?', 'No. Every post waits for a human approval, then goes only to the account its owner connected.'],
  ['Is my data sold or shared with advertisers?', 'No. There are no ads, no tracking and no third-party analytics, and platform data is not sent to anyone.'],
  ['How are my account permissions stored?', 'Encrypted with AES-GCM in the database; the encryption key lives only in server secrets.'],
  ['Can I disconnect an account?', 'Yes, at any time: its encrypted credentials are deleted, its scheduled posts are cancelled, and the platform is asked to revoke access.'],
  ['Who is SADA for?', 'Social media teams and agencies managing their own accounts and their clients’ accounts, each client kept separate.'],
]

function faq(items: readonly (readonly [string, string])[]): Html[] {
  return items.map(([q, a]) => html`<details class="site-faq"><summary>${q}</summary><p>${a}</p></details>`)
}

function homeAr(contact: string | null): Html {
  return html`<main class="doc">${header('ar')}
<section class="site-hero"><h1>صدى — إدارةُ المحتوى ونشرُه</h1>
<p class="lede">تضع ملفّاتك، وصدى يكتب لكلّ منصّةٍ ويصمّم ويجدول — <b>ولا يُنشر شيءٌ قبل أن تعتمده</b>.
أداةٌ لفرق التواصل الاجتماعيّ والوكالات التي تدير حساباتها وحسابات عملائها.</p>
<p><a class="tap" href="/features">تعرّف على المزايا</a> · <a class="tap" href="/en" lang="en">Read in English</a></p></section>
<h2>لمن صدى</h2>
<p>لفريق التواصل الذي ينشر كلّ يومٍ على أكثر من منصّة، وللوكالة التي تدير عملاءَ عدّة: لكلّ عميلٍ موجزُه ومصادرُه
ومنشوراتُه وحساباتُه، معزولةً عن غيره، وللفريق أدوارٌ (مدير، ناشر، محرّر، قارئ).</p>
<h2>ما يفعله</h2>${cards(FEATURES_AR)}
<h2>المنصّات</h2>${platformRow()}
<p><b>X وLinkedIn وYouTube</b> تعمل اليوم. <b>TikTok وInstagram</b> عبر واجهاتهما الرسميّة، ولا يُرفع إليهما مقطعٌ ولا صورةٌ إلّا بعد أن يعتمده صاحبُ الحساب.</p>
<h2>كيف يستعمل صدى TikTok</h2>
<ul><li>تربط حسابك أنت عبر <b>Login Kit</b> بإذنك، ويطلب صدى <span class="mono">user.info.basic</span> ليعرض اسم الحساب وصورته.</li>
<li>عبر <b>Content Posting API</b> (<span class="mono">video.upload</span> و<span class="mono">video.publish</span>) يُرفع المقطع إلى حسابك أنت، <b>بعد أن تعتمده</b> مع وصفه.</li>
<li>لا يقرأ صدى خلاصتك ولا متابعيك ولا رسائلك، ولا تُباع بياناتك ولا تُشارَك.</li></ul>
<h2>الأمن</h2>
<ul><li>أذونات الحسابات مشفّرةٌ بـ AES-GCM، والمفتاح في أسرار الخادم لا في القاعدة.</li>
<li>دخولٌ برمزٍ إلى البريد، وعاملٌ ثانٍ إلزاميّ للمدير والناشر (مفتاح مرور أو تطبيق).</li>
<li>HTTPS في كلّ اتّصال، وسياسةُ محتوًى صارمة، وسجلُّ نشاط. التفاصيل في <a class="tap" href="/privacy">سياسة الخصوصيّة</a>.</li></ul>
<h2>أسئلة شائعة</h2>${faq(FAQ_AR)}
<h2>تواصل</h2><p>${mail(contact, 'ar')}</p>
${footer('ar')}</main>`
}

function homeEn(contact: string | null): Html {
  return html`<main class="doc" lang="en" dir="ltr">${header('en')}
<section class="site-hero"><h1>SADA — content management and publishing</h1>
<p class="lede">You add your material; SADA drafts a post for each platform, designs its visuals and schedules it —
<b>nothing is published until you approve it</b>. Built for social media teams and agencies.</p></section>
<h2>Who it is for</h2>
<p>Social media teams that publish daily across several platforms, and agencies managing many clients: each client has its own
brief, sources, posts and connected accounts, kept separate, and team members have roles (admin, publisher, editor, viewer).</p>
<h2 id="features">Features</h2>${cards(FEATURES_EN)}
<h2>Supported platforms</h2>${platformRow()}
<p><b>X, LinkedIn and YouTube</b> are live today. <b>TikTok and Instagram</b> use their official APIs; content is uploaded only after the account owner approves it.</p>
<h2>How SADA uses TikTok</h2>
<ul><li>You connect <b>your own</b> TikTok account through <b>Login Kit</b>. SADA requests <span class="mono">user.info.basic</span> to show the connected account’s display name and avatar.</li>
<li>Through the <b>Content Posting API</b> (<span class="mono">video.upload</span>, <span class="mono">video.publish</span>), a video is uploaded to your account <b>only after you approve it</b> with its caption.</li>
<li>SADA does not read your feed, followers or messages. Your data is never sold or shared.</li></ul>
<h2>Security</h2>
<ul><li>Platform access credentials are encrypted with AES-GCM; the key is kept in server secrets, not in the database.</li>
<li>Email sign-in codes plus a mandatory second factor for admins and publishers (passkey or authenticator app).</li>
<li>HTTPS everywhere, a strict content security policy, and an activity log. Details in the <a class="tap" href="/privacy#en">Privacy Policy</a>.</li></ul>
<h2>FAQ</h2>${faq(FAQ_EN)}
<h2>Contact</h2><p>${mail(contact, 'en')}</p>
${footer('en')}</main>`
}

function featuresBody(): Html {
  return html`<main class="doc">${header('ar')}
<h1>المزايا</h1><p class="lede">من الملفّ إلى المنشور، والقرارُ الأخير لك في كلّ خطوة.</p>
${cards(FEATURES_AR)}
<h2>الرحلة</h2><ol class="site-steps"><li><b>المصادر</b> — مجلّد Drive أو رفعٌ أو رابط.</li>
<li><b>الخطّة</b> — صدى يقترح منشورات الشهر لكلّ عميل.</li>
<li><b>المسوّدات</b> — نصٌّ وصورةٌ لكلّ منصّة، تعدّلها كما تشاء.</li>
<li><b>الاعتماد</b> — منك أو من ناشرٍ في فريقك، ومن العميل إن طلبت.</li>
<li><b>النشر والقياس</b> — في الموعد، ثمّ ما وصل وكم كلّف.</li></ol>
<h2>المنصّات</h2>${platformRow()}
<p>X وLinkedIn وYouTube تعمل اليوم؛ وTikTok وInstagram عبر واجهاتهما الرسميّة، بعد اعتماد صاحب الحساب.</p>
${footer('ar')}</main>`
}

function aboutBody(): Html {
  return html`<main class="doc">${header('ar')}
<h1>عن صدى</h1>
<p class="lede">صدى أداةٌ لإدارة المحتوى ونشره، بُنيت لفرق التواصل الاجتماعيّ والوكالات في العالم العربيّ، بالعربيّة أوّلًا.</p>
<p>فكرتُه أنّ النشر الجيّد يبدأ ممّا عندك فعلًا: مستنداتُك ومقاطعُك وأخبارُك. صدى يقرؤها، ويكتب منها لكلّ منصّة،
ويجدولها، ويقيس ما وصل — ولا يقرّر عنك: كلُّ منشورٍ ينتظر اعتمادك.</p>
<p>ونلتزم بشروط كلّ منصّةٍ ومعدّلاتها، ولا نجمع بيانات أحدٍ غير صاحب الحساب. اقرأ <a class="tap" href="/privacy">سياسة الخصوصيّة</a>
و<a class="tap" href="/terms">شروط الاستعمال</a>.</p>
<section id="en" lang="en" dir="ltr"><h2>About SADA</h2>
<p>SADA is a content management and publishing tool for social media teams and agencies, Arabic first. It reads the material
you already have, drafts a post for each platform, schedules it and measures the results — and it never decides for you:
every post waits for your approval. SADA follows each platform’s terms and rate limits and collects no data about anyone
other than the account owner. See the <a class="tap" href="/privacy#en">Privacy Policy</a> and <a class="tap" href="/terms#en">Terms of Service</a>.</p></section>
${footer('ar')}</main>`
}

function contactBody(contact: string | null): Html {
  return html`<main class="doc">${header('ar')}
<h1>تواصل</h1>
<p class="lede">لأيّ سؤالٍ عن صدى، أو طلبِ حذف بيانات، أو استفسارٍ من مراجِع منصّة، راسلنا على البريد:</p>
<p>${mail(contact, 'ar')}</p>
<p>ونردّ عادةً خلال أيّام العمل. وتجد ما نعالجه من بيانات في <a class="tap" href="/privacy">سياسة الخصوصيّة</a>.</p>
<section id="en" lang="en" dir="ltr"><h2>Contact</h2>
<p>For any question about SADA, a data deletion request, or a platform review enquiry, email us:</p>
<p>${mail(contact, 'en')}</p>
<p>What we process is described in the <a class="tap" href="/privacy#en">Privacy Policy</a>.</p></section>
${footer('ar')}</main>`
}

/** الصفحةُ الرئيسةُ مرسومةً بلا بيئة — لعيّنة التدقيق. */
export function landingBody(contact: string | null = null): Html {
  return homeAr(contact)
}

const DESC_HOME = 'صدى: إدارة المحتوى ونشره لفرق التواصل والوكالات — مسوّدات لكلّ منصّة، واعتماد قبل النشر، وجدولة وقياس، على X وLinkedIn وYouTube وTikTok وInstagram.'

export function landingPage(nonce: string, contact: string | null = null, base = ''): string {
  return shell('صدى — إدارة المحتوى ونشره', landingBody(contact).value, nonce, '', { indexable: true, description: DESC_HOME, og: { url: `${base}/` } })
}

function newNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
}

landing.get('/', async (c) => {
  if (await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN) !== null) {
    return new Response(null, { status: 303, headers: { Location: '/panel', 'Cache-Control': 'no-store', Vary: 'Cookie' } })
  }
  const nonce = newNonce()
  return new Response(
    landingPage(nonce, operator(c.env).contact, c.env.PUBLIC_BASE_URL),
    { headers: { ...htmlHeaders(nonce), 'Cache-Control': 'no-store', Vary: 'Cookie' } },
  )
})

function page(c: { env: Env }, path: string, title: string, description: string, body: Html): Response {
  const nonce = newNonce()
  return new Response(
    shell(title, body.value, nonce, '', { indexable: true, description, og: { url: `${c.env.PUBLIC_BASE_URL}${path}` } }),
    { headers: publicPageHeaders(nonce) },
  )
}

landing.get('/en', (c) => page(c, '/en', 'SADA — content management and publishing',
  'SADA helps social media teams and agencies draft, approve, schedule and measure posts on X, LinkedIn, YouTube, TikTok and Instagram.',
  homeEn(operator(c.env).contact)))
landing.get('/features', (c) => page(c, '/features', 'صدى — المزايا',
  'مزايا صدى: مصادر من Drive، ومسوّدة لكلّ منصّة، واعتماد قبل النشر، وجدولة وقياس وشفافيّة كلفة.', featuresBody()))
landing.get('/about', (c) => page(c, '/about', 'صدى — عن صدى',
  'عن صدى: أداة إدارة المحتوى ونشره لفرق التواصل الاجتماعيّ والوكالات، بالعربيّة أوّلًا.', aboutBody()))
landing.get('/contact', (c) => page(c, '/contact', 'صدى — تواصل',
  'تواصل مع صدى بالبريد لأيّ سؤال أو طلب حذف بيانات.', contactBody(operator(c.env).contact)))
