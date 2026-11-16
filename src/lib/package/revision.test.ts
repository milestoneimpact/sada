/**
 * حزمةُ المحتوى، المرحلة ب: الخطّةُ من ملفّ xlsx الحقيقيّ، والنصوصُ من 02-copy الحقيقيّ، والفرقُ والسياسةُ والمراجعةُ بـ fetch مزيّف — بلا شبكة.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { clock, planFiles, readPackagePlan } from './plan'
import { excelDate, excelTime } from './xlsx'
import { mergeCopies, parseCopy } from './copy'
import { diffSnapshots, snapshot, type Snapshot, type SnapshotEntry } from './diff'
import { applyDecisions, decide, decideChange, dispose, packagePosts, readChanges, type PackagePost } from './apply'
import { awaitingCount, awaitingRevision, lastAppliedSnapshot, listRevisions, missingCopy, readRevision, revisePackage } from './revision'
import { rawFile } from './github'
import { decidedSay, syncedSay } from '../../routes/panel/package'
import { readSource, saveSource } from './sync'
import { tweetsOf } from '../draft/thread'

const DIR = join(__dirname, '../../test/package')
const PLAN = new Uint8Array(readFileSync(join(DIR, 'plan-v1.xlsx')))
const COPY = readFileSync(join(DIR, 'copy-v1.md'), 'utf8')
const PLAN_PATH = '01-plan/خطة-النشر-شهر-v1.xlsx'
const COPY_PATH = '02-copy/03-15-copy-v1.md'

describe('الخطّة من xlsx أصيلًا', () => {
  it('الملفُّ الحقيقيّ: ثلاثون يومًا، والأعمدةُ الأحدَ عشر، ورقمُ المادّة يربط', async () => {
    const p = await readPackagePlan(PLAN)
    expect(p.problems).toEqual([])
    expect(p.days).toBe(30)
    for (const col of ['اليوم', 'التاريخ', 'الإطار', 'رقم المادة', 'العنوان / الفكرة', 'X: الصيغة', 'X: الوقت', 'LinkedIn: الصيغة', 'LinkedIn: الوقت', 'الملف', 'الحالة']) {
      expect(p.columns).toContain(col)
    }
    expect([...new Set(p.entries.map((e) => e.item))]).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15'])
    expect(p.entries.find((e) => e.item === '01' && e.platform === 'x')).toMatchObject({ date: '2026-11-22', time: '20:00', idea: 'الموشن الافتتاحي' })
    expect(p.entries.find((e) => e.item === '01' && e.platform === 'linkedin')?.time).toBe('09:00')
    expect(p.rules?.['X']?.length ?? 0).toBeGreaterThan(3)
  })

  it('تاريخُ Excel التسلسليُّ ووقتُه، والأعلى vN بين ملفّات الخطّة', () => {
    expect(excelDate('46348')).toBe('2026-11-22')
    expect(excelTime('0.395833')).toBe('09:30')
    expect(clock('8:00 م')).toBe('20:00')
    expect(planFiles(['01-plan/a-v1.xlsx', '01-plan/a-v2.xlsx', '02-copy/x.md'])[0]).toBe('01-plan/a-v2.xlsx')
  })
})

describe('النصوص الجاهزة', () => {
  const c = parseCopy(COPY)
  it('المادّة 03..15 لكلٍّ منها X وLinkedIn، والنصُّ كما كُتب', () => {
    expect([...c.items.keys()]).toEqual(['03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15'])
    for (const it of c.items.values()) { expect(it.x?.text, it.item).toBeTruthy(); expect(it.linkedin?.text, it.item).toBeTruthy() }
    expect(c.items.get('03')!.x!.text.startsWith('لوحة مؤشرات خضراء بالكامل')).toBe(true)
    expect(c.items.get('03')!.linkedin!.text.endsWith('#ProjectManagement #Governance #إدارة_المشاريع')).toBe(true)
    expect(c.unparsed).toEqual([])
  })

  it('السلسلةُ تُفصل تغريداتٍ بلا مسّ حرف، والاستطلاعُ يحمل صيغته', () => {
    const t = c.items.get('12')!.x!
    expect(t.form).toBe('سلسلة')
    expect(tweetsOf('x', t.text)).toHaveLength(4)
    expect(t.text.replace(/\n---\n/g, '\n\n')).toBe(COPY.split('**X (سلسلة)**')[1]!.split('**LinkedIn**')[0]!.trim())
    expect(c.items.get('07')!.x!.form).toBe('استطلاع')
  })

  it('رابطُ التسجيل الناقص في 15 يُعلَّم، والنصُّ الطويل يُعلَّم ولا يُقصّ', () => {
    expect(c.items.get('15')!.x!.problems).toContain('ينقصه رابط التسجيل قبل النشر')
    const long = 'أ'.repeat(300)
    const r = parseCopy(`## 99 — طويل\n\n**X**\n\n${long}\n\n**LinkedIn**\n\nنص\n`).items.get('99')!.x!
    expect(r.text).toBe(long)
    expect(r.problems[0]).toMatch(/لم يُقصّ/)
    expect(parseCopy('## بلا رقم\n\n**X**\nنص').unparsed).toEqual(['بلا رقم'])
  })
})

const entry = (o: Partial<SnapshotEntry> = {}): SnapshotEntry => ({
  item: '03', platform: 'x', date: '2026-11-26', time: '20:00', format: 'فيديو', idea: 'فكرة', text: 'نص', media: 'g:a', mediaName: 'a.png', problems: [], ...o,
})
const snap = (entries: SnapshotEntry[]): Snapshot => ({ entries, copySha: 'c', planPath: PLAN_PATH })

describe('الفرق', () => {
  it('كلُّ نوع، والدفعةُ نفسُها مرّتين صفرُ تغيير', () => {
    const a = snap([entry(), entry({ item: '04' })])
    expect(diffSnapshots(a, a)).toEqual([])
    const b = snap([entry({ text: 'نص جديد', time: '21:00', format: 'سلسلة', media: 'g:b' }), entry({ item: '05' })])
    expect(diffSnapshots(a, b).map((c) => c.item + ':' + c.kind)).toEqual(['03:format', '03:media', '03:text', '03:time', '04:removed', '05:added'])
    expect(diffSnapshots(null, a).every((c) => c.kind === 'added')).toBe(true)
  })

  it('اللقطةُ من الملفّين الحقيقيّين: ستّةٌ وعشرون نصًّا جاهزًا وأربعةٌ تُكتب من فكرتها', async () => {
    const s = snapshot({ plan: await readPackagePlan(PLAN), copy: parseCopy(COPY), copySha: 'c', planPath: PLAN_PATH, picks: [], variants: { x: 'dark', linkedin: 'light' } })
    expect(s.entries).toHaveLength(30)
    expect(s.entries.filter((e) => e.text === null).map((e) => e.item + e.platform)).toEqual(['01linkedin', '01x', '02linkedin', '02x'])
  })
})

const post = (status: string, o: Partial<PackagePost> = {}): PackagePost => ({ id: 'p', item: '03', platform: 'x', status, text: 'نص', copyOrigin: 'package', ...o })
describe('السياسة', () => {
  const text = diffSnapshots(snap([entry()]), snap([entry({ text: 'جديد' })]))[0]!
  it('المسوّدةُ وحدها، والمعتمدُ والمجدولُ ينتظران، والمنشورُ مجمَّد، واليدويُّ محميّ', () => {
    expect(dispose(text, null)).toBe('auto_applied')
    expect(dispose(text, post('draft'))).toBe('auto_applied')
    for (const s of ['approved', 'edited', 'queued', 'failed']) expect(dispose(text, post(s))).toBe('awaiting_owner')
    expect(dispose(text, post('published'))).toBe('frozen_published')
    expect(dispose(text, post('draft', { copyOrigin: 'manual' }))).toBe('awaiting_owner')
    // ‏عدّلته بيدها ولم تعلّمه: نصُّه غيرُ ما كتبته الحزمة
    expect(dispose(text, post('draft', { text: 'كتبتُه أنا' }))).toBe('awaiting_owner')
    // ‏«حُذف» داخل شهره: الدفعةُ الجديدة فيها نوفمبر بغير المادّة 03 (D-383 المرحلة ٤)
    const removed = diffSnapshots(snap([entry(), entry({ item: '04' })]), snap([entry({ item: '04' })]))[0]!
    expect(removed).toMatchObject({ kind: 'removed', item: '03', period: '2026-11' })
    expect(decide([removed], [post('draft')])[0]!.disposition).toBe('auto_applied')
    expect(decide([removed], [post('queued')])[0]!.disposition).toBe('awaiting_owner')
  })
})

function github(files: Record<string, Uint8Array | string>, shas: Record<string, string> = {}, fail: (url: string) => Response | null = () => null): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input))
    const bad = fail(url)
    if (bad !== null) return bad
    if (url.includes('/commits/')) return Response.json({ parents: [{ sha: 'f'.repeat(40) }], commit: { message: 'نصوص v1\n\nتفاصيل' } })
    // ‏شجرةُ الالتزام المراجَع: ما في `files` وحده، ببصمةٍ لكلّ ملفّ
    if (url.includes('/git/trees/')) {
      return Response.json({ truncated: false, tree: Object.keys(files).map((p) => ({ path: 'social-media/' + p, type: 'blob', size: 1, sha: shas[p] ?? (p.startsWith('02-copy') ? 'copy1' : 'plan1') })) })
    }
    for (const [p, body] of Object.entries(files)) if (url.includes('/contents/social-media/' + p + '?')) return new Response(typeof body === 'string' ? body : new Uint8Array(body))
    return new Response('', { status: 404 })
  }) as typeof fetch
}

async function seeded() {
  const db = fakeDb()
  await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'social-media-video', root: 'social-media' })
  const source = (await readSource(db, 'org_owner'))!
  for (const [p, role] of [[PLAN_PATH, 'plan'], [COPY_PATH, 'copy']] as const) {
    await db.prepare(`INSERT INTO package_files (org_id, source_id, path, blob_sha, size, role, seen_commit) VALUES ('org_owner', ?, ?, ?, 1, ?, 'c1')`)
      .bind(source.id, p, role + '1', role).run()
  }
  return { db, source }
}

describe('المراجعة', () => {
  it('أوّلُ دفعٍ يكتب المسوّدات بنصّها الجاهز، والدفعةُ نفسُها مرّةً ثانية مراجعةٌ واحدة', async () => {
    const { db, source } = await seeded()
    const gh = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY })
    const first = await revisePackage({ db, token: 't', fetchImpl: gh }, source, 'a'.repeat(40))
    expect(first).toMatchObject({ kind: 'applied', changes: 30, awaiting: 0 })
    const { results } = await db.prepare("SELECT package_item_no, platform, copy_origin, status, package_due FROM posts WHERE org_id = 'org_owner' AND package_item_no IS NOT NULL").all<{ package_item_no: string; copy_origin: string; status: string; package_due: string }>()
    expect(results).toHaveLength(26)
    expect(results.every((r) => r.copy_origin === 'package' && r.status === 'draft')).toBe(true)
    expect(await revisePackage({ db, token: 't', fetchImpl: gh }, source, 'a'.repeat(40))).toMatchObject({ kind: 'exists' })
    expect(await listRevisions(db, 'org_owner')).toHaveLength(1)
    expect((await listRevisions(db, 'org_owner'))[0]).toMatchObject({ message: 'نصوص v1', status: 'applied' })
  })

  it('دفعٌ تالٍ: المسوّدةُ تُحدَّث وحدها، والمعتمدُ ينتظر قرارها، و«اعتمد التحديث» يكتبه', async () => {
    const { db, source } = await seeded()
    await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }) }, source, 'a'.repeat(40))
    await db.prepare("UPDATE posts SET status = 'approved', approved_at = datetime('now'), approved_by = 'owner' WHERE package_item_no = '04' AND platform = 'x'").run()
    const edited = COPY.replace('هذا «الأخضر المجامل».', 'هذا هو «الأخضر المجامل».').replace('قلِّل المعالم،', 'قلّل المعالم دائمًا،')
    const second = await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: edited }, { [COPY_PATH]: 'copy2' }) }, source, 'b'.repeat(40))
    expect(second).toMatchObject({ kind: 'applied', changes: 2, awaiting: 1 })
    const draft = await db.prepare("SELECT text, copy_blob_sha FROM posts WHERE package_item_no = '03' AND platform = 'x'").first<{ text: string; copy_blob_sha: string }>()
    expect(draft!.text).toContain('هذا هو «الأخضر المجامل».')
    expect(draft!.copy_blob_sha).toBe('copy2')
    const approved = await db.prepare("SELECT text, status FROM posts WHERE package_item_no = '04' AND platform = 'x'").first<{ text: string; status: string }>()
    expect(approved!.status).toBe('approved')
    expect(approved!.text).not.toContain('دائمًا')
    expect(await awaitingCount(db, 'org_owner')).toBe(1)
    const rev = (await listRevisions(db, 'org_owner'))[0]!
    const waiting = (await readChanges(db, 'org_owner', rev.id)).filter((c) => c.disposition === 'awaiting_owner')
    expect(await decideChange(db, 'org_owner', waiting.map((c) => c.id), 'accept')).toEqual({ done: 1, superseded: 0 })
    expect((await db.prepare("SELECT text, status FROM posts WHERE package_item_no = '04' AND platform = 'x'").first<{ text: string; status: string }>())).toMatchObject({ status: 'approved' })
    expect((await db.prepare("SELECT text FROM posts WHERE package_item_no = '04' AND platform = 'x'").first<{ text: string }>())!.text).toContain('دائمًا')
    expect(await awaitingCount(db, 'org_owner')).toBe(0)
    // ‏القرارُ مرّةً واحدة
    expect(await decideChange(db, 'org_owner', waiting.map((c) => c.id), 'keep')).toEqual({ done: 0, superseded: 0 })
    // ‏والرأسُ يقرأ ما بقي: لا «ينتظر قرارك 1» بعد القرار
    expect((await listRevisions(db, 'org_owner'))[0]!.counts.awaiting).toBe(0)
  })

  it('رمزٌ مرفوض: مراجعةٌ «تعذّرت» بسببٍ بلا رمز', async () => {
    const { db, source } = await seeded()
    const out = await revisePackage({ db, token: 'secret-token-value', fetchImpl: (async () => new Response('', { status: 401 })) as typeof fetch }, source, 'c'.repeat(40))
    expect(out.kind).toBe('failed')
    expect(JSON.stringify(out)).not.toContain('secret-token-value')
    expect((await listRevisions(db, 'org_owner'))[0]!.status).toBe('failed')
  })

  it('ملفّا نصوصٍ: الأحدثُ نسخةً يغلب', () => {
    const m = mergeCopies([{ path: '02-copy/a-v2.md', md: '## 03 — ب\n\n**X**\n\nجديد\n' }, { path: '02-copy/a-v1.md', md: '## 03 — أ\n\n**X**\n\nقديم\n' }])
    expect(m.items.get('03')!.x!.text).toBe('جديد')
  })
})

describe('الشاشة', () => {
  it('«ما تغيّر في حزمتك» بالأرقام والزرّين، وبطاقةُ الإعدادات بلونَي المنصّتين', async () => {
    const { changesScreen } = await import('../../routes/ui/packageChangesView')
    const { packageScreen } = await import('../../routes/ui/packageView')
    const { db, source } = await seeded()
    await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }) }, source, 'a'.repeat(40))
    const [rev] = await listRevisions(db, 'org_owner')
    const changes = (await readChanges(db, 'org_owner', rev!.id)).map((c, i) => (i === 0 ? { ...c, disposition: 'awaiting_owner' as const } : c))
    const out = changesScreen({ revision: { ...rev!, counts: { ...rev!.counts, awaiting: 1 } }, changes, history: [rev!] })
    expect(out).toContain('ما تغيّر في حزمتك')
    expect(out).toContain('اعتمد التحديث')
    expect(out).toContain('أبقِ القديم')
    expect(out).toContain('ينتظر الكتابة')
    expect(out).not.toMatch(/<script/)
    const page = packageScreen({ source, media: [], tokenReady: true, revisions: [rev!], missing: ['01 · x'] })
    expect(page).toContain('إعدادات الحزمة')
    expect(page).toContain('اكتب الناقص من أفكارها')
    expect(page).not.toMatch(/\(D-\d{3}\)/)
  })
})

const EDIT = (n: string): string => COPY.replace('قلِّل المعالم،', 'قلّل المعالم ' + n + '،')

describe('ما أصلحته المراجعة', () => {
  it('عطلٌ عابر (503) لا يحجب الالتزام: يُعاد في النداء التالي ويُطبَّق، والعدّادُ يزيد', async () => {
    const { db, source } = await seeded()
    const ok = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY })
    const down = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }, {}, (u) => (u.includes('/contents/') ? new Response('', { status: 503 }) : null))
    expect((await revisePackage({ db, token: 't', fetchImpl: down }, source, 'd'.repeat(40))).kind).toBe('failed')
    const row = await db.prepare("SELECT attempts, retryable, status FROM package_revisions WHERE commit_sha = ?").bind('d'.repeat(40)).first<{ attempts: number; retryable: number; status: string }>()
    expect(row).toMatchObject({ attempts: 1, retryable: 1, status: 'failed' })
    expect(await revisePackage({ db, token: 't', fetchImpl: ok }, source, 'd'.repeat(40))).toMatchObject({ kind: 'applied', changes: 30 })
    expect(await listRevisions(db, 'org_owner')).toHaveLength(1)
    expect((await db.prepare("SELECT attempts FROM package_revisions WHERE commit_sha = ?").bind('d'.repeat(40)).first<{ attempts: number }>())!.attempts).toBe(2)
  })

  it('مهلةٌ عابرة تُعاد كذلك، وعطلٌ دائم (401) يبقى بسببه ولا يُعاد', async () => {
    const { db, source } = await seeded()
    const slow = (async () => { throw new DOMException('timeout', 'TimeoutError') }) as typeof fetch
    expect(await revisePackage({ db, token: 't', fetchImpl: slow }, source, 'e'.repeat(40))).toMatchObject({ kind: 'failed', reason: 'GitHub لم يردّ في المهلة' })
    expect((await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }) }, source, 'e'.repeat(40))).kind).toBe('applied')
    const denied = (async () => new Response('', { status: 401 })) as typeof fetch
    expect((await revisePackage({ db, token: 't', fetchImpl: denied }, source, '1'.repeat(40))).kind).toBe('failed')
    expect((await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }) }, source, '1'.repeat(40))).kind).toBe('exists')
    expect((await readRevision(db, 'org_owner', (await listRevisions(db, 'org_owner')).find((r) => r.commit === '1'.repeat(40))!.id))!.error).toMatch(/401/)
  })

  it('«زامن الآن» يعيد مراجعةً تعذّرت بعطلٍ غير عابر، والسببُ يسمّي العطل', async () => {
    const { db, source } = await seeded()
    const broken = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }, {}, (u) => { if (u.includes('/contents/')) throw new RangeError('boom'); return null })
    const bad = await revisePackage({ db, token: 't', fetchImpl: broken }, source, '7'.repeat(40))
    expect(bad.kind).toBe('failed')
    if (bad.kind === 'failed') expect(bad.reason).toMatch(/^تعذّر بناء الخطّة من الحزمة \(\w+/)
    const ok = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY })
    expect((await revisePackage({ db, token: 't', fetchImpl: ok }, source, '7'.repeat(40))).kind).toBe('exists')
    expect(await revisePackage({ db, token: 't', fetchImpl: ok, retryFailed: true }, source, '7'.repeat(40))).toMatchObject({ kind: 'applied', changes: 30 })
  })

  it('مادّةٌ خرجت فأُرشفت ثمّ عادت: يُكتب لها منشورٌ جديد', async () => {
    const { db, source } = await seeded()
    await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }) }, source, 'a'.repeat(40))
    await db.prepare("UPDATE posts SET status = 'rejected' WHERE package_item_no = '03' AND platform = 'x'").run()
    const back = { item: '03', platform: 'x', kind: 'added' as const, before: null, after: entry({ text: 'عاد' , media: null, mediaName: null }) }
    expect(dispose(back, post('rejected'))).toBe('auto_applied')
    const decisions = decide([back], await packagePosts(db, 'org_owner'))
    expect(decisions[0]!.disposition).toBe('auto_applied')
    const rev = (await listRevisions(db, 'org_owner'))[0]!.id
    await db.prepare("INSERT INTO package_revisions (id, org_id, source_id, commit_sha, status) VALUES ('rev_back', 'org_owner', ?, 'zz', 'analysed')").bind(source.id).run()
    await applyDecisions({ db, org: 'org_owner', revisionId: 'rev_back', copySha: 'c' }, decisions)
    const rows = await db.prepare("SELECT status, text FROM posts WHERE package_item_no = '03' AND platform = 'x' ORDER BY created_at, rowid").all<{ status: string; text: string }>()
    expect(rows.results.map((r) => r.status).sort()).toEqual(['draft', 'rejected'])
    expect(rows.results.find((r) => r.status === 'draft')!.text).toBe('عاد')
    expect(rev).not.toBe('rev_back')
  })

  it('تغييرٌ قديمٌ ينتظر ثمّ جاء أحدثُ منه للمنشور نفسِه: يُطوى القديم ولا يكتب فوق الأحدث، والشارةُ إلى الأحدث', async () => {
    const { db, source } = await seeded()
    await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }) }, source, 'a'.repeat(40))
    await db.prepare("UPDATE posts SET status = 'approved', approved_at = datetime('now'), approved_by = 'owner' WHERE package_item_no = '04' AND platform = 'x'").run()
    const a = await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: EDIT('أوّلًا') }, { [COPY_PATH]: 'c2' }) }, source, 'b'.repeat(40))
    const b = await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: EDIT('ثانيًا') }, { [COPY_PATH]: 'c3' }) }, source, 'c'.repeat(40))
    if (a.kind !== 'applied' || b.kind !== 'applied') throw new Error('لم تُطبَّق')
    const old = (await readChanges(db, 'org_owner', a.id)).find((c) => c.item === '04' && c.platform === 'x')!
    expect(old).toMatchObject({ disposition: 'kept_old', supersededBy: b.id })
    expect(await awaitingRevision(db, 'org_owner')).toBe(b.id)
    expect((await decideChange(db, 'org_owner', [old.id], 'accept')).done).toBe(0)
    const fresh = (await readChanges(db, 'org_owner', b.id)).find((c) => c.item === '04' && c.platform === 'x' && c.disposition === 'awaiting_owner')!
    expect((await decideChange(db, 'org_owner', [fresh.id], 'accept')).done).toBe(1)
    expect((await db.prepare("SELECT text FROM posts WHERE package_item_no = '04' AND platform = 'x'").first<{ text: string }>())!.text).toContain('ثانيًا')
    expect(decidedSay('accept', 0, 1)).toMatch(/دفعةٌ أحدث/)
  })

  it('القراءةُ من شجرة الالتزام المراجَع لا من آخر مزامنة، وبصمةُ النصّ للأعلى نسخةً، والإرشاداتُ في اللقطة', async () => {
    const { db, source } = await seeded()
    await db.prepare("DELETE FROM package_files WHERE org_id = 'org_owner'").run()
    const out = await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, '02-copy/x-v9.md': '', '02-copy/x-v10.md': COPY }, { '02-copy/x-v9.md': 'nine', '02-copy/x-v10.md': 'ten' }) }, source, 'a'.repeat(40))
    expect(out).toMatchObject({ kind: 'applied', changes: 30 })
    const snap = await lastAppliedSnapshot(db, 'org_owner') as (Snapshot & { rules?: unknown }) | null
    expect(snap!.copySha).toBe('ten')
    expect(snap!.rules).not.toBeNull()
    expect(snap!.rules).toBeTypeOf('object')
  })

  it('الناقصُ لا يشمل ما كُتبت له مسوّدة، والمراجعةُ تُقرأ بمعرّفها، والعددُ بالعربيّة', async () => {
    const { db, source } = await seeded()
    await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }) }, source, 'a'.repeat(40))
    const snap = await lastAppliedSnapshot(db, 'org_owner')
    expect((await missingCopy(db, 'org_owner', snap)).map((e) => e.item + e.platform)).toEqual(['01linkedin', '01x', '02linkedin', '02x'])
    await db.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, model, rationale, org_id, package_item_no, copy_origin)
      VALUES ('w1', 'x', 'text', 'كُتب', 'draft', 'k-w1', 'owner', 'من حزمة المحتوى', 'org_owner', '01', 'written')`).run()
    expect((await missingCopy(db, 'org_owner', snap)).map((e) => e.item + e.platform)).toEqual(['01linkedin', '02linkedin', '02x'])
    const id = (await listRevisions(db, 'org_owner'))[0]!.id
    expect((await readRevision(db, 'org_owner', id))!.id).toBe(id)
    expect(await readRevision(db, 'org_other', id)).toBeNull()
    expect(syncedSay('a'.repeat(40), 1, 0)).toBe('قُرئت الدفعة aaaaaaa: تغيير واحد، ولا شيء ينتظرك.')
    expect(syncedSay('a'.repeat(40), 30, 2)).toBe('قُرئت الدفعة aaaaaaa: 30 تغييرًا، وينتظر قرارك تحديثان.')
    expect(syncedSay('a'.repeat(40), 3, 0)).not.toContain('0')
  })

  it('نداءُ GitHub يحمل المهلةَ ولو جاء fetch من المنادي', async () => {
    let signal: AbortSignal | null | undefined = null
    const spy = (async (_: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal; return new Response('x') }) as typeof fetch
    await rawFile({ owner: 'o', repo: 'r', branch: 'b', token: 't' }, 'a.md', 'c', spy)
    expect(signal).toBeInstanceOf(AbortSignal)
  })
})

describe('ما أصلحته المراجعة الثانية', () => {
  it('ويب هوك وفحصٌ ساعيّ على الالتزام نفسِه معًا: مسوّداتٌ مرّةً واحدة، والمحسوبةُ الحديثة لا تُعاد', async () => {
    const { db, source } = await seeded()
    const gh = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY })
    const c = 'c'.repeat(40)
    const [a, b] = await Promise.all([revisePackage({ db, token: 't', fetchImpl: gh }, source, c), revisePackage({ db, token: 't', fetchImpl: gh }, source, c)])
    expect([a.kind, b.kind].sort()).toEqual(['applied', 'exists'])
    const n = await db.prepare("SELECT count(*) AS n FROM posts WHERE org_id = 'org_owner' AND package_item_no IS NOT NULL").first<{ n: number }>()
    expect(n!.n).toBe(26)
    // ‏صفٌّ «محسوب» حديث (نداءٌ آخر يطبّقه الآن) لا يُمحى ولا يُعاد
    await db.prepare("UPDATE package_revisions SET status = 'analysed' WHERE commit_sha = ?").bind(c).run()
    expect(await revisePackage({ db, token: 't', fetchImpl: gh }, source, c)).toMatchObject({ kind: 'exists' })
    expect(await listRevisions(db, 'org_owner')).toHaveLength(1)
    // ‏أقدمُ من عشر دقائق: متعطّلٌ يُعاد
    await db.prepare("UPDATE package_revisions SET created_at = datetime('now', '-11 minutes'), claimed_at = datetime('now', '-11 minutes') WHERE commit_sha = ?").bind(c).run()
    expect((await revisePackage({ db, token: 't', fetchImpl: gh }, source, c)).kind).toBe('applied')
    // ‏صفٌّ أُعيد للتوّ يحمل «created_at» القديم: يُقاس التعثّرُ من الحجز، فلا يُمحى وهو يُطبَّق
    await db.prepare("UPDATE package_revisions SET status = 'analysed' WHERE commit_sha = ?").bind(c).run()
    expect(await revisePackage({ db, token: 't', fetchImpl: gh }, source, c)).toMatchObject({ kind: 'exists' })
  })

  it('محاولتان على صفٍّ متعثّرٍ واحد: الحجزُ بالمقارنة تفوز به إحداهما', async () => {
    const { db, source } = await seeded()
    const down = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }, {}, (u) => (u.includes('/contents/') ? new Response('', { status: 503 }) : null))
    const c = '2'.repeat(40)
    await revisePackage({ db, token: 't', fetchImpl: down }, source, c)
    const gh = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY })
    const [a, b] = await Promise.all([revisePackage({ db, token: 't', fetchImpl: gh }, source, c), revisePackage({ db, token: 't', fetchImpl: gh }, source, c)])
    expect([a.kind, b.kind].sort()).toEqual(['applied', 'exists'])
    const n = await db.prepare("SELECT count(*) AS n FROM posts WHERE org_id = 'org_owner' AND package_item_no IS NOT NULL").first<{ n: number }>()
    expect(n!.n).toBe(26)
  })

  it('التزامٌ قديمٌ متعثّر طُبّق بعده أحدث: لا يُعاد فيكتب فوقه، ويُطوى بسببه', async () => {
    const { db, source } = await seeded()
    const down = github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }, {}, (u) => (u.includes('/contents/') ? new Response('', { status: 503 }) : null))
    const old = '3'.repeat(40)
    await revisePackage({ db, token: 't', fetchImpl: down }, source, old)
    await db.prepare("UPDATE package_revisions SET created_at = datetime('now', '-1 hour') WHERE commit_sha = ?").bind(old).run()
    expect((await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: EDIT('ب') }, { [COPY_PATH]: 'copy2' }) }, source, '4'.repeat(40))).kind).toBe('applied')
    expect(await revisePackage({ db, token: 't', fetchImpl: github({ [PLAN_PATH]: PLAN, [COPY_PATH]: COPY }) }, source, old)).toMatchObject({ kind: 'exists' })
    const row = await db.prepare('SELECT status, retryable, error_reason FROM package_revisions WHERE commit_sha = ?').bind(old).first()
    expect(row).toMatchObject({ status: 'failed', retryable: 0, error_reason: 'طواه التزامٌ أحدث' })
    const text = await db.prepare("SELECT count(*) AS n FROM posts WHERE org_id = 'org_owner' AND text LIKE '%قلّل المعالم ب،%'").first<{ n: number }>()
    expect(text!.n).toBeGreaterThan(0)
  })
})
