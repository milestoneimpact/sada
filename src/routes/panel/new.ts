/**
 * **«منشورات جديدة»** `/panel/new` (D-387): بابٌ واحدٌ إلى الطرق الثلاثة — المعالجُ والملفُّ والحزمة. قراءةٌ لا فعل، لكنّ الطرقَ
 * كلَّها كتابةٌ وبناء، فالبابُ للمحرّر فأعلى: القارئُ يُردّ إلى التيّار بسببه (كما تُخفي الصفحاتُ أزرارَها عنه).
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { loadSession } from '../../lib/session'
import { activeOrg } from '../../lib/tenancy'
import { allows } from '../../lib/access'
import { readSource } from '../../lib/package/sync'
import { newScreen } from '../ui/newView'
import { injectCsrf, soloPage } from '../ui/shell'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { loginResponse, page, setFlash } from './shared'

export const newEntry = new Hono<{ Bindings: Env }>()

newEntry.get('/panel/new', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (!allows(session.record.role ?? 'owner', 'editor')) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'المنشوراتُ الجديدة للمحرّر فأعلى — والتيّارُ يُقرأ.' })
    return c.redirect('/panel/feed', 303)
  }
  const hasPackage = (await readSource(c.env.DB, activeOrg(session.record)).catch(() => null)) !== null
  return page((nonce) => soloPage('صدى — منشورات جديدة', { href: '/panel/feed', label: 'التيّار', at: '/panel/new' },
    injectCsrf(newScreen({ hasPackage }), session.record.csrf), nonce, '', buildCommands({ onPanel: false }), soloNav('feed')))
})
