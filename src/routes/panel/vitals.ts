/**
 * `POST /panel/vitals` — عيّنةُ سرعةٍ من المتصفّح (D-299).
 *
 * يصل بـ `sendBeacon` من سكربت الواجهة ومعه رمزُ النموذج، فيمرّ بحارس النماذج نفسِه (جلسةٌ كاملة ورمزٌ يطابق):
 * لا بابَ ثانيًا. وما لا يُقرأ يُردّ ‏400 بلا سجلّ: البوّابةُ لا تُحدث ضجيجًا في سجلّ النشاط. والردُّ ‏204: المتصفّحُ
 * لا ينتظر شيئًا.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { activeOrg } from '../../lib/tenancy'
import { isDevice, isMetric, MAX_VALUE, pageKey, recordVital } from '../../lib/vitals'
import { guardPost } from './shared'

export const vitals = new Hono<{ Bindings: Env }>()

vitals.post('/panel/vitals', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const metric = String(gate.form.get('metric') ?? '')
  const value = Number(gate.form.get('value'))
  const page = pageKey(String(gate.form.get('page') ?? ''))
  const device = String(gate.form.get('device') ?? '')
  if (!isMetric(metric) || !isDevice(device) || page === null || !Number.isFinite(value) || value < 0 || value > MAX_VALUE) {
    return Response.json({ error: 'bad_sample', detail: 'عيّنةٌ لا تُقرأ.' }, { status: 400 })
  }
  await recordVital(c.env.DB, activeOrg(gate.session.record), { metric, value, page, device })
  return new Response(null, { status: 204 })
})
