/** مقاطعُ المالك (D-180): الرفعُ قطعًا إلى R2، وحدودُ المنصّات، ومنشورٌ لكلّ منصّةٍ من نسخةٍ واحدة. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import {
  captionProblem, completeUpload, cutTitle, expireStaleUploads, listUploads, MAX_UPLOAD_BYTES, PART_BYTES, postsFromUpload,
  privateReach, scheduleFromUpload, startUpload, uploadPart, videoChecks, type MultipartBucket,
} from './uploads'
import type { LinkedAccount } from '../channels'
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
    expect(row).toMatchObject({ id: 'u1', name: 'قيادة.mp4', status: 'ready', durationMs: 42_000, posts: [] })
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
    // ‏يوافق الثلاث، وYouTube وTikTok تنبيهٌ لا أخضر: يصلان خاصَّين (ر-4)
    expect(videoChecks(META).map((c) => c.level)).toEqual(['warn', 'warn', 'ok'])
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
    expect((await listUploads(db))[0]!.posts.map((p) => p.platform).sort()).toEqual(['instagram', 'tiktok', 'youtube'])
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
    expect((await listUploads(db))[0]!.posts).toEqual([])
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

describe('ما يصل خاصًّا يُقال حيث يقرّر المالك (ر-4)', () => {
  it('YouTube وTikTok تنبيهٌ بنصٍّ بشريّ، ولو كان المقطعُ يوافقهما — وInstagram علنيّ', () => {
    const [yt, tt, ig] = videoChecks(META)
    expect(yt).toMatchObject({ level: 'warn', note: 'Short · يصل قناتك خاصًّا — تنشره أنت من YouTube Studio' })
    expect(tt).toMatchObject({ level: 'warn', note: 'لا يراه غيرك حتّى تنشره أنت من تطبيق TikTok' })
    expect(ig).toMatchObject({ level: 'ok', note: 'Reel' })
    // ‏والأفقيُّ يقول الأمرين: فيديو عاديّ، ويصل خاصًّا
    expect(videoChecks({ ...META, width: 1920, height: 1080 })[0]!.note).toContain('لا Short · يصل قناتك خاصًّا')
  })

  it('جملةٌ واحدةٌ لما يصل خاصًّا، ولا شيءَ لـ Instagram وحده', () => {
    expect(privateReach(['youtube', 'tiktok', 'instagram'])).toContain('YouTube وTikTok لا يُنشران للعامّة')
    expect(privateReach(['youtube'])).toBe('YouTube لا يُنشر للعامّة: يصل قناتك خاصًّا — تنشره أنت من YouTube Studio.')
    expect(privateReach(['instagram'])).toBeNull()
  })
})

describe('عنوانُ YouTube يُقال إن قُصّ (ر-4)', () => {
  it('سطرٌ أوّلُ فوق ‏100 محرف يُقال بما سيُرفع، وما دونه لا يُقال', () => {
    expect(cutTitle('عنوانٌ قصير\nوالوصفُ طويل')).toBeNull()
    expect(cutTitle(`${'ع'.repeat(100)}\nوصف`)).toBeNull()
    const cut = cutTitle(`${'كلمة '.repeat(30)}\nوصف`)!
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(100)
  })
})

describe('منشوراتُ المقطع تُجدوَل معًا (ر-4)', () => {
  const ACCOUNTS: LinkedAccount[] = [
    // ‏قناةُ YouTube تُحفَظ `org` دائمًا (`identity.ts`) — وهي وجهةٌ، لا صفحةُ شركة (D-087)
    { id: 'yt', platform: 'youtube', kind: 'org', displayName: 'قناة عمر', status: 'active', createdAt: '2026-09-01 00:00:00', expiresAt: null },
    { id: 'ig', platform: 'instagram', kind: 'member', displayName: 'omar', status: 'active', createdAt: '2026-09-01 00:00:00', expiresAt: null },
  ]
  const NOW = new Date('2026-10-04T08:00:00Z')
  const AT = new Date('2026-10-05T06:00:00Z')

  async function three(): Promise<string[]> {
    const r2 = multipart()
    await startUpload(db, r2.bucket, { ...META, bytes: 10 }, 'u1')
    await uploadPart(db, r2.bucket, 'u1', 1, new ArrayBuffer(10))
    await completeUpload(db, r2.bucket, 'u1', [{ partNumber: 1, etag: 'e1' }])
    for (const id of ['yt', 'ig']) {
      await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES (?, ?, ?, ?, 'x', 'active')`)
        .bind(id, id === 'yt' ? 'youtube' : 'instagram', id === 'yt' ? 'org' : 'member', id).run()
    }
    await postsFromUpload(db, { uploadId: 'u1', platforms: ['youtube', 'tiktok', 'instagram'], caption: 'نصّ', approve: true, by: 'o' })
    return (await listUploads(db))[0]!.posts.map((p) => p.id)
  }

  it('كلُّ منشورٍ عُرض إلى حساب منصّته في الموعد نفسِه، وما بلا حسابٍ يُسمّى بسببه', async () => {
    const shown = await three()
    const out = await scheduleFromUpload(db, { uploadId: 'u1', shown, accounts: ACCOUNTS, at: AT, now: NOW })
    expect([...out.scheduled].sort()).toEqual(['instagram', 'youtube'])
    expect(out.failed).toEqual([{ platform: 'tiktok', reason: 'لا حسابَ متّصلًا — اربطه أوّلًا' }])
    const rows = db.raw.prepare(`SELECT platform, status, account_id, scheduled_at FROM posts ORDER BY platform`).all()
    expect(rows).toEqual([
      { platform: 'instagram', status: 'queued', account_id: 'ig', scheduled_at: '2026-10-05 06:00:00' },
      { platform: 'tiktok', status: 'approved', account_id: null, scheduled_at: null },
      { platform: 'youtube', status: 'queued', account_id: 'yt', scheduled_at: '2026-10-05 06:00:00' },
    ])
  })

  it('ما لم يُعرَض لا يُجدوَل، والمجدولُ لا يُجدوَل مرّتين', async () => {
    const shown = await three()
    const yt = db.raw.prepare(`SELECT id FROM posts WHERE platform = 'youtube'`).get() as { id: string }
    const out = await scheduleFromUpload(db, { uploadId: 'u1', shown: [yt.id], accounts: ACCOUNTS, at: AT, now: NOW })
    expect(out).toEqual({ scheduled: ['youtube'], failed: [] })
    const again = await scheduleFromUpload(db, { uploadId: 'u1', shown, accounts: ACCOUNTS, at: AT, now: NOW })
    expect(again.scheduled).toEqual(['instagram'])
    expect((db.raw.prepare(`SELECT COUNT(*) AS n FROM posts WHERE status = 'queued'`).get() as { n: number }).n).toBe(2)
  })
})

/*
 * ‏**مكتبةٌ فوق المئة لا تُفرَغ** (مراجعة ر-5). كانت منشوراتُ المقاطع تُقرأ بـ `IN (?,?,…)` بمعاملٍ لكلّ
 * ‏مقطع، وD1 لا يقبل أكثرَ من ‏100 — واستيرادُ الخطّة يطلب ‏200. فرمى الاستعلامُ بعد المقطع الحادي بعد
 * ‏المئة، وأعاد `catch` مكتبةً فارغة، فقيل لكلّ صفٍّ «لا مقطعَ مرفوعًا». و`fakeDb` يحمل حدَّ D1 الآن.
 */
describe('مكتبةٌ فوق المئة (مراجعة ر-5)', () => {
  async function library(extra: number): Promise<void> {
    const r2 = multipart()
    await startUpload(db, r2.bucket, { ...META, bytes: 10 }, 'u1')
    await uploadPart(db, r2.bucket, 'u1', 1, new ArrayBuffer(10))
    await completeUpload(db, r2.bucket, 'u1', [{ partNumber: 1, etag: 'e1' }])
    await postsFromUpload(db, { uploadId: 'u1', platforms: ['youtube', 'instagram'], caption: 'نصّ', approve: false, by: 'o' })
    // ‏الأقدمُ في النافذة: آخرُ ما يُعرَض، فما يُربَط به يُقرأ من حافّتها
    db.raw.prepare(`UPDATE uploads SET created_at = '2026-01-01 00:00:00' WHERE id = 'u1'`).run()
    const add = db.raw.prepare(
      `INSERT INTO uploads (id, r2_key, name, mime, bytes, status, created_at, ready_at)
       VALUES (?, ?, ?, 'video/mp4', 10, 'ready', ?, ?)`,
    )
    for (let i = 0; i < extra; i += 1) {
      const at = `2026-02-01 00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`
      add.run(`x${i}`, `upload/x${i}.mp4`, `مقطع ${i}.mp4`, at, at)
    }
  }

  it('‏١٢١ مقطعًا بنافذة الخطّة (200): كلُّها، ومنشوراتُ أقدمِها معه', async () => {
    await library(120)
    const all = await listUploads(db, 200)
    expect(all).toHaveLength(121)
    expect(all.at(-1)!.id).toBe('u1')
    expect(all.at(-1)!.posts.map((p) => p.platform).sort()).toEqual(['instagram', 'youtube'])
    expect(all.slice(0, -1).every((u) => u.posts.length === 0)).toBe(true)
    // ‏ونافذةُ اللوحة (20) تبقى عشرين، والأقدمُ خارجها
    const board = await listUploads(db)
    expect(board).toHaveLength(20)
    expect(board.some((u) => u.id === 'u1')).toBe(false)
  })

  it('وتعثُّرُ قراءة المنشورات وحدَها لا يُفرغ المكتبة — تُعرَض بلا روابطها', async () => {
    await library(3)
    const broken = {
      ...db,
      prepare: (query: string) => {
        if (query.includes('FROM media m JOIN posts p')) throw new Error('D1_ERROR: لا يُقرأ')
        return db.prepare(query)
      },
    }
    const all = await listUploads(broken, 200)
    expect(all.map((u) => u.id)).toContain('u1')
    expect(all).toHaveLength(4)
    expect(all.every((u) => u.posts.length === 0)).toBe(true)
  })
})
