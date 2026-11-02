/**
 * مسارات اللوحة — مصدرٌ يُضاف الآن (D-284): ملفٌّ يُرفع، أو رابطُ صفحة.
 *
 * كلاهما يمرّ بالخطوات نفسِها: **يُستلم ويُستخرج نصُّه** (`lib/sources/ingest.ts`)، **ثمّ يُحلَّل في الطلب نفسِه**
 * بـ `analyzeSource` بسقوفه وحرّاسه — فيعود جاهزًا للخطّة في لحظته، لا بعد مسحٍ في الفجر.
 *
 * والجوابُ وجهان: JSON لمعالج الخطّة (يرسم البطاقةَ ويحدّدها بلا تحميل)، وتحويلٌ برسالةٍ لمن لا سكربتَ عنده.
 * و`return` لا يقبل إلّا مسارين معروفين — لا عنوانًا يكتبه أحد.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { activeOrg } from '../../lib/tenancy'
import { analyzeSource, type AnalyzeOutcome } from '../../lib/analyze/job'
import { ingestFile, ingestLink, type IngestDeps, type IngestOutcome } from '../../lib/sources/ingest'
import { record } from '../../lib/audit'
import { guardPost, loginResponse, setFlash } from './shared'
import { loadSession } from '../../lib/session'

export const sources = new Hono<{ Bindings: Env }>()

/** حيث يعود من لا سكربتَ عنده — ولا غيرُهما. */
const RETURNS: Readonly<Record<string, string>> = {
  plan: '/panel/plan/new',
  library: '/panel/library#sources',
}

function ingestDeps(env: Env): IngestDeps {
  const accountId = (env.CF_AI_ACCOUNT_ID ?? '').trim()
  const token = (env.CF_BROWSER_TOKEN ?? '').trim()
  const toMarkdown = env.AI?.toMarkdown
  return {
    db: env.DB,
    media: env.MEDIA,
    // ‏`toMarkdown` يُنادى على الرابط نفسِه — منزوعًا منه يفقد `this`
    toMarkdown: toMarkdown === undefined ? undefined : (doc) => toMarkdown.call(env.AI, doc),
    browser: accountId === '' || token === '' ? null : { accountId, token },
  }
}

/** ما يقوله التحليلُ بعد الاستلام، بجملةٍ واحدة. */
function analysisNote(out: AnalyzeOutcome): { ready: boolean; note: string } {
  switch (out.kind) {
    case 'analyzed': return { ready: true, note: 'حُلِّل وصار جاهزًا للخطّة.' }
    case 'already': return { ready: true, note: 'محلَّلٌ من قبل — جاهز.' }
    case 'blocked': return { ready: false, note: 'حُفظ ولم يُحلَّل: ' + out.reason }
    case 'skipped': return { ready: false, note: 'حُفظ ولم يُحلَّل: ' + out.reason }
    default: return { ready: false, note: 'حُفظ وتعذّر تحليلُه: ' + out.reason + ' — أعد المحاولة من المكتبة.' }
  }
}

async function finish(
  c: { env: Env; req: { raw: Request; header(name: string): string | undefined } },
  action: string,
  form: FormData,
  outcome: IngestOutcome,
): Promise<Response> {
  const wantsJson = (c.req.header('Accept') ?? '').includes('application/json')
  if (outcome.kind === 'rejected') {
    await record(c.env.DB, { actor: 'panel', action, target: null, detail: ('rejected: ' + outcome.reason).slice(0, 200) }, c.req.raw)
    if (wantsJson) return Response.json({ ok: false, reason: outcome.reason }, { status: 422 })
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: outcome.reason })
    return new Response(null, { status: 303, headers: { Location: RETURNS[String(form.get('return') ?? '')] ?? RETURNS['library']! } })
  }
  const analyzed = await analyzeSource(
    {
      db: c.env.DB,
      media: c.env.MEDIA,
      serviceAccountJson: c.env.GOOGLE_SA_JSON,
      anthropicKey: c.env.ANTHROPIC_API_KEY,
      encKey: c.env.TOKEN_ENC_KEY,
      geminiKey: c.env.GEMINI_API_KEY,
    },
    outcome.id,
  )
  const { ready, note } = analysisNote(analyzed)
  await record(c.env.DB, { actor: 'panel', action, target: outcome.id, detail: outcome.kind + ' · ' + analyzed.kind }, c.req.raw)
  const said = outcome.kind === 'exists' ? 'موجودٌ في مصادرك من قبل' : outcome.kind === 'updated' ? 'حُدّث نصُّه' : 'أُضيف إلى مصادرك'
  if (wantsJson) {
    return Response.json({ ok: true, id: outcome.id, name: outcome.name, state: outcome.kind, ready, note: said + ' — ' + note })
  }
  await setFlash(c.env, c.req.raw, { kind: ready ? 'ok' : 'warn', text: '«' + outcome.name + '» ' + said + ' — ' + note })
  const to = RETURNS[String(form.get('return') ?? '')] ?? RETURNS['library']!
  return new Response(null, { status: 303, headers: { Location: to.includes('#') ? to : to + '?picked=' + encodeURIComponent(outcome.id) } })
}

sources.post('/panel/sources/upload', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const file = gate.form.get('file')
  const outcome: IngestOutcome = file instanceof File && file.size > 0
    ? await ingestFile(ingestDeps(c.env), activeOrg(gate.session.record), {
      name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()),
    })
    : { kind: 'rejected', reason: 'لم يصل ملفّ — اختر ملفًّا ثمّ ارفعه.' }
  return finish(c, 'source.upload', gate.form, outcome)
})

sources.post('/panel/sources/link', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const outcome = await ingestLink(ingestDeps(c.env), activeOrg(gate.session.record), String(gate.form.get('url') ?? ''))
  return finish(c, 'source.link', gate.form, outcome)
})

/**
 * **الأصلُ المرفوع يُنزَّل** (D-284): «يبقى ضمن ملفّاتك» وعدٌ لا يُوفى إن لم يُستعَد الملفُّ كما رُفع.
 * والصفُّ يُقرأ بمنظّمة الجلسة، فمعرّفٌ من منظّمةٍ أخرى ٤٠٤ كمعرّفٍ لا وجودَ له.
 */
sources.get('/panel/sources/:id/file', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const row = await c.env.DB
    .prepare("SELECT name, mime, file_key FROM sources WHERE id = ? AND org_id = ? AND kind = 'upload'")
    .bind(c.req.param('id'), activeOrg(session.record))
    .first<{ name: string; mime: string; file_key: string | null }>()
  const object = row === null || row.file_key === null ? null : await c.env.MEDIA.get(row.file_key)
  if (row === null || object === null) return c.text('غير موجود', 404)
  return new Response(object.body as unknown as BodyInit, {
    headers: {
      'Content-Type': row.mime,
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(row.name),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
