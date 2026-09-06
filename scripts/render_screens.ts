/**
 * يرسم الشاشاتِ الجديدة إلى ملفّاتٍ لتُرى.
 *
 * أخوها `render_panel.ts`، ولنفس السبب: **التصميم لا يُبنى بالاستدلال.**
 * والفرقُ بين «صحيحٍ في الحساب» و«جميلٍ في العين» لا يُدرَك إلا بالنظر.
 *
 * وتستورد الدوالَّ نفسَها لا نسخةً منها، فما يُرى هنا هو ما يُرسَل.
 */
import { writeFileSync } from 'node:fs'
import { viewChannels, type LinkedAccount } from '../src/lib/channels'
import { scopeSet } from '../src/lib/oauth/scopes'
import { platformScreen } from '../src/routes/ui/platformView'
import { connectedBody, refusedBody } from '../src/routes/ui/oauthResult'
import { shell } from '../src/routes/ui/shell'

const now = new Date('2026-09-06T09:00:00Z')
const ago = (h: number): string =>
  new Date(now.getTime() - h * 3600_000).toISOString().slice(0, 19).replace('T', ' ')

const accounts: LinkedAccount[] = [
  { id: 'linkedin:member:abc', platform: 'linkedin', kind: 'member',
    displayName: 'عمر عبدالحميد', status: 'active', createdAt: ago(700) },
  { id: 'linkedin:org:99', platform: 'linkedin', kind: 'org',
    displayName: 'بصائر للاستشارات', status: 'active', createdAt: ago(300) },
  { id: 'x:member:4242', platform: 'x', kind: 'member',
    displayName: '@omar_ah', status: 'active', createdAt: ago(40) },
]

const views = viewChannels(accounts, () => true)
const li = views.find((v) => v.spec.id === 'linkedin')!
const x = views.find((v) => v.spec.id === 'x')!
const ig = views.find((v) => v.spec.id === 'instagram')!
const yt = views.find((v) => v.spec.id === 'youtube')!

const page = (title: string, body: string): string =>
  shell(
    title,
    `<div class="wrap"><nav class="back"><a href="/panel#channels">← القنوات</a></nav>
     <main id="main">${body}</main></div>`,
    'n',
  )

writeFileSync(
  '/tmp/screen-linkedin.html',
  page(
    'صدى — LinkedIn',
    platformScreen({
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
      ],
    }),
  ),
)

writeFileSync(
  '/tmp/screen-x.html',
  page(
    'صدى — X',
    platformScreen({
      view: x, now,
      tally: { published: 0, queued: 0, failed: 0, drafts: 2, spend: 0,
        lastPublishedAt: null },
      metrics: {},
      scopes: { 'x:member:4242': 'tweet.read users.read tweet.write offline.access' },
      posts: [],
    }),
  ),
)

writeFileSync(
  '/tmp/screen-unbuilt.html',
  page('صدى — Instagram', platformScreen({
    view: ig, now,
    tally: { published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null },
    scopes: {}, metrics: {}, posts: [],
  })),
)

writeFileSync(
  '/tmp/screen-link-only.html',
  page('صدى — YouTube', platformScreen({
    view: yt, now,
    tally: { published: 0, queued: 0, failed: 0, drafts: 0, spend: 0, lastPublishedAt: null },
    scopes: {}, metrics: {}, posts: [],
  })),
)

writeFileSync(
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

writeFileSync(
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

console.log('رُسمت ستٌّ في /tmp')
