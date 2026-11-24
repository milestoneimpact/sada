/**
 * ملفُّ حال الخطّة في المستودع (D-390): يُبنى من القاعدة بمنظّمته، ويُكتب مجمَّعًا (مرّةً كلّ بضع دقائق على الأكثر)،
 * ولا يرمي ولا يمسّ النشر، ولا يحمل رمزًا ولا نصَّ ردّ منصّة، و«يلزم إذن الكتابة» حين الرمزُ للقراءة.
 */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { buildStatus, failReason, flushRepoStatus, MIN_GAP_MINUTES, needsWrite, readSyncRows, statusPath } from './statusFile'
import { base64Utf8, putFile } from './github'

const TOKEN = 'ghp_SECRETSECRETSECRETSECRET1234'
const repo = { owner: 'o', repo: 'r', branch: 'main', token: TOKEN }

function seed(org = 'org_owner') {
  const db = fakeDb()
  const s = (q: string, ...a: unknown[]): void => { db.raw.prepare(q).run(...(a as never[])) }
  for (const o of [org, 'org_b']) {
    const p = o === org ? 'A' : 'B'
    s("INSERT INTO accounts (id, platform, kind, external_id, display_name, status, org_id) VALUES (?, 'x', 'member', ?, 'س', 'active', ?)", 'acc' + p, 'e' + p, o)
    s("INSERT INTO plans (id, week_start, plan_json, model, status, org_id, span, period) VALUES (?, '2026-12', '{\"items\":[]}', 'm', 'draft', ?, 'month', '2026-12')", 'plan' + p, o)
    s("INSERT INTO import_jobs (id, org_id, source_kind, content_hash, period, status, plan_id) VALUES (?, ?, 'github', ?, '2026-12', 'applied', ?)", 'ij' + p, o, 'hash' + p, 'plan' + p)
    for (const [n, day] of [[1, '2026-12-01 20:00'], [2, '2026-12-02 20:00'], [3, '2026-12-03 20:00'], [4, '2026-12-04 20:00']] as const) {
      s("INSERT INTO plan_items (id, org_id, plan_id, item_key, platform, due_local, kind, copy, content_hash, source_kind) VALUES (?, ?, ?, ?, 'x', ?, 'text', 'نص', 'h', 'github')",
        `pi${p}${n}`, o, 'plan' + p, 'd0' + n, day)
    }
  }
  s("INSERT INTO plan_versions (id, plan_id, version, plan_json, locked_by, locked_at, org_id) VALUES ('pvA', 'planA', 2, '{}', 'owner@example.com', '2026-11-25 10:00:00', ?)", org)
  const post = (id: string, item: string, status: string): void => s(
    `INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, approved_by, approved_at, scheduled_at, plan_id, plan_item_id, org_id)
     VALUES (?, 'accA', 'x', 'text', 'نص', ?, ?, 'owner@example.com', '2026-11-25 10:00:00', '2026-12-01 17:00:00', 'planA', ?, ?)`, id, status, 'k' + id, item, org)
  post('p1', 'piA1', 'published')
  post('p2', 'piA2', 'failed')
  post('p3', 'piA3', 'queued')
  s(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, platform_post_id, status, at, org_id)
     VALUES ('a1', 'p1', 'kp1', 1, '{}', '{}', '1999', 'succeeded', '2026-12-01 17:00:05', ?)`, org)
  s(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, at, org_id)
     VALUES ('a2', 'p2', 'kp2', 1, ?, ?, 'failed', '2026-12-02 17:00:05', ?)`,
  JSON.stringify({ Authorization: 'Bearer ' + TOKEN }), JSON.stringify({ status: 401, body: 'invalid token ' + TOKEN, access_token: 'at_LEAK' }), org)
  return db
}

interface Call { url: string; method: string; body: Record<string, unknown> | null; auth: string | null }
function github(replies: ((c: Call) => Response)[]) {
  const calls: Call[] = []
  const impl = (async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    const c: Call = { url: String(url), method: init?.method ?? 'GET', body: init?.body === undefined ? null : JSON.parse(String(init.body)), auth: h.get('Authorization') }
    calls.push(c)
    const r = replies.shift()
    return r === undefined ? new Response('{}', { status: 500 }) : r(c)
  }) as typeof fetch
  return { calls, impl }
}
const ok = (sha: string) => (): Response => new Response(JSON.stringify({ content: { sha } }), { status: 201 })
const decoded = (c: Call): Record<string, unknown> => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(String(c.body!['content'])), (x) => x.charCodeAt(0))))

describe('الحال من القاعدة', () => {
  it('استُورد ← اعتُمد (من، متى، الإصدار) ← جُدول ← نُشر برابطه أو تعثّر بسببٍ بلا أسرار — ومنظّمتُه وحدها', async () => {
    const db = seed()
    const st = (await buildStatus(db, 'org_owner', '2026-12'))!
    expect(st.stage).toBe('published')
    expect(st.imported).toMatchObject({ hash: 'hashA', source: 'github' })
    expect(st.approved).toEqual({ by: 'owner@example.com', at: '2026-11-25 10:00:00', version: 2 })
    expect(st.checked?.items).toBe(4)
    expect(st.scheduled).toEqual({ items: 3 })
    expect(st.items.map((i) => [i.key, i.state])).toEqual([['d01', 'published'], ['d02', 'failed'], ['d03', 'scheduled'], ['d04', 'draft']])
    expect(st.items[0]).toMatchObject({ url: 'https://x.com/i/web/status/1999', published_at: '2026-12-01 17:00:05' })
    expect(st.items[1]!.reason).toBe('رفضت المنصّة الإذن — أعد ربط الحساب في صدى')
    const text = JSON.stringify(st)
    for (const secret of [TOKEN, 'at_LEAK', 'Bearer', 'invalid token']) expect(text).not.toContain(secret)
    // ‏منظّمةٌ أخرى ترى خطّتها وحدها: بلا اعتمادٍ ولا منشور
    const other = (await buildStatus(db, 'org_b', '2026-12'))!
    expect(other.imported?.hash).toBe('hashB')
    expect(other.approved).toBeNull()
    expect(other.items.every((i) => i.state === 'draft')).toBe(true)
    expect(await buildStatus(db, 'org_owner', '2027-01')).toBeNull()
  })

  it('سببُ التعثّر من رمز الحالة وحده', () => {
    expect(failReason(429)).toMatch(/حدَّ/)
    expect(failReason(503)).toBe('عطلٌ عند المنصّة (HTTP 503)')
    expect(failReason(null)).toBe('تعذّر النشر — التفاصيل في صدى')
    expect(statusPath('social-media', '2026-12')).toBe('social-media/plans/2026-12.status.json')
    expect(statusPath('', '2026-12')).toBe('plans/2026-12.status.json')
    expect(atob(base64Utf8('صدى'))).toHaveLength(6)
  })
})

describe('الكتابةُ المجمَّعة', () => {
  const now = new Date('2026-12-02T18:00:00Z')

  it('يكتب مرّةً بـ PUT، ولا يعيد الحالَ نفسَه، وما تغيّر خلال الفاصل ينتظر ثمّ يُكتب بـ sha السابق', async () => {
    const db = seed()
    const g = github([ok('sha1'), ok('sha2')])
    const base = { db, org: 'org_owner', repo, root: 'social-media', fetchImpl: g.impl }
    expect((await flushRepoStatus({ ...base, now })).written).toEqual(['2026-12'])
    expect(g.calls[0]).toMatchObject({ method: 'PUT', url: 'https://api.github.com/repos/o/r/contents/social-media/plans/2026-12.status.json' })
    expect(g.calls[0]!.body).toMatchObject({ branch: 'main' })
    expect(g.calls[0]!.body!['sha']).toBeUndefined()
    expect(decoded(g.calls[0]!)).toMatchObject({ format: 'sada-plan-status/1', period: '2026-12', stage: 'published' })
    // ‏الرمزُ في الترويسة وحدها، لا في الجسم
    expect(JSON.stringify(g.calls[0]!.body)).not.toContain(TOKEN)
    // ‏الحالُ نفسُه: لا نداء
    expect((await flushRepoStatus({ ...base, now: new Date(now.getTime() + 60 * 60_000) })).unchanged).toEqual(['2026-12'])
    expect(g.calls).toHaveLength(1)
    // ‏أحداثٌ كثيرة خلال الفاصل: تُعلَّم ولا تُكتب
    db.raw.prepare("UPDATE posts SET status = 'published' WHERE id = 'p3'").run()
    db.raw.prepare("UPDATE repo_status_sync SET last_written_at = ? WHERE org_id = 'org_owner'").run('2026-12-02 18:00:00')
    for (let m = 0; m < MIN_GAP_MINUTES; m++) {
      expect((await flushRepoStatus({ ...base, now: new Date(now.getTime() + m * 60_000) })).waiting).toEqual(['2026-12'])
    }
    expect(g.calls).toHaveLength(1)
    expect((await readSyncRows(db, 'org_owner'))[0]!.dirty).toBe(1)
    // ‏وبعد الفاصل كتابةٌ واحدة بـ sha السابق
    expect((await flushRepoStatus({ ...base, now: new Date(now.getTime() + MIN_GAP_MINUTES * 60_000) })).written).toEqual(['2026-12'])
    expect(g.calls).toHaveLength(2)
    expect(g.calls[1]!.body!['sha']).toBe('sha1')
    const row = (await readSyncRows(db, 'org_owner'))[0]!
    expect(row).toMatchObject({ last_sha: 'sha2', dirty: 0, last_error: null, needs_write: 0 })
    // ‏ومنظّمةٌ أخرى لم تُمسّ
    expect(await readSyncRows(db, 'org_b')).toEqual([])
  })

  it('sha لا يطابق (409): يُقرأ الحاليُّ ويُعاد مرّةً واحدة', async () => {
    const g = github([() => new Response('{}', { status: 409 }), () => new Response(JSON.stringify({ sha: 'cur' }), { status: 200 }), ok('sha3')])
    const out = await putFile(repo, 'plans/2026-12.status.json', '{}', 'm', 'old', g.impl)
    expect(out).toEqual({ kind: 'written', sha: 'sha3' })
    expect(g.calls.map((c) => c.method)).toEqual(['PUT', 'GET', 'PUT'])
    expect(g.calls[2]!.body!['sha']).toBe('cur')
  })

  it('رمزٌ للقراءة (403): «يلزم إذن الكتابة»، ويُسجَّل بلا رمز، ولا يرمي', async () => {
    const db = seed()
    const g = github([() => new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), { status: 403 })])
    const out = await flushRepoStatus({ db, org: 'org_owner', repo, root: '', now, fetchImpl: g.impl })
    expect(out.failed).toEqual(['2026-12'])
    const rows = await readSyncRows(db, 'org_owner')
    expect(needsWrite(rows)).toBe(true)
    expect(rows[0]).toMatchObject({ dirty: 1, needs_write: 1 })
    expect(rows[0]!.last_error).toMatch(/Contents: write/)
    expect(JSON.stringify(rows)).not.toContain(TOKEN)
  })

  it('عطلُ GitHub (شبكةٌ أو 500) لا يرمي ولا يمسّ منشورًا ولا طابورًا', async () => {
    const db = seed()
    const before = db.raw.prepare('SELECT id, status, scheduled_at FROM posts ORDER BY id').all()
    const boom = (async () => { throw new Error('network down ' + TOKEN) }) as unknown as typeof fetch
    const out = await flushRepoStatus({ db, org: 'org_owner', repo, root: '', now, fetchImpl: boom })
    expect(out.failed).toEqual(['2026-12'])
    const rows = await readSyncRows(db, 'org_owner')
    expect(rows[0]).toMatchObject({ dirty: 1, needs_write: 0 })
    expect(rows[0]!.last_error).not.toContain(TOKEN)
    expect(db.raw.prepare('SELECT id, status, scheduled_at FROM posts ORDER BY id').all()).toEqual(before)
    const g = github([() => new Response('{}', { status: 500 })])
    expect((await flushRepoStatus({ db, org: 'org_owner', repo, root: '', now, fetchImpl: g.impl })).failed).toEqual(['2026-12'])
    const attempts = db.raw.prepare("SELECT attempts FROM repo_status_sync WHERE org_id = 'org_owner'").get() as { attempts: number }
    expect(attempts.attempts).toBe(2)
  })
})
