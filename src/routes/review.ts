/**
 * **رابطُ موافقة العميل** — المسارُ العامّ (D-353). لا جلسة: الرمزُ في الرابط هو الإذنُ كلُّه، ويُقارَن ببصمته وحدها.
 *
 * - الرابطُ لخطّةٍ بعينها: إن صارت للمنظّمة خطّةٌ أحدث سقط، ويطلب العميلُ رابطًا جديدًا.
 * - الصورُ بعناوين موقَّعة لربع ساعة (`/m/…`، D-050) لا بعناوين اللوحة التي تطلب جلسة.
 * - الرفضُ جوابٌ واحد بلا سبب (لا يوجد · انتهى · أُلغي · أحدث): لا يُعلَم من الجواب أيُّ الرموز كان صحيحًا.
 * - والعميلُ لا ينشر ولا يعتمد: قرارُه يُكتب في `review_verdicts`، ويُسجَّل في السجلّ، ويظهر إشعارًا للمالك.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { findLink, recordVerdict, verdictsFor, type ClientVerdict } from '../lib/clientReview'
import { latestPlan } from '../lib/plan/job'
import { reviewModel } from '../lib/plan/review'
import { ownerZone } from '../lib/time/ownerZone'
import { signMediaToken } from '../lib/media/link'
import { record } from '../lib/audit'
import { shell } from './ui/shell'
import { clientReviewGone, clientReviewScreen, type ClientCard } from './ui/clientReviewView'
import { page } from './panel/shared'

export const review = new Hono<{ Bindings: Env }>()

const TITLE = 'صدى — راجع منشوراتك'

function gone(): Response {
  return page((nonce) => shell(TITLE, clientReviewGone(), nonce), 404)
}

review.get('/r/:token', async (c) => {
  const now = new Date()
  const link = await findLink(c.env.DB, c.req.param('token'), now)
  if (link === null) return gone()
  const plan = await latestPlan(c.env.DB, link.org)
  if (plan === null || plan.id !== link.planId) return gone()
  const [model, verdicts, zone, orgRow] = await Promise.all([
    reviewModel(c.env.DB, link.org, plan),
    verdictsFor(c.env.DB, link.org, plan.id),
    ownerZone(c.env.DB, null),
    c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(link.org).first<{ name: string }>().catch(() => null),
  ])
  const cards: ClientCard[] = await Promise.all(model.cards.map(async (card) => ({
    card,
    mediaSrc: card.mediaId === null ? null : '/m/' + await signMediaToken(c.env.TOKEN_ENC_KEY, card.mediaId, now).catch(() => ''),
  })))
  const body = clientReviewScreen({
    token: c.req.param('token'), orgName: orgRow?.name ?? 'صدى', cards, verdicts, zone: zone ?? null,
    expiresAt: link.expiresAt, saved: c.req.query('saved') === '1',
  })
  const res = page((nonce) => shell(TITLE, body, nonce))
  // ‏الرمزُ في العنوان: لا يُرسَل إلى موقعٍ آخر في «Referer»، ولا تُخزَّن الصفحةُ في وسيط
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.headers.set('Cache-Control', 'no-store')
  return res
})

review.post('/r/:token', async (c) => {
  const now = new Date()
  const token = c.req.param('token')
  const link = await findLink(c.env.DB, token, now)
  if (link === null) return gone()
  const plan = await latestPlan(c.env.DB, link.org)
  if (plan === null || plan.id !== link.planId) return gone()
  let form: FormData
  try { form = await c.req.formData() } catch { form = new FormData() }
  const key = String(form.get('key') ?? '')
  const verdict = String(form.get('verdict') ?? '')
  const anchor = /^i\d{1,4}$/.test(String(form.get('at') ?? '')) ? '#' + String(form.get('at')) : ''
  if (verdict !== 'approve' && verdict !== 'changes') return c.text('قرارٌ غير معروف', 400)
  // ‏البندُ من هذه الخطّة وحدها — بصمةٌ لا تطابق بندًا قائمًا لا تُكتب
  const model = await reviewModel(c.env.DB, link.org, plan)
  if (!model.cards.some((x) => x.key === key && x.post !== null)) return c.text('لا منشورَ بهذا المرجع', 400)
  await recordVerdict(c.env.DB, link, key, verdict as ClientVerdict, String(form.get('note') ?? ''), now)
  await record(c.env.DB, { actor: 'client', action: 'review.' + verdict, target: plan.id, detail: key }, c.req.raw)
  return new Response(null, { status: 303, headers: { Location: '/r/' + token + '?saved=1' + anchor, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } })
})
