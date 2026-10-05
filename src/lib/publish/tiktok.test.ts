/**
 * **سائقُ TikTok — والبابُ يُختار من النطاق لا من إعداد.**
 *
 * وأخطرُ ما فيه ادّعاءُ نشرٍ لم يقع: مالكٌ يُقال له «نُشر» ثمّ لا يجده
 * على حسابه يظنّ العطلَ عندنا، **وهو ينتظره في صندوق التطبيق**.
 */
import { describe, expect, it } from 'vitest'
import { PublishError } from './platforms'
import { pickPrivacy, publishTikTok, TIKTOK_CAPTION_MAX } from './tiktok'

const CLIP = { bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), mime: 'video/mp4' }

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

let calls: Call[] = []

function net(
  options: {
    initStatus?: number
    putStatus?: number
    status?: string
    statusStatus?: number
    noUploadUrl?: boolean
    initBody?: unknown
  } = {},
): typeof fetch {
  calls = []
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)
    let body: unknown = null
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    } catch {
      body = init?.body
    }
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body,
    })

    if (url.includes('/init/')) {
      if ((options.initStatus ?? 200) !== 200) {
        return new Response(JSON.stringify({ error: { code: 'spam_risk_too_many_posts' } }), {
          status: options.initStatus ?? 500,
        })
      }
      return new Response(
        JSON.stringify(
          options.initBody ?? {
            data: {
              publish_id: 'pub-1',
              ...(options.noUploadUrl === true ? {} : { upload_url: 'https://up.tiktok/x' }),
            },
          },
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.includes('up.tiktok')) {
      return new Response('', { status: options.putStatus ?? 200 })
    }
    // status/fetch
    if ((options.statusStatus ?? 200) !== 200) {
      return new Response('{}', { status: options.statusStatus ?? 500 })
    }
    return new Response(
      JSON.stringify({ data: { status: options.status ?? 'PROCESSING_UPLOAD' } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

describe('البابان — والفرقُ يُقال', () => {
  it('بلا النشر المباشر يُنادى الصندوق، ويُقال إنّه صندوق', async () => {
    const out = await publishTikTok('tok', CLIP, 'وصف', false, net())
    expect(out.inbox).toBe(true)
    expect(calls[0]!.url).toContain('/inbox/video/init/')
    expect(out.platformPostId).toBe('pub-1')
  })

  it('ومعه تُنادى نهايةُ النشر المباشر', async () => {
    const out = await publishTikTok('tok', CLIP, 'وصف', true, net())
    expect(out.inbox).toBe(false)
    expect(calls[0]!.url).toContain('/v2/post/publish/video/init/')
    expect(calls[0]!.url).not.toContain('inbox')
  })

  it('والوصفُ يُرسَل مع النشر المباشر وحدَه — الصندوقُ لا يقبله', async () => {
    await publishTikTok('tok', CLIP, 'وصفُ المقطع', true, net())
    expect((calls[0]!.body as { post_info?: { title?: string } }).post_info?.title)
      .toBe('وصفُ المقطع')

    await publishTikTok('tok', CLIP, 'وصفُ المقطع', false, net())
    expect((calls[0]!.body as { post_info?: unknown }).post_info).toBeUndefined()
  })
})

describe('الدفعُ — قطعةٌ واحدةٌ بحجمها', () => {
  it('يعلن الحجمَ والقطعةَ الواحدة', async () => {
    await publishTikTok('tok', CLIP, 'وصف', false, net())
    const source = (calls[0]!.body as { source_info: Record<string, unknown> }).source_info
    expect(source['source']).toBe('FILE_UPLOAD')
    expect(source['video_size']).toBe(CLIP.bytes.length)
    expect(source['chunk_size']).toBe(CLIP.bytes.length)
    expect(source['total_chunk_count']).toBe(1)
  })

  it('و`Content-Range` يطابق الحجمَ بالضبط — وإلّا رُدّ الرفع', async () => {
    await publishTikTok('tok', CLIP, 'وصف', false, net())
    const put = calls.find((c) => c.method === 'PUT')!
    expect(put.headers['Content-Range']).toBe(`bytes 0-${CLIP.bytes.length - 1}/${CLIP.bytes.length}`)
    expect(put.headers['Content-Type']).toBe('video/mp4')
  })

  it('ومقطعٌ فارغٌ لا يُنادى به أحد', async () => {
    await expect(
      publishTikTok('tok', { bytes: new Uint8Array(0), mime: 'video/mp4' }, 'وصف', false, net()),
    ).rejects.toThrow(PublishError)
    expect(calls).toHaveLength(0)
  })

  it('والوصفُ يُقصّ عند حدّ المنصّة لا يُردّ الطلب', async () => {
    await publishTikTok('tok', CLIP, 'ن'.repeat(TIKTOK_CAPTION_MAX + 500), true, net())
    const title = (calls[0]!.body as { post_info?: { title?: string } }).post_info?.title ?? ''
    expect(title.length).toBe(TIKTOK_CAPTION_MAX)
  })
})

describe('الفشلُ يُسمّى، وقابليّةُ الإعادة من الرمز', () => {
  it('رفضُ التهيئة يحمل رمزَ المنصّة لا رقمَ الحالة وحده', async () => {
    await expect(publishTikTok('tok', CLIP, 'وصف', false, net({ initStatus: 400 })))
      .rejects.toThrow(/spam_risk_too_many_posts/)
  })

  it('و٤٢٩ تُعاد، و٤٠٠ لا', async () => {
    const tooMany = await publishTikTok('tok', CLIP, 'و', false, net({ initStatus: 429 }))
      .catch((e: PublishError) => e)
    expect((tooMany as PublishError).retryable).toBe(true)

    const bad = await publishTikTok('tok', CLIP, 'و', false, net({ initStatus: 400 }))
      .catch((e: PublishError) => e)
    expect((bad as PublishError).retryable).toBe(false)
  })

  it('وتهيئةٌ بلا عنوانِ رفعٍ تُردّ ولا تُدفَع بايتاتٌ إلى العدم', async () => {
    await expect(publishTikTok('tok', CLIP, 'و', false, net({ noUploadUrl: true })))
      .rejects.toThrow(/upload_url/)
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
  })

  it('و`FAILED` رفضٌ معلَنٌ لا يُعاد — يُردّ بالبايتات نفسِها', async () => {
    const error = await publishTikTok('tok', CLIP, 'و', false, net({ status: 'FAILED' }))
      .catch((e: PublishError) => e)
    expect((error as PublishError).retryable).toBe(false)
    expect((error as PublishError).message).toContain('FAILED')
  })
})

/**
 * **وسؤالُ الحال قراءةٌ بعد الرفع لا شرطٌ له.**
 *
 * فمن عدَّ النجاحَ فشلا لأنّ القراءةَ سقطت **أعاد الرفعَ من الطابور فرفع
 * المقطعَ مرّتين** — وهو ما يحرسه D-004 كلُّه.
 */
describe('سقوطُ سؤال الحال لا يُسقِط رفعا وقع', () => {
  it('ردٌّ ٥٠٠ على الحال يبقى نجاحا', async () => {
    const out = await publishTikTok('tok', CLIP, 'و', false, net({ statusStatus: 500 }))
    expect(out.platformPostId).toBe('pub-1')
    expect(out.response).toMatchObject({ status: 'UNKNOWN' })
  })

  it('ومعالجةٌ لم تنتهِ بعد نجاحٌ كذلك — البايتاتُ وصلت', async () => {
    const out = await publishTikTok('tok', CLIP, 'و', false, net({ status: 'PROCESSING_UPLOAD' }))
    expect(out.platformPostId).toBe('pub-1')
  })
})

/*
 * ‏**مَن يرى المنشورَ المباشر** (D-190): `SELF_ONLY` ما لم يقلب المالكُ العلنيَّ بعد الإجازة.
 * ‏وإذا قلبه سُئلت TikTok أوّلًا عمّا يسمح به الحساب — والصندوقُ لا خيارَ فيه فلا يُسأل.
 */
describe('العلنيُّ بعد الإجازة', () => {
  function withCreator(options: { offered?: string[]; status?: number } = {}): typeof fetch {
    const inner = net()
    return (async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.includes('/creator_info/')) {
        calls.push({ url, method: init?.method ?? 'GET', headers: {}, body: null })
        if ((options.status ?? 200) !== 200) {
          return new Response(JSON.stringify({ error: { code: 'access_token_invalid' } }), { status: options.status ?? 500 })
        }
        return Response.json({ data: { privacy_level_options: options.offered ?? ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] }, error: { code: 'ok' } })
      }
      return inner(input as RequestInfo, init)
    }) as unknown as typeof fetch
  }
  const initBody = (): { post_info?: { privacy_level?: string } } =>
    calls.find((c) => c.url.includes('/video/init/'))!.body as { post_info?: { privacy_level?: string } }

  it('بلا قلبٍ: SELF_ONLY ولا سؤال — كما كان', async () => {
    const out = await publishTikTok('tok', CLIP, 'وصف', true, withCreator())
    expect(calls.some((c) => c.url.includes('/creator_info/'))).toBe(false)
    expect(initBody().post_info?.privacy_level).toBe('SELF_ONLY')
    expect(out.privacy).toBe('SELF_ONLY')
  })

  it('بالقلب: يُسأل الحسابُ قبل التهيئة، وPUBLIC_TO_EVERYONE إن عُرض', async () => {
    const out = await publishTikTok('tok', CLIP, 'وصف', true, withCreator(), { public: true })
    expect(calls[0]!.url).toContain('/creator_info/query/')
    expect(initBody().post_info?.privacy_level).toBe('PUBLIC_TO_EVERYONE')
    expect(out).toMatchObject({ privacy: 'PUBLIC_TO_EVERYONE', request: { privacy_level: 'PUBLIC_TO_EVERYONE' } })
  })

  it('وحسابٌ لا يُعرض فيه العامّ: أضيقُ ما عُرض، لا أوسعُه', async () => {
    await publishTikTok('tok', CLIP, 'وصف', true, withCreator({ offered: ['FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS'] }), { public: true })
    expect(initBody().post_info?.privacy_level).toBe('MUTUAL_FOLLOW_FRIENDS')
    expect(pickPrivacy(['FOLLOWER_OF_CREATOR', 'SELF_ONLY'])).toBe('SELF_ONLY')
    expect(pickPrivacy([])).toBe('SELF_ONLY')
  })

  it('وسؤالٌ رُدّ يُسقط النشرَ بسببه — ولا يُفتح رفعٌ ولا يُنشر خاصًّا بصمت', async () => {
    await expect(publishTikTok('tok', CLIP, 'وصف', true, withCreator({ status: 401 }), { public: true }))
      .rejects.toThrow(PublishError)
    expect(calls.some((c) => c.url.includes('/init/'))).toBe(false)
  })

  it('والصندوقُ لا خيارَ فيه: لا سؤالَ ولا مستوى', async () => {
    const out = await publishTikTok('tok', CLIP, 'وصف', false, withCreator(), { public: true })
    expect(calls.some((c) => c.url.includes('/creator_info/'))).toBe(false)
    expect(out.privacy).toBeNull()
  })
})
