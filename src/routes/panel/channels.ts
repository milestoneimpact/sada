/**
 * مسارات اللوحة — القنوات وتطبيقاتُها، ومزوّدو الذكاء وطرقُه.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { Hono, type Context } from 'hono'
import type { Env } from '../../env'
import { pageApp } from '../../lib/linkedinPage'
import { ROUTES, type TaskName } from '../../lib/ai/registry'
import { listModels, type ModelList } from '../../lib/ai/models'
import { cfAccountId } from '../../lib/ai/cloudflare'
import { type Platform } from '../../lib/draft/prompt'
import {
  platformLabel, PLATFORM_IDS, PROVIDERS, type Platform as LinkPlatform,
} from '../../lib/oauth/providers'
import { soloNav } from '../ui/rail'
import { buildCommands, sectionLabel } from '../ui/command'
import { panelHref } from '../../lib/nav/panes'
import { mediaFor } from '../../lib/image/job'
import {
  APP_PLATFORMS, appStatuses, deleteApp, readApp, recordVerification, saveApp,
} from '../../lib/oauth/apps'
import { verifyAppCredentials } from '../../lib/oauth/verify'
import { disconnectAccount, findLinked, REVOKE_PAGE } from '../../lib/oauth/disconnect'
import {
  deleteProvider, getProvider, listProviders, normalizeName, resolveKey, saveKey, setEnabled, upsertProvider, type Provider,
} from '../../lib/providers'
import { checkProviderUrl } from '../../lib/ai/urlGuard'
import { dailyChecks, recentChecks, testProviderKey } from '../../lib/ai/health'
import { recommend } from '../../lib/ai/recommend'
import { readRoutes, routeMismatch, writeRoute } from '../../lib/ai/routes'
import { activeOrg } from '../../lib/tenancy'
import { loadSession, type Session } from '../../lib/session'
import { CHANNELS, listAccounts, SETUP, viewChannels } from '../../lib/channels'
import { accountHealth, grantedScopes, platformPosts, platformTally } from '../../lib/platform/screen'
import { CLIP_PLATFORMS, platformNeeds } from '../../lib/platform/needs'
import {
  history, platformCounts, postCosts, readCursor, upcoming, waiting,
} from '../../lib/platform/timeline'
import { ownerZone } from '../../lib/time/ownerZone'
import { backTo } from '../../lib/nav/back'
import { metricsFor } from '../../lib/metrics/job'
import { readFacts } from '../../lib/insights/whatWorks'
import { channelPulse } from '../../lib/insights/pulse'
import { tiktokNeedsScope } from '../../lib/media/uploads'
import { filterOf, platformScreen, tabOf } from '../ui/platformView'
import { injectCsrf, soloPage } from '../ui/shell'
import { notFoundResponse } from '../errors'
import { record } from '../../lib/audit'
import { modelName } from '../../lib/ai/modelName'
import { catalogGroups } from '../../lib/ai/modelCatalog'
import { routePickScreen } from '../ui/sections/providers'
import { type PanelFlash } from '../panelView'
import {
  BUILTIN_SECRET, deciderOf, page, loginResponse, setFlash, takeFlash, guardPost, reachNow, back, rejectForm,
} from './shared'

export const channels = new Hono<{ Bindings: Env }>()

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
channels.post('/panel/channels/app', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const platform = platformParam(String(form.get('platform') ?? ''))
  if (platform === null) {
    await rejectForm(c, activeOrg(gate.session.record), 'platform', 'unknown_platform')
    return back('channels')
  }
  const label = platformLabel(platform)

  const by = deciderOf(gate.session.record.via)
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
channels.post('/panel/channels/disconnect', async (c) => {
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

  // ‏وصفحةُ LinkedIn تُبطَل بسرّي تطبيقها الثاني لا الأوّل (مراجعة D-423)
  const app = target.platform === 'linkedin' && target.kind === 'org'
    ? pageApp(c.env as unknown as Record<string, unknown>)
    : await readApp(c.env.DB, c.env.TOKEN_ENC_KEY, target.platform, c.env as unknown as Record<string, string | undefined>)
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
    : result.remote === 'shared'
      ? 'ولم يُبطَل الإذنُ عند LinkedIn: صفحةٌ أخرى مربوطةٌ تنشر بالإذن نفسِه — افصلها أيضًا ليُبطَل.'
    : result.remote === 'failed'
      ? `وتعذّر إبطال الإذن عند ${label}، فاسحبه بيدك من «${page.label}».`
      : `ولا نداء إبطال يُنادى عند ${label} لهذا الحساب، فاسحب الإذن بيدك من «${page.label}».`
  await setFlash(c.env, c.req.raw, {
    kind: result.remote === 'revoked' || result.remote === 'shared' ? 'ok' : 'warn',
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
channels.post('/panel/channels/app/verify', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const platform = platformParam(String(gate.form.get('platform') ?? ''))
  if (platform === null) {
    await rejectForm(c, activeOrg(gate.session.record), 'platform', 'unknown_platform')
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

channels.post('/panel/channels/app/delete', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const platform = platformParam(String(gate.form.get('platform') ?? ''))
  if (platform === null) {
    await rejectForm(c, activeOrg(gate.session.record), 'platform', 'unknown_platform')
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
channels.get('/panel/channels/:platform', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)

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
  const metrics = await metricsFor(c.env.DB, activeOrg(session.record), historyPage.rows.map((p) => p.id))
  const costs = await postCosts(c.env.DB, activeOrg(session.record), shown)

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
    // ‏وسرّا تطبيق الصفحة (D-423): اسمٌ يُسأل عن وجوده، لا قيمة
    pageApp: pageApp(c.env as unknown as Record<string, unknown>) !== null,
    // ‏ويومُ المالك من كعكة متصفّحه، لا من إعدادٍ يُخزَّن (D-173)
    zone: await ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
    // ‏ووميضُ الفعل يُقرأ حيث عاد المالك، لا في لوحٍ لم يفتحه
    flash: await takeFlash(c.env, c.req.raw),
    ...(clipReach === undefined ? {} : { reachPublic: clipReach }),
    ...(platform === 'tiktok' && reach !== null ? { reachNoScope: tiktokNeedsScope(reach) } : {}),
    // ‏نبضُ القناة لهذا العميل (D-263) — في «المنشورات» وحدها، من الحقائق نفسِها التي يقرؤها «ما ينجح»
    ...(tab === 'posts' && needs?.measured === true
      ? { pulse: channelPulse(await readFacts(c.env.DB, activeOrg(session.record), platform), now, await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)) }
      : {}),
  })
  return page((nonce) =>
    // ‏والرمزُ يُحقَن هنا كما في اللوحة: نموذجا ضبط التطبيق كانا يُرسَلان بلا
    // ‏`_csrf` فيردّهما `guardPost` بـ403، والدليلُ يسكن هذه الصفحة منذ D-111
    soloPage(`صدى — ${spec.label}`, { href: panelHref('channels'), label: sectionLabel('accounts') },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('accounts', spec.id)),
  )
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
channels.post('/panel/providers/add', async (c) => {
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

channels.post('/panel/providers/key', async (c) => {
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
    // ‏ومفتاحٌ جديدٌ قد يرى نماذجَ غيرَ ما رآه القديم: القائمةُ المخبوءةُ تُمحى (D-364)
    await c.env.KV.delete(MODEL_LIST_CACHE + guard.provider.name).catch(() => undefined)
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
export async function providerKey(env: Env, provider: Provider): Promise<string | null> {
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
channels.post('/panel/providers/models', async (c) => {
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

/**
 * ‏فهرسُ مزوّدٍ مجموعاتٍ لمهمّة (D-364) — يقرؤه نداءُ JSON وصفحةُ الاختيار بلا سكربت، فلا يفترقان.
 * ‏قراءةٌ لا توليد: لا `cost_ledger` ولا `audit`. **والمفتاحُ لا يخرج من هنا**: يُمرَّر إلى المزوّد وحده.
 */
async function catalogFor(env: Env, provider: Provider, task: string): Promise<{ ok: boolean; detail: string; groups: ReturnType<typeof catalogGroups> }> {
  // ‏والقائمةُ مخبوءةٌ في KV دقائقَ (مراجعة D-364): فتحُ الصفحة مرّاتٍ لا يفكّ المفتاحَ ولا ينادي المزوّدَ في كلّ مرّة
  const cacheKey = MODEL_LIST_CACHE + provider.name
  const cached = await env.KV.get(cacheKey).catch(() => null)
  if (cached !== null) {
    const models = JSON.parse(cached) as ModelList['models']
    return { ok: true, detail: String(models.length) + ' نموذجًا', groups: catalogGroups(models, { provider: provider.name, task }) }
  }
  const key = await providerKey(env, provider)
  if (key === null) return { ok: false, detail: 'لا مفتاح لهذا المزوّد. احفظه أوّلًا', groups: [] }
  const list = await listModels({ name: provider.name, kind: provider.kind, baseUrl: provider.baseUrl, apiKey: key, builtin: provider.builtin })
  if (list.ok) await env.KV.put(cacheKey, JSON.stringify(list.models), { expirationTtl: MODEL_LIST_TTL }).catch(() => undefined)
  return { ok: list.ok, detail: list.detail, groups: list.ok ? catalogGroups(list.models, { provider: provider.name, task }) : [] }
}

/** ‏مفتاحُ القائمة المخبوءة لكلّ مزوّد، ومدّتُها خمسُ دقائق — وحفظُ مفتاحٍ جديدٍ يمحوها. */
const MODEL_LIST_CACHE = 'model-list:'
const MODEL_LIST_TTL = 300

/**
 * ‏قراءةٌ بـ`GET` تفكّ مفتاحًا وتنادي مزوّدًا (مراجعة D-364): **لا تُطلَق من موقعٍ آخر**. `<img src>` من صفحةٍ غريبة يحمل
 * ‏`Sec-Fetch-Site: cross-site`؛ فالمقبولُ `same-origin` أو `none` (عنوانٌ كُتب في الشريط)، أو رمزُ الجلسة في `csrf`.
 */
function crossSite(c: Context<{ Bindings: Env }>, csrf: string): boolean {
  const site = c.req.header('Sec-Fetch-Site') ?? ''
  if (site === 'same-origin' || site === 'none') return false
  const token = c.req.query('csrf') ?? ''
  return !(token !== '' && token === csrf)
}

/** ‏الفهرسُ بـ`GET` للسكربت (D-364): قراءةٌ خلف الجلسة لا تغيّر شيئًا، ومن اللوحة وحدها (`crossSite`) — ولا تُخزَّن عند المتصفّح. */
channels.get('/panel/providers/models', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.json({ ok: false, detail: 'انتهت الجلسة', groups: [] }, 401)
  if (crossSite(c, session.record.csrf)) return c.json({ ok: false, detail: 'طلبٌ من خارج اللوحة', groups: [] }, 403)
  const provider = await getProvider(c.env.DB, c.req.query('provider') ?? '')
  if (provider === null) return c.json({ ok: false, detail: 'لا مزوّد بهذا الاسم', groups: [] }, 404)
  const out = await catalogFor(c.env, provider, c.req.query('task') ?? 'analyze')
  return c.json(out, 200, { 'Cache-Control': 'no-store' })
})

/** ‏صفحةُ الاختيار بلا سكربت (D-364): `?provider=` يعيد رسمَ البطاقة بقائمة ذلك المزوّد. */
channels.get('/panel/routes/pick', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (crossSite(c, session.record.csrf)) return c.redirect('/panel/settings#providers', 303)
  const task = c.req.query('task') ?? ''
  if (!KNOWN_TASKS.has(task)) return notFoundResponse(c.req.raw, 'لا مهمّة بهذا الاسم')
  const [providers, routes] = await Promise.all([listProviders(c.env.DB), readRoutes(c.env.DB)])
  const route = routes.find((r) => r.task === task)
  const name = c.req.query('provider') ?? route?.provider ?? ''
  const provider = providers.find((p) => p.name === name) ?? null
  if (provider === null) return notFoundResponse(c.req.raw, 'لا مزوّد بهذا الاسم')
  const cat = await catalogFor(c.env, provider, task)
  const current = route !== undefined && route.provider === provider.name ? route.model : ''
  const body = routePickScreen({
    task, provider: provider.name, current,
    providers: providers.map((p) => ({ name: p.name, label: p.label })),
    groups: cat.ok ? cat.groups : null, detail: cat.detail,
  })
  return page((nonce) =>
    soloPage('صدى — توجيه المهامّ', { href: '/panel/settings#providers', label: 'الإعدادات' }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('settings')),
  )
})

/**
 * الاختبار يمرّ بلهجة المزوّد، **ويُحفظ صفُّه** (D-348): نتيجتُه ورمزُه وزمنُه في `provider_checks`، ومنه أعمدةُ الأسبوع
 * والإشعار. ومن يطلب JSON (زرُّ «اختبر» داخل البطاقة) يأخذ النتيجةَ بلا إعادة تحميل؛ وغيرُه يعود برسالةٍ كما كان.
 */
channels.post('/panel/providers/verify', async (c) => {
  const guard = await providerGuard(c)
  if ('denied' in guard) return guard.denied
  const provider = guard.provider
  const wantsJson = (c.req.header('accept') ?? '').includes('application/json')

  const result = await testProviderKey(c.env.DB, provider, await providerKey(c.env, provider), 'panel')

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'provider.verify',
      target: provider.name,
      detail: result.ok ? `نجح · ${result.ms}ms` : `فشل — ${result.detail}`,
    },
    c.req.raw,
  )

  if (wantsJson) {
    return c.json({ ok: result.ok, detail: result.detail, status: result.status, ms: result.ms, at: result.at, label: provider.label })
  }
  // ‏ولا تُمحى شهادةٌ سابقة على فشلٍ قد يكون من الخدمة لا المفتاح — الفشلُ صفٌّ في التاريخ لا محوٌ لـ«اختُبر»
  await setFlash(c.env, c.req.raw, {
    kind: result.ok ? 'ok' : 'bad',
    text: result.ok ? `${provider.label}: ${result.detail} · ${result.ms} ملّي ث.` : `${provider.label}: ${result.detail}.`,
  })
  return back('providers')
})

/**
 * **«اختبر الكلّ»** (D-350): كلُّ مزوّدٍ مفعَّلٍ له مفتاح يُختبر الآن كاختبار الفجر، بنداءٍ لا يكلّف. والرسالةُ تعدّ ما يعمل
 * وتسمّي ما سقط.
 */
/** أسماءُ المهامّ النصّيّة في رسالة التوصيات — من شاشة التوجيه نفسها. */
const TASK_NAME: Readonly<Record<string, string>> = { analyze: 'الفهم', draft: 'الكتابة', plan: 'الخطّة' }

channels.post('/panel/providers/verify-all', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const done = await dailyChecks(c.env.DB, (p) => providerKey(c.env, p))
  const failed = done.filter((x) => !x.ok)
  await record(c.env.DB, { actor: 'panel', action: 'provider.verify_all', target: String(done.length), detail: failed.map((x) => x.provider).join(' ') || 'كلّها تعمل' }, c.req.raw)
  await setFlash(c.env, c.req.raw, done.length === 0
    ? { kind: 'warn', text: 'لا مزوّدَ مفعَّلًا له مفتاحٌ لاختباره.' }
    : failed.length === 0
      ? { kind: 'ok', text: 'اختُبرت ' + String(done.length) + ' مفاتيح، وكلّها تعمل.' }
      : { kind: 'bad', text: 'اختُبرت ' + String(done.length) + ' مفاتيح: ' + String(failed.length) + (failed.length === 1 ? ' لا يعمل — ' : ' لا تعمل — ') + failed.map((x) => x.provider).join('، ') + '.' })
  return back('providers')
})

/**
 * **«طبّق التوصيات»** (D-350): كلُّ مهمّةٍ نصّيّة إلى أنسب نموذجٍ مزوّدُه صالح (`recommend`). والرسالةُ تسمّي القديمَ لكلّ مهمّة،
 * فيُعاد من صفّها إن شاء المالك. ولا تُلمس الصورةُ والفيديو وقراءةُ الصور: لها نماذجُها.
 */
channels.post('/panel/providers/recommend', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const [providers, routes, checks] = await Promise.all([listProviders(c.env.DB), readRoutes(c.env.DB), recentChecks(c.env.DB, 1)])
  const state = await Promise.all(providers.map(async (p) => ({
    name: p.name, enabled: p.enabled, configured: (await providerKey(c.env, p)) !== null,
    lastOk: checks[p.name]?.at(-1)?.ok ?? null,
  })))
  const changes = recommend(state, routes)
  for (const ch of changes) {
    await writeRoute(c.env.DB, ch.task, ch.to.provider, ch.to.model, 'panel')
    await record(c.env.DB, { actor: 'panel', action: 'route.write', target: ch.task, detail: ch.to.provider + ' / ' + ch.to.model + ' (توصية · كان ' + ch.from.provider + ' / ' + ch.from.model + ')' }, c.req.raw)
  }
  await setFlash(c.env, c.req.raw, changes.length === 0
    ? { kind: 'ok', text: 'كلُّ مهمّةٍ نصّيّة على أنسب نموذجٍ متاح — لا تغيير.' }
    : { kind: 'ok', text: 'ضُبطت ' + String(changes.length) + (changes.length === 1 ? ' مهمّة: ' : ' مهامّ: ') + changes.map((x) => (TASK_NAME[x.task] ?? x.task) + ' إلى ' + x.to.model + ' بدل ' + x.from.model).join('؛ ') + '.' })
  return back('providers')
})

channels.post('/panel/providers/toggle', async (c) => {
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

channels.post('/panel/providers/delete', async (c) => {
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
channels.post('/panel/routes', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const task = String(form.get('task') ?? '')
  const provider = String(form.get('provider') ?? '')
  // ‏والكتابةُ اليدويّة تغلب الدرج (D-364): من كتب معرّفًا قصده، والدرجُ قد يبقى على خياره الأوّل
  const manual = String(form.get('model_manual') ?? '').trim()
  const picked = String(form.get('model') ?? '').trim()
  const model = manual !== '' ? manual : picked === '__manual__' ? '' : picked
  // ‏ومن جاء من صفحة الاختيار بلا سكربت يعود إليها برفضه، فلا يضيع المزوّدُ وقائمتُه (مراجعة D-364)
  const fromPick = form.get('return') === 'pick' && KNOWN_TASKS.has(task)
  const refuse = (): Response => fromPick
    ? Response.redirect(new URL('/panel/routes/pick?task=' + encodeURIComponent(task) + '&provider=' + encodeURIComponent(provider), c.req.url).toString(), 303)
    : back('providers')

  if (!KNOWN_TASKS.has(task)) return c.json({ error: 'unknown_task' }, 400)
  const target = await getProvider(c.env.DB, provider)
  if (target === null) {
    return c.json({ error: 'unknown_provider' }, 400)
  }
  if (model === '') {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'اسم النموذج مطلوب.' })
    return refuse()
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
    return refuse()
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
