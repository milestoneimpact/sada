/**
 * **التيّار** `/panel/feed` (D-386): قراءةٌ لكلّ دور، والأفعالُ على البطاقات بمساراتها القائمة وحرّاسِها (`access.ts`
 * و`mayDo`) — فلا اعتمادَ يُعاد بناؤه هنا، والصفحةُ تعرض الزرَّ لمن يملكه وتخفيه عمّن لا.
 *
 * `?s=awaiting|writing|queued|published` يرسم شريحةً واحدة في الخادم (D-446)، وما سواها الكلّ.
 * `?before=YYYY-MM-DD` يفتح ستّين يومًا قبله من «ما نُشر»؛ وما ليس يومًا يُهمَل.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { feedModel } from '../../lib/feed'
import { feedScreen, parseFeedFilter } from '../ui/feedView'
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
  const [zone, flash] = await Promise.all([ownerZone(c.env.DB, c.req.header('Cookie') ?? null), takeFlash(c.env, c.req.raw)])
  const model = await feedModel(c.env.DB, org, zone, now, before)
  const body = feedScreen({ model, zone, now, role: session.record.role ?? 'owner', filter: parseFeedFilter(c.req.query('s')) }) +
    (flash === null ? '' : toastRegion(notice({ tone: flash.kind, html: escapeHtml(flash.text), alert: flash.kind === 'bad' })))
  return page((nonce) => soloPage('صدى — التيّار', { href: '/panel', label: 'الرئيسيّة' }, injectCsrf(body, session.record.csrf), nonce,
    '', buildCommands({ onPanel: false }), soloNav('feed')))
})
