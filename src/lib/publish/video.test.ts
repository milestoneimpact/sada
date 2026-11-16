/**
 * مقطعُ الحزمة على X وLinkedIn (D-374): النهاياتُ بترتيبها، والدفترُ قبل كلّ طلب، والمعالجةُ تُنتظر بسقف،
 * والإعادةُ تسأل عن المعرّف ولا ترفع ثانيةً. والشبكةُ مزيّفةٌ بردودٍ على شكل وثيقتَي المنصّتين.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { scopeSet } from '../oauth/scopes'
import { toBase64 } from '../crypto'
import { saveTokens, upsertAccount } from '../tokens'
import { LINKEDIN, X } from '../oauth/providers'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { bytesClip } from './clip'
import { publishPost } from './publisher'
import { clipShape, isMediaIdRejection, LINKEDIN_VIDEO, uploadLinkedInVideo, uploadXVideo, videoMisfit, videoStateLabel, X_SEGMENT, X_VIDEO } from './video'
import { PublishError } from './platforms'
import { readJourney } from '../journey'

interface Call { url: string; method: string; body: unknown }

/** شبكةٌ بردودٍ متتابعة لكلّ عنوان — فـ`STATUS` يقول «يُعالَج» ثمّ «نجح». */
function stub(routes: Record<string, Array<() => Response>>): typeof fetch & { calls: Call[] } {
  const calls: Call[] = []
  const used = new Map<string, number>()
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body })
    const list = routes[url]
    if (list === undefined) throw new Error(`نداء غير متوقع: ${url}`)
    const n = used.get(url) ?? 0
    used.set(url, n + 1)
    return list[Math.min(n, list.length - 1)]!()
  }
  return Object.assign(impl as unknown as typeof fetch, { calls })
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const MP4 = (size: number) => bytesClip({ bytes: new Uint8Array(size).fill(7), mime: 'video/mp4' })

function opts() {
  const ops: string[] = []
  const stages: string[] = []
  const slept: number[] = []
  return {
    ops, stages, slept,
    o: {
      onRequest: async (op: string) => { ops.push(op) },
      onStage: async (id: string, s: 'processing') => { stages.push(`${id}:${s}`) },
      sleep: async (ms: number) => { slept.push(ms) },
    },
  }
}

const X_ROUTES = (status: Array<() => Response>) => ({
  [X_VIDEO.init]: [json({ data: { id: '1880028106020515840', media_key: '13_1880028106020515840', expires_after_secs: 86400 } })],
  [X_VIDEO.append('1880028106020515840')]: [() => new Response(null, { status: 204 })],
  [X_VIDEO.finalize('1880028106020515840')]: [json({ data: { id: '1880028106020515840', processing_info: { state: 'pending', check_after_secs: 1 } } })],
  [X_VIDEO.status('1880028106020515840')]: status,
})

describe('X: رفعٌ مقطَّعٌ ثمّ STATUS', () => {
  it('يهيّئ بـ tweet_video وحجمه، ويدفع القطعَ بترتيبها، وينتظر حتّى succeeded', async () => {
    const f = stub(X_ROUTES([
      json({ data: { processing_info: { state: 'in_progress', check_after_secs: 3, progress_percent: 40 } } }),
      json({ data: { processing_info: { state: 'succeeded', progress_percent: 100 } } }),
    ]))
    const t = opts()
    const size = X_SEGMENT + 1000
    const id = await uploadXVideo('tok', MP4(size), f, t.o)
    expect(id).toBe('1880028106020515840')
    expect(JSON.parse(String(f.calls[0]!.body))).toEqual({ media_type: 'video/mp4', total_bytes: size, media_category: 'tweet_video' })
    const appends = f.calls.filter((c) => c.url.endsWith('/append'))
    expect(appends.map((c) => (c.body as FormData).get('segment_index'))).toEqual(['0', '1'])
    // ‏كلُّ طلبٍ في الدفتر قبل أن يُرسَل (D-008): ستّةُ طلبات وستّةُ أسطر
    expect(t.ops).toEqual(['x_video_init', 'x_video_append', 'x_video_append', 'x_video_finalize', 'x_video_status', 'x_video_status'])
    expect(t.ops.length).toBe(f.calls.length)
    expect(t.stages).toEqual(['1880028106020515840:processing'])
    expect(t.slept).toEqual([1000, 3000])
  })

  it('**failed يُردّ نهائيًّا بسبب X**', async () => {
    const f = stub(X_ROUTES([json({ data: { processing_info: { state: 'failed', error: { code: 1, name: 'InvalidMedia', message: 'Invalid or Unsupported media, Reason: UnsupportedMedia.' } } } })]))
    const err = await uploadXVideo('tok', MP4(5000), f, opts().o).catch((e: unknown) => e)
    expect(String((err as Error).message)).toContain('Unsupported')
    expect((err as { retryable: boolean }).retryable).toBe(false)
  })

  it('**والسقفُ يُعاد قابلًا للإعادة**، والإعادةُ تسأل بالمعرّف ولا تهيّئ', async () => {
    const f = stub(X_ROUTES([json({ data: { processing_info: { state: 'in_progress', check_after_secs: 60 } } })]))
    const err = await uploadXVideo('tok', MP4(5000), f, { ...opts().o, ceilingMs: 30_000 }).catch((e: unknown) => e)
    expect((err as { retryable: boolean }).retryable).toBe(true)

    const again = stub(X_ROUTES([json({ data: { processing_info: { state: 'succeeded' } } })]))
    const t = opts()
    expect(await uploadXVideo('tok', MP4(5000), again, { ...t.o, resume: '1880028106020515840' })).toBe('1880028106020515840')
    expect(again.calls.map((c) => c.url)).toEqual([X_VIDEO.status('1880028106020515840')])
    expect(t.ops).toEqual(['x_video_status'])
  })
})

describe('LinkedIn: Videos API', () => {
  const URN = 'urn:li:video:C5F10AQGKQg_6y2a4sQ'
  const routes = (status: Array<() => Response>) => ({
    [LINKEDIN_VIDEO.init]: [json({
      value: {
        uploadUrlsExpireAt: 1731700000000, video: URN, uploadToken: '',
        uploadInstructions: [
          { uploadUrl: 'https://www.linkedin.com/dms-uploads/part1', firstByte: 0, lastByte: 99_999 },
          { uploadUrl: 'https://www.linkedin.com/dms-uploads/part2', firstByte: 100_000, lastByte: 149_999 },
        ],
      },
    })],
    'https://www.linkedin.com/dms-uploads/part1': [() => new Response(null, { status: 200, headers: { etag: '/ambry-video/signedId/AAA' } })],
    'https://www.linkedin.com/dms-uploads/part2': [() => new Response(null, { status: 200, headers: { etag: '/ambry-video/signedId/BBB' } })],
    [LINKEDIN_VIDEO.finalize]: [() => new Response(null, { status: 200 })],
    [LINKEDIN_VIDEO.status(URN)]: status,
  })

  it('يهيّئ بالمالك والحجم، ويرفع الأجزاءَ بمداها، وينهي بالـ etag ات، وينتظر AVAILABLE', async () => {
    const f = stub(routes([json({ status: 'PROCESSING', id: URN }), json({ status: 'AVAILABLE', id: URN })]))
    const t = opts()
    const urn = await uploadLinkedInVideo('tok', 'urn:li:person:abc', MP4(150_000), f, t.o)
    expect(urn).toBe(URN)
    expect(JSON.parse(String(f.calls[0]!.body)).initializeUploadRequest).toMatchObject({ owner: 'urn:li:person:abc', fileSizeBytes: 150_000 })
    expect((f.calls[1]!.body as Uint8Array).length).toBe(100_000)
    expect((f.calls[2]!.body as Uint8Array).length).toBe(50_000)
    expect(JSON.parse(String(f.calls[3]!.body)).finalizeUploadRequest.uploadedPartIds).toEqual(['/ambry-video/signedId/AAA', '/ambry-video/signedId/BBB'])
    expect(t.ops).toEqual(['linkedin_video_init', 'linkedin_video_part', 'linkedin_video_part', 'linkedin_video_finalize', 'linkedin_video_status', 'linkedin_video_status'])
    expect(t.stages).toEqual([`${URN}:processing`])
  })

  it('PROCESSING_FAILED يُردّ نهائيًّا', async () => {
    const f = stub(routes([json({ status: 'PROCESSING_FAILED', processingFailureReason: 'Video duration exceeds limit' })]))
    const err = await uploadLinkedInVideo('tok', 'urn:li:person:abc', MP4(150_000), f, opts().o).catch((e: unknown) => e)
    expect((err as Error).message).toContain('duration exceeds')
    expect((err as { retryable: boolean }).retryable).toBe(false)
  })
})

describe('حدودُ المقطع', () => {
  it('X حتّى ‏512MB و‏140 ثانية، وLinkedIn من ‏75KB', () => {
    expect(videoMisfit('x', 1_048_576)).toBeNull()
    expect(videoMisfit('x', 1_048_576, 150_000)).toContain('140 ثانية')
    expect(videoMisfit('linkedin', 1000)).toContain('دون')
  })
})

// ── الناشر كاملًا: منشورٌ بمقطع الحزمة ─────────────────────────────────

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = () => new Date('2026-09-08T09:00:00.000Z')
let db: FakeDb

async function seed(platform: 'x' | 'linkedin', size: number): Promise<{ postId: string; mediaId: string }> {
  const accountId = await upsertAccount(db, 'org_owner', { platform, kind: 'member', externalId: platform === 'x' ? '4242' : 'abc', displayName: 'عمر' })
  await saveTokens(db, KEY, accountId, {
    accessToken: 'live-access', refreshToken: null, expiresAt: '2026-11-02T10:00:00.000Z', refreshExpiresAt: null, scopes: scopeSet(platform).join(' '),
  })
  const postId = `p-${platform}`
  db.raw.prepare(
    `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at, status, idempotency_key, approved_by, approved_at)
     VALUES (?, ?, ?, 'text', 'نص المنشور', '2026-09-08T09:00:00Z', 'queued', ?, 'omar', '2026-09-07T10:00:00Z')`,
  ).run(postId, accountId, platform, `pkg:org_owner:06:${platform}:rev1`)
  const mediaId = crypto.randomUUID()
  db.raw.prepare(
    `INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
     VALUES (?, ?, 'pkg/org_owner/abc.mp4', 'video/mp4', ?, '', 'package', ?)`,
  ).run(mediaId, postId, size, `lib:g:abc:${postId}`)
  return { postId, mediaId }
}

/** ‏صندوقُ ISO-BMFF: حجمٌ ونوعٌ ثمّ جسد. */
function box(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length)
  new DataView(out.buffer).setUint32(0, out.length)
  out.set([...type].map((c) => c.charCodeAt(0)), 4)
  out.set(body, 8)
  return out
}

/** ‏`mvhd` إصدار 0 أو 1 بمقياسه ومدّته. */
function mvhd(seconds: number, version: 0 | 1 = 0, scale = 1000): Uint8Array {
  const body = new Uint8Array(version === 1 ? 4 + 16 + 12 + 80 : 4 + 8 + 8 + 80)
  const v = new DataView(body.buffer)
  body[0] = version
  const at = version === 1 ? 20 : 12
  v.setUint32(at, scale)
  if (version === 1) { v.setUint32(at + 4, 0); v.setUint32(at + 8, seconds * scale) } else v.setUint32(at + 4, seconds * scale)
  return box('mvhd', body)
}

/** ‏مقطعٌ MP4 مصنوعٌ بحجمه ومدّته — `moov` في أوّله (faststart) أو في ذيله بعد `mdat`. */
function mp4(size: number, seconds = 30, moovAtEnd = false, version: 0 | 1 = 0): Uint8Array {
  const ftyp = box('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]))
  const moov = box('moov', mvhd(seconds, version))
  const mdat = box('mdat', new Uint8Array(Math.max(0, size - ftyp.length - moov.length - 8)).fill(3))
  const parts = moovAtEnd ? [ftyp, mdat, moov] : [ftyp, moov, mdat]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

function bucket(size: number, bytes: Uint8Array = mp4(size)) {
  size = bytes.length
  return {
    async head() { return { size } },
    async get(_k: string, o?: { range: { offset: number; length: number } }) {
      const part = o === undefined ? bytes : bytes.subarray(o.range.offset, o.range.offset + o.range.length)
      return { async arrayBuffer() { return part.slice().buffer } }
    },
  }
}

beforeEach(() => { db = fakeDb() })

describe('الناشر: مقطعُ الحزمة لا غلافُها', () => {
  it('X: التغريدةُ تحمل معرّفَ المقطع، والدفترُ يحمل كلَّ طلب، والصفُّ ready', async () => {
    const { postId, mediaId } = await seed('x', 1_048_576)
    const f = stub({ ...X_ROUTES([json({ data: { processing_info: { state: 'succeeded' } } })]), [X.postUrl]: [json({ data: { id: 'tweet-v' } })] })
    const out = await publishPost({ db, encKey: KEY, fetchImpl: f, now: NOW, bucket: bucket(1_048_576), sleep: async () => {} }, { postId })
    expect(out).toEqual({ kind: 'published', platformPostId: 'tweet-v' })
    const tweet = f.calls.find((c) => c.url === X.postUrl)!
    expect(JSON.parse(String(tweet.body)).media).toEqual({ media_ids: ['1880028106020515840'] })
    const ops = (db.raw.prepare("SELECT operation FROM cost_ledger WHERE operation LIKE 'x_video%' ORDER BY rowid").all() as Array<{ operation: string }>).map((r) => r.operation)
    expect(ops).toEqual(['x_video_init:price_unverified', 'x_video_append:price_unverified', 'x_video_finalize:price_unverified', 'x_video_status:price_unverified'])
    expect(db.raw.prepare('SELECT platform_media_id AS id, platform_media_state AS s FROM media WHERE id = ?').get(mediaId)).toEqual({ id: '1880028106020515840', s: 'ready' })
  })

  it('**الإعادةُ بعد السقف لا ترفع ثانيةً** — تسأل بالمعرّف المحفوظ ثمّ تغرّد', async () => {
    const { postId } = await seed('x', 1_048_576)
    const slow = stub(X_ROUTES([json({ data: { processing_info: { state: 'in_progress', check_after_secs: 120 } } })]))
    const first = await publishPost({ db, encKey: KEY, fetchImpl: slow, now: NOW, bucket: bucket(1_048_576), sleep: async () => {} }, { postId })
    expect(first).toMatchObject({ kind: 'failed', retryable: true })
    db.raw.prepare("UPDATE posts SET status = 'queued' WHERE id = ?").run(postId)

    const f = stub({ ...X_ROUTES([json({ data: { processing_info: { state: 'succeeded' } } })]), [X.postUrl]: [json({ data: { id: 'tweet-v' } })] })
    const second = await publishPost({ db, encKey: KEY, fetchImpl: f, now: NOW, bucket: bucket(1_048_576), sleep: async () => {} }, { postId })
    expect(second).toEqual({ kind: 'published', platformPostId: 'tweet-v' })
    expect(f.calls.some((c) => c.url === X_VIDEO.init)).toBe(false)
    // ‏والمفتاحُ نفسُه على المحاولتين (D-004)
    const keys = db.raw.prepare('SELECT DISTINCT idempotency_key AS k FROM publish_attempts WHERE post_id = ?').all(postId)
    expect(keys).toEqual([{ k: 'pkg:org_owner:06:x:rev1' }])
  })

  it('**ردُّ المعالجة يُرى في رحلة المنشور بسببه** ويُكتب على الوسيط', async () => {
    const { postId, mediaId } = await seed('x', 1_048_576)
    const f = stub(X_ROUTES([json({ data: { processing_info: { state: 'failed', error: { message: 'Video longer than 140 seconds' } } } })]))
    const out = await publishPost({ db, encKey: KEY, fetchImpl: f, now: NOW, bucket: bucket(1_048_576), sleep: async () => {} }, { postId })
    expect(out).toMatchObject({ kind: 'failed', retryable: false })
    const attempt = db.raw.prepare("SELECT response_json AS r FROM publish_attempts WHERE post_id = ? AND status = 'failed'").get(postId) as { r: string }
    expect(attempt.r).toContain('140 seconds')
    expect(db.raw.prepare('SELECT platform_media_state AS s, platform_media_id AS id FROM media WHERE id = ?').get(mediaId)).toEqual({ s: 'failed', id: null })
    expect(f.calls.some((c) => c.url === X.postUrl)).toBe(false)
  })

  it('LinkedIn: المنشورُ يحمل urn:li:video', async () => {
    const URN = 'urn:li:video:C5F10AQGKQg_6y2a4sQ'
    const { postId } = await seed('linkedin', 150_000)
    const f = stub({
      [LINKEDIN_VIDEO.init]: [json({ value: { video: URN, uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://www.linkedin.com/dms-uploads/p', firstByte: 0, lastByte: 149_999 }] } })],
      'https://www.linkedin.com/dms-uploads/p': [() => new Response(null, { status: 200, headers: { etag: 'E1' } })],
      [LINKEDIN_VIDEO.finalize]: [() => new Response(null, { status: 200 })],
      [LINKEDIN_VIDEO.status(URN)]: [json({ status: 'AVAILABLE' })],
      [LINKEDIN.postUrl]: [() => new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:77' } })],
    })
    const out = await publishPost({ db, encKey: KEY, fetchImpl: f, now: NOW, bucket: bucket(150_000), sleep: async () => {} }, { postId })
    expect(out).toEqual({ kind: 'published', platformPostId: 'urn:li:share:77' })
    const post = f.calls.find((c) => c.url === LINKEDIN.postUrl)!
    expect(JSON.parse(String(post.body)).content).toEqual({ media: { id: URN } })
  })
})

// ── D-379 ───────────────────────────────────────────────────────────

const ID = '1880028106020515840'
const tweetOk = () => json({ data: { id: 'tweet-v' } })
const mediaRow = (id: string) => db.raw.prepare(
  `SELECT platform_media_id AS id, platform_media_state AS s, platform_media_error AS e, platform_media_expires_at AS x, platform_media_resets AS r
     FROM media WHERE id = ?`).get(id) as { id: string | null; s: string | null; e: string | null; x: string | null; r: number }
const deps = (f: typeof fetch, size = 1_048_576, bytes?: Uint8Array) =>
  ({ db, encKey: KEY, fetchImpl: f, now: NOW, bucket: bucket(size, bytes), sleep: async () => {} })
const requeue = (postId: string) => db.raw.prepare("UPDATE posts SET status = 'queued' WHERE id = ?").run(postId)

describe('D-379: مدّةُ MP4 من رأسه بلا فكّ ترميز', () => {
  /** ‏مقطعٌ يعدّ ما قُرئ منه — فلا يُحمَل كلُّه ليُعرف طولُه. */
  const counted = (bytes: Uint8Array) => {
    let read = 0
    return { clip: { size: bytes.length, mime: 'video/mp4', read: async (o: number, n: number) => { read += n; return bytes.subarray(o, o + n) } }, read: () => read }
  }

  it('moov في أوّله (faststart) بـ mvhd إصدار 0', async () => {
    const c = counted(mp4(2_000_000, 150))
    expect(await clipShape(c.clip)).toEqual({ isoBmff: true, durationMs: 150_000 })
    expect(c.read()).toBeLessThanOrEqual(64 * 1024)
  })

  it('**moov في ذيله** بعد mdat، وmvhd إصدار 1 — يُقرأ الذيلُ بمداه لا الملفُّ كلُّه', async () => {
    const c = counted(mp4(3_000_000, 1800, true, 1))
    expect(await clipShape(c.clip)).toEqual({ isoBmff: true, durationMs: 1_800_000 })
    expect(c.read()).toBeLessThan(80 * 1024)
  })

  it('بلا ftyp ليس MP4، وmoov مبتورٌ مدّتُه «لم تُعرف»', async () => {
    expect(await clipShape(bytesClip({ bytes: new Uint8Array(5000).fill(7), mime: 'video/mp4' }))).toEqual({ isoBmff: false, durationMs: null })
    const cut = mp4(200_000, 30, true).subarray(0, 199_990)
    expect((await clipShape(bytesClip({ bytes: cut, mime: 'video/mp4' }))).durationMs).toBeNull()
  })

  it('الصيغةُ: WebM لا يقبله أحد، وMOV لـ X وحده', () => {
    expect(videoMisfit('x', 1_048_576, null, 'video/webm')).toContain('WEBM')
    expect(videoMisfit('x', 1_048_576, null, 'video/quicktime')).toBeNull()
    expect(videoMisfit('linkedin', 1_048_576, null, 'video/quicktime')).toContain('MP4')
    expect(videoMisfit('linkedin', 1_048_576, 31 * 60_000, 'video/mp4')).toContain('1800 ثانية')
  })
})

describe('D-379: المقطعُ المخالف يسقط إلى الغلاف بسببه', () => {
  it('X: مقطعٌ ‏150 ثانية لا يُرفع — يُنشر الغلافُ والسببُ على المقطع وفي المحاولة', async () => {
    const { postId, mediaId } = await seed('x', 2_000_000)
    db.raw.prepare(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
      VALUES ('cover-1', ?, 'pkg/org_owner/cover.png', 'image/png', 1000, '', 'package', 'lib:g:cover')`).run(postId)
    const f = stub({ [X.uploadUrl]: [json({ data: { id: 'img-1' } })], [X.postUrl]: [tweetOk()] })
    const out = await publishPost(deps(f, 2_000_000, mp4(2_000_000, 150)), { postId })
    expect(out).toEqual({ kind: 'published', platformPostId: 'tweet-v' })
    expect(f.calls.some((c) => c.url === X_VIDEO.init)).toBe(false)
    expect(JSON.parse(String(f.calls.find((c) => c.url === X.postUrl)!.body)).media).toEqual({ media_ids: ['img-1'] })
    expect(mediaRow(mediaId)).toMatchObject({ s: 'failed', id: null })
    expect(mediaRow(mediaId).e).toContain('140 ثانية')
    const r = db.raw.prepare("SELECT response_json AS r FROM publish_attempts WHERE post_id = ? AND status = 'succeeded'").get(postId) as { r: string }
    expect(JSON.parse(r.r).note).toContain('نُشر الغلاف بدل المقطع')
  })

  it('بلا غلاف يُردّ نهائيًّا قبل أيّ طلبٍ إلى X', async () => {
    const { postId } = await seed('x', 2_000_000)
    const f = stub({})
    const out = await publishPost(deps(f, 2_000_000, mp4(2_000_000, 150)), { postId })
    expect(out).toMatchObject({ kind: 'failed', retryable: false })
    expect((out as { reason: string }).reason).toContain('video_misfit')
    expect(f.calls).toEqual([])
  })
})

describe('D-379: معرّفُ X ينتهي — يُرفع من جديد مرّةً ولا دوران', () => {
  it('يُحفظ متى ينتهي من expires_after_secs', async () => {
    const { postId, mediaId } = await seed('x', 1_048_576)
    const routes = X_ROUTES([json({ data: { expires_after_secs: 86_000, processing_info: { state: 'succeeded' } } })])
    const out = await publishPost(deps(stub({ ...routes, [X.postUrl]: [tweetOk()] })), { postId })
    expect(out.kind).toBe('published')
    expect(mediaRow(mediaId).x).toBe(new Date(NOW().getTime() + 86_000_000).toISOString())
  })

  it('**إعادةٌ بعد انتهائه ترفع من جديد** بالدفتر، وتقول لماذا', async () => {
    const { postId, mediaId } = await seed('x', 1_048_576)
    db.raw.prepare("UPDATE media SET platform_media_id = 'old', platform_media_state = 'ready', platform_media_expires_at = '2026-09-08T08:00:00.000Z' WHERE id = ?").run(mediaId)
    const f = stub({ ...X_ROUTES([json({ data: { processing_info: { state: 'succeeded' } } })]), [X.postUrl]: [tweetOk()] })
    const out = await publishPost(deps(f), { postId })
    expect(out.kind).toBe('published')
    expect(f.calls.filter((c) => c.url === X_VIDEO.init)).toHaveLength(1)
    expect(JSON.parse(String(f.calls.find((c) => c.url === X.postUrl)!.body)).media).toEqual({ media_ids: [ID] })
    expect(mediaRow(mediaId)).toMatchObject({ id: ID, s: 'ready', r: 1 })
    const ops = db.raw.prepare("SELECT COUNT(*) AS n FROM cost_ledger WHERE operation LIKE 'x_video%'").get() as { n: number }
    expect(ops.n).toBe(f.calls.filter((c) => c.url !== X.postUrl).length)
    const r = db.raw.prepare("SELECT response_json AS r FROM publish_attempts WHERE post_id = ? AND status = 'succeeded'").get(postId) as { r: string }
    expect(JSON.parse(r.r).note).toContain('انتهت صلاحيّة معرّف المقطع')
  })

  it('**التغريدةُ تردّ المعرّف** ← يُنسى ويُعاد قابلًا للإعادة، ثمّ يُرفع مرّةً، وردٌّ ثانٍ نهائيّ', async () => {
    const { postId, mediaId } = await seed('x', 1_048_576)
    db.raw.prepare("UPDATE media SET platform_media_id = 'old', platform_media_state = 'ready' WHERE id = ?").run(mediaId)
    const invalid = () => json({ title: 'Invalid Request', detail: 'One or more parameters to your request was invalid.', errors: [{ message: 'Your media IDs are invalid.' }] }, 400)
    const first = await publishPost(deps(stub({ [X.postUrl]: [invalid()] })), { postId })
    expect(first).toMatchObject({ kind: 'failed', retryable: true })
    expect(mediaRow(mediaId)).toMatchObject({ id: null, s: null, r: 1 })
    // ‏والسببُ يُرى في رحلة المنشور
    const j = await readJourney(db, 'org_owner', postId)
    expect(JSON.stringify(j)).toContain('يُرفع من جديد')
    expect(JSON.stringify(j)).not.toContain(ID)

    requeue(postId)
    const f2 = stub({ ...X_ROUTES([json({ data: { processing_info: { state: 'succeeded' } } })]), [X.postUrl]: [invalid()] })
    const second = await publishPost(deps(f2), { postId })
    expect(f2.calls.filter((c) => c.url === X_VIDEO.init)).toHaveLength(1)
    expect(second).toMatchObject({ kind: 'failed', retryable: false })
    expect(mediaRow(mediaId)).toMatchObject({ s: 'failed', r: 1 })

    // ‏ولا دوران: «أعده» لا يرفع إلّا بيد المالك — والطابورُ لا يعيد ما رُدّ نهائيًّا
    expect(db.raw.prepare('SELECT status FROM posts WHERE id = ?').get(postId)).toEqual({ status: 'failed' })
  })

  it('isMediaIdRejection: ردُّ المعرّف وحده، لا ‏401 ولا ‏429 ولا ردٌّ آخر', () => {
    expect(isMediaIdRejection(new PublishError('x: رفض النشر (Invalid Request · Your media IDs are invalid.)', 400, false))).toBe(true)
    expect(isMediaIdRejection(new PublishError('x: رفض النشر (media id expired)', 400, false))).toBe(true)
    expect(isMediaIdRejection(new PublishError('x: رفض النشر (duplicate content)', 403, false))).toBe(false)
    expect(isMediaIdRejection(new PublishError('x: media invalid', 401, false))).toBe(false)
  })
})

describe('D-379: حالُ المقطع بلسان المالك، والمعرّفُ مخفيّ', () => {
  it('الحالاتُ الأربع', () => {
    expect(videoStateLabel('uploading', null)).toBe('يُرفع الفيديو')
    expect(videoStateLabel('processing', null)).toBe('تعالجه المنصّة')
    expect(videoStateLabel('ready', null)).toBe('جاهز')
    expect(videoStateLabel('failed', `x: رفض X المقطع ${ID} urn:li:video:C5F1`)).toBe('لم يُقبل: رفض X المقطع … …')
    expect(videoStateLabel(null, null)).toBeNull()
  })
})

import { videoStateLabel as label379 } from './video'
import { test as t379, expect as e379 } from 'vitest'
t379('D-379: سبب الردّ بلا رموز الآلة', () => {
  e379(label379('failed', 'video_misfit: المقطع 600MB و X لا يقبل فوق 512MB')).toBe('لم يُقبل: المقطع 600MB و X لا يقبل فوق 512MB')
  e379(label379('failed', 'x: media_rejected: رُدّ')).toBe('لم يُقبل: رُدّ')
})
