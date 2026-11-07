/**
 * **بوّابةُ `/admin/*`** (D-018 · D-019 · D-318) — قبل كلّ مسار إدارة، مرّةً واحدة.
 *
 * ## ما كان
 *
 * رمزٌ ثابتٌ (`ADMIN_TOKEN`) يفتح أربعةَ أبواب بلا حدٍّ ولا سجلّ: قراءةُ المزوّدين والمصادر، ومسحُ Drive، **وتحليلٌ مدفوع**.
 * ولا يمرّ بالعامل الثاني ولا بحدّ المحاولات، ولا يُكتب منه صفٌّ في سجلّ النشاط — فرمزٌ يسرّب يعمل في صمت. وكان الإخفاقُ
 * يقول للمنادي أهو بلا ترويسةٍ أم بطولٍ خاطئ، وأيُّ رمزٍ غيرُ مضبوطٍ على البيئة.
 *
 * ## ما صار
 *
 * ١ · **الحدُّ قبل الرمز** (`reserveAdminCall`): ثلاثون نداءً في ربع ساعةٍ لكلّ مصدر، وستّون لشبكته، وثلاثمئةٌ للجميع.
 *     والعطلُ يغلق (‏503) ولا يفتح (D-291).
 * ٢ · **ثمّ الرمزُ بمقارنةٍ ثابتة الزمن** (`authorizeAdmin` · `sameSecret`): على بصمتين، فلا يُستدلّ من زمن الردّ على
 *     طوله ولا على أوّل محارفه. **والإخفاقُ ردٌّ واحدٌ لا يقول شيئًا** (‏401 `unauthorized`) — سببُه في السجلّ للمالك.
 * ٣ · **ثمّ البابُ**: ما يناديه المستودعُ أو وثائقُه (`ADMIN_IN_USE`: الجاهزيّةُ والمسح) مفتوح، والثلاثةُ التي لا يناديها
 *     أحدٌ (المزوّدون والمصادر والتحليل) **مغلقةٌ حتّى يفتحها المالك** من «للمطوّر» (`admin_api`).
 * ٤ · **وصفٌّ في سجلّ النشاط لكلّ نداء** — المسارُ والفعلُ وحالُ الردّ، **ولا الرمزُ ولا جزءٌ منه أبدًا**.
 *
 * والتحليلُ المدفوعُ يمرّ بـ `analyzeSource` نفسِها التي يمرّ بها زرُّ اللوحة: الإيقافُ وسقفُ التحليل وسقفُ الإنفاق وسقفُ
 * المزوّد قبل النداء، وصفُّ `cost_ledger` قبل أن يُعدّ ناجحًا (D-008).
 */
import type { Context, Next } from 'hono'
import type { Env } from '../env'
import { authorizeAdmin } from '../lib/adminAuth'
import { record } from '../lib/audit'
import { MAX_ADMIN_CALLS, reserveAdminCall } from '../lib/security/gate'
import { readSettings } from '../lib/settings'

export type AdminEndpoint = 'ready' | 'scan' | 'providers' | 'sources' | 'analyze'

/**
 * **ما يناديه المستودعُ أو وثائقُه** (D-318): `/admin/ready` في `MANUAL-TASKS` وسير النشر بعد أن خرج التفصيلُ من
 * `/ready`، و`/admin/scan` في `MANUAL-TASKS` (‏`curl -X POST …/admin/scan`). والثلاثةُ الباقيةُ لا يناديها شيءٌ في المستودع
 * ولا في وثيقةٍ حيّة — ذكرُها في قرارات D-025 وD-026 تأريخٌ لبنائها لا طريقةُ استعمال، ولكلٍّ منها بابٌ في اللوحة.
 */
export const ADMIN_IN_USE: ReadonlySet<AdminEndpoint> = new Set<AdminEndpoint>(['ready', 'scan'])

export function adminEndpoint(path: string): AdminEndpoint | null {
  if (path === '/admin/ready') return 'ready'
  if (path === '/admin/scan') return 'scan'
  if (path === '/admin/providers') return 'providers'
  if (path === '/admin/sources') return 'sources'
  if (path.startsWith('/admin/analyze/')) return 'analyze'
  return null
}

const DENIED_DETAIL = {
  disabled: 'ADMIN_TOKEN غير مضبوط على هذه البيئة',
  no_header: 'بلا ترويسة Authorization: Bearer',
} as const

/** ردٌّ واحدٌ لكلّ إخفاق — لا يقول أيُّ الثلاثة وقع (D-318). */
function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
}

export async function adminGate(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const path = c.req.path
  const request = c.req.raw
  const audit = (action: string, detail: string): Promise<void> =>
    record(c.env.DB, { actor: 'admin_token', action, target: path.slice(0, 120), detail }, request)

  const slot = await reserveAdminCall(c.env.DB, request)
  if (!slot.allowed) {
    if (slot.why === 'db') return Response.json({ error: 'unavailable' }, { status: 503 })
    // ‏صفٌّ واحدٌ عند أوّل تجاوزٍ لا صفٌّ لكلّ نداءٍ بعده: الحدُّ لا يصير بابًا يملأ السجلّ
    if (slot.count === MAX_ADMIN_CALLS + 1) await audit('admin.limited', String(slot.count) + ' نداءً في ربع ساعة')
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '900' } })
  }

  const verdict = await authorizeAdmin(c.env.ADMIN_TOKEN, request)
  if (verdict.kind !== 'ok') {
    await audit('admin.denied', verdict.kind === 'denied' ? 'كلمة إدارة مخالفة بطول ' + String(verdict.presentedLength) : DENIED_DETAIL[verdict.kind])
    return unauthorized()
  }

  const endpoint = adminEndpoint(path)
  if (endpoint !== null && !ADMIN_IN_USE.has(endpoint) && !(await readSettings(c.env.DB)).adminApi) {
    await audit('admin.off', c.req.method + ' — البابُ مغلقٌ حتّى يفتحه المالك')
    return Response.json(
      { error: 'endpoint_off', detail: 'هذا البابُ مغلقٌ حتّى يفتحه المالك: الإعدادات ← متقدّم ← للمطوّر ← أبواب الطرفيّة.' },
      { status: 403 },
    )
  }

  await next()
  // ‏«الفعلُ ← الحال» كما تُكتب تفاصيلُ السجلّ كلُّها، والسهمُ يرسمه السجلُّ (`pathArrows`)
  await audit('admin.call', [c.req.method, String(c.res.status)].join(' ← '))
}
