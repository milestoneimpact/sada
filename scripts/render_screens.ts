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
import { channelsSection, setupPane } from '../src/routes/ui/channels'
import type { AppStatus } from '../src/lib/oauth/apps'
import { connectedBody, refusedBody } from '../src/routes/ui/oauthResult'
import { reportScreen } from '../src/routes/ui/reportView'
import { gatesScreen, laterScreen, laterTitle, tasksScreen } from '../src/routes/ui/tasksView'
import { noticesScreen } from '../src/routes/ui/noticesView'
import { ownerRows } from '../src/lib/owner'
import { currentPhase, gatesOf, type GateFacts } from '../src/lib/gates'
import { summarize, type ReportPost, type StoredReport } from '../src/lib/report/weekly'
import { shell, soloPage } from '../src/routes/ui/shell'
import { soloNav } from '../src/routes/ui/rail'
import { buildCommands, sectionLabel } from '../src/routes/ui/command'
import { journeyBody } from '../src/routes/ui/journeyView'
import { spreadScreen } from '../src/routes/ui/spreadView'
import { importsScreen, monthJourneyCard, monthScreen } from '../src/routes/ui/planMonthView'
import { approvalLine, monthJourney } from '../src/lib/plan/month'
import { PLAN_NEW_SCRIPT, planNewScreen } from '../src/routes/ui/planNewView'
import { PLAN_REVIEW_SCRIPT, planReviewScreen } from '../src/routes/ui/planReviewView'
import { PLAN_BUILD_SCRIPT, planBuildScreen } from '../src/routes/ui/planBuildView'
import { libraryScreen } from '../src/routes/ui/libraryView'
import { packageScreen } from '../src/routes/ui/packageView'
import { PLAN_SEAT_SCRIPT, planSeatScreen } from '../src/routes/ui/planSeatView'
import { PLAN_DOC_SCRIPT, planDocScreen } from '../src/routes/ui/planDocView'
import { timelineScreen, timelineTitle } from '../src/routes/ui/timelineView'
import { gantt, windowOf } from '../src/lib/gantt'
import { loginPage } from '../src/routes/panelView'
import { enrolPage, resumePage, secondFactorPage, stepUpPage } from '../src/routes/authView'
import { notFoundPage, serverErrorPage } from '../src/routes/ui/errorView'
import { landingBody } from '../src/routes/landing'
import type { Journey } from '../src/lib/journey'
import { platformNeeds } from '../src/lib/platform/needs'
import type { PlatformCounts, TimelineRow } from '../src/lib/platform/timeline'
import { feedScreen } from '../src/routes/ui/feedView'
import type { FeedCard, FeedModel } from '../src/lib/feed'

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
  active = title.includes('النتائج') ? 'results' : title.includes('مهامّ') ? 'tasks' : 'accounts',
): string =>
  soloPage(title, { href: '/panel#channels', label: 'الحسابات' }, body, 'n', '', buildCommands({ onPanel: false }), soloNav(active))

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
    renewNote: null, renewNotedAt: null, metricsNote: null, metricsNotedAt: null,
    alerts: [{ kind: 'access' as const, threshold: 7, at: ago(6) }],
  },
  // ‏وسببُ آخر تجديدٍ وقياسٍ لم يتمّ (D-291) يُرسَم في العُدّة ليمرّ بالبوّابات
  'linkedin:org:99': {
    status: 'active' as const, expiresAt: ago(-100), refreshExpiresAt: null, refreshedAt: null, needsReauthAt: null,
    renewNote: 'ردّ المزوّد التجديد (503)', renewNotedAt: ago(40), metricsNote: 'missing_read_scope', metricsNotedAt: ago(90),
    alerts: [],
  },
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
    text: 'تقرير الإغلاق ليس وثيقةً إداريّة — هو آخر فرصة لتحويل ما تعلّمناه إلى شيء يُقرأ بعدنا.\n\n#إدارة_المشاريع #الأثر' }),
  row({ id: 'u2', status: 'queued', scheduledAt: ago(0.5), sortAt: ago(0.5),
    text: 'موعد حلّ ولم تُرسله الدورة بعد — والصفّ يقول ذلك بدقائقه.' }),
  row({ id: 'u3', status: 'queued', scheduledAt: ago(3), dispatchedAt: ago(2.5), sortAt: ago(3),
    text: 'أُرسل للنشر ولم يعُد جوابُه — فيُقال «عالق» ومعه طريق الإعادة.' }),
]
const liHistory = [
  row({ id: 'p1', status: 'published', platformPostId: 'urn:li:share:7311', publishedAt: ago(19), sortAt: ago(19), tries: 1,
    text: 'قيادة القيمة لا تُقاس بالمخرجات بل بالمعالم.\n\nوأكثر ما يُهدر في المشروعات ليس وقتا ولا مالا — بل انتباهًا يُصرف على ما لا يُحرّك المعلم التالي.\n\n#القيادة #المشاريع' }),
  row({ id: 'p3', status: 'failed', failedAt: ago(50), sortAt: ago(50), tries: 1, accountName: 'بصائر للاستشارات', accountKind: 'org',
    failure: 'token_expired', text: 'ثلاثة أسئلة قبل أن تبدأ مشروعا: مَن يقرّر أنّه نجح؟ ومتى؟ وبأيّ رقم؟' }),
  row({ id: 'p6', status: 'published', platformPostId: 'urn:li:share:7290', publishedAt: ago(75), sortAt: ago(75), tries: 2,
    text: 'المعلم الذي لا يُقاس لا يُدار. والذي يُقاس ولا يُقرأ لا يُدار كذلك.' }),
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
    tally: { published: 1, queued: 1, failed: 1, drafts: 0, spend: 0.03, lastPublishedAt: ago(30) },
    counts: counts({ queued: 1, published: 1, failed: 1 }),
    needs: platformNeeds('x'),
    upcoming: [row({ id: 'x2', status: 'queued', scheduledAt: soon(5), sortAt: soon(5), accountName: '@omar_ah',
      text: 'فكرة واحدة كاملة في منشور واحد. والقِصَر هنا قوّة لا نقص. #قيادة' })],
    history: { rows: [row({ id: 'x1', status: 'published', platformPostId: '1874', publishedAt: ago(30), sortAt: ago(30),
      accountName: '@omar_ah', text: 'المعلم الذي لا يُقاس لا يُدار.' }),
      // ‏وسلسلةٌ وقفت عند تغريدةٍ لم يُعرَف جوابُها (مراجعة D-324): «وجدتُها» برابطها أو «لم أجدها» تُرسَم فتمرّ بالتدقيق
      row({ id: 'x3', status: 'failed', failedAt: ago(40), sortAt: ago(40), tries: 1, accountName: '@omar_ah',
        failure: 'thread_unconfirmed: التغريدة 2 من 3 أُرسلت ولم يُؤكَّد نشرُها (انقضت المهلة قبل جوابها) — نُشرت قبلها 1 ولا تُعاد — تحقّق على X ثمّ قل ما وجدت',
        text: 'الحوكمة لا تبطئ القرار.\n---\nبل تحميه من العجلة.\n---\nفاسأل قبل أن تقرّر.' })], next: null },
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
      text: 'سطر يُغري بالمشاهدة ولا يشرح ما سيُرى. #مشاريع #قيادة' })],
    history: { rows: [row({ id: 't0', status: 'failed', failedAt: ago(20), sortAt: ago(20), tries: 1,
      failure: 'no_clip: لا مقطع لهذا المنشور — ولّد صورةً ثمّ حرّكها', text: 'منشور بلا مقطع يُردّ قبل الإرسال.' })], next: null },
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
      text: 'عنوان المقطع في السطر الأوّل\n\nوالوصف بعده لا يظهر إلّا لمن فتحه.' })],
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
      text: 'تعليق على صورة لم تُولَّد بعد — والإطار يقول إنّ Instagram لا تنشر بلا صورة.' })],
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
  id, platform, text: `نصّ المنشور ${id} — سطر يُقرأ كما يُعرَض في الشاشة.`,
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
  page('صدى — النتائج', reportScreen({
    reports: [stored],
    current: stored,
    promoCapUsd: 20,
    now,
    // ‏«هذا الشهر حتّى اليوم» تحت الرأس (ر-10)
    month: { total: 7.62, utc: false },
    // ‏ومقاييسُ النجاح هذا الشهر (D-324): نسبتان بمقاميهما وكلفةُ المنشور — تُرسَم فتمرّ بالتدقيق كلِّه
    success: { clean: { n: 7, of: 11 }, onTime: { n: 9, of: 9 }, cost: { posts: 9, direct: 0.21, all: 0.86 }, utc: false },
    suggestions: [
      {
        postId: 'a', platform: 'x',
        text: 'منشور a المرشَّح للترويج — سطر يُقرأ كما يُعرَض في التقرير.',
        budgetUsd: 10, currency: 'USD',
        reason: 'تفاعلُه 96 — 4.6× وسيط نافذة ‏24 ساعة (3 منشورات). ' +
          'والمبلغ 10$ نصف سقف وضعتَه (20$)، ولا يُنفَق حتّى تقبله.',
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
  { title: 'محفوظ ولم يُفحَص', app: app({}) },
  { title: 'فُحص فرُدّ السرّ', app: app({ verifiedKind: 'bad_secret', verifiedAt: ago(1) }) },
  { title: 'ومعرّف لا تعرفه المنصّة', app: app({ verifiedKind: 'bad_client_id', verifiedAt: ago(1) }) },
  { title: 'وجاز الفحص ولم يُربَط بعد', app: app({ verifiedKind: 'accepted', verifiedAt: ago(1) }) },
]

writeAudited(
  '/tmp/screen-wizard.html',
  page(
    'صدى — معالج الربط',
    // ‏العيّنةُ أربعُ حالاتٍ في صفحة، ولكلّ صفحةٍ عنوانٌ أوّل (axe «page-has-heading-one»)
    '<h1 class="sec">معالج الربط في أربع حالات</h1>' + wizardCases
      .map(
        // ‏كلُّ حالٍ شاشةٌ مستقلّة في الحقيقة، فتُعلَّم ليعدّ «audit_design» نحاسَها وحدَها
        // ‏لا الأربعَ معًا (ميزانيّةُ النحاس لكلّ شاشة، خطّة التصميم 3.2 · D-187)
        (c, i) => `<section data-screen="wizard-${i + 1}"><h2 class="sec">${c.title}</h2>` +
          // ‏والمعالجُ لوحُ الضبط نفسُه (`setupPane`) — بطاقةُ «الحسابات» لا تتبدّل بحال التطبيق بعد D-205
          setupPane(soloX.find((v) => v.spec.id === 'x')!, c.app, 'https://sada2.basserh.com') + '</section>',
      )
      .join(''),
  ),
)

// ── «ما عليك»: الحالاتُ الثلاث في صفحةٍ واحدة ───────────────────────
// حالٌ وسطى في البوّابات: بندٌ تحقّق، وبندٌ لا، وبندٌ لا يُقاس.
// **وواحدٌ لا اثنان**: كان هذا الحرفيُّ مكتوبا مرّتين — للبوّابات وللمرحلة
// — فيُعدَّل أحدُهما وتُرسَم شاشةٌ تناقض نفسَها.
// ‏وصار يُقرأ في عيّنتين (دمجُ D-318 مع D-324): مرحلةُ سطر «ما عليك» وبطاقاتُ «بوّابات المراحل» من الحقائق نفسِها
const GATE_FIXTURE: GateFacts = {
  publishedPerPlatform: { linkedin: 4, x: 2 },
  publishedWithMedia: { linkedin: 1 },
  ledgerPerPlatform: { linkedin: 4, x: 2 },
  scheduledPublished: 3,
  plans: 1, reports: 0, suggestions: 0, promoSpend: 0, orgAccounts: 1,
  weekAlertFired: false,
}
const GATES = gatesOf(GATE_FIXTURE)

// ‏المهامُّ كلُّها بحالٍ وسطى: بعضٌ تمّ، وبعضٌ عليك، وبعضٌ لا يُعرَف. و«ما عليك» يرسم ما يوقف أو يحرس منها ويعدّ القدرةَ في سطر،
// ‏و«تفتح قدرة» يرسم القدرةَ (متابعة D-324) — من الصفوف نفسِها، فالعددُ في السطر عددُ الصفحة
const OWNER_ROWS = ownerRows({
  secrets: new Set(['TOKEN_ENC_KEY', 'ADMIN_TOKEN']),
  vars: new Set(['CF_AI_ACCOUNT_ID']),
  linked: new Set(['linkedin']),
  appsConfigured: new Set(['linkedin', 'x']),
  appsVerified: new Set(['linkedin']),
  anyPublished: false,
  videoPriced: false,
  linkedInVersionDue: true,   // D-072: حال وسطى تُرسَم لتُقاس
  tilesChosen: 4, promoCapUsd: 0,
})

writeAudited(
  '/tmp/screen-tasks.html',
  page(
    'صدى — مهامّ المالك',
    tasksScreen({
      env: 'staging',
      rows: OWNER_ROWS,
      // ‏والبوّاباتُ سطرٌ يقول مرحلتَها، وبطاقاتُها في عيّنتها أدناه
      phase: currentPhase(GATES),
    }),
  ),
)

// ── «تفتح قدرة» (متابعة D-324): مهامُّ القدرة خرجت من «ما عليك» إلى صفحتها، فتُرسَم كما تُخدَم ────
// ‏والعودةُ إلى «ما عليك» والرافدةُ عليها وشريطُ عائلتها (D-342) كما في المسار، فيُقاس وزنُها كما يصل
writeAudited(
  '/tmp/screen-tasks-later.html',
  soloPage(laterTitle(), { href: '/panel/tasks', label: sectionLabel('tasks'), at: '/panel/tasks/later' },
    laterScreen({ env: 'staging', rows: OWNER_ROWS }), 'n', '',
    buildCommands({ onPanel: false }), soloNav('tasks')),
)

// ── «بوّابات المراحل» (دمجُ D-318 مع D-324): خرجت من «ما عليك» إلى صفحتها، فتُرسَم كما تُخدَم ────
// ‏حالٌ وسطى في البوّابات كذلك: بندٌ تحقّق، وبندٌ لا، وبندٌ لا يُقاس. والعودةُ إلى «ما عليك» والرافدةُ عليها كما في المسار
writeAudited(
  '/tmp/screen-gates.html',
  soloPage('صدى — بوّابات المراحل', { href: '/panel/tasks', label: sectionLabel('tasks') },
    gatesScreen({ gates: GATES, phase: currentPhase(GATES) }), 'n', '',
    buildCommands({ onPanel: false }), soloNav('tasks')),
)

// ── الإشعارات (D-294): جديدٌ ومقروءٌ من الأنواع الستّة، لتُقاس كما تُقاس كلُّ شاشة ────
writeAudited(
  '/tmp/screen-notices.html',
  page(
    'صدى — الإشعارات',
    noticesScreen({
      now,
      notices: [
        { ref: 'publish:p1', kind: 'publish', tone: 'bad', text: 'فشل نشر «كلّ مشروع يتعثّر يبدأ تعثّرُه قبل التنفيذ…» على X: ردّت المنصّة الطلب (429) — كثرت الطلبات', href: '/panel/journey/p1', action: 'افتح المنشور', at: '2026-09-06 08:40:00' },
        { ref: 'reauth:a1:2026-09-06 07:00:00', kind: 'reauth', tone: 'bad', text: 'انقطع إذن LinkedIn (عمر) — والنشر عليه متوقّف حتّى يُعاد الربط', href: '/oauth/linkedin/start', action: 'أعد الربط', at: '2026-09-06 07:00:00' },
        { ref: 'quota:2026-09-06', kind: 'quota', tone: 'warn', text: '3 صور تنتظر حصّةَ الغد المجّانيّة — ارسمها اليوم بالدفع أو انتظر', href: '/panel#posts', action: 'المنشورات', at: '2026-09-06 06:30:00' },
        { ref: 'token:a2:access:5', kind: 'token', tone: 'warn', text: 'إذن الوصول لـ X (omar_sada) يقترب — بقي 5 أيّام', href: '/panel/accounts', action: 'الحسابات', at: '2026-09-06 03:00:00' },
        { ref: 'pulse:renew:2026-09-06 05:00:00', kind: 'pulse', tone: 'warn', text: 'دورة «تجديد الأذونات» لم تدُر منذ 210 دقيقة فوق موعدها — هل العدّاء يعمل؟', href: '/panel#machine', action: 'افتح «هل الآلة تعمل؟»', at: '2026-09-06 05:00:00' },
        { ref: 'budget:2026-09-06', kind: 'budget', tone: 'warn', text: 'بلغ الإنفاقُ سقفَ اليوم ($5.00) — لا كتابةَ ولا صورَ حتّى الغد أو حتّى ترفعه', href: '/panel/settings#limits', action: 'الإنفاق والحدود', at: '2026-09-06 08:00:00' },
      ],
      reads: [
        { ref: 'token:a2:access:5', readAt: '2026-09-06 04:00:00', byEmail: 'omar@example.com' },
        { ref: 'pulse:renew:2026-09-06 05:00:00', readAt: '2026-09-06 06:00:00', byEmail: null },
      ],
    }),
    'overview',
  ),
)

// ── أربعُ شاشاتٍ كانت بلا عيّنة (D-124) ─────────────────────────────
// الرحلةُ والتوزيعُ والدخولُ والعاملُ الثاني **لم يرَها مدقّقٌ قطّ**: تُرسَم
// في الخادم من الدوالّ نفسِها، ولا ملفَّ لها في /tmp فلا تدخل المدقّقات
// الثلاثة. **وشاشةٌ لا تُرسَم لا تُقاس، وما لا يُقاس يشيخ صامتا.**
const journey: Journey = {
  postId: 'p1', platform: 'linkedin', status: 'published', spent: 0.0723,
  text: 'قيادة القيمة لا تُقاس بالمخرجات بل بالمعالم.\n\nوأكثر ما يُهدر في المشروعات ليس وقتا ولا مالا — بل انتباه يُصرف على ما لا يُحرّك المعلم التالي.',
  stations: [
    { kind: 'source', title: 'ملفّ في Drive', at: ago(200), detail: 'منهجية إدارة المشروعات للقادة — الإطار الأول', cost: null, model: null, state: 'done' },
    { kind: 'analysis', title: 'حُلّل', at: ago(190), detail: 'استحقاق ‏0.86: مادّة أصيلة وفيها إطار قابل للاقتباس', cost: 0.0412, model: 'claude-opus-5', state: 'done' },
    { kind: 'draft', title: 'كُتبت مسوّدة', at: ago(120), detail: 'زاوية الوقت لا زاوية المبلغ — لـ LinkedIn', cost: 0.0311, model: 'claude-opus-5', state: 'done' },
    // وما على الصورة يُقال في محطّتها (D-162) — فيدخل المعجمَ والفيضَ كسائرها
    { kind: 'image', title: 'وُلّدت صورة', at: ago(110), detail: '145KB · وعليها «أثر يُقاس»', cost: 0.039, model: 'gemini-2.5-flash-image', state: 'done' },
    { kind: 'decision', title: 'اعتُمدت بعد تعديل', at: ago(100), detail: 'النصّ المعتمَد نصُّك أنت · أنت بمفتاح المرور', cost: null, model: null, state: 'done' },
    { kind: 'schedule', title: 'جُدولت', at: ago(96), detail: 'الاثنين ‏09:00 بتوقيت الرياض على عمر عبدالحميد', cost: null, model: null, state: 'done' },
    { kind: 'publish', title: 'نُشرت', at: ago(19), detail: 'المحاولة الأولى — نجحت', cost: 0, model: null, state: 'done' },
    { kind: 'metrics', title: 'قياس ‏24 ساعة', at: null, detail: 'أوّل قياس بعد ‏24 ساعةً من النشر', cost: null, model: null, state: 'pending' },
  ],
}
writeAudited(
  '/tmp/screen-journey.html',
  soloPage('صدى — رحلة منشور', { href: '/panel#posts', label: 'المنشورات' }, journeyBody(journey, now), 'n', '',
    buildCommands({ onPanel: false }), soloNav('posts')),
)

writeAudited(
  '/tmp/screen-spread.html',
  soloPage('صدى — توزيع المعتمَد', { href: '/panel', label: 'اللوحة' }, spreadScreen({
       start: '2026-09-08T06:00', gap: 24, csrf: 'c',
       plan: {
         slots: [
           { postId: 'p1', accountId: 'a1', accountLabel: 'عمر عبدالحميد', platform: 'linkedin', when: '2026-09-08T06:00', preview: 'قيادة القيمة لا تُقاس بالمخرجات بل بالمعالم.' },
           { postId: 'p2', accountId: 'a3', accountLabel: '@omar_ah', platform: 'x', when: '2026-09-09T06:00', preview: 'ثلاثة دروس من مراجعة محفظة كاملة — وأحدُها كلّفنا سنة.' },
           { postId: 'p3', accountId: 'a1', accountLabel: 'عمر عبدالحميد', platform: 'linkedin', when: '2026-09-10T06:00', preview: 'تقرير الإغلاق ليس وثيقةً إداريّة.' },
         ],
         skipped: [
           { postId: 'p4', preview: 'مسوّدة لـ TikTok', reason: 'لا قناة TikTok مربوطة' },
         ],
       },
     }), 'n', '', buildCommands({ onPanel: false }), soloNav('posts')),
)

// ‏«خطّة جديدة» (D-283): LinkedIn مربوطة وX لا، ومصدران محلَّلان، والمزوّدُ جاهز — فالزرُّ يظهر والملخّصُ بكلفته
writeAudited(
  '/tmp/screen-plan-new.html',
  soloPage('صدى — خطّة جديدة', { href: '/panel#posts', label: 'المنشورات' }, planNewScreen({
    now: new Date('2026-11-02T08:00:00Z'), linked: ['linkedin'], perWeek: 3,
    sources: [{ id: 's1', name: 'تقرير الأثر 2025', kind: 'drive' }, { id: 's2', name: 'مراجعة المحفظة', kind: 'upload' }, { id: 's3', name: 'قيادة القيمة لا تُقاس بالمخرجات', kind: 'url' }],
    perDraft: 0.012, perImage: 0.011, perInfographic: 0.018, freeLeft: { draft: 173, final: 7 }, autoImage: true, ready: true, replacing: false,
  }), 'n', PLAN_NEW_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
)

// ‏مراجعةُ الخطّة (D-286): بطاقةٌ معتمَدةٌ بصورتها، وأخرى تنتظر، وثالثةٌ لم تُكتب، ورابعةٌ مجدولة، وموعدان مكرَّران
{
  const it = (sourceId: string, platform: 'linkedin' | 'x', day: string, time: string, angle: string) => ({ sourceId, platform, kind: 'text' as const, angle, day, time, why: 'ل' })
  const items = [
    it('s1', 'linkedin', '2026-11-08', '06:00', 'تقرير الأثر: ثلاثةُ أرقامٍ تغيّر النقاش'),
    it('s2', 'x', '2026-11-08', '06:00', 'سؤالٌ واحد قبل أيّ تمويل'),
    it('s2', 'linkedin', '2026-11-10', '09:00', 'مراجعةُ المحفظة بدرسٍ واحد'),
    it('s3', 'x', '2026-11-12', '15:00', 'قيادةُ القيمة لا تُقاس بالمخرجات'),
  ]
  const post = (id: string, status: string, text: string) => ({ id, status, text, scheduledAt: status === 'queued' ? '2026-11-12 15:00:00' : null })
  const cards = [
    { index: 0, key: 'k0', item: items[0]!, post: post('p0', 'approved', 'قيادةُ القيمة لا تُقاس بالمخرجات بل بالمعالم: ثلاثةُ أرقامٍ من تقرير الأثر غيّرت نقاشَ مجلس الإدارة هذا العام.'), mediaId: 'm0', gaps: [] },
    { index: 1, key: 'k1', item: items[1]!, post: post('p1', 'draft', 'قبل أيّ تمويل: ما الأثرُ الذي تقيسه؟ سؤالٌ واحدٌ يوفّر عامًا من التقارير.'), mediaId: null, gaps: ['no_image', 'pending'] as const },
    { index: 2, key: 'k2', item: items[2]!, post: null, mediaId: null, gaps: ['unwritten'] as const },
    { index: 3, key: 'k3', item: items[3]!, post: post('p3', 'queued', 'مراجعةُ المحفظة علّمتنا أنّ القرار الصحيح يأتي متأخّرًا أحيانًا — وأنّ التأخّرَ ثمنٌ يُدفع.'), mediaId: 'm3', gaps: [] },
  ]
  const reviewSample = {
      plan: { id: 'pl1', week: '2026-11-08', plan: { rationale: '', items }, model: 'm', status: 'approved', createdAt: '2026-11-02 08:00:00', span: '2weeks',
        choices: { channels: ['linkedin', 'x'], cadence: {}, sources: 'all', ideas: [], assets: [], autoImage: true, imageStyle: 'illustration', startDay: '2026-11-08' } },
      version: 2, lockedAt: null, cards: cards as never, gaps: { unwritten: 1, no_image: 1, pending: 1, clash: 0 },
      versions: [{ version: 1, lockedAt: '2026-11-03 10:00:00', lockedBy: 'owner', scheduled: 3, items: 4 }],
    } as never
  // ‏شاشةُ بناء الخطّة (D-332): الجزءُ الثاني من أربعةٍ يُخطَّط، بعد دقيقتين
  writeAudited(
    '/tmp/screen-plan-build.html',
    soloPage('صدى — بناء الخطّة', { href: '/panel#posts', label: 'المنشورات' },
      planBuildScreen({ id: 'b1', state: 'planning', done: 1, total: 4, startedAt: '2026-11-12T08:00:00Z' }, new Date('2026-11-12T08:02:10Z')), 'n', PLAN_BUILD_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
  )
  // ‏«كلُّ الأصول» (D-347): البحثُ والمفضّلةُ والوسومُ على بلاطاتها — مولَّدةٌ ومرفوعةٌ ومقطعٌ ومصدرُ Drive
  writeAudited(
    '/tmp/screen-assets.html',
    soloPage('صدى — الأصول', { href: '/panel/library', label: 'المكتبة', at: '/panel/assets' },
      libraryScreen({
        assets: [
          { ref: 'm:a1', origin: 'generated', kind: 'image', name: 'ثلاثةُ أرقامٍ من تقرير الأثر', mime: 'image/png', bytes: 412000, at: '2026-11-10 09:00:00', preview: '/panel/media/a1', drive: null, uses: 3, favourite: true, tags: ['هويّة', 'تقرير الأثر'] },
          { ref: 'f:a2', origin: 'upload', kind: 'image', name: 'شعار ميلستون.png', mime: 'image/png', bytes: 88000, at: '2026-11-08 14:20:00', preview: '/panel/assets/raw/f:a2', drive: null, uses: 0, favourite: false, tags: [] },
          { ref: 'u:a3', origin: 'upload', kind: 'video', name: 'كلمةُ الافتتاح.mp4', mime: 'video/mp4', bytes: 18400000, at: '2026-11-05 11:00:00', preview: '/panel/assets/raw/u:a3', drive: null, uses: 1, favourite: false, tags: ['فعاليّة'] },
          { ref: 's:a4', origin: 'drive', kind: 'doc', name: 'تقرير الأثر 2025', mime: 'application/pdf', bytes: null, at: '2026-11-01 08:00:00', preview: null, drive: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view' },
        ],
        kind: null, origin: null, pick: null, q: '', fav: false,
      }), 'n', '', buildCommands({ onPanel: false }), soloNav('accounts')),
  )
  writeAudited(
    '/tmp/screen-plan-review.html',
    soloPage('صدى — راجع الخطّة', { href: '/panel#posts', label: 'المنشورات' }, planReviewScreen(reviewSample, null, { week: '1', orgName: 'ميلستون', authors: { linkedin: 'عمر', x: 'عمر' } }), 'n', PLAN_REVIEW_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
  )
  writeAudited(
    '/tmp/screen-plan-doc.html',
    soloPage('صدى — خطّةُ النشر', { href: '/panel/plan/review', label: 'المراجعة' }, planDocScreen({
      model: reviewSample, orgName: 'مؤسّسة المعالم للأثر', authors: { linkedin: 'عمر عبدالحميد', x: '@omar_ah' },
      sources: { s1: 'تقرير الأثر 2025', s2: 'مراجعة المحفظة' }, zone: null,
    }), 'n', PLAN_DOC_SCRIPT, buildCommands({ onPanel: false }), soloNav('plan')),
  )
}

// ‏«حزمة المحتوى» (D-366): مزامنةٌ ناجحة ومادّتان ونقلٌ مكتمل
writeAudited(
  '/tmp/screen-package.html',
  soloPage('صدى — حزمة المحتوى', { href: '/panel/library', label: 'المكتبة', at: '/panel/package' },
    packageScreen({
      source: { id: 'p1', org: 'o1', owner: 'milestone', repo: 'content', branch: 'main', root: 'week-46', lastCommit: 'a1b2c3d4e5f6a7b8', lastTree: null, lastEtag: null,
        lastCheckedAt: '2026-11-15 08:00', status: 'ok', error: null, hasHook: true, sealedToken: null, variants: { x: 'dark', linkedin: 'light' }, followUpdates: true },
      media: [
        { blobSha: 'b1', itemNo: '01', variant: 'dark', kind: 'video', path: 'week-46/01/x.mp4', bytes: 8_400_000, r2Key: 'k1', version: 1, hasSound: true, coverBlobSha: 'c1', isCurrent: true, supersededBy: null },
        { blobSha: 'b2', itemNo: '02', variant: 'light', kind: 'image', path: 'week-46/02/li.png', bytes: 420_000, r2Key: 'k2', version: 2, hasSound: false, coverBlobSha: null, isCurrent: true, supersededBy: null },
      ],
      tokenReady: true, revisions: [], missing: ['03 · x'], transfer: { total: 2, done: 2 },
    }), 'n', '', buildCommands({ onPanel: false }), soloNav('package', undefined, { shown: ['package'] })),
)

// ‏«عندي خطّة» (D-287): ملفٌّ أو نصٌّ يُلصق، ونوعُ الصورة
writeAudited(
  '/tmp/screen-plan-seat.html',
  soloPage('صدى — عندي خطّة', { href: '/panel#posts', label: 'المنشورات' }, planSeatScreen({ canRead: true }), 'n', PLAN_SEAT_SCRIPT,
    buildCommands({ onPanel: false }), soloNav('plan')),
)

// الدخولُ بوجهيه: مفتاحُ مرورٍ مسجَّل، ورمزٌ رُفض
writeAudited('/tmp/screen-login.html', loginPage({ passkeys: true }, 'n'))
writeAudited(
  '/tmp/screen-2fa.html',
  secondFactorPage(
    { csrf: 'c', challenge: 'x', rpId: 'sada2.basserh.com', hasPasskey: true,
      hasTotp: true, hasRecovery: true, error: 'رمز غير صحيح — بقيت محاولتان.' },
    'n',
  ),
)

// ‏العاملُ الثاني الإلزاميّ (D-317): صفحةُ التسجيل، و«تحقّق للتوّ» بمفتاحٍ ورمزِ تطبيق، و«أكمل ما بدأته»
writeAudited(
  '/tmp/screen-enrol.html',
  enrolPage({ csrf: 'c', rpId: 'sada2.basserh.com', required: true, roleName: 'المالك', email: 'owner@example.com',
    passkeys: [], totpConfirmed: false, recoveryLeft: 0, error: null }, 'n'),
)
writeAudited(
  '/tmp/screen-stepup.html',
  stepUpPage({ csrf: 'c', challenge: 'x', rpId: 'sada2.basserh.com', hasPasskey: true, hasTotp: true,
    emailCode: 'none', email: 'owner@example.com', next: '/panel/team', error: null }, 'n'),
)
writeAudited(
  '/tmp/screen-resume.html',
  resumePage({ csrf: 'c', action: '/panel/providers/key', title: 'مفتاح مزوّد', back: '/panel/settings',
    fields: [['provider', 'anthropic']], secrets: ['key'] }, 'n'),
)
// ‏و«أكمل» لدعوة عضوٍ ولفصل حساب (مراجعة D-317): الدورُ باسمه والمنصّةُ باسمها والعاقبةُ قبل الضغطة — كما يقرؤها `audit_copy`
writeAudited(
  '/tmp/screen-resume-invite.html',
  resumePage({ csrf: 'c', action: '/panel/team/invite', title: 'دعوة عضو', back: '/panel/team',
    fields: [['email', 'sara@example.com'], ['role', 'publisher'], ['all', '1']], secrets: [],
    display: { role: 'ناشر' } }, 'n'),
)
writeAudited(
  '/tmp/screen-resume-cut.html',
  resumePage({ csrf: 'c', action: '/panel/channels/disconnect', title: 'فصل حساب', back: '/panel/accounts',
    fields: [['platform', 'linkedin'], ['account', 'linkedin:abc123']], secrets: [],
    display: { platform: 'LinkedIn', account: 'عمر الشهري' },
    warning: 'تُحذف رموز الوصول والتجديد لهذا الحساب ولا تُستردّ، وكلّ منشور مجدول عليه يتوقّف.' }, 'n'),
)

// ‏صفحتا الخطأ (خطّة التصميم 7.11 · D-189): من دالّتيهما اللتين يخدمهما Worker، لا نسخةٌ هنا —
// ‏رابطٌ قديمٌ إلى منصّةٍ لا وجودَ لها، واستثناءٌ في قراءةٍ برقم طلبٍ من Cloudflare
// ‏صفحةُ الهبوط على الجذر (D-193)
writeAudited('/tmp/screen-landing.html', shell('صدى', landingBody(), 'n', '', { indexable: true }))
writeAudited('/tmp/screen-404.html', notFoundPage('n', '/panel/channels/myspace', 'لا منصّة بهذا الاسم'))
writeAudited('/tmp/screen-500.html', serverErrorPage('n', '8f1e2d3c4b5a6978-FRA', '/panel/report'))

console.log('رُسمت تسع عشرة في /tmp')

// ‏الخطُّ الزمنيّ للمحفظة (D-212) عيّنةٌ مدقَّقة (D-213): صفحةٌ لا يرسمها شيءٌ لا يقرؤها حارس
{
  const zone = 'Asia/Riyadh'
  const win = windowOf(now, zone, 30, 0)
  const post = (id: string, platform: string, accountId: string, account: string, status: string,
    createdAt: string, approvedAt: string | null, scheduledAt: string | null, publishedAt: string | null) =>
    ({ id, platform, accountId, account, status, text: `منشور ${id}: قيادة القيمة لا تُقاس بالمخرجات`, createdAt, approvedAt, scheduledAt, publishedAt })
  const posts = [
    post('t1', 'linkedin', 'a1', 'عمر عبدالحميد', 'published', '2026-08-28 08:00:00', '2026-08-29 10:00:00', '2026-08-31 06:00:00', '2026-08-31 06:00:04'),
    post('t2', 'linkedin', 'a1', 'عمر عبدالحميد', 'queued', '2026-09-03 09:00:00', '2026-09-04 12:00:00', '2026-09-08 06:00:00', null),
    post('t3', 'x', 'a3', '@omar_ah', 'failed', '2026-09-01 07:00:00', '2026-09-01 08:00:00', '2026-09-02 06:00:00', null),
    post('t4', 'x', 'a3', '@omar_ah', 'draft', '2026-09-04 15:00:00', null, null, null),
    post('t5', 'tiktok', '', '', 'draft', '2026-09-05 11:00:00', null, null, null),
  ]
  const plans = [{ id: 'w1', weekStart: '2026-08-31', status: 'approved' }]
  writeAudited(
    '/tmp/screen-timeline.html',
    soloPage(timelineTitle(), { href: '/panel', label: 'اللوحة' }, timelineScreen({
      chart: gantt({ posts, plans }, win, now, zone), span: 30, shift: 0, capped: false, cap: 1500, zone, now,
    }), 'n', '', buildCommands({ onPanel: false }), soloNav('results')),
  )
}

// ‏شاشةُ الشهر (D-383 · المرحلة ٨): رحلةُ الشهرين بتنبيهها، وشريطُ الفحص بأزرار الإصلاح، والتقويمُ بشاراته الثلاث، والفرقُ، وسطرُ الاعتماد
writeAudited(
  '/tmp/screen-plan-month.html',
  soloPage('صدى — شهر 2026-11', { href: '/panel#posts', label: 'المنشورات' },
    monthJourneyCard([
      monthJourney({ period: '2026-11', hasPlan: true, reviewed: true, items: 32, approved: 3, queued: 18, published: 7, failed: 1 }, '2026-11-24'),
      monthJourney({ period: '2026-12', hasPlan: false, reviewed: false, items: 0, approved: 0, queued: 0, published: 0, failed: 0 }, '2026-11-24'),
    ]) + '<div class="mt-3"></div>' + monthScreen({
      period: '2026-11', planId: 'pl1', dailyCap: 5, prev: '2026-10', next: '2026-12', canApprove: true,
      perDay: { '2026-11-02': 2, '2026-11-03': 5, '2026-11-04': 1, '2026-11-09': 3, '2026-11-10': 6, '2026-11-16': 2, '2026-11-17': 4, '2026-11-23': 2, '2026-11-24': 5, '2026-11-30': 2 },
      checks: { planId: 'pl1', canFix: true, findings: [
        { rule: 'daily_total', severity: 'warn', keys: ['k1', 'k2'], day: '2026-11-10', fix: 'spread', message: '6 منشورات في 2026-11-10، والسقف 5.' },
        { rule: 'same_slot', severity: 'warn', keys: ['k3', 'k4'], day: '2026-11-03', platform: 'x', fix: 'shift', message: 'بندان على X بينهما 30 دقيقة، والفاصل 90.' },
        { rule: 'no_media', severity: 'block', keys: ['k5'], day: '2026-11-17', fix: 'upload', message: 'البند 14 يحتاج صورة لم تُرفع.' },
      ] },
      diff: [
        { itemNo: '14', platform: 'linkedin', kind: 'text', awaiting: true, detail: 'ينتظر قرارك' },
        { itemNo: '21', platform: 'x', kind: 'added', awaiting: false, detail: 'طُبِّق آليًّا' },
        { itemNo: '09', platform: 'x', kind: 'removed', awaiting: false, detail: 'طُبِّق آليًّا' },
      ],
      approval: approvalLine({ total: 32, blocked: 1, reason: 'وسيط ناقص' }),
    }), 'n', '', buildCommands({ onPanel: false }), soloNav('posts')),
)

writeAudited(
  '/tmp/screen-plan-imports.html',
  soloPage('صدى — الاستيرادات', { href: '/panel/plan/month', label: 'الشهر' }, importsScreen([
    { id: 'i3', sourceKind: 'github', sourceRef: '9f2c1ab', contentHash: 'a41f09c2d7e3', period: '2026-12', status: 'applied', createdAt: '2026-11-24 08:00:00', summary: '30 بند' },
    { id: 'i2', sourceKind: 'github', sourceRef: '71be0d4', contentHash: '5c0e77b1aa90', period: '2026-11', status: 'unchanged', createdAt: '2026-11-20 08:00:00', summary: 'لا تفصيل' },
    { id: 'i1', sourceKind: 'csv', sourceRef: 'nov.csv', contentHash: '0d93e1f4b2c8', period: '2026-11', status: 'applied', createdAt: '2026-11-01 08:00:00', summary: '3 مضاف، 2 متغيّر' },
  ], true), 'n', '', buildCommands({ onPanel: false }), soloNav('posts')),
)

// ‏التيّار (D-386): بطاقاتٌ بكلّ حال — نُشر بمقاييسه، ومجدولٌ، وينتظرُ اعتمادك، ويُكتب الآن، وفشل، وواحدٌ بتحذير «محتوى مكرّر»
{
  const zone = 'Asia/Riyadh'
  const fnow = new Date('2026-11-24T07:00:00Z')
  const post = (id: string, platform: string, status: string, text: string, at: string | null, over: Partial<FeedCard> = {}): FeedCard => ({
    id, kind: 'post', platform, status, text, at, local: null, planId: 'pl1', media: null, metrics: null, warning: null, edited: false, ...over,
  })
  const feedPreview = fixtureImage(1200, 627, 200)
  const model: FeedModel = {
    upcoming: [
      post('fa1', 'linkedin', 'draft', 'قبل كلّ معلَم ثلاثة أسئلة: ما المخرَج الذي يُرى؟ ومن يملك قرار القبول؟ وما أثر التأخّر؟ ثلاثة أسئلة تختصر اجتماعًا طويلًا في سطرٍ واحد يقرؤه الجميع.', null,
        { local: { day: '2026-11-25', time: '09:00' }, media: { id: 'fm1', mime: 'image/png', width: 1200, height: 627 } }),
      post('fa2', 'x', 'draft', 'الاجتماع الطويل لا يصنع اتّفاقًا؛ المراجعة القصيرة على تعريفٍ مكتوب تصنعه.', null,
        { local: { day: '2026-11-25', time: '20:00' }, warning: { tone: 'warn', label: 'محتوى مكرّر' } }),
      post('ff1', 'x', 'failed', 'ما لا يُقاس لا يُدار — وما يُقاس خطأً يُدار خطأً. اختر مقياسًا واحدًا لكلّ قرار.', '2026-11-23 17:00:00'),
      post('fq1', 'linkedin', 'queued', 'القيمةُ لا تُقاس بالمخرجات بل بما تغيّر عند من يستعملها. ثلاثة مؤشّرات نقيس بها أثر كلّ معلَم.', '2026-11-25 06:00:00',
        { media: { id: 'fm1', mime: 'image/png', width: 1200, height: 627 } }),
      post('fq2', 'x', 'queued', 'سؤالٌ واحدٌ قبل كلّ قرار: ماذا سيتغيّر لو أخّرناه أسبوعًا؟', '2026-11-26 17:00:00'),
      post('fq3', 'linkedin', 'queued', 'من الاجتماع الطويل إلى المراجعة القصيرة: كيف نقلنا فريقًا من ساعتين أسبوعيًّا إلى عشرين دقيقة.', '2026-11-30 06:00:00', { edited: true }),
      { id: 'item:2026-12-01|linkedin|07:00', kind: 'item', platform: 'linkedin', status: 'writing', text: 'ثلاثة أسئلة قبل كلّ معلَم', at: null,
        local: { day: '2026-12-01', time: '07:00' }, planId: 'pl1', media: null, metrics: null, warning: null, edited: false },
    ],
    past: [
      post('fp1', 'linkedin', 'published', 'الحوكمة ليست لجنةً تجتمع؛ هي قرارٌ يُعرف من يملكه قبل أن يُطلب.', '2026-11-20 06:00:04',
        { metrics: { impressions: 1240, reactions: 38, comments: 6, shares: 4 }, media: { id: 'fm1', mime: 'image/png', width: 1200, height: 627 } }),
      post('fp2', 'x', 'published', 'المعلَم الذي لا يملك قرارَ قبولٍ ليس معلَمًا؛ هو تاريخٌ في جدول.', '2026-11-17 17:00:02',
        { metrics: { impressions: 860, reactions: 21, comments: 2, shares: null } }),
    ],
    counts: { published: 2, queued: 3, awaiting: 2, writing: 1 },
    plan: { id: 'pl1', awaiting: 2 },
    awaitingIds: ['fa1', 'fa2'],
    window: { from: '2026-09-25', to: '2026-11-24', older: '2026-09-25' },
  }
  writeAudited(
    '/tmp/screen-feed.html',
    soloPage('صدى — التيّار', { href: '/panel', label: 'الرئيسيّة' }, feedScreen({ model, zone, now: fnow, role: 'owner' }), 'n', '', buildCommands({ onPanel: false }), soloNav('feed')),
    { 'fm1?w=800': feedPreview },
  )
}
