/**
 * رفعُ الوسيط إلى X — **الفئةُ إلزاميّة** (D-176).
 *
 * أوّلُ منشورٍ بإنفوجرافيك على staging ردّه X ‏400 «Invalid Request»: كان الطلبُ
 * يحمل `media` وحدها، و`POST /2/media/upload` يطلب `media_category` معها.
 */
import { describe, expect, it } from 'vitest'
import { PublishError, publishLinkedIn, publishX, uploadXMedia, xMediaCategory } from './platforms'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

describe('uploadXMedia', () => {
  it('يرسل الوسيط وفئتَه، ويقرأ معرّف v2', async () => {
    let sent: FormData | null = null
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = init?.body as FormData
      return Response.json({ data: { id: 'media-1' } })
    }) as typeof fetch
    const id = await uploadXMedia('token', { bytes: PNG, mime: 'image/png' }, fetchImpl)
    expect(id).toBe('media-1')
    const form = sent as unknown as FormData
    expect(form.get('media_category')).toBe('tweet_image')
    expect(form.get('media')).toBeInstanceOf(Blob)
  })

  it('والرفض يسمّي الحقل الذي سمّاه X — لا «Invalid Request» وحدها', async () => {
    const fetchImpl = (async () =>
      Response.json(
        { title: 'Invalid Request', errors: [{ message: 'The `media_category` field can not be empty' }] },
        { status: 400 },
      )) as unknown as typeof fetch
    const failure = await uploadXMedia('token', { bytes: PNG, mime: 'image/png' }, fetchImpl).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(PublishError)
    expect((failure as PublishError).message).toBe(
      'x: تعذّر رفع الوسيط (Invalid Request · The `media_category` field can not be empty)',
    )
  })

  it('والفئة من النوع', () => {
    expect(xMediaCategory('image/jpeg')).toBe('tweet_image')
    expect(xMediaCategory('image/gif')).toBe('tweet_gif')
    expect(xMediaCategory('video/mp4')).toBe('tweet_video')
  })
})

/**
 * ‏**نصُّ LinkedIn يُرسَل بصيغة «little» لا كما كُتب** (D-324). كان `commentary` النصَّ الخامّ، وLinkedIn تقرأ ما بين
 * ‏القوسين وما بعد @ و# عناصرَ — فقوسٌ في نصٍّ عربيٍّ يبتر المنشورَ بعد أن اعتمده المالكُ كاملًا.
 */
describe('publishLinkedIn', () => {
  it('يهرّب المحجوزَ في commentary، والوسمُ بقالبه', async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } })
    }) as typeof fetch
    await publishLinkedIn('token', 'urn:li:person:abc', 'ثلاث خطوات (لا أكثر) لـ a_b و@عمر.\n\n#الحوكمة', fetchImpl)
    expect(body['commentary']).toBe('ثلاث خطوات \\(لا أكثر\\) لـ a\\_b و\\@عمر.\n\n{hashtag|\\#|الحوكمة}')
  })
})

/** ‏**والردُّ على تغريدةٍ سابقة** (D-324): سلسلةُ X تُنشَر تغريدةً تردّ على التي قبلها. */
describe('publishX', () => {
  it('يحمل reply.in_reply_to_tweet_id حين يُعطى، ولا يحمله حين لا يُعطى', async () => {
    const sent: Record<string, unknown>[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json({ data: { id: `t${sent.length}` } })
    }) as typeof fetch
    await publishX('token', 'الأولى', fetchImpl)
    await publishX('token', 'الثانية', fetchImpl, null, 't1')
    expect(sent[0]).toEqual({ text: 'الأولى' })
    expect(sent[1]).toEqual({ text: 'الثانية', reply: { in_reply_to_tweet_id: 't1' } })
  })
})
