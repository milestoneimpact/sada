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
import { html, raw } from './ui/html'
import { RETENTION } from '../lib/privacy/retention'
import { UNDO_SECONDS } from '../lib/privacy/trash'
import { RETENTION_DAYS as VITALS_DAYS } from '../lib/vitals'
import { CODE_TTL_SECONDS } from '../lib/security/loginCode'
import { counted, NOUNS } from '../lib/format'

export const legal = new Hono<{ Bindings: Env }>()

/** تاريخُ آخر تعديلٍ جوهريّ — يُرفع باليد حين يتبدّل ما تصفه الوثيقة. */
const UPDATED = '2026-11-12'

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

/** «365 يومًا» و«يومين» — بأرقامٍ غربيّة كما في اللوحة كلّها (D-147)، وبإعراب المعدود (`counted`). */
const days = (n: number, kase: 'nom' | 'gen' = 'gen'): string => counted(n, NOUNS.day, kase)

/**
 * ما يُعالَج فعلا — صفٌّ لكلّ نوع، ولكلٍّ موضعٌ في الشيفرة. **والمددُ تُقرأ من `privacy/retention.ts`** لا تُكتب هنا (D-322):
 * كانت هذه الصفوفُ تقول «حتّى يحذفها المشغّل» أربعَ مرّاتٍ ولا بابَ يحذف، وتقول إنّ لصدى مشغّلًا واحدًا بلا مستخدمين وقد صار
 * له فريقٌ وعملاء (D-272 · D-273).
 */
const DATA: readonly Row[] = [
  {
    what: 'بريد المشغّل وأعضاء فريقه وأدوارهم',
    from: 'دعوة المشغّل — ولا تسجيلَ حسابٍ مفتوح',
    why: 'الدخول برمزٍ يصل البريد، ومعرفة من يملك ماذا ولأيّ عميل',
    where: 'Cloudflare D1، ورمز الدخول في KV ' + counted(Math.round(CODE_TTL_SECONDS / 60), NOUNS.minute),
    howLong: 'ما بقيت الدعوة، ويبقى بعد إلغائها موسومًا «ملغًى» ليُعرف من كان',
  },
  {
    what: 'مفاتيح المرور ورموز التطبيق ورموز الاسترداد',
    from: 'من يسجّلها لحسابه',
    why: 'العامل الثاني بعد رمز البريد',
    where: 'D1 — المفتاح العامّ وحده للمرور، ورمز التطبيق مشفَّرًا، ورموز الاسترداد بصماتٍ لا تُعكَس',
    howLong: 'حتّى يحذفها صاحبها',
  },
  {
    what: 'العملاء: اسم الشركة ونوعها وموجزها (الهدف والجمهور والنبرة)',
    from: 'المشغّل حين يُنشئ العميل',
    why: 'أن يُكتب لكلّ عميلٍ بصوته، وتبقى بياناته معزولةً عن غيره',
    where: 'Cloudflare D1',
    howLong: 'حتّى يحذف المشغّل العميلَ كلَّه (انظر «الحذف والتصدير»)',
  },
  {
    what: 'المصادر: ملفّات مجلّد Drive، والملفّات المرفوعة، والروابط',
    from: 'مجلّد يشاركه المشغّل مع حساب خدمة بقراءةٍ فقط، أو ما يرفعه أو يلصقه بنفسه',
    why: 'تلخيصها وكتابة منشورات منها',
    where: 'لملفّ Drive خلاصتُه وحدها في D1؛ وللمرفوع والرابط نصُّه المستخرَج وأصلُه في R2 وخلاصتُه في D1',
    howLong: 'حتّى يُحذف المصدر — وملفّ Drive يُحذف من مجلّده أوّلًا',
  },
  {
    what: 'معرّف حسابك على المنصّة التي تربطها واسم العرض',
    from: 'نقطة الهويّة في المنصّة بعد إذنك الصريح',
    why: 'معرفة الحساب الذي يُنشر إليه، وعرضُه في اللوحة',
    where: 'Cloudflare D1',
    // ‏الفصلُ (D-197) يحذف الرموز ويُبقي هذا الصفّ موسومًا «مفصولًا»: سجلُّ المنشورات يشير إليه
    howLong: 'يبقى بعد الفصل موسومًا «مفصولًا» لأنّ سجلّ ما نُشر يشير إليه، ويُحذف مع عميله',
  },
  {
    what: 'إذن الوصول وإذن التجديد',
    from: 'المنصّة، عبر OAuth 2.0 بـ PKCE',
    why: 'النشر نيابةً عنك بعد الموافقة على كلّ منشور',
    where: 'D1 — <b>مشفَّرةً بـ <span class="nb">AES-GCM</span></b>، ومفتاحُها في أسرار Worker وحدها',
    howLong: 'حتّى يُفصَل الحساب أو ينتهي الإذن',
  },
  {
    // ‏مقاطعُ المالك (D-180 · D-190) وصورُ الأصول (D-260) والمولَّدة (D-157): R2 — وسياسةٌ لا تذكرها تُسقط مراجعةَ YouTube وTikTok
    what: 'الصور والمقاطع: ما يرفعه المشغّل، وما يُولَّد لمنشور',
    from: 'لوحة صدى، أو خدمة الصور بطلب المشغّل',
    why: 'نشرُها مع منشوراتها بعد أن يعتمد كلّ منشور',
    where: 'Cloudflare R2',
    howLong: 'حتّى تُحذف — والمولَّدة مع منشورها',
  },
  {
    // ‏نصوصُ المقطع (D-190): `captions:<مقطع>` في KV يومًا، ويتجدّد بكلّ حفظٍ من «أنشئ المنشورات»
    what: 'وصف المقطع والنصوص المكتوبة له',
    from: 'جملة يكتبها المشغّل، وما يولّده النموذج منها',
    why: 'مراجعتُها وتحريرُها قبل إنشاء المنشورات، وألّا يُدفع ثمن الوصف نفسِه مرّتين',
    where: 'Cloudflare KV — ومعها اسم النموذج وكلفتُه، بلا سرّ',
    howLong: 'يوم واحد من آخر حفظ',
  },
  {
    what: 'نصّ المنشورات وحالاتُها ومحاولات النشر',
    // ‏ويعتمد الناشرُ المدعوُّ كالمشغّل (D-272 · `access.ts`) — مراجعة D-322
    from: 'ما يولّده النظام أو يكتبه المشغّل وفريقُه، ويعتمده بيده المشغّل أو ناشرٌ من فريقه',
    why: 'سجلّ لما نُشر ولما رُفض، ومنع النشر مرّتين',
    where: 'Cloudflare D1',
    howLong: 'حتّى تُحذف — وما نُشر كلُّه أو بعضُه، أو لم يُعرف أنُشر، يبقى ما بقي عميلُه: محاولاتُه هي ما يمنع نشره مرّتين',
  },
  {
    what: 'سجلّ النشاط: من فعل ماذا ومتى، ومن أيّ عنوان IP ومتصفّح',
    from: 'النظام نفسه',
    why: 'معرفة من فعل ماذا، والتحقيق في دخولٍ مريب',
    where: 'Cloudflare D1',
    howLong: days(RETENTION.auditDays, 'nom') + '؛ وعنوان IP يُقصَّر إلى شبكته بعد ' + days(RETENTION.ipDays) + '؛ و«إرسالٌ رُدّ» ' + days(RETENTION.formRejectDays, 'nom'),
  },
  {
    what: 'دفتر الكلفة',
    from: 'النظام نفسه، قبل أن يُعدّ أيّ طلبٍ مدفوع ناجحًا',
    why: 'حدّ الإنفاق، ومعرفة ما دُفع ولماذا',
    where: 'Cloudflare D1',
    howLong: 'يبقى سجلًّا ماليًّا للمشغّل — مزوّدٌ وعمليّةٌ وكلفة، بلا نصٍّ ولا بريد',
  },
  {
    // ‏وتنبيهُ أمان الحساب (D-317) يحمل البريدَ والجهازَ وعنوانَ IP في نصّه (`security/events.ts`) — فيُقال هنا بمدّته
    what: 'التنبيهات إلى قناة المشغّل (وتنبيهُ أمان الحساب فيها بالبريد والجهاز وعنوان IP)، وتنبيهات اقتراب انتهاء الأذونات',
    from: 'النظام نفسه',
    why: 'أن يعرف المشغّل ما يحتاجه خارج اللوحة، ولا يُرسَل الحدثُ مرّتين',
    where: 'Cloudflare D1',
    howLong: 'ما وصل ' + days(RETENTION.outboxDeliveredDays, 'nom') + '، وما لم يصل ' + days(RETENTION.outboxUndeliveredDays, 'nom') +
      '، وتنبيهات الأذونات ' + days(RETENTION.tokenAlertDays, 'nom') + ' (ويبقى تنبيهُ إذنٍ ما زال قائمًا بتاريخه فلا يُرسَل مرّتين، وأحدثُ تنبيهٍ قبل أسبوعٍ من الانتهاء شاهدًا، بلا نصٍّ ولا بريد)',
  },
  {
    what: 'كعكة جلسة واحدة للوحة، ومعها عنوان IP والمتصفّح الذي فُتحت منه',
    from: 'دخول المشغّل أو العضو',
    why: 'إبقاء الجلسة مفتوحة، وعرضُ الأجهزة المفتوحة ليُبطَل ما لا يُعرف',
    where: 'متصفّح الداخل و Cloudflare KV',
    howLong: 'ثلاثة أيّام على الأكثر، وتنتهي بعد اثنتي عشرة ساعة بلا استعمال، أو حتّى الخروج',
  },
  {
    what: 'عدّادات محاولات الدخول، بالبريد وعنوان IP',
    from: 'كلّ محاولة دخول',
    why: 'حدُّ المحاولات حتّى لا يُخمَّن رمز',
    where: 'Cloudflare D1',
    howLong: days(RETENTION.authAttemptDays, 'nom') + ' (وأطولُ نوافذها يوم)',
  },
  {
    what: 'عيّنات سرعة صفحات اللوحة، بلا هويّة',
    from: 'متصفّح من يفتح اللوحة',
    why: 'معرفة أبطأ الصفحات',
    where: 'Cloudflare D1',
    howLong: days(VITALS_DAYS, 'nom'),
  },
]

/**
 * **من يعالجها معنا** (D-322) — كانت الوثيقةُ لا تسمّي خدمةَ كتابةٍ واحدة، والنصوصُ تُرسَل إلى Anthropic وGemini وما يضيفه المشغّل
 * (`lib/ai/*` · `image/gemini.ts`)، وتُقرأ المستنداتُ بـ Workers AI. صفٌّ لكلّ جهة، وما يصلها.
 */
const PROCESSORS: readonly { readonly who: string; readonly what: string }[] = [
  { who: 'Cloudflare', what: 'الاستضافة والقاعدة (D1) والتخزين (R2 و KV) والطوابير؛ وقراءة الملفّات وتوليد بعض الصور وتحويل الصفحات (Workers AI و Browser Rendering)؛ وإرسال رمز الدخول بالبريد (Email Routing).' },
  { who: 'Anthropic', what: 'تلخيص المصادر وكتابة المسوّدات والخطط (Claude) — يصله نصّ المصدر والفكرة والموجز.' },
  { who: 'Google', what: 'Gemini لتوليد الصور، وللكتابة إن اختارها المشغّل؛ و Drive API لقراءة المجلّد المشترَك؛ و YouTube API لرفع المقاطع.' },
  { who: 'خدمات كتابةٍ يضيفها المشغّل', what: 'أيّ خدمةٍ متوافقةٍ مع واجهة OpenAI يضيفها في الإعدادات بعنوانها — ويصلها ما يصل خدمة الكتابة.' },
  { who: 'المنصّات التي يربطها', what: 'LinkedIn و X و TikTok و Meta (Instagram) و Google (YouTube) — يصل كلّاً منها ما يُنشر عليه وحده.' },
  { who: 'قناة التنبيهات', what: 'العنوان الذي يختاره المشغّل لتنبيهاته (Slack أو غيره) — يصله نصّ التنبيه بلا سرٍّ ولا رمز.' },
]

const NEVER: readonly string[] = [
  'لا نقرأ منشورات غيرك ولا رسائلَك ولا قائمة من تتّصل بهم.',
  'لا نبيع بياناتك ولا نؤجّرها ولا نشاركها مع معلن.',
  'لا إعلانات ولا تتبّع ولا تحليلات طرف ثالث في أيّ صفحة.',
  'لا نُرسل بيانات حسابك على أيّ منصّة إلى مزوّد ذكاء اصطناعيّ — النصّ يُكتب من مستنداتك وكلماتك <b>قبل</b> أن يمسّ حسابك، ولا تعود بيانات المنصّة إليه.',
  'لا نشر آليّ: لا يخرج منشور إلّا بعد أن يعتمده بيده المشغّل أو ناشرٌ من فريقه، والقاعدة نفسها ترفض غير ذلك.',
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

  return `<main class="doc">
  <header>
    <div class="glyph">${GLYPH_SVG}</div>
    <h1>سياسة الخصوصيّة</h1>
    <p class="lede">صدى أداةٌ يشغّلها مشغّلٌ واحد لينشر محتواه ومحتوى عملائه، ومعه فريقٌ يدعوه.
      وهذه الوثيقة تصف ما تعالجه فعلا — لا ما قد تعالجه يوما.</p>
    <p class="ago">آخر تحديث: <span class="mono">${UPDATED}</span> ·
      المشغّل: ${escapeHtml(entity)} · النطاق: <span class="mono">${escapeHtml(base)}</span></p>
  </header>

  ${section('١ · ما صدى', `<p>صدى نظامٌ يقرأ ما يضيفه مشغّلُه — ملفّاتٍ في مجلّد Google Drive يملكه، أو ملفّاتٍ يرفعها،
    أو روابطَ صفحاتٍ ومقاطع — ويستعين بنماذج لغويّة لتلخيصها وصياغة منشوراتٍ منها، ثمّ — <b>بعد موافقةٍ بشريّةٍ على كلّ
    منشور</b> — ينشرها على حسابات المشغّل أو حسابات عملائه في LinkedIn و X و YouTube و TikTok و Instagram، ومعها صورٌ
    تُرفع أو تُولَّد ومقاطعُ يرفعها المشغّل.</p>
    <p><b>ومن يدخل صدى</b>: المشغّلُ، وأعضاءُ فريقٍ يدعوهم ببريدهم بدورٍ (مدير، ناشر، محرّر، قارئ) ولعملاء يختارهم. ولا تسجيلَ
    حسابٍ مفتوح، ولا زوّارَ لهم ملفّات. <b>وعملاءُ المشغّل</b> شركاتٌ يُنشئها في صدى باسمها: لكلٍّ موجزُه ومصادرُه ومنشوراتُه
    وحساباتُه، معزولةً عن غيره. فما تصفه هذه الوثيقة بياناتُ المشغّل ومستنداته وحساباته على المنصّات التي يربطها، وبياناتُ فريقه
    وعملائه.</p>`)}

  ${section('٢ · ما يُعالَج بالضبط', `<div class="scroll"><table>
    <thead><tr><th>ما يُعالَج</th><th>من أين</th><th>لماذا</th><th>أين يُخزَّن</th><th>كم يبقى</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`)}

  ${section('٣ · من يعالجها معنا', html`<ul>${raw(PROCESSORS.map((p) => html`<li><b>${p.who}</b> — ${p.what}</li>`.value).join(''))}</ul>
    <p>وأكثرُ هذه الخدمات خارج المملكة العربيّة السعوديّة (في الولايات المتّحدة غالبًا)، فما يُرسَل إليها يُعالَج هناك بشروطها.</p>`.value)}

  ${section('٤ · بيانات المنصّات', `<p>حين تربط حسابك، تطلب صدى أضيق ما يكفي:</p>
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
    <p>ولا يُستعمل شيء منها في غير ما ذُكر. <b>ولا تُرسَل بيانات المنصّة إلى أيّ طرف ثالث</b>
      — ومزوّدو الذكاء الاصطناعيّ يرون ما يكتبه المشغّل وحدَه: نصوص مستنداته، وفكرتَه، ووصفَه
      لمقطعه، ولا يرون حسابَه ولا رمزَه ولا شيئا من المنصّة.</p>
    <p><b>ويستعمل صدى خدمات YouTube API</b> لرفع المقاطع إلى قناة المشغّل. وباستعماله مع YouTube
      توافق على <a class="tap" href="https://www.youtube.com/t/terms">شروط خدمة YouTube</a>، وتسري على
      ما يمرّ بـ Google <a class="tap" href="https://policies.google.com/privacy">سياسة خصوصيّة Google</a>.</p>`)}

  ${section('٥ · ما لا يقع', `<ul class="never">${NEVER.map((n) => `<li>${n}</li>`).join('')}</ul>`)}

  ${section('٦ · الأمن', `<ul>
    <li>رموز الوصول والتجديد <b>مشفَّرة في القاعدة</b> بـ AES-GCM، ومفتاح التشفير في أسرار
      المنصّة لا في القاعدة ولا في الشيفرة.</li>
    <li>الدخول برمزٍ يصل البريد، ثمّ <b>عاملٌ ثانٍ إلزاميٌّ للمشغّل والمدير والناشر</b>: مفتاح مرور (WebAuthn) أو رمز تطبيق —
      واختياريٌّ للمحرّر والقارئ. ويُسأل عنه ثانيةً قبل الأفعال الحسّاسة، ومنها التصدير والحذف.</li>
    <li>كلّ اتّصال عبر HTTPS، وسياسة محتوًى صارمة على كلّ صفحة.</li>
    <li>سجلّ نشاطٍ يحفظ مَن فعل ماذا ومتى، بمدّته في الجدول أعلاه.</li>
  </ul>`)}

  ${section('٧ · المدد والكنس', html`<p>يدور كنّاسٌ كلَّ ليلة (03:03 بتوقيت UTC) فيمحو ما فات مدّتَه:</p>
    <ul>
      <li>سجلّ النشاط بعد ${days(RETENTION.auditDays)}، وعنوانُ IP فيه يُقصَّر إلى شبكته بعد ${days(RETENTION.ipDays)}
        (IPv4 إلى أوّل ثلاثة أرقام، و IPv6 إلى أوّل ثلاث مجموعات)، و«إرسالٌ رُدّ» بعد ${days(RETENTION.formRejectDays)}.</li>
      <li>التنبيهات: ما وصل بعد ${days(RETENTION.outboxDeliveredDays)}، وما لم يصل بعد ${days(RETENTION.outboxUndeliveredDays)}،
        وتنبيهات الأذونات بعد ${days(RETENTION.tokenAlertDays)} (وتنبيهُ إذنٍ ما زال قائمًا بتاريخه يبقى ما بقي، فلا يُرسَل مرّتين)،
        وعدّادات الدخول بعد ${days(RETENTION.authAttemptDays)}.</li>
      <li>ملفّات ما حُذف من اللوحة تُمحى من R2 في أوّل كنسٍ بعد انقضاء مهلة التراجع.</li>
      <li>وعيّنات سرعة الصفحات تُمحى بعد ${days(VITALS_DAYS)}، عند كتابة كلّ عيّنةٍ جديدة لا في الكنس.</li>
    </ul>
    <p><b>ونُسخ الاسترجاع</b>: يحفظ Cloudflare D1 حالَ القاعدة ثلاثين يومًا لاسترجاعها (Time Travel)، فما يُحذف قد يبقى فيها
      حتّى تنقضي مدّتُها، ولا يُقرأ منها إلّا عند استرجاعٍ بعد عطل.</p>`.value)}

  ${section('٨ · الحذف والتصدير', pathArrows(`<p><b>ما يضيفه المشغّل يُحذف من اللوحة</b>، ويعود بزرّ «تراجَع» في إشعار الحذف
    خلال ${counted(Math.round(UNDO_SECONDS / 60), NOUNS.minute, 'gen')}، ثمّ لا:</p>
    <ul>
      <li>المسوّدة: «أفعال أخرى» على بطاقتها ← «احذفها». والمنشورُ الذي نُشر — كلُّه أو بعضُه، أو لم يُعرف أبلغ منصّتَه — لا يُحذف
        وحده: محاولاتُه هي ما يمنع نشره مرّتين، فيُحذف مع عميله.</li>
      <li>المصدر: «المكتبة» ← «احذف». وملفّ Drive يُحذف من مجلّده أوّلًا، وإلّا عاد في المسح التالي.</li>
      <li>المقطع: «فيديوهاتك» ← «احذف المقطع»؛ وصورة الأصول: «الأصول» ← «احذف».</li>
    </ul>
    <p><b>والعميل كلّه</b>: من «الإعدادات» ← «متقدّم» ← «منظّماتك»، «صدّر» ثمّ «نزّل الملفّ»: ملفّ JSON بكلّ بياناته — بلا أذونات المنصّات ولا
      أسرارٍ ولا عوامل دخول ولا عناوين IP — ثمّ «احذف عميلًا وبياناته» بعد فصل حساباته وكتابة اسمه. ولا يُردّ، ولا يُحذف بلا
      تصديرٍ في آخر يوم، ولا تُحذف منظّمةُ المشغّل نفسِه. ويبقى بعده دفترُ الكلفة وحده، وسطرُ الحذف في سجلّ المشغّل.</p>
    <p><b>والحساب على المنصّة</b>: في صفحة كلّ منصّة من لوحة صدى، تحت «الإعداد»، زرّ <b>«افصل الحساب»</b>. وحين يؤكّده
      المشغّل أو مديرٌ من فريقه يقع هذا كلُّه:</p>
    <ul>
      <li>يُحذف صفّ إذن الوصول وإذن التجديد المشفَّر لذلك الحساب من القاعدة.</li>
      <li>يُوقَف كلّ منشور مجدول عليه ويُوسَم «فشل» بسبب الفصل، ولا يُنشَر منه شيء.</li>
      <li>يُطلب من المنصّة إبطال الإذن حيث لها نهاية إبطال (Google وX وLinkedIn وTikTok،
        وInstagram حين رُبط عبر صفحة فيسبوك). وإن تعذّر الطلب فالحذف عندنا وقع قبله.</li>
      <li>يُكتب في سجلّ النشاط أنّ الحساب فُصل ونتيجة طلب الإبطال، بلا أيّ قيمة من الرموز.</li>
    </ul>
    <p>ويمكنك أنت، بوصفك صاحب الحساب، سحب إذن التطبيق متى شئت من إعدادات المنصّة:</p>
    <ul>
      <li>LinkedIn: <span class="mono">${pathArrows('Settings → Data privacy → Permitted services')}</span></li>
      <li>X: <span class="mono">${pathArrows('Settings → Security and account access → Apps and sessions')}</span></li>
      <li>YouTube وGoogle: <a class="tap" href="https://security.google.com/settings/security/permissions">صفحة أذونات حساب Google</a></li>
      <li>TikTok وInstagram: من إعدادات الأمان في التطبيق، حيث التطبيقات المربوطة بحسابك.</li>
    </ul>
    <p>وسحب الإذن يُبطل الرموز عند المنصّة، فلا يقع بعده نشر باسمك. <b>وإن كنتَ عميلًا أو عضوًا</b> وتريد نسخةً من بياناتك أو
      حذفها، فراسل المشغّل على عنوان التواصل أدناه.</p>`))}

  ${section('٩ · التواصل', contact === null
    ? `<p class="ago">لم يُضبط بريد تواصل بعد على هذا النشر.</p>`
    : `<p>لأيّ سؤال عن هذه الوثيقة أو طلب حذف:
       <a class="tap" href="mailto:${escapeHtml(contact)}"><span class="mono">${escapeHtml(contact)}</span></a></p>`)}

  ${policyEnglish(contact)}

  <footer><a class="tap" href="/terms">شروط الاستعمال</a> · <a class="tap" href="/terms#en" lang="en">Terms of Service</a></footer>
</main>`
}

function termsBody(env: Env, base: string): string {
  const { entity, contact } = operator(env)
  return `<main class="doc">
  <header>
    <div class="glyph">${GLYPH_SVG}</div>
    <h1>شروط الاستعمال</h1>
    <p class="ago">آخر تحديث: <span class="mono">${UPDATED}</span> ·
      المشغّل: ${escapeHtml(entity)} · النطاق: <span class="mono">${escapeHtml(base)}</span></p>
  </header>

  ${section('١ · ما صدى', `<p>صدى أداة لإدارة المحتوى ونشره: يربط فيها صاحبُ الحساب حساباتِه
    على المنصّات، ويكتب معه المسوّدات، وينشر ما يعتمده <b>على حساباته هو وحدها</b>. ولا تنشر على
    حساب أحدٍ آخر، ولا تجمع بيانات غير صاحبها.</p>`)}

  ${section('٢ · المحتوى ومسؤوليّتُه', `<p>تصوغ نماذج لغويّة مسوّدات المنشورات، <b>ولا
    يُنشر منها شيء قبل أن يقرأه المشغّل أو ناشرٌ من فريقه ويعتمده بيده.</b> والمشغّل هو المسؤول وحده عن كلّ ما
    يُنشر باسمه، وعن موافقته لشروط المنصّة التي يُنشر عليها.</p>`)}

  ${section('٣ · احترام شروط المنصّات', `<p>يلتزم استعمال صدى بشروط LinkedIn و X و YouTube و TikTok
    و Instagram ومعدّلات طلباتها. ولا تُستعمل لجمع بيانات ولا لنشر آليّ بلا مراجعة ولا لتجاوز حدّ.</p>
    <p>ومن يستعمل صدى مع YouTube يوافق على <a class="tap" href="https://www.youtube.com/t/terms">شروط خدمة
      YouTube</a>.</p>`)}

  ${section('٤ · بلا ضمان', `<p>تُقدَّم الأداة كما هي، ولا ضمان لتوافر ولا لخلوّ من عطل.</p>`)}

  ${section('٥ · التواصل', contact === null
    ? `<p class="ago">لم يُضبط بريد تواصل بعد على هذا النشر.</p>`
    : `<p><a class="tap" href="mailto:${escapeHtml(contact)}"><span class="mono">${escapeHtml(contact)}</span></a></p>`)}

  ${termsEnglish(contact)}

  <footer><a class="tap" href="/privacy">سياسة الخصوصيّة</a> · <a class="tap" href="/privacy#en" lang="en">Privacy Policy</a></footer>
</main>`
}

/**
 * النسخةُ الإنجليزيّة — **لمراجِعي المنصّات** (TikTok خاصّةً) الذين لا يقرؤون العربيّة.
 * قسمٌ مستقلٌّ بـ `lang="en" dir="ltr"` بعد العربيّ كلِّه، لا سطرٌ مختلط داخله. وتقول ما تقوله
 * العربيّة نفسَها لا أكثر: وعدٌ في ترجمةٍ لا يقابله أصلٌ يُسقط المراجعة كما يُسقطها وعدٌ كاذب.
 */
function englishContact(contact: string | null): string {
  return contact === null
    ? '<p>No contact address is configured on this deployment yet.</p>'
    : html`<p>Questions or deletion requests: <a class="tap" href="mailto:${contact}"><span class="mono">${contact}</span></a></p>`.value
}

function policyEnglish(contact: string | null): string {
  const r = RETENTION
  return html`<section id="en" lang="en" dir="ltr">
  <h2>Privacy Policy (English)</h2>
  <p>SADA is a content management and publishing tool run by one operator for their own content and for their agency clients,
    with team members the operator invites by email and role (admin, publisher, editor, viewer). There is no open sign-up.
    The operator connects accounts on LinkedIn, X, YouTube, TikTok and Instagram, drafts posts with the help of language models,
    and SADA publishes <b>only what a person approves, only to the accounts connected for that client</b>.</p>
  <h3>What we process</h3>
  <ul>
    <li>Emails and roles of the operator and invited members; one-time login codes (KV, ${String(Math.round(CODE_TTL_SECONDS / 60))} minutes); passkey public keys, encrypted authenticator secrets and hashed recovery codes.</li>
    <li>Client organisations: name, type and brief (goal, audience, tone).</li>
    <li>Sources: files in one shared Google Drive folder (summaries only, in Cloudflare D1), and uploaded files and links (extracted text and the original in Cloudflare R2, summary in D1).</li>
    <li>Your account ID and display name on each connected platform — to know where to publish.</li>
    <li>OAuth access and refresh tokens — stored in Cloudflare D1, <b>encrypted with AES-GCM</b>; the key lives only in Worker secrets.</li>
    <li>Images and videos uploaded or generated for posts — stored in Cloudflare R2 until deleted.</li>
    <li>Post text, statuses, publish attempts, a cost ledger and an activity log with IP address and browser — in Cloudflare D1.</li>
    <li>One session cookie for the panel, with the IP and browser it was opened from — three days at most, or until sign-out.</li>
  </ul>
  <h3>Who processes it with us</h3>
  <ul>
    <li><b>Cloudflare</b> — hosting, database, storage, queues, Workers AI and Browser Rendering, and login-code email.</li>
    <li><b>Anthropic</b> (Claude) and <b>Google</b> (Gemini) — summarising sources and drafting posts and images; Google also for Drive (read-only) and YouTube.</li>
    <li>Any OpenAI-compatible writing service the operator adds in settings.</li>
    <li>The platforms you connect — each receives only what is published to it — and the operator's alert channel.</li>
  </ul>
  <p>Most of these services are outside Saudi Arabia (mostly in the United States).</p>
  <h3>TikTok data</h3>
  <p>With your consent through Login Kit, SADA requests <span class="mono">user.info.basic</span> (open id, display name,
    avatar) to show which account is connected, and <span class="mono">video.upload</span> /
    <span class="mono">video.publish</span> (Content Posting API) to post the videos you approve. SADA does not read
    your feed, followers, messages or other users' content.</p>
  <h3>Retention</h3>
  <p>A nightly job deletes the activity log after ${String(r.auditDays)} days, shortens its IP addresses to their network after
    ${String(r.ipDays)} days, and deletes its rejected form submissions after ${String(r.formRejectDays)} days; it deletes
    delivered alerts after ${String(r.outboxDeliveredDays)} days and undelivered ones after ${String(r.outboxUndeliveredDays)} days;
    token-expiry alerts after ${String(r.tokenAlertDays)} days (an alert for a token that is still current is kept while it lasts, so
    it is never sent twice, and the latest seven-day warning is kept as a record); and login-attempt counters after
    ${String(r.authAttemptDays)} days. Files of deleted items are erased from storage in the first nightly run after the undo window.
    Page-speed samples (no identity) are kept ${String(VITALS_DAYS)} days: older ones are deleted each time a new one is written.
    Database point-in-time recovery (Cloudflare D1 Time Travel) keeps 30 days.</p>
  <h3>What we never do</h3>
  <ul>
    <li>No selling, renting or sharing of your data with advertisers.</li>
    <li>No ads, tracking or third-party analytics on any page.</li>
    <li>No automatic posting: nothing is published until the operator, or a publisher on their team, approves it.</li>
  </ul>
  <h3>Deletion and export</h3>
  <p>Drafts, sources, videos and uploaded images can be deleted from the panel and restored with "Undo" for
    ${String(Math.round(UNDO_SECONDS / 60))} minutes; their files are then erased from storage. A post that was published, in whole
    or in part, or whose outcome on the platform is unknown, stays as the record that prevents publishing it twice, and is deleted
    with its client. A whole client can be exported as one JSON file (without
    tokens, secrets or login factors) and then deleted. Disconnecting an account deletes its encrypted tokens, cancels its
    scheduled posts and asks the platform to revoke access (TikTok included). You can also revoke SADA at any time from the
    security settings of each platform.</p>
  <h3>Contact</h3>
  ${raw(englishContact(contact))}
</section>`.value
}

function termsEnglish(contact: string | null): string {
  return html`<section id="en" lang="en" dir="ltr">
  <h2>Terms of Service (English)</h2>
  <h3>1. What SADA is</h3>
  <p>SADA is a content management and publishing tool. The account owner connects their own social accounts, drafts posts
    with SADA, and publishes what they approve <b>to their own accounts only</b>. SADA never posts to anyone else's account
    and does not collect data about other people.</p>
  <h3>2. Content and responsibility</h3>
  <p>Language models draft posts, but <b>nothing is published until the owner, or a publisher on their team, reads and approves it</b>. The owner is solely
    responsible for what is published under their name and for complying with each platform's terms.</p>
  <h3>3. Platform terms</h3>
  <p>Use of SADA follows the terms and rate limits of LinkedIn, X, YouTube, TikTok and Instagram. SADA is not used for
    scraping, unreviewed automated posting, or circumventing limits. Users of SADA with YouTube agree to the
    <a class="tap" href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>.</p>
  <h3>4. No warranty</h3>
  <p>SADA is provided as is, without any guarantee of availability or freedom from errors.</p>
  <h3>5. Contact</h3>
  ${raw(englishContact(contact))}
</section>`.value
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
