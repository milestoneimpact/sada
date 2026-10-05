/**
 * ردّا الخطأ — **صفحةٌ لمن يقرأ، وJSON لمن يبرمج** (خطّة التصميم 7.11 · D-189).
 *
 * والحكمُ بترويسة `Accept` لا بالمسار: المتصفّحُ يطلب `text/html` في كلّ تنقّل، و`fetch` من
 * سكربتٍ أو أداةٍ لا تطلبه — فالمسارُ نفسُه (`/panel/…` قديمٌ في علامة) يُعطي المالكَ صفحةً
 * ويُعطي السكربتَ JSON يقرؤه. و`/api/` JSON دائمًا ولو طلب HTML: عقدٌ مع مبرمجٍ لا مع عين.
 *
 * **ولا يُكتب سببُ العطل في الوجه**: رسالةُ الاستثناء قد تحمل مسارًا أو استعلامًا أو اسمَ
 * جدول. تُكتب في سجلّ Worker برقم الطلب، والرقمُ وحدَه في الصفحة تحت «للمطوّر».
 */
import { HTTPException } from 'hono/http-exception'
import { htmlHeaders, makeNonce } from '../lib/security/headers'
import { notFoundPage, serverErrorPage } from './ui/errorView'

/** أيريد هذا الطلبُ صفحةً؟ — `Accept` فيه `text/html`، ولا يقع تحت `/api/`. */
export function wantsHtml(request: Request): boolean {
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('text/html') && !new URL(request.url).pathname.startsWith('/api/')
}

/** ‏٤٠٤ — صفحةٌ أو `{"error":"not_found"}`. و`detail` جملةُ المسار الذي عرف ما لم يجده. */
export function notFoundResponse(request: Request, detail?: string): Response {
  if (!wantsHtml(request)) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
  const nonce = makeNonce()
  const path = new URL(request.url).pathname
  return new Response(notFoundPage(nonce, path, detail), { status: 404, headers: htmlHeaders(nonce) })
}

/** رقمُ الطلب — رقمُ Cloudflare إن وُجد (يُبحَث به في سجلّها)، وإلّا رقمٌ يُولَّد هنا. */
function requestIdOf(request: Request): string {
  return request.headers.get('cf-ray') ?? crypto.randomUUID().slice(0, 8)
}

/**
 * ‏٥٠٠ — يُسجَّل العطلُ برقمه، ثمّ صفحةٌ هادئة أو `{"error":"internal_error","id":…}`.
 * و«أعد المحاولة» للقراءة وحدها: إعادةُ نموذجٍ بضغطةٍ قد ترسله مرّتين.
 */
export function serverErrorResponse(request: Request, error: unknown): Response {
  // ‏وما رُمي بحاله عمدًا (`HTTPException` بـ‏401 أو ‏413) ردُّه ردُّه — ليس عطلًا يُسجَّل ولا ‏٥٠٠
  if (error instanceof HTTPException) return error.getResponse()
  const id = requestIdOf(request)
  const name = error instanceof Error ? error.name : 'unknown'
  const message = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({ event: 'unhandled_error', id, method: request.method, path: new URL(request.url).pathname, name, message }))
  if (!wantsHtml(request)) {
    return Response.json({ error: 'internal_error', id }, { status: 500 })
  }
  const nonce = makeNonce()
  const url = new URL(request.url)
  const retry = request.method === 'GET' ? `${url.pathname}${url.search}` : null
  return new Response(serverErrorPage(nonce, id, retry), { status: 500, headers: htmlHeaders(nonce) })
}
