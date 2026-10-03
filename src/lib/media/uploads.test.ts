/** مقاطعُ المالك (D-180): الرفعُ قطعًا إلى R2، وحدودُ المنصّات، ومنشورٌ لكلّ منصّةٍ من نسخةٍ واحدة. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import {
  captionProblem, completeUpload, expireStaleUploads, listUploads, MAX_UPLOAD_BYTES, PART_BYTES, postsFromUpload,
  startUpload, uploadPart, videoChecks, type MultipartBucket,
} from './uploads'
import { decide } from '../draft/store'

function multipart() {
  const objects = new Map<string, number>()
  const aborted: string[] = []
  const parts = new Map<string, number[]>()
  const bucket: MultipartBucket = {
    async createMultipartUpload(key) {
      return bucket.resumeMultipartUpload(key, `mp-${key}`)
    },
    resumeMultipartUpload(key, uploadId) {
      return {
        uploadId,
        async uploadPart(n, value) {
          parts.set(key, [...(parts.get(key) ?? []), value.byteLength])
          return { partNumber: n, etag: `e${n}` }
        },
        async complete(done) {
          objects.set(key, done.length)
          return {}
        },
        async abort() { aborted.push(key) },
      }
    },
  }
  return { bucket, objects, aborted, parts }
}

let db: FakeDb
beforeEach(() => { db = fakeDb() })

const META = { name: 'C:\\clips\\قيادة.mp4', mime: 'video/mp4', bytes: PART_BYTES * 2 + 10, width: 1080, height: 1920, durationMs: 42_000 }

describe('الرفع', () => {
  it('يبدأ ويقبل القطعَ بأطوالها ويجمعها، والاسمُ بلا مسار', async () => {
    const r2 = multipart()
    const start = await startUpload(db, r2.bucket, META, 'u1')
    expect(start).toEqual({ ok: true, id: 'u1', partBytes: PART_BYTES, parts: 3 })

    expect(await uploadPart(db, r2.bucket, 'u1', 4, new ArrayBuffer(10))).toMatchObject({ ok: false })
    expect(await uploadPart(db, r2.bucket, 'u1', 1, new ArrayBuffer(5))).toMatchObject({ ok: false })
    const p1 = await uploadPart(db, r2.bucket, 'u1', 1, new ArrayBuffer(PART_BYTES))
    const p2 = await uploadPart(db, r2.bucket, 'u1', 2, new ArrayBuffer(PART_BYTES))
    const p3 = await uploadPart(db, r2.bucket, 'u1', 3, new ArrayBuffer(10))
    expect([p1.ok, p2.ok, p3.ok]).toEqual([true, true, true])

    // ‏ناقصةٌ لا تُجمَّع
    expect(await completeUpload(db, r2.bucket, 'u1', [{ partNumber: 1, etag: 'e1' }])).toMatchObject({ ok: false })
    expect(await completeUpload(db, r2.bucket, 'u1', [
      { partNumber: 3, etag: 'e3' }, { partNumber: 1, etag: 'e1' }, { partNumber: 2, etag: 'e2' },
    ])).toEqual({ ok: true })
    expect(r2.objects.get('upload/u1.mp4')).toBe(3)

    const [row] = await listUploads(db)
    expect(row).toMatchObject({ id: 'u1', name: 'قيادة.mp4', status: 'ready', durationMs: 42_000, platforms: [] })
  })

  it('النوعُ والحجمُ يُفحصان قبل أن يُفتح رفعٌ في R2', async () => {
    const r2 = multipart()
    expect(await startUpload(db, r2.bucket, { ...META, mime: 'video/x-msvideo' })).toMatchObject({ ok: false })
    expect(await startUpload(db, r2.bucket, { ...META, bytes: MAX_UPLOAD_BYTES + 1 })).toMatchObject({ ok: false })
    expect(r2.parts.size).toBe(0)
    expect(await listUploads(db)).toEqual([])
  })
})

describe('حدودُ المنصّات', () => {
  it('رأسيٌّ ‏42 ثانية: يوافق الثلاث، وأفقيٌّ طويلٌ يُحذَّر على YouTube ويُمنع على TikTok', () => {
    expect(videoChecks(META).map((c) => c.level)).toEqual(['ok', 'ok', 'ok'])
    const long = videoChecks({ ...META, width: 1920, height: 1080, durationMs: 700_000 })
    expect(long.find((c) => c.platform === 'youtube')!.level).toBe('warn')
    expect(long.find((c) => c.platform === 'tiktok')!.level).toBe('block')
    expect(videoChecks({ ...META, mime: 'video/webm' }).find((c) => c.platform === 'instagram')!.level).toBe('block')
    // ‏والمدّةُ المجهولةُ لا تمنع
    expect(videoChecks({ ...META, durationMs: null }).every((c) => c.level !== 'block')).toBe(true)
  })
})

describe('منشوراتٌ من مقطع', () => {
  async function ready(id = 'u1'): Promise<void> {
    const r2 = multipart()
    await startUpload(db, r2.bucket, { ...META, bytes: 10 }, id)
    await uploadPart(db, r2.bucket, id, 1, new ArrayBuffer(10))
    await completeUpload(db, r2.bucket, id, [{ partNumber: 1, etag: 'e1' }])
  }

  it('منشورٌ لكلّ منصّة، كلُّها على كائنٍ واحد، والاعتمادُ باسم المالك، والضغطةُ الثانيةُ لا تكرّر', async () => {
    await ready()
    const out = await postsFromUpload(db, { uploadId: 'u1', platforms: ['youtube', 'tiktok', 'instagram'], caption: 'المعلمُ نقطةُ قرار', approve: true, by: 'omar' })
    expect(out).toEqual({ ok: true, created: ['youtube', 'tiktok', 'instagram'], skipped: [] })
    const rows = db.raw.prepare(
      `SELECT p.platform, p.status, p.approved_by, m.r2_key, m.upload_id FROM posts p JOIN media m ON m.post_id = p.id ORDER BY p.platform`,
    ).all() as { platform: string; status: string; approved_by: string; r2_key: string; upload_id: string }[]
    expect(rows).toHaveLength(3)
    expect(new Set(rows.map((r) => r.r2_key))).toEqual(new Set(['upload/u1.mp4']))
    expect(rows.every((r) => r.status === 'approved' && r.approved_by === 'omar' && r.upload_id === 'u1')).toBe(true)

    const again = await postsFromUpload(db, { uploadId: 'u1', platforms: ['youtube'], caption: 'نصّ', approve: true, by: 'omar' })
    expect(again).toEqual({ ok: true, created: [], skipped: ['youtube'] })
    expect([...(await listUploads(db))[0]!.platforms].sort()).toEqual(['instagram', 'tiktok', 'youtube'])
  })

  it('بلا نصٍّ أو بلا منصّةٍ أو قبل اكتمال الرفع يُردّ، وبلا اعتمادٍ يبقى مسوّدة', async () => {
    expect(await postsFromUpload(db, { uploadId: 'none', platforms: ['youtube'], caption: 'نصّ', approve: true, by: 'o' })).toMatchObject({ ok: false })
    await ready()
    expect(await postsFromUpload(db, { uploadId: 'u1', platforms: ['youtube'], caption: '  ', approve: true, by: 'o' })).toMatchObject({ ok: false })
    expect(await postsFromUpload(db, { uploadId: 'u1', platforms: ['x'], caption: 'نصّ', approve: true, by: 'o' })).toMatchObject({ ok: false })
    await postsFromUpload(db, { uploadId: 'u1', platforms: ['tiktok'], caption: 'نصّ', approve: false, by: 'o' })
    const row = db.raw.prepare("SELECT status, approved_at FROM posts WHERE platform = 'tiktok'").get() as { status: string; approved_at: string | null }
    expect(row).toEqual({ status: 'draft', approved_at: null })
  })

  it('المرفوضُ يُحرَّر مفتاحُه ويُنشأ من جديد، ولا يُعدّ «أُنشئ» في المكتبة (D-182)', async () => {
    await ready()
    await postsFromUpload(db, { uploadId: 'u1', platforms: ['tiktok'], caption: 'ثلاث طبقات للحوكمة', approve: false, by: 'o' })
    const first = db.raw.prepare("SELECT id FROM posts WHERE platform = 'tiktok'").get() as { id: string }
    // ‏وصفٌ قصيرٌ سليم يُعتمَد: شرطُ «أربعين محرفًا» لمنشورٍ مكتوب لا لوصف مقطع
    expect(await decide(db, first.id, { kind: 'reject' }, 'o')).toMatchObject({ ok: true })
    expect((await listUploads(db))[0]!.platforms).toEqual([])
    const again = await postsFromUpload(db, { uploadId: 'u1', platforms: ['tiktok'], caption: 'ثلاث طبقات للحوكمة', approve: false, by: 'o' })
    expect(again).toEqual({ ok: true, created: ['tiktok'], skipped: [] })
    const second = db.raw.prepare("SELECT id FROM posts WHERE platform = 'tiktok' AND status = 'draft'").get() as { id: string }
    expect(await decide(db, second.id, { kind: 'approve', text: 'ثلاث طبقات للحوكمة' }, 'o')).toEqual({ ok: true, status: 'approved' })
  })

  it('منشورٌ بلا مقطعه (كتابةٌ انقطعت) يُكمَّل بالضغطة الثانية ولا يُكرَّر', async () => {
    await ready()
    await db.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, model) VALUES ('half', 'youtube', 'text', 'نصّ', 'draft', 'upload:u1:youtube', 'owner')`).run()
    expect(await postsFromUpload(db, { uploadId: 'u1', platforms: ['youtube'], caption: 'نصّ', approve: false, by: 'o' }))
      .toEqual({ ok: true, created: [], skipped: ['youtube'] })
    expect(db.raw.prepare("SELECT upload_id FROM media WHERE post_id = 'half'").all()).toEqual([{ upload_id: 'u1' }])
  })

  it('المنشورُ ووسيطُه معًا أو لا شيء: وسيطٌ يُردّ لا يترك منشورًا يتيمًا', async () => {
    await ready()
    // ‏مفتاحُ الوسيط محجوزٌ مسبقًا — فيُردّ صفُّه، ومعه يُرجَع المنشور
    db.raw.exec(`CREATE TRIGGER boom BEFORE INSERT ON media BEGIN SELECT RAISE(ABORT, 'boom'); END`)
    await expect(postsFromUpload(db, { uploadId: 'u1', platforms: ['youtube'], caption: 'نصّ', approve: true, by: 'o' })).rejects.toThrow('boom')
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(0)
  })

  it('نصٌّ فوق حدّ منصّةٍ يُردّ قبل أن يُكتب شيء — ووصفُ YouTube بالبايت وبلا «<>»', async () => {
    expect(captionProblem('youtube', 'قبل -> بعد')).toContain('«<»')
    expect(captionProblem('youtube', 'ع'.repeat(2600))).toContain('5200 بايتًا')
    expect(captionProblem('tiktok', 'a'.repeat(2201))).toContain('TikTok تقبل 2200')
    expect(captionProblem('instagram', 'وصفٌ قصير')).toBeNull()
    await ready()
    const out = await postsFromUpload(db, { uploadId: 'u1', platforms: ['youtube', 'tiktok'], caption: 'قبل -> بعد', approve: true, by: 'o' })
    expect(out).toMatchObject({ ok: false })
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM posts').get() as { n: number }).n).toBe(0)
  })
})

describe('الرفعُ المتروك (D-182)', () => {
  it('ما بقي «يُرفع» أكثرَ من ستّ ساعات يُلغى في R2 ويُعلَّم فاشلًا، والحديثُ يبقى', async () => {
    const r2 = multipart()
    await startUpload(db, r2.bucket, META, 'old')
    await startUpload(db, r2.bucket, META, 'new')
    db.raw.exec(`UPDATE uploads SET created_at = datetime('now', '-7 hours') WHERE id = 'old'`)
    expect(await expireStaleUploads(db, r2.bucket, new Date())).toBe(1)
    expect(r2.aborted).toEqual(['upload/old.mp4'])
    expect((await listUploads(db)).map((u) => u.id)).toEqual(['new'])
  })
})
