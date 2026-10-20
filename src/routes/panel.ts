/**
 * مسارات اللوحة.
 *
 * منفصلةٌ عن `/admin/*` عمدا: تلك تُنادى برمزٍ في ترويسة من طرفيّة، وهذه
 * بكعكة جلسةٍ من متصفّح. وخلطُ آليّتي مصادقة في مسارٍ واحد يصنع بابا لا
 * يُفحَص إلا في إحداهما.
 *
 * **وكلّ فعلٍ هنا يمرّ بالقيود نفسها** التي يمرّ بها نداءُ الطرفيّة: زرٌّ
 * في صفحةٍ ليس طريقا جانبيّا حول الحارس.
 */
import { Hono, type Context } from 'hono'
import type { Env } from '../env'
import { ROUTES, type TaskName } from '../lib/ai/registry'

/** أسماء أسرار المدمَجين — سرٌّ في البيئة يغلب ما في الجدول. */
const BUILTIN_SECRET: Readonly<Record<string, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
}
const BUILTIN_DOCS: Readonly<Record<string, string>> = {
  anthropic: 'console.anthropic.com ← API Keys',
  gemini: 'aistudio.google.com/apikey',
}
import { dailySpend, spendByProvider, spendRows, spendThisMonth, spendTodayFor } from '../lib/ai/spend'
import { verifyKey } from '../lib/ai/verify'
import { listModels } from '../lib/ai/models'
import { cfAccountId, cfAccountOf } from '../lib/ai/cloudflare'
import { imageProviderGate, imageSecretName, slideGate } from '../lib/image/gate'
import { imageReadiness, infographicReadiness, routeDot, videoReadiness } from '../lib/media/readiness'
import { analyzeSource } from '../lib/analyze/job'
import { draftFromIdea, draftPost, ideaProblem, type DraftOutcome } from '../lib/draft/job'
import { PLATFORMS, type Platform } from '../lib/draft/prompt'
import { approveMany, decide, getDraft, listDrafts, saveText, undoApprove, undoReject } from '../lib/draft/store'
import { journeyCounts } from '../lib/home'
import { applyPlan, DEFAULT_ZONE, MAX_PLAN_BYTES, PLAN_TEMPLATE, readPlan, type PlanFacts } from '../lib/plan/import'
import { planImportExpired, planImportScreen } from './ui/planImportView'
import { counted, NOUNS } from '../lib/format'
import { platformLabel, type PublishPlatform } from '../lib/oauth/providers'
import { abortUpload, completeUpload, listUploads, postsFromUpload, startUpload, uploadPart } from '../lib/media/uploads'
import { parseRange, resolveRange } from '../lib/media/range'
import { soloNav } from './ui/rail'
import { buildCommands, sectionLabel } from './ui/command'
import { panelHref, type PaneId } from '../lib/nav/panes'
import { readPeaks, type Peaks } from '../lib/schedule/peak'
import { readJourney } from '../lib/journey'
import { journeyBody } from './ui/journeyView'
import { generateForPost, mediaFor, rejectMedia } from '../lib/image/job'
import { animateForPost, bindingFor, videoFace } from '../lib/media/video'
import { NO_CREDIT } from '../lib/media/workersAi'
import { approvePlan, latestPlan, planWeek } from '../lib/plan/job'
import { APP_PLATFORMS, appStatuses, deleteApp, readApp, recordVerification, saveApp } from '../lib/oauth/apps'
import { verifyAppCredentials } from '../lib/oauth/verify'
import { LINKEDIN_VERSION, PLATFORM_IDS, PROVIDERS, redirectUri as callbackUri, type Platform as LinkPlatform } from '../lib/oauth/providers'
import { disconnectAccount, findLinked, REVOKE_PAGE } from '../lib/oauth/disconnect'
import { versionAge } from '../lib/oauth/version'
import { requeue, reschedulePost, schedulePost, unschedule, type ScheduleResult } from '../lib/schedule/job'
import { missingMedia } from '../lib/schedule/media'
import { GAP_MAX_HOURS, GAP_MIN_HOURS, planSpread } from '../lib/schedule/spread'
import { scanDrive } from '../lib/drive/job'
import { attemptsLeft, kb, money, parseSqliteUtc } from '../lib/format'
import { blockerFor, checkAllowance, providerBlocker, videoCapGate } from '../lib/limits'
import { attemptState, clearAttempts, delayMs, recordFailure } from '../lib/rateLimit'
import { releaseAttempt, reserveAttempt } from '../lib/security/gate'
import {
  costOf, deleteProvider, getProvider, listProviders, markVerified,
  normalizeName, resolveKey, saveKey, setEnabled, upsertProvider,
  type Provider,
} from '../lib/providers'
import { checkProviderUrl } from '../lib/ai/urlGuard'
import { verifyCompat } from '../lib/ai/openaiCompat'
import { readRoutes, routeMismatch, writeRoute } from '../lib/ai/routes'
import { readSettings, SETTING_KEYS, settingLabel, writeSetting, type SettingKey } from '../lib/settings'
import { chosenTiles, TILE_MAX, TILE_MIN } from '../lib/dashboard'
import { pivot, readCols, readDimension, readMeasure, toCsv } from '../lib/pivot'
import { FACT_CAP, loadFacts } from '../lib/pivotStore'
import { todayFeed } from '../lib/today'
import { activeOrg, createOrg, listOrgs, orgExists } from '../lib/tenancy'
import type { PivotView } from './ui/sections/pivot'

/**
 * المدى بالأيّام — **قائمةُ سماحٍ لا مدى مفتوح**.
 *
 * ورقمٌ يأتي من الشبكة يفتح استعلاما بمداه: **«‏٩٩٩٩٩ يوما» تمسح الجدولَ
 * كلَّه** في كلّ فتحةٍ للصفحة. والسقفُ في `LIMIT` يحرس الذاكرة، **وهذا
 * يحرس القاعدة**.
 */
const SPAN_DAYS: ReadonlySet<number> = new Set([7, 30, 90, 365])
function readSpan(raw: string | null): number {
  const n = Number(raw)
  return SPAN_DAYS.has(n) ? n : 30
}
import {
  checkCsrf, clearedCookie, COOKIE, createSession, destroySession, listSessions,
  loadSession, readCookie, revokeSessions, safeNext, sessionCookie, setActiveOrg, type Session,
} from '../lib/session'
import { htmlHeaders, makeNonce } from '../lib/security/headers'
import { factorState } from '../lib/security/factors'
import { CHANNELS, isLinkedInPage, linkStates, listAccounts, SETUP, viewChannels } from '../lib/channels'
import { accountHealth, activeScopes, grantedScopes, platformPosts, platformTally } from '../lib/platform/screen'
import { CLIP_PLATFORMS, platformNeeds } from '../lib/platform/needs'
import { history, platformCounts, postCosts, readCursor, upcoming, waiting } from '../lib/platform/timeline'
import { clock, dayLabel, localParts, validZone, zoneNote } from '../lib/time/zone'
import { ownerZone } from '../lib/time/ownerZone'
import { backTo } from '../lib/nav/back'
import { metricsFor } from '../lib/metrics/job'
import { listReports, readReport } from '../lib/report/weekly'
import { decide as decidePromotion, openSuggestions } from '../lib/report/promote'
import { reportScreen } from './ui/reportView'
import { TIMELINE_SCRIPT, timelineScreen, timelineTitle } from './ui/timelineView'
import { gantt, readShift, readSpan as readGanttSpan, windowOf } from '../lib/gantt'
import { GANTT_CAP, loadGantt } from '../lib/ganttStore'
import { ownerRows, pendingCount, type OwnerFacts } from '../lib/owner'
import { tasksScreen } from './ui/tasksView'
import {
  cutTitle, privateReach, reachOf, scheduleFromUpload, tiktokNeedsScope, VIDEO_PLATFORMS, type Reach,
} from '../lib/media/uploads'
import { captionIssues, captionsFor, readCaptions, saveCaptions, type VideoCaptions } from '../lib/media/captions'
import { localToUtc, momentLabel, presetAt } from '../lib/time/local'
import { currentPhase, gatesOf, readGateFacts } from '../lib/gates'
import { expiringTokens } from '../lib/token/expiry'
import { filterOf, platformScreen, tabOf } from './ui/platformView'
import { fingerprint } from '../lib/security/digest'
import { injectCsrf, soloPage } from './ui/shell'
import { notFoundResponse } from './errors'
import { spreadScreen } from './ui/spreadView'
import { relyingParty } from '../lib/security/rp'
import { record, recentAudit } from '../lib/audit'
import { pulses, readHeartbeats } from '../lib/ops/heartbeat'
import { modelName } from '../lib/ai/modelName'
import { loginPage, panelPage, type PanelFlash, type PanelSource } from './panelView'

export const panel = new Hono<{ Bindings: Env }>()

/**
 * صفحةُ HTML بترويساتها كاملةً.
 *
 * الـ `nonce` يُولَّد **قبل** الرسم لأنّه يدخل في الوسوم نفسها، ويخرج في
 * الترويسة. فلا سبيل إلى رسم صفحةٍ بلا سياسةٍ تحرسها: من نادى هذه الدالّة
 * نال الاثنين معا.
 */
function page(render: (nonce: string) => string, status = 200): Response {
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
async function hasPasskeys(env: Env): Promise<boolean> {
  try {
    const factors = await factorState(env.DB, relyingParty(env.PUBLIC_BASE_URL).id)
    return factors.passkeys.length > 0
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
async function loginResponse(env: Env, request: Request, status = 401): Promise<Response> {
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

async function takeFlash(env: Env, request: Request): Promise<PanelFlash | null> {
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
async function guardPost(c: {
  env: Env
  req: { raw: Request; formData: () => Promise<FormData> }
}): Promise<{ denied: Response } | { form: FormData; session: Session }> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) {
    return { denied: await loginResponse(c.env, c.req.raw) }
  }
  // **وهذا هو ما يجعل العامل الثاني عاملا لا سؤالا يُتخطّى**: جلسةٌ لم
  // تُتمّه لا تغيّر شيئا، ولو نُودي المسار مباشرةً بلا مرورٍ بالشاشة
  if (session.record.pending) {
    return {
      denied: Response.json(
        { error: 'pending_second_factor', detail: 'أتمّ العامل الثاني أوّلا.' },
        { status: 403, headers: { Location: '/panel/2fa' } },
      ),
    }
  }

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
        { error: 'csrf_failed', detail: 'رمز النموذج لا يطابق الجلسة. أعد تحميل اللوحة.' },
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
async function reachNow(db: Env['DB'], org: string): Promise<Reach> {
  return reachOf(await readSettings(db), await activeScopes(db, org, 'tiktok'))
}

/** كلّ فعلٍ يعود إلى القسم الذي انطلق منه — لا إلى رأس الصفحة. */
function back(hash: string): Response {
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
function toCard(part: 'd' | 's', id: string): Response {
  return POST_ID.test(id) ? back(`${part}-${id}`) : back('posts')
}

/** معرّفُ منشورٍ كما يُكتب في العنوان — وما سواه لا يُكتب. */
const POST_ID = /^[0-9a-f-]{8,}$/

/**
 * ‏**وفعلٌ من المحرّر يعود إلى المحرّر** (D-198): `?open=<id>` والمرساةُ قسمُه فيه («#ed» رأسُه،
 * ‏«#ed-when» موعدُه). والمعرّفُ يُفحَص كما في `toCard`.
 */
function toEditor(id: string, part: 'ed' | 'ed-when' = 'ed'): Response {
  return POST_ID.test(id)
    ? new Response(null, { status: 303, headers: { Location: `/panel?open=${id}#${part}` } })
    : back('posts')
}

/** أجاء النموذجُ من المحرّر؟ حقلٌ مخفيٌّ فيه وحدَه، فالبطاقةُ والإشعارُ يعودان كما كانا. */
function fromEditor(form: FormData): boolean {
  return form.get('from') === 'editor'
}

/**
 * ‏الموعدُ من نموذج المحرّر (D-198) — **زرٌّ تحسبه الخادمُ بتوقيت المالك، أو يومٌ وساعةٌ بتوقيته**،
 * ‏ثمّ `when` بـ UTC كما يرسله شريطُ البطاقة. فالجدولةُ تقرأ صيغةً واحدة، ولا يُحسَب في رأس أحد.
 */
function readWhen(form: FormData, cookieZone: string | null, now: Date): string {
  // ‏الحقلُ يُقرأ بالمنطقة التي قالتها لصيقتُه (D-202): «بتوقيت الرياض» في أوّل زيارة
  // ‏تعني الرياض وإن كتب المتصفّحُ كعكتَه بين العرض والإرسال
  const zone = validZone(String(form.get('tz') ?? '')) ?? cookieZone
  const preset = String(form.get('preset') ?? '')
  const iso = (d: Date | null): string => d === null ? '' : d.toISOString().slice(0, 16)
  if (preset !== '' && preset !== 'custom') return iso(presetAt(preset, now, zone))
  const local = String(form.get('local') ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (preset === 'custom' || m !== null) return m === null ? '' : iso(localToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, zone))
  return String(form.get('when') ?? '')
}

/** ‏نافذةُ «المنشورات»: ما ترسمه اللوحةُ بطاقاتٍ، وما يوزَّع منه، وما يُنزَل إليه — عددٌ واحد. */
const BOARD = 60

/**
 * ‏**ولا يُنزَل إلى بطاقةٍ لم تُرسَم** (مراجعة ر-8).
 *
 * ‏اللوحةُ ترسم أحدثَ ‏`BOARD` منشورًا بتاريخ إنشائها، والإعادةُ لا تمسّ التاريخ. فمنشورٌ فشل
 * ‏قبل أسابيع — أو بعد خطّةٍ بمئتي صفّ — لا مرساةَ له، و`show()` لا تجد شيئًا فترتدّ إلى
 * ‏الرئيسيّة وإشعارُها يقول «اختر له موعدًا» ولا نموذج. فالبطاقةُ إن كانت في النافذة نفسِها
 * ‏التي تقرؤها اللوحة — **بـ`listDrafts` ذاتِها لا بعدٍّ يقاربها** — وإلّا فالمسارُ يختار غيرَها.
 */
async function onBoard(db: Env['DB'], org: string, id: string): Promise<boolean> {
  return (await listDrafts(db, org, BOARD)).some((d) => d.id === id)
}

/** ‏رحلةُ المنشور — موضعٌ يُرسَم لكلّ منشورٍ أيًّا كان عمرُه (D-104). */
function toJourney(id: string): Response {
  return /^[0-9a-f-]{8,}$/.test(id)
    ? new Response(null, { status: 303, headers: { Location: `/panel/journey/${id}` } })
    : back('posts')
}

/**
 * موعدٌ كما يقرؤه المالك — **بتوقيته، وUTC بجانبه نصًّا ثانويًّا** (الخطّة 8.2 و8.3).
 *
 * كان إشعارُ الجدولة «في 2026-10-05 06:00:00 UTC» لمن ضغط «غدا 9ص» في الرياض: الردُّ
 * الوحيدُ على فعله ساعةٌ أخرى بالثواني، فيبدو ما حُفظ خطأً. **والمنطقةُ من كعكة
 * `sada_tz`** (D-173)؛ وإن غابت فبتوقيت الرياض وتُقال صراحةً (D-201).
 */
function ownerWhen(at: string, zone: string | null, now: Date): string {
  const date = parseSqliteUtc(at)
  if (date === null) return at
  const year = localParts(date, zone).year !== localParts(now, zone).year
  const local = `${dayLabel(date, zone, year)} ${clock(date, zone)}`
  return `${local}${zoneNote(zone)}`
}

interface SourceRow {
  id: string
  drive_file_id: string
  name: string
  content_hash: string
  last_seen_at: string
  worth_score: number | null
  summary: string | null
  themes_json: string | null
}

function toPanelSource(row: SourceRow): PanelSource {
  let hash: string | null = null
  let themes: string[] = []
  let reason: string | null = null
  if (row.themes_json !== null) {
    try {
      const parsed = JSON.parse(row.themes_json) as { hash?: string; themes?: unknown; reason?: string }
      hash = parsed.hash ?? null
      themes = Array.isArray(parsed.themes) ? parsed.themes.map(String) : []
      reason = parsed.reason ?? null
    } catch {
      hash = null
    }
  }
  const analyzed = hash !== null
  return {
    id: row.id,
    driveFileId: row.drive_file_id,
    name: row.name,
    analyzed,
    stale: analyzed && hash !== row.content_hash,
    worth: analyzed ? row.worth_score : null,
    summary: analyzed ? row.summary : null,
    reason,
    themes,
    lastSeenAt: row.last_seen_at,
  }
}

/**
 * الجدولُ ملفًّا (D-126) — **المسارُ نفسُه بلاحقة، والقراءةُ نفسُها**.
 *
 * تُقرأ المعاملاتُ بقوائم السماح نفسِها التي يقرأ بها اللوح، ويُحمَّل ما
 * يحمّله، **فلا يُنزَّل غيرُ ما يُعرَض**. ولا مكتبةَ في المتصفّح: `CSV`
 * يُكتب في الخادم من الجدول نفسِه.
 */
panel.get('/panel/pivot.csv', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.redirect('/panel', 303)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const q = new URL(c.req.url).searchParams
  const spec = {
    rows: readDimension(q.get('rows') ?? undefined, 'platform'),
    cols: readCols(q.get('cols') ?? undefined),
    measure: readMeasure(q.get('m') ?? undefined, 'count'),
  }
  const days = readSpan(q.get('days'))
  const loaded = await loadFacts(c.env.DB, activeOrg(session.record), days)
  const body = toCsv(pivot(loaded.facts, spec), spec)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sada-${spec.rows}${
        spec.cols === null ? '' : `-${spec.cols}`}-${spec.measure}-${days}d.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

/**
 * ‏اللوحةُ صفحاتٌ بمساراتها (D-211): «/panel» الرئيسيّةُ والمنشورات، وكلُّ لوحٍ آخر في مساره. والمعالجُ واحد —
 * ‏البياناتُ نفسُها والحرّاسُ أنفسُهم — ويُرسم منه اللوحُ المطلوب وحدَه.
 */
panel.get('/panel/library', (c) => panelRoute(c, 'library'))
panel.get('/panel/accounts', (c) => panelRoute(c, 'accounts'))
panel.get('/panel/settings', (c) => panelRoute(c, 'settings'))
panel.get('/panel/analysis', (c) => panelRoute(c, 'results'))
panel.get('/panel', (c) => panelRoute(c, null))

async function panelRoute(c: Context<{ Bindings: Env }>, only: PaneId | null): Promise<Response> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw, 200)
  // الجلسةُ المعلَّقة لا تفتح اللوحة — ولا تُبنى لها بياناتُها أصلا
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const allowance = await checkAllowance(c.env.DB, 'image')

  /*
   * **واللوحُ المحوريُّ يُقرأ من العنوان** (D-120).
   *
   * فالعرضُ كلُّه في الرابط: يُنسَخ ويُرسَل ويُحفَظ في المفضّلة. **وما
   * لا يُعرَف من قيمةٍ يعود إلى افتراضه** ولا يُسقط الصفحة — القيمُ تأتي
   * من الشبكة، **ونصٌّ في `SQL` أو في المخرَج لا يقع** لأنّها تُطابَق
   * بقائمة سماحٍ لا تُمرَّر.
   */
  const q = new URL(c.req.url).searchParams
  const pivotRows = readDimension(q.get('rows') ?? undefined, 'platform')
  const pivotCols = readCols(q.get('cols') ?? undefined)
  const pivotMeasure = readMeasure(q.get('m') ?? undefined, 'count')
  const pivotDays = readSpan(q.get('days'))
  const loaded = await loadFacts(c.env.DB, activeOrg(session.record), pivotDays)
  const pivotView: PivotView = {
    table: pivot(loaded.facts, { rows: pivotRows, cols: pivotCols, measure: pivotMeasure }),
    rows: pivotRows,
    cols: pivotCols,
    measure: pivotMeasure,
    sinceDays: pivotDays,
    capped: loaded.capped,
    cap: FACT_CAP,
  }

  let sources: PanelSource[] = []
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT s.id, s.drive_file_id, s.name, s.content_hash, s.last_seen_at,
              i.worth_score, i.summary, i.themes_json
         FROM sources s
         LEFT JOIN content_items i ON i.source_id = s.id
        ORDER BY s.last_seen_at DESC
        LIMIT 200`,
    ).all<SourceRow>()
    sources = results.map(toPanelSource)
  } catch {
    sources = []
  }

  let spend: Awaited<ReturnType<typeof spendByProvider>> = {}
  try {
    spend = await spendByProvider(c.env.DB, 30)
  } catch {
    spend = {}
  }
  const series = (await dailySpend(c.env.DB, 14)).map((d) => ({ day: d.day, total: d.total }))
  // ‏«هذا الشهر» بتوقيت المالك من كعكة متصفّحه (D-173) — لا من إعدادٍ يُخزَّن
  const spendMonth = await spendThisMonth(c.env.DB, await ownerZone(c.env.DB, c.req.header('Cookie') ?? null), new Date())

  // حال كلّ مزوّد: مدمَجا كان أو مضافا من اللوحة
  const stored = await listProviders(c.env.DB)
  const providerCards = await Promise.all(
    stored.map(async (p) => {
      // السرّ يخصّ المدمَجين وحدهم: المضاف لا سرّ له في البيئة
      const secretName = p.builtin ? (BUILTIN_SECRET[p.name] ?? null) : null
      const workerSecret =
        secretName === null ? undefined : (c.env[secretName as keyof Env] as string | undefined)
      const resolved = await resolveKey(c.env.DB, c.env.TOKEN_ENC_KEY, p.name, workerSecret)
      const today = await spendTodayFor(c.env.DB, p.name)
      return {
        name: p.name,
        label: p.label,
        kind: p.kind,
        baseUrl: p.baseUrl,
        model: p.model,
        builtin: p.builtin,
        configured: resolved.key !== null,
        secretName,
        howToGet: p.builtin ? (BUILTIN_DOCS[p.name] ?? '') : '',
        calls: spend[p.name]?.calls ?? 0,
        spend: spend[p.name]?.total ?? 0,
        source: resolved.source,
        // سرّ Worker لا يُقنَّع ولا يُعرض منه شيء
        hint: resolved.source === 'worker_secret' ? null : p.hint,
        enabled: p.enabled,
        dailyCap: p.dailyCap,
        priceIn: p.priceIn,
        priceOut: p.priceOut,
        spendToday: Number.isFinite(today) ? today : 0,
        verifiedAt: p.verifiedAt,
        updatedAt: p.updatedAt,
      }
    }),
  )
  const routes = await readRoutes(c.env.DB)
  const drafts = await listDrafts(c.env.DB, activeOrg(session.record), BOARD)
  /*
   * ‏**والمحرّرُ المركّزُ من العنوان** (D-198): `?open=<id>` يرسم المنشورَ بجوار القائمة، فيُفتح برابطٍ
   * ‏ويُحفَظ ويعمل بلا سكربت. والمعرّفُ يُفحَص قبل أن يُسأل عنه، ومنشورٌ أقدمُ من الستّين يُقرأ وحدَه.
   */
  const openId = q.get('open') ?? ''
  const editing = POST_ID.test(openId)
    ? (drafts.find((d) => d.id === openId) ?? await getDraft(c.env.DB, activeOrg(session.record), openId))
    : null
  const media = await mediaFor(c.env.DB, [...new Set([...drafts.map((d) => d.id), ...(editing === null ? [] : [editing.id])])])

  /*
   * **وذروةُ المنصّات التي في المسوّدات وحدَها** (D-106).
   *
   * لكلّ منصّةٍ استعلامُها، **وقراءةُ الأربع كلِّها في كلّ فتحةٍ للوحة
   * ثلاثةُ استعلاماتٍ لا يقرؤها أحد** حين لا تكون في المسوّدات منصّةٌ
   * غيرُ واحدة. فتُقرأ ما في اليد لا ما قد يقع.
   */
  const { results: outbox } = await c.env.DB
    .prepare(
      `SELECT kind, body, status, error, at FROM alert_outbox
        ORDER BY at DESC LIMIT 5`,
    )
    .all<{ kind: string; body: string; status: number | null; error: string | null; at: string }>()
    .catch(() => ({ results: [] as {
      kind: string; body: string; status: number | null; error: string | null; at: string
    }[] }))

  const peaks: Record<string, Peaks> = {}
  for (const platform of [...new Set([...drafts, ...(editing === null ? [] : [editing])].map((d) => d.platform))]) {
    peaks[platform] = await readPeaks(c.env.DB, platform)
  }
  const plan = await latestPlan(c.env.DB)
  const sessions = await listSessions(c.env.KV, session.id)
  const orgs = await listOrgs(c.env.DB)
  const audit = await recentAudit(c.env.DB, 50)
  const beats = await readHeartbeats(c.env.DB)
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const factors = await factorState(c.env.DB, rp.id)
  const apps = await appStatuses(c.env.DB, c.env as unknown as Record<string, string | undefined>)

  /**
   * أمتاحٌ هذا السرّ؟ — **ومصدرانِ لا واحد** (D-042).
   *
   * سرُّ Worker يُفحص بوجوده لا بقيمته، والقيمةُ لا تغادر البيئة. وما
   * حُفظ في الخزانة يُعدّ متاحا كذلك — وإلّا لبقيت البطاقةُ تقول
   * «تنتظرك» بعد أن ضبطها المالك من اللوحة نفسها.
   */
  const configured = new Set(
    apps.filter((a) => a.source !== 'none').flatMap((a) => a.secretNames),
  )
  const accountsNow = await listAccounts(c.env.DB, activeOrg(session.record))
  const channels = viewChannels(accountsNow, (name) => {
    if (configured.has(name)) return true
    const value = c.env[name as keyof Env]
    return typeof value === 'string' && value.length > 0
  })

  const flash = await takeFlash(c.env, c.req.raw)
  // عددٌ على رابط التقرير — والمالكُ لا يفتح شاشةً ليكتشف أنّ فيها ما ينتظره
  const openCount = (await openSuggestions(c.env.DB)).length
  // ‏والرحلةُ تُعدّ من القاعدة كلِّها لا من الستّين الأخيرة — استعلامان مجمَّعان (D-177)
  const journey = await journeyCounts(c.env.DB, activeOrg(session.record), new Date())
  const uploads = await listUploads(c.env.DB)
  /*
   * ‏**ونصوصُ المقاطع المكتوبة من KV** (D-190) — لما بقي فيه ما يُنشأ وحدَه: مقطعٌ أُنشئ على
   * ‏منصّاته كلِّها لا حقولَ له، فلا يُقرأ. قراءةٌ لكلّ مقطعٍ مفتوح، وهي قليلةٌ عادةً.
   */
  const captions: Record<string, VideoCaptions> = {}
  for (const u of uploads) {
    if (u.status !== 'ready' || VIDEO_PLATFORMS.every((p) => u.posts.some((x) => x.platform === p))) continue
    const found = await readCaptions(c.env.KV, u.id)
    if (found !== null) captions[u.id] = found
  }
  // والحقائقُ تبقى بعد العدّ: منها تُقرأ نقاطُ الجاهزيّة أدناه، بلا استعلامٍ ثانٍ
  const facts = await ownerFacts(c, activeOrg(session.record))
  const ownerPending = pendingCount(facts)

  /*
   * **نقاطُ الجاهزيّة تحت زرَّي الصورة والمقطع** (D-163).
   *
   * ممّا حُمِّل أعلاه وحدَه — البطاقاتُ والتوجيهُ والحارسُ والحقائق — ولا
   * استعلامَ جديد. **وكلُّ حكمٍ من الدالّة التي يحكم بها النداءُ نفسُه عند
   * الضغط**: `imageProviderGate` و`slideGate` و`videoFace` و`providerBlocker`.
   * والأسرارُ تُسأل عن وجودها لا عن قيمتها (D-005).
   */
  const routeOf = (task: TaskName): string => routes.find((r) => r.task === task)?.provider ?? ''
  const cardOf = (name: string): (typeof providerCards)[number] | undefined =>
    providerCards.find((p) => p.name === name)
  const imageName = routeOf('image')
  const imageCard = cardOf(imageName)
  const imageSecret = imageCard === undefined ? undefined : imageSecretName(imageCard)
  const imageRefusal = imageProviderGate({
    name: imageName,
    exists: imageCard !== undefined,
    blocker: imageCard === undefined ? null : providerBlocker(imageCard, imageCard.spendToday),
    // `configured` يعرف سرَّ المدمَجين وحدهم، و`generateForPost` تقرأ `CF_AI_TOKEN`
    // لبطاقة Cloudflare كذلك — فيُسأل عنه باسمه من الدالّة نفسِها
    hasKey: imageCard !== undefined &&
      (imageCard.configured || (imageSecret !== undefined && facts.secrets.has(imageSecret))),
    hasAccount: cfAccountOf(c.env.CF_AI_ACCOUNT_ID, imageCard?.baseUrl) !== '',
  })
  const slide = slideGate({
    overlay: allowance.settings.imageOverlay,
    hasBrowserKey: facts.secrets.has('CF_BROWSER_TOKEN'),
    hasAccount: facts.vars.has('CF_AI_ACCOUNT_ID'),
  })
  // والموجزُ يكتبه مزوّدُ الكتابة ويمرّ بحارسه (D-163) — فيُسأل عنه بالحارس نفسِه
  const briefCard = cardOf(routeOf('draft'))
  const briefReady = briefCard !== undefined && briefCard.configured &&
    providerBlocker(briefCard, briefCard.spendToday) === null
  const cfCard = cardOf('cloudflare')
  const face = videoFace({
    envAccount: facts.vars.has('CF_AI_ACCOUNT_ID'),
    envToken: facts.secrets.has('CF_AI_TOKEN'),
    // ومفتاحُ البطاقة من الخزنة وحدها: غيرُ مدمَجةٍ فلا سرَّ لها في `configured`،
    // وهو عينُ ما يقرؤه `bindingFor`
    card: cfCard === undefined
      ? null
      : { enabled: cfCard.enabled, hasKey: cfCard.configured, urlAccount: cfAccountId(cfCard.baseUrl) !== null },
    binding: c.env.AI !== undefined,
  })
  const mediaReady = {
    // ‏والإنفوجرافيك يحتاج المتصفّحَ وحدَه، وبلا مزوّد كتابةٍ يُستخرج من النصّ (D-174)
    infographic: infographicReadiness({
      blocker: allowance.blocker,
      browser: { key: facts.secrets.has('CF_BROWSER_TOKEN'), account: facts.vars.has('CF_AI_ACCOUNT_ID') },
      briefReady,
    }),
    image: imageReadiness({
      blocker: allowance.blocker,
      provider: { label: imageCard?.label ?? imageName, refusal: imageRefusal },
      slide,
      briefReady,
    }),
    // ‏والعدُّ من قراءة الحارس نفسِها، والحكمُ من دالّة `animateForPost` نفسِها (D-168)
    video: videoReadiness({
      face,
      // ‏وحكمُ المقطع من قراءة الحارس نفسِها بسؤاله هو (D-169)
      blocker: blockerFor('video', allowance.settings, allowance.usage),
      clips: videoCapGate(allowance.usage.clips, allowance.settings.dailyVideoCap),
    }),
  }
  // **يُحسَب عند العرض لا يُقرأ من الصفّ**: الصفُّ أثرُ ما وقع،
  // والشريطُ حالٌ الآن — ودورةٌ سقطت لا تُخفي رمزا يوشك (D-065)
  const expiring = (await expiringTokens(c.env.DB, new Date())).map((e) => ({
    platform: e.platform, displayName: e.displayName, kind: e.kind, daysLeft: e.daysLeft,
  }))
  // ‏مَن يرى المقطع بحكم الناشر: القرارُ ونطاقُ حساب TikTok النشط (D-190)
  const videoReach = reachOf(allowance.settings, await activeScopes(c.env.DB, activeOrg(session.record), 'tiktok'))
  const ownZone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  return page((nonce) =>
    panelPage({
      // البيئةُ تُقرأ لا تُكتب: كانت «STAGING» ثابتةً في العلامة حتّى في الإنتاج (D-151)
      env: c.env.SADA_ENV,
      paused: allowance.settings.paused,
      // ‏حاجزُ الكتابة بحكم النداء نفسِه، ومنطقةُ المالك لساعة انفتاح السقف (ر-10)
      draftBlocker: blockerFor('draft', allowance.settings, allowance.usage),
      zone: ownZone,
      autoEnqueue: allowance.settings.autoEnqueue,
      imageOverlay: allowance.settings.imageOverlay,
      // **وجودُ السرّ يُفحَص لا قيمتُه** — والقيمةُ لا تغادر البيئة (D-042)
      slide,
      mediaReady,
      analysisCap: allowance.settings.dailyAnalysisCap,
      spendCap: allowance.settings.dailySpendCapUsd,
      // لانهاية تعني دفترا لا يُقرأ — تُعرض صفرا لا `Infinity` في الشاشة
      usedAnalyses: Number.isFinite(allowance.usage.analyses) ? allowance.usage.analyses : 0,
      usedSpend: Number.isFinite(allowance.usage.spend) ? allowance.usage.spend : 0,
      videoCap: allowance.settings.dailyVideoCap,
      usedClips: Number.isFinite(allowance.usage.clips) ? allowance.usage.clips : 0,
      // ‏من الدفتر كلِّه والاسمُ من المزوّدين حيث وُجد (ر-10): X يُحاسَب على كلّ طلب
      spendBy: spendRows(spend, Object.fromEntries(providerCards.map((p) => [p.name, p.label]))),
      spendMonth,
      series,
      sources,
      providers: providerCards,
      routing: routes.map((r) => {
        /*
         * **والصورةُ والمقطعُ من نقطتيهما عينِهما** (D-163): كان الجدولُ يقول
         * «مزوّده غير جاهز» لصورٍ موجَّهةٍ إلى Cloudflare بمفتاح `CF_AI_TOKEN`
         * وهي تعمل، ولمقطعٍ يُنادى من البيئة — فتناقض شاشةُ المزوّدين نقطةً
         * تحت الزرّ تقول «جاهز». والمقطعُ لا يقرأ من توجيهه إلّا النموذج.
         *
         * **و«جاهز» هي «تامّة» وحدها**: رابطُ Worker وحده ينتظرك في النقطة،
         * فينتظرك في الجدول ولا يُعدّ في المهامّ الجاهزة — والرابطُ معرَّفٌ
         * في البيئتين، فكان كلُّ لوحٍ بلا `CF_AI_ACCOUNT_ID` يقول «جاهز».
         */
        const dot = routeDot(mediaReady, r.task)
        return {
          task: r.task,
          provider: r.provider,
          model: r.model,
          why: r.why,
          implemented: r.implemented,
          ready: r.implemented && (dot === undefined
            ? providerCards.some((p) => p.name === r.provider && p.configured && p.enabled)
            : dot.state === 'done'),
          ...(r.implemented && dot?.state === 'now' ? { pending: dot.note } : {}),
        }
      }),
      knownProviders: providerCards.map((p) => ({ name: p.name, label: p.label })),
      drafts,
      editing,
      media: media.map((m) => ({
        id: m.id,
        postId: m.postId,
        mime: m.mime,
        bytes: m.bytes,
        prompt: m.prompt,
        cost: m.cost,
        status: m.status,
        note: m.note,
        headline: m.headline,
        model: m.model,
        width: m.width,
        height: m.height,
      })),
      plan,
      planReady: routes.some(
        (r) =>
          r.task === 'plan' &&
          providerCards.some((p) => p.name === r.provider && p.configured && p.enabled),
      ),
      /*
       * الوجهاتُ من الحسابات الحيّة: قناةٌ إذنُها منتهٍ ليست وجهة، وعرضُها
       * في القائمة يجعل الجدولة تنجح ثمّ يفشل النشر بعد أيّامٍ صامتا.
       *
       * **وحسابُ الصفحة كذلك** (D-087): كان الحارسُ يفحص الإذنَ ولا يفحص
       * النوع — **وهو نصفُ حارسٍ** (علّةُ D-073 نفسُها). فالسائقُ يبني
       * `urn:li:person:` حرفا (D-080)، ووجهةُ صفحةٍ تُجدوَل فتُنتظَر
       * ساعاتٍ ثمّ تُردّ عند المنصّة برسالةٍ لا تدلّ على السبب.
       *
       * وقد وقع: جُدولت مسوّدةٌ إلى صفحةِ الشركة، ولم يخرج شيء.
       */
      targets: channels.flatMap((c) =>
        c.spec.built
          ? c.accounts
              .filter((a) => a.status === 'active' && !isLinkedInPage(a))
              .map((a) => ({
                id: a.id,
                platform: c.spec.id as PublishPlatform,
                label: `${a.displayName} · ${c.spec.label}`,
              }))
          : [],
      ),
      /*
       * **منصّةٌ حساباتُها الحيّةُ صفحاتٌ لا أشخاص** (D-087).
       *
       * تُحسَب هنا لا في الشاشة: الشاشةُ ترى `targets` بعد التصفية، فلا
       * تفرّق بين «لا قناةَ مربوطة» و«القناةُ مربوطةٌ صفحةً». **والفرقُ
       * ليس لفظا**: الأولى تُرسل المالكَ يربط، والثانيةُ تُرسله ينتظر
       * موافقةً — ومن قيل له «اربط» وهو رابطٌ يشكّ في نظامه لا في نضجه.
       */
      pageOnly: channels
        .filter(
          (c) =>
            c.spec.built &&
            c.accounts.some((a) => a.status === 'active') &&
            !c.accounts.some((a) => a.status === 'active' && !isLinkedInPage(a)),
        )
        .map((c) => c.spec.id),
      writableSources: sources
        .filter((x) => x.analyzed)
        .map((x) => ({ id: x.id, name: x.name })),
      // زرٌّ لا ينادي أحدا لا يُعرض عاملا: الطريقُ جاهزٌ إن كان مزوّدُه
      // مضبوطا ومفعَّلا — وإلّا فالضغطةُ تنتهي إلى رسالةِ عطل
      draftReady: routes.some(
        (r) =>
          r.task === 'draft' &&
          providerCards.some((p) => p.name === r.provider && p.configured && p.enabled),
      ),
      peaks,
      alertWebhook: allowance.settings.alertWebhook,
      dashboardTiles: allowance.settings.dashboardTiles,
      pivot: pivotView,
      /*
       * **وآخرُ خمسةٍ لا كلُّها** (D-101): الصندوقُ ينمو ولا يُقلَّم،
       * **وسجلٌّ كاملٌ في صفحةٍ تُفتَح كلَّ يومٍ ثمنٌ يُدفَع كلَّ يوم**.
       * والخمسةُ تكفي لتقول «القناةُ تعمل» أو «ماتت».
       */
      outbox,
      flash,
      now: new Date(),
      csrf: session.record.csrf,
      nonce,
      sessions,
      orgs,
      org: activeOrg(session.record),
      audit,
      // «ما وقع اليوم» ممّا قُرئ أعلاه — ولا استعلامَ جديد (D-127)
      today: todayFeed({ now: new Date(), audit, drafts, facts: loaded.facts }),
      pulses: pulses(beats, new Date()),
      rpId: rp.id,
      via: session.record.via,
      factors: {
        passkeys: factors.passkeys.map((k) => ({
          id: k.id,
          label: k.label,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        })),
        totpConfirmed: factors.totp.confirmed,
        recoveryLeft: factors.recovery.unused,
        enforced: factors.enforced,
      },
      channels,
      apps,
      baseUrl: c.env.PUBLIC_BASE_URL,
      openSuggestions: openCount,
      journey,
      uploads,
      captions,
      // ‏أمتّصلةٌ كلُّ منصّة، ومَن يرى المقطع — حيث تُختار المنصّة (D-190)
      links: linkStates(accountsNow),
      reach: videoReach,
      promoCap: allowance.settings.weeklyPromoCapUsd,
      ownerPending,
      expiring,
      cfAccountId: (c.env.CF_AI_ACCOUNT_ID ?? '') === '' ? null : (c.env.CF_AI_ACCOUNT_ID ?? null),
    // ‏وسكربتُ التبديل يطلب «المنشورات» وحدَها (D-233): البطاقةُ والأعدادُ والإشعارُ هناك، والرئيسيّةُ لا تُرسَم له
    }, only, q.get('swap') === 'posts'),
  )
}

/**
 * ‏`GET /panel/login` — **صفحةُ كلمةٍ خاطئةٍ أُعيد تحميلُها**.
 *
 * تُرسَم صفحةُ الدخول ردًّا على `POST /panel/login`، فيبقى عنوانُها في الشريط. وإعادةُ
 * تحميلها على الهاتف، أو فتحُ التبويب من جديد، تطلبه `GET` — وكان `{"error":"not_found"}`
 * خامًّا. فيعود إلى الصفحة التي طُلبت (`?next=` في عنوان النموذج)، أو إلى الرئيسيّة —
 * وهناك صفحةُ الدخول إن لم تكن جلسة. ولا يُعاد إرسالُ كلمةٍ بإعادة التحميل.
 */
panel.get('/panel/login', (c) => c.redirect(safeNext(c.req.query('next')), 303))

/**
 * الدخول — بحدٍّ للمحاولات.
 *
 * والتأخير قبل الردّ متصاعد لا رفضٌ فوريّ: زمنُ الردّ نفسه يخبر المخمّن
 * أنّه مُنع فيبدّل عنوانه ويستأنف.
 */
panel.post('/panel/login', async (c) => {
  const blockedText = (global: boolean): string =>
    global
      ? 'الدخول موقوف مؤقتا: محاولات كثيرة من عناوين شتّى. انتظر ربع ساعة.'
      : 'تجاوزت حدّ المحاولات. انتظر ربع ساعة ثمّ أعد المحاولة.'

  // ‏والوجهةُ قبل كلّ ردّ: كلُّ صفحةِ دخولٍ تُرسَم ثانيةً تحملها، فلا تضيع بكلمةٍ خاطئة (ر-11)
  const form = await c.req.formData().catch(() => new FormData())
  const next = safeNext(String(form.get('next') ?? '') || (c.req.query('next') ?? ''))

  const state = await attemptState(c.env.KV, c.req.raw)
  if (state.blocked) {
    return page(
      (nonce) => loginPage({ error: blockedText(state.globalBlock), blocked: true, next }, nonce),
      429,
    )
  }

  // ‏والحجزُ قبل الفحص (D-161): طلباتٌ متزامنةٌ تمرّ كلُّها من قراءة KV قبل أن
  // ‏تكتب واحدةٌ منها، والعدّادُ الذرّيُّ في D1 يردّ السادسةَ قبل أن تُقارَن كلمتُها
  const reserved = await reserveAttempt(c.env.DB, c.req.raw)
  if (!reserved.allowed) {
    return page(
      (nonce) => loginPage({ error: blockedText(false), blocked: true, next }, nonce),
      429,
    )
  }

  // يُقرأ حالُ العوامل **قبل** فتح الجلسة: جلسةٌ تُفتح كاملةً ثمّ تُعلَّق
  // بعد ذلك تكون قد وُجدت كاملةً لحظةً — ولحظةٌ تكفي
  const rp = relyingParty(c.env.PUBLIC_BASE_URL)
  const factors = await factorState(c.env.DB, rp.id)
  const result = await createSession(
    c.env.KV,
    c.env.ADMIN_TOKEN,
    String(form.get('token') ?? ''),
    c.req.raw,
    { pending: factors.enforced, next },
  )

  if ('error' in result) {
    if (result.error === 'disabled') {
      return page(
        (nonce) =>
          loginPage(
            {
              error: 'كلمة الإدارة (ADMIN_TOKEN) غير مضبوطة على هذه البيئة — اللوحة مقفلة لا مفتوحة.',
              passkeys: factors.passkeys.length > 0,
              next,
            },
            nonce,
          ),
        401,
      )
    }
    const after = await recordFailure(c.env.KV, c.req.raw)
    // المحاولةُ المرفوضة تُسجَّل: تكرارُها من عنوانٍ واحد هو ما يُقرأ لاحقا
    await record(
      c.env.DB,
      { actor: 'anonymous', action: 'login.denied', detail: `المحاولة ${after.attempts}` },
      c.req.raw,
    )
    const wait = delayMs(after.attempts)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return page(
      (nonce) =>
        loginPage(
          {
            error: after.blocked
              ? blockedText(after.globalBlock)
              : `كلمة الإدارة غير صحيحة — ${attemptsLeft(after.remaining)}.`,
            blocked: after.blocked,
            passkeys: factors.passkeys.length > 0,
            next,
          },
          nonce,
        ),
      401,
    )
  }

  await clearAttempts(c.env.KV, c.req.raw)
  await releaseAttempt(c.env.DB, c.req.raw)
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: factors.enforced ? 'session.pending' : 'session.open',
      detail: factors.enforced ? 'ينتظر العامل الثاني' : 'بعامل واحد',
    },
    c.req.raw,
  )
  return new Response(null, {
    status: 303,
    headers: {
      // ‏والوجهةُ بعد العامل الثاني في الجلسة المعلَّقة نفسِها (`createSession`)، لا في العنوان
      Location: factors.enforced ? '/panel/2fa' : next,
      'Set-Cookie': sessionCookie(result.id),
    },
  })
})

/**
 * الخروج — بلا فحص CSRF.
 *
 * ولذلك عذر: أسوأُ ما يصنعه طلبُ خروجٍ مزوَّر أن يُخرجك، وهو أذًى لا
 * خطر. وفحصُه يعني أنّ جلسةً سقط رمزُها لا تُغلَق — فيبقى البابُ مفتوحا
 * حتّى تنتهي مهلته. **بابُ الخروج لا يُقفَل.**
 */
panel.post('/panel/logout', async (c) => {
  await destroySession(c.env.KV, c.req.raw)
  await record(c.env.DB, { actor: 'panel', action: 'session.close' }, c.req.raw)
  return new Response(null, {
    status: 303,
    headers: { Location: '/panel', 'Set-Cookie': clearedCookie() },
  })
})

// ── الجلسات ─────────────────────────────────────────────────────────

/** إبطالُ جلسةٍ بعينها من الجرد. */
panel.post('/panel/sessions/revoke', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  // البصمةُ لا السرّ (D-150): النموذجُ لا يحمل كعكةَ جهازٍ آخر ولا يقبلها
  const handle = String(gate.form.get('handle') ?? '')
  if (handle === '') return c.json({ error: 'missing_handle' }, 400)

  if (handle === (await fingerprint(gate.session.id))) {
    // إبطالُ جلستك من هنا يتركك في صفحةٍ ميّتة بلا كعكةٍ مُمحاة. للخروج زرّه.
    await setFlash(c.env, c.req.raw, {
      kind: 'warn',
      text: 'هذه جلستك — استعمل زرّ «خروج» لإغلاقها.',
    })
    return back('security')
  }

  await revokeSessions(c.env.KV, { onlyHandle: handle })
  await record(c.env.DB, { actor: 'panel', action: 'session.revoke', target: handle }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُبطلت الجلسة.' })
  return back('security')
})

/**
 * منظّمةٌ جديدة (D-225) — **من حساب الدخول الحاليّ، وهو حسابُ المشغّل**.
 * تُنشأ ومعها علامتُها الأولى، ولا تُفتح تلقائيًّا: الانتقالُ إليها فعلٌ مستقلّ.
 */
panel.post('/panel/orgs', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const result = await createOrg(c.env.DB, {
    name: String(gate.form.get('name') ?? ''),
    kind: String(gate.form.get('kind') ?? ''),
  })
  if (!result.ok) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: result.reason === 'name' ? 'اكتب اسمًا للمنظّمة، ثمانين حرفًا أو أقلّ.' : 'اختر نوع المنظّمة من القائمة.',
    })
    return back('orgs')
  }
  await record(c.env.DB, { actor: 'panel', action: 'org.create', target: result.id, org: result.id }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُنشئت المنظّمة. انتقل إليها حين تريد العمل فيها.' })
  return back('orgs')
})

/** الانتقالُ إلى منظّمة — **ولا يُقبَل معرّفٌ لا يوجد**. */
panel.post('/panel/orgs/switch', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = String(gate.form.get('org') ?? '')
  if (!(await orgExists(c.env.DB, org))) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لم أجد هذه المنظّمة.' })
    return back('orgs')
  }
  await setActiveOrg(c.env.KV, gate.session, org)
  await record(c.env.DB, { actor: 'panel', action: 'org.switch', target: org, org }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'انتقلت إلى المنظّمة.' })
  return back('orgs')
})

/** إبطالُ كلّ الجلسات إلّا جلسةَ الفاعل. */
panel.post('/panel/sessions/revoke-all', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const removed = await revokeSessions(c.env.KV, { keepId: gate.session.id })
  await record(
    c.env.DB,
    { actor: 'panel', action: 'session.revoke_all', detail: `${removed} جلسة` },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: removed === 0 ? 'ok' : 'warn',
    text: removed === 0 ? 'لا جلسات أخرى مفتوحة.' : `أُبطلت ${removed} جلسة. جلستك هذه باقية.`,
  })
  return back('security')
})

/**
 * المهامُّ التي يُقبَل توجيهُها — **مشتقّةٌ من `ROUTES` لا مكتوبةٌ بيد**
 * (D-091).
 *
 * كانت ثلاثا مكتوبةً حرفا، و`readRoutes` تعرض مفاتيحَ `ROUTES` كلَّها.
 * **فكان `plan` يُعرَض في الجدول ويُردّ عند الحفظ** — والمالكُ يبدّل
 * نموذجَه فيسمع «مهمّةٌ غير معروفة» على مهمّةٍ يراها أمامه.
 *
 * وهو صنفُ «نصفِ الحارس»: قائمتان لشيءٍ واحد، تُزاد إحداهما وتُنسى
 * الأخرى. فصارتا واحدة.
 */
const KNOWN_TASKS: ReadonlySet<string> = new Set(Object.keys(ROUTES))

/*
 * **وقائمةُ السماح تُنسى** (D-110).
 *
 * أُضيف `alert_webhook` إلى `SettingKey` في D-109 **ونُسي هنا**: فالحقلُ
 * يُعرَض في اللوحة، ويُضغَط «احفظ»، **ويردّ الخادمُ ‏٤٠٠ صامتة** — والمالكُ
 * يظنّ قناتَه مضبوطةً حتّى يقع الحدثُ فلا يصل.
 *
 * وهي عينُ ما حرسه D-109 في العنوان نفسِه، **فوقعت في الطريق إليه**.
 * ولا تُمسَك بالأنواع: `SettingKey` نوعٌ، وهذه مجموعةُ نصوص. **فيُحرَس
 * التطابقُ باختبار.**
 */
const WRITABLE: ReadonlySet<string> = new Set<SettingKey>(SETTING_KEYS)

/**
 * تغيير إعداد.
 *
 * الحمايةُ من CSRF طبقتان: `SameSite=Strict` في المتصفّح، ورمزٌ في
 * النموذج يفرضه الخادم. والثانية أُضيفت لأنّ الأولى — على قوّتها — تعيش
 * في المتصفّح وحده، وما يعيش هناك لا نملك ضمانه.
 *
 * ومفاتيح الكتابة **قائمةُ سماحٍ لا منع**: مفتاحٌ جديد في القاعدة لا
 * يصير قابلا للكتابة من الشبكة لمجرّد وجوده.
 */
panel.post('/panel/settings', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const key = String(form.get('key') ?? '')
  /*
   * **وحقلٌ واحدٌ لا يسع اختيارا متعدّدا** (D-119).
   *
   * بطاقاتُ اللوح مربّعاتُ اختيارٍ لا حقلٌ واحد، **ومربّعٌ غيرُ مؤشَّرٍ لا
   * يُرسَل أصلا** — فلا يكفي `form.get`. وتُجمَع بفاصلة، ثمّ تُصفّى في
   * `writeSetting` بقواعد القراءة نفسِها.
   */
  const value = key === 'dashboard_tiles'
    ? form.getAll('tile').map((v) => String(v)).join(',')
    : String(form.get('value') ?? '')
  if (!WRITABLE.has(key)) return c.json({ error: 'unknown_setting' }, 400)

  const result = await writeSetting(c.env.DB, key as SettingKey, value, 'panel')
  /*
   * **والسجلُّ يُقرأ بالأسماء لا بالمعرِّفات** (D-134): بطاقاتٌ تُكتب
   * `sources_analyzed,spend_30d` تُقرأ في سجلّ الأمان أسماءً كما على اللوح.
   */
  const detail = key === 'dashboard_tiles'
    ? `← ${chosenTiles(result.stored).map((t) => t.label).join(' · ')}`
    : `← ${result.stored}`
  await record(
    c.env.DB,
    { actor: 'panel', action: 'settings.write', target: key, detail },
    c.req.raw,
  )

  // الإشعار يقول ما وقع **فعلا** لا ما طُلب: قيمةٌ قُصّت تُذكر بقصّها
  let flash: PanelFlash
  if (key === 'auto_enqueue') {
    flash = result.stored === 'true'
      ? { kind: 'warn', text: 'رُفع الإدراج الآليّ. المسح اليوميّ سيحلّل ما تغيّر ضمن حدّ اليوم.' }
      : { kind: 'ok', text: 'أُطفئ الإدراج الآليّ. لا تحليل إلا بأمرك.' }
  } else if (key === 'image_overlay') {
    flash = result.stored === 'true'
      ? { kind: 'ok', text: 'رُفع تركيب النصّ. الصورة تخرج بعنوانها العربيّ فوقها.' }
      : { kind: 'warn', text: 'أُطفئ تركيب النصّ. تخرج الصورة نظيفةً بلا عنوان.' }
  } else if (key === 'paused') {
    flash = result.stored === 'true'
      ? { kind: 'warn', text: 'أُوقف النظام. لا نداء مدفوع ولا مسح ولا نشر حتّى تستأنفه.' }
      : { kind: 'ok', text: 'استُؤنف العمل.' }
  } else if (key === 'dashboard_tiles') {
    /*
     * **والإشعارُ يقول ما وقع فعلا** — لا ما طُلب. من أشّر واحدةً رجع
     * إلى الأربع، **ومن أشّر ثمانيا حُفظت له ستّ**: يُقال له، ولا يُترَك
     * يظنّ أنّ لوحَه غيرُ ما يرى.
     */
    const n = result.stored === '' ? 0 : result.stored.split(',').length
    const asked = value === '' ? 0 : value.split(',').filter((x) => x !== '').length
    flash = asked === n
      ? { kind: 'ok', text: `حُفظ لوحُك: ${n} بطاقات في صدر «نظرة عامّة».` }
      : {
          kind: 'warn',
          text: `اخترت ${asked} — وحُفظت ${n}. والحدّ من ${TILE_MIN} إلى ${TILE_MAX}،`
            + ' وما دون الأدنى يعود إلى الأربع الأصليّة.',
        }
  } else if (key === 'youtube_public' || key === 'tiktok_public') {
    // ‏مَن يرى المقطع (D-190) — يُقال بما سيقع لا بـ«true»
    const name = key === 'youtube_public' ? 'YouTube' : 'TikTok'
    // ‏وTikTok بحكم الناشر: قلبٌ بلا `video.publish` يبقى صندوقًا — يُقال الآن لا بعد أوّل مقطع
    const noScope = key === 'tiktok_public' && result.stored === 'true'
      && tiktokNeedsScope(await reachNow(c.env.DB, activeOrg(gate.session.record)))
    flash = noScope
      ? {
          kind: 'warn',
          text: 'قُلب النشر على TikTok للعامّة، وحسابُك المربوط بلا video.publish — فيصل كلّ مقطع صندوق تطبيقك'
            + ' بلا نصّه حتّى تربطه من جديد وتمنحه («اربط حسابا آخر» في الإعداد، بالحساب نفسِه).',
        }
      : result.stored === 'true'
      ? { kind: 'ok', text: `صار النشر على ${name} للعامّة — يُطلب لكلّ مقطع في موعده.` }
      : {
          kind: 'ok',
          text: `عاد النشر على ${name} خاصًّا — تنشر المقاطع أنت ${key === 'youtube_public' ? 'من YouTube Studio' : 'من تطبيق TikTok'}.`,
        }
  } else if (result.clamped) {
    flash = {
      kind: 'warn',
      text: `${settingLabel(key)}: القيمة ${value} خارج المدى — حُفظت ${result.stored}.`,
    }
  } else {
    flash = { kind: 'ok', text: `${settingLabel(key)}: حُفظ ${result.stored}.` }
  }

  // ‏**والحفظُ التلقائيّ في الحدود** (D-233): الحقلُ يُرسَل حين يتغيّر بـ`auto=1`، فيُجاب بسطرٍ والقيمةِ المحفوظة
  // ‏(وقد تُقصّ إلى المدى) لا بتحويلٍ يعيد رسمَ الصفحة. والفحصُ والقصُّ والتدقيقُ قبله كما هي.
  if (form.get('auto') === '1') return c.json({ ok: flash.kind !== 'bad', text: flash.text, stored: result.stored })
  await setFlash(c.env, c.req.raw, flash)
  // ‏ومفتاحٌ في صفحة منصّةٍ يعود إليها لا إلى «الحدود» (D-172 · D-190): من قائمةٍ مغلقة
  const to = backTo(form.get('return'), '')
  if (to !== '') return new Response(null, { status: 303, headers: { Location: to } })
  return back('settings')
})

/** مسح Drive من اللوحة — المسار نفسه الذي يشغّله Cron، لا نسخةٌ ثانية. */
panel.post('/panel/scan', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  try {
    const report = await scanDrive({
      db: c.env.DB,
      serviceAccountJson: c.env.GOOGLE_SA_JSON,
      folderId: c.env.DRIVE_FOLDER_ID,
    })
    const parts = [`رأى ${report.seen}`]
    if (report.added.length > 0) parts.push(`جديد ${report.added.length}`)
    if (report.changed.length > 0) parts.push(`تغيّر ${report.changed.length}`)
    if (report.missing.length > 0) parts.push(`مفقود ${report.missing.length}`)
    await record(
      c.env.DB,
      { actor: 'panel', action: 'drive.scan', detail: parts.join(' · ') },
      c.req.raw,
    )
    await setFlash(c.env, c.req.raw, {
      kind: 'ok',
      text: `تمّ المسح — ${parts.join(' · ')}. ${report.toAnalyze.length} تنتظر تحليلا.`,
    })
  } catch (error) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: `تعذّر المسح: ${error instanceof Error ? error.message : 'عطل غير متوقّع'}`,
    })
  }
  return back('sources')
})

/**
 * تحليل مصدر من اللوحة.
 *
 * يمرّ بـ `analyzeSource` نفسه — بسقوفه وإيقافه: **زرٌّ في صفحةٍ ليس
 * طريقا جانبيّا حول الحارس.**
 */
panel.post('/panel/analyze', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const outcome = await analyzeSource(
    {
      db: c.env.DB,
      serviceAccountJson: c.env.GOOGLE_SA_JSON,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      encKey: c.env.TOKEN_ENC_KEY,
    },
    String(form.get('id') ?? ''),
  )

  const flash: PanelFlash =
    outcome.kind === 'analyzed'
      ? { kind: 'ok', text: `تمّ التحليل — الاستحقاق ${outcome.worth.toFixed(2)}، الكلفة ${money(outcome.cost)}.` }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'محلَّل بالفعل بنسخته الحاليّة — لم يُنفَق شيء.' }
        : outcome.kind === 'blocked'
          ? { kind: 'warn', text: outcome.reason }
          : outcome.kind === 'skipped'
            ? { kind: 'warn', text: `تُخطّي: ${outcome.reason}` }
            : { kind: 'bad', text: `تعذّر التحليل: ${outcome.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'source.analyze',
      target: String(form.get('id') ?? ''),
      detail: outcome.kind,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('sources')
})

// ── تطبيقا OAuth ─────────────────────────────────────────────────────

/** المنصّاتُ التي لها سائقٌ مبنيّ — وما عداها لا يُقبل في مسار. */
/** كلُّ منصّةٍ لها سرّان تُقبَل في الخزانة (D-142) — وما سواها يُردّ قبل القاعدة. */
function platformParam(raw: string): Platform | null {
  return (APP_PLATFORMS as readonly string[]).includes(raw) ? (raw as Platform) : null
}

/**
 * حفظُ أسرار تطبيقٍ من اللوحة (D-042).
 *
 * **ولا يُسجَّل السرُّ في السجلّ ولا يُعاد في ردّ.** ما يُسجَّل: مَن بدّل،
 * ولأيّ منصّة، وهل تغيّرت القيمة — لا القيمةُ نفسها.
 */
panel.post('/panel/channels/app', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const platform = platformParam(String(form.get('platform') ?? ''))
  if (platform === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّة غير معروفة' })
    return back('channels')
  }
  const label = platformLabel(platform)

  const by = gate.session.record.via === 'passkey' ? 'panel:passkey' : 'panel:token'
  let flash: PanelFlash
  let detail: string
  try {
    const result = await saveApp(
      c.env.DB,
      c.env.TOKEN_ENC_KEY,
      platform,
      String(form.get('client_id') ?? ''),
      String(form.get('client_secret') ?? ''),
      by,
    )
    detail = result.unchanged ? 'unchanged' : 'saved'
    flash = {
      kind: 'ok',
      // ‏باسم المنصّة لا بمعرّفها («أسرارُ tiktok»)، والفعلُ التالي باسمه كما على الزرّ
      text: result.unchanged
        ? `أسرار ${label} محفوظة كما هي — السرّ نفسه لم يتغيّر.`
        : `حُفظت أسرار ${label} مشفَّرة (${result.hint}). والخطوة التالية «اربط ${label}».`,
    }
  } catch (error) {
    detail = 'failed'
    flash = { kind: 'bad', text: error instanceof Error ? error.message : 'تعذّر الحفظ' }
  }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'oauth_app.save', target: platform, detail },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return toSetup(form)
})

/**
 * ‏**أفعالُ ضبط التطبيق تعود إلى تبويب الإعداد** (ر-1) — من حقل `return` في النموذج،
 * ‏كما يعود «أعده إلى المعتمَد». كانت تنتهي بلوح القنوات: الإشعارُ هناك، و«اربط» بعد
 * ‏شاشتين، والحقلان لم يعودا على الصفحة إن ردّ الخادمُ القيمة.
 */
function toSetup(form: FormData): Response {
  return new Response(null, { status: 303, headers: { Location: backTo(form.get('return'), panelHref('channels')) } })
}

/**
 * ‏**«افصل الحساب»** (D-197): ما وعدت به صفحةُ الخصوصيّة في بندها السادس.
 *
 * ‏المعرّفُ والمنصّةُ من النموذج، ويُطابَق الاثنان في القاعدة: معرّفٌ على غير منصّته يُردّ.
 * ‏والرموزُ تُحذف ولو فشل الإبطالُ عند المنصّة، والسجلُّ يحمل النتيجةَ لا قيمةً منها.
 * ‏والإشعارُ يقول ما وقع وما بقي على المالك بيده.
 */
panel.post('/panel/channels/disconnect', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const platform = (PLATFORM_IDS as readonly string[]).includes(String(form.get('platform') ?? ''))
    ? (String(form.get('platform')) as LinkPlatform)
    : null
  const id = String(form.get('account') ?? '')
  const target = platform === null || id === '' || id.length > 200 ? null : await findLinked(c.env.DB, activeOrg(gate.session.record), id, platform)
  if (target === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لا حساب مربوطًا بهذا المعرّف على هذه المنصّة، فلم يُفصَل شيء.' })
    return toSetup(form)
  }

  const app = await readApp(c.env.DB, c.env.TOKEN_ENC_KEY, target.platform, c.env as unknown as Record<string, string | undefined>)
  const result = await disconnectAccount(c.env.DB, c.env.TOKEN_ENC_KEY, target, app)
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'account.disconnect',
      target: target.id,
      detail: `remote=${result.remote} · stopped=${result.stopped}`,
    },
    c.req.raw,
  )

  const label = platformLabel(target.platform)
  const page = REVOKE_PAGE[target.platform]
  const stopped = result.stopped === 0
    ? 'ولم يكن عليه منشور مجدول.'
    : `وأُوقف ${result.stopped} من منشوراته المجدولة فصار «فشل» بسبب الفصل، ولن يُنشَر منها شيء.`
  const remote = result.remote === 'revoked'
    ? `وأبطلت ${label} الإذن عندها.`
    : result.remote === 'failed'
      ? `وتعذّر إبطال الإذن عند ${label}، فاسحبه بيدك من «${page.label}».`
      : `ولا نداء إبطال يُنادى عند ${label} لهذا الحساب، فاسحب الإذن بيدك من «${page.label}».`
  await setFlash(c.env, c.req.raw, {
    kind: result.remote === 'revoked' ? 'ok' : 'warn',
    text: `فُصل «${target.displayName}» وحُذفت رموزُه من القاعدة. ${stopped} ${remote}`,
  })
  return toSetup(form)
})

/** حذفُ التطبيق من الخزانة — ولا يمسّ ما في أسرار Worker. */
/**
 * فحصُ زوج الأسرار — **قبل الربط، لا بعد أن يفشل.**
 *
 * `invalid_client` يصل بعد أن ينجح كلُّ شيءٍ قبله، **فلا يُعرَف أهو
 * السرُّ أم علّةٌ أخرى** إلّا بدورةِ إذنٍ كاملةٍ في كلّ مرّة. وهذا
 * الفحصُ يسأل السؤالَ وحده: **أيَقبل المزوّدُ هذا الزوج؟** (D-060)
 *
 * ولا يُنتَج رمزُ وصول: المرسَلُ رمزٌ باطلٌ عمدا. ولا تكلفة، فلا صفَّ
 * في الدفتر (D-008 يوجب التسجيل على المدفوع).
 */
panel.post('/panel/channels/app/verify', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const platform = platformParam(String(gate.form.get('platform') ?? ''))
  if (platform === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّة غير معروفة' })
    return back('channels')
  }

  const creds = await readApp(
    c.env.DB,
    c.env.TOKEN_ENC_KEY,
    platform,
    c.env as unknown as Record<string, string | undefined>,
  )
  const label = platformLabel(platform)
  if (creds === null) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: `لا أسرار محفوظةً لـ ${label} — احفظها أوّلا ثمّ افحص.`,
    })
    return toSetup(gate.form)
  }

  const verdict = await verifyAppCredentials(
    PROVIDERS[platform],
    { clientId: creds.clientId, clientSecret: creds.clientSecret },
  )

  /*
   * ‏**والإشعارُ بلغة المالك وبوّابةِ منصّته** (ر-1): كان يقول «تبويب Auth» لكلّ منصّة —
   * ‏ولا تبويبَ بهذا الاسم عند Meta وTikTok وGoogle — ويكتب «**تعرفه**» بنجمتيه (الإشعارُ
   * ‏يُهرَّب)، ويلصق `TypeError` خامًّا حين لا تُبلَغ المنصّة. فالبوّابةُ من دليلها،
   * ‏ورمزُ المنصّة الخامُّ في سجلّ التدقيق (`detail`) لا في وجه المالك.
   */
  const portal = SETUP[platform]?.portalLabel ?? label
  const plain = (text: string): string => text.replaceAll('**', '')
  // ‏ونصُّ المنصّة يُعرَض ولا يُبنى عليه حكم (D-054) — وصفُها لا رمزُها
  const said = verdict.kind === 'bad_secret' || verdict.kind === 'bad_client_id'
    ? verdict.description === undefined ? '' : ` وردّت: «${verdict.description}».`
    : ''
  let flash: PanelFlash
  if (verdict.kind === 'bad_secret') {
    flash = {
      kind: 'bad',
      text:
        `السرّ مرفوض: ${label} تعرف المعرّف ${creds.clientId} ولا تقبل السرّ معه.${said} ` +
        `انسخ السرّ من جديد من ${portal} — أو ولّد سرًّا جديدًا هناك — والصقه في حقل Client Secret.`,
    }
  } else if (verdict.kind === 'bad_client_id') {
    flash = {
      kind: 'bad',
      text:
        `المعرّف نفسُه مجهول عند ${label}: أُرسل ${creds.clientId}.${said} فهو من تطبيق آخر أو نقصه حرف — ` +
        `انسخه من جديد من ${portal} والصقه في حقل Client ID.`,
    }
  } else if (verdict.kind === 'accepted') {
    flash = {
      kind: 'ok',
      text: `الزوج مقبول عند ${label}. فإن بقي الربط يفشل فالعلّة ليست في المعرّف ولا في السرّ.`,
    }
  } else if (verdict.kind === 'unsupported') {
    flash = { kind: 'warn', text: `لا فحص لـ ${label}: ${plain(verdict.detail)}` }
  } else if (verdict.unreachable === true) {
    flash = { kind: 'warn', text: `لم نصل إلى ${label} الآن، فلم يُحسَم الفحص. أعد الفحص بعد دقيقة.` }
  } else {
    flash = { kind: 'warn', text: `لم يُحسَم الفحص: ${plain(verdict.detail)}` }
  }

  // **والأثرُ يُحفَظ ليقرأه المعالج** — نتيجةٌ تُنسى عند كلّ فتحةٍ
  // ليست نتيجة، ويُسأل المالكُ أن يفحص مرّةً بعد مرّة (D-061)
  await recordVerification(c.env.DB, platform, verdict.kind)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'oauth_app.verify', target: platform, detail: verdict.kind },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return toSetup(gate.form)
})

panel.post('/panel/channels/app/delete', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const platform = platformParam(String(gate.form.get('platform') ?? ''))
  if (platform === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّة غير معروفة' })
    return back('channels')
  }

  const done = await deleteApp(c.env.DB, platform)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'oauth_app.delete', target: platform, detail: done ? 'deleted' : 'absent' },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: done ? 'ok' : 'bad',
    text: done ? `حُذفت أسرار ${platformLabel(platform)} من الخزانة.` : 'لا أسرار محفوظةً لهذه المنصّة.',
  })
  return toSetup(gate.form)
})

// ── الخطّة الأسبوعيّة ─────────────────────────────────────────────────

/**
 * توليدُ خطّة الأسبوع — نداءٌ واحدٌ مدفوع، بحارسه.
 *
 * **ولا يكتب منشورا ولا يجدول.** يقترح، والكتابةُ زرٌّ لكلّ بند يمرّ
 * بـ `/panel/drafts/write` نفسه — لا طريقا ثانيا حول الحارس.
 */
panel.post('/panel/plan/generate', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const outcome = await planWeek({
    db: c.env.DB,
    encKey: c.env.TOKEN_ENC_KEY,
    workerSecrets: c.env as unknown as Record<string, string | undefined>,
  })

  const flash: PanelFlash =
    outcome.kind === 'planned'
      ? {
          kind: 'ok',
          text: `خطّة أسبوع ${outcome.week}: ${outcome.items} بندا${
            outcome.dropped === 0 ? '' : ` (وأُسقط ${outcome.dropped}: ${outcome.droppedWhy})`
          }، ${
            // وصفرٌ مع وحداتٍ مستهلَكةٍ ليس مجّانا بل سعرٌ لم يُضبط (D-008).
            // و«وحدة» لا «رمز» (D-155): الرمزُ في اللوحة رمزُ التطبيق والاسترداد
            outcome.cost === 0 && outcome.units > 0
              ? `و${outcome.units} وحدةً بلا سعر مضبوط للمزوّد — سُجّلت صفرا موسوما`
              : `الكلفة ${money(outcome.cost)}`
          }.`,
        }
      : outcome.kind === 'not_enough'
        ? { kind: 'warn', text: outcome.reason }
        : outcome.kind === 'blocked'
          ? { kind: 'warn', text: outcome.reason }
          : { kind: 'bad', text: `تعذّر التخطيط: ${outcome.reason}` }

  // السببُ مع النوع (D-157): «failed» وحدَها كانت تُقرأ في السجلّ بلا سبب
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'plan.generate',
      target: null,
      detail: outcome.kind === 'planned' ? outcome.kind : `${outcome.kind}: ${outcome.reason}`.slice(0, 200),
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/** اعتمادُ منطق الخطّة — علامةٌ لا تنفيذ. */
panel.post('/panel/plan/approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')

  const done = await approvePlan(c.env.DB, id)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'plan.approve', target: id, detail: done ? 'approved' : 'refused' },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: done ? 'ok' : 'bad',
    text: done
      ? 'اعتُمد منطق الأسبوع. ولا يُكتب منه حرف حتّى تضغط «اكتب منه» لبند.'
      : 'لا خطّة بهذه الحال.',
  })
  return back('posts')
})

// ── الصور ────────────────────────────────────────────────────────────

/**
 * توليدُ صورةٍ لمنشور.
 *
 * يمرّ بـ `generateForPost` نفسه — بسقوفه وإيقافه وسقفِ مزوّده. **وهو
 * نداءٌ مدفوعٌ بضغطة**، فالزرُّ يُعطَّل بعد الأولى ومفتاحُ عدم التكرار
 * يمنع الثانية إن سبقت.
 */
panel.post('/panel/media/generate', (c) => imageRoute(c, false))

/**
 * صورةٌ بديلة بضغطةٍ واحدة — **والقائمةُ لا تُرفَض إلّا إن مرّ التوليد**.
 *
 * كان البديلُ «ارفض» ثمّ «ولّد»: والأولى تقع ولو سقطت الثانيةُ عند سقف،
 * فيبقى المنشورُ بلا صورة. والحارسُ في `generateForPost` لا هنا (D-019).
 */
panel.post('/panel/media/regenerate', (c) => imageRoute(c, true))

async function imageRoute(c: Context<{ Bindings: Env }>, replace: boolean): Promise<Response> {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')
  const old = replace ? String(gate.form.get('media') ?? '') : ''
  // ‏والنمطُ من قائمةٍ مغلقة، وما سواها إنفوجرافيك وهو الافتراض (D-174)
  const style = gate.form.get('style') === 'illustration' ? 'illustration' : 'infographic'

  const outcome = await generateForPost(
    {
      db: c.env.DB,
      bucket: c.env.MEDIA,
      encKey: c.env.TOKEN_ENC_KEY,
      workerSecrets: c.env as unknown as Record<string, string | undefined>,
    },
    id,
    replace ? { replace: old, style } : { style },
  )

  // ‏وما لم يُولَّد لم يُرفَض: يُقال ذلك للمالك فلا يبحث عن صورةٍ اختفت
  const kept = replace ? ' والصورة الحاليّة باقية كما هي.' : ''
  const flash: PanelFlash =
    outcome.kind === 'generated'
      ? {
          // **والنصُّ فوق الصورة قد لا يُركَّب لخمسة أسباب** — وسقوطُه كان
          // صامتا، فيُقرأ عطلا في مكانٍ آخر (D-088)
          kind: style === 'infographic' || outcome.note === '' ? 'ok' : 'warn',
          text:
            (style === 'infographic'
              ? `رُسم إنفوجرافيك${replace ? ' بديل' : ''} من نصّ المنشور — ${kb(outcome.bytes)}، الكلفة ${money(outcome.cost)}.`
              : `وُلّدت صورة${replace ? 'ٌ بديلة' : ''} — ${kb(outcome.bytes)}، الكلفة ${money(outcome.cost)}.`) +
            (replace ? ' والسابقة مرفوضة تبقى في الدفتر بكلفتها.' : '') +
            (outcome.note === '' ? '' : style === 'infographic' ? ` ${outcome.note}.` : ` وبلا نصّ فوقها: ${outcome.note}.`),
        }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'وُلّدت صورة لهذا النصّ — لم يُنفَق شيء.' }
        : outcome.kind === 'in_progress'
          ? {
              kind: 'warn',
              text: `توليد جار لهذه الصورة منذ ${outcome.since} — انتظره ولا تنقر ثانيةً.`,
            }
          : outcome.kind === 'blocked'
            ? { kind: 'warn', text: `${outcome.reason}.${kept}` }
            : { kind: 'bad', text: `تعذّر التوليد: ${outcome.reason}.${kept}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: replace ? 'media.regenerate' : 'media.generate',
      target: id,
      // والسببُ مع النوع (D-157): «generated» بلا نصٍّ فوقها كانت تُقرأ نجاحا تامّا
      // ‏والنمطُ في أوّل التفصيل: اسمُ الفعل باقٍ كما تقرؤه الرحلة (D-174)
      detail: `${style} · ${
        outcome.kind === 'generated'
          ? outcome.note === '' ? 'generated' : `generated: ${outcome.note}`
          : 'reason' in outcome ? `${outcome.kind}: ${outcome.reason}` : outcome.kind}`.slice(0, 200),
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  // ‏والصورةُ المولَّدةُ في بطاقتها: كان المالكُ يعود إلى رأس اللوح والصورةُ عند ‏2442px
  return toCard('d', id)
}

/**
 * تحريكُ الصورة إلى مقطعٍ رأسيّ (D-052).
 *
 * **ولا يُنادى إلّا على صورةٍ معتمَدة**: الفيديو أغلى ما يُنادى في
 * النظام، وتحريكُ ما رُفض إنفاقٌ على ما لن يُنشَر. والحارسُ في الدالّة
 * لا هنا — فمسارٌ ثانٍ ينسخه ينسى شرطا (D-019).
 */
panel.post('/panel/media/animate', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')

  const outcome = await animateForPost(
    {
      db: c.env.DB,
      bucket: c.env.MEDIA,
      ai: await bindingFor(c.env, c.env.DB, c.env.TOKEN_ENC_KEY),
      encKey: c.env.TOKEN_ENC_KEY,
      baseUrl: c.env.PUBLIC_BASE_URL,
    },
    id,
  )

  const flash: PanelFlash =
    outcome.kind === 'generated'
      ? {
          kind: 'ok',
          text: `وُلّد مقطع رأسيّ — ${kb(outcome.bytes)}. ` +
            'والسعر لم يُقرأ من لوحة Cloudflare بعد، فسُجّل صفرا موسوما.',
        }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'لهذا المنشور مقطع من قبل — لم يُنفَق شيء.' }
        : outcome.kind === 'in_progress'
          // **وليس عطلا**: نداءٌ سابقٌ لم يفرغ بعد، والتوليدُ دقائق
          ? {
              kind: 'warn',
              text: `توليد جار لهذا المقطع منذ ${outcome.since} — ` +
                'انتظره ولا تنقر ثانيةً، فالنقرة الثانية كانت تدفع ثانيةً.',
            }
          : outcome.kind === 'blocked'
            ? { kind: 'warn', text: outcome.reason }
            // ‏نفادُ الرصيد مهمّةٌ لا عطل (D-214): يُقال ما تفعله، والتفصيلُ في «ما عليك»
            : outcome.reason.startsWith(NO_CREDIT)
              ? { kind: 'warn', text: 'لم يُحرَّك المقطع: رصيد AI Gateway نفد. أضِف رصيدًا من لوحة Cloudflare، ' +
                  'والخطوات في «ما عليك» تحت «رصيد AI Gateway». ولم يُصرف شيء.' }
              : { kind: 'bad', text: `تعذّر تحريك الصورة: ${outcome.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'media.animate',
      target: id,
      detail: 'reason' in outcome ? `${outcome.kind}: ${outcome.reason}`.slice(0, 200) : outcome.kind,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return toCard('d', id)
})

/** رفضُ صورة — تبقى بكلفتها ولا تُحذف بايتاتُها. */
panel.post('/panel/media/reject', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')
  // ‏والمعرّفُ معرّفُ الصورة، والعودةُ إلى بطاقة منشورها
  const owner = await c.env.DB
    .prepare('SELECT post_id FROM media WHERE id = ?')
    .bind(id)
    .first<{ post_id: string }>()

  const done = await rejectMedia(c.env.DB, id)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'media.reject', target: id, detail: done ? 'rejected' : 'refused' },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: done ? 'ok' : 'bad',
    text: done ? 'رُفضت الصورة — وتبقى بكلفتها، فما دُفع ثمنُه يُرى.' : 'لا صورة بهذه الحال.',
  })
  return owner === null ? back('posts') : toCard('d', owner.post_id)
})

/**
 * شاشةُ منصّةٍ واحدة — `/panel/channels/:platform`.
 *
 * ## لماذا صفحةٌ لا تبويبٌ في اللوحة
 *
 * أقسامُ اللوحة تُبنى كلُّها في كلّ تحميلٍ ثمّ تُخفى بـ `hidden`. وهذا
 * يصحّ لسبعةِ أقسامٍ ثابتة، **ولا يصحّ لسبعِ منصّاتٍ لكلٍّ ستّون منشورا**:
 * تحميلُ اللوحة يصير أربعَ مئةِ صفٍّ لا يُقرأ منها إلّا ما فُتح.
 *
 * وصفحةٌ لها عنوانُها يُشارَك ويُحفظ في المفضّلة ويُفتَح في تبويبٍ ثانٍ —
 * وشظيّةُ `#channels` لا تفعل شيئا من ذلك.
 *
 * ## والحارسُ هو حارسُ اللوحة نفسه
 *
 * لا نسخةَ منه: مسارٌ جديد بحارسٍ منسوخٍ هو الثغرةُ التي كشفها D-019.
 * والجلسةُ المعلَّقة تُردّ إلى العامل الثاني كما تُردّ من `/panel`.
 */
panel.get('/panel/channels/:platform', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const id = c.req.param('platform')
  const spec = CHANNELS.find((ch) => ch.id === id)
  // ‏صفحةٌ لا نصٌّ خامّ (D-189): رابطٌ قديمٌ إلى منصّةٍ يفتح الرافدةَ وبابَ الرئيسيّة
  if (spec === undefined) return notFoundResponse(c.req.raw, 'لا منصّة بهذا الاسم')

  const accounts = await listAccounts(c.env.DB, activeOrg(session.record))
  // **لكلّ منصّةٍ لها سرّان** (D-142) — لا لمنصّتين، وإلّا بقيت شاشةُ
  // YouTube تعد بدليلٍ لا يأتي
  const apps = await appStatuses(
    c.env.DB,
    c.env as unknown as Record<string, string | undefined>,
  )
  const present = new Set(apps.filter((a) => a.source !== 'none').flatMap((a) => a.secretNames))
  const views = viewChannels(accounts, (name) =>
    present.has(name) || (c.env[name as keyof Env] as string | undefined) !== undefined,
  )
  const view = views.find((v) => v.spec.id === id)
  if (view === undefined) return notFoundResponse(c.req.raw, 'لا منصّة بهذا الاسم')

  const now = new Date()

  // **والمنشوراتُ لما ينشر وحده**: منصّةٌ تُربَط ولا تنشر تُسأل عن
  // نطاقاتها لا عن حصادها — وأصفارُ نشرٍ على شاشتها تُقرأ فشلا لا
  // «لم يُبنَ بعد» (D-056)
  const publishes = spec.stage === 'publish'
  const platform = id as Platform
  const tab = tabOf(c.req.query('tab'), c.req.query('show'))
  const filter = filterOf(c.req.query('filter'), c.req.query('show'))
  // ‏ومَن يرى المقطع على YouTube وTikTok قرارُ المالك بعد الإجازة (D-190) — يُقرأ هنا ويُقلَب في «الإعداد»
  // ‏والمحطّةُ بما سيقع (حكمُ الناشر: TikTok بلا `video.publish` صندوقٌ)، والمفتاحُ بقرار المالك
  const reach = platform === 'youtube' || platform === 'tiktok' ? await reachNow(c.env.DB, activeOrg(session.record)) : null
  const clipReach = reach === null || (platform !== 'youtube' && platform !== 'tiktok')
    ? undefined
    : platform === 'tiktok' ? reach.tiktokWanted === true : reach.youtube
  const needs = publishes ? platformNeeds(platform, reach !== null && reach[platform as 'youtube' | 'tiktok']) : null
  // ‏وكلُّ قراءةٍ لما يُعرض في تبويبها — الإعدادُ لا يقرأ الخطَّ الزمنيّ ولا العكس
  const timeline = publishes && tab !== 'setup'
  const [posts, tally, counts, upcomingRows, historyPage, waitingRows] = await Promise.all([
    publishes ? platformPosts(c.env.DB, activeOrg(session.record), platform, 60) : Promise.resolve([]),
    publishes
      ? platformTally(c.env.DB, activeOrg(session.record), platform)
      : Promise.resolve({ published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null }),
    platformCounts(c.env.DB, activeOrg(session.record), platform, CLIP_PLATFORMS.has(platform)),
    timeline && tab !== 'waiting' ? upcoming(c.env.DB, activeOrg(session.record), platform) : Promise.resolve([]),
    timeline && tab !== 'waiting'
      ? history(c.env.DB, activeOrg(session.record), platform, tab === 'media' ? 'all' : filter, readCursor(c.req.query('before')))
      : Promise.resolve({ rows: [], next: null }),
    timeline && tab === 'waiting' ? waiting(c.env.DB, activeOrg(session.record), platform) : Promise.resolve([]),
  ])
  // والنطاقاتُ تُقرأ لكلّ ما يُربَط: هي جوابُ «ماذا يستطيع هذا الحساب»
  const scopes = spec.stage === 'none' || tab !== 'setup' ? {} : await grantedScopes(c.env.DB, activeOrg(session.record), platform)

  const shown = [...upcomingRows, ...historyPage.rows, ...waitingRows].map((p) => p.id)
  // ما قِيس — للمنشورة وحدها: مسوّدةٌ لا مقياسَ لها (D-048)
  const metrics = await metricsFor(c.env.DB, historyPage.rows.map((p) => p.id))
  const costs = await postCosts(c.env.DB, shown)

  // والوسائطُ تُعرَض لا يُقال إنّ هناك وسيطا (D-062) — استعلامٌ واحدٌ
  // لكلّ الصفحة لا واحدٌ لكلّ بطاقة، **وبصفّها كاملا**: الملاحظةُ تقول
  // أرُكّبت الشريحةُ بمقاس المنصّة فتُعرف نسبتُها
  const mediaRows = await mediaFor(c.env.DB, shown)
  const media: Record<string, { id: string; mime: string; status: 'ready' | 'rejected'; note: string | null }[]> = {}
  for (const row of mediaRows) {
    const list = media[row.postId] ?? []
    list.push({ id: row.id, mime: row.mime, status: row.status, note: row.note })
    media[row.postId] = list
  }

  const body = platformScreen({
    view, posts, tally, counts, needs, tab, filter, scopes, metrics, media, costs, now,
    upcoming: upcomingRows,
    history: historyPage,
    waiting: waitingRows,
    // سجلُّ صحّة الحساب من صفوفه لا من حال (D-129) — ويُقرأ للسلّم في كلّ تبويب
    health: spec.stage === 'none' ? {} : await accountHealth(c.env.DB, activeOrg(session.record), platform),
    // ‏الدليلُ يسكن الشاشةَ لا اللوح (D-111) — فتحتاج حالَ التطبيق وأصلَ اللوحة
    app: apps.find((a) => a.platform === id),
    baseUrl: c.env.PUBLIC_BASE_URL,
    // ‏ويومُ المالك من كعكة متصفّحه، لا من إعدادٍ يُخزَّن (D-173)
    zone: await ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
    // ‏ووميضُ الفعل يُقرأ حيث عاد المالك، لا في لوحٍ لم يفتحه
    flash: await takeFlash(c.env, c.req.raw),
    ...(clipReach === undefined ? {} : { reachPublic: clipReach }),
    ...(platform === 'tiktok' && reach !== null ? { reachNoScope: tiktokNeedsScope(reach) } : {}),
  })
  return page((nonce) =>
    // ‏والرمزُ يُحقَن هنا كما في اللوحة: نموذجا ضبط التطبيق كانا يُرسَلان بلا
    // ‏`_csrf` فيردّهما `guardPost` بـ403، والدليلُ يسكن هذه الصفحة منذ D-111
    soloPage(`صدى — ${spec.label}`, { href: panelHref('channels'), label: sectionLabel('accounts') },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('accounts', spec.id)),
  )
})

/**
 * حقائقُ المالك — **تُجمَع من البيئة والقاعدة، ولا تُكتب بيد.**
 *
 * ولا يُقرأ سرٌّ ولا يُفكّ تشفير: **أسماءٌ وحالٌ فقط** (D-005).
 */
async function ownerFacts(c: {
  env: Env
}, org: string): Promise<OwnerFacts> {
  const env = c.env as unknown as Record<string, string | undefined>
  const has = (name: string): boolean => {
    const v = env[name]
    return typeof v === 'string' && v.trim() !== ''
  }

  const accounts = await listAccounts(c.env.DB, org)
  // ‏كلُّ منصّةٍ لها سرّان (D-142) — وكانت Instagram خارجها، فمهمّتُها لا تعرف أنّ سرّيها حُفظا
  const apps = await appStatuses(c.env.DB, env)
  const ownerSettings = await readSettings(c.env.DB)

  let anyPublished = false
  try {
    const row = await c.env.DB
      .prepare("SELECT 1 AS n FROM publish_attempts WHERE status = 'succeeded' LIMIT 1")
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
          WHERE operation LIKE '%video%' AND unit_cost > 0 LIMIT 1`,
      )
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
        `SELECT detail FROM audit_log WHERE action = 'media.animate'
            AND (detail LIKE 'generated%' OR detail LIKE 'failed:%')
          ORDER BY at DESC, rowid DESC LIMIT 1`,
      )
      .first<{ detail: string | null }>()
    if (row !== null) gatewayCredit = (row.detail ?? '').includes(NO_CREDIT) ? 'short' : 'ok'
  } catch {
    // كما سبق: لا يُقرأ فلا يُعرَف
  }

  return {
    ...(gatewayCredit === undefined ? {} : { gatewayCredit }),
    secrets: new Set(
      ['TOKEN_ENC_KEY', 'ADMIN_TOKEN', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
       'GOOGLE_SA_JSON', 'CF_AI_TOKEN', 'CF_BROWSER_TOKEN'].filter(has),
    ),
    vars: new Set(['LEGAL_ENTITY', 'LEGAL_CONTACT', 'CF_AI_ACCOUNT_ID'].filter(has)),
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
 * شاشةُ «ما عليك» — **وثيقةٌ تقول الخطوات، وشاشةٌ تقول أين أنت منها.**
 */
panel.get('/panel/tasks', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const gates = gatesOf(await readGateFacts(c.env.DB))
  const body = tasksScreen({
    rows: ownerRows(await ownerFacts(c, activeOrg(session.record))),
    gates,
    phase: currentPhase(gates),
    env: c.env.SADA_ENV,
  })

  return page((nonce) =>
    soloPage(`صدى — ${sectionLabel('tasks')}`, { href: '/panel', label: 'اللوحة' },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('tasks')),
  )
})

/**
 * شاشةُ التقرير الأسبوعيّ — **تقرأ ما كُتب ولا تحسبه.**
 *
 * ولا زرَّ «ولّد الآن»: التقريرُ شهادةٌ على أسبوعٍ مضى، وزرٌّ يكتبه
 * قبل أوانه يثبّت أرقاما لم تكتمل نوافذُها — **ثمّ لا يُعاد حسابُها
 * أبدا**، لأنّ أوّلَ كتابةٍ هي الشهادة (D-058).
 */
/*
 * **نموذجُ «أقبل/أرفض» كان بلا `_csrf`** (D-150): `reportScreen` يرسم
 * النموذجَ، و`injectCsrf` كانت تُطبَّق على اللوحة وحدَها. فكان `guardPost`
 * يردّ كلَّ بتٍّ بـ`csrf_failed` — والزرُّ ظاهرٌ ولا يعمل. والحقنُ هنا لا
 * في `reportScreen` لأنّ الرمزَ من الجلسة والعرضُ لا يعرفها.
 */
panel.get('/panel/report', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const reports = await listReports(c.env.DB, activeOrg(session.record))
  const settings = await readSettings(c.env.DB)
  const body = reportScreen({
    reports,
    current: reports[0] ?? null,
    suggestions: await openSuggestions(c.env.DB),
    promoCapUsd: settings.weeklyPromoCapUsd,
    now: new Date(),
    // ‏ما أُنفق هذا الشهر حتّى اليوم، تحت الرأس (ر-10) — حيٌّ من الدفتر لا من التقرير
    month: await spendThisMonth(c.env.DB, await ownerZone(c.env.DB, c.req.header('Cookie') ?? null), new Date()),
  })

  return page((nonce) =>
    soloPage(`صدى — ${sectionLabel('results')}`, { href: '/panel', label: 'اللوحة' }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/**
 * الخطُّ الزمنيّ للمحفظة (D-212) — **تبويبٌ ثالثٌ في «النتائج»**.
 *
 * المدى والنافذةُ من العنوان بقوائم سماح (`readSpan` و`readShift`)، **فما لا يُعرَف يعود
 * إلى افتراضه** ولا يُسقط الصفحة. والأيّامُ بمنطقة المالك (D-201): يومُ الرياض يبدأ قبل
 * يوم غرينتش بثلاث ساعات، ومنشورُ الثانية فجرًا يقع في يومه لا في أمسه.
 */
panel.get('/panel/timeline', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const q = new URL(c.req.url).searchParams
  const span = readGanttSpan(q.get('span'))
  const shift = readShift(q.get('at'))
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const now = new Date()
  const win = windowOf(now, zone, span, shift)
  const loaded = await loadGantt(c.env.DB, activeOrg(session.record), win.from, win.to)
  const body = timelineScreen({
    chart: gantt(loaded, win, now, zone),
    span, shift, capped: loaded.capped, cap: GANTT_CAP, zone, now,
    flash: await takeFlash(c.env, c.req.raw),
  })

  return page((nonce) =>
    soloPage(timelineTitle(), { href: '/panel', label: 'اللوحة' }, injectCsrf(body, session.record.csrf), nonce, TIMELINE_SCRIPT,
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/**
 * رحلةُ منشور (D-104) — `‎/panel/journey/:id`.
 *
 * **ومعرّفٌ لا وجودَ له ‏٤٠٤ لا صفحةٌ فارغة**: صفحةٌ تُفتَح بلا محطّاتٍ
 * تُقرأ عطلا، و‏٤٠٤ تقول ما وقع (D-046).
 */
panel.get('/panel/journey/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const journey = await readJourney(c.env.DB, activeOrg(session.record), c.req.param('id'))
  if (journey === null) return notFoundResponse(c.req.raw, 'لا منشور بهذا المعرّف')

  const body = journeyBody(journey, new Date())
  return page((nonce) =>
    soloPage('صدى — رحلة منشور', { href: '/panel#posts', label: 'المنشورات' },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('posts')),
  )
})

/** تقريرُ أسبوعٍ بعينه — بمفتاحه، وهو أوّلُ يومٍ فيه. */
panel.get('/panel/report/:week', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)

  const stored = await readReport(c.env.DB, activeOrg(session.record), c.req.param('week'))
  if (stored === null) return notFoundResponse(c.req.raw, 'لا تقرير لهذا الأسبوع')

  const settings = await readSettings(c.env.DB)
  const body = reportScreen({
    reports: await listReports(c.env.DB, activeOrg(session.record)),
    current: stored,
    suggestions: await openSuggestions(c.env.DB),
    promoCapUsd: settings.weeklyPromoCapUsd,
    now: new Date(),
    month: await spendThisMonth(c.env.DB, await ownerZone(c.env.DB, c.req.header('Cookie') ?? null), new Date()),
  })

  return page((nonce) =>
    soloPage(`صدى — تقرير ${stored.id}`, { href: '/panel/report', label: sectionLabel('results') }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('results')),
  )
})

/**
 * بتُّ توصيةِ ترويج — **تسجيلُ رأيٍ لا أمرُ إنفاق.**
 *
 * «أقبل» تعني: هذا يستحقّ ترويجا. **ولا يقع منه إنفاق** — لا عميلَ
 * إعلاناتٍ في المستودع ولا مفتاحَ يُطلَب (D-006). وما يفعله المالكُ
 * بالمبلغ يفعله في لوحة المنصّة بيده.
 */
panel.post('/panel/report/promote', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const postId = String(gate.form.get('post_id') ?? '')
  const raw = String(gate.form.get('decision') ?? '')
  if (raw !== 'accepted' && raw !== 'rejected') {
    return c.json({ error: 'unknown_decision' }, 400)
  }
  if (postId === '') return c.json({ error: 'missing_post' }, 400)

  const changed = await decidePromotion(c.env.DB, postId, raw)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'promotion.decide', target: postId, detail: raw },
    c.req.raw,
  )

  await setFlash(c.env, c.req.raw, changed
    ? {
        kind: raw === 'accepted' ? 'warn' : 'ok',
        text: raw === 'accepted'
          ? 'سُجّل قبولُك. ولم يُنفَق شيء — الترويج يقع في لوحة المنصّة بيدك.'
          : 'سُجّل رفضُك، ولا يُقترَح هذا المنشور ثانيةً.',
      }
    : { kind: 'warn', text: 'لا توصية تنتظر لهذا المنشور — أو بُتّ فيها قبلا.' })

  return new Response(null, { status: 303, headers: { Location: '/panel/report' } })
})

/**
 * تسليمُ بايتات الصورة — **خلف الجلسة**.
 *
 * R2 ليس له عنوانٌ عامّ هنا، وهذا مقصود: صورةٌ لمنشورٍ لم يُنشر بعد
 * تكشف ما يُعدّه المالك قبل أن يعلنه. فتُقرأ من الدلو ويُسلَّمها من
 * يملك جلسةً، ولا رابطَ يُشارَك.
 *
 * والمفتاحُ يُقرأ من القاعدة لا من المسار: مسارٌ يُبنى من مدخلٍ يفتح
 * الدلوَ كلَّه لمن يخمّن مفتاحا.
 */
panel.get('/panel/media/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null || session.record.pending) return c.text('غير مصرَّح', 403)

  const row = await c.env.DB
    .prepare('SELECT r2_key, mime FROM media WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ r2_key: string; mime: string }>()
  if (row === null) return c.text('لا صورة', 404)

  /*
   * **بثٌّ بمداه لا مخزنٌ كامل** (D-182). كان يُقرأ الكائنُ كلُّه إلى الذاكرة —
   * صحيحٌ لصورةٍ ومقطعٍ مولَّدٍ بخمسَ عشرةَ ثانية، **ويُسقط العاملَ على مقطع المالك**
   * (حتّى ‏500MB وسقفُ الذاكرة ‏128MB) حين يطلبه `<video>` في صفحة المنصّة. فيُقرأ
   * `Range` ويُطلب من R2 مداه وحده، ويُردّ ‏206 به أو ‏200 بالكائن كلِّه بثًّا.
   */
  const wanted = parseRange(c.req.header('Range'))
  if (wanted !== null) {
    const head = await c.env.MEDIA.head(row.r2_key)
    if (head === null) return c.text('البايتات مفقودة', 404)
    if (resolveRange(wanted, head.size) === null) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } })
    }
  }
  const object = await c.env.MEDIA.get(row.r2_key, wanted === null ? {} : { range: wanted })
  if (object === null) return c.text('البايتات مفقودة', 404)
  const span = wanted === null ? null : resolveRange(wanted, object.size)

  return new Response(object.body as unknown as BodyInit, {
    status: span === null ? 200 : 206,
    headers: {
      ...(span === null
        ? { 'Content-Length': String(object.size) }
        : { 'Content-Range': `bytes ${span.start}-${span.end}/${object.size}`, 'Content-Length': String(span.end - span.start + 1) }),
      'Accept-Ranges': 'bytes',
      'Content-Type': row.mime,
      // خاصّةٌ لا عامّة: وسيطٌ مشترك لا يخزّن ما يخصّ جلسة
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // الوسيطُ بايتاتٌ لا صفحة (D-152): لا برمجةَ ولا أصلَ لو جاء نوعٌ غيرُ متوقَّع
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `inline; filename="${row.r2_key.split('/').pop() ?? 'media'}"`,
    },
  })
})

// ── الكتابة والبَتّ ──────────────────────────────────────────────────

/**
 * كتابةُ مسوّدة من اللوحة.
 *
 * يمرّ بـ `draftPost` نفسه — بسقوفه وإيقافه وسقفِ مزوّده: **زرٌّ في صفحةٍ
 * ليس طريقا جانبيّا حول الحارس** (D-019). ولا يُنشئ شيئا بحالةٍ غير
 * `draft`، فلا يمسّ D-009 من قريبٍ ولا بعيد.
 */
panel.post('/panel/drafts/write', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const raw = String(form.get('platform') ?? '')
  // منصّةٌ لا نعرفها لا تُمرَّر إلى القاعدة لتردَّها بقيدٍ غامض
  /*
   * **والقائمةُ من المواصفة لا من شرطٍ يُكتب حرفا** (D-092).
   *
   * كانت منصّتان مكتوبتين هنا وفي `<select>` هناك، **وثالثةٌ تُضاف
   * فتُنسى إحداهما** — وهي علّةُ `KNOWN_TASKS` نفسُها (D-091).
   */
  if (!(raw in PLATFORMS)) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّة غير معروفة' })
    return back('write')
  }
  const platform = raw as Platform

  const outcome = await draftPost(
    { db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined> },
    id,
    platform,
  )

  const flash: PanelFlash =
    outcome.kind === 'drafted'
      ? {
          kind: 'ok',
          text: `كُتبت مسوّدة ${PLATFORMS[platform].label} — ${outcome.length} محرفا، الكلفة ${money(outcome.cost)}.`,
        }
      : outcome.kind === 'already'
        // ‏والمسوّدةُ القائمةُ أمامه لا في مكانٍ يبحث عنه — والمرفوضةُ لا تُعدّ قائمة (job.ts)
        ? { kind: 'ok', text: `مسوّدة ${PLATFORMS[platform].label} من هذه النسخة موجودة وهي هذه — لم يُنفَق شيء.` }
        : outcome.kind === 'blocked'
          ? { kind: 'warn', text: outcome.reason }
          : outcome.kind === 'not_analyzed'
            ? { kind: 'warn', text: outcome.reason }
            : {
                kind: 'bad',
                text: `تعذّرت الكتابة: ${outcome.reason}${outcome.cost === undefined
                  ? ''
                  : ` — ودُفع ثمن المحاولة المردودة ${money(outcome.cost)}، والإعادة تدفع ثانيةً`}`,
              }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'draft.write', target: `${id}:${platform}`, detail: outcome.kind },
    c.req.raw,
  )
  // ‏و«موجودةٌ وهي هذه» لمسوّدةٍ خارجَ النافذة — كُتبت من النسخة نفسِها قبل أسابيع — لا بطاقةَ لها:
  // ‏فرحلتُها تُريها بنصّها وحالها، والإشعارُ لا يُكتب لصفحةٍ لا تقرؤه فيظهر بعدها في غير موضعه
  if (outcome.kind === 'already' && !(await onBoard(c.env.DB, activeOrg(gate.session.record), outcome.postId))) return toJourney(outcome.postId)
  await setFlash(c.env, c.req.raw, flash)
  // ‏والمسوّدةُ الجديدةُ في بطاقتها لا عند رأس اللوح، وما لم يُكتب يعود إلى نموذج الكتابة
  return outcome.kind === 'drafted' || outcome.kind === 'already' ? toCard('d', outcome.postId) : back('write')
})

/**
 * «اكتب من فكرتك» (D-190) — **جملةٌ أو كلماتٌ ← مسوّدةٌ لكلّ منصّةٍ مكتوبةٍ اختارها المالك**.
 *
 * نداءٌ لكلّ منصّةٍ بـ `draftFromIdea`، بحرّاس `draftPost` كلِّها (`writer.ts`): الإيقافُ
 * والسقفان وسقفُ المزوّد، والكلفةُ قبل المسوّدة، ومفتاحٌ من بصمة الفكرة ومنصّتها. وحاجزٌ
 * بلغه الأوّلُ يوقف الثاني فلا يُسأل مرّتين. **ثمّ يعود المالكُ إلى أوّل بطاقةٍ جديدة**،
 * لا إلى رأس اللوح — ومعه ما لا يُجدوَل منها لأنّ منصّتَه غيرُ متّصلة.
 */
const IDEA_PLATFORMS: readonly Platform[] = ['linkedin', 'x']

panel.post('/panel/drafts/idea', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form
  const idea = String(form.get('idea') ?? '')
  const asked = form.getAll('platform').map(String)
  const chosen = IDEA_PLATFORMS.filter((p) => asked.includes(p))
  if (chosen.length === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'اختر منصّةً واحدةً على الأقلّ — LinkedIn أو X.' })
    return back('idea')
  }

  // ‏فكرةٌ فارغةٌ أو طويلة تُردّ مرّةً قبل أيّ نداء، لا مرّةً لكلّ منصّة
  const problem = ideaProblem(idea)
  if (problem !== null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: problem })
    return back('idea')
  }

  const deps = { db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined> }
  const done: { platform: Platform; outcome: DraftOutcome }[] = []
  for (const platform of chosen) {
    const outcome = await draftFromIdea(deps, idea, platform)
    done.push({ platform, outcome })
    // ‏حاجزٌ (إيقافٌ أو سقف) يحجز الثانيةَ كما حجز الأولى — فلا يُسأل مرّتين
    if (outcome.kind === 'blocked') break
  }
  await record(
    c.env.DB,
    { actor: 'panel', action: 'draft.idea', target: chosen.join(','), detail: done.map((d) => `${d.platform}:${d.outcome.kind}`).join(' ') },
    c.req.raw,
  )

  const label = (p: string): string => platformLabel(p)
  const names = (list: readonly { platform: string }[]): string => list.map((x) => label(x.platform)).join(' و')
  const drafted = done.filter((d): d is { platform: Platform; outcome: Extract<DraftOutcome, { kind: 'drafted' }> } => d.outcome.kind === 'drafted')
  const already = done.filter((d): d is { platform: Platform; outcome: Extract<DraftOutcome, { kind: 'already' }> } => d.outcome.kind === 'already')
  const stopped = done.filter((d) => d.outcome.kind === 'blocked' || d.outcome.kind === 'failed' || d.outcome.kind === 'not_analyzed')
  const spent = drafted.reduce((sum, d) => sum + d.outcome.cost, 0)
  // ‏ما كُتب لمنصّةٍ غيرِ متّصلة يُعتمَد ولا يُجدوَل: يُقال الآن لا عند الجدولة (D-190)
  const links = linkStates(await listAccounts(c.env.DB, activeOrg(gate.session.record)))
  const unlinked = [...drafted, ...already].filter((d) => links[d.platform] !== 'linked')
  const parts: string[] = []
  if (drafted.length > 0) {
    parts.push(`كُتبت من فكرتك ${drafted.length === 1 ? 'مسوّدة' : 'مسوّدتا'} ${names(drafted)} — الكلفة ${money(spent)}.`)
  }
  if (already.length > 0) parts.push(`${already.length === 1 ? 'ومسوّدة' : 'ومسوّدتا'} ${names(already)} من هذه الفكرة موجودة — لم يُنفَق عليها شيء.`)
  for (const d of stopped) {
    const why = (d.outcome as { reason: string }).reason
    // ‏ومحاولةٌ رُدّ جوابُها بعد أن دُفع ثمنُه تُقال بكلفتها: كان الرقمُ الوحيدُ في الإشعار أقلَّ ممّا أُنفق
    const paid = d.outcome.kind === 'failed' ? d.outcome.cost : undefined
    parts.push(d.outcome.kind === 'blocked'
      ? `${why}.`
      : `تعذّرت ${label(d.platform)}: ${why}${paid === undefined ? '' : ` — ودُفع ثمن المحاولة المردودة ${money(paid)}، والإعادة تدفع ثانيةً`}.`)
  }
  if (unlinked.length > 0) parts.push(`ولا حساب متّصلًا على ${names(unlinked)}: تُعتمَد ولا تُجدوَل حتّى تربطه.`)
  const flash: PanelFlash = {
    kind: stopped.some((d) => d.outcome.kind === 'failed')
      ? (drafted.length + already.length > 0 ? 'warn' : 'bad')
      : stopped.length > 0 || unlinked.length > 0 ? 'warn' : 'ok',
    text: parts.join(' '),
  }

  /*
   * ‏إلى أوّل بطاقةٍ جديدة — وما كُتب من قبل خارجَ النافذة إلى رحلته (كـ «اكتب مسوّدة»)، **حين
   * ‏لا شيءَ غيرُه يُقال**: رحلةُ المنشور لا تقرأ الإشعار، فكان فشلُ X المدفوعُ و«لا حسابَ
   * ‏متّصلًا» يضيعان مع قديمٍ لـ LinkedIn خارجَ اللوح. وما يُقال يعود إلى البطاقة إن كانت في
   * ‏اللوح، وإلّا إلى «اكتب من فكرتك» حيث يُقرأ.
   */
  const first = drafted[0]?.outcome.postId ?? already[0]?.outcome.postId
  if (first === undefined) {
    await setFlash(c.env, c.req.raw, flash)
    return back('idea')
  }
  const onlyAlready = drafted.length === 0 && stopped.length === 0 && unlinked.length === 0
  const shown = await onBoard(c.env.DB, activeOrg(gate.session.record), first)
  if (onlyAlready && !shown) return toJourney(first)
  await setFlash(c.env, c.req.raw, flash)
  return shown ? toCard('d', first) : back('idea')
})

/**
 * البَتُّ في مسوّدة — **وهو القرار الذي يفتح بابَ النشر.**
 *
 * يُسجَّل في `audit_log` بمعرّف المسوّدة وحالتها الجديدة: D-009 يشترط
 * موافقةً بشريّة، وموافقةٌ بلا أثرٍ يُقرأ لا تُراجَع بعد شهر.
 */
panel.post('/panel/drafts/decide', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const wants = String(form.get('do') ?? '')
  const editor = fromEditor(form)
  const now = new Date()
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)

  /*
   * ‏«احفظ» في المحرّر (D-198): النصُّ يُكتب والمسوّدةُ تبقى تنتظر قرارك، **والفحصُ فحصُ الاعتماد**
   * ‏(`saveText`)، فلا يُحفَظ ما سيُردّ عند الاعتماد. ويعود إلى المحرّر نفسِه.
   */
  if (wants === 'save') {
    const saved = await saveText(c.env.DB, activeOrg(gate.session.record), id, String(form.get('text') ?? ''))
    /*
     * ‏**والحفظُ التلقائيّ** (D-233، من Notion): المحرّرُ يرسل النصَّ نفسَه بعد ثانيةٍ ونصف من آخر حرف، بـ`auto=1`،
     * ‏فيُردّ عليه بسطرٍ لا بتحويل: لا إشعارَ يملأ الشاشة كلَّ جملة، ولا سطرَ تدقيقٍ لكلّ توقّف. والفحصُ فحصُ الاعتماد نفسُه.
     */
    if (form.get('auto') === '1') {
      return saved.ok ? c.json({ ok: true }) : c.json({ ok: false, reason: saved.reason }, 422)
    }
    await record(c.env.DB, { actor: 'panel', action: 'draft.save', target: id, detail: saved.ok ? 'saved' : `refused:${saved.reason}` }, c.req.raw)
    await setFlash(c.env, c.req.raw, saved.ok
      ? { kind: 'ok', text: 'حُفظ النصّ، وما زالت تنتظر قرارك.' }
      : { kind: 'bad', text: `لم يُحفظ: ${saved.reason}` })
    return editor ? toEditor(id) : toCard('d', id)
  }

  /*
   * ‏النصُّ المرسَل هو المعروض: تُقارنه `decide` بالمحفوظ فتعرف أعُتمد كما كُتب أم بعد تعديل.
   * ‏**و«اعتمد» على البطاقة المختصرة بلا مربّع** (D-198): البطاقةُ تعرض ثلاثةَ أسطرٍ لا مربّعًا،
   * ‏فيُعتمَد المحفوظُ كما هو، كما في «اعتمدها كما كُتبت» (`approveMany`).
   */
  let text = ''
  if (wants !== 'reject') {
    const sent = form.get('text')
    text = sent === null
      ? (await c.env.DB.prepare('SELECT text FROM posts WHERE id = ?').bind(id).first<{ text: string }>())?.text ?? ''
      : String(sent)
  }
  const result = await decide(
    c.env.DB, activeOrg(gate.session.record),
    id,
    wants === 'reject' ? { kind: 'reject' } : { kind: 'approve', text },
    gate.session.record.via === 'passkey' ? 'panel:passkey' : 'panel:token',
  )

  /*
   * ‏«اعتمد وجدوِل» (D-198): بعد الاعتماد وحده، **وبـ`schedulePost` نفسِها** بحسابها وموعدها من
   * ‏النموذج، فالحارسُ واحد (D-019) والاعتمادُ مسجَّلٌ قبلها (D-009).
   */
  let scheduled: ScheduleResult | null = null
  if (result.ok && result.status !== 'rejected' && wants === 'approve-schedule') {
    scheduled = await schedulePost(c.env.DB, id, String(form.get('account') ?? ''), readWhen(form, zone, now), now)
    await record(c.env.DB, {
      actor: 'panel', action: 'draft.schedule', target: id, detail: scheduled.ok ? scheduled.at : `refused:${scheduled.reason}`,
    }, c.req.raw)
  }

  const flash: PanelFlash = !result.ok
    ? { kind: 'bad', text: result.reason }
    : result.status === 'rejected'
      ? {
          kind: 'ok',
          text: 'رُفضت — وتبقى معروضةً بكلفتها، فما دُفع ثمنُه يُرى.',
          // **والتراجعُ يقع مع الإشعار لا بعده** (D-100): الرفضُ عمودٌ
          // واحدٌ يُقلَب، فلا يحتاج سؤالا قبله ويكفيه بابٌ بعده
          undo: { action: '/panel/drafts/undo-reject', id, label: 'تراجَع' },
        }
      : scheduled !== null && scheduled.ok
        ? {
            kind: 'ok',
            text: `اعتُمدت وجُدولت على ${platformLabel(scheduled.platform)} (${scheduled.account}) ${ownerWhen(scheduled.at, zone, now)}.`,
          }
        : scheduled !== null
          ? { kind: 'warn', text: `اعتُمدت، وتعذّرت جدولتُها: ${scheduled.reason}` }
          : {
              kind: 'ok',
              text:
                result.status === 'edited'
                  ? 'اعتُمدت بنصّك بعد التعديل — اختر لها حسابًا وموعدًا.'
                  : 'اعتُمدت كما كُتبت — اختر لها حسابًا وموعدًا.',
              // ‏والاعتمادُ يُتراجَع عنه كالرفض (الخطّة 7.8): «ارفض» على بُعد ‏8px من «اعتمد»،
              // ‏والضغطةُ الخاطئةُ كانت تُدخل المنشورَ «وزّع المعتمَد» ولا طريقَ إلى المسوّدة
              undo: { action: '/panel/drafts/undo-approve', id, label: 'تراجَع' },
            }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.decide',
      target: id,
      detail: result.ok ? result.status : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  /*
   * ‏ومن المحرّر (D-198): المردودةُ والمعتمَدةُ بلا موعدٍ إلى المحرّر نفسِه (موعدُها فيه)، والمجدولةُ
   * ‏والمرفوضةُ إلى بطاقتها في القائمة. ومن البطاقة كما كان: المعتمَدةُ إلى شريط جدولتها.
   */
  if (editor) {
    if (!result.ok) return toEditor(id)
    if (result.status === 'rejected' || scheduled?.ok === true) return toCard('d', id)
    return toEditor(id, 'ed-when')
  }
  return toCard(result.ok && result.status !== 'rejected' ? 's' : 'd', id)
})

/**
 * التراجعُ عن رفض (D-100).
 *
 * **ولا حارسَ هنا**: `undoReject` تشترط أنّ الحالَ `rejected` الآن، فإشعارٌ
 * شاخ في تبويبٍ منسيٍّ لا يقلب حالا تبدّلت بعده. وهذا المسارُ ينقل الطلبَ
 * ويكتب السجلّ، **ولا يقرّر**.
 */
panel.post('/panel/drafts/undo-reject', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await undoReject(c.env.DB, activeOrg(gate.session.record), id)

  const flash: PanelFlash = result.ok
    ? { kind: 'ok', text: 'عادت مسوّدةً تنتظر قرارك.' }
    : { kind: 'bad', text: `تعذّر التراجع: ${result.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.undo_reject',
      target: id,
      detail: result.ok ? 'restored' : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return toCard('d', id)
})

/**
 * التراجعُ عن اعتماد (الخطّة 7.8) — **والحكمُ في `undoApprove`**: لا يُسحب ما جُدول،
 * وإشعارٌ شاخ لا يقلب حالًا تبدّلت بعده. والمسارُ ينقل ويكتب السجلّ، **ولا يقرّر**.
 */
panel.post('/panel/drafts/undo-approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await undoApprove(c.env.DB, activeOrg(gate.session.record), id)

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.undo_approve',
      target: id,
      detail: result.ok ? 'restored' : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: 'عادت مسوّدةً تنتظر قرارك، بنصّها قبل الاعتماد.' }
    : { kind: 'bad', text: `تعذّر التراجع: ${result.reason}` })
  return toCard('d', id)
})

/**
 * البَتُّ الجماعيّ — **اعتمادٌ فقط، ولا رفضَ جماعيّ** (D-100).
 *
 * ## ولماذا لا رفضَ جماعيّ
 *
 * الاعتمادُ يفتح بابا ولا يعبره: يبقى بعده اختيارُ حسابٍ وموعد، **وفيه
 * محطّةٌ ثانية يُرى فيها ما اعتُمد**. والرفضُ الجماعيُّ بابٌ واحدٌ يُغلق
 * على جملةٍ بضغطة، **وتراجعُه واحدةً واحدة** — فيبقى فرديّا حيث يُقرأ
 * كلٌّ قبل بَتِّه.
 *
 * ## والمعرّفاتُ تُقرأ كلُّها لا أوّلُها
 *
 * `form.get` تعطي الأوّلَ وحدَه — **وصندوقان محدَّدان يمرّ منهما واحد،
 * بلا خطأ**. و`getAll` هي الصحيحة، وسقفٌ يمنع طلبا يحمل ألفا.
 */
const BULK_CAP = 25

panel.post('/panel/drafts/approve-many', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const ids = gate.form.getAll('id').map(String).filter((x) => x !== '')
  if (ids.length === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'لم تُحدَّد مسوّدة واحدة.' })
    return back('posts')
  }
  if (ids.length > BULK_CAP) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: `${ids.length} مسوّدةً في طلب واحد — والسقف ${BULK_CAP}. اعتمدها على دفعات.`,
    })
    return back('posts')
  }

  const result = await approveMany(
    c.env.DB, activeOrg(gate.session.record),
    ids,
    gate.session.record.via === 'passkey' ? 'panel:passkey' : 'panel:token',
  )

  // **والمتعثّرُ يُسمَّى بسببه**: حصيلةٌ تقول «فشل بعضُها» تجعل المالك
  // يعيد الكلَّ — ولا يعرف أيَّها مضى
  const flash: PanelFlash =
    result.failed.length === 0
      ? {
          kind: 'ok',
          text: `اعتُمدت ${result.done.length} مسوّدةً كما كُتبت — اختر لكلّ حسابا وموعدا.`,
        }
      : {
          kind: result.done.length === 0 ? 'bad' : 'warn',
          text:
            `اعتُمدت ${result.done.length}، وتعثّرت ${result.failed.length}: ` +
            result.failed.map((f) => f.reason).join(' · '),
        }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.approve_many',
      detail: `${result.done.length} تمّت · ${result.failed.length} تعثّرت`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/**
 * الجدولة — **القرارُ الذي يُخرج المنشور من اللوحة إلى العالم.**
 *
 * والحارسُ في `schedulePost` لا هنا: المنصّةُ والحسابُ والموعدُ تُفحص في
 * موضعٍ واحد يشترك فيه هذا الزرّ وأيُّ منادٍ آخر. وزرٌّ في صفحةٍ ليس
 * طريقا جانبيّا حول الحارس (D-019).
 */
panel.post('/panel/drafts/schedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const now = new Date()
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const result = await schedulePost(
    c.env.DB,
    id,
    String(form.get('account') ?? ''),
    // ‏و«when» بـ UTC من شريط البطاقة، أو زرٌّ ويومٌ بتوقيت المالك من المحرّر (D-198)
    readWhen(form, zone, now),
    now,
  )

  let flash: PanelFlash = result.ok
    ? {
        kind: 'ok',
        text: `جُدولت على ${platformLabel(result.platform)} (${result.account}) ${
          ownerWhen(result.at, zone, now)}.`,
      }
    : { kind: 'bad', text: `تعذّرت الجدولة: ${result.reason}` }

  // ‏YouTube وTikTok يصلان خاصَّين (ر-4): يُقال في إشعار الجدولة، لا في صفحة المنصّة وحدها
  const scheduled = result.ok
    ? await c.env.DB.prepare('SELECT platform FROM posts WHERE id = ?').bind(id).first<{ platform: string }>()
    : null
  // ‏ويسكت حين قلب المالكُ النشرَ علنيًّا بعد الإجازة (D-190)
  const reach = scheduled === null ? null : privateReach([scheduled.platform], await reachNow(c.env.DB, activeOrg(gate.session.record)))
  if (reach !== null) flash = { ...flash, text: `${flash.text} ${reach}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.schedule',
      target: id,
      detail: result.ok ? result.at : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  // ‏المجدولةُ إلى بطاقتها وموعدُها فيها، والمردودةُ إلى نموذجها حيث يُصلَح ما رُدّ
  if (fromEditor(form) && !result.ok) return toEditor(id, 'ed-when')
  return toCard(result.ok ? 'd' : 's', id)
})

/**
 * قراءةُ الفاصل والبداية — **في مكانٍ واحدٍ لا في مسارين** (D-089).
 *
 * المعاينةُ والتنفيذُ يقرآن المدخلاتِ نفسَها، **فلو قرأها كلٌّ بطريقته
 * لعُرض جدولٌ ونُفّذ غيرُه** — وهو أسوأ من ألّا تكون هناك معاينة.
 */
function readGap(raw: unknown): number {
  const value = Number(raw ?? '24')
  if (!Number.isFinite(value)) return 24
  return Math.min(GAP_MAX_HOURS, Math.max(GAP_MIN_HOURS, Math.round(value)))
}

/** بدايةٌ غيرُ مفهومةٍ تصير «بعد ساعة» — ولا تُردّ الاستمارةُ كلُّها. */
function readStart(raw: unknown, now: Date): Date {
  const text = String(raw ?? '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return new Date(now.getTime() + 3_600_000)
  const at = new Date(`${text}:00Z`)
  return Number.isNaN(at.getTime()) ? new Date(now.getTime() + 3_600_000) : at
}

/**
 * ما ينقص كلَّ معتمَدٍ من وسيط — **بالدالّة التي تحكم بها `schedulePost`** وبطاقتُه.
 * فالمعاينةُ تقول «TikTok تحتاج مقطعًا» بجانب المنشور، ولا تَعِد بخانةٍ يردّها التنفيذ.
 */
async function lackingOf(db: Env['DB'], drafts: readonly { id: string; platform: string; status: string }[]): Promise<Map<string, string>> {
  const approved = drafts.filter((d) => d.status === 'approved' || d.status === 'edited')
  const media = await mediaFor(db, approved.map((d) => d.id))
  const out = new Map<string, string>()
  for (const d of approved) {
    const why = missingMedia(d.platform, media.filter((m) => m.postId === d.id && m.status === 'ready').map((m) => m.mime))
    if (why !== null) out.set(d.id, why)
  }
  return out
}

/**
 * توزيعُ المعتمَد — **معاينةٌ أوّلا** (D-089).
 *
 * ولا يكتب هذا المسارُ شيئا. يقرأ ويحسب ويعرض، **والتنفيذُ في مسارٍ
 * ثانٍ يضغطه المالكُ بعد أن يرى**. ومسارٌ يفعل الاثنين يجعل زرَّ
 * «وزّع» يجدول عشرةَ منشوراتٍ بضغطةٍ واحدةٍ بلا أن يُقرأ جدول.
 */
panel.post('/panel/drafts/spread', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const drafts = await listDrafts(c.env.DB, activeOrg(gate.session.record), BOARD)
  const accounts = await listAccounts(c.env.DB, activeOrg(gate.session.record))
  const targets = accounts
    .filter((a) => a.status === 'active' && !isLinkedInPage(a))
    .map((a) => ({ id: a.id, platform: a.platform, label: a.displayName }))

  const now = new Date()
  const gap = readGap(gate.form.get('gap'))
  const lacking = await lackingOf(c.env.DB, drafts)
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const plan = planSpread(
    drafts.map((d) => ({ id: d.id, platform: d.platform, status: d.status, text: d.text, lacking: lacking.get(d.id) ?? null })),
    targets,
    // ‏وأوّلُ موعدٍ بتوقيت المالك من اللوحة (`local`، D-199)، أو `start` بـ UTC كما يُرسله شريطُ الشاشة
    readStart(readWhen(gate.form, zone, now) || gate.form.get('start'), now),
    gap,
    now,
  )

  const start = plan.slots[0]?.when ?? String(gate.form.get('start') ?? '')
  return page((nonce) =>
    soloPage('صدى — توزيع المعتمَد', { href: '/panel', label: 'اللوحة' }, spreadScreen({ plan, start, gap, csrf: gate.session.record.csrf, zone }), nonce, '',
      buildCommands({ onPanel: false }), soloNav('posts')),
  )
})

/**
 * تنفيذُ التوزيع — **بـ `schedulePost` واحدةً واحدة**.
 *
 * لا كتابةَ `queued` من هنا: الحارسُ الذي يمنع الجدولةَ إلى قناةٍ إذنُها
 * منتهٍ، أو إلى موعدٍ مضى، أو من منصّةٍ إلى أخرى — **كلُّه في تلك
 * الدالّة**. ومسارٌ ثانٍ ينسخه ينسى شرطا (D-019).
 *
 * **والوجهةُ تُحسَب هنا ولا تُقرأ من النموذج**: معرّفُ حسابٍ يأتي من
 * الصفحة يُصدَّق بلا فحص. فالمعرّفاتُ وحدَها تُقرأ منها — أي **ما عُرض**
 * — والوجهةُ والموعدُ يُحسبان من المدخلات نفسِها.
 */
panel.post('/panel/drafts/spread/apply', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const wanted = gate.form.getAll('post').map(String)
  const now = new Date()
  const gap = readGap(gate.form.get('gap'))

  const drafts = await listDrafts(c.env.DB, activeOrg(gate.session.record), BOARD)
  const accounts = await listAccounts(c.env.DB, activeOrg(gate.session.record))
  const targets = accounts
    .filter((a) => a.status === 'active' && !isLinkedInPage(a))
    .map((a) => ({ id: a.id, platform: a.platform, label: a.displayName }))

  // **وما لم يُعرَض لا يُنفَّذ**: القائمةُ تُقصر على ما حمله النموذج
  // بترتيبه، فمسوّدةٌ اعتُمدت بين المعاينة والتنفيذ لا تدخل خِلسة
  const wantedSet = new Set(wanted)
  const lacking = await lackingOf(c.env.DB, drafts)
  const plan = planSpread(
    drafts
      .filter((d) => wantedSet.has(d.id))
      .sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id))
      .map((d) => ({ id: d.id, platform: d.platform, status: d.status, text: d.text, lacking: lacking.get(d.id) ?? null })),
    targets,
    readStart(gate.form.get('start'), now),
    gap,
    now,
  )

  let done = 0
  let first: string | null = null
  const failed: string[] = []
  for (const slot of plan.slots) {
    const result = await schedulePost(c.env.DB, slot.postId, slot.accountId, slot.when, new Date())
    if (result.ok) {
      done += 1
      first ??= result.at
    } else failed.push(result.reason)
  }

  // ‏والعددُ بمعدوده (الخطّة 8.3)، وأوّلُ موعدٍ بتوقيت المالك لا بـ UTC (8.2)
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const said = first === null
    ? ''
    : done === 1
      ? `جُدول منشور واحد: ${ownerWhen(first, zone, now)}.`
      : `جُدول ${counted(done, NOUNS.post)}، أوّلُها ${ownerWhen(first, zone, now)}.`
  const missing = wanted.length - plan.slots.length
  const flash: PanelFlash =
    done === 0
      ? { kind: 'bad', text: `لم يُجدوَل شيء. ${failed[0] ?? 'لم تعد أيّ مسوّدة صالحةً للجدولة.'}` }
      : failed.length === 0 && missing === 0
        ? { kind: 'ok', text: said }
        : {
            kind: 'warn',
            text:
              `${said} ` +
              (missing > 0 ? `و${missing === 1 ? 'واحدة لم تعد صالحة' : `${missing} لم تعد صالحةً`} للجدولة. ` : '') +
              (failed.length > 0 ? `وردّ ${failed.length}: ${failed[0]}` : ''),
          }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'draft.spread', target: String(wanted.length), detail: `done:${done}` },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/** سحبُ الموعد — قبل مغادرة الرسالة وحده. */
panel.post('/panel/drafts/unschedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await unschedule(c.env.DB, id)

  const flash: PanelFlash = result.ok
    ? { kind: 'ok', text: 'سُحب الموعد — وتبقى معتمَدةً تنتظر موعدا جديدا.' }
    : { kind: 'bad', text: `تعذّر السحب: ${result.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.unschedule',
      target: id,
      detail: result.ok ? 'withdrawn' : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  const to = backTo(gate.form.get('return'), '')
  // ‏ومن اللوحة: المسحوبةُ إلى نموذج جدولتها — وهو ما يحتاجه من سحب ليغيّر الموعد
  if (to !== '') return new Response(null, { status: 303, headers: { Location: to } })
  return toCard(result.ok ? 's' : 'd', id)
})

/**
 * «غيّر الموعد» من المحرّر (D-198) — **الموعدُ وحدَه، بلا سحبٍ وجدولةٍ من جديد** (`reschedulePost`).
 * والموعدُ من النموذج كما في «اعتمد وجدوِل» (`readWhen`): زرٌّ بتوقيت المالك، أو يومٌ وساعة.
 */
panel.post('/panel/drafts/reschedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form
  const id = String(form.get('id') ?? '')
  const now = new Date()
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const result = await reschedulePost(c.env.DB, id, readWhen(form, zone, now), now)
  await record(c.env.DB, {
    actor: 'panel', action: 'draft.reschedule', target: id, detail: result.ok ? result.at : `refused:${result.reason}`,
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: `تغيّر الموعد: ${platformLabel(result.platform)}${result.account === '' ? '' : ` (${result.account})`} ${ownerWhen(result.at, zone, now)}.` }
    : { kind: 'bad', text: `لم يتغيّر الموعد: ${result.reason}` })
  // ‏ومن سحبٍ في الخطّ الزمنيّ (D-233) يعود إليه بنافذته نفسِها، نجح أو رُدّ، فيُقرأ الإشعارُ حيث سُحب
  const back = String(form.get('back') ?? '')
  if (form.get('from') === 'timeline' && /^\/panel\/timeline(\?[a-z0-9=&-]*)?$/.test(back)) return c.redirect(back, 303)
  return result.ok ? toCard('d', id) : toEditor(id, 'ed-when')
})

/**
 * إعادةُ الفاشل أو العالق إلى «معتمَد» — والحارسُ في `requeue` لا هنا.
 *
 * **وعند النجاح يذهب المالكُ إلى نموذج جدولته في المنشورات أيًّا كان مصدرُ الطلب**:
 * صار معتمَدًا ينتظر موعدًا، ولا حقلَ موعدٍ في صفحة المنصّة. كان `return` يتقدّم
 * فيعود إلى صفحةٍ يقول إشعارُها «اختر له موعدًا» ولا موعدَ فيها (رحلة R-8).
 * وعند الردّ يعود إلى حيث كان، فيقرأ السببَ بجانب ما ضغط.
 *
 * ‏**إلّا منشورًا خارجَ النافذة** (مراجعة ر-8): «فشل قبل أسبوعٍ فأكثر» في صفحة المنصّة يُري
 * ‏منشوراتٍ لا ترسمها اللوحة، والنزولُ إلى بطاقةٍ لم تُرسَم يرتدّ إلى الرئيسيّة. فيعود إلى
 * ‏`return` كما كان قبل R-8 — وتبويبُ «تنتظر» يُريه معتمَدًا بلا موعد — وبلا `return` إلى رحلته.
 */
panel.post('/panel/drafts/requeue', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await requeue(c.env.DB, id, new Date())

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.requeue',
      target: id,
      detail: result.ok ? 'requeued' : `refused:${result.reason}`.slice(0, 200),
    },
    c.req.raw,
  )
  const to = backTo(gate.form.get('return'), '')
  const card = result.ok && (await onBoard(c.env.DB, activeOrg(gate.session.record), id))
  // ‏ورحلةُ المنشور لا تقرأ الإشعار: لا يُكتب لها فيظهر بعدها في غير موضعه — وحالُه فيها «معتمَد»
  if (result.ok && !card && to === '') return toJourney(id)
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: 'عاد معتمَدًا بنصّه كما هو — اختر له موعدًا جديدًا.' }
    : { kind: 'bad', text: `تعذّرت الإعادة: ${result.reason}` })
  if (card) return toCard('s', id)
  if (to !== '') return new Response(null, { status: 303, headers: { Location: to } })
  return toCard('d', id)
})

// ── مقاطعُ المالك (D-180) ─────────────────────────────────────────────
//
// أربعُ خطوات: «ابدأ» يفحص النوعَ والحجمَ ويفتح رفعًا متعدّدًا، و«قطعة» تدفع ‏20MB،
// و«أكمل» يجمعها، و«انشره» يصنع منشورًا لكلّ منصّة. والثلاثُ الأولى من سكربت اللوحة
// بنموذجٍ يحمل `_csrf` كأيّ نموذج — فتمرّ من `guardPost` نفسِه، ولا حارسَ ثانٍ يُكتب.

const numberOr = (value: string | File | null): number | null => {
  const n = Number(value)
  return value === null || value === '' || !Number.isFinite(n) ? null : n
}

panel.post('/panel/uploads/start', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const result = await startUpload(c.env.DB, activeOrg(gate.session.record), c.env.MEDIA, {
    name: String(f.get('name') ?? ''),
    mime: String(f.get('mime') ?? ''),
    bytes: Number(f.get('bytes')),
    width: numberOr(f.get('width')),
    height: numberOr(f.get('height')),
    durationMs: numberOr(f.get('duration_ms')),
  })
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.start', target: result.ok ? result.id : null,
    detail: result.ok ? `${String(f.get('mime'))} · ${String(f.get('bytes'))}` : `refused:${result.reason}`.slice(0, 200),
  }, c.req.raw)
  return Response.json(result, { status: result.ok ? 200 : 400 })
})

panel.post('/panel/uploads/:id/part', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const chunk = gate.form.get('chunk')
  if (!(chunk instanceof Blob)) return Response.json({ ok: false, reason: 'قطعة بلا بايتات' }, { status: 400 })
  const result = await uploadPart(c.env.DB, c.env.MEDIA, c.req.param('id'), Number(gate.form.get('n')),
    await chunk.arrayBuffer())
  return Response.json(result, { status: result.ok ? 200 : 400 })
})

panel.post('/panel/uploads/:id/complete', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  let parts: { partNumber: number; etag: string }[] = []
  try {
    const raw = JSON.parse(String(gate.form.get('parts') ?? '[]')) as unknown
    if (Array.isArray(raw)) {
      parts = raw.map((p) => ({ partNumber: Number((p as { partNumber?: unknown }).partNumber), etag: String((p as { etag?: unknown }).etag ?? '') }))
    }
  } catch {
    parts = []
  }
  const id = c.req.param('id')
  const result = await completeUpload(c.env.DB, c.env.MEDIA, id, parts)
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.complete', target: id,
    detail: result.ok ? `${parts.length} parts` : `refused:${result.reason}`.slice(0, 200),
  }, c.req.raw)
  if (result.ok) await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'رُفع المقطع — اكتب نصَّه واختر منصّاته تحته.' })
  return Response.json(result, { status: result.ok ? 200 : 400 })
})

panel.post('/panel/uploads/:id/abort', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  await abortUpload(c.env.DB, c.env.MEDIA, c.req.param('id'))
  // ‏زرُّ «ألغِ» في المكتبة نموذجٌ لا `fetch` (D-182): يعود إلى «فيديوهاتك» برسالته
  if (gate.form.get('from') === 'library') {
    await record(c.env.DB, { actor: 'panel', action: 'upload.abort', target: c.req.param('id') }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُلغي الرفع الذي انقطع — ارفع المقطع من جديد.' })
    return back('videos')
  }
  return Response.json({ ok: true })
})

/**
 * «اكتب النصوص» من صفّ المقطع (D-190) — **نداءٌ واحدٌ بضغطة المالك**، بحرّاس الكتابة كلِّها
 * (`captionsFor` ← `writeOnce`)، والكلفةُ في الدفتر قبل أن تُعرَض النصوص. ولا يُنشأ منشور:
 * تُحفظ النصوصُ يومًا في KV وتُرسم في حقولٍ يحرّرها، ثمّ «أنشئ المنشورات» كما كان.
 */
panel.post('/panel/uploads/:id/captions', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = c.req.param('id')
  const out = await captionsFor(
    {
      db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY, kv: c.env.KV,
      workerSecrets: c.env as unknown as Record<string, string | undefined>,
    },
    id,
    String(gate.form.get('about') ?? ''),
    // ‏«أعد كتابتها» تحمل `at` النصوص التي على الشاشة: تُكتب من جديد مرّةً، وإعادتُها لا تُكلّف
    String(gate.form.get('replace') ?? ''),
  )
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.captions', target: id,
    detail: out.kind === 'written' ? `written · ${money(out.captions.cost)}` : out.kind === 'already' ? 'already' : `${out.kind}:${out.reason}`.slice(0, 200),
  }, c.req.raw)
  const flash: PanelFlash = out.kind === 'written'
    ? {
        kind: Object.keys(captionIssues(out.captions)).length === 0 ? 'ok' : 'warn',
        text: `كُتبت نصوص YouTube وTikTok وInstagram — الكلفة ${money(out.captions.cost)}. راجعها تحت المقطع ثمّ «أنشئ المنشورات».${
          Object.keys(captionIssues(out.captions)).length === 0 ? '' : ' وفي بعضها ما يُصلَح قبل الإنشاء — والسبب تحت حقله.'}`,
      }
    : out.kind === 'already'
      ? { kind: 'ok', text: 'النصوص من هذا الوصف مكتوبة وهي هذه — لم يُنفَق شيء. ولنصوص أخرى «أعد كتابتها» من صفّ المقطع.' }
      : out.kind === 'blocked'
        ? { kind: 'warn', text: out.reason }
        // ‏وما دُفع في المحاولة المردودة يُقال: «تعذّرت» وحدَها تُري أقلَّ ممّا أُنفق
        : {
            kind: 'bad',
            text: `تعذّرت كتابة النصوص: ${out.reason}${out.cost === undefined
              ? ''
              : ` — وكلّفت المحاولة ${money(out.cost)}، والإعادة تدفع ثانيةً`}`,
          }
  await setFlash(c.env, c.req.raw, flash)
  return back(/^[0-9a-f-]{8,}$/.test(id) ? `v-${id}` : 'videos')
})

panel.post('/panel/uploads/:id/posts', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = c.req.param('id')
  const form = gate.form
  /*
   * ‏**نصٌّ لكلّ منصّةٍ حين كُتبت النصوص** (D-190): الحقولُ الأربعةُ من صفّ المقطع، وما لم
   * ‏يُرسَم منها (منصّةٌ أُنشئ منشورُها) يبقى بما حُفظ. ونموذجٌ قديمٌ بلا `per_platform` يمرّ
   * ‏بنصّه الواحد كما كان.
   */
  const perPlatform = form.get('per_platform') === '1'
  const cached = perPlatform ? await readCaptions(c.env.KV, id) : null
  /*
   * ‏**ومَن كتبها يصل مع النموذج** (D-190): الحقولُ لكلّ منصّةٍ لا تُرسم إلّا لنصوصٍ كتبها
   * ‏النموذج، فإن انتهى يومُها في KV أو سقطت قراءتُها لم تصر نصوصَ المالك. فالمحفوظُ أوّلًا،
   * ‏ثمّ اسمُ النموذج المرسوم مع الحقول بنمطٍ ضيّق، وإلّا علامةٌ تقول «آليٌّ مجهولُ المصدر».
   */
  const sent = String(form.get('caption_model') ?? '')
  const model = cached?.model
    ?? (!perPlatform ? undefined : /^[\w.:/-]{1,80}$/.test(sent) && sent !== 'owner' ? sent : 'captions:unknown')
  const pick = (name: string, prev: string): string => {
    const v = form.get(name)
    return v === null ? prev : String(v)
  }
  const texts = {
    youtubeTitle: pick('title_youtube', cached?.youtubeTitle ?? ''),
    youtubeDescription: pick('caption_youtube', cached?.youtubeDescription ?? ''),
    tiktok: pick('caption_tiktok', cached?.tiktok ?? ''),
    instagram: pick('caption_instagram', cached?.instagram ?? ''),
  }
  const result = await postsFromUpload(c.env.DB, {
    uploadId: id,
    platforms: form.getAll('platform').map(String),
    ...(perPlatform
      ? {
          captions: { youtube: texts.youtubeDescription, tiktok: texts.tiktok, instagram: texts.instagram },
          title: texts.youtubeTitle,
        }
      : { caption: String(form.get('caption') ?? '') }),
    approve: form.get('approve') === 'on',
    by: gate.session.record.via === 'passkey' ? 'panel:passkey' : 'panel:token',
    // ‏مَن كتبها: النموذجُ وراجعها المالك — فيُقرأ في رحلة المنشور
    ...(model === undefined ? {} : { model }),
    /*
     * ‏**وحصّتُه من كلفة الكتابة** (D-190): نداءٌ واحدٌ كتب للمنصّات الثلاث، فلكلّ منشورٍ ثلثُه
     * ‏في `cost_usd` — كمسوّدة المصدر والفكرة — والدفترُ باسم المقطع فلا يُعَدّ مرّتين. كان
     * ‏`0` بجانب اسم النموذج في محطّة «كُتبت المسوّدة»، وكلفتُها لا تُرى إلّا في مجموع اليوم.
     */
    ...(cached === null ? {} : { cost: cached.cost / VIDEO_PLATFORMS.length }),
  })
  /*
   * ‏وما حرّره المالكُ يبقى في حقوله: إنشاءٌ رُدّ لا يُعيده إلى ما كُتب له — **ولو انتهى يومُ
   * ‏المحفوظ**: كان الحفظُ مشروطًا به، فيعود الصفُّ إلى مربّعٍ واحدٍ فارغ وتضيع الحقولُ الأربعة.
   */
  if (perPlatform) {
    try {
      await saveCaptions(c.env.KV, id, cached !== null
        ? { ...cached, ...texts }
        : { about: '', ...texts, model: model ?? 'captions:unknown', cost: 0, at: new Date().toISOString() })
    } catch (error) {
      // ‏المنشوراتُ كُتبت أو رُدّت بسببها — وحفظُ الحقول تحسينٌ لا يُسقط الإشعار
      console.error({ job: 'upload.posts', captions_save_failed: String(error).slice(0, 200) })
    }
  }
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.posts', target: id,
    detail: result.ok ? `created:${result.created.join(',')} skipped:${result.skipped.join(',')}` : `refused:${result.reason}`.slice(0, 200),
  }, c.req.raw)
  const label = (p: string): string => platformLabel(p)
  /*
   * ‏**وموعدُ «متى؟» مع الاعتماد وحدَه** (D-218): ما أُنشئ الآن معتمَدًا يُجدوَل بـ`scheduleFromUpload`
   * ‏نفسِها التي تجدول من صفّ المقطع، مقصورةً على منصّات هذا الإنشاء.
   */
  const now = new Date()
  const zone = validZone(String(form.get('tz') ?? '')) ?? await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const at = result.ok && result.created.length > 0 && form.get('approve') === 'on'
    ? presetAt(String(form.get('preset') ?? ''), now, zone)
    : null
  const planned = at === null ? null : await scheduleFromUpload(c.env.DB, {
    uploadId: id,
    shown: (await c.env.DB
      .prepare(`SELECT p.id, p.platform FROM media m JOIN posts p ON p.id = m.post_id WHERE m.upload_id = ?`)
      .bind(id).all<{ id: string; platform: string }>()).results
      .filter((r) => (result.ok ? result.created as readonly string[] : []).includes(r.platform)).map((r) => r.id),
    accounts: await listAccounts(c.env.DB, activeOrg(gate.session.record)),
    at,
    now,
  })
  const plannedReach = planned === null ? null : privateReach(planned.scheduled, await reachNow(c.env.DB, activeOrg(gate.session.record)))
  if (planned !== null) {
    await record(c.env.DB, {
      actor: 'panel', action: 'upload.schedule', target: id,
      detail: `scheduled:${planned.scheduled.join(',')} failed:${planned.failed.length}`,
    }, c.req.raw)
  }
  // ‏عنوانُ YouTube فوق حدّه يُقصّ عند الرفع (ر-4): يُقال الآن بما سيُرفع، لا يُكتشف في القناة
  const cut = result.ok && !perPlatform && result.created.includes('youtube') ? cutTitle(String(form.get('caption') ?? '')) : null
  // ‏ومنصّةٌ غيرُ متّصلةٍ يُنشأ منشورُها ولا يُجدوَل: يُقال الآن لا عند الجدولة (D-190)
  const links = result.ok ? linkStates(await listAccounts(c.env.DB, activeOrg(gate.session.record))) : {}
  const unlinked = result.ok ? result.created.filter((p) => links[p] !== 'linked') : []
  await setFlash(c.env, c.req.raw, !result.ok
    ? { kind: 'bad', text: `لم يُنشأ منشور: ${result.reason}` }
    : result.created.length === 0
      ? { kind: 'bad', text: `موجود من قبل على ${result.skipped.map(label).join(' و')} — لا يُكرَّر.` }
      : {
          kind: cut === null && unlinked.length === 0 && (planned === null || planned.failed.length === 0) ? 'ok' : 'warn',
          text: `أُنشئ على ${result.created.map(label).join(' و')}${planned !== null && at !== null && planned.scheduled.length > 0
            ? ` وجُدول ${momentLabel(at, zone, now)}${zoneNote(zone)}.${planned.failed.length === 0 ? '' : ` وتعذّرت جدولة ${planned.failed.map((f) => `${label(f.platform)}: ${f.reason}`).join('؛ ')}.`}${plannedReach === null ? '' : ` ${plannedReach}`}`
            : form.get('approve') === 'on'
              ? ' معتمَدًا — جدوِله تحت المقطع بموعد واحد، أو من بطاقة كلّ.'
              : ' مسوّدةً تنتظر اعتمادك.'}${cut === null
            ? ''
            : ` وعنوان YouTube أطول ممّا تقبله فيُرفع مقصوصًا: «${cut}».`}${unlinked.length === 0 || planned !== null
            ? ''
            : ` ولا حساب متّصلًا على ${unlinked.map(label).join(' و')}: لا يُجدوَل حتّى تربطه.`}`,
        })
  // ‏ويعود إلى صفّ المقطع نفسِه: عليه روابطُ منشوراته وزرُّ جدولتها
  return back(/^[0-9a-f-]{8,}$/.test(id) ? `v-${id}` : 'videos')
})

/**
 * «جدوِل منشوراتِه معًا» من صفّ المقطع (ر-4) — **الموعدُ يُحسب هنا بتوقيت المالك** من
 * كعكة `sada_tz` (D-173)، والجدولةُ من `schedulePost` لكلّ منشورٍ في `scheduleFromUpload`
 * (D-019). ولا طلبَ خارجيَّ ولا كلفة: الطابورُ يخرج بها في موعدها بمفاتيحها (D-004).
 */
panel.post('/panel/uploads/:id/schedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = c.req.param('id')
  const now = new Date()
  // ‏بالمنطقة التي قالها السطرُ فوق الأزرار (D-202)، وإلّا منطقةُ المالك
  const zone = validZone(String(gate.form.get('tz') ?? '')) ?? await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const at = presetAt(String(gate.form.get('preset') ?? ''), now, zone)
  const result = at === null ? null : await scheduleFromUpload(c.env.DB, {
    uploadId: id,
    shown: gate.form.getAll('post').map(String),
    accounts: await listAccounts(c.env.DB, activeOrg(gate.session.record)),
    at,
    now,
  })
  const names = (list: readonly string[]): string => [...new Set(list)].map((p) => platformLabel(p)).join(' و')
  const failed = result === null ? '' : result.failed.map((f) => `${platformLabel(f.platform)}: ${f.reason}`).join('؛ ')
  const reach = result === null ? null : privateReach(result.scheduled, await reachNow(c.env.DB, activeOrg(gate.session.record)))
  const flash: PanelFlash = at === null || result === null
    ? { kind: 'bad', text: 'لم يُجدوَل شيء: موعد لا أعرفه — اختر أحد أزرار الموعد.' }
    : result.scheduled.length === 0
      ? { kind: 'bad', text: `لم يُجدوَل شيء. ${failed === '' ? 'لا منشور معتمَدًا بلا موعد من هذا المقطع الآن.' : `تعذّر ${failed}.`}` }
      : {
          kind: result.failed.length === 0 ? 'ok' : 'warn',
          text: `جُدول على ${names(result.scheduled)} ${momentLabel(at, zone, now)}${zoneNote(zone)}.`
            + (failed === '' ? '' : ` وتعذّر ${failed}.`)
            + (reach === null ? '' : ` ${reach}`),
        }
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.schedule', target: id,
    detail: result === null ? 'refused:preset' : `scheduled:${result.scheduled.join(',')} failed:${result.failed.length}`,
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, flash)
  return back(/^[0-9a-f-]{8,}$/.test(id) ? `v-${id}` : 'videos')
})

// ── خطّتُك من ملفّ (D-181) ────────────────────────────────────────────
//
// ثلاثُ خطوات: «اقرأ» يحفظ الملفَّ في KV ساعتين ويفتح معاينته، والمعاينةُ تقرؤه من
// جديد بحقائق اللحظة (الحساباتُ والمقاطعُ والآن)، و«اعتمد وجدوِل» يقرؤه مرّةً ثالثة
// ثمّ يمرّر سليمَه من حرّاس الجدولة. **فما يُجدوَل ما رآه المالكُ بحاله ساعةَ الضغط**،
// لا صورةً منه خُزّنت قبل أن يسقط حسابٌ أو يمضي موعد.

const PLAN_TTL = 2 * 60 * 60

async function planFacts(env: Env, org: string, cookie: string | null, now: Date): Promise<PlanFacts> {
  const { results: scheduled } = await env.DB
    .prepare(`SELECT platform, text, scheduled_at AS at FROM posts WHERE status = 'queued' AND scheduled_at IS NOT NULL LIMIT 1000`)
    .all<{ platform: string; text: string; at: string }>()
  return {
    accounts: await listAccounts(env.DB, org),
    uploads: await listUploads(env.DB, 200),
    now,
    zone: (await ownerZone(env.DB, cookie)) ?? DEFAULT_ZONE,
    publishable: new Set(CHANNELS.filter((c) => c.stage === 'publish').map((c) => c.id)),
    scheduled,
  }
}

panel.get('/panel/plan-import/template.csv', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  return new Response(PLAN_TEMPLATE, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sada-plan.csv"',
      'Cache-Control': 'no-store',
    },
  })
})

panel.post('/panel/plan-import', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const file = gate.form.get('file')
  if (!(file instanceof Blob) || file.size === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لم يصل ملفّ — اختر ملفّ CSV ثمّ «اقرأ الخطّة».' })
    return back('plan-import')
  }
  if (file.size > MAX_PLAN_BYTES) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: `الملفّ أكبر من ${MAX_PLAN_BYTES / 1024}KB — قسّمه ملفّين.` })
    return back('plan-import')
  }
  /*
   * **UTF-8 أو لا شيء** (D-182). «CSV (Comma delimited)» في Excel العربيّ يحفظ بـ Windows-1256،
   * و`file.text()` يقلب كلَّ حرفٍ عربيٍّ إلى U+FFFD بصمت — فيُعرض الصفُّ «جاهزًا» ونصُّه علاماتُ
   * استفهام. ففكٌّ صارمٌ يردّ الملفَّ باسم الصيغة التي تُصلحه.
   */
  let csv: string
  try {
    csv = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(await file.arrayBuffer())
  } catch {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: 'الملفّ ليس UTF-8 — احفظه من Excel بصيغة «CSV UTF-8 (Comma delimited)»، أو نزّله من Google Sheets بصيغة CSV، ثمّ ارفعه.',
    })
    return back('plan-import')
  }
  const id = crypto.randomUUID()
  await c.env.KV.put(`plan-import:${id}`, csv, { expirationTtl: PLAN_TTL })
  await record(c.env.DB, { actor: 'panel', action: 'plan.import.read', target: id, detail: `${file.size} bytes` }, c.req.raw)
  return new Response(null, { status: 303, headers: { Location: `/panel/plan-import/${id}` } })
})

panel.get('/panel/plan-import/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const id = c.req.param('id')
  const csv = await c.env.KV.get(`plan-import:${id}`)
  if (csv === null) {
    // ‏معاينةٌ تُركت مفتوحةً أكثرَ من ساعتين ثمّ حُدّثت: صفحةٌ بالرافدة وطريقٍ إلى الرفع، لا نصٌّ خامّ (7.11)
    return page((nonce) =>
      soloPage('صدى — معاينة الخطّة', { href: panelHref('plan-import'), label: 'المنشورات' },
        planImportExpired(), nonce, '', buildCommands({ onPanel: false }), soloNav('posts')), 404)
  }
  const read = readPlan(csv, await planFacts(c.env, activeOrg(session.record), c.req.header('Cookie') ?? null, new Date()))
  const reach = await reachNow(c.env.DB, activeOrg(session.record))
  // ‏«بتوقيت الرياض» حين لا منطقةَ عُرفت: هي ما قرأ به `planFacts` الأيّامَ (D-202)
  const fallback = (await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)) === null
  return page((nonce) =>
    soloPage('صدى — معاينة الخطّة', { href: panelHref('plan-import'), label: 'المنشورات' },
      injectCsrf(planImportScreen(id, read, new Date(), reach, fallback), session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('posts')),
  )
})

panel.post('/panel/plan-import/:id/approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = c.req.param('id')
  const csv = await c.env.KV.get(`plan-import:${id}`)
  if (csv === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'انتهت مهلة المعاينة — ارفع الملفّ من جديد.' })
    return back('plan-import')
  }
  const now = new Date()
  const read = readPlan(csv, await planFacts(c.env, activeOrg(gate.session.record), c.req.header('Cookie') ?? null, now))
  const by = gate.session.record.via === 'passkey' ? 'panel:passkey' : 'panel:token'
  // ‏ما عرضته المعاينةُ جاهزًا وحده (D-182) — والزرُّ وعدَ بعدده
  const shown = new Set(String(gate.form.get('lines') ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 1))
  if (shown.size === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'هذه المعاينة قديمة — افتحها من جديد ثمّ اعتمد.' })
    return new Response(null, { status: 303, headers: { Location: `/panel/plan-import/${id}` } })
  }
  const outcomes = await applyPlan(c.env.DB, read.rows, by, now, shown)
  // ‏المعاينةُ استُهلكت: ضغطةٌ ثانيةٌ على «اعتمد» من نافذةٍ قديمةٍ لا تجد ما تعيده
  await c.env.KV.delete(`plan-import:${id}`)
  const scheduled = outcomes.filter((o) => o.result === 'scheduled').length
  const exists = outcomes.filter((o) => o.result === 'exists').length
  const failed = outcomes.filter((o) => o.result === 'failed')
  await record(c.env.DB, {
    actor: 'panel', action: 'plan.import.approve', target: id,
    detail: `scheduled:${scheduled} exists:${exists} failed:${failed.length} blocked:${read.rows.length - outcomes.length}`,
  }, c.req.raw)
  // ‏كلُّ صفٍّ لم يُجدوَل يُسمّى بسطره وسببه — ثلاثةٌ أوّلًا، فالرسالةُ تُقرأ لا تُمرَّر
  const named = (list: readonly { line: number; reason?: string }[]): string =>
    list.slice(0, 3).map((o) => `السطر ${o.line} (${o.reason ?? ''})`).join('، ') + (list.length > 3 ? ' وغيرُها' : '')
  const existing = outcomes.filter((o) => o.result === 'exists')
  const parts = [
    scheduled === 0 ? '' : scheduled === 1 ? 'جُدول منشور واحد في موعده' : `جُدول ${counted(scheduled, NOUNS.post)} كلّ في موعده`,
    exists > 0 ? `ولم يُكرَّر ما كان موجودًا: ${named(existing)}` : '',
    failed.length > 0 ? `وتعذّر ${counted(failed.length, NOUNS.row)}: ${named(failed)}` : '',
  ].filter((p) => p !== '')
  await setFlash(c.env, c.req.raw, {
    kind: scheduled > 0 && failed.length === 0 ? 'ok' : 'bad',
    text: parts.length === 0 ? 'لا صفّ جاهزًا في الملفّ — لم يُجدوَل شيء.' : `${parts.join('، ')}.`,
  })
  return back('posts')
})

// ── إدارة المزوّدين ──────────────────────────────────────────────────

/**
 * حارسُ أفعال المزوّدين: البوّابةُ الموحّدة، ثمّ وجودُ المزوّد.
 *
 * يبني على `guardPost` ولا ينسخه: فحصُ الجلسة و CSRF يبقى في موضعٍ واحد.
 */
async function providerGuard(
  c: { env: Env; req: { raw: Request; formData: () => Promise<FormData> } },
): Promise<{ denied: Response } | { provider: Provider; form: FormData; session: Session }> {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate

  const provider = await getProvider(c.env.DB, String(gate.form.get('provider') ?? ''))
  if (provider === null) {
    return { denied: Response.json({ error: 'unknown_provider' }, { status: 400 }) }
  }
  return { provider, form: gate.form, session: gate.session }
}

function num(form: FormData, field: string): number | null {
  const raw = String(form.get(field) ?? '').trim()
  if (raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * إضافة مزوّد — أو تعديل بياناته.
 *
 * والعنوان يمرّ بحارسه: الخادم سيرسل **مفتاح المالك ونصّ مستنداته** إلى
 * ما كُتب، فعنوانٌ داخليّ أو `http` يُرفض قبل أن يُحفظ.
 */
panel.post('/panel/providers/add', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const name = normalizeName(String(form.get('name') ?? ''))
  if (name === null) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: 'الاسم يجب أن يبدأ بحرف لاتينيّ ويحوي حروفا صغيرة وأرقاما وشرطة (مثل deepseek).',
    })
    return back('providers')
  }

  const existing = await getProvider(c.env.DB, name)
  const label = String(form.get('label') ?? '').trim() || name
  const model = String(form.get('model') ?? '').trim()
  const rawUrl = String(form.get('base_url') ?? '')

  // المدمَج لا يُبدَّل عنوانه: عنوانه في الشيفرة
  let baseUrl: string | null = existing?.baseUrl ?? null
  if (existing === null || !existing.builtin) {
    const verdict = checkProviderUrl(rawUrl)
    if (!verdict.ok) {
      await setFlash(c.env, c.req.raw, { kind: 'bad', text: `العنوان مرفوض: ${verdict.reason}` })
      return back('providers')
    }
    baseUrl = verdict.url
  }

  await upsertProvider(
    c.env.DB,
    {
      name,
      label,
      kind: existing?.kind ?? 'openai_compat',
      baseUrl,
      model: model === '' ? (existing?.model ?? null) : model,
      priceIn: num(form, 'price_in'),
      priceOut: num(form, 'price_out'),
      dailyCap: num(form, 'daily_cap'),
    },
    'panel',
  )

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.upsert',
      target: name,
      detail: existing === null ? 'جديد' : 'تعديل',
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: 'ok',
    text: existing === null
      ? `أُضيف ${label}. ضع مفتاحه ثمّ اختبره.`
      : `حُدّثت بيانات ${label}.`,
  })
  return back('providers')
})

panel.post('/panel/providers/key', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied
  const form = guard.form

  const raw = String(form.get('key') ?? '')
  if (raw.trim().length === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'المفتاح فارغ — لم يُحفظ شيء.' })
    return back('providers')
  }
  if (c.env.TOKEN_ENC_KEY.length === 0) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: 'TOKEN_ENC_KEY غير مضبوط — والخزانة لا تعمل بلا مفتاح تشفير.',
    })
    return back('providers')
  }

  try {
    const result = await saveKey(c.env.DB, c.env.TOKEN_ENC_KEY, guard.provider.name, raw, 'panel')
    // **ولا في السجلّ**: التلميحُ وحده — وهو أوّلُ المفتاح وآخرُه لا نصُّه
    await record(
      c.env.DB,
      {
        actor: 'panel',
        action: 'provider.key',
        target: guard.provider.name,
        detail: result.unchanged ? `لم يتغيّر (${result.hint})` : `بُدّل إلى ${result.hint}`,
      },
      c.req.raw,
    )
    // **لا يُذكر المفتاح في الإشعار** — التلميح وحده
    await setFlash(c.env, c.req.raw, {
      kind: result.unchanged ? 'ok' : 'warn',
      text: result.unchanged
        ? `${guard.provider.label}: المفتاح نفسه لم يتغيّر (${result.hint}).`
        : `${guard.provider.label}: حُفظ المفتاح ${result.hint} — اختبره قبل أن تعتمد عليه.`,
    })
  } catch (error) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: `تعذّر الحفظ: ${error instanceof Error ? error.message : 'عطل غير متوقّع'}`,
    })
  }
  return back('providers')
})

/**
 * مفتاحُ مزوّدٍ للفحص أو للفهرسة — **ومصدرُه واحدٌ لا اثنان**.
 *
 * كان يُقرأ في «اختبر» وحدَه، فلمّا وُجدت «حدّث القائمة» كان الأمرُ أن
 * يُنسَخ. والنسخُ يفترق: يُضاف مدمَجٌ إلى `BUILTIN_SECRET` فيراه أحدُهما
 * ولا يراه الآخر.
 */
async function providerKey(env: Env, provider: Provider): Promise<string | null> {
  const secretName = provider.builtin ? BUILTIN_SECRET[provider.name] : undefined
  const resolved = await resolveKey(
    env.DB,
    env.TOKEN_ENC_KEY,
    provider.name,
    secretName === undefined ? undefined : (env[secretName as keyof Env] as string | undefined),
  )
  return resolved.key
}

/**
 * فهرسُ نماذجِ مزوّد — يُجلَب من عنده لحظةَ الطلب (D-081).
 *
 * **ولا يُخزَّن**: قائمةٌ محفوظةٌ تتقادم بصمت — نموذجٌ سُحب يبقى معروضا،
 * ونموذجٌ نزل أمسِ لا يظهر. والجلبُ قراءةٌ رخيصةٌ لا تكلّف رموزا.
 *
 * وهو `POST` لا `GET` عمدا: يمرّ بحارس CSRF نفسِه الذي تمرّ به بقيّةُ
 * أفعال اللوحة — **زرٌّ في صفحةٍ ليس طريقا جانبيّا حول الحارس**.
 */
panel.post('/panel/providers/models', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied
  const provider = guard.provider

  const key = await providerKey(c.env, provider)
  if (key === null) {
    return c.json({ ok: false, detail: 'لا مفتاح لهذا المزوّد — احفظه أوّلا', models: [] })
  }

  const catalog = await listModels({
    name: provider.name,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    apiKey: key,
    builtin: provider.builtin,
  })

  // **ولا يُسجَّل هذا في `audit`**: قراءةٌ لا تغيّر شيئا، وسجلٌّ يمتلئ
  // بها يُخفي ما يُغيّر
  return c.json({
    ok: catalog.ok,
    detail: catalog.detail,
    // السعرُ يُمرَّر كما قرأناه — والشاشةُ تعرضه ولا تحفظه إلّا بضغطة
    models: catalog.models.map((m) => ({
      id: m.id,
      label: m.label,
      // ‏الاسمُ المقروء (D-203): المعرّفُ قيمةُ الخيار وتلميحُه لا نصُّه
      name: modelName(m.id),
      task: m.task,
      priceIn: m.priceIn,
      priceOut: m.priceOut,
    })),
  })
})

/** الاختبار يمرّ بلهجة المزوّد: لكلٍّ نقطةُ تحقّقها. */
panel.post('/panel/providers/verify', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied
  const provider = guard.provider

  const key = await providerKey(c.env, provider)
  if (key === null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: `${provider.label}: لا مفتاح لاختباره.` })
    return back('providers')
  }

  const result =
    provider.kind === 'anthropic'
      ? await verifyKey('anthropic', key)
      : provider.baseUrl === null
        ? { ok: false as const, detail: 'لا عنوان لهذا المزوّد', status: null }
        : await verifyCompat(provider.baseUrl, key)

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.verify',
      target: provider.name,
      detail: result.ok ? 'نجح' : `فشل — ${result.detail}`,
    },
    c.req.raw,
  )

  if (result.ok) {
    await markVerified(c.env.DB, provider.name)
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: `${provider.label}: ${result.detail}.` })
  } else {
    // لا تُمحى شهادةٌ سابقة على فشلٍ قد يكون من الخدمة لا المفتاح
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: `${provider.label}: ${result.detail}.` })
  }
  return back('providers')
})

panel.post('/panel/providers/toggle', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied
  const form = guard.form

  const enabled = String(form.get('enabled') ?? '') === 'true'
  await setEnabled(c.env.DB, guard.provider.name, enabled, 'panel')
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.toggle',
      target: guard.provider.name,
      detail: enabled ? 'فُعّل' : 'عُطّل',
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: enabled ? 'ok' : 'warn',
    text: enabled ? `${guard.provider.label}: فُعّل.` : `${guard.provider.label}: عُطّل — ومفتاحه محفوظ.`,
  })
  return back('providers')
})

panel.post('/panel/providers/delete', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied

  const removed = await deleteProvider(c.env.DB, guard.provider.name)
  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.delete',
      target: guard.provider.name,
      detail: removed ? 'حُذف' : 'مدمَج — رُفض الحذف',
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: removed ? 'warn' : 'bad',
    text: removed
      ? `${guard.provider.label}: حُذف.`
      : `${guard.provider.label}: مدمَج ولا يُحذف — عطّله بدل ذلك.`,
  })
  return back('providers')
})

/** توجيه مهمّة إلى مزوّدٍ ونموذج — قرارُ المالك لا الشيفرة. */
panel.post('/panel/routes', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const task = String(form.get('task') ?? '')
  const provider = String(form.get('provider') ?? '')
  const model = String(form.get('model') ?? '').trim()

  if (!KNOWN_TASKS.has(task)) return c.json({ error: 'unknown_task' }, 400)
  const target = await getProvider(c.env.DB, provider)
  if (target === null) {
    return c.json({ error: 'unknown_provider' }, 400)
  }
  if (model === '') {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'اسم النموذج مطلوب.' })
    return back('providers')
  }

  /*
   * **ولا يُحفَظ نموذجٌ بقي من مزوّدٍ سابق** (D-083).
   *
   * الدرجُ في المتصفّح يُفرَّغ عند التبديل، **لكنّ الشاشةَ ليست حارسا**:
   * من حفظ قبل أن يصل الجلبُ يمرّ. وتوجيهٌ لا يعمل لا يُكتشَف إلّا عند
   * أوّل نداءٍ مدفوع.
   */
  const before = (await readRoutes(c.env.DB)).find((r) => r.task === task)
  const mismatch = routeMismatch(
    before === undefined || !before.custom ? null : { provider: before.provider, model: before.model },
    { provider, model },
    cfAccountId(target.baseUrl) !== null,
  )
  if (mismatch !== null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: mismatch })
    return back('providers')
  }

  await writeRoute(c.env.DB, task as TaskName, provider, model, 'panel')
  await record(
    c.env.DB,
    { actor: 'panel', action: 'route.write', target: task, detail: `${provider} / ${model}` },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: `${task} ← ${provider} / ${model}.` })
  return back('providers')
})
