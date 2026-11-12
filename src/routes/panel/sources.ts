/**
 * مسارات اللوحة — مصدرٌ يُضاف الآن (D-284 · D-327): ملفٌّ يُرفع، أو رابطُ موقعٍ أو مقالٍ أو مقطع — واحدًا أو مجموعة.
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

/** كم مصدرًا يُضاف في طلبٍ واحد (D-327) — كلٌّ يُقرأ ويُحلَّل في الطلب نفسِه، وما فوق الستّة يتجاوز مهلتَه. */
export const MAX_BATCH = 6

type Ctx = { env: Env; req: { raw: Request; header(name: string): string | undefined } }

interface Added {
  readonly ok: boolean
  readonly id?: string
  readonly name?: string
  readonly state?: string
  readonly ready: boolean
  readonly note: string
}

/** مصدرٌ واحد: يُسجَّل، ويُحلَّل إن قُبل، ويعود بما يُقال عنه. */
async function settle(c: Ctx, action: string, outcome: IngestOutcome): Promise<Added> {
  if (outcome.kind === 'rejected') {
    await record(c.env.DB, { actor: 'panel', action, target: null, detail: ('rejected: ' + outcome.reason).slice(0, 200) }, c.req.raw)
    return { ok: false, ready: false, note: outcome.reason }
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
  return { ok: true, id: outcome.id, name: outcome.name, state: outcome.kind, ready, note: said + ' — ' + note }
}

const returnTo = (form: FormData): string => RETURNS[String(form.get('return') ?? '')] ?? RETURNS['library']!

async function finish(c: Ctx, action: string, form: FormData, outcome: IngestOutcome): Promise<Response> {
  const wantsJson = (c.req.header('Accept') ?? '').includes('application/json')
  const done = await settle(c, action, outcome)
  if (!done.ok) {
    if (wantsJson) return Response.json({ ok: false, reason: done.note }, { status: 422 })
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: done.note })
    return new Response(null, { status: 303, headers: { Location: returnTo(form) } })
  }
  if (wantsJson) return Response.json({ ok: true, id: done.id, name: done.name, state: done.state, ready: done.ready, note: done.note })
  await setFlash(c.env, c.req.raw, { kind: done.ready ? 'ok' : 'warn', text: '«' + (done.name ?? '') + '» ' + done.note })
  const to = returnTo(form)
  return new Response(null, { status: 303, headers: { Location: to.includes('#') ? to : to + '?picked=' + encodeURIComponent(done.id ?? '') } })
}

/**
 * **مجموعةُ مصادرَ في طلبٍ واحد** (D-327): روابطُ وملفّاتٌ معًا، كلٌّ يُقرأ ويُحلَّل بطريقه كما لو أُرسل وحدَه — فالمرفوضُ
 * يُسمّى بسببه ولا يُسقط غيرَه. بلا سكربت؛ والمعالجُ بسكربته يرسلها واحدًا واحدًا فيرى المالكُ كلًّا في لحظته.
 */
async function finishMany(c: Ctx, form: FormData, jobs: readonly { readonly action: string; readonly label: string; readonly run: () => Promise<IngestOutcome> }[], dropped: number): Promise<Response> {
  let ready = 0
  const failed: string[] = []
  for (const job of jobs) {
    const done = await settle(c, job.action, await job.run())
    if (done.ok && done.ready) ready += 1
    else failed.push('«' + (done.name ?? job.label) + '»: ' + done.note)
  }
  const text = 'أُضيف ' + String(ready) + ' من ' + String(jobs.length) + ' وصار جاهزًا للخطّة' +
    (failed.length === 0 ? '.' : '. وتعذّر ' + String(failed.length) + ' — ' + failed.slice(0, 2).join(' · ')) +
    (dropped > 0 ? ' وتُرك ' + String(dropped) + ' فوق الستّة — أضفها في دفعةٍ ثانية.' : '')
  await setFlash(c.env, c.req.raw, { kind: failed.length === 0 && dropped === 0 ? 'ok' : ready === 0 ? 'bad' : 'warn', text })
  return new Response(null, { status: 303, headers: { Location: returnTo(form) } })
}

sources.post('/panel/sources/upload', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const files = gate.form.getAll('file').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > 1) {
    return finishMany(c, gate.form, files.slice(0, MAX_BATCH).map((file) => ({
      action: 'source.upload', label: file.name,
      run: async () => ingestFile(ingestDeps(c.env), org, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }),
    })), Math.max(0, files.length - MAX_BATCH))
  }
  const file = files[0]
  const outcome: IngestOutcome = file !== undefined
    ? await ingestFile(ingestDeps(c.env), org, {
      name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()),
    })
    : { kind: 'rejected', reason: 'لم يصل ملفّ — اختر ملفًّا ثمّ ارفعه.' }
  return finish(c, 'source.upload', gate.form, outcome)
})

sources.post('/panel/sources/link', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  // ‏سطرٌ لكلّ رابط (D-327): موقعٌ ومقالٌ ومقطعٌ معًا — والواحدُ كما كان
  const urls = [...new Set(String(gate.form.get('url') ?? '').split(/\s+/).filter((u) => u !== ''))]
  if (urls.length > 1) {
    return finishMany(c, gate.form, urls.slice(0, MAX_BATCH).map((url) => ({
      action: 'source.link', label: url.slice(0, 60), run: () => ingestLink(ingestDeps(c.env), org, url),
    })), Math.max(0, urls.length - MAX_BATCH))
  }
  const outcome = await ingestLink(ingestDeps(c.env), org, urls[0] ?? '')
  return finish(c, 'source.link', gate.form, outcome)
})

/**
 * **الأصلُ المرفوع يُنزَّل** (D-284): «يبقى ضمن ملفّاتك» وعدٌ لا يُوفى إن لم يُستعَد الملفُّ كما رُفع.
 * والصفُّ يُقرأ بمنظّمة الجلسة، فمعرّفٌ من منظّمةٍ أخرى ٤٠٤ كمعرّفٍ لا وجودَ له.
 */
sources.get('/panel/sources/:id/file', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
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
