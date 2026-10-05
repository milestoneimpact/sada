/**
 * يرسم الشاشاتِ الجديدة إلى ملفّاتٍ لتُرى.
 *
 * أخوها `render_panel.ts`، ولنفس السبب: **التصميم لا يُبنى بالاستدلال.**
 * والفرقُ بين «صحيحٍ في الحساب» و«جميلٍ في العين» لا يُدرَك إلا بالنظر.
 *
 * وتستورد الدوالَّ نفسَها لا نسخةً منها، فما يُرى هنا هو ما يُرسَل.
 */
import { fixtureImage, writeAudited } from './writeAudited'
import { viewChannels, type LinkedAccount } from '../src/lib/channels'
import { scopeSet } from '../src/lib/oauth/scopes'
import { platformScreen } from '../src/routes/ui/platformView'
import { channelsSection } from '../src/routes/ui/channels'
import type { AppStatus } from '../src/lib/oauth/apps'
import { connectedBody, refusedBody } from '../src/routes/ui/oauthResult'
import { reportScreen } from '../src/routes/ui/reportView'
import { tasksScreen } from '../src/routes/ui/tasksView'
import { ownerRows } from '../src/lib/owner'
import { currentPhase, gatesOf, type GateFacts } from '../src/lib/gates'
import { summarize, type ReportPost, type StoredReport } from '../src/lib/report/weekly'
import { soloPage } from '../src/routes/ui/shell'
import { soloNav } from '../src/routes/ui/rail'
import { buildCommands } from '../src/routes/ui/command'
import { journeyBody } from '../src/routes/ui/journeyView'
import { spreadScreen } from '../src/routes/ui/spreadView'
import { loginPage } from '../src/routes/panelView'
import { secondFactorPage } from '../src/routes/authView'
import { notFoundPage, serverErrorPage } from '../src/routes/ui/errorView'
import type { Journey } from '../src/lib/journey'
import { platformNeeds } from '../src/lib/platform/needs'
import type { PlatformCounts, TimelineRow } from '../src/lib/platform/timeline'

const now = new Date('2026-09-06T09:00:00Z')
const ago = (h: number): string =>
  new Date(now.getTime() - h * 3600_000).toISOString().slice(0, 19).replace('T', ' ')

const accounts: LinkedAccount[] = [
  { id: 'linkedin:member:abc', platform: 'linkedin', kind: 'member',
    displayName: 'عمر عبدالحميد', status: 'active', createdAt: ago(700), expiresAt: ago(-5 * 24) },
  { id: 'linkedin:org:99', platform: 'linkedin', kind: 'org',
    displayName: 'بصائر للاستشارات', status: 'active', createdAt: ago(300), expiresAt: ago(-40 * 24) },
  { id: 'x:member:4242', platform: 'x', kind: 'member',
    displayName: '@omar_ah', status: 'active', createdAt: ago(40), expiresAt: ago(-40 * 24) },
]

const views = viewChannels(accounts, () => true)
const li = views.find((v) => v.spec.id === 'linkedin')!
const x = views.find((v) => v.spec.id === 'x')!
const ig = views.find((v) => v.spec.id === 'instagram')!
const yt = views.find((v) => v.spec.id === 'youtube')!

/*
 * **والشريطُ من مصدره لا نسخةٌ منه** (D-140): كان يُكتب هنا حرفًا،
 * فتُدقَّق الشاشاتُ بشريطٍ ليس شريطَ المنتَج — وعلامةٌ أُضيفت إليه لم
 * تصل المدقّقَ ولا اللقطة.
 */
// العيّنةُ من القالب الذي يُخدَم (D-151) — لا غلافٍ ثالث
// ‏والقسمُ المعلَّمُ في الرافدة من العنوان (D-178): التقريرُ والمهامُّ أقسامُهما، والباقي منصّات
const page = (
  title: string,
  body: string,
  active = title.includes('التقرير') ? 'report' : title.includes('مهامُّ') ? 'tasks' : 'channels',
): string =>
  soloPage(title, { href: '/panel#channels', label: 'القنوات' }, body, 'n', '', buildCommands({ onPanel: false }), soloNav(active))

// ── صفحاتُ المنصّات: صفحةُ حساب (D-172) ─────────────────────────────
const tt = views.find((v) => v.spec.id === 'tiktok')!
const snap = views.find((v) => v.spec.id === 'snapchat')!

/** صفٌّ في الخطّ الزمنيّ — والناقصُ من الحقول فارغٌ لا مخترَع. */
const row = (over: Partial<TimelineRow> & Pick<TimelineRow, 'id' | 'status' | 'text'>): TimelineRow => ({
  scheduledAt: null, createdAt: ago(48), dispatchedAt: null, accountName: 'عمر عبدالحميد', accountKind: 'member',
  sourceName: null, platformPostId: null, publishedAt: null, failedAt: null, failure: null, tries: 0,
  lastTryAt: null, openTries: 0, hasMedia: false, costUsd: 0.012, sortAt: ago(48), ...over,
})
const soon = (h: number): string => ago(-h)

const liHealth = {
  'linkedin:member:abc': {
    status: 'active' as const, expiresAt: ago(-1200), refreshExpiresAt: ago(-7000), refreshedAt: ago(30), needsReauthAt: null,
    alerts: [{ kind: 'access' as const, threshold: 7, at: ago(6) }],
  },
  'linkedin:org:99': { status: 'active' as const, expiresAt: ago(-100), refreshExpiresAt: null, refreshedAt: null, needsReauthAt: null, alerts: [] },
}
const base = {
  app: undefined, baseUrl: 'https://sada2.basserh.com', now, zone: 'Asia/Riyadh', flash: null,
  filter: 'all' as const, costs: {}, scopes: {}, posts: [], waiting: [],
}
const counts = (over: Partial<PlatformCounts> = {}): PlatformCounts => ({
  waiting: 0, ready: 0, queued: 0, published: 0, failed: 0, missingMedia: 0, ...over,
})
const tally0 = { published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null }

const liUpcoming = [
  row({ id: 'u1', status: 'queued', scheduledAt: soon(26), sortAt: soon(26),
    text: 'تقريرُ الإغلاق ليس وثيقةً إداريّة — هو آخرُ فرصةٍ لتحويل ما تعلّمناه إلى شيءٍ يُقرأ بعدنا.\n\n#إدارة_المشاريع #الأثر' }),
  row({ id: 'u2', status: 'queued', scheduledAt: ago(0.5), sortAt: ago(0.5),
    text: 'موعدٌ حلّ ولم تُرسله الدورةُ بعد — والصفُّ يقول ذلك بدقائقه.' }),
  row({ id: 'u3', status: 'queued', scheduledAt: ago(3), dispatchedAt: ago(2.5), sortAt: ago(3),
    text: 'غادر إلى الطابور ولم يعُد جوابُه — فيُقال «عالق» ومعه طريقُ الإعادة.' }),
]
const liHistory = [
  row({ id: 'p1', status: 'published', platformPostId: 'urn:li:share:7311', publishedAt: ago(19), sortAt: ago(19), tries: 1,
    text: 'قيادةُ القيمة لا تُقاس بالمخرجات بل بالمعالم.\n\nوأكثرُ ما يُهدر في المشروعات ليس وقتا ولا مالا — بل انتباهًا يُصرف على ما لا يُحرّك المعلم التالي.\n\n#القيادة #المشاريع' }),
  row({ id: 'p3', status: 'failed', failedAt: ago(50), sortAt: ago(50), tries: 1, accountName: 'بصائر للاستشارات', accountKind: 'org',
    failure: 'token_expired', text: 'ثلاثةُ أسئلةٍ قبل أن تبدأ مشروعا: مَن يقرّر أنّه نجح؟ ومتى؟ وبأيّ رقم؟' }),
  row({ id: 'p6', status: 'published', platformPostId: 'urn:li:share:7290', publishedAt: ago(75), sortAt: ago(75), tries: 2,
    text: 'المعلمُ الذي لا يُقاس لا يُدار. والذي يُقاس ولا يُقرأ لا يُدار كذلك.' }),
]

writeAudited(
  '/tmp/screen-linkedin.html',
  page('صدى — LinkedIn', platformScreen({
    ...base, view: li, tab: 'posts', health: liHealth,
    tally: { published: 14, queued: 3, failed: 1, drafts: 2, spend: 0.42, lastPublishedAt: ago(19) },
    counts: counts({ waiting: 2, ready: 1, queued: 3, published: 14, failed: 1, missingMedia: 2 }),
    needs: platformNeeds('linkedin'),
    upcoming: liUpcoming,
    history: { rows: liHistory, next: `${ago(75)}|p6` },
    costs: { p1: 0.019 },
    metrics: { p1: [{ window: '72h', impressions: null, reactions: 84, comments: 12, shares: 3, pulledAt: ago(3) }] },
    media: {
      u1: [{ id: 'm-li', mime: 'image/png', status: 'ready', note: '' }],
      p1: [{ id: 'm-sq', mime: 'image/jpeg', status: 'ready', note: null }],
      p6: [{ id: 'm-missing', mime: 'image/jpeg', status: 'ready', note: '' }],
    },
  })),
  { 'm-li': fixtureImage(1200, 628, 205), 'm-sq': fixtureImage(1024, 1024, 25) },
)

writeAudited(
  '/tmp/screen-li-setup.html',
  page('صدى — LinkedIn · الإعداد', platformScreen({
    ...base, view: li, tab: 'setup', health: liHealth,
    tally: { published: 14, queued: 3, failed: 1, drafts: 2, spend: 0.42, lastPublishedAt: ago(19) },
    counts: counts({ waiting: 2, ready: 1, queued: 3, published: 14, failed: 1 }),
    needs: platformNeeds('linkedin'), upcoming: [], history: { rows: [], next: null },
    metrics: {}, media: {},
    // الحسابُ الأوّل كاملُ النطاقات، والثاني ينقصه النشر — وهي الحالُ التي وقعت فعلا
    scopes: { 'linkedin:member:abc': scopeSet('linkedin').join(' '), 'linkedin:org:99': 'openid profile' },
  })),
)

writeAudited(
  '/tmp/screen-x.html',
  page('صدى — X', platformScreen({
    ...base, view: x, tab: 'posts', health: {},
    tally: { published: 1, queued: 1, failed: 0, drafts: 0, spend: 0.03, lastPublishedAt: ago(30) },
    counts: counts({ queued: 1, published: 1 }),
    needs: platformNeeds('x'),
    upcoming: [row({ id: 'x2', status: 'queued', scheduledAt: soon(5), sortAt: soon(5), accountName: '@omar_ah',
      text: 'فكرةٌ واحدةٌ كاملة في منشورٍ واحد. والقِصَرُ هنا قوّةٌ لا نقص. #قيادة' })],
    history: { rows: [row({ id: 'x1', status: 'published', platformPostId: '1874', publishedAt: ago(30), sortAt: ago(30),
      accountName: '@omar_ah', text: 'المعلمُ الذي لا يُقاس لا يُدار.' })], next: null },
    metrics: { x1: [{ window: '24h', impressions: 1204, reactions: 31, comments: 4, shares: 2, pulledAt: ago(6) }] },
    media: { x2: [{ id: 'm-x', mime: 'image/png', status: 'ready', note: '' }] },
  })),
  { 'm-x': fixtureImage(1200, 675, 160) },
)

writeAudited(
  '/tmp/screen-tiktok.html',
  page('صدى — TikTok', platformScreen({
    ...base, view: tt, tab: 'posts', health: {}, zone: null,
    tally: tally0,
    counts: counts({ queued: 1, missingMedia: 1 }),
    needs: platformNeeds('tiktok'),
    upcoming: [row({ id: 't1', status: 'queued', scheduledAt: soon(50), sortAt: soon(50),
      text: 'سطرٌ يُغري بالمشاهدة ولا يشرح ما سيُرى. #مشاريع #قيادة' })],
    history: { rows: [row({ id: 't0', status: 'failed', failedAt: ago(20), sortAt: ago(20), tries: 1,
      failure: 'no_clip: لا مقطعَ لهذا المنشور — ولّد صورةً ثمّ حرّكها', text: 'منشورٌ بلا مقطع يُردّ قبل الإرسال.' })], next: null },
    metrics: {},
    media: { t1: [{ id: 'm-tt', mime: 'image/png', status: 'ready', note: '' }] },
  })),
  { 'm-tt': fixtureImage(1080, 1920, 280) },
)

/*
 * ‏**«مَن يرى ما تنشره» في إعداد YouTube** (D-190): مفتاحُ النشر العلنيّ بعد الإجازة — خاصٌّ بالافتراض.
 * ‏يُرسم ليُقاس: البطاقةُ وزرُّها الأوّليّ وسطرُ «ما عليك لتُجاز» على الهاتف.
 */
writeAudited(
  '/tmp/screen-yt-setup.html',
  page('صدى — YouTube · الإعداد', platformScreen({
    ...base, view: yt, tab: 'setup', health: {},
    tally: tally0, counts: counts(), needs: platformNeeds('youtube'),
    upcoming: [], history: { rows: [], next: null }, metrics: {}, media: {},
    reachPublic: false,
  })),
)

writeAudited(
  '/tmp/screen-link-only.html',
  page('صدى — YouTube', platformScreen({
    ...base, view: yt, tab: 'media', health: {},
    tally: tally0, counts: counts({ queued: 1 }),
    needs: platformNeeds('youtube'),
    upcoming: [row({ id: 'y1', status: 'queued', scheduledAt: soon(30), sortAt: soon(30),
      text: 'عنوانُ المقطع في السطر الأوّل\n\nوالوصفُ بعده لا يظهر إلّا لمن فتحه.' })],
    history: { rows: [], next: null }, metrics: {},
    media: { y1: [{ id: 'm-yt', mime: 'image/png', status: 'ready', note: '' }] },
  })),
  { 'm-yt': fixtureImage(1080, 1920, 5) },
)

writeAudited(
  '/tmp/screen-unbuilt.html',
  page('صدى — Snapchat', platformScreen({
    ...base, view: snap, tab: 'posts', health: {}, tally: tally0, counts: counts(), needs: null,
    upcoming: [], history: { rows: [], next: null }, metrics: {}, media: {},
  })),
)

writeAudited(
  '/tmp/screen-instagram.html',
  page('صدى — Instagram', platformScreen({
    ...base, view: ig, tab: 'waiting', health: {}, tally: tally0, counts: counts({ waiting: 1 }),
    needs: platformNeeds('instagram'), upcoming: [], history: { rows: [], next: null }, metrics: {}, media: {},
    waiting: [row({ id: 'i1', status: 'draft', sourceName: 'رؤية 2026.docx',
      text: 'تعليقٌ على صورةٍ لم تُولَّد بعد — والإطارُ يقول إنّ Instagram لا تنشر بلا صورة.' })],
  })),
)

writeAudited(
  '/tmp/screen-refused.html',
  page(
    'صدى — لم يكتمل الربط',
    refusedBody({
      platform: 'linkedin',
      reason: 'unauthorized_scope_error',
      requested: scopeSet('linkedin'),
      identityRetry: true,
    }),
  ),
)

writeAudited(
  '/tmp/screen-connected.html',
  page(
    'صدى — رُبط',
    connectedBody({
      platform: 'linkedin',
      displayName: 'عمر عبدالحميد',
      grantedScopes: ['openid', 'profile'],
      hasRefresh: true,
      expiresAt: '2026-11-06T09:00:00.000Z',
    }),
  ),
)

// ── شاشةُ التقرير: أرقامٌ حقيقيّةُ الشكل، وفراغٌ حيث لا قياس ─────────
const reportPost = (
  id: string, platform: 'linkedin' | 'x',
  impressions: number | null, interactions: number,
): ReportPost => ({
  id, platform, text: `نصُّ المنشور ${id} — سطرٌ يُقرأ كما يُعرَض في الشاشة.`,
  publishedAt: '2026-08-26T10:00:00.000Z', window: '24h', impressions, interactions,
})

const week = summarize(
  [
    reportPost('a', 'x', 4200, 96),
    reportPost('b', 'x', 1100, 21),
    reportPost('c', 'x', 980, 18),
    reportPost('d', 'linkedin', null, 34),
    reportPost('e', 'linkedin', null, 12),
  ],
  new Date('2026-08-24T00:00:00Z'),
  new Date('2026-08-31T00:00:00Z'),
  1.84,
)

const stored: StoredReport = {
  id: '2026-08-24',
  from: week.from,
  to: week.to,
  createdAt: '2026-08-31T04:14:00.000Z',
  body: week,
}

writeAudited(
  '/tmp/screen-report.html',
  page('صدى — التقرير الأسبوعيّ', reportScreen({
    reports: [stored],
    current: stored,
    promoCapUsd: 20,
    now,
    // ‏«هذا الشهر حتّى اليوم» تحت الرأس (ر-10)
    month: { total: 7.62, utc: false },
    suggestions: [
      {
        postId: 'a', platform: 'x',
        text: 'منشورُ a المرشَّح للترويج — سطرٌ يُقرأ كما يُعرَض في التقرير.',
        budgetUsd: 10, currency: 'USD',
        reason: 'تفاعلُه 96 — 4.6× وسيطَ نافذة ‏٢٤ ساعة (3 منشورات). ' +
          'والمبلغُ 10$ نصفُ سقفٍ وضعتَه (20$)، ولا يُنفَق حتّى تقبله.',
        createdAt: '2026-08-31T04:14:00.000Z',
      },
    ],
  })),
)

// ── معالجُ الربط في حالاته التي تهمّ ────────────────────────────────
//
// **ومحاكاةٌ كلُّها مربوطةٌ لا تُري شيئا**: أربعُ خطواتٍ «تمّت» تبدو
// صحيحةً وتُخفي أنّ الحالاتِ الأخرى لم تُرسَم قطّ. فتُرسَم هنا صراحةً
// ليراها المدقّقان والعين (D-061).
const app = (over: Partial<AppStatus>): AppStatus => ({
  platform: 'x', source: 'vault', clientId: '78k4gm3yw1g18e', hint: 'WPL_…kw==',
  updatedAt: ago(2), updatedBy: 'panel', secretNames: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  verifiedAt: null, verifiedKind: null,
  ...over,
})

const soloX = viewChannels(
  accounts.filter((a) => a.platform === 'linkedin'),
  () => true,
)

const wizardCases: { title: string; app: AppStatus }[] = [
  { title: 'محفوظٌ ولم يُفحَص', app: app({}) },
  { title: 'فُحص فرُدّ السرّ', app: app({ verifiedKind: 'bad_secret', verifiedAt: ago(1) }) },
  { title: 'ومعرّفٌ لا تعرفه المنصّة', app: app({ verifiedKind: 'bad_client_id', verifiedAt: ago(1) }) },
  { title: 'وجاز الفحصُ ولم يُربَط بعد', app: app({ verifiedKind: 'accepted', verifiedAt: ago(1) }) },
]

writeAudited(
  '/tmp/screen-wizard.html',
  page(
    'صدى — معالجُ الربط',
    wizardCases
      .map(
        // ‏كلُّ حالٍ شاشةٌ مستقلّة في الحقيقة، فتُعلَّم ليعدّ «audit_design» نحاسَها وحدَها
        // ‏لا الأربعَ معًا (ميزانيّةُ النحاس لكلّ شاشة، خطّة التصميم 3.2 · D-187)
        (c, i) => `<section data-screen="wizard-${i + 1}"><h2 class="sec">${c.title}</h2>` +
          channelsSection(soloX, now, [c.app], 'https://sada2.basserh.com') + '</section>',
      )
      .join(''),
  ),
)

// ── «ما عليك»: الحالاتُ الثلاث في صفحةٍ واحدة ───────────────────────
// حالٌ وسطى في البوّابات: بندٌ تحقّق، وبندٌ لا، وبندٌ لا يُقاس.
// **وواحدٌ لا اثنان**: كان هذا الحرفيُّ مكتوبا مرّتين — للبوّابات وللمرحلة
// — فيُعدَّل أحدُهما وتُرسَم شاشةٌ تناقض نفسَها.
const GATE_FIXTURE: GateFacts = {
  publishedPerPlatform: { linkedin: 4, x: 2 },
  publishedWithMedia: { linkedin: 1 },
  ledgerPerPlatform: { linkedin: 4, x: 2 },
  scheduledPublished: 3,
  plans: 1, reports: 0, suggestions: 0, promoSpend: 0, orgAccounts: 1,
  weekAlertFired: false,
}

writeAudited(
  '/tmp/screen-tasks.html',
  page(
    'صدى — مهامُّ المالك',
    tasksScreen({
      env: 'staging',
      rows: ownerRows({
        // حالٌ وسطى: بعضٌ تمّ، وبعضٌ عليك، وبعضٌ لا يُعرَف
        secrets: new Set(['TOKEN_ENC_KEY', 'ADMIN_TOKEN']),
        vars: new Set(['CF_AI_ACCOUNT_ID']),
        linked: new Set(['linkedin']),
        appsConfigured: new Set(['linkedin', 'x']),
        appsVerified: new Set(['linkedin']),
        anyPublished: false,
        videoPriced: false,
        linkedInVersionDue: true,   // D-072: حالٌ وسطى تُرسَم لتُقاس
              tilesChosen: 4, promoCapUsd: 0,
      }),
      // حالٌ وسطى في البوّابات كذلك: بندٌ تحقّق، وبندٌ لا، وبندٌ لا يُقاس
      gates: gatesOf(GATE_FIXTURE),
      phase: currentPhase(
        gatesOf(GATE_FIXTURE),
      ),
    }),
  ),
)

// ── أربعُ شاشاتٍ كانت بلا عيّنة (D-124) ─────────────────────────────
// الرحلةُ والتوزيعُ والدخولُ والعاملُ الثاني **لم يرَها مدقّقٌ قطّ**: تُرسَم
// في الخادم من الدوالّ نفسِها، ولا ملفَّ لها في /tmp فلا تدخل المدقّقات
// الثلاثة. **وشاشةٌ لا تُرسَم لا تُقاس، وما لا يُقاس يشيخ صامتا.**
const journey: Journey = {
  postId: 'p1', platform: 'linkedin', status: 'published', spent: 0.0723,
  text: 'قيادةُ القيمة لا تُقاس بالمخرجات بل بالمعالم.\n\nوأكثرُ ما يُهدر في المشروعات ليس وقتا ولا مالا — بل انتباهٌ يُصرف على ما لا يُحرّك المعلمَ التالي.',
  stations: [
    { kind: 'source', title: 'ملفٌّ في Drive', at: ago(200), detail: 'منهجية إدارة المشروعات للقادة — الإطار الأول', cost: null, model: null, state: 'done' },
    { kind: 'analysis', title: 'حُلّل', at: ago(190), detail: 'استحقاقٌ ‏٠٫٨٦: مادّةٌ أصيلة وفيها إطارٌ قابل للاقتباس', cost: 0.0412, model: 'claude-opus-5', state: 'done' },
    { kind: 'draft', title: 'كُتبت مسوّدة', at: ago(120), detail: 'زاويةُ الوقت لا زاويةُ المبلغ — لـ LinkedIn', cost: 0.0311, model: 'claude-opus-5', state: 'done' },
    // وما على الصورة يُقال في محطّتها (D-162) — فيدخل المعجمَ والفيضَ كسائرها
    { kind: 'image', title: 'وُلّدت صورة', at: ago(110), detail: '145KB · وعليها «أثرٌ يُقاس»', cost: 0.039, model: 'gemini-2.5-flash-image', state: 'done' },
    { kind: 'decision', title: 'اعتُمدت بعد تعديل', at: ago(100), detail: 'panel:passkey — عُدّل السطرُ الأخير', cost: null, model: null, state: 'done' },
    { kind: 'schedule', title: 'جُدولت', at: ago(96), detail: 'الاثنين ‏٠٩:٠٠ UTC على عمر عبدالحميد', cost: null, model: null, state: 'done' },
    { kind: 'publish', title: 'نُشرت', at: ago(19), detail: 'المحاولةُ الأولى — نجحت', cost: 0, model: null, state: 'done' },
    { kind: 'metrics', title: 'قياسُ ‏٢٤ ساعة', at: null, detail: 'أوّلُ قياسٍ بعد ‏٢٤ ساعةً من النشر', cost: null, model: null, state: 'pending' },
  ],
}
writeAudited(
  '/tmp/screen-journey.html',
  soloPage('صدى — رحلةُ منشور', { href: '/panel#posts', label: 'المنشورات' }, journeyBody(journey, now), 'n', '',
    buildCommands({ onPanel: false }), soloNav('posts')),
)

writeAudited(
  '/tmp/screen-spread.html',
  soloPage('صدى — توزيعُ المعتمَد', { href: '/panel', label: 'اللوحة' }, spreadScreen({
       start: '2026-09-08T06:00', gap: 24, csrf: 'c',
       plan: {
         slots: [
           { postId: 'p1', accountId: 'a1', accountLabel: 'عمر عبدالحميد', platform: 'linkedin', when: '2026-09-08T06:00', preview: 'قيادةُ القيمة لا تُقاس بالمخرجات بل بالمعالم.' },
           { postId: 'p2', accountId: 'a3', accountLabel: '@omar_ah', platform: 'x', when: '2026-09-09T06:00', preview: 'ثلاثةُ دروسٍ من مراجعة محفظةٍ كاملة — وأحدُها كلّفنا سنة.' },
           { postId: 'p3', accountId: 'a1', accountLabel: 'عمر عبدالحميد', platform: 'linkedin', when: '2026-09-10T06:00', preview: 'تقريرُ الإغلاق ليس وثيقةً إداريّة.' },
         ],
         skipped: [
           { postId: 'p4', preview: 'مسوّدةٌ لـ TikTok', reason: 'لا قناةَ TikTok مربوطة' },
         ],
       },
     }), 'n', '', buildCommands({ onPanel: false }), soloNav('posts')),
)

// الدخولُ بوجهيه: مفتاحُ مرورٍ مسجَّل، ورمزٌ رُفض
writeAudited('/tmp/screen-login.html', loginPage({ passkeys: true }, 'n'))
writeAudited(
  '/tmp/screen-2fa.html',
  secondFactorPage(
    { csrf: 'c', challenge: 'x', rpId: 'sada2.basserh.com', hasPasskey: true,
      hasTotp: true, hasRecovery: true, error: 'رمزٌ غير صحيح — بقيت محاولتان.' },
    'n',
  ),
)

// ‏صفحتا الخطأ (خطّة التصميم 7.11 · D-189): من دالّتيهما اللتين يخدمهما Worker، لا نسخةٌ هنا —
// ‏رابطٌ قديمٌ إلى منصّةٍ لا وجودَ لها، واستثناءٌ في قراءةٍ برقم طلبٍ من Cloudflare
writeAudited('/tmp/screen-404.html', notFoundPage('n', '/panel/channels/myspace', 'لا منصّةَ بهذا الاسم'))
writeAudited('/tmp/screen-500.html', serverErrorPage('n', '8f1e2d3c4b5a6978-FRA', '/panel/report'))

console.log('رُسمت خمسَ عشرةَ في /tmp')
