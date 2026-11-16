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
  checkSource, currentPicks, judgeHook, readPackageMedia, readSource, removeSource, rotateHookSecret, saveSource, syncPackage, tokenFor, tokenReadyFor, hookTooLarge, firstDelivery, MAX_HOOK_BYTES,
} from '../../lib/package/sync'
import { deciderOf, guardPost, loginResponse, page, setFlash, takeFlash } from './shared'
import { lastAppliedSnapshot, listRevisions, missingCopy, readRevision, revisePackage, revisionDiff } from '../../lib/package/revision'
import { counted, NOUNS } from '../../lib/format'
import { decideChange, readChanges } from '../../lib/package/apply'
import { changesScreen } from '../ui/packageChangesView'
import { toCsv } from '../../lib/package/plan'
import { probeAccess } from '../../lib/package/diagnose'
import { adoptRevision, previewRevision, setFollow } from '../../lib/package/adopt'
import { planPackageScreen } from '../ui/planPackageView'
import { allows } from '../../lib/access'
import { panelHref } from '../../lib/nav/panes'
import { ownerZone } from '../../lib/time/ownerZone'
import { planPackageSchedule, schedulePackage, SKIP_SAY, type PackageSchedulePlan, type PackageSlot, type SkipReason } from '../../lib/package/schedule'
import { dayLabel, clock } from '../../lib/time/zone'
import { scheduleConfirmScreen } from '../ui/planPackageView'

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

/** «الأحد 26 نوفمبر 9:00 ص» — موعدُ منشورٍ بساعة المالك. */
export function slotWhen(at: string, zone: string | null): string {
  const d = new Date(at + ':00Z')
  return dayLabel(d, zone, false) + ' ' + clock(d, zone)
}

/** ما تُخطّي ولماذا: «وتُخطّي 4: بلا نصّ 2، موعدُه مضى 2.» */
export function skippedSay(skipped: Readonly<Record<SkipReason, number>>, failed = 0): string {
  const parts = (Object.keys(skipped) as SkipReason[]).filter((k) => skipped[k] > 0).map((k) => SKIP_SAY[k] + ' ' + String(skipped[k]))
  if (failed > 0) parts.push('ردّه الحارس ' + String(failed))
  const total = Object.values(skipped).reduce((a, b) => a + b, 0) + failed
  return total === 0 ? '' : ' وتُخطّي ' + String(total) + ': ' + parts.join('، ') + '.'
}

/** إشعارُ ما بعد الضغطة: «جُدول 26 منشورًا من … إلى …» وأسبابُ ما تُخطّي. */
export function scheduledSay(scheduled: readonly PackageSlot[], skipped: Readonly<Record<SkipReason, number>>, failed: number, zone: string | null): string {
  const tail = skippedSay(skipped, failed)
  if (scheduled.length === 0) return 'لم يُجدوَل شيء: لا مسوّدة من الحزمة جاهزةٌ بلا موعد.' + tail
  const sorted = [...scheduled].sort((a, b) => a.at.localeCompare(b.at))
  return 'جُدول ' + counted(sorted.length, NOUNS.post) + ' من ' + slotWhen(sorted[0]!.at, zone) + ' إلى ' + slotWhen(sorted[sorted.length - 1]!.at, zone) + '.' + tail
}

export type { PackageSchedulePlan }

/** رسالةُ الطابور للمزامنة — من الويب هوك والفحص الساعيّ والاستكمال. */
export interface PackageSyncMessage {
  readonly packageSync: { readonly sourceId: string; readonly after?: string; readonly force?: boolean }
}

async function render(env: Env, csrf: string, m: PackageScreen, req: Request): Promise<Response> {
  // ‏وقتُ الفحص بمنطقة المتصفّح (D-378)
  const zone = await ownerZone(env.DB, req.headers.get('Cookie'))
  m = { ...m, zone }
  return page((nonce) => soloPage('صدى — حزمة المحتوى', { href: '/panel/library', label: 'المكتبة', at: '/panel/package' },
    injectCsrf(packageScreen(m), csrf), nonce, '', buildCommands({ onPanel: false }), soloNav('package', undefined, { shown: ['package'] })))
}

pkg.get('/panel/package', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const [source, media, flash, revisions, snap, moved] = await Promise.all([readSource(c.env.DB, org), readPackageMedia(c.env.DB, org), takeFlash(c.env, c.req.raw),
    listRevisions(c.env.DB, org, 10), lastAppliedSnapshot(c.env.DB, org).catch(() => null),
    c.env.DB.prepare("SELECT count(*) AS total, coalesce(sum(r2_key IS NOT NULL), 0) AS done FROM package_files WHERE org_id = ? AND role IN ('media', 'cover')")
      .bind(org).first<{ total: number; done: number }>().catch(() => null)])
  // ‏الناقصُ ما لا نصَّ له **ولا مسوّدةَ كُتبت له** — فلا يُعرض الزرُّ نفسُه بعد الكتابة
  const missing = await missingCopy(c.env.DB, org, snap)
  return render(c.env, session.record.csrf, {
    source, media, revisions, missing: missing.map((e) => e.item + ' · ' + e.platform), transfer: moved ?? { total: 0, done: 0 }, tokenReady: tokenReadyFor(org, source, c.env.GITHUB_CONTENT_TOKEN),
    flash: flash === null ? null : { tone: flash.kind, text: flash.text },
  }, c.req.raw)
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
    }, c.req.raw)
  }
  if (act === 'test') {
    // ‏قراءتان لا ثالثة (D-376): المستودعُ ثمّ الفرع — والنتيجةُ في الصفحة نفسِها، والرمزُ لا يدخلها
    const token = await tokenFor(source, c.env.TOKEN_ENC_KEY, c.env.GITHUB_CONTENT_TOKEN)
    if (token === null) {
      await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'ينقص رمز القراءة — خطواتُه في «ما عليك».' })
      return back()
    }
    const probe = await probeAccess({ owner: source.owner, repo: source.repo, branch: source.branch, token })
    await record(c.env.DB, { actor: 'panel', action: 'package.test', target: source.id, detail: probe.verdict }, c.req.raw)
    const [media, revisions] = await Promise.all([readPackageMedia(c.env.DB, org), listRevisions(c.env.DB, org, 10)])
    return render(c.env, gate.session.record.csrf, {
      source, media, revisions, missing: [], tokenReady: true, probe,
    }, c.req.raw)
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
    // ‏الطلبُ يقرأ الشجرةَ وينقل دفعةً صغيرة ثمّ يعود فورًا، والطابورُ يكمل الباقي والشاشةُ تعدّه
    const out = await syncPackage({ db: c.env.DB, bucket: c.env.MEDIA, token, cap: 6 * 1024 * 1024 }, source, { force: true })
    if (out.kind === 'synced' && out.deferred > 0) {
      await c.env.GENERATE_QUEUE.send({ packageSync: { sourceId: source.id, force: true } } satisfies PackageSyncMessage).catch(() => undefined)
    }
    // ‏اكتمل النقل: الدفعةُ مراجعةٌ برقمها، والمراجعةُ نفسُها لا تُعاد
    const commit = out.kind === 'synced' ? out.commit : source.lastCommit
    if (commit !== null && (out.kind === 'unchanged' || (out.kind === 'synced' && out.deferred === 0))) {
      const fresh = (await readSource(c.env.DB, org)) ?? source
      const rev = await revisePackage({ db: c.env.DB, token, retryFailed: true }, fresh, commit)
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

/**
 * «من حزمتك في GitHub» (D-377): نسخُ الحزمة، وأيُّ نسخةٍ تصوّرًا كاملًا من لقطتها المحفوظة — بلا نداءٍ إلى GitHub ولا كلفة.
 * والافتراضُ أحدثُ نسخةٍ قُرئت.
 */
pkg.get('/panel/plan/package', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const source = await readSource(c.env.DB, org)
  if (source === null) return c.redirect('/panel/plan/new?way=build', 303)
  const [revisions, media, flash] = await Promise.all([listRevisions(c.env.DB, org, 30), readPackageMedia(c.env.DB, org), takeFlash(c.env, c.req.raw)])
  const asked = c.req.query('rev') ?? ''
  const readable = revisions.filter((r) => r.status === 'applied' || r.status === 'analysed')
  // ‏أيُّ نسخةٍ للمنظّمة بمعرّفها، لا آخرُ ثلاثين وحدها — والرابطُ إلى نسخةٍ قديمة يفتحها
  const listed = revisions.find((r) => r.id === asked)
  const older = asked !== '' && listed === undefined && /^rev_[a-z0-9]{1,40}$/.test(asked) ? await readRevision(c.env.DB, org, asked) : null
  const notFound = asked !== '' && listed === undefined && older === null
  const chosen = listed ?? older ?? readable[0] ?? null
  const preview = chosen === null ? null : await previewRevision(c.env.DB, org, chosen.id, currentPicks(media), { x: source.variants.x, linkedin: source.variants.linkedin })
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const schedulable = (await planPackageSchedule(c.env.DB, org, zone, new Date())).ready.length
  const body = planPackageScreen({
    zone, schedulable,
    repo: source.owner + '/' + source.repo + '@' + source.branch, revisions, preview, follow: source.followUpdates,
    canBuild: allows(session.record.role ?? 'owner', 'admin'),
    flash: flash !== null ? { tone: flash.kind, text: flash.text }
      : notFound ? { tone: 'warn', text: 'لم نجد النسخةَ المطلوبة في حزمتك' + (chosen === null ? '.' : '، فهذه أحدثُ نسخةٍ مقروءة.') }
      : chosen !== null && preview === null ? { tone: 'warn', text: 'تعذّرت قراءةُ هذه النسخة: ' + (chosen.error ?? 'لم تُحسب بعد') + '. اختر غيرها.' } : null,
  })
  return page((nonce) => soloPage('صدى — خطّة جديدة', { href: panelHref('posts'), label: 'المنشورات', at: '/panel/plan/new' }, injectCsrf(body, session.record.csrf), nonce,
    '', buildCommands({ onPanel: false }), soloNav('plan', undefined, { shown: ['package'] })))
})

pkg.post('/panel/plan/package', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const source = await readSource(c.env.DB, org)
  if (source === null) return c.redirect('/panel/plan/new?way=build', 303)
  const rev = String(gate.form.get('rev') ?? '')
  const back = (): Response => c.redirect('/panel/plan/package' + (/^rev_[a-f0-9]{1,40}$/.test(rev) ? '?rev=' + rev : ''), 303)
  if (!allows(gate.session.record.role ?? 'owner', 'admin')) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'بناءُ الخطّة للمدير فأعلى.' })
    return back()
  }
  // ‏«تابع التحديث تلقائيًّا» نموذجٌ وحده (D-377): يُحفظ ولا يبني شيئًا، والدفعُ التالي يقرؤه
  if (gate.form.get('do') === 'follow') {
    const follow = gate.form.get('follow') === '1'
    if (follow !== source.followUpdates) await setFollow(c.env.DB, org, source.id, follow)
    await record(c.env.DB, { actor: 'panel', action: 'package.follow', target: source.id, detail: follow ? 'follow' : 'hold' }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: follow ? 'حُفظ: كلُّ دفعٍ جديد يحدّث المسوّدات وحده.' : 'حُفظ: كلُّ تغييرٍ على منشورٍ قائم ينتظر قرارك.' })
    return back()
  }
  const out = await adoptRevision(c.env.DB, source, rev)
  await record(c.env.DB, { actor: 'panel', action: 'package.adopt', target: rev, detail: out.kind + (source.followUpdates ? ' · follow' : ' · hold') }, c.req.raw)
  if (out.kind === 'failed') {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'تعذّر بناءُ الخطّة من هذه النسخة، ولم يُطبَّق شيءٌ منها. حاول ثانيةً.' })
    return back()
  }
  if (out.kind === 'missing') {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'لم نجد هذه النسخةَ مقروءةً في حزمتك. اختر غيرها.' })
    return c.redirect('/panel/plan/package', 303)
  }
  if (out.kind === 'same') {
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'خطّتك مبنيّةٌ من هذه النسخة: لا تغيير.' })
    return back()
  }
  await setFlash(c.env, c.req.raw, { kind: out.awaiting > 0 ? 'warn' : 'ok', text: 'بُنيت الخطّة: ' + counted(out.changes, NOUNS.change) + (out.awaiting === 0 ? '.' : '، وينتظر قرارك ' + counted(out.awaiting, NOUNS.update) + '.') })
  return c.redirect('/panel/package/changes/' + out.id, 303)
})

/**
 * **«اعتمد الخطّة وجدولها»** (D-381): التأكيدُ صفحةٌ بلا سكربت — كم لكلّ منصّة، وأوّلُ موعدٍ وآخرُه بساعة المالك،
 * وما سيُتخطّى ولماذا — ثمّ نموذجٌ واحد. والتنفيذُ `decide` ثمّ `schedulePost` لكلّ منشور، طريقُ صفحة المنشورات نفسُه.
 */
pkg.get('/panel/plan/package/schedule', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const now = new Date()
  const [plan, snap] = await Promise.all([planPackageSchedule(c.env.DB, org, zone, now), lastAppliedSnapshot(c.env.DB, org).catch(() => null)])
  const waiting = (await missingCopy(c.env.DB, org, snap)).length
  const sorted = [...plan.ready].sort((a, b) => a.at.localeCompare(b.at))
  const perPlatform: Record<string, number> = {}
  for (const s of plan.ready) perPlatform[s.platform] = (perPlatform[s.platform] ?? 0) + 1
  const body = scheduleConfirmScreen({
    count: plan.ready.length, perPlatform, waiting,
    first: sorted.length === 0 ? null : slotWhen(sorted[0]!.at, zone),
    last: sorted.length === 0 ? null : slotWhen(sorted[sorted.length - 1]!.at, zone),
    skipped: (Object.keys(plan.skipped) as SkipReason[]).filter((k) => plan.skipped[k] > 0).map((k) => SKIP_SAY[k] + ': ' + String(plan.skipped[k])),
    canBuild: allows(session.record.role ?? 'owner', 'admin'),
    back: c.req.query('from') === 'changes' && /^rev_[a-z0-9]{1,40}$/.test(c.req.query('rev') ?? '') ? '/panel/package/changes/' + (c.req.query('rev') ?? '') : '/panel/plan/package',
  })
  return page((nonce) => soloPage('صدى — اعتمد الخطّة وجدولها', { href: '/panel/plan/package', label: 'من حزمتك', at: '/panel/plan/new' }, injectCsrf(body, session.record.csrf), nonce,
    '', buildCommands({ onPanel: false }), soloNav('plan', undefined, { shown: ['package'] })))
})

pkg.post('/panel/plan/package/schedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  if (!allows(gate.session.record.role ?? 'owner', 'admin')) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'اعتمادُ الخطّة وجدولتُها للمدير فأعلى.' })
    return c.redirect('/panel/plan/package', 303)
  }
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const out = await schedulePackage(c.env.DB, org, zone, new Date(), deciderOf(gate.session.record.via))
  await record(c.env.DB, {
    actor: 'panel', action: 'package.schedule', target: org,
    detail: 'scheduled:' + String(out.scheduled.length) + ' failed:' + String(out.failed.length) + ' skipped:' + JSON.stringify(out.skipped),
  }, c.req.raw)
  const skippedAny = out.failed.length > 0 || Object.values(out.skipped).some((n) => n > 0)
  await setFlash(c.env, c.req.raw, { kind: out.scheduled.length === 0 ? (skippedAny ? 'warn' : 'ok') : skippedAny ? 'warn' : 'ok', text: scheduledSay(out.scheduled, out.skipped, out.failed.length, zone) })
  return c.redirect(panelHref('posts'), 303)
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
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const schedulable = revision.status === 'applied' && allows(session.record.role ?? 'owner', 'admin') ? (await planPackageSchedule(c.env.DB, org, zone, new Date())).ready.length : 0
  return page((nonce) => soloPage('صدى — ما تغيّر في حزمتك', { href: '/panel/package', label: 'حزمة المحتوى', at: '/panel/package' },
    injectCsrf(changesScreen({ revision, changes, history, zone, schedulable, flash: flash === null ? null : { tone: flash.kind, text: flash.text } }), session.record.csrf),
    nonce, '', buildCommands({ onPanel: false }), soloNav('package', undefined, { shown: ['package'] })))
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
