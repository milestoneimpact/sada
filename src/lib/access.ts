/**
 * **من يملك ماذا** (D-272) — الدورُ يُفحَص على الخادم في كلّ طلب، لا في الواجهة وحدها.
 *
 * - **القاعدةُ بالمسار**: جدولٌ واحدٌ يقول أدنى دورٍ لكلّ بابٍ يغيّر شيئًا، **وما لم يُذكر فللمالك** — بابٌ جديدٌ يُنسى تصنيفُه
 *   يُغلَق لا يُفتح.
 * - **والقراءةُ مفتوحةٌ للقارئ** إلّا الفريقَ والإعدادات.
 * - **ومن يعمل الآن** في `AsyncLocalStorage` لهذا الطلب وحده: سجلُّ التدقيق يكتب بريدَه، وقائمةُ الشركات تُقصَر على شركاته،
 *   بلا تمريرٍ عبر مئات النداءات.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Role } from './ownerEmail'
import type { Who } from './team'

export const ROLE_RANK: Readonly<Record<Role, number>> = { viewer: 1, editor: 2, publisher: 3, admin: 4, owner: 5 }

export function allows(role: Role, need: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[need]
}

/**
 * **من يلزمه عاملٌ ثانٍ** (D-317): المالكُ، والمديرُ (يربط القنوات ويفصلها)، والناشرُ (يعتمد ويجدول ما يُنشر باسم
 * الشركة). ورمزُ البريد وحده عاملٌ يُنتزَع بانتزاع الصندوق (‏NIST 800-63B لا يقبل البريدَ عاملًا خارج القناة). والمحرّرُ
 * والقارئُ اختياريّان: لا ينشران ولا يغيّران من يدخل.
 */
export function factorRequired(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'publisher'
}

/** أبوابٌ بلا جلسةٍ أو قبل اكتمالها — الدخولُ والخروجُ والعاملُ الثاني. */
const OPEN = /^\/panel\/(login|logout|2fa|passkey\/(challenge|login))(\/|$)/

/** ما تفتحه الجلسةُ المعلَّقة (D-317): شاشةُ العامل الثاني وأبوابُ الدخول والخروج — **ولا شيءَ غيرُها**. */
export function pendingMayOpen(path: string): boolean {
  return OPEN.test(path)
}

/**
 * ما تفتحه **جلسةُ التسجيل وحده** (D-317): حسابٌ يلزمه عاملٌ ثانٍ ولا عاملَ له يرى صفحةَ التسجيل ويسجّل عاملَه الأوّل
 * ويتحقّق للتوّ (برمز البريد) ويقرأ المساعدةَ ويخرج. وما سوى ذلك يُعاد إلى صفحة التسجيل بسببه.
 */
const ENROL_OPEN = /^\/panel\/(enrol|help|logout|stepup(\/[a-z-]+){0,2}|security\/(passkey\/(challenge|register)|totp\/(start|confirm)))$/

export function enrolMayOpen(method: string, path: string): boolean {
  if (OPEN.test(path)) return true
  if (!ENROL_OPEN.test(path)) return false
  // ‏صفحتا التسجيل والمساعدة تُفتحان، وما سواهما فعل
  return method === 'GET' || method === 'HEAD' ? /^\/panel\/(enrol|help|stepup(\/resume)?)$/.test(path) : true
}

/**
 * **الأفعالُ الحسّاسة** (D-317) — لا تجري إلّا بتحقّقٍ في آخر خمس دقائق (`isFresh`): مفتاحُ مرورٍ أو رمزُ تطبيق، أو رمزُ
 * بريدٍ لمن لا عاملَ له. وجلسةٌ مسروقةٌ تقرأ وتكتب مسوّدةً، **ولا تُضيف عاملًا يُبقيها بعد الإبطال**، ولا تدعو عضوًا،
 * ولا تبدّل مفتاحَ مزوّدٍ أو قناةَ التنبيهات، ولا تربط حسابًا أو تفصله.
 *
 * والقائمةُ هنا وحدَها، يقرؤها الحارسُ قبل كلّ مسار — فمسارٌ ينسى السؤالَ لا يُنسى.
 */
const STEP_UP_POST: readonly RegExp[] = [
  /^\/panel\/security\/(passkey\/(challenge|register|delete)|totp\/(start|remove)|recovery\/issue)$/,
  /^\/panel\/sessions\/revoke-all$/,
  /^\/panel\/team\/(invite|revoke)$/,
  /^\/panel\/providers\/(add|key|delete)$/,
  /^\/panel\/channels\/disconnect$/,
]

export function needsStepUp(method: string, path: string, settingKey?: string | null): boolean {
  if (method === 'GET' || method === 'HEAD') return /^\/oauth\/[a-z]+\/start$/.test(path)
  // ‏وفتحُ أبواب الطرفيّة (D-318): بابٌ يُنادى برمزٍ ثابتٍ بلا عاملٍ ثانٍ لا تفتحه جلسةٌ مسروقة
  if (path === '/panel/settings') return settingKey === 'alert_webhook' || settingKey === 'admin_api'
  return STEP_UP_POST.some((re) => re.test(path))
}

/**
 * ما لا يُعاد رسمُه بعد «تحقّق للتوّ» (D-317): **سرٌّ كتبه المالك لا يُخزَّن في الطريق ولا يُطبَع في صفحة** — يُطلب
 * منه ثانيةً. والباقي يُعاد في النموذج كما أرسله ليراه ويضغط «أكمل» بنفسه، فلا يُعاد جسدٌ بلا علمه.
 */
export const STEP_UP_SECRET_FIELDS: Readonly<Record<string, readonly string[]>> = {
  '/panel/providers/key': ['key'],
  '/panel/providers/add': ['key'],
  '/panel/settings': ['value'],
}

/**
 * **الأفعالُ المدفوعة** (D-318) — كلٌّ منها نداءٌ إلى خدمة كتابةٍ أو صور يُسجَّل في `cost_ledger`. والمحرّرُ يكتب المسوّدةَ
 * ويعدّلها مجّانًا (`/panel/drafts/decide` بـ«احفظ»)، ولا يبدأ واحدًا من هذه.
 */
const SPEND_PATHS = /^\/panel\/(plan\/generate|drafts\/(write|idea)|media\/(generate|regenerate|animate)|uploads\/[^/]+\/captions)$/

/** أدنى دورٍ يبدأ فعلًا مدفوعًا (D-318). */
export const SPEND_ROLE: Role = 'publisher'

/** نصُّ السبب تحت كلّ زرٍّ مدفوعٍ يراه المحرّر — **لا زرَّ معطَّلًا بلا سبب** (خطّة التصميم 7.1). */
export const SPEND_LOCKED = 'يبدؤه الناشر أو المدير أو المالك: كلّ توليد نداء مدفوع، والإنفاق لمن يعتمد. وكتابة المسوّدة وتعديلها مفتوحان لك.'

const RULES: readonly (readonly [RegExp, Role])[] = [
  // ‏عواملُ الحساب نفسِه (D-317): كلُّ دورٍ يسجّل عاملَه ويزيله ويتحقّق للتوّ — والمسارُ لا يمسّ إلّا عواملَ بريد الجلسة
  [/^\/panel\/(security|stepup)(\/|$)/, 'viewer'],
  // ‏المالكُ وحدَه: الفريق، والجلسات، ومفاتيحُ المزوّدين، والإعدادات العامّة، وإنشاءُ الشركات، وتطبيقاتُ المنصّات
  [/^\/panel\/(team|sessions|providers|routes|channels\/app)(\/|$)/, 'owner'],
  [/^\/panel\/(settings|orgs)$/, 'owner'],
  // ‏المدير: ربطُ القنوات وفصلُها، والمسحُ والتحليل، والترويج، واستيرادُ الخطط
  [/^\/panel\/(channels\/disconnect|scan|analyze|sources|images\/quota|report\/promote|plan-import|plan\/import|client\/limits)(\/|$)/, 'admin'],
  // ‏الناشر: كلُّ ما يعتمد أو يجدول أو يُنشر
  [/^\/panel\/drafts\/(approve-many|schedule|reschedule|unschedule|requeue|spread\/apply|undo-approve|undo-reject|undo-unschedule)$/, 'publisher'],
  [/^\/panel\/plan\/(approve|approve-all|start|schedule|pin|review\/approve|review\/bulk)$/, 'publisher'],
  [/^\/panel\/uploads\/[^/]+\/schedule$/, 'publisher'],
  [/^\/panel\/client\/report\/send$/, 'publisher'],
  // ‏**وما يُنفق مالًا لمن يعتمد** (D-318): توليدُ الخطّة، والكتابةُ بالذكاء (من مصدرٍ أو فكرةٍ أو نصوصِ مقطع)، والصورُ،
  // ‏وتحريكُها فيديو. كان المحرّرُ يبدأها كلَّها والسقوفُ وحدَها تحدّه؛ وصار الإنفاقُ مربوطًا بالدور الذي يعتمد
  [SPEND_PATHS, 'publisher'],
  // ‏المحرّر: الكتابةُ والتعديلُ والتخطيطُ والوسائط
  [/^\/panel\/(drafts\/(write|idea|spread)|media|uploads|plan|client\/brief|assets\/upload)(\/|$)/, 'editor'],
  // ‏القارئ: الانتقالُ بين شركاته، وإطفاءُ عدّاد الإشعارات (D-294) — الفعلُ نفسُه يبقى بدوره في مساره
  // ‏وعيّنةُ السرعة من متصفّحه (D-299): قياسٌ لا فعل
  [/^\/panel\/(orgs\/switch|notices\/read|vitals)$/, 'viewer'],
]

/**
 * أدنى دورٍ لهذا الطلب، أو `null` لبابٍ مفتوح.
 * و`/panel/drafts/decide` بحسب ما يُطلب: «احفظ» للمحرّر، والاعتمادُ والرفضُ للناشر.
 */
export function requiredRole(method: string, path: string, action?: string | null): Role | null {
  if (OPEN.test(path)) return null
  if (path.startsWith('/oauth/')) return 'admin'
  if (method === 'GET' || method === 'HEAD') {
    if (/^\/panel\/team(\/|$)/.test(path)) return 'owner'
    if (/^\/panel\/(settings|tasks)(\/|$)/.test(path)) return 'admin'
    return 'viewer'
  }
  if (path === '/panel/drafts/decide') return action === 'save' ? 'editor' : 'publisher'
  for (const [re, role] of RULES) if (re.test(path)) return role
  return 'owner'
}

export function orgAllowed(who: Pick<Who, 'orgs'>, org: string): boolean {
  return who.orgs === '*' || who.orgs.includes(org)
}

const store = new AsyncLocalStorage<Who>()

/** يشغّل الطلبَ باسم صاحبه. */
export function runAs<T>(who: Who, fn: () => T): T {
  return store.run(who, fn)
}

/** من يعمل الآن — أو `undefined` خارج طلبٍ مُصادَق (المهامُّ المجدولةُ والطوابير). */
export function whoNow(): Who | undefined {
  return store.getStore()
}

/**
 * أيبدأ صاحبُ الطلب فعلًا مدفوعًا؟ (D-318) — والصفحةُ خارج طلبٍ مُصادَق للمالك (عيّناتُ التدقيق) كـ`ownerViewing`. تسأله
 * الواجهةُ لترسم السببَ بدل الزرّ، والحارسُ يردّ المسارَ نفسَه على الخادم (`SPEND_PATHS`).
 */
export function maySpend(): boolean {
  const who = store.getStore()
  return who === undefined || allows(who.role, SPEND_ROLE)
}

/**
 * أيرى الصفحةَ المالك؟ (مراجعة D-317) — من صاحب الطلب، **والصفحةُ خارج طلبٍ مُصادَق للمالك** (عيّناتُ التدقيق). تسأله
 * قائمةُ الحساب ولوحةُ الأوامر: المالكُ إلى «الجلسات والأمان» في الإعدادات، والعضوُ إلى «أمان حسابك».
 */
export function ownerViewing(): boolean {
  const who = store.getStore()
  return who === undefined || who.role === 'owner'
}
