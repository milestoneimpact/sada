/**
 * مسارات اللوحة — **الحذفُ والتراجعُ والتصدير** (D-322).
 *
 * - أربعةُ حذفٍ بالتراجع (`lib/privacy/trash.ts`): المسوّدةُ، والمصدرُ، والمقطعُ، وصورةُ الأصول. **ولا «أتمضي؟» قبلها**:
 *   الإشعارُ يحمل «تراجَع» برمزٍ واحد (D-303)، والصفوفُ لا تُكتب من النموذج.
 * - **وحذفُ عميلٍ كلِّه بعد تصديره** (`lib/privacy/orgData.ts`): المالكُ وحدَه، وبتحقّقٍ للتوّ (D-317) يطلبه الحارسُ
 *   (`needsStepUp`)، **ويُسأل هنا ثانيةً**: طبقتان لا واحدة (توصيةُ D-315). وهو الفعلُ الوحيدُ هنا الذي لا يُردّ، فيُسأل عنه
 *   بكتابة الاسم لا بضغطة.
 *
 * وكلُّ فعلٍ سطرٌ في سجلّ النشاط بمعرّفه — ولا نصَّ محذوفٍ فيه.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { activeOrg, OWNER_ORG } from '../../lib/tenancy'
import { isFresh } from '../../lib/session'
import { OWNER_EMAIL } from '../../lib/ownerEmail'
import { allows, whoNow } from '../../lib/access'
import { record } from '../../lib/audit'
import {
  restoreTrash, trashKindOf, trashLibraryFile, trashPost, trashSource, trashUpload, type TrashKind, type TrashResult,
} from '../../lib/privacy/trash'
import { deleteOrg, exportOrg } from '../../lib/privacy/orgData'
import type { Role } from '../../lib/ownerEmail'
import { back, guardPost, loginResponse, page, setFlash, toCard } from './shared'
import { exportPage } from '../authView'
import { loadSession } from '../../lib/session'
import { counted, NOUNS } from '../../lib/format'

export const privacy = new Hono<{ Bindings: Env }>()

/** ما يُقال عن كلّ نوعٍ، وأين يعود، ومن يتراجع عنه — بدور من يحذفه (`access.ts`). */
const KIND: Readonly<Record<TrashKind, { readonly done: string; readonly action: string; readonly role: Role; readonly to: (ref: string) => Response }>> = {
  post: { done: 'حُذفت المسوّدة', action: 'post.delete', role: 'publisher', to: (ref) => toCard('d', ref) },
  source: { done: 'حُذف المصدر', action: 'source.delete', role: 'admin', to: () => back('sources') },
  upload: { done: 'حُذف المقطع', action: 'upload.delete', role: 'publisher', to: () => back('videos') },
  file: { done: 'حُذفت الصورة', action: 'library.delete', role: 'publisher', to: () => new Response(null, { status: 303, headers: { Location: '/panel/assets' } }) },
}

/** ما يحتاجه الحذفُ من السياق — كما يأخذه `guardPost`. */
type Ctx = Parameters<typeof guardPost>[0] & { readonly env: Env }

async function trashed(
  c: Ctx,
  kind: TrashKind,
  idOf: (form: FormData) => string,
  run: (deps: { db: Env['DB']; kv: Env['KV'] }, org: string, id: string) => Promise<TrashResult>,
): Promise<Response> {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const id = idOf(gate.form)
  const result = await run({ db: c.env.DB, kv: c.env.KV }, org, id)
  const spec = KIND[kind]
  await record(c.env.DB, {
    actor: 'panel', action: spec.action, target: id, org, detail: result.ok ? 'deleted' : 'refused: ' + result.reason,
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: spec.done + ': «' + result.label + '».', undo: { action: '/panel/trash/restore', id: result.token, label: 'تراجَع', swap: false } }
    : { kind: 'bad', text: 'لم يُحذف: ' + result.reason })
  // ‏والمحذوفةُ لا بطاقةَ لها تُنزَل إليها: إلى «المنشورات»، والمردودةُ إلى بطاقتها
  return kind === 'post' && result.ok ? back('posts') : spec.to(id)
}

const field = (name: string) => (form: FormData): string => String(form.get(name) ?? '')

privacy.post('/panel/drafts/delete', (c) => trashed(c, 'post', field('id'), (deps, org, id) => trashPost(deps, org, id)))

privacy.post('/panel/sources/delete', (c) => trashed(c, 'source', field('id'), (deps, org, id) => trashSource(deps, org, id)))

privacy.post('/panel/uploads/:id/delete', (c) =>
  trashed(c, 'upload', () => c.req.param('id'), (deps, org, id) => trashUpload(deps, org, id)))

// ‏المرجعُ كما في المكتبة (`f:<معرّف>`): صورُ الأصول وحدَها تُحذف من هنا، والمقاطعُ من «فيديوهاتك»
privacy.post('/panel/assets/delete', (c) => trashed(c, 'file', (form) => {
  const ref = String(form.get('ref') ?? '')
  return ref.startsWith('f:') ? ref.slice(2) : ''
}, (deps, org, id) => trashLibraryFile(deps, org, id)))

/**
 * «تراجَع» — **بدور من يحذف النوعَ نفسَه**: الحارسُ يفتح المسارَ للناشر، ومصدرٌ حذفه المديرُ لا يعيده ناشرٌ ضغط زرًّا في
 * تبويبٍ مفتوح. والصورةُ لعميل الجلسة وحدَه (`restoreTrash`).
 */
privacy.post('/panel/trash/restore', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const token = String(gate.form.get('id') ?? '')
  const kind = await trashKindOf(c.env.KV, token)
  const who = whoNow()
  if (kind !== null && who !== undefined && !allows(who.role, KIND[kind].role)) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'التراجعُ لمن يملك الحذفَ نفسَه.' })
    return KIND[kind].to('')
  }
  const result = await restoreTrash({ db: c.env.DB, kv: c.env.KV }, org, token)
  await record(c.env.DB, {
    actor: 'panel', action: 'trash.restore', org,
    target: result.ok ? result.ref : null, detail: result.ok ? result.kind : 'refused: ' + result.reason,
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: 'عاد «' + result.label + '» كما كان.' }
    : { kind: 'bad', text: result.reason })
  if (result.ok) return KIND[result.kind].to(result.ref)
  return result.kind === undefined ? back('posts') : KIND[result.kind].to('')
})

/** المالكُ هو المشغّل نفسُه — الدورُ والبريدُ معًا، لا الدورُ وحدَه. */
function isOwner(record: { readonly role?: Role; readonly email?: string }): boolean {
  return (record.role ?? 'owner') === 'owner' && (record.email ?? OWNER_EMAIL) === OWNER_EMAIL
}

/**
 * ‏**صفحةُ «صدّر»** (مراجعة D-322) — ما في الملفّ، و«نزّل الملفّ»، ثمّ الخطوةُ التالية. للمالك وحدَه وبتحقّقٍ للتوّ (الحارس)، وإليها
 * ‏يعود «تحقّق للتوّ» بعد الملفّ (`stepUpReturn`). **ولا تكتب سطرَ تصدير**: السطرُ شرطُ الحذف، ويُكتب حين يُنزَّل الملفُّ لا حين يُرى.
 */
privacy.get('/panel/orgs/exported', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (!isOwner(session.record)) return c.text('للمالك وحده.', 403)
  const org = c.req.query('org') ?? activeOrg(session.record)
  const row = await c.env.DB.prepare('SELECT id, name FROM orgs WHERE id = ?').bind(org).first<{ id: string; name: string }>()
  if (row === null) return c.text('لا عميل بهذا المعرّف.', 404)
  return page((nonce) => exportPage({ org: row.id, name: row.name, deletable: row.id !== OWNER_ORG }, nonce))
})

/**
 * **تصديرُ عميل** (D-322) — ملفٌّ يُنزَّل، للمالك وحدَه وبتحقّقٍ للتوّ (الحارسُ يحوّل إليه ثمّ يعيد إلى صفحته). ويُكتب سطرُه في سجلّ
 * نشاط المالك (لا العميل): هو شرطُ حذفه بعد ذلك، ويبقى بعد أن يُحذف العميل.
 */
privacy.get('/panel/orgs/export', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (!isOwner(session.record) || !isFresh(session.record)) return c.text('للمالك وحده، بتحقّقٍ للتوّ.', 403)
  const org = c.req.query('org') ?? activeOrg(session.record)
  const data = await exportOrg(c.env.DB, org)
  if (data === null) return c.text('لا عميل بهذا المعرّف.', 404)
  const total = Object.values(data.tables).reduce((n, rows) => n + rows.length, 0)
  await record(c.env.DB, { actor: 'panel', action: 'org.export', target: org, detail: counted(total, NOUNS.row) + ' · ' + String(data.files.length) + ' ملفّ', org: OWNER_ORG }, c.req.raw)
  const day = data.exported_at.slice(0, 10)
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sada-' + org.replace(/[^A-Za-z0-9_-]/g, '') + '-' + day + '.json"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

/** **حذفُ عميلٍ كلِّه** — لا يُردّ. الشروطُ في `deleteBlocker`، والدورُ والتحقّقُ هنا ثانيةً بعد الحارس. */
privacy.post('/panel/orgs/delete', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = String(gate.form.get('org') ?? '')
  if (!isOwner(gate.session.record) || !isFresh(gate.session.record)) {
    await record(c.env.DB, { actor: 'panel', action: 'org.delete', target: org, detail: 'refused: owner_fresh', org: OWNER_ORG }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'حذفُ عميلٍ للمالك وحده، بتحقّقٍ للتوّ.' })
    return back('orgs')
  }
  const result = await deleteOrg({ db: c.env.DB, kv: c.env.KV }, org, String(gate.form.get('confirm') ?? ''))
  await record(c.env.DB, {
    actor: 'panel', action: 'org.delete', target: org, org: OWNER_ORG,
    detail: result.ok
      ? [result.name, counted(result.rows, NOUNS.row), 'أعضاء ' + String(result.members), 'جلسات ' + String(result.sessions)].join(' · ')
      : 'refused: ' + result.reason,
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: 'حُذف «' + result.name + '» وكلُّ بياناته (' + counted(result.rows, NOUNS.row) + '). وتُمحى ملفّاتُه من التخزين في الكنس الليليّ.' }
    : { kind: 'bad', text: 'لم يُحذف: ' + result.reason })
  return back('orgs')
})
