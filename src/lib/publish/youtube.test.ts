/**
 * **سائقُ YouTube — والعقدُ مقروءٌ من وثيقة Google الآليّة.**
 *
 * وأخطرُ ما فيه رفضٌ **بعد** رفع البايتات: حصّةُ اليوم ستُّ رفعاتٍ
 * تقريبا، **وواحدةٌ تُهدر على عنوانٍ فيه زاويّة**. فما يُمكن ردُّه قبل
 * النداء يُردّ قبله.
 */
import { describe, expect, it } from 'vitest'
import { PublishError } from './platforms'
import {
  publishYouTube, youtubeDescription, youtubeTitle, YT_CATEGORY, YT_DESCRIPTION_MAX, YT_PRIVACY, YT_PUBLIC, YT_TITLE_MAX,
} from './youtube'
import { youtubeText } from '../media/uploads'

const CLIP = { bytes: new Uint8Array([1, 2, 3, 4, 5, 6]), mime: 'video/mp4' }
const SESSION = 'https://upload.googleapis.com/session/abc'

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
    reason?: string
    noLocation?: boolean
    putBody?: unknown
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

    if (url.startsWith(SESSION)) {
      if ((options.putStatus ?? 200) !== 200) {
        return new Response(JSON.stringify({ error: { errors: [{ reason: 'uploadLimitExceeded' }] } }), {
          status: options.putStatus ?? 500,
        })
      }
      return new Response(JSON.stringify(options.putBody ?? { id: 'vid-9' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if ((options.initStatus ?? 200) !== 200) {
      return new Response(
        JSON.stringify({ error: { errors: [{ reason: options.reason ?? 'forbidden' }] } }),
        { status: options.initStatus ?? 500 },
      )
    }
    return new Response('', {
      status: 200,
      headers: options.noLocation === true ? {} : { Location: SESSION },
    })
  }) as unknown as typeof fetch
}

describe('الخطوتان — وصفٌ ثمّ بايتات', () => {
  it('التهيئةُ بلا بايتات، والرفعُ على عنوان الجلسة', async () => {
    const out = await publishYouTube('tok', CLIP, 'عنوانُ المقطع', net())
    expect(out.platformPostId).toBe('vid-9')
    expect(calls).toHaveLength(2)
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.url).toContain('uploadType=resumable')
    expect(calls[0]!.url).toContain('part=snippet,status')
    expect(calls[1]!.method).toBe('PUT')
    expect(calls[1]!.url).toBe(SESSION)
  })

  it('والحجمُ والنوعُ يُعلَنان في التهيئة — فيُردّ الكبيرُ قبل رفعه', async () => {
    await publishYouTube('tok', CLIP, 'عنوان', net())
    expect(calls[0]!.headers['X-Upload-Content-Length']).toBe(String(CLIP.bytes.length))
    expect(calls[0]!.headers['X-Upload-Content-Type']).toBe('video/mp4')
  })

  it('**ولا إذنَ في دفعة البايتات** — العنوانُ نفسُه هو الإذن', async () => {
    await publishYouTube('tok', CLIP, 'عنوان', net())
    expect(calls[0]!.headers['Authorization']).toBe('Bearer tok')
    expect(calls[1]!.headers['Authorization']).toBeUndefined()
  })

  it('والوصفُ يحمل القيمَ المقروءةَ من الوثيقة', async () => {
    await publishYouTube('tok', CLIP, 'عنوانٌ\nثمّ وصف', net())
    const meta = calls[0]!.body as {
      snippet: { title: string; description: string; categoryId: string }
      status: { privacyStatus: string; selfDeclaredMadeForKids: boolean }
    }
    expect(meta.snippet.categoryId).toBe(YT_CATEGORY)
    expect(meta.status.privacyStatus).toBe(YT_PRIVACY)
    expect(meta.status.selfDeclaredMadeForKids).toBe(false)
    // والسرّيّةُ من `schemas.VideoStatus.privacyStatus.enum`
    expect(['public', 'unlisted', 'private']).toContain(meta.status.privacyStatus)
  })

  it('**ويُقال إنّه خاصّ** — فلا يُبحَث عنه على القناة علنا', async () => {
    const out = await publishYouTube('tok', CLIP, 'عنوان', net())
    expect(out.private).toBe(true)
  })

  it('وللعامّة حين قلبه المالكُ بعد الإجازة (D-190) — ويُقال إنّه ليس خاصًّا', async () => {
    const out = await publishYouTube('tok', CLIP, 'عنوان', net(), { public: true })
    const meta = calls[0]!.body as { status: { privacyStatus: string } }
    expect(meta.status.privacyStatus).toBe(YT_PUBLIC)
    expect(out.private).toBe(false)
    expect(out.request).toMatchObject({ privacy: 'public' })
  })
})

describe('العنوان — يُقصّ ويُنقّى قبل النداء', () => {
  /*
   * ‏**والعنوانُ لا يتكرّر في أوّل الوصف** (مراجعة D-190): كان الوصفُ النصَّ كلَّه، فبدأ وصفُ كلِّ
   * ‏مقطعٍ بعنوانه، وحقلُ «وصف YouTube» الذي راجعه المالكُ ليس فيه عنوان.
   */
  it('أوّلُ سطرٍ عنوانٌ، وما بعده وصف — بلا العنوان مكرّرًا', async () => {
    await publishYouTube('tok', CLIP, 'الحوكمةُ تسبق السرعة\n\nوهذا شرحُها.', net())
    const meta = calls[0]!.body as { snippet: { title: string; description: string } }
    expect(meta.snippet.title).toBe('الحوكمةُ تسبق السرعة')
    expect(meta.snippet.description).toBe('وهذا شرحُها.')
  })

  it('ونصٌّ من حقلَي المقطع يُرفع كما حُرّر: العنوانُ عنوانًا والوصفُ وصفًا', async () => {
    const text = youtubeText('القيادةُ في أوّل مئة يوم', 'ما يقرّره القائدُ أوّلًا.\n\n#قيادة #Shorts')
    await publishYouTube('tok', CLIP, text, net())
    const meta = calls[0]!.body as { snippet: { title: string; description: string } }
    expect(meta.snippet).toMatchObject({
      title: 'القيادةُ في أوّل مئة يوم',
      description: 'ما يقرّره القائدُ أوّلًا.\n\n#قيادة #Shorts',
    })
  })

  it('وعنوانٌ يُقصّ أو نصٌّ من سطرٍ واحدٍ يبقى وصفُه النصَّ كلَّه — لا تضيع جملةٌ ولا يُرفع وصفٌ فارغ', () => {
    expect(youtubeDescription('عنوانٌ وحده')).toBe('عنوانٌ وحده')
    const long = `${'كلمة '.repeat(30).trim()}\nوالباقي`
    expect(youtubeDescription(long)).toBe(long)
    expect(youtubeDescription('أ <ب>\nوصف')).toBe('أ <ب>\nوصف')
    expect(youtubeDescription('عنوان\nوصفٌ بسطرٍ واحد')).toBe('وصفٌ بسطرٍ واحد')
  })

  /**
   * **والزاويّتان تُنزَعان**: ترفض Google العنوانَ الحاملَ لهما بـ
   * `invalidVideoMetadata` — **ورفضٌ بعد رفع البايتات يُهدر حصّةَ اليوم**.
   */
  it('ولا زاويّةَ في العنوان', () => {
    expect(youtubeTitle('<script>عنوان</script>')).not.toContain('<')
    expect(youtubeTitle('<script>عنوان</script>')).not.toContain('>')
    expect(youtubeTitle('أ < ب')).toBe('أ  ب')
  })

  it('ويُقصّ عند مئةٍ بلا بترِ كلمة', () => {
    const long = `${'كلمة '.repeat(60)}`
    const title = youtubeTitle(long)
    expect(title.length).toBeLessThanOrEqual(YT_TITLE_MAX)
    expect(title.endsWith('…')).toBe(true)
  })

  it('ونصٌّ فارغٌ يعطي عنوانا صالحا لا فراغا يُردّ', () => {
    for (const text of ['', '   ', '\n\n', '<>']) {
      expect(youtubeTitle(text).length, JSON.stringify(text)).toBeGreaterThan(0)
    }
  })

  it('والوصفُ يُقصّ عند حدّه', async () => {
    await publishYouTube('tok', CLIP, 'ن'.repeat(YT_DESCRIPTION_MAX + 400), net())
    const meta = calls[0]!.body as { snippet: { description: string } }
    expect(meta.snippet.description.length).toBe(YT_DESCRIPTION_MAX)
  })
})

describe('الفشلُ يُسمّى، والإعادةُ من الرمز', () => {
  it('سببُ Google يُنقَل لا رقمُ الحالة وحده', async () => {
    await expect(publishYouTube('tok', CLIP, 'ع', net({ initStatus: 403, reason: 'forbidden' })))
      .rejects.toThrow(/forbidden/)
  })

  it('**وحصّةُ اليوم تُقال بلغتها** — لا «٤٠٣» يُبحَث عنه', async () => {
    const error = await publishYouTube(
      'tok', CLIP, 'ع', net({ initStatus: 403, reason: 'quotaExceeded' }),
    ).catch((e: PublishError) => e)
    expect((error as PublishError).message).toContain('حصّةَ اليوم')
    expect((error as PublishError).retryable).toBe(false)
  })

  it('و٥٠٠ تُعاد، و٤٠٠ لا', async () => {
    const tired = await publishYouTube('tok', CLIP, 'ع', net({ initStatus: 503 }))
      .catch((e: PublishError) => e)
    expect((tired as PublishError).retryable).toBe(true)

    const bad = await publishYouTube('tok', CLIP, 'ع', net({ initStatus: 400 }))
      .catch((e: PublishError) => e)
    expect((bad as PublishError).retryable).toBe(false)
  })

  it('وتهيئةٌ بلا `Location` تُردّ ولا تُدفَع بايتاتٌ إلى العدم', async () => {
    await expect(publishYouTube('tok', CLIP, 'ع', net({ noLocation: true })))
      .rejects.toThrow(/Location/)
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0)
  })

  it('ورفعٌ نجح بلا معرّفٍ لا يُعدّ نجاحا — صفٌّ بلا معرّفٍ يكذب', async () => {
    await expect(publishYouTube('tok', CLIP, 'ع', net({ putBody: {} })))
      .rejects.toThrow(/معرّف/)
  })

  it('ومقطعٌ فارغٌ لا يُنادى به أحد', async () => {
    await expect(
      publishYouTube('tok', { bytes: new Uint8Array(0), mime: 'video/mp4' }, 'ع', net()),
    ).rejects.toThrow(PublishError)
    expect(calls).toHaveLength(0)
  })
})
