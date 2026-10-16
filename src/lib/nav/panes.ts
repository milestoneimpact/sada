/**
 * **أين تسكن كلُّ مرساة** — مصدرٌ واحدٌ للخادم والسكربت (خطّة التصميم 5.2 و11.5 · D-211).
 *
 * كانت اللوحةُ صفحةً واحدةً بستّة ألواح: ‏166KB غيرَ مضغوطة و‏32KB مضغوطة (`size_check`)، والخطّةُ ‏90 و‏25. فصارت
 * «المكتبة» و«الحسابات» و«الإعدادات» و«التحليل» صفحاتٍ بمساراتها، وبقيت الرئيسيّةُ والمنشوراتُ في `/panel` — كلُّ فعلٍ
 * على بطاقةٍ يعود إلى `/panel#d-…` كما كان، فلا يُمسّ مسارُ القرار اليوميّ.
 *
 * **والمرساةُ القديمة لا تنكسر**: الخادمُ لا يرى ما بعد `#`، فالتحويلُ في موضعين يقرآن من هنا — `back()` في الخادم
 * يكتب المسارَ الصحيح، وسكربتُ اللوحة يحوّل `/panel#settings` المحفوظةَ في المفضّلة إلى `/panel/settings#settings`.
 */
export type PaneId = 'overview' | 'posts' | 'library' | 'accounts' | 'settings' | 'results'

/** مسارُ كلّ لوح. والرئيسيّةُ والمنشوراتُ معًا في `/panel`. */
export const PANE_PATH: Readonly<Record<PaneId, string>> = {
  overview: '/panel',
  posts: '/panel',
  library: '/panel/library',
  accounts: '/panel/accounts',
  settings: '/panel/settings',
  results: '/panel/analysis',
}

/** المراسي التي انتقلت بأسمائها — والباقي في `/panel`. */
export const MOVED_ANCHORS: Readonly<Record<string, string>> = {
  library: PANE_PATH.library, sources: PANE_PATH.library, videos: PANE_PATH.library,
  'sub-videos': PANE_PATH.library, 'sub-images': PANE_PATH.library, vfile: PANE_PATH.library,
  accounts: PANE_PATH.accounts, channels: PANE_PATH.accounts,
  settings: PANE_PATH.settings, limits: PANE_PATH.settings, providers: PANE_PATH.settings,
  security: PANE_PATH.settings, activity: PANE_PATH.settings, dev: PANE_PATH.settings,
  factors: PANE_PATH.settings, tiles: PANE_PATH.settings,
  appearance: PANE_PATH.settings, system: PANE_PATH.settings, machine: PANE_PATH.settings,
  results: PANE_PATH.results, pivot: PANE_PATH.results,
}

/** وبادئاتُ المعرّفات: بطاقةُ منصّة `ch-…`، وصفُّ مقطع `v-…`. */
export const MOVED_PREFIXES: readonly (readonly [string, string])[] = [
  ['ch-', PANE_PATH.accounts],
  ['v-', PANE_PATH.library],
]

/** مسارُ المرساة — `null` لما بقي في `/panel`. */
export function anchorPath(anchor: string): string | null {
  const exact = MOVED_ANCHORS[anchor]
  if (exact !== undefined) return exact
  for (const [p, path] of MOVED_PREFIXES) if (anchor.startsWith(p)) return path
  return null
}

/** الرابطُ الكاملُ إلى مرساة — بمسار لوحها. */
export function panelHref(anchor: string): string {
  return `${anchorPath(anchor) ?? '/panel'}#${anchor}`
}
