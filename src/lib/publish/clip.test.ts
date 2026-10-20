/**
 * المقطعُ قطعًا (D-179): القراءةُ بالمدى، وتقطيعُ TikTok من وثيقته، وجلسةُ YouTube
 * المستأنَفة — وأكبرُ ما يُطلَب من الدلو قطعةٌ واحدة.
 */
import { describe, expect, it } from 'vitest'
import { bucketClip, bytesClip, tiktokChunks, TIKTOK_CHUNK, YOUTUBE_CHUNK } from './clip'
import { publishTikTok } from './tiktok'
import { publishYouTube } from './youtube'

const MB = 1024 * 1024

/** دلوٌ يقرأ المدى ويحصي ما طُلب — بلا بايتاتٍ حقيقيّة: كلُّ قطعةٍ بطولها أصفار. */
function rangedBucket(size: number) {
  const asked: { offset: number; length: number }[] = []
  return {
    asked,
    async head() { return { size } },
    async get(_key: string, options?: { range: { offset: number; length: number } }) {
      const range = options?.range ?? { offset: 0, length: size }
      asked.push(range)
      return { async arrayBuffer() { return new ArrayBuffer(range.length) } }
    },
  }
}

describe('tiktokChunks', () => {
  it('ما دون القطعة مرّةً واحدة، وما فوقها floor والأخيرة تمتصّ الباقي', () => {
    expect(tiktokChunks(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 })
    expect(tiktokChunks(TIKTOK_CHUNK)).toEqual({ chunkSize: TIKTOK_CHUNK, count: 1 })
    expect(tiktokChunks(100 * MB)).toEqual({ chunkSize: TIKTOK_CHUNK, count: 3 })
  })
})

describe('bucketClip', () => {
  it('يقرأ الحجم من الرأس والقطعة بمداها — لا الكائن كلَّه', async () => {
    const bucket = rangedBucket(100 * MB)
    const clip = await bucketClip(bucket, 'video/p/m.mp4', 'video/mp4')
    expect(clip!.size).toBe(100 * MB)
    const part = await clip!.read(32 * MB, 4 * MB)
    expect(part.length).toBe(4 * MB)
    expect(bucket.asked).toEqual([{ offset: 32 * MB, length: 4 * MB }])
  })

  it('ودلو بلا رأس يُقرأ كاملًا مرّة، وغياب الكائن null', async () => {
    const whole = { async get() { return { async arrayBuffer() { return new Uint8Array([1, 2, 3, 4]).buffer } } } }
    const clip = await bucketClip(whole, 'k', 'video/mp4')
    expect(Array.from(await clip!.read(1, 2))).toEqual([2, 3])
    expect(await bucketClip({ async get() { return null } }, 'k', 'video/mp4')).toBeNull()
  })
})

describe('publishTikTok قطعًا', () => {
  it('مقطع ‏100MB: ثلاث قطع بترتيبها، والأخيرة تمتصّ الباقي، والتهيئة تعلن العدد', async () => {
    const bucket = rangedBucket(100 * MB)
    const clip = (await bucketClip(bucket, 'k', 'video/mp4'))!
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init })
      if (url.includes('/init/')) return Response.json({ data: { publish_id: 'pub-1', upload_url: 'https://up.tiktok/u' } })
      if (url === 'https://up.tiktok/u') return new Response(null, { status: 206 })
      return Response.json({ data: { status: 'SEND_TO_USER_INBOX' } })
    }) as unknown as typeof fetch
    await publishTikTok('t', clip, 'وصف', false, fetchImpl)

    const init = JSON.parse(String(calls[0]!.init.body)) as { source_info: { chunk_size: number; total_chunk_count: number } }
    expect(init.source_info).toMatchObject({ chunk_size: TIKTOK_CHUNK, total_chunk_count: 3 })
    const ranges = calls.filter((c) => c.url === 'https://up.tiktok/u')
      .map((c) => (c.init.headers as Record<string, string>)['Content-Range'])
    expect(ranges).toEqual([
      `bytes 0-${TIKTOK_CHUNK - 1}/${100 * MB}`,
      `bytes ${TIKTOK_CHUNK}-${2 * TIKTOK_CHUNK - 1}/${100 * MB}`,
      `bytes ${2 * TIKTOK_CHUNK}-${100 * MB - 1}/${100 * MB}`,
    ])
    // ‏وأكبرُ قراءةٍ من الدلو هي الأخيرة (‏36MB) — لا المقطعُ كلُّه
    expect(Math.max(...bucket.asked.map((a) => a.length))).toBe(100 * MB - 2 * TIKTOK_CHUNK)
  })
})

describe('publishYouTube قطعًا', () => {
  it('ما قبل الأخيرة يُجاب بـ ‏308 فيُكمَل، والأخيرة تعيد المعرّف', async () => {
    const size = YOUTUBE_CHUNK * 2 + 1000
    const clip = (await bucketClip(rangedBucket(size), 'k', 'video/mp4'))!
    const puts: Record<string, string>[] = []
    const fetchImpl = (async (url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') return new Response(null, { status: 200, headers: { Location: 'https://upload.google/session' } })
      puts.push(init.headers as Record<string, string>)
      expect(init.redirect).toBe('manual')
      // ‏Google تقول في ‏308 آخرَ بايتٍ حفظته
      const range = (init.headers as Record<string, string>)['Content-Range']!
      const last = Number(/-(\d+)\//.exec(range)![1])
      return puts.length < 3 ? new Response(null, { status: 308, headers: { Range: `bytes=0-${last}` } }) : Response.json({ id: 'vid-9' })
    }) as unknown as typeof fetch
    const out = await publishYouTube('t', clip, 'عنوان', fetchImpl)
    expect(out.platformPostId).toBe('vid-9')
    expect(puts.map((h) => h['Content-Range'])).toEqual([
      `bytes 0-${YOUTUBE_CHUNK - 1}/${size}`,
      `bytes ${YOUTUBE_CHUNK}-${2 * YOUTUBE_CHUNK - 1}/${size}`,
      `bytes ${2 * YOUTUBE_CHUNK}-${size - 1}/${size}`,
    ])
  })

  it('ومن حيث حفظت Google: قطعة حُفظ بعضُها تُستأنَف من حدّها، وغياب Range يعيد من الصفر (D-182)', async () => {
    const MBs = 1024 * 1024
    const size = YOUTUBE_CHUNK + 1000
    const clip = (await bucketClip(rangedBucket(size), 'k', 'video/mp4'))!
    const sent: string[] = []
    const fetchImpl = (async (_url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') return new Response(null, { status: 200, headers: { Location: 'https://upload.google/s' } })
      sent.push((init.headers as Record<string, string>)['Content-Range']!)
      // ‏الأولى: حُفظ ‏20MB من ‏32، والثانية: تكمل من 20MB
      if (sent.length === 1) return new Response(null, { status: 308, headers: { Range: `bytes=0-${20 * MBs - 1}` } })
      return Response.json({ id: 'v2' })
    }) as unknown as typeof fetch
    await publishYouTube('t', clip, 'x', fetchImpl)
    expect(sent).toEqual([`bytes 0-${YOUTUBE_CHUNK - 1}/${size}`, `bytes ${20 * MBs}-${size - 1}/${size}`])

    // ‏خادمٌ لا يتقدّم أبدًا: يُردّ قابلًا للإعادة لا حلقةً بلا نهاية
    const stuck = (async (_url: string, init: RequestInit = {}) =>
      init.method === 'POST'
        ? new Response(null, { status: 200, headers: { Location: 'https://upload.google/s' } })
        : new Response(null, { status: 308 })) as unknown as typeof fetch
    const failure = await publishYouTube('t', clip, 'x', stuck).catch((e: { retryable: boolean }) => e)
    expect((failure as { retryable: boolean }).retryable).toBe(true)
  })

  it('والمقطع الصغير طلب واحد بلا Content-Range كما كان', async () => {
    let put: Record<string, string> = {}
    const fetchImpl = (async (_url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') return new Response(null, { status: 200, headers: { Location: 'https://upload.google/s' } })
      put = init.headers as Record<string, string>
      return Response.json({ id: 'v1' })
    }) as unknown as typeof fetch
    await publishYouTube('t', bytesClip({ bytes: new Uint8Array(10), mime: 'video/mp4' }), 'x', fetchImpl)
    expect(put['Content-Range']).toBeUndefined()
    expect(put['Content-Length']).toBe('10')
  })
})
