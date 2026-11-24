/**
 * **التيّار** `/panel/feed` (D-386): قراءةٌ لكلّ دور، والأفعالُ على البطاقات بمساراتها القائمة وحرّاسِها (`access.ts`
 * و`mayDo`) — فلا اعتمادَ يُعاد بناؤه هنا، والصفحةُ تعرض الزرَّ لمن يملكه وتخفيه عمّن لا.
 *
 * `?before=YYYY-MM-DD` يفتح ستّين يومًا قبله من «ما نُشر»؛ وما ليس يومًا يُهمَل. و`?m=YYYY-MM` شهرٌ بتوقيت المالك،
 * و`?s=pending|approved|queued|published|failed` مرشِّحُ رحلة الشهر (D-389).
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { feedModel, isFeedFilter } from '../../lib/feed'
import { isPeriod } from '../../lib/plan/month'
import { feedScreen } from '../ui/feedView'
import { loadSession } from '../../lib/session'
import { activeOrg } from '../../lib/tenancy'
import { ownerZone } from '../../lib/time/ownerZone'
import { notice, toastRegion } from '../ui/components/toast'
import { escapeHtml } from '../ui/escape'
import { injectCsrf, soloPage } from '../ui/shell'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { loginResponse, page, takeFlash } from './shared'

export const feed = new Hono<{ Bindings: Env }>()

feed.get('/panel/feed', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const now = new Date()
  const q = c.req.query('before') ?? ''
  const before = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : null
  // ‏الشهرُ والمرشِّح (D-389): ما ليس شهرًا ولا مرشِّحًا معروفًا يُهمَل، فالصفحةُ لا تنكسر بعنوانٍ فاسد
  const m = c.req.query('m')
  const month = isPeriod(m) ? m : null
  const s = c.req.query('s')
  const filter = isFeedFilter(s) ? s : null
  const [zone, flash] = await Promise.all([ownerZone(c.env.DB, c.req.header('Cookie') ?? null), takeFlash(c.env, c.req.raw)])
  const model = await feedModel(c.env.DB, org, zone, now, before, month)
  const body = feedScreen({ model, zone, now, role: session.record.role ?? 'owner', filter }) +
    (flash === null ? '' : toastRegion(notice({ tone: flash.kind, html: escapeHtml(flash.text), alert: flash.kind === 'bad' })))
  return page((nonce) => soloPage('صدى — التيّار', { href: '/panel', label: 'الرئيسيّة' }, injectCsrf(body, session.record.csrf), nonce,
    '', buildCommands({ onPanel: false }), soloNav('feed')))
})
