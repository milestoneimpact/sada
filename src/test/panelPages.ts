/**
 * صفحاتُ اللوحة كلُّها (D-211) — **لاختبارٍ يسأل «أيُرسم هذا في اللوحة؟»** لا «في أيّ صفحة».
 *
 * صارت اللوحةُ خمسَ صفحات، وكان مئاتُ الاختبارات يقرأ `/panel` وحدَها. فما يسأل عن وجود شيءٍ يقرأ الخمسَ معًا،
 * **وموضعُ كلّ لوحٍ في صفحته يحرسه اختبارُ البنية** في `panel.test.ts` (الألواحُ في كلّ مسار).
 */
export const PANEL_PAGES = ['/panel', '/panel/library', '/panel/accounts', '/panel/settings', '/panel/analysis'] as const

export async function everyPane(get: (path: string) => Response | Promise<Response>): Promise<string> {
  const pages = await Promise.all(PANEL_PAGES.map(async (p) => (await get(p)).text()))
  return pages.join('\n')
}
