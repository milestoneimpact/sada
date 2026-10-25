/**
 * مسارات اللوحة — الرئيسيّة وأقسامُها الخمسة، والإعدادات، والمسح، والتحليل.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { Hono, type Context } from 'hono'
import type { Env } from '../../env'
import { type TaskName } from '../../lib/ai/registry'
import { dailySpend, spendByProvider, spendRows, spendThisMonth, spendTodayFor } from '../../lib/ai/spend'
import { cfAccountId, cfAccountOf } from '../../lib/ai/cloudflare'
import { imageProviderGate, imageSecretName, slideGate } from '../../lib/image/gate'
import { imageReadiness, infographicReadiness, routeDot, videoReadiness } from '../../lib/media/readiness'
import { analyzeSource } from '../../lib/analyze/job'
import { getDraft, listDrafts } from '../../lib/draft/store'
import { journeyCounts } from '../../lib/home'
import { type PublishPlatform } from '../../lib/oauth/providers'
import { listUploads, reachOf, tiktokNeedsScope, VIDEO_PLATFORMS } from '../../lib/media/uploads'
import { type PaneId } from '../../lib/nav/panes'
import { readPeaks, type Peaks } from '../../lib/schedule/peak'
import { mediaFor } from '../../lib/image/job'
import { videoFace } from '../../lib/media/video'
import { latestPlan } from '../../lib/plan/job'
import { appStatuses } from '../../lib/oauth/apps'
import { scanDrive } from '../../lib/drive/job'
import { money } from '../../lib/format'
import { blockerFor, checkAllowance, providerBlocker, videoCapGate } from '../../lib/limits'
import { listProviders, resolveKey } from '../../lib/providers'
import { readRoutes } from '../../lib/ai/routes'
import { SETTING_KEYS, settingLabel, writeSetting, type SettingKey } from '../../lib/settings'
import { chosenTiles, TILE_MAX, TILE_MIN } from '../../lib/dashboard'
import { pivot, readCols, readDimension, readMeasure } from '../../lib/pivot'
import { FACT_CAP, loadFacts } from '../../lib/pivotStore'
import { todayFeed } from '../../lib/today'
import { activeOrg, listOrgs } from '../../lib/tenancy'
import type { PivotView } from '../ui/sections/pivot'
import { listSessions, loadSession } from '../../lib/session'
import { factorState } from '../../lib/security/factors'
import { isLinkedInPage, linkStates, listAccounts, viewChannels } from '../../lib/channels'
import { activeScopes } from '../../lib/platform/screen'
import { ownerZone } from '../../lib/time/ownerZone'
import { backTo } from '../../lib/nav/back'
import { openSuggestions } from '../../lib/report/promote'
import { pendingCount } from '../../lib/owner'
import { readCaptions, type VideoCaptions } from '../../lib/media/captions'
import { expiringTokens } from '../../lib/token/expiry'
import { relyingParty } from '../../lib/security/rp'
import { record, recentAudit } from '../../lib/audit'
import { pulses, readHeartbeats } from '../../lib/ops/heartbeat'
import { panelPage, type PanelFlash, type PanelSource } from '../panelView'
import {
  BUILTIN_SECRET, readSpan, page, loginResponse, setFlash, takeFlash, guardPost, reachNow, back, POST_ID, BOARD, ownerFacts,
} from './shared'

export const home = new Hono<{ Bindings: Env }>()

const BUILTIN_DOCS: Readonly<Record<string, string>> = {
  anthropic: 'console.anthropic.com ← API Keys',
  gemini: 'aistudio.google.com/apikey',
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
 * ‏اللوحةُ صفحاتٌ بمساراتها (D-211): «/panel» الرئيسيّةُ والمنشورات، وكلُّ لوحٍ آخر في مساره. والمعالجُ واحد —
 * ‏البياناتُ نفسُها والحرّاسُ أنفسُهم — ويُرسم منه اللوحُ المطلوب وحدَه.
 */
home.get('/panel/library', (c) => panelRoute(c, 'library'))

home.get('/panel/accounts', (c) => panelRoute(c, 'accounts'))

home.get('/panel/settings', (c) => panelRoute(c, 'settings'))

home.get('/panel/analysis', (c) => panelRoute(c, 'results'))

home.get('/panel', (c) => panelRoute(c, null))

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
         LEFT JOIN content_items i ON i.source_id = s.id AND i.org_id = s.org_id
        WHERE s.org_id = ?
        ORDER BY s.last_seen_at DESC
        LIMIT 200`,
    ).bind(activeOrg(session.record)).all<SourceRow>()
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
        WHERE org_id = ? ORDER BY at DESC LIMIT 5`,
    )
    .bind(activeOrg(session.record))
    .all<{ kind: string; body: string; status: number | null; error: string | null; at: string }>()
    .catch(() => ({ results: [] as {
      kind: string; body: string; status: number | null; error: string | null; at: string
    }[] }))

  const peaks: Record<string, Peaks> = {}
  for (const platform of [...new Set([...drafts, ...(editing === null ? [] : [editing])].map((d) => d.platform))]) {
    peaks[platform] = await readPeaks(c.env.DB, activeOrg(session.record), platform)
  }
  const plan = await latestPlan(c.env.DB, activeOrg(session.record))
  const sessions = await listSessions(c.env.KV, session.id)
  const orgs = await listOrgs(c.env.DB)
  const audit = await recentAudit(c.env.DB, activeOrg(session.record), 50)
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
  const openCount = (await openSuggestions(c.env.DB, activeOrg(session.record))).length
  // ‏والرحلةُ تُعدّ من القاعدة كلِّها لا من الستّين الأخيرة — استعلامان مجمَّعان (D-177)
  const journey = await journeyCounts(c.env.DB, activeOrg(session.record), new Date())
  const uploads = await listUploads(c.env.DB, activeOrg(session.record))
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
  // ‏ما وُلّد اليوم من صور — بجانب سقفها في «الإنفاق والحدود» (D-255)
  const usedImages = (await c.env.DB
    .prepare("SELECT COUNT(*) AS n FROM media WHERE org_id = ? AND created_at >= date('now') AND mime LIKE 'image/%'")
    .bind(activeOrg(session.record))
    .first<{ n: number }>()
    .catch(() => null))?.n ?? 0
  return page((nonce) =>
    panelPage({
      // البيئةُ تُقرأ لا تُكتب: كانت «STAGING» ثابتةً في العلامة حتّى في الإنتاج (D-151)
      env: c.env.SADA_ENV,
      paused: allowance.settings.paused,
      // ‏حاجزُ الكتابة بحكم النداء نفسِه، ومنطقةُ المالك لساعة انفتاح السقف (ر-10)
      draftBlocker: blockerFor('draft', allowance.settings, allowance.usage),
      zone: ownZone,
      role: session.record.role ?? 'owner',
      autoEnqueue: allowance.settings.autoEnqueue,
      autoImage: allowance.settings.autoImage,
      imageCap: allowance.settings.dailyImageCap,
      usedImages,
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
      // ‏ومن يكتب للمقارنة من ضُبط مفتاحه وفُعِّل لا من وُجد صفّه (D-244)
      writers: providerCards
        .filter((p) => p.configured && p.enabled)
        .map((p) => ({ name: p.name, label: p.label })),
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
home.post('/panel/settings', async (c) => {
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
home.post('/panel/scan', async (c) => {
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
home.post('/panel/analyze', async (c) => {
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
