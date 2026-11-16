/**
 * مساراتُ حزمة المحتوى (D-366): الويب هوك عامٌّ يُحكم بالتوقيع ويضع رسالةً في الطابور، والشاشةُ تُرسم بلا سكربت للمالكة.
 */
import { describe, expect, it } from 'vitest'
import { emailLogin, fakeMailer } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { readSource, rotateHookSecret, saveSource } from '../lib/package/sync'
import { listRevisions, revisePackage } from '../lib/package/revision'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from '../index'

function setup() {
  const db = fakeDb()
  const sent: unknown[] = []
  const env = {
    SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'folder', DB: db, KV: fakeKv(),
    TOKEN_ENC_KEY: toBase64(new Uint8Array(32).fill(3)), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e', EMAIL: fakeMailer(),
    GENERATE_QUEUE: { send: async (m: unknown) => { sent.push(m) } },
  }
  return { db, env, sent }
}

async function sign(secret: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return 'sha256=' + [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map((x) => x.toString(16).padStart(2, '0')).join('')
}

describe('ويب هوك GitHub', () => {
  it('توقيعٌ خاطئ 401 بلا رسالة، ودفعُ الفرع 202 برسالةٍ واحدة', async () => {
    const { db, env, sent } = setup()
    const id = await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'social-media-video', root: 'social-media' })
    const secret = await rotateHookSecret(db, env.TOKEN_ENC_KEY, 'org_owner', id)
    const body = JSON.stringify({ ref: 'refs/heads/social-media-video', after: 'a'.repeat(40) })
    const bad = await app.request(`/hooks/github/${id}`, { method: 'POST', body, headers: { 'X-GitHub-Event': 'push', 'X-Hub-Signature-256': await sign('x', body) } }, env)
    expect(bad.status).toBe(401)
    expect(sent).toHaveLength(0)
    const ok = await app.request(`/hooks/github/${id}`, { method: 'POST', body, headers: { 'X-GitHub-Event': 'push', 'X-Hub-Signature-256': await sign(secret, body) } }, env)
    expect(ok.status).toBe(202)
    expect(sent).toEqual([{ packageSync: { sourceId: id, after: 'a'.repeat(40) } }])
  })
})

describe('شاشة حزمة المحتوى', () => {
  it('تُرسم للمالكة بنموذج الربط، ومولّدُ السرّ يعرض عنوانَ البيئة نفسِها', async () => {
    const { db, env } = setup()
    const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
    const first = await (await app.request('/panel/package', { headers: { Cookie: cookie } }, env)).text()
    expect(first).toContain('حزمة المحتوى')
    expect(first).toContain('name="branch"')
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: '' })
    const csrf = /name="_csrf" value="([^"]+)"/.exec(await (await app.request('/panel/package', { headers: { Cookie: cookie } }, env)).text())![1]!
    const form = new FormData()
    form.set('_csrf', csrf)
    form.set('do', 'hook')
    const res = await app.request('/panel/package', { method: 'POST', body: form, headers: { Cookie: cookie } }, env)
    const page = await res.text()
    expect(page).toContain('https://sada2.basserh.com/hooks/github/pkg_')
    expect(page).not.toContain('https://sada.basserh.com/hooks')
  })

  it('«اختبر الرمز» يقول أيَّ الخطوتين نجحت وكيف يُصلح الفرع، ولا يطبع الرمز (D-376)', async () => {
    const { db, env } = setup()
    const withToken = { ...env, GITHUB_CONTENT_TOKEN: 'ghp_PRIVATE_VALUE' }
    const cookie = ((await emailLogin(app, withToken)).headers.get('Set-Cookie') ?? '').split(';')[0]!
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'nope', root: '' })
    const csrf = /name="_csrf" value="([^"]+)"/.exec(await (await app.request('/panel/package', { headers: { Cookie: cookie } }, withToken)).text())![1]!
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => new Response('{}', { status: String(input).includes('/branches/') ? 404 : 200 })) as typeof fetch
    try {
      const form = new FormData()
      form.set('_csrf', csrf)
      form.set('do', 'test')
      const page = await (await app.request('/panel/package', { method: 'POST', body: form, headers: { Cookie: cookie } }, withToken)).text()
      expect(page).toContain('المستودع: نجح')
      expect(page).toContain('الفرع: لم ينجح')
      expect(page).toContain('انسخ اسمَ الفرع')
      expect(page).not.toContain('ghp_PRIVATE_VALUE')
    } finally {
      globalThis.fetch = real
    }
  })

  it('خطّةٌ جديدة بحزمةٍ مربوطة تفتح «من حزمتك في GitHub»، و«ابنِ لي خطّة» باقٍ بطلبه (D-377)', async () => {
    const { db, env } = setup()
    const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: '' })
    const res = await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)
    expect(res.headers.get('Location')).toBe('/panel/plan/package')
    const page = await (await app.request('/panel/plan/package', { headers: { Cookie: cookie } }, env)).text()
    expect(page).toContain('نسخُ الحزمة')
    expect(page).toContain('/panel/plan/new?way=build')
    expect((await app.request('/panel/plan/new?way=build', { headers: { Cookie: cookie } }, env)).status).toBe(200)
  })
})

describe('«من حزمتك في GitHub» بعد المراجعة', () => {
  const DIR = join(__dirname, '../test/package')
  const PLAN = new Uint8Array(readFileSync(join(DIR, 'plan-v1.xlsx')))
  const COPY = readFileSync(join(DIR, 'copy-v1.md'), 'utf8')
  const files: Record<string, Uint8Array | string> = { '01-plan/خطة-النشر-شهر-v1.xlsx': PLAN, '02-copy/03-15-copy-v1.md': COPY }
  const github = (async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input))
    if (url.includes('/commits/')) return Response.json({ parents: [], commit: { message: 'نسخة' } })
    if (url.includes('/git/trees/')) return Response.json({ truncated: false, tree: Object.keys(files).map((p) => ({ path: 'social-media/' + p, type: 'blob', size: 1, sha: p.startsWith('02') ? 'copy1' : 'plan1' })) })
    for (const [p, body] of Object.entries(files)) if (url.includes('/contents/social-media/' + p + '?')) return new Response(typeof body === 'string' ? body : new Uint8Array(body))
    return new Response('', { status: 404 })
  }) as typeof fetch

  async function seeded() {
    const { db, env } = setup()
    const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: 'social-media' })
    const source = (await readSource(db, 'org_owner'))!
    await revisePackage({ db, token: 't', fetchImpl: github }, source, 'a'.repeat(40))
    const [old] = await listRevisions(db, 'org_owner')
    return { db, env, cookie, source, old: old! }
  }
  const get = async (env: object, cookie: string, path: string) => (await app.request(path, { headers: { Cookie: cookie } }, env)).text()

  it('أيُّ نسخةٍ بمعرّفها ولو خرجت من آخر ثلاثين، والمفقودةُ يُقال إنّها لم توجد', async () => {
    const { db, env, cookie, source, old } = await seeded()
    for (let i = 0; i < 31; i++) {
      await db.prepare(`INSERT INTO package_revisions (id, org_id, source_id, commit_sha, status, error_reason, summary_counts, attempts, retryable, created_at)
        VALUES (?, 'org_owner', ?, ?, 'failed', 'x', '{}', 1, 0, '2099-01-01 00:00:00')`).bind('rev_f' + i, source.id, 'f' + String(i).padStart(39, '0')).run()
    }
    const page = await get(env, cookie, '/panel/plan/package?rev=' + old.id)
    expect(page).toContain('هذا ما فهمته')
    expect(page).not.toContain('لم نجد النسخةَ المطلوبة')
    expect(await get(env, cookie, '/panel/plan/package?rev=rev_nothere')).toContain('لم نجد النسخةَ المطلوبة في حزمتك')
  })

  it('«تابع التحديث تلقائيًّا» يُحفظ وحده ولا يبني شيئًا', async () => {
    const { db, env, cookie, old } = await seeded()
    const page = await get(env, cookie, '/panel/plan/package?rev=' + old.id)
    const csrf = /name="_csrf" value="([^"]+)"/.exec(page)![1]!
    const count = async () => (await db.prepare("SELECT COUNT(*) AS n FROM package_revisions").first<{ n: number }>())!.n
    const before = await count()
    const form = new FormData()
    form.set('_csrf', csrf)
    form.set('do', 'follow')
    form.set('rev', old.id)
    const res = await app.request('/panel/plan/package', { method: 'POST', body: form, headers: { Cookie: cookie } }, env)
    expect(res.status).toBe(303)
    expect((await readSource(db, 'org_owner'))!.followUpdates).toBe(false)
    expect(await count()).toBe(before)
  })

  it('روابطُ «خطّة جديدة» بمعاملاتها تفتح كما كانت، والعاريةُ وحدها تتحوّل', async () => {
    const { env, cookie } = await seeded()
    const bare = await app.request('/panel/plan/new', { headers: { Cookie: cookie } }, env)
    expect(bare.headers.get('Location')).toBe('/panel/plan/package')
    for (const q of ['?picked=src_1', '?idea=abc', '?way=build']) {
      expect((await app.request('/panel/plan/new' + q, { headers: { Cookie: cookie } }, env)).status).toBe(200)
    }
  })
})

describe('تبويبُ «حزمة المحتوى» في الرافدة', () => {
  it('للمالك يظهر، وشارتُه عددُ ما ينتظر قرارك من تغييرات الحزمة', async () => {
    const { db, env } = setup()
    const cookie = ((await emailLogin(app, env)).headers.get('Set-Cookie') ?? '').split(';')[0]!
    const rail = async () => {
      const page = await (await app.request('/panel/accounts', { headers: { Cookie: cookie } }, env)).text()
      const at = page.indexOf('href="/panel/package"')
      return at < 0 ? null : page.slice(at, page.indexOf('</a>', at))
    }
    expect(await rail()).toContain('حزمة المحتوى')
    expect(await rail()).not.toMatch(/class="count/)
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: '' })
    const { packageNav } = await import('../lib/package/revision')
    expect(await packageNav(db, 'org_owner')).toEqual({ linked: true, awaiting: 0 })
    expect(await packageNav(db, 'org_other')).toEqual({ linked: false, awaiting: 0 })
  })
})
