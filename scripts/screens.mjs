/**
 * قائمةُ الشاشات المصيَّرة — في موضعٍ واحد (D-278).
 *
 * كانت القائمةُ نفسُها (ثلاثون مسارًا في `/tmp`) مكرَّرةً في عشرة أوامر في
 * `package.json`، فشاشةٌ تُضاف إلى أمرٍ وتُنسى في آخر تُدقَّق في بوّابةٍ
 * وتفلت من أخرى. فالمجموعاتُ هنا، والأمرُ يسأل: `$(node scripts/screens.mjs kit)`.
 *
 *   base      كلُّ الصفحات التي يراها المالك (اللوحةُ والشاشات والخصوصيّة)
 *   kit       base + عُدّةُ الشاشة (للأنماط والخطوط والجوّال وCSP)
 *   copy      base + شاشةُ «اتّصل» (لحارس النصّ)
 *   text      ما يُقاس نصُّه
 *   print     ما يُطبَع
 */
// ‏و«الرئيسيّةُ الخالية» بحسابيها (D-326): قائمةُ البدء و«منصّاتٌ لاحقة» مفتوحة — وضعٌ يُشحَن فيُدقَّق
const PANEL = ['panel', 'panel-library', 'panel-accounts', 'panel-settings', 'panel-results', 'panel-first',
  'panel-first-accounts', 'panel-zero', 'panel-zero-accounts', 'panel-editor', 'panel-editor-queued', 'panel-week', 'panel-plan-off']
// ‏و«بوّابات المراحل» بجانب «ما عليك» (دمجُ D-318 مع D-324): خرجت منها إلى صفحتها، فتُدقَّق حيثما دُقّقت هي.
// ‏و«تفتح قدرة» كذلك (متابعة D-324): مهامُّ القدرة خرجت من «ما عليك» إلى صفحتها
const SCREENS = ['screen-tasks', 'screen-tasks-later', 'screen-gates', 'screen-wizard', 'screen-report', 'screen-linkedin', 'screen-li-setup', 'screen-x',
  'screen-tiktok', 'screen-link-only', 'screen-yt-setup', 'screen-instagram', 'screen-unbuilt', 'screen-refused',
  'screen-journey', 'screen-spread', 'screen-notices', 'screen-plan-new', 'screen-plan-build', 'screen-plan-review', 'screen-assets', 'screen-plan-seat', 'screen-plan-doc', 'screen-package', 'screen-timeline', 'screen-login', 'screen-2fa', 'screen-enrol', 'screen-stepup', 'screen-resume', 'screen-resume-invite', 'screen-resume-cut', 'screen-404', 'screen-landing',
  'screen-500']
const BASE = [...PANEL, ...SCREENS, 'privacy']

export const GROUPS = {
  base: BASE,
  kit: [...PANEL, ...SCREENS, 'screen-kit', 'privacy'],
  copy: [...PANEL, ...SCREENS, 'screen-connected', 'privacy'],
  text: [...PANEL, 'screen-tasks', 'screen-tasks-later', 'screen-gates', 'screen-wizard', 'screen-report', 'screen-journey', 'screen-spread', 'screen-notices', 'screen-plan-new', 'screen-plan-build', 'screen-plan-review', 'screen-plan-seat', 'screen-plan-doc', 'screen-linkedin',
    'screen-li-setup', 'screen-login', 'screen-2fa', 'screen-enrol', 'screen-stepup', 'screen-resume', 'screen-resume-invite', 'screen-resume-cut', 'screen-404', 'screen-landing', 'screen-500', 'privacy'],
  print: ['privacy', 'screen-plan-doc', 'screen-report', 'screen-journey', 'screen-tasks', 'screen-tasks-later', 'screen-gates', 'screen-spread', 'screen-timeline'],
}

const group = process.argv[2] ?? 'base'
const names = GROUPS[group]
if (names === undefined) {
  console.error(`مجموعةٌ غير معروفة: ${group} — المتاح: ${Object.keys(GROUPS).join(' · ')}`)
  process.exit(1)
}
process.stdout.write(names.map((n) => `/tmp/${n}.html`).join(' ') + '\n')
