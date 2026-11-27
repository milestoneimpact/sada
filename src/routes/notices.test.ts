/**
 * مركزُ الإشعارات (D-294): **الفشلُ يُرى في اللوحة في دورته، ويُطفأ بالقراءة، ويختفي بزوال سببه.**
 *
 * كلُّ إشعارٍ من صفٍّ حقيقيّ في قاعدةٍ حقيقيّة: محاولةُ نشرٍ فاشلة، وحسابٌ منقطع، وصورٌ تنتظر الحصّة، ونبضٌ متأخّر،
 * وسقفٌ بُلغ. والعدّادُ في الترويسة يُقرأ من HTML الصفحة كما يراه المالك.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv, type FakeDb } from '../test/fakes'
import { app } from '../index'
import { markRead, memoryNotices, readMarks, unreadNotices } from '../lib/notices'
import { pulses } from '../lib/ops/heartbeat'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

let db: FakeDb
let env: Record<string, unknown>
let cookie = ''

beforeEach(async () => {
  db = fakeDb()
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: db,
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
  const r = await emailLogin(app, env)
  expect(r.status).toBe(303)
  cookie = (r.headers.get('Set-Cookie') ?? '').split(';')[0]!
})

const get = (path: string) => app.request(path, { headers: { Cookie: cookie } }, env)

/** العدّادُ على الجرس كما يُرسَم: `<a class="bell" …><span class="count">N</span>`. */
function bellCount(html: string): number {
  const m = /<a class="bell"[^>]*>[\s\S]*?<\/a>/.exec(html)
  if (m === null) throw new Error('لا جرسَ في الترويسة')
  const n = /<span class="count"[^>]*>(\d+)<\/span>/.exec(m[0])
  return n === null ? 0 : Number(n[1])
}

async function failedPost(id = 'p-fail'): Promise<void> {
  db.raw.prepare(`INSERT OR IGNORE INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a-x', 'x', 'member', 'ext', 'عمر', 'active')`).run()
  db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, account_id, scheduled_at)
    VALUES (?, 'x', 'text', 'منشورٌ لم يخرج', 'failed', ?, 'a-x', '2026-09-08 08:00:00')`).run(id, `k-${id}`)
  db.raw.prepare(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, at)
    VALUES (?, ?, ?, 1, '{}', '{"error":"rate_limited"}', 'failed', datetime('now'))`).run(`at-${id}`, id, `k-${id}`)
}

async function csrfOf(path: string): Promise<string> {
  const html = await (await get(path)).text()
  const m = /name="_csrf" value="([^"]+)"/.exec(html)
  if (m === null) throw new Error('لا رمزَ CSRF في الصفحة')
  return m[1]!
}

describe('مركز الإشعارات (D-294)', () => {
  it('لوحةٌ بلا علّة: جرسٌ بلا عدّاد، وصفحةٌ تقول «لا شيء يحتاج يدَك»', async () => {
    const home = await (await get('/panel')).text()
    expect(bellCount(home)).toBe(0)
    const pageHtml = await (await get('/panel/notices')).text()
    expect(pageHtml).toContain('لا شيء يحتاج يدَك الآن')
  })

  it('محاولةُ نشرٍ فاشلة تظهر في الدورة نفسِها: العدّادُ ١، والصفحةُ تقول لماذا وإلى أين', async () => {
    await failedPost()
    const home = await (await get('/panel')).text()
    expect(bellCount(home)).toBe(1)
    const pageHtml = await (await get('/panel/notices')).text()
    expect(pageHtml).toContain('فشل نشر «منشورٌ لم يخرج» على X')
    expect(pageHtml).toContain('href="/panel/journey/p-fail"')
    expect(pageHtml).toContain('name="ref" value="publish:p-fail"')
  })

  it('«علّمها مقروءةً» تطفئ العدّاد ولا تمحو السبب؛ وعلّةٌ جديدة تعيده', async () => {
    await failedPost('p-1')
    const csrf = await csrfOf('/panel/notices')
    const body = new FormData()
    body.set('_csrf', csrf)
    body.append('ref', 'publish:p-1')
    const r = await app.request('/panel/notices/read', { method: 'POST', body, headers: { Cookie: cookie } }, env)
    expect(r.status).toBe(303)
    expect(bellCount(await (await get('/panel')).text())).toBe(0)
    const pageHtml = await (await get('/panel/notices')).text()
    expect(pageHtml).toContain('ما قُرئ وسببُه قائم')
    expect(pageHtml).toContain('قرأها')
    const row = db.raw.prepare('SELECT ref, org_id, by_email FROM notice_reads').get() as { ref: string; org_id: string; by_email: string | null }
    expect(row).toMatchObject({ ref: 'publish:p-1', org_id: 'org_owner' })
    expect(row.by_email).not.toBeNull()

    await failedPost('p-2')
    expect(bellCount(await (await get('/panel')).text())).toBe(1)
  })

  it('ويختفي الإشعارُ حين يزول سببُه — ولا تبقى علامتُه حاجزًا', async () => {
    await failedPost('p-3')
    expect(bellCount(await (await get('/panel')).text())).toBe(1)
    db.raw.prepare("UPDATE posts SET status = 'queued', approved_by = 'panel', approved_at = datetime('now') WHERE id = 'p-3'").run()
    expect(bellCount(await (await get('/panel')).text())).toBe(0)
    expect(await (await get('/panel/notices')).text()).not.toContain('منشورٌ لم يخرج')
  })

  it('حسابٌ منقطع وصورٌ تنتظر الحصّة: كلٌّ بمرجعه ومساره', async () => {
    db.raw.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status, needs_reauth_at)
      VALUES ('a-li', 'linkedin', 'member', 'abc', 'عمر', 'needs_reauth', '2026-09-10 03:00:00')`).run()
    db.raw.prepare(`INSERT INTO audit_log (actor, action, target, detail, org_id, at) VALUES ('system', 'image.quota_wait', 'p-9', '3 صور', 'org_owner', datetime('now'))`).run()
    expect(bellCount(await (await get('/panel')).text())).toBe(2)
    const pageHtml = await (await get('/panel/notices')).text()
    expect(pageHtml).toContain('انقطع إذن LinkedIn (عمر)')
    expect(pageHtml).toContain('href="/oauth/linkedin/start"')
    expect(pageHtml).toContain('صورة تنتظر حصّةَ الغد')
  })

  // ‏D-435: كلُّ إشعارٍ يقود بضغطةٍ إلى إصلاحه، لا إلى صفحةٍ يُبحث فيها
  it('إذنٌ انتهى يقود إلى «أعد الربط» نفسِه، والمقترِبُ إلى الحسابات', async () => {
    db.raw.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a-li', 'linkedin', 'member', 'abc', 'عمر', 'active')`).run()
    db.raw.prepare(`INSERT INTO token_alerts (account_id, kind, threshold, expires_at, org_id) VALUES ('a-li', 'refresh', 0, '2026-11-01', 'org_owner')`).run()
    const html = await (await get('/panel/notices')).text()
    expect(html).toMatch(/href="\/oauth\/linkedin\/start"[^>]*>(?:<[^>]*>)*\s*أعد الربط/)
    db.raw.prepare('DELETE FROM token_alerts').run()
    db.raw.prepare(`INSERT INTO token_alerts (account_id, kind, threshold, expires_at, org_id) VALUES ('a-li', 'refresh', 7, '2026-12-01', 'org_owner')`).run()
    expect(await (await get('/panel/notices')).text()).toContain('href="/panel/accounts"')
  })

  it('حكمُ العميل يقود إلى بطاقة البند في الخطّة ببصمته', async () => {
    db.raw.exec('PRAGMA foreign_keys = OFF')
    db.raw.prepare(`INSERT INTO review_links (id, org_id, plan_id, token_hash, created_by, expires_at) VALUES ('l-1', 'org_owner', 'pl-1', 'h', 'panel', '2099-01-01')`).run()
    db.raw.prepare(`INSERT INTO review_verdicts (link_id, org_id, plan_id, item_key, verdict, note) VALUES ('l-1', 'org_owner', 'pl-1', 's1|x|2026-11-03|09:00', 'changes', 'أقصر')`).run()
    const html = await (await get('/panel/notices')).text()
    expect(html).toContain('href="/panel/plan/review?item=s1%7Cx%7C2026-11-03%7C09%3A00"')
  })

  it('علّةٌ في منظّمةٍ أخرى لا تُعدّ لهذه', async () => {
    db.raw.prepare(`INSERT INTO orgs (id, name) VALUES ('org_other', 'غيرها')`).run()
    db.raw.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status, org_id) VALUES ('a-o', 'x', 'member', 'o', 'غيرُه', 'active', 'org_other')`).run()
    db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, account_id, org_id)
      VALUES ('p-o', 'x', 'text', 'لغيرها', 'failed', 'k-o', 'a-o', 'org_other')`).run()
    expect(bellCount(await (await get('/panel')).text())).toBe(0)
  })
})

/*
 * ‏**مراجعة D-317 · البند ٤**: إشعارُ الأمان لصاحبه وحده، وكانت قراءتُه تُحفظ للمنظّمة النشطة: يُقرأ في منظّمة المالك
 * ‏فيعود غيرَ مقروءٍ في غيرها، ويُطفئه عضوٌ في منظّمته بمرجعٍ يخمّنه (المعرّفاتُ متتالية).
 */
describe('مراجعة D-317: قراءةُ إشعار الأمان لصاحبه لا للمنظّمة', () => {
  it('يُقرأ مرّةً فيُطفأ في كلّ منظّمة، ولا يُطفئه غيرُ صاحبه', async () => {
    db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'ب', 'team')`)
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, target, detail, by_email)
      VALUES ('org_owner', 'panel', 'security.notice', 'other', 'session.new (x)', 'milestonesimpact@gmail.com')`)
    const id = (db.raw.prepare(`SELECT id FROM audit_log WHERE action = 'security.notice' ORDER BY id DESC LIMIT 1`).get() as { id: number }).id
    const viewer = { email: 'milestonesimpact@gmail.com', handle: 'mine' }
    const owners = await unreadNotices(db, 'org_owner', [], viewer)
    expect(await unreadNotices(db, 'org_b', [], viewer)).toBe(owners)

    // ‏عضوٌ في org_b يرسل مرجعَ إشعار المالك: لا يُحفظ
    expect(await markRead(db, 'org_b', [`security:${id}`], 'v@example.com')).toBe(0)
    expect(await unreadNotices(db, 'org_b', [], viewer)).toBe(owners)

    // ‏والمالكُ يقرؤه في منظّمته فيُطفأ في الأخرى أيضًا
    expect(await markRead(db, 'org_owner', [`security:${id}`], 'milestonesimpact@gmail.com')).toBe(1)
    expect(await unreadNotices(db, 'org_owner', [], viewer)).toBe(owners - 1)
    expect(await unreadNotices(db, 'org_b', [], viewer)).toBe(owners - 1)
    expect((await readMarks(db, 'org_b', viewer.email)).map((r) => r.ref)).toContain(`security:${id}`)
  })
})

describe('إشعاراتُ الذاكرة: النبضُ والسقف', () => {
  const now = new Date('2026-11-04T12:00:00Z')
  it('دورةٌ متأخّرةٌ ضعفَ مدّتها تُنذر، والتي في موعدها لا', () => {
    // ‏التجديدُ كلَّ ربع ساعة: ساعتان بلا نبضٍ تأخّرٌ ضعفَ المدّة وزيادة؛ والنشرُ بلا موعدٍ (طابور) فلا يتأخّر
    const late = pulses([{ job: 'renew', at: '2026-11-04 10:00:00', outcome: 'ok', detail: '' }], now)
    const notes = memoryNotices(late, null, now)
    expect(notes.map((n) => n.kind)).toEqual(['pulse'])
    expect(notes[0]!.text).toContain('لم تدُر')
    // ‏وبطاقةُ «هل الآلة تعمل؟» في الإعدادات لا في الرئيسيّة (D-435)
    expect(notes[0]!.href).toBe('/panel/settings#machine')
    const fresh = pulses([{ job: 'renew', at: '2026-11-04 11:55:00', outcome: 'ok', detail: '' }], now)
    expect(memoryNotices(fresh, null, now)).toEqual([])
  })

  it('السقفُ المبلوغ إشعارٌ بمرجع اليوم، وتحتَه لا شيء', () => {
    const settings = { dailySpendCapUsd: 5 } as never
    const at = memoryNotices([], { settings, usage: { spend: 5.2 } as never }, now)
    expect(at.map((n) => n.ref)).toEqual(['budget:2026-11-04'])
    expect(memoryNotices([], { settings, usage: { spend: 1 } as never }, now)).toEqual([])
  })
})
