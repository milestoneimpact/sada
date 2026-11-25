/**
 * **«صحّح المنشور»** (D-391) — مساراتُ التصحيح، بلا سكربت:
 *
 * - `GET /panel/posts/:id/correct` صفحةُ التصحيح: LinkedIn نصٌّ يُعدَّل في مكانه، وX ردٌّ تصحيحيّ (الافتراضيّ) أو «احذف وأعد النشر».
 * - `POST /panel/posts/:id/correct/review` الخطوةُ الثانية لـ«احذف وأعد النشر»: صفحةُ تأكيدٍ بتحذيرٍ مكتوب (نمطُ D-382).
 * - `POST /panel/posts/:id/correct` الفعل. و«احذف وأعد النشر» يلزمه `confirm=yes` من صفحة التأكيد.
 * - `POST /panel/posts/:id/correct/retry` بعد حذفٍ نجح ونشرٍ فشل: البديلُ وحده، بلا حذفٍ ثانٍ.
 *
 * وكلُّ كتابةٍ تمرّ بـ`guardPost` (CSRF) ثمّ `mayDo('correct')` ثمّ حدِّ المعدّل، وتُكتب في سجلّ التدقيق بنتيجتها.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { loadSession } from '../../lib/session'
import { activeOrg } from '../../lib/tenancy'
import { record } from '../../lib/audit'
import { mayDo } from '../../lib/plan/rights'
import { correctable, correctionsOf, correctPost, CORRECT_PER_HOUR, readOriginal, retryReplacement, textMaxFor, type CorrectionKind } from '../../lib/publish/correct'
import { correctScreen, replaceConfirmScreen } from '../ui/correctView'
import { injectCsrf, soloPage } from '../ui/shell'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { notFoundResponse } from '../errors'
import { guardPost, loginResponse, page, POST_ID, setFlash, takeFlash, toFeed } from './shared'

export const correct = new Hono<{ Bindings: Env }>()

function screen(body: string, csrf: string): Response {
  return page((nonce) => soloPage('صدى — صحّح المنشور', { href: '/panel/feed', label: 'التيّار' }, injectCsrf(body, csrf), nonce,
    '', buildCommands({ onPanel: false }), soloNav('feed')))
}

/** حدُّ المعدّل لكلّ منظّمة في KV بنافذة ساعة — يُعدّ قبل أيّ نداء. */
async function overLimit(env: Env, org: string): Promise<boolean> {
  const key = 'correct-rate:' + org + ':' + new Date().toISOString().slice(0, 13)
  const n = Number((await env.KV.get(key)) ?? '0')
  if (n >= CORRECT_PER_HOUR) return true
  await env.KV.put(key, String(n + 1), { expirationTtl: 3700 })
  return false
}

correct.get('/panel/posts/:id/correct', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const id = c.req.param('id')
  const o = POST_ID.test(id) ? await readOriginal(c.env.DB, org, id) : null
  if (o === null) return notFoundResponse(c.req.raw, 'لا منشور بهذا المعرّف')
  const [history, flash] = await Promise.all([correctionsOf(c.env.DB, org, id), takeFlash(c.env, c.req.raw)])
  const right = mayDo(session.record.role ?? 'owner', 'correct', 'posted')
  const can = correctable(o)
  const body = correctScreen({
    id, platform: o.platform, text: o.text, history,
    blocked: !right.ok ? right.reason : !can.ok ? can.reason : null,
    key: crypto.randomUUID(), max: textMaxFor(o, o.platform === 'x' ? 'reply' : 'edit'), replaceMax: textMaxFor(o, 'replace'),
    ...(o.type === 'thread' ? { tweets: o.remote_ids.length } : {}),
    flash: flash === null ? null : { tone: flash.kind, text: flash.text },
  })
  return screen(body, session.record.csrf)
})

correct.post('/panel/posts/:id/correct/review', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = c.req.param('id')
  const o = POST_ID.test(id) ? await readOriginal(c.env.DB, org, id) : null
  if (o === null) return notFoundResponse(c.req.raw, 'لا منشور بهذا المعرّف')
  const right = mayDo(gate.session.record.role ?? 'owner', 'correct', 'posted')
  const can = correctable(o)
  if (!right.ok || !can.ok || o.platform !== 'x') {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: !right.ok ? right.reason : !can.ok ? can.reason : 'الحذفُ وإعادةُ النشر لـ X وحدها.' })
    return new Response(null, { status: 303, headers: { Location: '/panel/posts/' + id + '/correct' } })
  }
  const text = String(gate.form.get('text') ?? '').trim()
  const key = String(gate.form.get('key') ?? '')
  return screen(replaceConfirmScreen({ id, oldText: o.text, text, key, ...(o.type === 'thread' ? { tweets: o.remote_ids.length } : {}) }), gate.session.record.csrf)
})

correct.post('/panel/posts/:id/correct', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = c.req.param('id')
  if (!POST_ID.test(id)) return notFoundResponse(c.req.raw, 'لا منشور بهذا المعرّف')
  const back = new Response(null, { status: 303, headers: { Location: '/panel/posts/' + id + '/correct' } })
  const right = mayDo(gate.session.record.role ?? 'owner', 'correct', 'posted')
  const how = String(gate.form.get('how') ?? '')
  const kind: CorrectionKind | null = how === 'edit' || how === 'reply' || how === 'replace' ? how : null
  if (!right.ok || kind === null) {
    await record(c.env.DB, { actor: 'panel', action: 'post.correct', target: id, detail: 'refused:' + (right.ok ? 'kind' : 'role'), org }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: right.ok ? 'اختر طريقة التصحيح.' : right.reason })
    return back
  }
  if (await overLimit(c.env, org)) {
    await record(c.env.DB, { actor: 'panel', action: 'post.correct', target: id, detail: 'refused:rate', org }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'بلغت حدّ التصحيحات (' + String(CORRECT_PER_HOUR) + ' في الساعة) — أعد بعد قليل. لم يُرسَل شيء.' })
    return back
  }
  const result = await correctPost({ db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY }, org, {
    postId: id, kind, text: String(gate.form.get('text') ?? ''), key: String(gate.form.get('key') ?? ''),
    confirmed: gate.form.get('confirm') === 'yes', by: gate.session.record.email ?? null,
  })
  await record(c.env.DB, {
    actor: 'panel', action: 'post.correct_' + kind, target: id, org,
    detail: (result.ok ? 'ok' + (result.duplicate === true ? ':duplicate' : '') + ':' + result.correctionId : 'refused:' + result.reason).slice(0, 200),
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: kind === 'edit' ? 'عُدّل النصُّ على LinkedIn، وبقيت التفاعلات. النصُّ السابقُ محفوظ.' : kind === 'reply' ? 'نُشر الردُّ التصحيحيّ تحت المنشور على X.' : 'حُذف الأصلُ من X ونُشر البديل.' }
    : { kind: 'bad', text: result.reason + (result.retry === true ? ' اضغط «أعد المحاولة» على بطاقته في التيّار.' : '') })
  return result.ok || result.retry === true ? toFeed(id) : back
})

correct.post('/panel/posts/:id/correct/retry', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = c.req.param('id')
  if (!POST_ID.test(id)) return notFoundResponse(c.req.raw, 'لا منشور بهذا المعرّف')
  const right = mayDo(gate.session.record.role ?? 'owner', 'correct', 'posted')
  if (!right.ok) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: right.reason })
    return toFeed(id)
  }
  if (await overLimit(c.env, org)) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'بلغت حدّ التصحيحات (' + String(CORRECT_PER_HOUR) + ' في الساعة) — أعد بعد قليل.' })
    return toFeed(id)
  }
  const result = await retryReplacement({ db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY }, org, String(gate.form.get('correction') ?? ''))
  await record(c.env.DB, {
    actor: 'panel', action: 'post.correct_retry', target: id, org,
    detail: (result.ok ? 'ok:' + result.correctionId : 'refused:' + result.reason).slice(0, 200),
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok ? { kind: 'ok', text: 'نُشر البديل على X — بلا حذفٍ ثانٍ.' } : { kind: 'bad', text: result.reason })
  return toFeed(id)
})
