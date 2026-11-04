/**
 * **من يملك ماذا** (D-272) — الدورُ يُفحَص على الخادم في كلّ طلب، لا في الواجهة وحدها.
 *
 * - **القاعدةُ بالمسار**: جدولٌ واحدٌ يقول أدنى دورٍ لكلّ بابٍ يغيّر شيئًا، **وما لم يُذكر فللمالك** — بابٌ جديدٌ يُنسى تصنيفُه
 *   يُغلَق لا يُفتح.
 * - **والقراءةُ مفتوحةٌ للقارئ** إلّا الفريقَ والإعدادات.
 * - **ومن يعمل الآن** في `AsyncLocalStorage` لهذا الطلب وحده: سجلُّ التدقيق يكتب بريدَه، وقائمةُ الشركات تُقصَر على شركاته،
 *   بلا تمريرٍ عبر مئات النداءات.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Role } from './ownerEmail'
import type { Who } from './team'

export const ROLE_RANK: Readonly<Record<Role, number>> = { viewer: 1, editor: 2, publisher: 3, admin: 4, owner: 5 }

export function allows(role: Role, need: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[need]
}

/** أبوابٌ بلا جلسةٍ أو قبل اكتمالها — الدخولُ والخروجُ والعاملُ الثاني. */
const OPEN = /^\/panel\/(login|logout|2fa|passkey\/(challenge|login))(\/|$)/

const RULES: readonly (readonly [RegExp, Role])[] = [
  // ‏المالكُ وحدَه: الفريق، والأمان، والجلسات، ومفاتيحُ المزوّدين، والإعدادات العامّة، وإنشاءُ الشركات، وتطبيقاتُ المنصّات
  [/^\/panel\/(team|security|sessions|providers|routes|channels\/app)(\/|$)/, 'owner'],
  [/^\/panel\/(settings|orgs)$/, 'owner'],
  // ‏المدير: ربطُ القنوات وفصلُها، والمسحُ والتحليل، والترويج، واستيرادُ الخطط
  [/^\/panel\/(channels\/disconnect|scan|analyze|sources|images\/quota|report\/promote|plan-import|plan\/import|client\/limits)(\/|$)/, 'admin'],
  // ‏الناشر: كلُّ ما يعتمد أو يجدول أو يُنشر
  [/^\/panel\/drafts\/(approve-many|schedule|reschedule|unschedule|requeue|spread\/apply|undo-approve|undo-reject)$/, 'publisher'],
  [/^\/panel\/plan\/(approve|approve-all|start|schedule|pin|review\/approve|review\/bulk)$/, 'publisher'],
  [/^\/panel\/uploads\/[^/]+\/schedule$/, 'publisher'],
  [/^\/panel\/client\/report\/send$/, 'publisher'],
  // ‏المحرّر: الكتابةُ والتعديلُ والتخطيطُ والوسائط
  [/^\/panel\/(drafts\/(write|idea|spread)|media|uploads|plan|client\/brief|assets\/upload)(\/|$)/, 'editor'],
  // ‏القارئ: الانتقالُ بين شركاته، وإطفاءُ عدّاد الإشعارات (D-294) — الفعلُ نفسُه يبقى بدوره في مساره
  [/^\/panel\/(orgs\/switch|notices\/read)$/, 'viewer'],
]

/**
 * أدنى دورٍ لهذا الطلب، أو `null` لبابٍ مفتوح.
 * و`/panel/drafts/decide` بحسب ما يُطلب: «احفظ» للمحرّر، والاعتمادُ والرفضُ للناشر.
 */
export function requiredRole(method: string, path: string, action?: string | null): Role | null {
  if (OPEN.test(path)) return null
  if (path.startsWith('/oauth/')) return 'admin'
  if (method === 'GET' || method === 'HEAD') {
    if (/^\/panel\/team(\/|$)/.test(path)) return 'owner'
    if (/^\/panel\/(settings|tasks)(\/|$)/.test(path)) return 'admin'
    return 'viewer'
  }
  if (path === '/panel/drafts/decide') return action === 'save' ? 'editor' : 'publisher'
  for (const [re, role] of RULES) if (re.test(path)) return role
  return 'owner'
}

export function orgAllowed(who: Pick<Who, 'orgs'>, org: string): boolean {
  return who.orgs === '*' || who.orgs.includes(org)
}

const store = new AsyncLocalStorage<Who>()

/** يشغّل الطلبَ باسم صاحبه. */
export function runAs<T>(who: Who, fn: () => T): T {
  return store.run(who, fn)
}

/** من يعمل الآن — أو `undefined` خارج طلبٍ مُصادَق (المهامُّ المجدولةُ والطوابير). */
export function whoNow(): Who | undefined {
  return store.getStore()
}
