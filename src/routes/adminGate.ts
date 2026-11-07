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
 * ١ · **الحدُّ قبل الرمز** (`reserveAdminCall`): ثلاثون نداءً في ربع ساعةٍ لكلّ مصدر، وستّون لشبكة IPv6 `/48`.
 *     والعطلُ يغلق (‏503) ولا يفتح (D-291). **والمردودُ وحده بعد الرمز** (`reserveAdminFailure`، مراجعة D-318): ستّون لشبكة
 *     IPv4 `/24`، وثلاثمئةٌ للجميع — فقاطعٌ يملؤه المجهولُ لا يردّ صاحبَ الرمز.
 * ٢ · **ثمّ الرمزُ بمقارنةٍ ثابتة الزمن** (`authorizeAdmin` · `sameSecret`): على بصمتين، فلا يُستدلّ من زمن الردّ على
 *     طوله ولا على أوّل محارفه. **والإخفاقُ ردٌّ واحدٌ لا يقول شيئًا** (‏401 `unauthorized`) — سببُه في السجلّ للمالك.
 * ٣ · **ثمّ البابُ**: ما يناديه المستودعُ أو وثائقُه (`ADMIN_IN_USE`: الجاهزيّةُ والمسح) مفتوح، والثلاثةُ التي لا يناديها
 *     أحدٌ (المزوّدون والمصادر والتحليل) **مغلقةٌ حتّى يفتحها المالك** من «للمطوّر» (`admin_api`).
 * ٤ · **وصفٌّ في سجلّ النشاط لكلّ نداءٍ بالرمز** — المسارُ والفعلُ وحالُ الردّ، **ولا الرمزُ ولا جزءٌ منه أبدًا**. **والمردودُ
 *     صفٌّ عند أوّله ثمّ عند كلّ ضعف** (1 و2 و4 و8 و16 من العنوان في ربع الساعة، مراجعة D-318)، وصفُّ «كثرت» مرّةً لكلّ دلوٍ
 *     في نافذته، و«سجلّ النشاط» يطوي ما يكتبه المجهولُ إلى آخره (`recentAudit`): ثلاثون نداءً بلا رمزٍ كانت ثلاثين صفًّا،
 *     والعرضُ خمسون، فيدفع المجهولُ أحداثَ الأمان الحقيقيّة خارجه.
 *
 * والتحليلُ المدفوعُ يمرّ بـ `analyzeSource` نفسِها التي يمرّ بها زرُّ اللوحة: الإيقافُ وسقفُ التحليل وسقفُ الإنفاق وسقفُ
 * المزوّد قبل النداء، وصفُّ `cost_ledger` قبل أن يُعدّ ناجحًا (D-008).
 */
import type { Context, Next } from 'hono'
import type { Env } from '../env'
import { authorizeAdmin } from '../lib/adminAuth'
import { record } from '../lib/audit'
import { reserveAdminCall, reserveAdminFailure, type AdminSlot } from '../lib/security/gate'
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

/** ما يُكتب في صفّ «كثرت» لكلّ دلو — مرّةً في نافذته. */
const LIMITED_DETAIL = {
  local: 'نداءً في ربع ساعة من هذا العنوان',
  net: 'نداءً في ربع ساعة من شبكة هذا العنوان',
  global: 'نداءً مردودًا في ربع ساعة من عناوين شتّى',
} as const

/** أوّلُ المردود وكلُّ ضعفٍ بعده: 1 و2 و4 و8 و16 — خمسةُ صفوفٍ لا ثلاثون. */
function worthRow(count: number): boolean {
  return count > 0 && (count & (count - 1)) === 0
}

/** ردٌّ واحدٌ لكلّ إخفاق — لا يقول أيُّ الثلاثة وقع (D-318). */
function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } })
}

export async function adminGate(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const path = c.req.path
  const request = c.req.raw
  const audit = (action: string, detail: string): Promise<void> =>
    record(c.env.DB, { actor: 'admin_token', action, target: path.slice(0, 120), detail }, request)

  // ‏صفٌّ واحدٌ عند أوّل تجاوزٍ **لكلّ دلو** (مراجعة D-318) لا صفٌّ لكلّ نداءٍ بعده: الحدُّ لا يصير بابًا يملأ السجلّ.
  // ‏وكان يُكتب عند حدّ العنوان وحده (‏31)، فشبكةٌ أو قاطعٌ يردّان لا يتركان أثرًا
  const refuse = async (slot: AdminSlot): Promise<Response> => {
    if (slot.why === 'db') return Response.json({ error: 'unavailable' }, { status: 503 })
    if (slot.tier !== undefined && slot.limit !== undefined && slot.count === slot.limit + 1) {
      await audit('admin.limited', String(slot.count) + ' ' + LIMITED_DETAIL[slot.tier])
    }
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '900' } })
  }

  const slot = await reserveAdminCall(c.env.DB, request)
  if (!slot.allowed) return await refuse(slot)

  const verdict = await authorizeAdmin(c.env.ADMIN_TOKEN, request)
  if (verdict.kind !== 'ok') {
    // ‏والمردودُ وحدَه يُعدّ في شبكة IPv4 وفي القاطع العامّ (مراجعة D-318): المجهولُ يملؤهما ولا يردّ صاحبَ الرمز
    const failure = await reserveAdminFailure(c.env.DB, request)
    if (!failure.allowed) return await refuse(failure)
    if (worthRow(failure.count)) {
      const why = verdict.kind === 'denied' ? 'كلمة إدارة مخالفة بطول ' + String(verdict.presentedLength) : DENIED_DETAIL[verdict.kind]
      await audit('admin.denied', failure.count === 1 ? why : why + ' · المردود ' + String(failure.count) + ' من هذا العنوان في ربع ساعة')
    }
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
