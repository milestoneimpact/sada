/**
 * يرسم اللوحة إلى ملفٍّ لتُرى.
 *
 * وُجد لأنّي كنتُ أبني الواجهة بالاستدلال: أقرأ الرموز وأحسب التباين
 * وأتخيّل النتيجة. **والتصميم لا يُبنى هكذا** — الفرقُ بين «صحيحٍ في
 * الحساب» و«جميلٍ في العين» لا يُدرَك إلا بالنظر.
 *
 * يستورد `panelPage` نفسها لا نسخةً منها، فما يُرى هنا هو ما يُرسَل.
 */
import { writeAudited } from './writeAudited'
import { panelPage, type PanelData } from '../src/routes/panelView'
import { viewChannels, type LinkedAccount } from '../src/lib/channels'
import { pivot } from '../src/lib/pivot'

const now = new Date('2026-09-05T18:00:00Z')

function ago(hours: number): string {
  return new Date(now.getTime() - hours * 3600_000).toISOString().slice(0, 19).replace('T', ' ')
}

const accounts: LinkedAccount[] = [
  { id: 'a1', platform: 'linkedin', kind: 'member', displayName: 'عمر عبدالحميد', status: 'active', createdAt: ago(700), expiresAt: null },
  { id: 'a2', platform: 'linkedin', kind: 'org', displayName: 'بصائر للاستشارات', status: 'active', createdAt: ago(300), expiresAt: null },
  { id: 'a3', platform: 'x', kind: 'member', displayName: '@omar_ah', status: 'needs_reauth', createdAt: ago(1200), expiresAt: null },
]

const data: PanelData = {
  env: 'staging',
  paused: false,
  autoEnqueue: true,
  imageOverlay: true,
  pageOnly: [],
  browserToken: false,
  analysisCap: 10,
  spendCap: 5,
  usedAnalyses: 6,
  usedSpend: 1.84,
  spend30d: 23.41,
  series: [
    { day: '2026-08-23', total: 0.4 }, { day: '2026-08-24', total: 1.1 },
    { day: '2026-08-25', total: 0.9 }, { day: '2026-08-26', total: 2.3 },
    { day: '2026-08-27', total: 1.7 }, { day: '2026-08-28', total: 0 },
    { day: '2026-08-29', total: 0.6 }, { day: '2026-08-30', total: 2.9 },
    { day: '2026-08-31', total: 3.4 }, { day: '2026-09-01', total: 1.2 },
    { day: '2026-09-02', total: 2.1 }, { day: '2026-09-03', total: 1.5 },
    { day: '2026-09-04', total: 2.7 }, { day: '2026-09-05', total: 1.84 },
  ],
  sources: [
    {
      id: 's1', driveFileId: '1kDa1TyYKK_2lpT', name: 'منهجية إدارة المشروعات للقادة — الإطار الأول',
      analyzed: true, stale: false, worth: 0.86,
      summary: 'يشرح الإطارَ الأوّل من المنهجيّة: قيادةُ القيمة، وكيف تُقاس بمعالمَ لا بمخرجات.',
      reason: 'مادّةٌ أصيلة، وفيها إطارٌ قابل للاقتباس.',
      themes: ['إدارة المشروعات', 'القيادة', 'قياس الأثر'], lastSeenAt: ago(3),
    },
    {
      id: 's2', driveFileId: '1deicGMZG72tztw', name: 'تقرير الإغلاق — مشروع الرواد ألبانيا',
      analyzed: true, stale: true, worth: 0.61,
      summary: 'تقريرُ إغلاقٍ فيه أرقامُ المستفيدين والدروسُ المستفادة.',
      reason: 'قابلٌ للنشر بعد تجريده من التفاصيل التعاقديّة.',
      themes: ['أثر', 'ألبانيا'], lastSeenAt: ago(26),
    },
    {
      id: 's3', driveFileId: '1QpXm4Rt9YbNc2v', name: 'مسوّدة — ملاحظاتٌ متفرّقة',
      analyzed: false, stale: false, worth: null, summary: null, reason: null,
      themes: [], lastSeenAt: ago(50),
    },
  ],
  providers: [
    {
      name: 'anthropic', label: 'Anthropic', kind: 'anthropic',
      baseUrl: null, model: 'claude-opus-5', builtin: true, configured: true,
      secretName: 'ANTHROPIC_API_KEY', howToGet: 'console.anthropic.com ← API Keys',
      calls: 47, spend: 18.2, source: 'vault', hint: 'sk-ant-…_QAA', enabled: true,
      dailyCap: null, priceIn: 5, priceOut: 25, spendToday: 1.84, verifiedAt: null, updatedAt: ago(1),
    },
    {
      name: 'gemini', label: 'Gemini', kind: 'openai_compat',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash', builtin: true, configured: false,
      secretName: 'GEMINI_API_KEY', howToGet: 'aistudio.google.com/apikey',
      calls: 0, spend: 0, source: 'none', hint: null, enabled: true,
      dailyCap: null, priceIn: null, priceOut: null, spendToday: 0, verifiedAt: null, updatedAt: ago(400),
    },
    {
      name: 'deepseek', label: 'DeepSeek', kind: 'openai_compat',
      baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', builtin: false,
      configured: true, secretName: null, howToGet: '', calls: 12, spend: 5.21,
      source: 'vault', hint: 'sk-8f3a…c19d', enabled: true, dailyCap: 2,
      priceIn: 0.27, priceOut: 1.1, spendToday: 0.32, verifiedAt: ago(20), updatedAt: ago(20),
    },
  ],
  routing: [
    { task: 'analyze', provider: 'anthropic', model: 'claude-opus-5', why: 'حكمٌ يحتاج فهما عميقا', ready: true, implemented: true },
    { task: 'draft', provider: 'anthropic', model: 'claude-opus-5', why: 'الصياغةُ العربيّة', ready: false, implemented: false },
    { task: 'image', provider: 'gemini', model: 'gemini-2.5-flash-image', why: 'توليدُ الصور', ready: false, implemented: false },
  ],
  knownProviders: [
    { name: 'anthropic', label: 'Anthropic' },
    { name: 'gemini', label: 'Gemini' },
    { name: 'deepseek', label: 'DeepSeek' },
  ],
  drafts: [
    {
      id: 'd1', platform: 'linkedin',
      text: [
        'أكثرُ ما يُهدر في برامج الوقف ليس المال، بل الوقتُ بين القرار وأثره.',
        '',
        'قرأتُ تقرير الأثر لهذا العام مرّتين. في الأولى بحثتُ عن الأرقام، وفي',
        'الثانية عن الفجوات بينها — وهناك وجدتُ ما يستحقّ القول: البرامجُ التي',
        'قِيست شهريّا صحّحت مسارها في الربع الأوّل، والتي قِيست سنويّا اكتشفت',
        'الخطأ بعد أن صار كلفةً لا درسا.',
        '',
        'القياسُ ليس تقريرا يُرفع في آخر السنة. هو أداةُ قيادةٍ تُستعمل وهي حارّة.',
        '',
        'ما الفترةُ التي تقيسون بها أثركم — ولماذا اخترتموها؟',
        '',
        '#الوقف #قياس_الأثر',
      ].join('\n'),
      rationale: 'زاويةُ الوقت لا زاويةُ المبلغ — الأرقامُ في التقرير تخدم الأولى.',
      status: 'draft', model: 'claude-opus-5', cost: 0.0412,
      sourceId: 's1', sourceName: 'تقرير الأثر السنويّ 2026.docx',
      stale: false, approvedBy: null, approvedAt: null,
      createdAt: ago(0.4),
      scheduledAt: null, accountName: null, dispatchedAt: null,
      publishCost: 0, originalText: null
    },
    {
      id: 'd2', platform: 'x',
      text:
        // **نصٌّ عليه ملحوظات** عمدا (D-090): حشوٌ وخاتمةٌ مستهلَكة —
        // ومدقّقٌ لا يرى لوحَ المراجعة لا يحرسه
        'ومما لا شك فيه ان البرامجَ التي تُقاس شهريّا تصحّح مسارها مبكّرا. والتي تُقاس سنويّا تكتشف الخطأ بعد أن يصير كلفةً لا درسا.\n\nما رأيكم؟',
      rationale: 'الفكرةُ كاملةٌ في منشورٍ واحد — لا خيط.',
      status: 'draft', model: 'claude-opus-5', cost: 0.0118,
      sourceId: 's1', sourceName: 'تقرير الأثر السنويّ 2026.docx',
      stale: true, approvedBy: null, approvedAt: null,
      createdAt: ago(0.9),
      scheduledAt: null, accountName: null, dispatchedAt: null,
      // **حالُ التحذير**: رابطٌ على X — ثلاثةَ عشرَ ضعفا (D-069)
      publishCost: 0.2, originalText: null
    },
    {
      id: 'd3', platform: 'linkedin',
      text:
        'ثلاثةُ دروسٍ من مراجعة محفظة البرامج هذا الربع، وأحدها كلّفنا سنةً لنتعلّمه:\n\nأوّلا، البرنامجُ الذي لا صاحبَ له لا يفشل — يذبل. ولا أحد يعلن ذبوله.\n\nثانيا، مؤشّرٌ واحدٌ صادق خيرٌ من لوحةٍ فيها عشرون لا يُنظر إليها.\n\nثالثا، ما لا يُراجَع في اجتماعٍ ثابت لا يُراجَع أبدا.',
      rationale: 'الدروسُ الثلاثة أوضحُ ما في المصدر، وأقربُ إلى قارئ LinkedIn.',
      status: 'edited', model: 'claude-opus-5', cost: 0.0389,
      sourceId: 's2', sourceName: 'مراجعة المحفظة — الربع الثالث.pdf',
      stale: false, approvedBy: 'panel:passkey', approvedAt: ago(22),
      createdAt: ago(26),
      scheduledAt: null, accountName: null, dispatchedAt: null,
      publishCost: 0, originalText: 'قيادةُ القيمة لا تُقاس بالمخرجات بل بالمعالم.\n\nوأكثرُ ما يُهدر في المشروعات هو الوقت.'
    },
    {
      // معتمَدةٌ ثانيةٌ عمدا: شريطُ التوزيع لا يظهر دون اثنتين (D-089)،
      // ومدقّقٌ لا يرى الشريطَ لا يحرسه
      id: 'd3b', platform: 'linkedin',
      text:
        'أكثرُ ما يُهدر في برامج الوقف ليس المال، بل الوقتُ بين القرار وأثره.\n\nوهذا ما يقيسه التقرير: كم يوما بين أن يُعتمد بندٌ وأن يبدأ العمل به.',
      rationale: 'رقمٌ واحدٌ يقف وحده، ويصلح مدخلا للتقرير.',
      status: 'approved', model: 'claude-opus-5', cost: 0.0301,
      sourceId: 's1', sourceName: 'تقرير الأثر السنويّ 2026.docx',
      stale: false, approvedBy: 'panel:passkey', approvedAt: ago(18),
      createdAt: ago(20),
      scheduledAt: null, accountName: null, dispatchedAt: null,
      publishCost: 0, originalText: null
    },
    {
      id: 'd4', platform: 'x',
      text:
        'البرنامجُ الذي لا صاحبَ له لا يفشل — يذبل. ولا أحد يعلن ذبوله.\n\nوهذا أخطر من الفشل الصريح: الفشلُ يُراجَع، والذبولُ يُموَّل سنةً أخرى.',
      rationale: 'أحدُّ جملةٍ في المصدر، وتقف وحدها.',
      status: 'rejected', model: 'claude-opus-5', cost: 0.0102,
      sourceId: 's2', sourceName: 'مراجعة المحفظة — الربع الثالث.pdf',
      stale: false, approvedBy: 'panel:token', approvedAt: null,
      createdAt: ago(30),
      scheduledAt: null, accountName: null, dispatchedAt: null,
      publishCost: 0, originalText: null
    },
    {
      id: 'd5', platform: 'linkedin',
      text:
        'ما يُقاس شهريّا يُصحَّح في حينه. وما يُقاس سنويّا يُوثَّق بعد فوات أوانه.\n\nوالفرقُ بينهما ليس في الدقّة — كلاهما دقيق — بل في أنّ أحدهما يغيّر القرار والآخر يشرحه بعد وقوعه.\n\nاختر أيّهما تبني عليه، واعلم أنّك اخترت.',
      rationale: 'أقصرُ صياغةٍ للفكرة، وأقربُها إلى قرارٍ يُتّخذ.',
      status: 'queued', model: 'claude-opus-5', cost: 0.0355,
      sourceId: 's2', sourceName: 'مراجعة المحفظة — الربع الثالث.pdf',
      stale: false, approvedBy: 'panel:passkey', approvedAt: ago(4),
      createdAt: ago(5),
      scheduledAt: '2026-09-08 09:00:00',
      accountName: 'بصائر للاستشارات',
      dispatchedAt: null,
      publishCost: 0, originalText: null
    },
    {
      id: 'd6', platform: 'x',
      text:
        'البرنامجُ بلا صاحبٍ لا يفشل — يذبل. والذبولُ يُموَّل سنةً أخرى لأنّ أحدا لم يعلنه.',
      rationale: 'جملةٌ تقف وحدها.',
      status: 'queued', model: 'claude-opus-5', cost: 0.0097,
      sourceId: 's2', sourceName: 'مراجعة المحفظة — الربع الثالث.pdf',
      stale: false, approvedBy: 'panel:passkey', approvedAt: ago(9),
      createdAt: ago(10),
      scheduledAt: '2026-09-05 17:45:00',
      accountName: '@omar_ah',
      dispatchedAt: ago(0.2),
      publishCost: 0.015, originalText: null
    },
  ],
  plan: {
    id: 'pl1',
    week: '2026-09-13',
    model: 'claude-opus-5',
    status: 'draft',
    createdAt: ago(3),
    plan: {
      rationale:
        'أسبوعٌ يبدأ بالأثقل: تقريرُ الأثر يفتح النقاش يوم الاثنين، ثمّ تسنده جملةٌ حادّة على X بعد يومين، ويُختم بدرسٍ من مراجعة المحفظة.',
      items: [
        {
          sourceId: 's1', platform: 'linkedin',
          angle: 'زاويةُ الوقت لا زاويةُ المبلغ — الفجوةُ بين القرار وأثره',
          day: '2026-09-14', time: '09:00',
          why: 'أعلى المصادر استحقاقا، ولم يُنشر منه شيء.',
        },
        {
          sourceId: 's1', platform: 'x',
          angle: 'الجملةُ التي تقف وحدها: القياسُ أداةُ قيادةٍ لا تقرير',
          day: '2026-09-16', time: '11:30',
          why: 'المصدرُ نفسه بزاويةٍ أحدّ، وبينهما يومان.',
        },
        {
          sourceId: 's2', platform: 'linkedin',
          angle: 'ثلاثةُ دروسٍ من مراجعة المحفظة، وأحدها كلّف سنة',
          day: '2026-09-18', time: '08:00',
          why: 'يُغلق الأسبوع بخلاصةٍ عمليّة.',
        },
      ],
    },
  },
  planReady: true,
  media: [
    // معاينةٌ محلّيّة: `data:` تكفي للنظر، والحيُّ يُخدَم من `/panel/media/:id`
    {
      id: 'm1', postId: 'd3', mime: 'image/svg+xml', bytes: 148_320, cost: 0.039,
      status: 'ready',
      // **يُرسَم ليُقاس** (D-070): وصفٌ فارغٌ لا يُظهر الشارة
      prompt: 'مشهدٌ تجريديٌّ بالأخضر والذهب، خطوطٌ هادئةٌ وإضاءةٌ ناعمة',
    },
    { id: 'm2', postId: 'd1', mime: 'image/png', bytes: 0, cost: 0, status: 'rejected', prompt: '' },
  ],
  targets: [
    { id: 'a1', platform: 'linkedin', label: 'عمر عبدالحميد · LinkedIn' },
    { id: 'a2', platform: 'linkedin', label: 'بصائر للاستشارات · LinkedIn' },
  ],
  writableSources: [
    { id: 's1', name: 'تقرير الأثر السنويّ 2026.docx' },
    { id: 's2', name: 'مراجعة المحفظة — الربع الثالث.pdf' },
  ],
  draftReady: true,
  flash: { kind: 'ok', text: 'تمّ المسح — رأى 3 · جديد 1. مصدرٌ واحد ينتظر تحليلا.' },
  now,
  csrf: 'demo-csrf-token',
  nonce: 'demoNonce123',
  sessions: [
    { handle: 'x1', at: ago(2), ip: '203.0.113.9', ua: 'Mozilla/5.0 (Macintosh) Chrome/120', via: 'admin_token', current: true },
    { handle: 'x2', at: ago(30), ip: '198.51.100.4', ua: 'Mozilla/5.0 (iPhone) Safari/17', via: 'passkey', current: false },
  ],
  audit: [
    // **كما فعل المالكُ يومَ قرّر** (D-135): ضغطتان على البطاقات وسقفُ الترويج —
    // فيُقاس أنّ المفتاحَ يُقرأ اسمًا، وأنّ المكرَّرَ يُطوى
    { at: ago(0.5), actor: 'panel', action: 'settings.write', target: 'dashboard_tiles', detail: '← تحليلات اليوم · المصادر المحلَّلة · إنفاق ٣٠ يوما · مسوّدات تنتظرك · مجدولٌ للنشر · مزوّدون جاهزون', ip: '203.0.113.9' },
    { at: ago(0.6), actor: 'panel', action: 'settings.write', target: 'dashboard_tiles', detail: '← تحليلات اليوم · إنفاق اليوم · المصادر المحلَّلة · إنفاق ٣٠ يوما', ip: '203.0.113.9' },
    { at: ago(0.7), actor: 'panel', action: 'settings.write', target: 'weekly_promo_cap_usd', detail: '← 2', ip: '203.0.113.9' },
    { at: ago(1), actor: 'panel', action: 'provider.key', target: 'anthropic', detail: 'بُدّل إلى sk-ant-…_QAA', ip: '203.0.113.9' },
    { at: ago(2), actor: 'panel', action: 'session.open', target: null, detail: 'بعاملٍ واحد', ip: '203.0.113.9' },
    { at: ago(26), actor: 'cron', action: 'drive.scan', target: null, detail: 'رأى 3 · تغيّر 1', ip: null },
  ],
  today: {
    items: [
      { at: ago(0.5), kind: 'note', text: 'تغيير إعداد — بطاقات اللوح — مرّتين', go: '#security', goLabel: 'الأمان' },
      { at: ago(0.7), kind: 'note', text: 'تغيير إعداد — سقف الترويج الأسبوعيّ', go: '#security', goLabel: 'الأمان' },
      { at: ago(1), kind: 'note', text: 'تبديل مفتاح — Anthropic', go: '#security', goLabel: 'الأمان' },
      { at: ago(3), kind: 'ok', text: 'اعتمدتَ مسوّدةً لـLinkedIn', go: '#posts', goLabel: 'المنشورات' },
      { at: null, kind: 'ok', text: 'نُشر منشورٌ على LinkedIn', go: '/panel/channels/linkedin', goLabel: 'شاشةُ LinkedIn' },
      { at: null, kind: 'bad', text: 'فشل النشرُ على X', go: '/panel/channels/x', goLabel: 'شاشةُ X' },
    ],
    more: 0,
  },
  rpId: 'sada2.basserh.com',
  via: 'admin_token',
  factors: { passkeys: [], totpConfirmed: false, recoveryLeft: 0, enforced: false },
  channels: viewChannels(accounts, (n) => n.startsWith('LINKEDIN')),
  baseUrl: 'https://sada2.basserh.com',
  // **الشريطُ يُرسَم ليُقاس** — وما لا يُرسَم لا يُقاس (D-061)
  expiring: [
    { platform: 'x', displayName: '@omar_ah', kind: 'refresh', daysLeft: 2 },
    { platform: 'linkedin', displayName: 'بصائر للاستشارات', kind: 'access', daysLeft: 6 },
  ],
  apps: [
    // LinkedIn من البيئة: لا نموذجَ يُعرض، ويُقال لماذا
    {
      platform: 'linkedin', source: 'worker_secret',
      clientId: '78k4gm3yw1g18e', hint: null, updatedAt: null, updatedBy: null,
      secretNames: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
      verifiedAt: null, verifiedKind: null,
    },
    // و X لم يُضبَط: النموذجُ مفتوحٌ بإرشاده
    {
      platform: 'x', source: 'none',
      clientId: null, hint: null, updatedAt: null, updatedBy: null,
      secretNames: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
      verifiedAt: null, verifiedKind: null,
    },
  ],
  // ما زادته القراراتُ الأخيرة — **ويُرسَم ليُقاس**
  openSuggestions: 2,      // D-058
  promoCap: 50,            // D-062
  ownerPending: 4,         // D-063
  cfAccountId: null,       // غيرُ مضبوط: الإرشادُ هو المرسوم
  // ‏قناةُ التنبيهات (D-109) — **وحالان يُرسمان**: ناجحٌ وفاشل، فيُقاس
  // ‏اللونان والتباينُ فيهما معا
  alertWebhook: 'https://hooks.slack.com/services/T00/B00/xxxxxxxx',
  // الافتراضُ نفسُه — فالمقاييسُ تُقارَن بما يراه مَن لم يختر شيئا
  dashboardTiles: 'analyses_today,spend_today,sources_analyzed,spend_30d',
  /*
   * **واللوحُ المحوريُّ يُقاس بجدولٍ فيه صفوف** (D-120): جدولٌ فارغٌ
   * لا يُقاس منه ارتفاعٌ ولا تمزّقٌ ولا تباين — **والمدقّقُ يمرّ عليه
   * فيقول «نظيف» وهو لم ير شيئا**.
   */
  pivot: {
    // **والبذرةُ تحمل مفاتيحَ القاعدة لا أسماءَ العرض** (D-123): كانت
    // `'LinkedIn'` فرُسم الجدولُ بأسماءٍ لن يراها المالك، وستر العيبَ
    table: pivot(
      [
        { platform: 'linkedin', account: 'شخصيّ', status: 'published', day: '2026-09-07', type: 'text', attempts: 1, succeeded: true, cost: 0.02 },
        { platform: 'linkedin', account: 'الشركة', status: 'published', day: '2026-09-08', type: 'image', attempts: 2, succeeded: true, cost: 0.11 },
        { platform: 'x', account: 'شخصيّ', status: 'failed', day: '2026-09-08', type: 'text', attempts: 3, succeeded: false, cost: 0.01 },
        { platform: 'x', account: 'شخصيّ', status: 'published', day: '2026-09-09', type: 'text', attempts: 1, succeeded: true, cost: 0.01 },
        { platform: 'tiktok', account: 'القناة', status: 'queued', day: '2026-09-10', type: 'document', attempts: 0, succeeded: false, cost: 0 },
      ],
      { rows: 'platform', cols: 'status', measure: 'count' },
    ),
    rows: 'platform' as const,
    cols: 'status' as const,
    measure: 'count' as const,
    sinceDays: 30,
    capped: false,
    cap: 1500,
  },
  outbox: [
    { kind: 'token', body: 'صدى — إذنُ التجديد لحساب «بصائر للاستشارات» ينتهي خلال ٧ أيّام.', status: 200, error: null, at: ago(20) },
    { kind: 'budget', body: 'صدى — بلغ إنفاقُ اليوم 5.00$ من سقف 5.00$.', status: 404, error: 'ردّت القناةُ 404', at: ago(50) },
  ],
}

writeAudited(process.argv[2] ?? '/tmp/panel.html', panelPage(data))

/*
 * **ولوحُ اليوم الأوّل وضعٌ ثانٍ يُشحَن — فيُرسَم ليُدقَّق** (D-108).
 *
 * العيّنةُ أعلاه نظامٌ يعمل، **فاللوحُ يختفي فيها وهو الصواب** — ولا
 * يراه مدقّقٌ أبدا. **ووضعٌ يُشحَن ولا يُدقَّق وضعٌ بلا حارس** (D-102).
 *
 * فتُرسَم صورةٌ ثانيةٌ لنظامٍ ناقص: مصادرُ بلا تحليل، ولا قناةَ حيّة،
 * ولا خطّة — **وهي الحالُ التي يفتح فيها المالكُ لوحتَه أوّلَ مرّة**.
 */
writeAudited('/tmp/panel-first.html', panelPage({
  ...data,
  sources: data.sources.map((s) => ({ ...s, analyzed: false, summary: null, worth: null })),
  channels: viewChannels(
    accounts.map((a) => ({ ...a, status: 'needs_reauth' as const })),
    (n) => n.startsWith('LINKEDIN'),
  ),
  plan: null,
  drafts: data.drafts.map((d) => ({ ...d, status: 'draft' as const })),
}))
console.log('رُسمت')
