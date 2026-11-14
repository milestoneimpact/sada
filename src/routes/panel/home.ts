/**
 * مسارات اللوحة — الرئيسيّة وأقسامُها الخمسة، والإعدادات، والمسح، والتحليل.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك. **وكلُّ لوحٍ يُحمَّل له ما يقرأ وحدَه** (D-280):
 * الهيكلُ لكلّ لوح، ثمّ محمِّلٌ للوح المطلوب — انظر `panelRoute`.
 */
import { waitingImages } from '../../lib/image/job'
import { NEURON_USD } from '../../lib/ai/imagePricing'
import { Hono, type Context } from 'hono'
import type { Env } from '../../env'
import { type TaskName } from '../../lib/ai/registry'
import { readRoutes, type TaskRoute } from '../../lib/ai/routes'
import { dailySpend, spendByProvider, spendRows, spendThisMonth, spendTodayFor } from '../../lib/ai/spend'
import { cfAccountId, cfAccountOf } from '../../lib/ai/cloudflare'
import { imageProviderGate, imageSecretName, slideGate, type SlideGate } from '../../lib/image/gate'
import { imageReadiness, infographicReadiness, routeDot, videoReadiness, type MediaReady } from '../../lib/media/readiness'
import { analyzeSource } from '../../lib/analyze/job'
import { getDraft, listDrafts, type DraftRow } from '../../lib/draft/store'
import { journeyCounts } from '../../lib/home'
import { type PublishPlatform } from '../../lib/oauth/providers'
import { listUploads, reachOf, tiktokNeedsScope, VIDEO_PLATFORMS } from '../../lib/media/uploads'
import { type PaneId } from '../../lib/nav/panes'
import { readPeaks, type Peaks } from '../../lib/schedule/peak'
import { mediaFor } from '../../lib/image/job'
import { videoFace } from '../../lib/media/video'
import { latestPlan } from '../../lib/plan/job'
import { planProgress } from '../../lib/plan/schedule'
import { readBrief } from '../../lib/brief'
import { unitCosts } from '../../lib/estimate'
import { appStatuses } from '../../lib/oauth/apps'
import { scanDrive } from '../../lib/drive/job'
import { money } from '../../lib/format'
import { blockerFor, checkAllowance, providerBlocker, videoCapGate, type Allowance } from '../../lib/limits'
import { listProviders, resolveKey } from '../../lib/providers'
import { SETTING_KEYS, settingLabel, writeSetting, type SettingKey } from '../../lib/settings'
import { chosenTiles, TILE_MAX, TILE_MIN } from '../../lib/dashboard'
import { pivot, readCols, readDimension, readMeasure } from '../../lib/pivot'
import { FACT_CAP, loadFacts, type FactLoad } from '../../lib/pivotStore'
import { todayFeed } from '../../lib/today'
import { activeOrg, listOrgs } from '../../lib/tenancy'
import type { MediaView, Target } from '../ui/sections/drafts'
import type { OutboxRow } from '../ui/parts'
import { listSessions, loadSession, type Session } from '../../lib/session'
import { factorState } from '../../lib/security/factors'
import { OWNER_EMAIL } from '../../lib/ownerEmail'
import { digest, fingerprint } from '../../lib/security/digest'
import { isLinkedInPage, linkStates, listAccounts, viewChannels, type ChannelView, type LinkedAccount } from '../../lib/channels'
import { activeScopes } from '../../lib/platform/screen'
import { ownerZone } from '../../lib/time/ownerZone'
import { backTo } from '../../lib/nav/back'
import { openSuggestions } from '../../lib/report/promote'
import { readCaptions, type VideoCaptions } from '../../lib/media/captions'
import { relyingParty } from '../../lib/security/rp'
import { record, recentAudit, type AuditRow } from '../../lib/audit'
import { saveWebhook } from '../../lib/alerts/webhook'
import { pulses, readHeartbeats } from '../../lib/ops/heartbeat'
import { memoryNotices, unreadNotices } from '../../lib/notices'
import {
  panelPage, type LibraryData, type OverviewData, type PanelData, type PaneView, type PanelFactors, type PanelFlash,
  type PanelProvider, type PanelSource, type PostsData, type ResultsData, type SettingsData, type ShellData,
} from '../panelView'
import {
  BUILTIN_SECRET, readSpan, page, loginResponse, setFlash, takeFlash, guardPost, reachNow, back, POST_ID, BOARD, envFacts,
  type EnvFacts,
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
  kind?: string
  origin_url?: string | null
  file_key?: string | null
  /** كم منشورًا كُتب منه (D-343) — غيرُ المرفوض. */
  uses?: number
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
    uses: row.uses ?? 0,
    driveFileId: row.drive_file_id,
    name: row.name,
    analyzed,
    stale: analyzed && hash !== row.content_hash,
    worth: analyzed ? row.worth_score : null,
    summary: analyzed ? row.summary : null,
    reason,
    themes,
    lastSeenAt: row.last_seen_at,
    // ‏ما ليس من Drive يُعرَف بنوعه ويُفتح من أصله (D-284)
    kind: row.kind ?? 'drive',
    originUrl: row.origin_url ?? null,
    hasFile: (row.file_key ?? null) !== null,
  }
}

/**
 * ‏اللوحةُ صفحاتٌ بمساراتها (D-211): «/panel» الرئيسيّةُ والمنشورات، وكلُّ لوحٍ آخر في مساره. والمعالجُ واحد —
 * ‏الحرّاسُ أنفسُهم — **ويحمِّل للوح المطلوب ما يقرأ وحدَه** (D-280).
 */
home.get('/panel/library', (c) => panelRoute(c, 'library'))

home.get('/panel/accounts', (c) => panelRoute(c, 'accounts'))

home.get('/panel/settings', (c) => panelRoute(c, 'settings'))

home.get('/panel/analysis', (c) => panelRoute(c, 'results'))

home.get('/panel', (c) => panelRoute(c, null))

type PanelContext = Context<{ Bindings: Env }>

/** وعدٌ يُنشأ أوّلَ ما يُطلَب ويُعاد بعدها — فما يقرؤه لوحان في طلبٍ واحد يُحمَّل مرّة. */
function lazy<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | undefined
  return () => (made ??= make())
}

/** بطاقاتُ المزوّدين وتوجيهُ المهامّ وإنفاقُ الثلاثين — ما تُبنى منه الجاهزيّةُ كلُّها. */
interface ProviderLoad {
  readonly cards: PanelProvider[]
  readonly routes: TaskRoute[]
  readonly spend: Awaited<ReturnType<typeof spendByProvider>>
}

/**
 * ما يتقاسمه المحمِّلون: السياقُ والجلسةُ والمنظّمة، وما حُمِّل للهيكل ويقرؤه أكثرُ من لوح، **وما يقرؤه لوحان
 * معًا على «/panel» كسولًا** — يُحمَّل حين يُطلَب ومرّةً واحدة.
 */
interface Load {
  readonly c: PanelContext
  readonly session: Session
  readonly org: string
  readonly now: Date
  readonly q: URLSearchParams
  readonly allowance: Allowance
  readonly facts: EnvFacts
  readonly accounts: LinkedAccount[]
  readonly drafts: DraftRow[]
  readonly channels: readonly ChannelView[]
  readonly zone: string | null
  readonly sources: () => Promise<PanelSource[]>
  readonly audit: () => Promise<AuditRow[]>
  readonly providers: () => Promise<ProviderLoad>
  readonly factors: () => Promise<PanelFactors>
  readonly outbox: () => Promise<OutboxRow[]>
  readonly pivotFacts: () => Promise<FactLoad>
}

/** ما يحمله الهيكلُ لكلّ لوح — ‏`nonce` يُضاف عند الرسم لأنّه يُولَّد معه. */
type ShellLoad = Omit<ShellData, 'nonce'>

/**
 * ‏**كلُّ لوحٍ يُحمَّل له ما يقرأ** (D-280، المرحلة ٤ب من خارطة الطريق الثانية).
 *
 * ‏كانت `panelRoute` تجمع `PanelData` كلَّها — خمسةً وأربعين انتظارًا متتابعًا، وكلُّ انتظارٍ رحلةٌ إلى D1 —
 * ‏ثمّ ترسم الصفحةَ بألواحها الستّة وتقصّ منها ما لم يُطلَب. فصارت ثلاثَ طبقات:
 *
 * ‏- **الهيكل** (`shellData`): ما تقرؤه الرافدةُ والترويسةُ والإشعارُ في كلّ لوح — الجلسةُ والإعداداتُ والمسوّداتُ
 * ‏  (أعدادُ الرافدة وفهرسُ الأوامر) والقنواتُ (شريطُ المنقطعة) والنبضُ والمنظّماتُ والإشعارُ ومنطقةُ المالك.
 * ‏- **محمِّلٌ لكلّ لوح** (`overviewData` … `resultsData`): الانتظاراتُ التي تقرؤها أقسامُه وحدَها، والمستقلُّ منها
 * ‏  في `Promise.all` — فـ D1 يقرأ المتوازيَ.
 * ‏- **ما يتقاسمه لوحان** (`sources` و`audit` و`providers`…) كسولٌ في `Load`: يُحمَّل مرّةً مهما قرأه من لوح.
 *
 * ‏والنوعُ يحرس الحدّ: كلُّ لوحٍ يرسم من `ShellData & <لوحُه>Data` (`panelView.ts`)، فقسمٌ يقرأ حقلًا لم يُحمَّل
 * ‏خطأُ تصريف لا فراغٌ صامت. وما لم يقرأه قسمٌ قطّ (`ownerPending` و`expiring` و`apps` و`via`) أُسقط مع
 * ‏استعلاماته. ويحرس العدَّ `panelLoad.test.ts`: سقفُ الجمل لكلّ لوح.
 */
async function panelRoute(c: PanelContext, only: PaneId | null): Promise<Response> {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw, 200)
  // ‏والجلسةُ المعلَّقة وجلسةُ التسجيل لا تصلان هنا: يردّهما حارسُ الجلسات قبل كلّ مسار (D-317)

  const org = activeOrg(session.record)
  const now = new Date()
  const q = new URL(c.req.url).searchParams
  const { shell, load } = await shellData(c, session, org, now, q)

  const render = <D extends ShellLoad>(data: D, view: (full: D & { nonce: string }) => PaneView): Response =>
    page((nonce) => panelPage(view({ ...data, nonce })))

  switch (only) {
    case null: {
      // ‏وسكربتُ التبديل يطلب «المنشورات» وحدَها (D-232): البطاقةُ والأعدادُ والإشعارُ هناك، والرئيسيّةُ لا تُحمَّل له
      if (q.get('swap') === 'posts') {
        const posts = await postsData(load)
        return render({ ...shell, ...posts }, (data) => ({ only: null, swapPosts: true, data }))
      }
      const [overview, posts] = await Promise.all([overviewData(load), postsData(load)])
      return render({ ...shell, ...overview, ...posts }, (data) => ({ only: null, data }))
    }
    case 'overview': return render({ ...shell, ...(await overviewData(load)) }, (data) => ({ only, data }))
    case 'posts': return render({ ...shell, ...(await postsData(load)) }, (data) => ({ only, data }))
    case 'library': return render({ ...shell, ...(await libraryData(load)) }, (data) => ({ only, data }))
    case 'accounts': return render(shell, (data) => ({ only, data }))
    case 'settings': return render({ ...shell, ...(await settingsData(load)) }, (data) => ({ only, data }))
    case 'results': return render({ ...shell, ...(await resultsData(load)) }, (data) => ({ only, data }))
  }
}

/**
 * الهيكلُ — لكلّ لوح. ثمانيةُ انتظاراتٍ مستقلّةٍ معًا: الحارسُ (الإعداداتُ والاستهلاك)، والمسوّداتُ، وتطبيقاتُ
 * OAuth والحساباتُ (القنوات)، والنبضُ، والمنظّماتُ، والإشعارُ من KV، ومنطقةُ المالك من كعكته (D-173).
 */
async function shellData(
  c: PanelContext, session: Session, org: string, now: Date, q: URLSearchParams,
): Promise<{ shell: ShellLoad; load: Load }> {
  const env = c.env as unknown as Record<string, string | undefined>
  const [allowance, drafts, apps, accounts, beats, orgs, flash, zone] = await Promise.all([
    checkAllowance(c.env.DB, 'image', org),
    listDrafts(c.env.DB, org, BOARD),
    appStatuses(c.env.DB, env),
    listAccounts(c.env.DB, org),
    readHeartbeats(c.env.DB),
    listOrgs(c.env.DB),
    takeFlash(c.env, c.req.raw),
    // ‏«هذا الشهر» وساعةُ انفتاح السقف بتوقيت المالك من كعكة متصفّحه (D-173) — لا من إعدادٍ يُخزَّن
    ownerZone(c.env.DB, c.req.header('Cookie') ?? null),
  ])

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
  const channels = viewChannels(accounts, (name) => {
    if (configured.has(name)) return true
    const value = env[name]
    return typeof value === 'string' && value.length > 0
  })

  // ‏عدّادُ الإشعارات (D-294): مراجعُ الذاكرة (النبضُ والسقف) محمَّلةٌ أصلًا، والقاعدةُ جملةٌ واحدةٌ تُكمل العدّ
  const beatsNow = pulses(beats, now)
  const unread = await unreadNotices(c.env.DB, org, memoryNotices(beatsNow, allowance, now).map((n) => n.ref),
    { email: session.record.email ?? OWNER_EMAIL, handle: await fingerprint(session.id) })

  const shell: ShellLoad = {
    // البيئةُ تُقرأ لا تُكتب: كانت «STAGING» ثابتةً في العلامة حتّى في الإنتاج (D-151)
    env: c.env.SADA_ENV,
    role: session.record.role ?? 'owner',
    paused: allowance.settings.paused,
    pulses: beatsNow,
    unread,
    rpId: relyingParty(c.env.PUBLIC_BASE_URL).id,
    flash,
    now,
    csrf: session.record.csrf,
    orgs,
    org,
    drafts,
    channels,
    zone,
  }
  const load: Load = {
    c, session, org, now, q, allowance, accounts, drafts, channels, zone,
    facts: envFacts(c.env),
    sources: lazy(() => loadSources(c, org)),
    // ‏خمسون صفًّا للأمان، ومنها «ما وقع اليوم» وآخرُ محاولةِ خطّة — لا استعلامَ جديد (D-157)
    audit: lazy(() => recentAudit(c.env.DB, org, 50)),
    providers: lazy(() => loadProviders(c)),
    // ‏عواملُ صاحب الجلسة (D-317) — وعرضٌ لا قرار: قاعدةٌ لا تردّ تُرسم «لا عامل» ولا تُسقط الإعدادات
    factors: lazy(async () => toPanelFactors(
      await factorState(c.env.DB, c.env.TOKEN_ENC_KEY, shell.rpId, session.record.email ?? OWNER_EMAIL).catch(() => null))),
    outbox: lazy(() => loadOutbox(c, org)),
    // ‏ومدى اللوح المحوريّ من العنوان (D-120) — ومنه «ما وقع اليوم» كذلك
    pivotFacts: lazy(() => loadFacts(c.env.DB, org, readSpan(q.get('days')))),
  }
  return { shell, load }
}

async function loadSources(c: PanelContext, org: string): Promise<PanelSource[]> {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT s.id, s.drive_file_id, s.name, s.content_hash, s.last_seen_at, s.kind, s.origin_url, s.file_key,
              i.worth_score, i.summary, i.themes_json,
              (SELECT COUNT(*) FROM posts p WHERE p.source_id = s.id AND p.org_id = s.org_id AND p.status <> 'rejected') AS uses
         FROM sources s
         LEFT JOIN content_items i ON i.source_id = s.id AND i.org_id = s.org_id
        WHERE s.org_id = ?
        ORDER BY s.last_seen_at DESC
        LIMIT 200`,
    ).bind(org).all<SourceRow>()
    return results.map(toPanelSource)
  } catch {
    return []
  }
}

/**
 * **وآخرُ خمسةٍ لا كلُّها** (D-101): الصندوقُ ينمو ولا يُقلَّم،
 * **وسجلٌّ كاملٌ في صفحةٍ تُفتَح كلَّ يومٍ ثمنٌ يُدفَع كلَّ يوم**.
 * والخمسةُ تكفي لتقول «القناةُ تعمل» أو «ماتت».
 */
async function loadOutbox(c: PanelContext, org: string): Promise<OutboxRow[]> {
  const { results } = await c.env.DB
    .prepare(
      `SELECT kind, body, status, error, at FROM alert_outbox
        WHERE org_id = ? ORDER BY at DESC LIMIT 5`,
    )
    .bind(org)
    .all<{ kind: string; body: string; status: number | null; error: string | null; at: string }>()
    .catch(() => ({ results: [] as {
      kind: string; body: string; status: number | null; error: string | null; at: string
    }[] }))
  return results
}

/** سرُّ Worker للمدمَج: المضاف لا سرّ له في البيئة. */
function workerSecretOf(c: PanelContext, p: { readonly name: string; readonly builtin: boolean }): {
  readonly secretName: string | null; readonly value: string | undefined
} {
  const secretName = p.builtin ? (BUILTIN_SECRET[p.name] ?? null) : null
  return {
    secretName,
    value: secretName === null ? undefined : (c.env[secretName as keyof Env] as string | undefined),
  }
}

/** حال كلّ مزوّد: مدمَجا كان أو مضافا من اللوحة — والمفتاحُ والإنفاقُ اليوميُّ لكلٍّ معًا. */
async function loadProviders(c: PanelContext): Promise<ProviderLoad> {
  const [stored, spend, routes] = await Promise.all([
    listProviders(c.env.DB),
    spendByProvider(c.env.DB, 30).catch((): Awaited<ReturnType<typeof spendByProvider>> => ({})),
    readRoutes(c.env.DB),
  ])
  const cards = await Promise.all(
    stored.map(async (p): Promise<PanelProvider> => {
      const secret = workerSecretOf(c, p)
      const [resolved, today] = await Promise.all([
        resolveKey(c.env.DB, c.env.TOKEN_ENC_KEY, p.name, secret.value),
        spendTodayFor(c.env.DB, p.name),
      ])
      return {
        name: p.name,
        label: p.label,
        kind: p.kind,
        baseUrl: p.baseUrl,
        model: p.model,
        builtin: p.builtin,
        configured: resolved.key !== null,
        secretName: secret.secretName,
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
  return { cards, routes, spend }
}

/**
 * أمزوّدُ المهمّة مضبوطٌ ومفعَّل؟ — زرٌّ لا ينادي أحدا لا يُعرض عاملا: الطريقُ جاهزٌ إن كان مزوّدُه
 * مضبوطا ومفعَّلا — وإلّا فالضغطةُ تنتهي إلى رسالةِ عطل.
 */
function taskReady(p: ProviderLoad, task: TaskName): boolean {
  return p.routes.some(
    (r) => r.task === task && p.cards.some((x) => x.name === r.provider && x.configured && x.enabled),
  )
}

/**
 * الحكمُ نفسُه لمهمّةٍ واحدة **بلا بطاقات** (D-280): «المكتبة» تقرأ جاهزيّةَ الكتابة وحدَها لزرّ «اكتب النصوص»،
 * فيُحلّ مفتاحُ مزوّدِ المهمّة وحدَه — ثلاثُ جملٍ لا اثنتان لكلّ مزوّد.
 */
export async function taskReadyAlone(c: PanelContext, task: TaskName): Promise<boolean> {
  const [routes, stored] = await Promise.all([readRoutes(c.env.DB), listProviders(c.env.DB)])
  for (const r of routes.filter((x) => x.task === task)) {
    const p = stored.find((x) => x.name === r.provider)
    if (p === undefined || !p.enabled) continue
    const resolved = await resolveKey(c.env.DB, c.env.TOKEN_ENC_KEY, p.name, workerSecretOf(c, p).value)
    if (resolved.key !== null) return true
  }
  return false
}

/**
 * **نقاطُ الجاهزيّة تحت زرَّي الصورة والمقطع** (D-163).
 *
 * ممّا حُمِّل وحدَه — البطاقاتُ والتوجيهُ والحارسُ والبيئة — ولا
 * استعلامَ جديد. **وكلُّ حكمٍ من الدالّة التي يحكم بها النداءُ نفسُه عند
 * الضغط**: `imageProviderGate` و`slideGate` و`videoFace` و`providerBlocker`.
 * والأسرارُ تُسأل عن وجودها لا عن قيمتها (D-005).
 */
function readiness(load: Load, p: ProviderLoad): { readonly slide: SlideGate; readonly mediaReady: MediaReady } {
  const { c, allowance, facts } = load
  const routeOf = (task: TaskName): string => p.routes.find((r) => r.task === task)?.provider ?? ''
  const cardOf = (name: string): PanelProvider | undefined => p.cards.find((x) => x.name === name)
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
  const mediaReady: MediaReady = {
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
  return { slide, mediaReady }
}

/**
 * جدولُ التوجيه بحاله.
 *
 * **والصورةُ والمقطعُ من نقطتيهما عينِهما** (D-163): كان الجدولُ يقول
 * «مزوّده غير جاهز» لصورٍ موجَّهةٍ إلى Cloudflare بمفتاح `CF_AI_TOKEN`
 * وهي تعمل، ولمقطعٍ يُنادى من البيئة — فتناقض شاشةُ المزوّدين نقطةً
 * تحت الزرّ تقول «جاهز». والمقطعُ لا يقرأ من توجيهه إلّا النموذج.
 *
 * **و«جاهز» هي «تامّة» وحدها**: رابطُ Worker وحده ينتظرك في النقطة،
 * فينتظرك في الجدول ولا يُعدّ في المهامّ الجاهزة — والرابطُ معرَّفٌ
 * في البيئتين، فكان كلُّ لوحٍ بلا `CF_AI_ACCOUNT_ID` يقول «جاهز».
 */
function routingOf(p: ProviderLoad, mediaReady: MediaReady): PanelData['routing'] {
  return p.routes.map((r) => {
    const dot = routeDot(mediaReady, r.task)
    return {
      task: r.task,
      provider: r.provider,
      model: r.model,
      fallback: r.fallback,
      why: r.why,
      implemented: r.implemented,
      ready: r.implemented && (dot === undefined
        ? p.cards.some((x) => x.name === r.provider && x.configured && x.enabled)
        : dot.state === 'done'),
      ...(r.implemented && dot?.state === 'now' ? { pending: dot.note } : {}),
    }
  })
}

function toPanelFactors(f: Awaited<ReturnType<typeof factorState>> | null): PanelFactors {
  if (f === null) return { passkeys: [], totpConfirmed: false, recoveryLeft: 0, recoveryStale: 0, enforced: false }
  return {
    passkeys: f.passkeys.map((k) => ({
      id: k.id,
      label: k.label,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    })),
    totpConfirmed: f.totp.confirmed,
    recoveryLeft: f.recovery.unused,
    recoveryStale: f.recovery.stale,
    enforced: f.enforced,
  }
}

/** الصورُ المولَّدة لهذه المنشورات — كما تراها الشاشة. */
async function loadMedia(c: PanelContext, ids: readonly string[]): Promise<MediaView[]> {
  return (await mediaFor(c.env.DB, [...new Set(ids)])).map((m) => ({
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
  }))
}

/**
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
function targetsOf(channels: readonly ChannelView[]): Target[] {
  return channels.flatMap((ch) =>
    ch.spec.built
      ? ch.accounts
          .filter((a) => a.status === 'active' && !isLinkedInPage(a))
          .map((a) => ({
            id: a.id,
            platform: ch.spec.id as PublishPlatform,
            label: `${a.displayName} · ${ch.spec.label}`,
          }))
      : [],
  )
}

/**
 * «نظرة عامّة»: الرحلةُ والبطاقاتُ و«ما ينتظرك» و«الكلفة وما وقع». أحدَ عشرَ انتظارًا مستقلًّا معًا — والأرقامُ
 * من الدفتر كلِّه (ر-10)، و«ما وقع اليوم» ممّا قُرئ أصلًا (D-127).
 */
async function overviewData(load: Load): Promise<OverviewData> {
  const { c, org, now, allowance, drafts, channels, zone } = load
  const [sources, series, spendMonth, p, media, outbox, loaded, audit, journey, open, factors] = await Promise.all([
    load.sources(),
    dailySpend(c.env.DB, 14),
    spendThisMonth(c.env.DB, zone, now),
    load.providers(),
    loadMedia(c, drafts.map((d) => d.id)),
    load.outbox(),
    load.pivotFacts(),
    load.audit(),
    // ‏والرحلةُ تُعدّ من القاعدة كلِّها لا من الستّين الأخيرة — استعلامان مجمَّعان (D-177)
    journeyCounts(c.env.DB, org, now),
    // عددٌ على رابط التقرير — والمالكُ لا يفتح شاشةً ليكتشف أنّ فيها ما ينتظره
    openSuggestions(c.env.DB, org),
    load.factors(),
  ])
  const { slide, mediaReady } = readiness(load, p)
  return {
    sources,
    media,
    journey,
    openSuggestions: open.length,
    // ‏حاجزُ الكتابة بحكم النداء نفسِه، ومنطقةُ المالك لساعة انفتاح السقف (ر-10)
    draftBlocker: blockerFor('draft', allowance.settings, allowance.usage),
    factors,
    providers: p.cards,
    routing: routingOf(p, mediaReady),
    dashboardTiles: allowance.settings.dashboardTiles,
    series: series.map((d) => ({ day: d.day, total: d.total })),
    // ‏من الدفتر كلِّه والاسمُ من المزوّدين حيث وُجد (ر-10): X يُحاسَب على كلّ طلب
    spendBy: spendRows(p.spend, Object.fromEntries(p.cards.map((x) => [x.name, x.label]))),
    spendMonth,
    // «ما وقع اليوم» ممّا قُرئ أعلاه — ولا استعلامَ جديد (D-127)
    today: todayFeed({ now, audit, drafts, facts: loaded.facts }),
    autoEnqueue: allowance.settings.autoEnqueue,
    // **وجودُ السرّ يُفحَص لا قيمتُه** — والقيمةُ لا تغادر البيئة (D-042)
    slide,
    analysisCap: allowance.settings.dailyAnalysisCap,
    spendCap: allowance.settings.dailySpendCapUsd,
    // لانهاية تعني دفترا لا يُقرأ — تُعرض صفرا لا `Infinity` في الشاشة
    usedAnalyses: Number.isFinite(allowance.usage.analyses) ? allowance.usage.analyses : 0,
    usedSpend: Number.isFinite(allowance.usage.spend) ? allowance.usage.spend : 0,
    targets: targetsOf(channels),
    outbox,
    alertWebhook: allowance.settings.alertWebhook,
    planReady: taskReady(p, 'plan'),
  }
}

/** ما ينتظر الحصّةَ المجّانيّة اليوم، وكلفتُه الآن، وقرارُ المالك إن قاله (D-285). */
async function imageQuotaOf(c: PanelContext, org: string, recent: readonly { action: string }[]): Promise<NonNullable<PostsData['imageQuota']>> {
  // ‏ولا جملةَ جديدةً في كلّ فتحة (D-280): السجلُّ المحمَّلُ أصلًا يقول أوقع انتظارٌ قريبًا، والسؤالُ الدقيقُ بعده وحدَه
  if (!recent.some((a) => a.action === 'image.quota_wait')) return { waiting: 0, usd: 0, decided: null }
  const waiting = await waitingImages(c.env.DB, org)
  if (waiting.length === 0) return { waiting: 0, usd: 0, decided: null }
  const decision = await c.env.DB
    .prepare("SELECT action FROM audit_log WHERE org_id = ? AND action IN ('image.overage.approve', 'image.overage.wait') AND at >= date('now') ORDER BY id DESC LIMIT 1")
    .bind(org).first<{ action: string }>().catch(() => null)
  return {
    waiting: waiting.length,
    usd: waiting.reduce((sum, w) => sum + w.neurons * NEURON_USD, 0),
    decided: decision === null ? null : decision.action === 'image.overage.approve' ? 'pay' : 'wait',
  }
}

/**
 * «المنشورات»: المسوّداتُ ومحرّرُها والخطّة.
 *
 * ‏**والمحرّرُ المركّزُ من العنوان** (D-198): `?open=<id>` يرسم المنشورَ بجوار القائمة، فيُفتح برابطٍ
 * ‏ويُحفَظ ويعمل بلا سكربت. والمعرّفُ يُفحَص قبل أن يُسأل عنه، ومنشورٌ أقدمُ من الستّين يُقرأ وحدَه.
 */
async function postsData(load: Load): Promise<PostsData> {
  const { c, org, allowance, drafts, channels, accounts, q } = load
  const openId = q.get('open') ?? ''
  const editing = POST_ID.test(openId)
    ? (drafts.find((d) => d.id === openId) ?? await getDraft(c.env.DB, org, openId))
    : null
  const board = [...drafts, ...(editing === null ? [] : [editing])]
  /*
   * **وذروةُ المنصّات التي في المسوّدات وحدَها** (D-106).
   *
   * لكلّ منصّةٍ استعلامُها، **وقراءةُ الأربع كلِّها في كلّ فتحةٍ للوحة
   * ثلاثةُ استعلاماتٍ لا يقرؤها أحد** حين لا تكون في المسوّدات منصّةٌ
   * غيرُ واحدة. فتُقرأ ما في اليد لا ما قد يقع.
   */
  const platforms = [...new Set(board.map((d) => d.platform))]
  const [sources, p, media, plan, audit, peakRows, brief, units] = await Promise.all([
    load.sources(),
    load.providers(),
    loadMedia(c, board.map((d) => d.id)),
    latestPlan(c.env.DB, org),
    load.audit(),
    Promise.all(platforms.map(async (platform): Promise<[string, Peaks]> => [platform, await readPeaks(c.env.DB, org, platform)])),
    readBrief(c.env.DB, org),
    unitCosts(c.env.DB, org),
  ])
  const { mediaReady } = readiness(load, p)
  const progress = plan === null ? null : await planProgress(c.env.DB, org, plan.id)
  return {
    // ‏نموذجُ الخطّة (D-282): القنواتُ المربوطةُ بحسابٍ نشط، وقنواتُ الموجز وإيقاعُه، والمصادرُ المحلَّلة، ووسيطُ كلفة الصورة
    planForm: {
      linked: [...new Set(accounts.filter((a) => a.status === 'active').map((a) => a.platform as string))],
      chosen: brief.channels,
      perWeek: brief.perWeek,
      sources: sources.filter((x) => x.analyzed).map((x) => ({ id: x.id, name: x.name })),
      perImage: units.perImage,
      autoImage: allowance.settings.autoImage,
    },
    planPending: progress?.pending ?? 0,
    ...(progress === null ? {} : { planCounts: progress }),
    imageQuota: await imageQuotaOf(c, org, audit),
    editing,
    media,
    targets: targetsOf(channels),
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
        (ch) =>
          ch.spec.built &&
          ch.accounts.some((a) => a.status === 'active') &&
          !ch.accounts.some((a) => a.status === 'active' && !isLinkedInPage(a)),
      )
      .map((ch) => ch.spec.id),
    peaks: Object.fromEntries(peakRows),
    mediaReady,
    writableSources: sources
      .filter((x) => x.analyzed)
      .map((x) => ({ id: x.id, name: x.name })),
    draftReady: taskReady(p, 'draft'),
    // ‏ومن يكتب للمقارنة من ضُبط مفتاحه وفُعِّل لا من وُجد صفّه (D-244)
    writers: p.cards
      .filter((x) => x.configured && x.enabled)
      .map((x) => ({ name: x.name, label: x.label })),
    draftBlocker: blockerFor('draft', allowance.settings, allowance.usage),
    // ‏أمتّصلةٌ كلُّ منصّة — حيث تُختار المنصّة (D-190)
    links: linkStates(accounts),
    // ‏ومفتاحُ مسوّدة «بنفسي» في المتصفّح لهذه المنظّمة وهذا العضو (مراجعة D-324)
    ownScope: await ownScopeOf(org, load.session.record.email ?? OWNER_EMAIL),
    plan,
    planReady: taskReady(p, 'plan'),
    sources,
    audit,
  }
}

/** ‏بصمةُ المنظّمة والعضو (مراجعة D-324): ستّةَ عشرَ محرفًا من SHA-256 — لا البريدُ نفسُه في الصفحة. */
async function ownScopeOf(org: string, email: string): Promise<string> {
  const bytes = await digest(org + '\n' + email.toLowerCase())
  return Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** «المكتبة»: المصادرُ والمقاطعُ (ونصوصُها من KV) والصور، وجاهزيّةُ الكتابة لزرّ «اكتب النصوص». */
async function libraryData(load: Load): Promise<LibraryData> {
  const { c, org, allowance, drafts, accounts } = load
  const [sources, uploads, scopes, media, draftReady] = await Promise.all([
    load.sources(),
    listUploads(c.env.DB, org),
    // ‏مَن يرى المقطع بحكم الناشر: القرارُ ونطاقُ حساب TikTok النشط (D-190)
    activeScopes(c.env.DB, org, 'tiktok'),
    loadMedia(c, drafts.map((d) => d.id)),
    taskReadyAlone(c, 'draft'),
  ])
  /*
   * ‏**ونصوصُ المقاطع المكتوبة من KV** (D-190) — لما بقي فيه ما يُنشأ وحدَه: مقطعٌ أُنشئ على
   * ‏منصّاته كلِّها لا حقولَ له، فلا يُقرأ. قراءةٌ لكلّ مقطعٍ مفتوح، وهي قليلةٌ عادةً.
   */
  const open = uploads.filter(
    (u) => u.status === 'ready' && !VIDEO_PLATFORMS.every((p) => u.posts.some((x) => x.platform === p)),
  )
  const captions: Record<string, VideoCaptions> = {}
  for (const [id, found] of await Promise.all(open.map(async (u) => [u.id, await readCaptions(c.env.KV, u.id)] as const))) {
    if (found !== null) captions[id] = found
  }
  return {
    sources,
    uploads,
    captions,
    links: linkStates(accounts),
    reach: reachOf(allowance.settings, scopes),
    draftReady,
    draftBlocker: blockerFor('draft', allowance.settings, allowance.usage),
    media,
  }
}

/** «الإعدادات»: الحدودُ ومستهلَكُها، والمزوّدون وتوجيهُهم، والأجهزةُ والعواملُ وسجلُّ النشاط. */
async function settingsData(load: Load): Promise<SettingsData> {
  const { c, org, session, allowance } = load
  const owner = (session.record.role ?? 'owner') === 'owner'
  const [usedImages, outbox, sessions, factors, audit, p] = await Promise.all([
    // ‏ما وُلّد اليوم من صور — بجانب سقفها في «الإنفاق والحدود» (D-255)
    c.env.DB
      .prepare("SELECT COUNT(*) AS n FROM media WHERE org_id = ? AND created_at >= date('now') AND mime LIKE 'image/%'")
      .bind(org)
      .first<{ n: number }>()
      .catch(() => null)
      .then((row) => row?.n ?? 0),
    load.outbox(),
    // ‏جلساتُ صاحب الصفحة وحدَه (D-318)، و«الكلّ» بأصحابها للمالك وحدَه — قسمُ الأجهزة لا يُرسَم لغيره أصلًا
    listSessions(c.env.KV, session.id, owner ? 'all' : undefined),
    load.factors(),
    load.audit(),
    load.providers(),
  ])
  const { slide, mediaReady } = readiness(load, p)
  const s = allowance.settings
  return {
    dashboardTiles: s.dashboardTiles,
    analysisCap: s.dailyAnalysisCap,
    usedAnalyses: Number.isFinite(allowance.usage.analyses) ? allowance.usage.analyses : 0,
    spendCap: s.dailySpendCapUsd,
    usedSpend: Number.isFinite(allowance.usage.spend) ? allowance.usage.spend : 0,
    videoCap: s.dailyVideoCap,
    usedClips: Number.isFinite(allowance.usage.clips) ? allowance.usage.clips : 0,
    promoCap: s.weeklyPromoCapUsd,
    autoEnqueue: s.autoEnqueue,
    autoImage: s.autoImage,
    imageCap: s.dailyImageCap,
    usedImages,
    // ‏قناعُ القناة وما خرج إليها للمالك وحدَه (D-318) — لا يُحمَل لغيره ولو لم يُرسَم
    alertWebhook: owner ? s.alertWebhook : '',
    outbox: owner ? outbox : [],
    imageOverlay: s.imageOverlay,
    slide,
    sessions,
    factors,
    audit,
    providers: p.cards,
    routing: routingOf(p, mediaReady),
    knownProviders: p.cards.map((x) => ({ name: x.name, label: x.label })),
    cfAccountId: (c.env.CF_AI_ACCOUNT_ID ?? '') === '' ? null : (c.env.CF_AI_ACCOUNT_ID ?? null),
    baseUrl: c.env.PUBLIC_BASE_URL,
    adminApi: s.adminApi,
  }
}

/**
 * «التحليل» — **واللوحُ المحوريُّ يُقرأ من العنوان** (D-120).
 *
 * فالعرضُ كلُّه في الرابط: يُنسَخ ويُرسَل ويُحفَظ في المفضّلة. **وما
 * لا يُعرَف من قيمةٍ يعود إلى افتراضه** ولا يُسقط الصفحة — القيمُ تأتي
 * من الشبكة، **ونصٌّ في `SQL` أو في المخرَج لا يقع** لأنّها تُطابَق
 * بقائمة سماحٍ لا تُمرَّر.
 */
async function resultsData(load: Load): Promise<ResultsData> {
  const { q } = load
  const pivotRows = readDimension(q.get('rows') ?? undefined, 'platform')
  const pivotCols = readCols(q.get('cols') ?? undefined)
  const pivotMeasure = readMeasure(q.get('m') ?? undefined, 'count')
  const loaded = await load.pivotFacts()
  return {
    pivot: {
      table: pivot(loaded.facts, { rows: pivotRows, cols: pivotCols, measure: pivotMeasure }),
      rows: pivotRows,
      cols: pivotCols,
      measure: pivotMeasure,
      sinceDays: readSpan(q.get('days')),
      capped: loaded.capped,
      cap: FACT_CAP,
    },
  }
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

  /*
   * ‏**وعنوانُ القناة سرٌّ حامل** (D-318): يُحفَظ مشفَّرًا، ولا يُكتب كاملًا في سجلّ النشاط ولا في الإشعار — قناعُه وحدَه.
   * ‏والفراغُ لا يُزيل القناةَ إلّا بزرّ «أزل القناة» (`clear=1`): الحقلُ يُرسَم فارغًا للمالك (لا يُعاد إليه السرّ)، فضغطةُ
   * ‏«احفظ» عليه فارغًا كانت ستمحو قناةً قائمةً بلا قصد.
   */
  if (key === 'alert_webhook') {
    const clearing = value.trim() === '' && form.get('clear') === '1'
    if (value.trim() === '' && !clearing) {
      await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'لم يتغيّر شيء: الصق عنوانًا جديدًا، أو اضغط «أزل القناة».' })
      return back('settings')
    }
    const saved = await saveWebhook(c.env.DB, c.env.TOKEN_ENC_KEY, value, 'panel')
    if (saved.kind !== 'refused') {
      await record(c.env.DB, {
        actor: 'panel', action: 'settings.write', target: key, detail: ['←', saved.kind === 'set' ? saved.hint : 'لا قناة'].join(' '),
      }, c.req.raw)
    }
    await setFlash(c.env, c.req.raw, saved.kind === 'set'
      ? { kind: 'ok', text: 'قناة التنبيهات: حُفظت مشفَّرةً — ' + saved.hint }
      : saved.kind === 'cleared'
        ? { kind: 'ok', text: 'أُزيلت قناة التنبيهات. لا يخرج تنبيهٌ حتّى تضبط غيرها.' }
        : { kind: 'bad', text: 'لم تُحفَظ القناة: ' + saved.reason + '. وما كان مضبوطًا باقٍ كما هو.' })
    if (form.get('auto') === '1') return c.json({ ok: saved.kind !== 'refused' })
    return back('settings')
  }

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
  } else if (key === 'admin_api') {
    // ‏أبوابُ الطرفيّة (D-318) — يُقال ما فُتح وما بقي، لا «true»
    flash = result.stored === 'true'
      ? { kind: 'warn', text: 'فُتحت أبواب الطرفيّة الثلاثة لكلمة الإدارة: خدمات الكتابة والمصادر والتحليل المدفوع — وكلّ نداء في سجلّ النشاط.' }
      : { kind: 'ok', text: 'أُغلقت أبواب الطرفيّة الثلاثة. تبقى الجاهزيّة والمسح.' }
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

  // ‏**والحفظُ التلقائيّ في الحدود** (D-232): الحقلُ يُرسَل حين يتغيّر بـ`auto=1`، فيُجاب بسطرٍ والقيمةِ المحفوظة
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
      media: c.env.MEDIA,
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
