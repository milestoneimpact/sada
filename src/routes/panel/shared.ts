/**
 * مسارات اللوحة — ما تتقاسمه أقسامُ اللوحة: الصفحةُ بترويساتها، وصفحةُ الدخول، والإشعار، وبوّابةُ كلّ فعل، والعودةُ إلى القسم.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { finalizeApproved } from '../../lib/image/job'
import type { Env } from '../../env'
import { panelHref } from '../../lib/nav/panes'
import { NO_CREDIT } from '../../lib/media/workersAi'
import { appStatuses } from '../../lib/oauth/apps'
import { LINKEDIN_VERSION } from '../../lib/oauth/providers'
import { versionAge } from '../../lib/oauth/version'
import { readSettings } from '../../lib/settings'
import { chosenTiles } from '../../lib/dashboard'
import { checkCsrf, COOKIE, loadSession, readCookie, safeNext, type Session } from '../../lib/session'
import { htmlHeaders, makeNonce } from '../../lib/security/headers'
import { listPasskeys } from '../../lib/security/factors'
import { listAccounts } from '../../lib/channels'
import { activeScopes } from '../../lib/platform/screen'
import { type OwnerFacts } from '../../lib/owner'
import { reachOf, tiktokNeedsScope, type Reach } from '../../lib/media/uploads'
import { relyingParty } from '../../lib/security/rp'
import { record } from '../../lib/audit'
import { loginPage, type PanelFlash } from '../panelView'
import { say, type ErrorId } from '../../lib/errors/catalog'
import { recordReject } from '../../lib/forms'
import { enqueueAhead } from '../../lib/schedule/job'

/** أسماء أسرار المدمَجين — سرٌّ في البيئة يغلب ما في الجدول. */
export const BUILTIN_SECRET: Readonly<Record<string, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
}

/** من قرّر — بطريق الدخول (D-245): `panel:token` للجلسات القديمة وحدَها. */
export function deciderOf(via: string): string {
  return via === 'passkey' ? 'panel:passkey' : via === 'email_code' ? 'panel:email' : 'panel:token'
}

/**
 * المدى بالأيّام — **قائمةُ سماحٍ لا مدى مفتوح**.
 *
 * ورقمٌ يأتي من الشبكة يفتح استعلاما بمداه: **«‏٩٩٩٩٩ يوما» تمسح الجدولَ
 * كلَّه** في كلّ فتحةٍ للصفحة. والسقفُ في `LIMIT` يحرس الذاكرة، **وهذا
 * يحرس القاعدة**.
 */
export const SPAN_DAYS: ReadonlySet<number> = new Set([7, 30, 90, 365])

export function readSpan(raw: string | null): number {
  const n = Number(raw)
  return SPAN_DAYS.has(n) ? n : 30
}

/**
 * صفحةُ HTML بترويساتها كاملةً.
 *
 * الـ `nonce` يُولَّد **قبل** الرسم لأنّه يدخل في الوسوم نفسها، ويخرج في
 * الترويسة. فلا سبيل إلى رسم صفحةٍ بلا سياسةٍ تحرسها: من نادى هذه الدالّة
 * نال الاثنين معا.
 */
export function page(render: (nonce: string) => string, status = 200): Response {
  const nonce = makeNonce()
  return new Response(render(nonce), { status, headers: htmlHeaders(nonce) })
}

/**
 * أثمّة مفتاحُ مرورٍ على هذه البيئة؟ — **فبابُه يبقى في كلّ صفحة دخول** (D-161).
 *
 * كانت صفحةُ الدخول تعرضه في `GET /panel` وحده: كلمةُ إدارةٍ خاطئةٌ مرّةً، أو
 * جلسةٌ انتهت في منتصف عمل، فتُرسَم الصفحةُ بلا زرّه، والمالكُ يُدفَع إلى
 * الكلمة التي بُني المفتاحُ ليغني عنها. والقراءةُ لا تُسقط الصفحة: قاعدةٌ
 * متعبةٌ تُرسم دخولًا بالكلمة لا خطأً.
 */
export async function hasPasskeys(env: Env): Promise<boolean> {
  try {
    // ‏مفاتيحُ النطاق كلُّها (D-317): صفحةُ الدخول لا تعرف صاحبَها بعد
    return (await listPasskeys(env.DB, relyingParty(env.PUBLIC_BASE_URL).id)).length > 0
  } catch {
    return false
  }
}

/**
 * صفحةُ الدخول لطلبٍ بلا جلسة — **تعود بالمالك إلى ما طلبه، وتقول «انتهت» لمن انتهت جلستُه وحده**.
 *
 * كانت تُنادى برسالةٍ ثابتة «انتهت الجلسة» لكلّ طلبٍ بلا جلسة، فيقرؤها من لم يدخل قطّ
 * تحذيرًا برتقاليًّا. فالكعكةُ هي الفرق: من أرسل كعكةً سقطت انتهت جلستُه، ومن لم يرسل
 * شيئًا يدخل أوّلَ مرّة. **والوجهةُ مسارُ الطلب نفسُه** إن كان صفحةً تُفتَح (`GET`)،
 * ليعود إليها بعد الدخول لا إلى الرئيسيّة (ر-11). وفعلٌ (`POST`) سقطت جلستُه لا يُعاد
 * إرسالُه — فالرئيسيّة.
 */
export async function loginResponse(env: Env, request: Request, status = 401): Promise<Response> {
  const passkeys = await hasPasskeys(env)
  const url = new URL(request.url)
  const opened = request.method === 'GET'
  const next = opened ? safeNext(`${url.pathname}${url.search}`) : '/panel'
  const lapsed = readCookie(request.headers.get('Cookie'), COOKIE) !== null
  const error = !lapsed
    ? undefined
    : opened ? 'انتهت الجلسة. ادخل لتكمل من حيث توقّفت.' : 'انتهت الجلسة — أعد الدخول.'
  return page((nonce) => loginPage({ ...(error === undefined ? {} : { error }), passkeys, next }, nonce), status)
}

/**
 * الإشعار يُخزَّن في KV بمفتاح الجلسة لا في عنوان الصفحة.
 *
 * لو حُمل في `?msg=` لصنع رابطا يعرض رسالةً ملفّقة لمن يفتحه — «تمّ
 * الحذف» مثلا. وهنا لا يكتبه إلا الخادم، ويُقرأ مرّةً ويُمحى.
 */
export async function setFlash(env: Env, request: Request, flash: PanelFlash): Promise<void> {
  const id = readCookie(request.headers.get('Cookie'), COOKIE)
  if (id === null) return
  await env.KV.put(`flash:${id}`, JSON.stringify(flash), { expirationTtl: 60 })
}

export async function takeFlash(env: Env, request: Request): Promise<PanelFlash | null> {
  const id = readCookie(request.headers.get('Cookie'), COOKIE)
  if (id === null) return null
  const key = `flash:${id}`
  const raw = await env.KV.get(key)
  if (raw === null) return null
  await env.KV.delete(key)
  try {
    return JSON.parse(raw) as PanelFlash
  } catch {
    return null
  }
}

/**
 * بوّابةُ كلّ فعلٍ في اللوحة: جلسةٌ صالحة، ثمّ رمزُ CSRF.
 *
 * **وهي تقرأ النموذج بنفسها وتردّه.** ولو تركتُ كلّ مسارٍ يقرأ نموذجه ثمّ
 * ينادي حارسا، لأمكن أن يُكتب مسارٌ يقرأ ولا ينادي — والجسدُ لا يُقرأ
 * مرّتين فلا سبيل إلى حارسٍ يسبق. فمن أراد النموذج مرّ من هنا، ومن لم
 * يمرّ لا نموذج له.
 *
 * وترتيبُ الفحصين مقصود: الجلسةُ أوّلا لأنّ رمز CSRF يُقرأ منها.
 */
export async function guardPost(c: {
  env: Env
  req: { raw: Request; formData: () => Promise<FormData> }
}): Promise<{ denied: Response } | { form: FormData; session: Session }> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) {
    return { denied: await loginResponse(c.env, c.req.raw) }
  }
  // **والجلسةُ المعلَّقةُ لا تصل هنا** (D-317): يردّها حارسُ الجلسات قبل كلّ مسار (`routes/access.ts`)، فلا يسأل كلُّ
  // ‏مسارٍ «أمعلَّقةٌ هي؟» بنفسه — ومسارٌ ينسى السؤالَ كان الطريقَ الجانبيّ حول العامل الثاني

  // جسدٌ غائبٌ أو مشوَّه ليس عطلا في الخادم: هو طلبٌ لا رمز فيه. ولو تُرك
  // يرمي لردّ 500 — فيبدو خللا في صدى وهو طلبٌ مرفوض
  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    form = new FormData()
  }

  if (!(await checkCsrf(session, String(form.get('_csrf') ?? '')))) {
    // 403 لا 401: الجلسةُ قائمة، والطلبُ هو المرفوض. ولا يُعاد رسمُ صفحةِ
    // دخولٍ هنا فيظنّ المالك أنّ جلسته سقطت وهي لم تسقط.
    await record(
      c.env.DB,
      { actor: 'panel', action: 'csrf.reject', target: new URL(c.req.raw.url).pathname },
      c.req.raw,
    )
    return {
      denied: Response.json(
        { error: 'csrf_failed', detail: say('csrf_failed') },
        { status: 403 },
      ),
    }
  }

  return { form, session }
}

/**
 * مَن يرى المقطع الآن (D-190) — **قرارُ المالك ونطاقُ حساب TikTok النشط معًا**، بحكم الناشر
 * نفسِه (`canUploadMedia`). موضعٌ واحدٌ لكلّ ما يقول «للعامّة» أو «خاصّ»: صفُّ المقطع وصفحةُ
 * المنصّة وإشعارا الجدولة ومعاينةُ الخطّة — فلا يقرأ أحدُها الإعدادَ وحدَه.
 */
export async function reachNow(db: Env['DB'], org: string): Promise<Reach> {
  return reachOf(await readSettings(db), await activeScopes(db, org, 'tiktok'))
}

/** كلّ فعلٍ يعود إلى القسم الذي انطلق منه — لا إلى رأس الصفحة. */
export function back(hash: string): Response {
  // ‏والمسارُ من مصدرٍ واحد (D-211): «providers» تعود إلى «/panel/settings»، والبطاقةُ إلى «/panel»
  return new Response(null, { status: 303, headers: { Location: panelHref(hash) } })
}

/**
 * **وفعلٌ على بطاقةٍ يعود إلى البطاقة نفسِها** — لا إلى رأس «المنشورات».
 *
 * كان كلُّ فعلٍ على بطاقة يعيد `#posts`: قِيس في رحلة R-4 على الهاتف ‏8467px تمريرًا
 * من ‏13931 في البحث عن البطاقة بعد كلّ «جدوِل»، وبعد «اعتمد» كان نموذجُ الجدولة الذي
 * يطلبه الإشعارُ عند ‏2405px. فـ`d-<id>` رأسُ البطاقة، و`s-<id>` شريطُ جدولتها حين
 * تكون الخطوةُ التالية موعدًا. و`show()` في سكربت اللوحة تنزل إلى أيّ معرّفٍ في اللوح.
 *
 * **والمعرّفُ يُفحَص قبل أن يُكتب في العنوان** — كما في `requeue`: ما ليس معرّفًا يعود
 * إلى اللوح.
 */
export function toCard(part: 'd' | 's', id: string): Response {
  return POST_ID.test(id) ? back(`${part}-${id}`) : back('posts')
}

/** معرّفُ منشورٍ كما يُكتب في العنوان — وما سواه لا يُكتب. */
export const POST_ID = /^[0-9a-f-]{8,}$/

/** ‏نافذةُ «المنشورات»: ما ترسمه اللوحةُ بطاقاتٍ، وما يوزَّع منه، وما يُنزَل إليه — عددٌ واحد. */
export const BOARD = 60

/** أسماءُ أسرار Worker ومتغيّراته المضبوطة — من البيئة وحدها بلا استعلام (D-005 · D-280). */
export type EnvFacts = Pick<OwnerFacts, 'secrets' | 'vars'>

/**
 * **وجودُ السرّ يُفحَص لا قيمتُه** (D-042): ما تحتاجه نقاطُ الجاهزيّة والشريحةُ من حقائق المالك هو هذا وحدَه،
 * فيُقرأ من البيئة بلا الاستعلامات السبعة التي تجمعها `ownerFacts` لشاشة «ما عليك» (D-280).
 */
export function envFacts(env: Env): EnvFacts {
  const bag = env as unknown as Record<string, string | undefined>
  const has = (name: string): boolean => {
    const v = bag[name]
    return typeof v === 'string' && v.trim() !== ''
  }
  return {
    secrets: new Set(
      ['TOKEN_ENC_KEY', 'ADMIN_TOKEN', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
       'GOOGLE_SA_JSON', 'CF_AI_TOKEN', 'CF_BROWSER_TOKEN'].filter(has),
    ),
    vars: new Set(['LEGAL_ENTITY', 'LEGAL_CONTACT', 'CF_AI_ACCOUNT_ID'].filter(has)),
  }
}

/**
 * حقائقُ المالك — **تُجمَع من البيئة والقاعدة، ولا تُكتب بيد.**
 *
 * ولا يُقرأ سرٌّ ولا يُفكّ تشفير: **أسماءٌ وحالٌ فقط** (D-005).
 */
export async function ownerFacts(c: {
  env: Env
}, org: string): Promise<OwnerFacts> {
  const env = c.env as unknown as Record<string, string | undefined>

  const accounts = await listAccounts(c.env.DB, org)
  // ‏كلُّ منصّةٍ لها سرّان (D-142) — وكانت Instagram خارجها، فمهمّتُها لا تعرف أنّ سرّيها حُفظا
  const apps = await appStatuses(c.env.DB, env)
  const ownerSettings = await readSettings(c.env.DB)

  let anyPublished = false
  try {
    const row = await c.env.DB
      .prepare("SELECT 1 AS n FROM publish_attempts WHERE org_id = ? AND status = 'succeeded' LIMIT 1")
      .bind(org)
      .first<{ n: number }>()
    anyPublished = row !== null
  } catch {
    // جدولٌ لا يُقرأ: تبقى `false` — **ولا يُدَّعى نجاحٌ لم يُقرأ**
  }

  let videoPriced = false
  try {
    const row = await c.env.DB
      .prepare(
        `SELECT 1 AS n FROM cost_ledger
          WHERE org_id = ? AND operation LIKE '%video%' AND unit_cost > 0 LIMIT 1`,
      )
      .bind(org)
      .first<{ n: number }>()
    videoPriced = row !== null
  } catch {
    // كما سبق
  }

  // ‏رصيدُ AI Gateway من آخر «حرّكها فيديو» (D-214): السجلُّ يحفظ السببَ، فلا عمودَ ولا ترحيل
  let gatewayCredit: 'short' | 'ok' | undefined
  try {
    const row = await c.env.DB
      .prepare(
        `SELECT detail FROM audit_log WHERE org_id = ? AND action = 'media.animate'
            AND (detail LIKE 'generated%' OR detail LIKE 'failed:%')
          ORDER BY at DESC, rowid DESC LIMIT 1`,
      )
      .bind(org)
      .first<{ detail: string | null }>()
    if (row !== null) gatewayCredit = (row.detail ?? '').includes(NO_CREDIT) ? 'short' : 'ok'
  } catch {
    // كما سبق: لا يُقرأ فلا يُعرَف
  }

  return {
    ...(gatewayCredit === undefined ? {} : { gatewayCredit }),
    ...envFacts(c.env),
    linked: new Set(accounts.filter((a) => a.status !== 'revoked').map((a) => a.platform)),
    appsConfigured: new Set(apps.filter((a) => a.source !== 'none').map((a) => a.platform)),
    appsVerified: new Set(
      apps.filter((a) => a.verifiedKind === 'accepted').map((a) => a.platform),
    ),
    anyPublished,
    videoPriced,
    // **يُحسَب من الرقم والتاريخ** لا من صفٍّ ولا من يد (D-072)
    linkedInVersionDue: versionAge(LINKEDIN_VERSION, new Date())?.due ?? false,
    // قراراتُ المالك تُقاس من الإعدادات نفسِها لا من يد (D-130)
    tilesChosen: chosenTiles(ownerSettings.dashboardTiles).length,
    promoCapUsd: ownerSettings.weeklyPromoCapUsd,
    // ‏والقلبُ دليلٌ لا حكم: الإجازةُ عند المنصّة (D-190)
    publicReach: new Set([
      ...(ownerSettings.youtubePublic ? ['youtube'] : []),
      ...(ownerSettings.tiktokPublic ? ['tiktok'] : []),
    ]),
    // ‏وقلبٌ بلا `video.publish` يبقى صندوقًا — بحكم الناشر (D-190)
    tiktokNoScope: tiktokNeedsScope(reachOf(ownerSettings, await activeScopes(c.env.DB, org, 'tiktok'))),
  }
}

/**
 * **النهائيّةُ بعد الاعتماد في الخلفيّة** (D-285): ما اعتُمد ومعه صورةُ مسوّدةٍ (schnell) يُعاد رسمُه بـ klein 9B
 * بعد أن يعود الجواب، فلا ينتظر المالكُ نموذجًا ليرى «اعتُمدت». وبلا سياق تنفيذٍ (الاختبار) يجري ولا يُنتظَر.
 */
export function finalizeLater(
  c: { env: Env; executionCtx: { waitUntil(p: Promise<unknown>): void } },
  org: string,
  ids: readonly string[],
): void {
  if (ids.length === 0) return
  const job = finalizeApproved(
    { db: c.env.DB, bucket: c.env.MEDIA, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined> },
    org, ids,
  ).catch(() => 0)
  try {
    c.executionCtx.waitUntil(job)
  } catch {
    // ‏لا سياقَ تنفيذٍ خارج Worker
  }
}

/**
 * ‏**أفعالُ اللوحة التي تضع موعدًا** (D-320): الجدولةُ و«اعتمد وجدوِل» والتوزيعُ وتغييرُ الموعد والتراجعُ عن السحب، وجدولةُ
 * ‏الخطّة وتثبيتُها وتأخيرُ بندها (واحدًا أو محدَّدًا)، واعتمادُ الخطّة المستوردة، ومنشوراتُ المقطع بموعدها. بعد كلٍّ منها تُرسَل
 * ‏الرسالةُ المؤجَّلةُ إلى دقيقتها (`dispatchSoon`). **واختبارُها يشتقّها من الشيفرة** (`routes/soon.test.ts`): كلُّ مسارٍ ينادي
 * ‏دالّةَ جدولةٍ بنفسه أو بوسيط — وكانت القائمةُ تُكتب باليد ففاتها «ثبّت الخطّة» و«اعتمد» المستوردة و«أخّر» المحدَّد (مراجعة D-320).
 */
export const SCHEDULING_PATHS = /^\/panel\/(?:drafts\/(?:decide|schedule|spread\/apply|undo-unschedule|reschedule)|plan\/(?:schedule|package\/schedule|pin|approve-all|check\/fix|review\/(?:approve|delay|move|bulk))|plan-import\/[^/]+\/approve|uploads\/[^/]+\/(?:posts|schedule))$/

/**
 * ‏**موعدٌ قريبٌ يُرسَل إلى دقيقته الآن** (D-320): الدورةُ ترسل ما يحلّ قبل التي بعدها، وموعدٌ بعد خمس دقائق يُضبط بين دورتين
 * ‏فلا تراه دورةٌ قبله — فكان يخرج في الدورة التالية، حتّى ثلاثَ عشرةَ دقيقةً بعد ما وُعد. فبعد كلّ فعلٍ يضع موعدًا يُرسَل ما
 * ‏يحلّ في الأفق **بعد الردّ** (`waitUntil`)، والمالكُ لا ينتظره. وعطلُه لا يمسّ شيئًا: الدورةُ تُرسله كما كانت.
 */
export function dispatchSoon(c: { env: Env; executionCtx: { waitUntil(p: Promise<unknown>): void } }): void {
  const queue = c.env.PUBLISH_QUEUE as Env['PUBLISH_QUEUE'] | undefined
  if (queue === undefined) return
  const job = enqueueAhead({ db: c.env.DB, queue })
    .catch((error: unknown) => { console.warn({ job: 'dispatch-soon', failed: error instanceof Error ? error.message : 'unexpected_error' }); return 0 })
  try {
    c.executionCtx.waitUntil(job)
  } catch {
    // ‏لا سياقَ تنفيذٍ خارج Worker: يجري ولا يُنتظَر
  }
}

/**
 * **إرسالٌ رُدّ لعيبٍ في المُدخَل** (D-302): يُعَدّ في سجلّ النشاط، والجملةُ من الكتالوج (ما وقع وما تفعل) تُرسَل إشعارًا
 * فتظهر في الصفحة التي يعود إليها. موضعٌ واحد لكلّ ردٍّ من هذا النوع، فلا رسالةَ تُكتب في المسار.
 */
export async function rejectForm(
  c: { env: Env; req: { raw: Request } },
  org: string,
  field: string,
  id: ErrorId,
): Promise<void> {
  await recordReject(c.env.DB, { org, path: new URL(c.req.raw.url).pathname, field, id }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'bad', text: say(id) })
}
