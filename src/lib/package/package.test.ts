/**
 * حزمةُ المحتوى (D-366): التصنيفُ والاختيارُ على أسماء الحزمة الحقيقيّة، وعميلُ GitHub والمزامنةُ والويب هوك بـ fetch مزيّف — بلا شبكة.
 */
import { describe, expect, it } from 'vitest'
import { PACKAGE_PATHS } from '../../test/packageTree'
import { fakeDb, fakeKv } from '../../test/fakes'
import { toBase64 } from '../crypto'
import { classifyPath, underRoot } from './classify'
import { packageRefFor, pickMedia, type PackageFile } from './pick'
import { branchHead, listTree } from './github'
import { checkSource, currentPicks, firstDelivery, hookTooLarge, judgeHook, readPackageMedia, readSource, rotateHookSecret, saveSource, syncPackage, tokenFor, tokenReadyFor } from './sync'
import type { StreamBucket } from './media'

const ROOT = 'social-media'
const sha = (s: string): string => {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(8, '0').repeat(5)
}

function files(): PackageFile[] {
  return PACKAGE_PATHS.flatMap((p) => {
    const rel = underRoot(p, ROOT)!
    const c = classifyPath(rel)
    if (c.role !== 'media' && c.role !== 'cover') return []
    return [{ path: rel, blobSha: sha(p), size: 1, role: c.role, itemNo: c.itemNo, variant: c.variant, version: c.version ?? 0, hasSound: c.hasSound, r2Key: 'k' }]
  })
}

describe('التصنيف على ملفّات الحزمة الحقيقيّة', () => {
  it('أدواتُ الصنع تُتجاهل، والخطّةُ والنصوصُ والسيناريوهاتُ بأدوارها', () => {
    const role = (p: string) => classifyPath(underRoot(p, ROOT)!).role
    for (const p of PACKAGE_PATHS.filter((x) => /\/(engine|audio|brand|tools)\//.test(x) || x.endsWith('README.md'))) expect(role(p), p).toBe('ignored')
    expect(role('social-media/01-plan/خطة-النشر-شهر-v1.xlsx')).toBe('plan')
    expect(role('social-media/02-copy/03-15-copy-v1.md')).toBe('copy')
    expect(role('social-media/03-scripts/01-opening-v3.md')).toBe('script')
    expect(role('social-media/04-media/01-opening/01-opening-v1.html')).toBe('ignored')
    expect(role('social-media/04-media/01-opening/fonts/noto-kufi-arabic-arabic-200-normal.woff2')).toBe('ignored')
  })

  it('الغلافُ العامّ «overview» غلافٌ بلا مادّة', () => {
    expect(classifyPath('04-media/03-15-overview-v1.png')).toMatchObject({ role: 'cover', itemNo: null })
  })

  it('ما خارج المجلّد الجذر لا يُرى', () => {
    expect(underRoot('milestones-impact/README.md', ROOT)).toBeNull()
  })
})

describe('الاختيار: الأحدثُ بالصوت', () => {
  it('المادّة 06 تختار v2 بالصوت باللونين وأغلفةَ v1', () => {
    const picks = pickMedia(files()).filter((p) => p.itemNo === '06')
    expect(picks.map((p) => [p.variant, p.video?.path.split('/').pop(), p.cover?.path.split('/').pop()])).toEqual([
      ['dark', '06-impact-chain-v2-dark-sound-1080x1080.mp4', '06-impact-chain-v1-dark-cover.png'],
      ['light', '06-impact-chain-v2-light-sound-1080x1080.mp4', '06-impact-chain-v1-light-cover.png'],
    ])
    expect(picks[0]!.superseded.map((f) => f.path.split('/').pop())).toContain('06-impact-chain-v1-dark-1080x1080.mp4')
  })

  it('الموادّ 01..15 تعطي ثلاثين مقطعًا معتمدًا كلُّها بالصوت', () => {
    const picks = pickMedia(files())
    expect(picks).toHaveLength(30)
    expect(picks.every((p) => p.video !== null && p.video.hasSound)).toBe(true)
    expect(new Set(picks.map((p) => p.itemNo)).size).toBe(15)
    expect(picks.find((p) => p.itemNo === '01' && p.variant === 'dark')!.video!.version).toBe(4)
    expect(picks.find((p) => p.itemNo === '01' && p.variant === 'dark')!.cover!.version).toBe(3)
  })

  it('المقطعُ لمنصّات المقاطع، والغلافُ لـ X وLinkedIn بلونهما الافتراضيّ', () => {
    const picks = pickMedia(files())
    const d = picks.find((p) => p.itemNo === '06' && p.variant === 'dark')!
    const l = picks.find((p) => p.itemNo === '06' && p.variant === 'light')!
    expect(packageRefFor(picks, '06', 'x', null)).toBe('g:' + d.cover!.blobSha)
    expect(packageRefFor(picks, '06', 'linkedin', null)).toBe('g:' + l.cover!.blobSha)
    expect(packageRefFor(picks, '06', 'instagram', null)).toBe('g:' + d.video!.blobSha)
    expect(packageRefFor(picks, '99', 'x', null)).toBeNull()
  })
})

// ── GitHub مزيّف ───────────────────────────────────────────────────────

const HEAD = 'a'.repeat(40)
const TREE = 'b'.repeat(40)

interface Fake { calls: string[]; fetch: typeof fetch }

function github(opts: { etag?: string; head?: string; truncated?: boolean } = {}): Fake {
  const calls: string[] = []
  const head = opts.head ?? HEAD
  const blobs = [...PACKAGE_PATHS, 'milestones-impact/README.md'].map((p) => ({ path: p, type: 'blob', sha: sha(p), size: 2048 }))
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push(url)
    const h = new Headers(init?.headers)
    if (!/^Bearer /.test(h.get('Authorization') ?? '')) return new Response('', { status: 401 })
    if (url.includes('/branches/')) {
      if (opts.etag !== undefined && h.get('If-None-Match') === opts.etag) return new Response(null, { status: 304 })
      return Response.json({ commit: { sha: head, commit: { tree: { sha: TREE } } } }, { headers: { ETag: '"e1"' } })
    }
    if (url.includes('/git/trees/')) {
      if (url.includes('recursive=1')) return Response.json({ truncated: opts.truncated === true, tree: opts.truncated === true ? [] : blobs })
      // ‏المشيُ مستوًى مستوًى: الجذرُ فيه social-media وmilestones-impact، والمجلّدُ فيه ملفّاتُه كلُّها مسطّحةً
      if (url.endsWith('/' + TREE)) return Response.json({ tree: [{ path: 'social-media', type: 'tree', sha: 'c'.repeat(40) }, { path: 'milestones-impact', type: 'tree', sha: 'd'.repeat(40) }] })
      if (url.endsWith('/' + 'c'.repeat(40))) return Response.json({ tree: blobs.filter((b) => b.path.startsWith('social-media/')).map((b) => ({ ...b, path: b.path.slice(13) })) })
      return Response.json({ tree: [{ path: 'x.md', type: 'blob', sha: 'e'.repeat(40), size: 1 }] })
    }
    if (url.includes('/contents/')) {
      expect(h.get('Accept')).toBe('application/vnd.github.raw')
      return new Response(new Uint8Array(2048), { headers: { 'Content-Length': '2048' } })
    }
    return new Response('', { status: 404 })
  }
  return { calls, fetch: impl as typeof fetch }
}

function bucket(): StreamBucket & { keys: Map<string, number> } {
  const keys = new Map<string, number>()
  return {
    keys,
    async head(key) { return keys.has(key) ? {} : null },
    async put(key, value) {
      const n = typeof value === 'string' ? value.length : (await new Response(value as ReadableStream).arrayBuffer()).byteLength
      keys.set(key, n)
    },
  }
}

const REPO = { owner: 'o', repo: 'r', branch: 'social-media-video', token: 't' }

describe('عميل GitHub', () => {
  it('304 على ETag لا ينتج شيئًا', async () => {
    expect(await branchHead(REPO, '"e1"', github({ etag: '"e1"' }).fetch)).toEqual({ kind: 'unchanged' })
  })

  it('الشجرةُ المقطوعة تُمشى مستوًى مستوًى وتعطي ما تعطيه الكاملة', async () => {
    const whole = await listTree(REPO, TREE, ROOT, 1000, github().fetch)
    const walked = await listTree(REPO, TREE, ROOT, 1000, github({ truncated: true }).fetch)
    expect(whole).toHaveLength(PACKAGE_PATHS.length)
    expect(walked.map((b) => b.path).sort()).toEqual(whole.map((b) => b.path).sort())
  })
})

describe('المزامنة', () => {
  it('أوّلُ دفعٍ ينقل المقاطعَ والأغلفةَ وحدها، والبصمةُ نفسُها لا تُنزَّل ثانيةً، و304 لا يكتب شيئًا', async () => {
    const db = fakeDb()
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'social-media-video', root: ROOT })
    const b = bucket()
    const gh = github()
    const first = await syncPackage({ db, bucket: b, token: 't', fetchImpl: gh.fetch }, (await readSource(db, 'org_owner'))!)
    expect(first.kind).toBe('synced')
    const media = PACKAGE_PATHS.filter((p) => { const c = classifyPath(underRoot(p, ROOT)!); return c.role === 'media' || c.role === 'cover' })
    expect(gh.calls.filter((u) => u.includes('/contents/'))).toHaveLength(media.length)
    expect(b.keys.size).toBe(media.length)
    expect([...b.keys.keys()].every((k) => /^pkg\/org_owner\/[0-9a-f]{40}\.(mp4|png)$/.test(k))).toBe(true)
    expect(currentPicks(await readPackageMedia(db, 'org_owner'))).toHaveLength(30)

    // ‏التزامٌ جديدٌ بالبصمات نفسِها: الشجرةُ تُقرأ ولا تنزيل
    const again = github({ head: 'f'.repeat(40) })
    const second = await syncPackage({ db, bucket: b, token: 't', fetchImpl: again.fetch }, (await readSource(db, 'org_owner'))!)
    expect(second).toMatchObject({ kind: 'synced', changed: 0, stored: 0 })
    expect(again.calls.filter((u) => u.includes('/contents/'))).toHaveLength(0)

    // ‏والفحصُ الساعيّ بالـ ETag نفسِه: 304 ولا كتابة
    const idle = github({ etag: '"e1"', head: 'f'.repeat(40) })
    const before = JSON.stringify(db.raw.prepare('SELECT * FROM package_files ORDER BY path').all())
    expect(await syncPackage({ db, bucket: b, token: 't', fetchImpl: idle.fetch }, (await readSource(db, 'org_owner'))!)).toEqual({ kind: 'unchanged' })
    expect(JSON.stringify(db.raw.prepare('SELECT * FROM package_files ORDER BY path').all())).toBe(before)
    expect(idle.calls).toHaveLength(1)
  })

  it('سقفُ الدفعة يؤجّل الباقي ويقول partial', async () => {
    const db = fakeDb()
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'social-media-video', root: ROOT })
    const out = await syncPackage({ db, bucket: bucket(), token: 't', fetchImpl: github().fetch, cap: 2048 * 10 }, (await readSource(db, 'org_owner'))!)
    expect(out).toMatchObject({ kind: 'synced', stored: 10 })
    expect((await readSource(db, 'org_owner'))!.status).toBe('partial')
  })

  it('401 من GitHub سببٌ بلا رمز', async () => {
    const db = fakeDb()
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: ROOT })
    const out = await syncPackage({ db, bucket: bucket(), token: '', fetchImpl: github().fetch }, (await readSource(db, 'org_owner'))!)
    expect(out).toEqual({ kind: 'failed', reason: 'GitHub ردّ 401: رمز القراءة خاطئٌ أو انتهى' })
  })
})

describe('الويب هوك', () => {
  const key = toBase64(new Uint8Array(32).fill(7))
  async function signed(secret: string, body: string): Promise<string> {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return 'sha256=' + [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map((x) => x.toString(16).padStart(2, '0')).join('')
  }
  const buf = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer

  it('توقيعٌ خاطئ 401، وping ‏200، وفرعٌ آخر 204، ودفعُ الفرع 202', async () => {
    const db = fakeDb()
    const id = await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'social-media-video', root: ROOT })
    const secret = await rotateHookSecret(db, key, 'org_owner', id)
    expect(JSON.stringify(db.raw.prepare('SELECT * FROM package_sources').all())).not.toContain(secret)
    const push = JSON.stringify({ ref: 'refs/heads/social-media-video', after: HEAD })
    expect((await judgeHook(db, key, id, 'push', await signed('wrong', push), buf(push))).status).toBe(401)
    expect((await judgeHook(db, key, id, 'push', null, buf(push))).status).toBe(401)
    expect((await judgeHook(db, key, id, 'ping', await signed(secret, '{}'), buf('{}'))).status).toBe(200)
    const other = JSON.stringify({ ref: 'refs/heads/main', after: HEAD })
    expect((await judgeHook(db, key, id, 'push', await signed(secret, other), buf(other))).status).toBe(204)
    expect(await judgeHook(db, key, id, 'push', await signed(secret, push), buf(push))).toMatchObject({ status: 202, after: HEAD })
    expect((await judgeHook(db, key, 'pkg_0', 'push', await signed(secret, push), buf(push))).status).toBe(404)
  })
})

describe('ما أصلحته المراجعة الثانية', () => {
  it('سرُّ Worker للمنظّمة المالك وحدها: منظّمةٌ أخرى بلا رمزٍ مختوم لا رمزَ لها ولا تُزامن', async () => {
    const db = fakeDb()
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: ROOT })
    await saveSource(db, 'org_other', { owner: 'mooryali95', repo: 'MI-private', branch: 'b', root: ROOT })
    const mine = (await readSource(db, 'org_owner'))!
    const theirs = (await readSource(db, 'org_other'))!
    expect(await tokenFor(mine, 'k', 'worker-token')).toBe('worker-token')
    expect(await tokenFor(theirs, 'k', 'worker-token')).toBeNull()
    expect(tokenReadyFor('org_owner', mine, 'worker-token')).toBe(true)
    expect(tokenReadyFor('org_other', theirs, 'worker-token')).toBe(false)
    expect(tokenReadyFor('org_other', null, 'worker-token')).toBe(false)
  })

  it('أجزاءٌ من نقاطٍ وحدها مرفوضة في الصاحب والمستودع والفرع والمجلّد', () => {
    const base = { owner: 'o', repo: 'r', branch: 'b', root: 'social-media' }
    expect(checkSource(base).ok).toBe(true)
    for (const bad of [{ owner: '.' }, { owner: '..' }, { repo: '.' }, { repo: '...' }, { branch: '.' }, { branch: 'a/./b' }, { branch: 'a//b' }, { branch: 'a/' }, { root: 'a/./b' }, { root: '.' }, { root: 'a//b' }]) {
      expect(checkSource({ ...base, ...bad }).ok, JSON.stringify(bad)).toBe(false)
    }
    expect(checkSource({ ...base, branch: 'feature/x.y', root: 'a/b.c' }).ok).toBe(true)
  })

  it('حِملٌ يتجاوز المليون بايت يُردّ قبل قراءته، والتسليمُ نفسُه لا يُطلق رسالةً ثانية يومًا', async () => {
    expect(hookTooLarge(null)).toBe(false)
    expect(hookTooLarge('1000000')).toBe(false)
    expect(hookTooLarge('1000001')).toBe(true)
    expect(hookTooLarge('abc')).toBe(true)
    const kv = fakeKv()
    expect(await firstDelivery(kv, 'pkg_a', 'd-1')).toBe(true)
    expect(await firstDelivery(kv, 'pkg_a', 'd-1')).toBe(false)
    expect(await firstDelivery(kv, 'pkg_b', 'd-1')).toBe(true)
    expect(kv.ttlOf('hook:pkg_a:d-1')).toBe(86_400)
  })
})
