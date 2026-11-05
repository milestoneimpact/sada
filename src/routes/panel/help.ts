/**
 * `GET /panel/help` — دليلُ المالك داخل اللوحة (D-305). صفحةٌ ثابتة بلا قراءةٍ من القاعدة: المحطّاتُ والأسئلةُ والاختصارات.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { loadSession } from '../../lib/session'
import { injectCsrf, soloPage } from '../ui/shell'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { helpScreen } from '../ui/helpView'
import { loginResponse, page } from './shared'

export const help = new Hono<{ Bindings: Env }>()

help.get('/panel/help', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  return page((nonce) =>
    soloPage('صدى — المساعدة', { href: '/panel', label: 'اللوحة' },
      injectCsrf(helpScreen(), session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('overview')),
  )
})
