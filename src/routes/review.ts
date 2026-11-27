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
import { clientIdentity, findLink, recordVerdict, verdictsFor, type ClientVerdict } from '../lib/clientReview'
import { validZone } from '../lib/time/zone'
import { CLIENT_TZ_COOKIE, CLIENT_TZ_SCRIPT } from './ui/clientReviewView'
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

/** منطقةُ متصفّح العميل من كعكته القصيرة على `/r` (D-428) — ليست سرًّا ولا تدخل قرارًا. */
export function clientZoneOf(cookie: string | null): string | null {
  const m = new RegExp('(?:^|;\\s*)' + CLIENT_TZ_COOKIE + '=([^;]+)').exec(cookie ?? '')
  if (m === null) return null
  // ‏و«UTC» ليست منطقةَ إنسان (D-436): متصفّحٌ بلا ضبطٍ أو آليٌّ يقولها، فيُعاد الرسمُ بعد «موافق» بغرينتش — فتسقط إلى منطقة المالك
  try { const z = validZone(decodeURIComponent(m[1]!)); return z === null || /^(Etc\/)?(UTC|GMT|Universal|Zulu)$/i.test(z) ? null : z } catch { return null }
}

function gone(): Response {
  return page((nonce) => shell(TITLE, clientReviewGone(), nonce), 404)
}

review.get('/r/:token', async (c) => {
  const now = new Date()
  const link = await findLink(c.env.DB, c.req.param('token'), now)
  if (link === null) return gone()
  const plan = await latestPlan(c.env.DB, link.org)
  if (plan === null || plan.id !== link.planId) return gone()
  const [model, verdicts, zone, identity, accounts] = await Promise.all([
    reviewModel(c.env.DB, link.org, plan),
    verdictsFor(c.env.DB, link.org, plan.id),
    ownerZone(c.env.DB, null),
    clientIdentity(c.env.DB, link.org),
    c.env.DB.prepare("SELECT platform, display_name FROM accounts WHERE org_id = ? AND status = 'active' ORDER BY id")
      .bind(link.org).all<{ platform: string; display_name: string | null }>().then((r) => r.results).catch(() => []),
  ])
  const authors: Record<string, string> = {}
  for (const a of accounts) if (authors[a.platform] === undefined && a.display_name !== null) authors[a.platform] = a.display_name
  const cards: ClientCard[] = await Promise.all(model.cards.map(async (card) => ({
    card,
    mediaSrc: card.mediaId === null ? null : '/m/' + await signMediaToken(c.env.TOKEN_ENC_KEY, card.mediaId, now).catch(() => ''),
  })))
  const body = clientReviewScreen({
    token: c.req.param('token'), orgName: identity.name, initials: identity.initials, authors, cards, verdicts, zone: zone ?? null,
    clientZone: clientZoneOf(c.req.header('Cookie') ?? null),
    expiresAt: link.expiresAt, saved: c.req.query('saved') === '1',
  })
  const res = page((nonce) => shell(identity.name + ' — راجع منشوراتك', body, nonce, CLIENT_TZ_SCRIPT))
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
