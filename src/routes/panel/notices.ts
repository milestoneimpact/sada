/**
 * مساراتُ الإشعارات (D-294): الصفحةُ كاملةً، و«علّمها مقروءةً».
 *
 * الصفحةُ تقرأ أربعَ جملٍ وما في الذاكرة (`collectNotices`)، والعدّادُ في ترويسة كلّ لوحٍ جملةٌ واحدة في
 * `shellData` (`unreadNotices`). والقراءةُ لكلّ دور: من يرى اللوحةَ يرى إشعاراتها ويطفئ عدّادَها — والفعلُ
 * نفسُه (أعد الربط، افتح المنشور) يبقى بدوره في مساره.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { loadSession } from '../../lib/session'
import { activeOrg } from '../../lib/tenancy'
import { pulses, readHeartbeats } from '../../lib/ops/heartbeat'
import { checkAllowance } from '../../lib/limits'
import { collectNotices, markRead, readMarks } from '../../lib/notices'
import { injectCsrf, soloPage } from '../ui/shell'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { noticesScreen } from '../ui/noticesView'
import { guardPost, loginResponse, page, setFlash } from './shared'

export const notices = new Hono<{ Bindings: Env }>()

notices.get('/panel/notices', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const org = activeOrg(session.record)
  const now = new Date()
  const [beats, allowance, reads] = await Promise.all([
    readHeartbeats(c.env.DB),
    checkAllowance(c.env.DB, 'image').catch(() => null),
    readMarks(c.env.DB, org),
  ])
  const list = await collectNotices(c.env.DB, org, now, { pulses: pulses(beats, now), allowance })
  const body = noticesScreen({ notices: list, reads, now })
  return page((nonce) =>
    soloPage('صدى — الإشعارات', { href: '/panel', label: 'اللوحة' },
      injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('overview')),
  )
})

notices.post('/panel/notices/read', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const refs = gate.form.getAll('ref').map(String)
  const n = await markRead(c.env.DB, org, refs, gate.session.record.email ?? null)
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: n === 0 ? 'لا شيء يُعلَّم.' : 'عُلّم ' + n + (n === 1 ? ' إشعارٌ' : ' إشعارات') + ' مقروءةً.' })
  return c.redirect('/panel/notices', 303)
})
