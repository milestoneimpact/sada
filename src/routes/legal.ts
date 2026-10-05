/**
 * الوثيقتان العامّتان: سياسةُ الخصوصيّة وشروطُ الاستعمال.
 *
 * ## لماذا في Worker لا في صفحةٍ مستضافة
 *
 * مراجعةُ LinkedIn — ومثلُها مراجعةُ Meta — **تطلب رابطا يفتح فعلا**، لا
 * وعدا بنشره. وصفحةٌ على استضافةٍ أخرى تعني نطاقا آخر يُدار ويُجدَّد
 * ويسقط بلا أن نعلم. وهنا تُنشر مع الشيفرة، ويُتحقَّق من فتحها في سجلّ
 * النشر نفسه.
 *
 * ## وما فيها مقروءٌ من الشيفرة لا مؤلَّف
 *
 * كلُّ سطرٍ في «ما يُعالَج» يقابله موضعٌ في المستودع: قراءةُ Drive في
 * `drive/`، والنداءُ في `analyze/` و `draft/`، والرموزُ المشفّرة في
 * `tokens.ts`، والنشرُ في `publish/`. **وسياسةٌ تعد بما لا يقع أسوأ من
 * غيابها** — يقرؤها مراجعٌ ثمّ يرى خلافَها فيسقط الطلب كلّه.
 *
 * ## ولا كعكةَ ولا تتبّع
 *
 * الصفحتان بلا جلسة وبلا نموذج وبلا نداءٍ خارجيّ سوى خطّ الحروف. فزائرٌ
 * يفتحهما لا يُترك عنه أثر — وهذا نفسه ممّا تقولانه.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { publicPageHeaders } from '../lib/security/headers'
import { escapeHtml, shell, GLYPH_SVG } from './ui/shell'
import { pathArrows } from './ui/parts'

export const legal = new Hono<{ Bindings: Env }>()

/** تاريخُ آخر تعديلٍ جوهريّ — يُرفع باليد حين يتبدّل ما تصفه الوثيقة. */
const UPDATED = '2026-10-05'

/**
 * جهةُ التشغيل والتواصل.
 *
 * متغيّرا بيئةٍ لا سرّان: كلاهما معلومٌ يُنشر على الصفحة نفسها. ووضعُهما
 * في `wrangler.toml` يجعل تبديلهما سطرا لا نشرَ شيفرة.
 *
 * **وما لم يُضبَط لا يُخترَع.** بريدٌ لا وجود له في سياسةِ خصوصيّة أسوأ
 * من غيابه: المراجعُ يجرّبه فيرتدّ، فيسقط الطلب على كذبةٍ صغيرة.
 */
function operator(env: Env): { entity: string; contact: string | null } {
  const entity = (env.LEGAL_ENTITY ?? '').trim()
  const contact = (env.LEGAL_CONTACT ?? '').trim()
  return {
    entity: entity === '' ? 'مشغّل صدى' : entity,
    contact: contact === '' ? null : contact,
  }
}

interface Row {
  readonly what: string
  readonly from: string
  readonly why: string
  readonly where: string
  readonly howLong: string
}

/** ما يُعالَج فعلا — صفٌّ لكلّ نوع، ولكلٍّ موضعٌ في الشيفرة. */
const DATA: readonly Row[] = [
  {
    what: 'نصوصُ مستنداتٍ في مجلّد Drive واحد',
    from: 'مجلّدٌ يشاركه المشغّل مع حساب خدمة، بصلاحية قراءةٍ فقط',
    why: 'تلخيصُها وكتابةُ منشوراتٍ منها',
    where: 'Cloudflare D1 — الخلاصةُ لا النصُّ الكامل',
    howLong: 'حتّى يحذفها المشغّل',
  },
  {
    what: 'معرّفُ حسابك على المنصّة التي تربطها واسمُ العرض',
    from: 'نقطةُ الهويّة في المنصّة بعد إذنك الصريح',
    why: 'معرفةُ الحساب الذي يُنشر إليه، وعرضُه في اللوحة',
    where: 'Cloudflare D1',
    howLong: 'حتّى يُفصَل الحساب',
  },
  {
    what: 'إذنُ الوصول وإذنُ التجديد',
    from: 'المنصّة، عبر OAuth 2.0 بـ PKCE',
    why: 'النشرُ نيابةً عنك بعد موافقتك على كلّ منشور',
    where: 'D1 — <b>مشفَّرةً بـ <span class="nb">AES-GCM</span></b>، ومفتاحُها في أسرار Worker وحدها',
    howLong: 'حتّى يُفصَل الحساب أو ينتهي الإذن',
  },
  {
    // ‏مقاطعُ المالك (D-180 · D-190): تُرفع إلى R2 وتُنشر من هناك — وسياسةٌ لا تذكرها تُسقط مراجعةَ YouTube وTikTok
    what: 'المقاطعُ التي يرفعها المشغّل',
    from: 'لوحةُ صدى — يرفعها المشغّل بنفسه',
    why: 'نشرُها على YouTube وTikTok وInstagram بعد أن يعتمد كلَّ منشور',
    where: 'Cloudflare R2',
    howLong: 'حتّى يحذفها المشغّل',
  },
  {
    // ‏نصوصُ المقطع (D-190): `captions:<مقطع>` في KV يومًا، ويتجدّد بكلّ حفظٍ من «أنشئ المنشورات»
    what: 'وصفُ المقطع والنصوصُ المكتوبة له',
    from: 'جملةٌ يكتبها المشغّل، وما يولّده النموذج منها',
    why: 'مراجعتُها وتحريرُها قبل إنشاء المنشورات، وألّا يُدفع ثمنُ الوصف نفسِه مرّتين',
    where: 'Cloudflare KV — ومعها اسمُ النموذج وكلفتُه، بلا سرّ',
    howLong: 'يومٌ واحد من آخر حفظ',
  },
  {
    what: 'نصُّ المنشورات وحالاتُها ومحاولاتُ النشر',
    from: 'ما يولّده النظام ويعتمده المشغّل',
    why: 'سجلٌّ لما نُشر ولما رُفض، ومنعُ النشر مرّتين',
    where: 'Cloudflare D1',
    howLong: 'حتّى يحذفها المشغّل',
  },
  {
    what: 'دفترُ الكلفة وسجلُّ التدقيق',
    from: 'النظامُ نفسه',
    why: 'حدُّ الإنفاق، ومعرفةُ مَن فعل ماذا ومتى',
    where: 'Cloudflare D1',
    howLong: 'حتّى يحذفها المشغّل',
  },
  {
    what: 'كعكةُ جلسةٍ واحدة للوحة الإدارة',
    from: 'دخولُ المشغّل وحده',
    why: 'إبقاءُ الجلسة مفتوحة ثمانيَ ساعات',
    where: 'متصفّحُ المشغّل و Cloudflare KV',
    howLong: 'ثماني ساعات، أو حتّى الخروج',
  },
]

const NEVER: readonly string[] = [
  'لا نقرأ منشوراتِ غيرك ولا رسائلَك ولا قائمةَ من تتّصل بهم.',
  'لا نبيع بياناتك ولا نؤجّرها ولا نشاركها مع معلن.',
  'لا إعلاناتٍ ولا تتبّعٍ ولا تحليلاتِ طرفٍ ثالث في أيّ صفحة.',
  'لا نُرسل بياناتِ حسابك على أيّ منصّةٍ إلى مزوّد ذكاءٍ اصطناعيّ — النصُّ يُكتب من مستنداتك وكلماتك <b>قبل</b> أن يمسّ حسابك، ولا تعود بياناتُ المنصّة إليه.',
  'لا نشرَ آليّ: لا يخرج منشورٌ إلّا بعد أن يعتمده المشغّل بيده، والقاعدةُ نفسها ترفض غيرَ ذلك.',
]

function section(title: string, body: string): string {
  return `<h2>${escapeHtml(title)}</h2>${body}`
}

function policyBody(env: Env, base: string): string {
  const { entity, contact } = operator(env)

  const rows = DATA.map(
    (r) => `<tr><td data-label="ما يُعالَج"><b>${r.what}</b></td>
      <td data-label="من أين">${r.from}</td>
      <td data-label="لماذا">${r.why}</td>
      <td data-label="أين يُخزَّن">${r.where}</td>
      <td data-label="كم يبقى">${r.howLong}</td></tr>`,
  ).join('')

  return `<div class="doc">
  <header>
    <div class="glyph">${GLYPH_SVG}</div>
    <h1>سياسةُ الخصوصيّة</h1>
    <p class="lede">صدى أداةٌ يشغّلها شخصٌ واحد لنشر محتواه هو.
      وهذه الوثيقة تصف ما تعالجه فعلا — لا ما قد تعالجه يوما.</p>
    <p class="ago">آخر تحديث: <span class="mono">${UPDATED}</span> ·
      المشغّل: ${escapeHtml(entity)} · النطاق: <span class="mono">${escapeHtml(base)}</span></p>
  </header>

  ${section('١ · ما صدى', `<p>صدى نظامٌ يقرأ مستنداتٍ من مجلّد Google Drive يملكه مشغّلُها،
    ويستعين بنماذج لغويّة لتلخيصها وصياغة منشورات منها، ثمّ — <b>بعد موافقةٍ بشريّة على كلّ
    منشور</b> — ينشرها على حسابات المشغّل نفسه في LinkedIn و X و YouTube و TikTok و Instagram،
    ومعها مقاطعُ يرفعها المشغّل بنفسه.</p>
    <p><b>وليس لصدى مستخدمون.</b> لا تسجيلَ حساب، ولا زوّارَ لهم ملفّات، ولا خدمةً تُقدَّم
    لأحدٍ غير مشغّلها الواحد. فما تصفه هذه الوثيقة هو معالجةُ بيانات ذلك الشخص ومستنداته
    وحساباته على المنصّات التي يربطها.</p>`)}

  ${section('٢ · ما يُعالَج بالضبط', `<div class="scroll"><table>
    <thead><tr><th>ما يُعالَج</th><th>من أين</th><th>لماذا</th><th>أين يُخزَّن</th><th>كم يبقى</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`)}

  ${section('٣ · بياناتُ المنصّات', `<p>حين تربط حسابك، تطلب صدى أضيقَ ما يكفي:</p>
    <ul>
      <li><b>LinkedIn</b> — <span class="mono">openid</span> و <span class="mono">profile</span>
        لمعرفة الحساب، و <span class="mono">w_member_social</span> للنشر عليه.</li>
      <li><b>X</b> — <span class="mono">tweet.read</span> و <span class="mono">tweet.write</span>
        و <span class="mono">users.read</span> و <span class="mono">offline.access</span>،
        و <span class="mono">media.write</span> لرفع الصورة مع المنشور.</li>
      <li><b>YouTube</b> — <span class="mono">youtube.readonly</span> لمعرفة القناة، و
        <span class="mono">youtube.upload</span> لرفع مقاطع المشغّل إليها.</li>
      <li><b>TikTok</b> — <span class="mono">user.info.basic</span> لمعرفة الحساب، و
        <span class="mono">video.upload</span> و <span class="mono">video.publish</span> لنشر مقاطعه.</li>
      <li><b>Instagram</b> — <span class="mono">instagram_business_basic</span> لمعرفة الحساب الاحترافيّ، و
        <span class="mono">instagram_business_content_publish</span> لنشر الصور والمقاطع عليه — وحدهما.</li>
    </ul>
    <p>ولا يُستعمل شيءٌ منها في غير ما ذُكر. <b>ولا تُرسَل بياناتُ المنصّة إلى أيّ طرفٍ ثالث</b>
      — ومزوّدو الذكاء الاصطناعيّ يرون ما يكتبه المشغّل وحدَه: نصوصَ مستنداته، وفكرتَه، ووصفَه
      لمقطعه، ولا يرون حسابَه ولا رمزَه ولا شيئا من المنصّة.</p>
    <p><b>ويستعمل صدى خدماتِ YouTube API</b> لرفع المقاطع إلى قناة المشغّل. وباستعماله مع YouTube
      توافق على <a class="tap" href="https://www.youtube.com/t/terms">شروط خدمة YouTube</a>، وتسري على
      ما يمرّ بـ Google <a class="tap" href="https://policies.google.com/privacy">سياسةُ خصوصيّة Google</a>.</p>`)}

  ${section('٤ · ما لا يقع', `<ul class="never">${NEVER.map((n) => `<li>${n}</li>`).join('')}</ul>`)}

  ${section('٥ · الأمن', `<ul>
    <li>رموزُ الوصول والتجديد <b>مشفَّرةٌ في القاعدة</b> بـ AES-GCM، ومفتاحُ التشفير في أسرار
      المنصّة لا في القاعدة ولا في الشيفرة.</li>
    <li>لوحةُ الإدارة خلف عاملين: رمزٌ ومفتاحُ مرور (WebAuthn) أو رمزٌ زمنيّ.</li>
    <li>كلُّ اتّصالٍ عبر HTTPS، وسياسةُ محتوًى صارمة على كلّ صفحة.</li>
    <li>سجلُّ تدقيقٍ يحفظ مَن فعل ماذا ومتى.</li>
  </ul>`)}

  ${section('٦ · حقّك في الحذف', `<p>يفصل المشغّل أيَّ حساب من لوحة صدى، فتُحذف رموزُه من
    القاعدة. ويمكنك أنت — بوصفك صاحبَ الحساب — سحبُ إذن التطبيق متى شئت من إعدادات المنصّة:</p>
    <ul>
      <li>LinkedIn: <span class="mono">${pathArrows('Settings → Data privacy → Permitted services')}</span></li>
      <li>X: <span class="mono">${pathArrows('Settings → Security and account access → Apps and sessions')}</span></li>
      <li>YouTube وGoogle: <a class="tap" href="https://security.google.com/settings/security/permissions">صفحةُ أذونات حساب Google</a></li>
      <li>TikTok وInstagram: من إعدادات الأمان في التطبيق، حيث التطبيقاتُ المربوطةُ بحسابك.</li>
    </ul>
    <p>وسحبُ الإذن يُبطل الرموز فورا عند المنصّة، ويوقف كلَّ نشرٍ لاحق.</p>`)}

  ${section('٧ · التواصل', contact === null
    ? `<p class="ago">لم يُضبط بريدُ تواصلٍ بعد على هذا النشر.</p>`
    : `<p>لأيّ سؤالٍ عن هذه الوثيقة أو طلبِ حذف:
       <a class="tap" href="mailto:${escapeHtml(contact)}"><span class="mono">${escapeHtml(contact)}</span></a></p>`)}

  <footer><a class="tap" href="/terms">شروط الاستعمال</a></footer>
</div>`
}

function termsBody(env: Env, base: string): string {
  const { entity, contact } = operator(env)
  return `<div class="doc">
  <header>
    <div class="glyph">${GLYPH_SVG}</div>
    <h1>شروطُ الاستعمال</h1>
    <p class="ago">آخر تحديث: <span class="mono">${UPDATED}</span> ·
      المشغّل: ${escapeHtml(entity)} · النطاق: <span class="mono">${escapeHtml(base)}</span></p>
  </header>

  ${section('١ · أداةٌ خاصّة لا خدمةٌ عامّة', `<p>صدى أداةٌ داخليّة يشغّلها شخصٌ واحد لإدارة
    محتواه هو. لا تُقدَّم خدمةً لأحد، ولا تُفتح للتسجيل، ولا تُتاح لأطرافٍ أخرى.</p>`)}

  ${section('٢ · المحتوى ومسؤوليّتُه', `<p>تصوغ نماذجُ لغويّة مسوّداتِ المنشورات، <b>ولا
    يُنشر منها شيءٌ قبل أن يقرأه المشغّل ويعتمده بيده.</b> والمشغّل هو المسؤول وحده عن كلّ ما
    يُنشر باسمه، وعن موافقته لشروط المنصّة التي يُنشر عليها.</p>`)}

  ${section('٣ · احترامُ شروط المنصّات', `<p>يلتزم استعمالُ صدى بشروط LinkedIn و X و YouTube و TikTok
    و Instagram ومعدّلاتِ طلباتها. ولا تُستعمل لجمع بياناتٍ ولا لنشرٍ آليٍّ بلا مراجعة ولا لتجاوز حدٍّ.</p>
    <p>ومن يستعمل صدى مع YouTube يوافق على <a class="tap" href="https://www.youtube.com/t/terms">شروط خدمة
      YouTube</a>.</p>`)}

  ${section('٤ · بلا ضمان', `<p>تُقدَّم الأداة كما هي، ولا ضمانَ لتوافرٍ ولا لخلوٍّ من عطل.</p>`)}

  ${section('٥ · التواصل', contact === null
    ? `<p class="ago">لم يُضبط بريدُ تواصلٍ بعد على هذا النشر.</p>`
    : `<p><a class="tap" href="mailto:${escapeHtml(contact)}"><span class="mono">${escapeHtml(contact)}</span></a></p>`)}

  <footer><a class="tap" href="/privacy">سياسة الخصوصيّة</a></footer>
</div>`
}

/** `nonce` جديدٌ لكلّ ردّ — كما في اللوحة سواء. */
function render(body: string, title: string, description: string): Response {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
  return new Response(shell(title, body, nonce, '', { indexable: true, description }), {
    headers: publicPageHeaders(nonce),
  })
}

legal.get('/privacy', (c) =>
  render(
    policyBody(c.env, c.env.PUBLIC_BASE_URL),
    'صدى — سياسة الخصوصيّة',
    'ما تعالجه صدى من بيانات، ولماذا، وكم يبقى — وما لا تفعله.',
  ),
)

legal.get('/terms', (c) =>
  render(termsBody(c.env, c.env.PUBLIC_BASE_URL), 'صدى — شروط الاستعمال', 'شروط استعمال صدى.'),
)
