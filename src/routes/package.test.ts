/**
 * مساراتُ حزمة المحتوى (D-366): الويب هوك عامٌّ يُحكم بالتوقيع ويضع رسالةً في الطابور، والشاشةُ تُرسم بلا سكربت للمالكة.
 */
import { describe, expect, it } from 'vitest'
import { emailLogin, fakeMailer } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { rotateHookSecret, saveSource } from '../lib/package/sync'
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
})
