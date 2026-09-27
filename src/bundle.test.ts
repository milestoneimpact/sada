/**
 * العاملُ **كما يُشحَن** لا كما يُختبَر (D-160).
 *
 * كلُّ اختبارٍ آخر هنا يستورد الوحداتِ في Node واحدةً واحدة، فيُقيَّم كلٌّ
 * منها بترتيب استيراد الاختبار. **والعاملُ الحقيقيُّ حزمةٌ واحدة** يرتّبها
 * esbuild من `src/index.ts`، والترتيبان يفترقان حين يدور الاستيراد: قيمةٌ
 * تُقرأ قبل أن تُسنَد تكون `undefined` في الحزمة وسليمةً في الاختبار.
 *
 * وهذا ما وقع: `${B64URL_SCRIPT}` طُبع «undefined» في رأس سكربت الدخول
 * بمفتاح المرور وسكربت اللوحة، فرمى كلاهما عند التحميل، **وزرُّ «الدخول
 * بمفتاح المرور» لا يفعل شيئًا** — والاختباراتُ ‏١٨٥٩ خضراء.
 *
 * فهنا تُبنى الحزمةُ بخيارات wrangler نفسِها، وتُستورَد، وتُطلَب صفحاتُها،
 * وتُشغَّل سكربتاتُها في سياقٍ معزول: **الزرُّ يُضغَط والطلبُ يُرسَل**.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toBase64 } from './lib/crypto'
import { fakeDb, fakeKv } from './test/fakes'

interface Worker {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>
}

const ORIGIN = 'https://sada2.basserh.com'
const TOKEN = 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e'
const CTX = { waitUntil() {}, passThroughOnException() {}, props: {} }

let dir = ''
let worker: Worker

beforeAll(async () => {
  /*
   * خياراتُ `wrangler deploy` كما في `bundleWorker`: ESM، والشروطُ الثلاثة،
   * و`keepNames`. **والترتيبُ هو ما يُقاس** — وهو من رسم الاستيراد لا من
   * الخيارات، فالحزمةُ هنا والمنشورةُ ترتّبان الوحداتِ ترتيبًا واحدًا.
   */
  const result = await build({
    entryPoints: [join(__dirname, 'index.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2024',
    platform: 'browser',
    conditions: ['workerd', 'worker', 'browser'],
    keepNames: true,
    external: ['__STATIC_CONTENT_MANIFEST', 'cloudflare:*', 'node:*'],
    logLevel: 'silent',
  })
  dir = mkdtempSync(join(tmpdir(), 'sada-bundle-'))
  const file = join(dir, 'index.mjs')
  writeFileSync(file, result.outputFiles[0]!.contents)
  worker = ((await import(pathToFileURL(file).href)) as { default: Worker }).default
}, 60_000)

afterAll(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})

function env(db = fakeDb()): Record<string, unknown> {
  return {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: ORIGIN,
    DRIVE_FOLDER_ID: 'folder',
    DB: db,
    KV: fakeKv(),
    TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
    ADMIN_TOKEN: TOKEN,
  }
}

/** السكربتاتُ السطريّةُ في الصفحة — ما يُكتب بين الوسمين لا ما يُجلَب. */
function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script nonce="[^"]*">([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
}

/**
 * وثيقةٌ فارغة: لا عنصرَ يوجد. **وهي أقسى ما يُشغَّل عليه سكربت**: ما يرمي
 * قبل أن يسأل عن عنصرٍ يرمي هنا، وما يسأل ثمّ يتراجع حين لا يجده يمرّ.
 */
function emptyDocument(): Record<string, unknown> {
  return {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    documentElement: { dataset: {}, setAttribute() {}, removeAttribute() {} },
    body: null,
    activeElement: null,
  }
}

function browserGlobals(document: Record<string, unknown>): Record<string, unknown> {
  const storage = { getItem: () => null, setItem() {}, removeItem() {} }
  const window: Record<string, unknown> = {
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  }
  return {
    window, document, localStorage: storage, sessionStorage: storage,
    location: { href: `${ORIGIN}/panel`, hash: '', pathname: '/panel', search: '' },
    history: { replaceState() {} }, navigator: {},
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, btoa, atob, console,
  }
}

describe('الحزمةُ المشحونة', () => {
  it('صفحةُ الدخول: لا سكربتَ يبدأ بقيمةٍ لم تُسنَد بعد', async () => {
    const db = fakeDb()
    db.raw.prepare(
      `INSERT INTO passkeys (id, credential_id, public_key, alg, label, rp_id)
       VALUES ('pk1', 'AQIDBA', 'x', -7, 'الحاسوب', 'sada2.basserh.com')`,
    ).run()
    const response = await worker.fetch(new Request(`${ORIGIN}/panel`), env(db), CTX)
    const html = await response.text()
    expect(html).toContain('id="pk-login"')

    const scripts = inlineScripts(html)
    for (const script of scripts) expect(script).not.toMatch(/(^|[\s;(,=+])undefined\b(?![.'"])/)
    const login = scripts.find((s) => s.includes('pk-login'))
    expect(login).toBeDefined()
    expect(login).toContain('var sadaB64=')
  })

  it('زرُّ «الدخول بمفتاح المرور» يُضغَط فيطلب التحدّي ويرسل التوقيع', async () => {
    const db = fakeDb()
    db.raw.prepare(
      `INSERT INTO passkeys (id, credential_id, public_key, alg, label, rp_id)
       VALUES ('pk1', 'AQIDBA', 'x', -7, 'الحاسوب', 'sada2.basserh.com')`,
    ).run()
    const html = await (await worker.fetch(new Request(`${ORIGIN}/panel`), env(db), CTX)).text()
    const login = inlineScripts(html).find((s) => s.includes('pk-login'))!

    const clicks: Array<() => void> = []
    const node = (): Record<string, unknown> => ({
      disabled: false,
      textContent: '',
      setAttribute() {},
      removeAttribute() {},
      addEventListener(type: string, fn: () => void) { if (type === 'click') clicks.push(fn) },
    })
    const button = node()
    const note = node()
    const document = { ...emptyDocument(), getElementById: (id: string) =>
      id === 'pk-login' ? button : id === 'pk-note' ? note : null }
    const globals = browserGlobals(document)
    const sent: Array<{ url: string; body: string }> = []
    const bytes = (n: number) => new Uint8Array(n).fill(7).buffer

    ;(globals['window'] as Record<string, unknown>)['PublicKeyCredential'] = function PublicKeyCredential() {}
    globals['fetch'] = async (url: string, init: { body?: string } = {}) => {
      sent.push({ url, body: init.body ?? '' })
      if (url === '/panel/passkey/challenge') {
        return new Response(JSON.stringify({
          ticket: 't-1', challenge: 'AAECAwQFBgcICQoLDA0ODw', rpId: 'sada2.basserh.com',
          allowCredentials: ['AQIDBA'],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    let asked: { publicKey: { challenge: Uint8Array; rpId: string } } | null = null
    globals['navigator'] = {
      credentials: {
        get: async (options: typeof asked) => {
          asked = options
          return {
            id: 'AQIDBA',
            response: { authenticatorData: bytes(37), clientDataJSON: bytes(20), signature: bytes(64) },
          }
        },
      },
    }

    runInNewContext(login, globals)
    expect(clicks).toHaveLength(1)
    clicks[0]!()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(sent.map((s) => s.url)).toEqual(['/panel/passkey/challenge', '/panel/passkey/login'])
    expect(asked!.publicKey.rpId).toBe('sada2.basserh.com')
    expect(asked!.publicKey.challenge.length).toBe(16)
    const body = JSON.parse(sent[1]!.body) as Record<string, string>
    expect(body['ticket']).toBe('t-1')
    expect(body['credentialId']).toBe('AQIDBA')
    expect(body['signature']).toMatch(/^[A-Za-z0-9_-]+$/)
    expect((globals['location'] as { href: string }).href).toBe('/panel')
  })

  it.each([
    ['تحدٍّ مردودٌ بحدّ المحاولات', { challenge: 429, code: 'rate_limited' }, 'محاولاتٌ كثيرة'],
    ['نافذةُ المفتاح أُغلقت', { reject: 'NotAllowedError' }, 'أُلغي الطلب أو انتهت مهلتُه'],
    ['توقيعٌ لم يُقبَل', { login: 401, code: 'denied' }, 'لم يُقبَل المفتاح'],
    ['تذكرةٌ انتهت مهلتُها', { login: 400, code: 'challenge_expired' }, 'انتهت مهلةُ الطلب'],
  ])('%s: رسالةٌ عربيّة، والزرُّ يعود', async (_name, fault, text) => {
    const db = fakeDb()
    db.raw.prepare(
      `INSERT INTO passkeys (id, credential_id, public_key, alg, label, rp_id)
       VALUES ('pk1', 'AQIDBA', 'x', -7, 'الحاسوب', 'sada2.basserh.com')`,
    ).run()
    const html = await (await worker.fetch(new Request(`${ORIGIN}/panel`), env(db), CTX)).text()
    const login = inlineScripts(html).find((s) => s.includes('pk-login'))!

    const clicks: Array<() => void> = []
    const node = (): Record<string, unknown> => ({
      disabled: false, textContent: 'الدخول بمفتاح المرور', setAttribute() {}, removeAttribute() {},
      addEventListener(type: string, fn: () => void) { if (type === 'click') clicks.push(fn) },
    })
    const button = node()
    const note = node()
    const globals = browserGlobals({ ...emptyDocument(), getElementById: (id: string) =>
      id === 'pk-login' ? button : id === 'pk-note' ? note : null })
    const f = fault as { challenge?: number; login?: number; code?: string; reject?: string }
    ;(globals['window'] as Record<string, unknown>)['PublicKeyCredential'] = function PublicKeyCredential() {}
    globals['fetch'] = async (url: string) => {
      const status = url === '/panel/passkey/challenge' ? f.challenge : f.login
      if (status !== undefined) return new Response(JSON.stringify({ error: f.code }), { status })
      return new Response(JSON.stringify({
        ticket: 't', challenge: 'AAECAwQFBgcICQoLDA0ODw', rpId: 'sada2.basserh.com', allowCredentials: ['AQIDBA'],
      }), { status: 200 })
    }
    globals['navigator'] = {
      credentials: {
        get: async () => {
          if (f.reject !== undefined) throw Object.assign(new Error('x'), { name: f.reject })
          const b = new Uint8Array(8).buffer
          return { id: 'AQIDBA', response: { authenticatorData: b, clientDataJSON: b, signature: b } }
        },
      },
    }

    runInNewContext(login, globals)
    clicks[0]!()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(note['textContent']).toContain(text)
    expect(note['textContent']).not.toMatch(/[A-Z][a-z]+Error/)
    expect(button['disabled']).toBe(false)
    expect(button['textContent']).toBe('الدخول بمفتاح المرور')
  })

  it('أصلا اللوحة يُشغَّلان في وثيقةٍ فارغة بلا خطأ', async () => {
    const e = env()
    const body = new FormData()
    body.set('token', TOKEN)
    const login = await worker.fetch(
      new Request(`${ORIGIN}/panel/login`, { method: 'POST', body }), e, CTX,
    )
    expect(login.status).toBe(303)
    const cookie = (login.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const html = await (await worker.fetch(
      new Request(`${ORIGIN}/panel`, { headers: { Cookie: cookie } }), e, CTX,
    )).text()

    const paths = [...html.matchAll(/<script nonce="[^"]*" src="(\/a\/[up]\.[0-9a-f]{8}\.js)">/g)].map((m) => m[1]!)
    expect(paths.sort()).toEqual([expect.stringMatching(/^\/a\/p\./), expect.stringMatching(/^\/a\/u\./)])
    for (const path of paths) {
      const script = await (await worker.fetch(new Request(`${ORIGIN}${path}`), e, CTX)).text()
      expect(script.trimStart().startsWith('undefined')).toBe(false)
      expect(() => runInNewContext(script, browserGlobals(emptyDocument())), path).not.toThrow()
    }
    for (const script of inlineScripts(html)) {
      expect(() => runInNewContext(script, browserGlobals(emptyDocument()))).not.toThrow()
    }
  })
})
