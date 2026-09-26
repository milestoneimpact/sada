/**
 * يرسم الشاشاتِ الجديدة إلى ملفّاتٍ لتُرى.
 *
 * أخوها `render_panel.ts`، ولنفس السبب: **التصميم لا يُبنى بالاستدلال.**
 * والفرقُ بين «صحيحٍ في الحساب» و«جميلٍ في العين» لا يُدرَك إلا بالنظر.
 *
 * وتستورد الدوالَّ نفسَها لا نسخةً منها، فما يُرى هنا هو ما يُرسَل.
 */
import { writeAudited } from './writeAudited'
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
import { buildCommands } from '../src/routes/ui/command'
import { journeyBody } from '../src/routes/ui/journeyView'
import { spreadScreen } from '../src/routes/ui/spreadView'
import { loginPage } from '../src/routes/panelView'
import { secondFactorPage } from '../src/routes/authView'
import type { Journey } from '../src/lib/journey'

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
const page = (title: string, body: string): string =>
  soloPage(title, { href: '/panel#channels', label: 'القنوات' }, body, 'n', '', buildCommands({ onPanel: false }))

writeAudited(
  '/tmp/screen-linkedin.html',
  page(
    'صدى — LinkedIn',
    platformScreen({
    health: {
      'linkedin:member:abc': {
        status: 'active', expiresAt: ago(-1200), refreshExpiresAt: ago(-7000), refreshedAt: ago(30), needsReauthAt: null,
        alerts: [{ kind: 'access', threshold: 7, at: ago(6) }],
      },
      'linkedin:org:99': { status: 'active', expiresAt: ago(-100), refreshExpiresAt: null, refreshedAt: null, needsReauthAt: null, alerts: [] },
    },
  app: undefined, baseUrl: 'https://sada2.basserh.com',
      view: li,
      now,
      tally: { published: 14, queued: 2, failed: 1, drafts: 3, spend: 0.42,
        lastPublishedAt: ago(19) },
      // الحسابُ الأوّل كاملُ النطاقات، والثاني ينقصه النشر — وهي الحالُ
      // التي وقعت فعلا، فتُرى مرسومةً لا مُتخيَّلة
      metrics: {
        p1: [{ window: '7d', impressions: null, reactions: 84, comments: 12,
               shares: null, pulledAt: ago(3) }],
      },
      scopes: {
        'linkedin:member:abc': scopeSet('linkedin').join(' '),
        'linkedin:org:99': 'openid profile',
      },
      posts: [
        { id: 'p1', status: 'published',
          text: 'قيادةُ القيمة لا تُقاس بالمخرجات بل بالمعالم.\n\nوأكثرُ ما يُهدر في المشروعات ليس وقتا ولا مالا — بل انتباهًا يُصرف على ما لا يُحرّك المعلم التالي.',
          scheduledAt: ago(20), createdAt: ago(40), accountName: 'عمر عبدالحميد',
          platformPostId: 'urn:li:share:7311', publishedAt: ago(19), lastError: null,
          hasMedia: true, costUsd: 0.031 },
        { id: 'p2', status: 'queued',
          text: 'تقريرُ الإغلاق ليس وثيقةً إداريّة — هو آخرُ فرصةٍ لتحويل ما تعلّمناه إلى شيءٍ يُقرأ بعدنا.',
          scheduledAt: new Date(now.getTime() + 7200_000).toISOString(),
          createdAt: ago(6), accountName: 'عمر عبدالحميد',
          platformPostId: null, publishedAt: null, lastError: null,
          hasMedia: false, costUsd: 0.028 },
        { id: 'p3', status: 'failed',
          text: 'ثلاثةُ أسئلةٍ قبل أن تبدأ مشروعا: مَن يقرّر أنّه نجح؟ ومتى؟ وبأيّ رقم؟',
          scheduledAt: ago(50), createdAt: ago(60), accountName: 'بصائر للاستشارات',
          platformPostId: null, publishedAt: null,
          lastError: 'Not enough permissions to create a post on behalf of this member',
          hasMedia: false, costUsd: 0.026 },
        { id: 'p4', status: 'draft',
          text: 'مسوّدةٌ بمقطعٍ رأسيّ — والمصغَّرُ يُري ما يُعتمَد، ولا يُقال «بمقطع» فقط.',
          scheduledAt: null, createdAt: ago(2), accountName: 'عمر عبدالحميد',
          platformPostId: null, publishedAt: null, lastError: null,
          hasMedia: true, costUsd: 0.019 },
        // **وصفٌّ يقول إنّ له وسيطا ولا وسيطَ يُقرأ** — يُقال ولا يُخفى
        { id: 'p5', status: 'approved',
          text: 'ومنشورٌ صفُّه يقول إنّ له وسيطا، ولا صفَّ وسيطٍ يقابله.',
          scheduledAt: null, createdAt: ago(1), accountName: 'عمر عبدالحميد',
          platformPostId: null, publishedAt: null, lastError: null,
          hasMedia: true, costUsd: 0 },
      ],
      // **الوسائطُ تُرسَم لتُرى** — ومصغَّرٌ لا يُرسَم لا يُقاس (D-061)
      media: {
        // بايتاتُ صورةٍ حقيقيّةٍ صغيرة: مسارُ الجلسة لا يعمل في ملفٍّ
        // على القرص، والغرضُ هنا **قياسُ الشكل** لا عرضُ المحتوى
        p1: [{ id: 'm1', mime: 'image/png', status: 'ready' }],
        p4: [
          { id: 'm2', mime: 'video/mp4', status: 'ready' },
          { id: 'm3', mime: 'image/png', status: 'rejected' },
        ],
      },
    }),
  ),
)

writeAudited(
  '/tmp/screen-x.html',
  page(
    'صدى — X',
    platformScreen({
    health: {},
  app: undefined, baseUrl: 'https://sada2.basserh.com',
      view: x, now,
      tally: { published: 0, queued: 0, failed: 0, drafts: 2, spend: 0,
        lastPublishedAt: null },
      metrics: {},
      scopes: { 'x:member:4242': 'tweet.read users.read tweet.write offline.access' },
      media: {},
      posts: [],
    }),
  ),
)

writeAudited(
  '/tmp/screen-unbuilt.html',
  page('صدى — Instagram', platformScreen({
    health: {},
  app: undefined, baseUrl: 'https://sada2.basserh.com',
    view: ig, now,
    tally: { published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null },
    scopes: {}, metrics: {}, media: {}, posts: [],
  })),
)

writeAudited(
  '/tmp/screen-link-only.html',
  page('صدى — YouTube', platformScreen({
    health: {},
  app: undefined, baseUrl: 'https://sada2.basserh.com',
    view: yt, now,
    tally: { published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null },
    scopes: {}, metrics: {}, media: {}, posts: [],
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
        (c) => `<h2 class="sec">${c.title}</h2>` +
          channelsSection(soloX, now, [c.app], 'https://sada2.basserh.com'),
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
    { kind: 'decision', title: 'اعتُمدت بعد تعديل', at: ago(100), detail: 'panel:passkey — عُدّل السطرُ الأخير', cost: null, model: null, state: 'done' },
    { kind: 'schedule', title: 'جُدولت', at: ago(96), detail: 'الاثنين ‏٠٩:٠٠ UTC على عمر عبدالحميد', cost: null, model: null, state: 'done' },
    { kind: 'publish', title: 'نُشرت', at: ago(19), detail: 'المحاولةُ الأولى — نجحت', cost: 0, model: null, state: 'done' },
    { kind: 'metrics', title: 'قياسُ ‏٢٤ ساعة', at: null, detail: 'أوّلُ قياسٍ بعد ‏٢٤ ساعةً من النشر', cost: null, model: null, state: 'pending' },
  ],
}
writeAudited(
  '/tmp/screen-journey.html',
  soloPage('صدى — رحلةُ منشور', { href: '/panel#posts', label: 'المنشورات' }, journeyBody(journey, now), 'n', '',
    buildCommands({ onPanel: false })),
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
     }), 'n', '', buildCommands({ onPanel: false })),
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

console.log('رُسمت ثلاثَ عشرةَ في /tmp')
