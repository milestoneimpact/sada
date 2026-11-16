/**
 * مساراتُ «حزمة المحتوى» (D-366): الشاشةُ ونماذجُها خلف الجلسة، والويب هوك العامّ من GitHub.
 *
 * الويب هوك يتحقّق من التوقيع على الجسم الخامّ قبل أيّ قراءة، ثمّ يضع رسالةً في الطابور ويردّ 202 فورًا — والمزامنةُ في الطابور.
 * **والعنوانُ من `PUBLIC_BASE_URL` لا من ثابت**: الإنتاجُ وstaging لا يختلطان.
 */
import { Hono } from 'hono'
import type { Env } from '../../env'
import { activeOrg } from '../../lib/tenancy'
import { loadSession } from '../../lib/session'
import { record } from '../../lib/audit'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { injectCsrf, soloPage } from '../ui/shell'
import { packageScreen, type PackageScreen } from '../ui/packageView'
import {
  checkSource, judgeHook, readPackageMedia, readSource, removeSource, rotateHookSecret, saveSource, syncPackage, tokenFor, tokenReadyFor, hookTooLarge, firstDelivery, MAX_HOOK_BYTES,
} from '../../lib/package/sync'
import { guardPost, loginResponse, page, setFlash, takeFlash } from './shared'
import { lastAppliedSnapshot, listRevisions, missingCopy, readRevision, revisePackage, revisionDiff } from '../../lib/package/revision'
import { counted, NOUNS } from '../../lib/format'
import { decideChange, readChanges } from '../../lib/package/apply'
import { changesScreen } from '../ui/packageChangesView'
import { toCsv } from '../../lib/package/plan'

export const pkg = new Hono<{ Bindings: Env }>()

/** «قُرئت الدفعة abc1234: 3 تغييرات، وينتظر قرارك تحديثان.» — والانتظارُ يُذكر إن وُجد وحده. */
export function syncedSay(commit: string, changes: number, awaiting: number): string {
  const head = 'قُرئت الدفعة ' + commit.slice(0, 7) + ': ' + (changes === 0 ? 'لا تغيير' : counted(changes, NOUNS.change))
  return head + (awaiting === 0 ? '، ولا شيء ينتظرك.' : '، وينتظر قرارك ' + counted(awaiting, NOUNS.update) + '.')
}

/** نتيجةُ القرار — وما طواه تحديثٌ أحدث يُقال صراحةً. */
export function decidedSay(verdict: 'accept' | 'keep', done: number, superseded: number): string {
  const main = done === 0 ? '' : (verdict === 'accept' ? 'اعتُمد ' + counted(done, NOUNS.update) : 'بقي القديم في ' + counted(done, NOUNS.update, 'gen')) + '.'
  const late = superseded === 0 ? '' : (main === '' ? '' : ' ') + 'لم يُعتمد ' + counted(superseded, NOUNS.update) + ': دفعةٌ أحدث غيّرت المنشورَ نفسَه بعده، فبقي الأحدث.'
  return main + late === '' ? 'لا شيء ينتظر قرارك هنا.' : main + late
}

/** رسالةُ الطابور للمزامنة — من الويب هوك والفحص الساعيّ والاستكمال. */
export interface PackageSyncMessage {
  readonly packageSync: { readonly sourceId: string; readonly after?: string; readonly force?: boolean }
}

function render(env: Env, csrf: string, m: PackageScreen): Response {
  return page((nonce) => soloPage('صدى — حزمة المحتوى', { href: '/panel/library', label: 'المكتبة', at: '/panel/package' },
    injectCsrf(packageScreen(m), csrf), nonce, '', buildCommands({ onPanel: false }), soloNav('library')))
}

pkg.get('/panel/package', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const [source, media, flash, revisions, snap] = await Promise.all([readSource(c.env.DB, org), readPackageMedia(c.env.DB, org), takeFlash(c.env, c.req.raw),
    listRevisions(c.env.DB, org, 10), lastAppliedSnapshot(c.env.DB, org).catch(() => null)])
  // ‏الناقصُ ما لا نصَّ له **ولا مسوّدةَ كُتبت له** — فلا يُعرض الزرُّ نفسُه بعد الكتابة
  const missing = await missingCopy(c.env.DB, org, snap)
  return render(c.env, session.record.csrf, {
    source, media, revisions, missing: missing.map((e) => e.item + ' · ' + e.platform), tokenReady: tokenReadyFor(org, source, c.env.GITHUB_CONTENT_TOKEN),
    flash: flash === null ? null : { tone: flash.kind, text: flash.text },
  })
})

pkg.post('/panel/package', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const act = String(gate.form.get('do') ?? '')
  const back = (): Response => c.redirect('/panel/package', 303)
  if (act === 'connect') {
    const fields = Object.fromEntries(['owner', 'repo', 'branch', 'root'].map((k) => [k, String(gate.form.get(k) ?? '')]))
    const checked = checkSource(fields)
    if (!checked.ok) {
      await setFlash(c.env, c.req.raw, { kind: 'bad', text: checked.reason })
      return back()
    }
    await saveSource(c.env.DB, org, checked.value)
    await record(c.env.DB, { actor: 'panel', action: 'package.connect', target: checked.value.owner + '/' + checked.value.repo + '@' + checked.value.branch }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'رُبط المستودع. اضغط «زامن الآن».' })
    return back()
  }
  const source = await readSource(c.env.DB, org)
  if (source === null) return back()
  if (act === 'disconnect') {
    await removeSource(c.env.DB, org)
    await record(c.env.DB, { actor: 'panel', action: 'package.disconnect', target: source.repo }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'فُصل المستودع. الوسائطُ المنقولة باقية في المكتبة.' })
    return back()
  }
  if (act === 'hook') {
    // ‏السرُّ في هذه الصفحة وحدها: لا تحويلَ ولا رسالةَ مؤقّتة تحمله، ولا سجلّ
    const secret = await rotateHookSecret(c.env.DB, c.env.TOKEN_ENC_KEY, org, source.id)
    await record(c.env.DB, { actor: 'panel', action: 'package.hook', target: source.id }, c.req.raw)
    const base = c.env.PUBLIC_BASE_URL.replace(/\/+$/, '')
    return render(c.env, gate.session.record.csrf, {
      source: { ...source, hasHook: true }, media: await readPackageMedia(c.env.DB, org), tokenReady: tokenReadyFor(org, source, c.env.GITHUB_CONTENT_TOKEN), revisions: [], missing: [],
      hook: { url: base + '/hooks/github/' + source.id, secret },
    })
  }
  if (act === 'settings') {
    const pick = (k: string, d: 'dark' | 'light'): 'dark' | 'light' => { const v = String(gate.form.get(k) ?? d); return v === 'light' ? 'light' : v === 'dark' ? 'dark' : d }
    await c.env.DB.prepare('UPDATE package_sources SET x_variant = ?, linkedin_variant = ? WHERE id = ? AND org_id = ?')
      .bind(pick('x_variant', 'dark'), pick('linkedin_variant', 'light'), source.id, org).run()
    await record(c.env.DB, { actor: 'panel', action: 'package.settings', target: source.id }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'حُفظ اللون. يُطبَّق على الدفعة التالية.' })
    return back()
  }
  if (act === 'write') {
    // ‏ما لا نصَّ جاهزًا له وحده يُعرض في «هذا ما فهمته»، والكتابةُ المدفوعة بضغطة المالك هناك وعددُها على الزرّ
    const snap = await lastAppliedSnapshot(c.env.DB, org)
    const missing = await missingCopy(c.env.DB, org, snap)
    if (missing.length === 0) {
      await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'كلُّ منشورٍ في الحزمة له نصٌّ جاهز.' })
      return back()
    }
    const csv = toCsv([['التاريخ', 'الوقت', 'المنصة', 'النص', 'رقم المادة', 'الملف', 'الشكل'],
      ...missing.map((e) => [e.date, e.time, e.platform === 'x' ? 'X' : e.platform === 'linkedin' ? 'LinkedIn' : e.platform, e.idea, e.item, '', e.format])])
    const rules = (snap as { rules?: unknown } | null)?.rules ?? null
    const key = crypto.randomUUID()
    await c.env.KV.put('plan-preview:' + key, JSON.stringify({ org, csv, filled: {}, via: 'حزمة المحتوى', widened: false, cost: 0, imageStyle: null, rules }), { expirationTtl: 3600 })
    return c.redirect('/panel/plan/import/preview?k=' + key, 303)
  }
  if (act === 'sync') {
    const token = await tokenFor(source, c.env.TOKEN_ENC_KEY, c.env.GITHUB_CONTENT_TOKEN)
    if (token === null) {
      await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'ينقص رمز القراءة — خطواتُه في «ما عليك».' })
      return back()
    }
    const out = await syncPackage({ db: c.env.DB, bucket: c.env.MEDIA, token }, source, { force: true })
    if (out.kind === 'synced' && out.deferred > 0) {
      await c.env.GENERATE_QUEUE.send({ packageSync: { sourceId: source.id, force: true } } satisfies PackageSyncMessage).catch(() => undefined)
    }
    // ‏اكتمل النقل: الدفعةُ مراجعةٌ برقمها، والمراجعةُ نفسُها لا تُعاد
    const commit = out.kind === 'synced' ? out.commit : source.lastCommit
    if (commit !== null && (out.kind === 'unchanged' || (out.kind === 'synced' && out.deferred === 0))) {
      const fresh = (await readSource(c.env.DB, org)) ?? source
      const rev = await revisePackage({ db: c.env.DB, token }, fresh, commit)
      if (rev.kind === 'applied') {
        await setFlash(c.env, c.req.raw, { kind: rev.awaiting > 0 ? 'warn' : 'ok', text: syncedSay(commit, rev.changes, rev.awaiting) })
        return c.redirect('/panel/package/changes/' + rev.id, 303)
      }
      if (rev.kind === 'failed') {
        await setFlash(c.env, c.req.raw, { kind: 'bad', text: rev.reason })
        return back()
      }
    }
    await record(c.env.DB, { actor: 'panel', action: 'package.sync', target: source.id, detail: out.kind }, c.req.raw)
    await setFlash(c.env, c.req.raw, out.kind === 'failed' ? { kind: 'bad', text: out.reason }
      : out.kind === 'unchanged' ? { kind: 'ok', text: 'لا جديد في الفرع.' }
        : { kind: out.problems > 0 ? 'warn' : 'ok', text: 'زُومنت الدفعة ' + out.commit.slice(0, 7) + ': نُقل ' + String(out.stored) + '، وبقي ' + String(out.deferred) + ' للدفعة التالية.' })
    return back()
  }
  return back()
})

/** ويب هوك GitHub — عامّ، والتوقيعُ هو الإذن. لا يُقرأ الحِمل في سجلّ. */
pkg.post('/hooks/github/:sourceId', async (c) => {
  if (hookTooLarge(c.req.header('Content-Length') ?? null)) return c.body(null, 413)
  const raw = await c.req.raw.arrayBuffer()
  if (raw.byteLength > MAX_HOOK_BYTES) return c.body(null, 413)
  const verdict = await judgeHook(c.env.DB, c.env.TOKEN_ENC_KEY, c.req.param('sourceId'), c.req.header('X-GitHub-Event') ?? null,
    c.req.header('X-Hub-Signature-256') ?? null, raw)
  if (verdict.status === 202) {
    // ‏بعد التوقيع: تسليمٌ رأيناه لا يُطلق رسالةً ثانية
    if (!(await firstDelivery(c.env.KV, verdict.source.id, c.req.header('X-GitHub-Delivery') ?? null))) return c.body(null, 202)
    // ‏والإرسالُ إن تعثّر يُمحى أثرُ التسليم، فإعادةُ GitHub بالمعرّف نفسِه تصل ولا تُعدّ مكرّرة
    try {
      await c.env.GENERATE_QUEUE.send({ packageSync: { sourceId: verdict.source.id, after: verdict.after } } satisfies PackageSyncMessage)
    } catch (error) {
      const delivery = c.req.header('X-GitHub-Delivery') ?? ''
      if (/^[A-Za-z0-9-]{1,100}$/.test(delivery)) await c.env.KV.delete('hook:' + verdict.source.id + ':' + delivery).catch(() => undefined)
      throw error
    }
    return c.body(null, 202)
  }
  if (verdict.status === 200) return c.json({ ok: true })
  return c.body(null, verdict.status)
})

pkg.get('/panel/package/changes/:rev', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  // ‏المراجعةُ بمعرّفها، أيًّا كان عمرُها — والسجلُّ للقائمة وحدها
  const [revision, history] = await Promise.all([readRevision(c.env.DB, org, c.req.param('rev')), listRevisions(c.env.DB, org, 20)])
  if (revision === null) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'لم نجد هذه الدفعة في حزمتك. هذه آخرُ دفعاتها.' })
    return c.redirect('/panel/package', 303)
  }
  const [stored, flash] = await Promise.all([readChanges(c.env.DB, org, revision.id), takeFlash(c.env, c.req.raw)])
  // ‏مراجعةٌ حُسبت ولم تُطبَّق: فرقُها يُعرض كما هو، بلا أزرار
  const changes = stored.length > 0 || revision.status === 'applied' ? stored
    : (await revisionDiff(c.env.DB, org, revision.id)).map((x, i) => ({ ...x, id: 'diff:' + String(i), revisionId: revision.id, postId: null, disposition: 'frozen_published' as const, postStatus: null }))
  return page((nonce) => soloPage('صدى — ما تغيّر في حزمتك', { href: '/panel/package', label: 'حزمة المحتوى', at: '/panel/package' },
    injectCsrf(changesScreen({ revision, changes, history, flash: flash === null ? null : { tone: flash.kind, text: flash.text } }), session.record.csrf),
    nonce, '', buildCommands({ onPanel: false }), soloNav('library')))
})

pkg.post('/panel/package/changes/:rev/decide', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const rev = c.req.param('rev')
  const verdict = gate.form.get('verdict') === 'accept' ? 'accept' : 'keep'
  const kind = String(gate.form.get('kind') ?? '')
  let ids = gate.form.getAll('id').map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x))
  if (kind !== '') ids = (await readChanges(c.env.DB, org, rev)).filter((x) => x.kind === kind && x.disposition === 'awaiting_owner').map((x) => x.id)
  const out = await decideChange(c.env.DB, org, ids, verdict)
  await record(c.env.DB, { actor: 'panel', action: 'package.decide', target: rev, detail: verdict + ' · ' + String(out.done) + ' · ' + String(out.superseded) }, c.req.raw)
  await setFlash(c.env, c.req.raw, { kind: out.superseded > 0 ? 'warn' : 'ok', text: decidedSay(verdict, out.done, out.superseded) })
  return c.redirect('/panel/package/changes/' + rev, 303)
})
