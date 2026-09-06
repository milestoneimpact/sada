/**
 * سائقُ Workers AI — برابطٍ مزيّف.
 *
 * و`env.AI` لا وجود له خارج Worker، فالرابطُ يُحاكى بواجهته وحدها —
 * وما يُثبَت هنا هو **معالجةُ الجواب**، لا أنّ المزوّد يعمل.
 */
import { describe, expect, it } from 'vitest'
import {
  AiError, IMAGE_MODELS, MAX_SECONDS, MIN_SECONDS, VIDEO_MODELS,
  clampDuration, fetchVideoBytes, generateImage, generateVideo, type AiBinding,
} from './workersAi'

function ai(reply: unknown | ((m: string, i: Record<string, unknown>) => unknown)): AiBinding & {
  calls: { model: string; input: Record<string, unknown> }[]
} {
  const calls: { model: string; input: Record<string, unknown> }[] = []
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input })
      if (typeof reply === 'function') {
        return (reply as (m: string, i: Record<string, unknown>) => unknown)(model, input)
      }
      return reply
    },
  }
}

function throwing(message: string): AiBinding {
  return { async run() { throw new Error(message) } }
}

const PNG_B64 = 'iVBORw0KGgo='

describe('الصورة', () => {
  it('تُقرأ من base64', async () => {
    const out = await generateImage(ai({ image: PNG_B64 }), 'قمّةٌ عند الفجر')
    expect(out.bytes.byteLength).toBeGreaterThan(0)
    expect(out.mime).toBe('image/png')
  })

  it('وتُقرأ من تدفّقٍ كذلك — والشكلُ يختلف بين النماذج فيُفحَص', async () => {
    const stream = new Response(new Uint8Array([1, 2, 3])).body!
    const out = await generateImage(ai(stream), 'ن')
    expect(Array.from(out.bytes)).toEqual([1, 2, 3])
  })

  it('والنموذجُ الافتراضيّ يُذكَر في النتيجة — فيُسجَّل على الصفّ', async () => {
    const out = await generateImage(ai({ image: PNG_B64 }), 'ن')
    expect(out.model).toBe(IMAGE_MODELS.lucid)
  })

  it('وجوابٌ بلا صورةٍ يُردّ ولا يُخمَّن', async () => {
    await expect(generateImage(ai({}), 'ن')).rejects.toBeInstanceOf(AiError)
    await expect(generateImage(ai({ image: '' }), 'ن')).rejects.toBeInstanceOf(AiError)
  })

  it('وتدفّقٌ فارغٌ يُعدّ عطلا يُعاد — لا صورةً صفرَ البايتات', async () => {
    const empty = new Response(new Uint8Array(0)).body!
    await expect(generateImage(ai(empty), 'ن')).rejects.toMatchObject({ retryable: true })
  })

  /** «نفدت السعة» يُعاد، و«النموذج غير موجود» لا يُعاد. */
  it('و«نفدت السعة» يُعاد، وخطأُ الاسم لا يُعاد', async () => {
    await expect(generateImage(throwing('3040 Out of capacity'), 'ن'))
      .rejects.toMatchObject({ retryable: true })
    await expect(generateImage(throwing('No such model'), 'ن'))
      .rejects.toMatchObject({ retryable: false })
  })
})

describe('الفيديو', () => {
  const ok = { state: 'Completed', result: { video: 'https://cf.example/v.mp4' } }

  it('يعيد الرابط', async () => {
    const out = await generateVideo(ai(ok), { imageUrl: 'https://s/1.png', prompt: 'ن' })
    expect(out.url).toBe('https://cf.example/v.mp4')
    expect(out.model).toBe(VIDEO_MODELS.fromImage)
  })

  /** الرأسيُّ هو الأصل: Shorts و Reels و TikTok كلُّها رأسيّة. */
  it('والرأسيُّ 9:16 هو الأصل — خطٌّ واحدٌ يخدم ثلاث منصّات', async () => {
    const a = ai(ok)
    await generateVideo(a, { imageUrl: 'https://s/1.png', prompt: 'ن' })
    expect(a.calls[0]!.input['ratio']).toBe('9:16')
    expect(a.calls[0]!.input['resolution']).toBe('720P')
  })

  it('والمدّةُ تُقصّ عندنا لا تُترك لتُردّ عند المزوّد', () => {
    expect(clampDuration(0)).toBe(MIN_SECONDS)
    expect(clampDuration(2)).toBe(MIN_SECONDS)
    expect(clampDuration(9)).toBe(9)
    expect(clampDuration(60)).toBe(MAX_SECONDS)
    expect(clampDuration(Number.NaN)).toBe(MAX_SECONDS)
  })

  it('وتُمرَّر مقصوصةً في النداء', async () => {
    const a = ai(ok)
    await generateVideo(a, { imageUrl: 'https://s/1.png', prompt: 'ن', durationSeconds: 99 })
    expect(a.calls[0]!.input['duration']).toBe(MAX_SECONDS)
  })

  /** حالةٌ غيرُ مكتملةٍ ليست كذبا: النموذجُ طويل، فتُعاد لا تُكذَّب. */
  it('وحالةٌ غيرُ مكتملةٍ تُعاد ولا تُعدّ فشلا', async () => {
    await expect(
      generateVideo(ai({ state: 'Running' }), { imageUrl: 'https://s/1.png', prompt: 'ن' }),
    ).rejects.toMatchObject({ retryable: true })
  })

  it('ورابطٌ ليس https يُردّ — ولا يُوثَق بما يعود', async () => {
    for (const video of ['http://x/v.mp4', '', 'javascript:alert(1)', 42]) {
      await expect(
        generateVideo(ai({ state: 'Completed', result: { video } }), {
          imageUrl: 'https://s/1.png', prompt: 'ن',
        }),
      ).rejects.toBeInstanceOf(AiError)
    }
  })
})

describe('سحبُ البايتات', () => {
  const bytes = (n: number): typeof fetch =>
    (async () =>
      new Response(new Uint8Array(n), {
        headers: { 'Content-Type': 'video/mp4' },
      })) as unknown as typeof fetch

  it('يسحب ويقرأ النوع', async () => {
    const out = await fetchVideoBytes('https://x/v.mp4', bytes(10))
    expect(out.bytes.byteLength).toBe(10)
    expect(out.mime).toBe('video/mp4')
  })

  /** رابطٌ لا يُسحَب فورا يُفقَد: هو عند المزوّد لا عندنا. */
  it('وفارغٌ يُعدّ عطلا يُعاد — لا فيديو صفرَ البايتات', async () => {
    await expect(fetchVideoBytes('https://x/v.mp4', bytes(0)))
      .rejects.toMatchObject({ retryable: true })
  })

  it('وأكبرُ من الحدّ يُردّ ولا يُعاد — الإعادةُ تكرّر الحجمَ نفسه', async () => {
    await expect(fetchVideoBytes('https://x/v.mp4', bytes(100), 10))
      .rejects.toMatchObject({ retryable: false })
  })

  it('و 5xx يُعاد، و 4xx لا يُعاد', async () => {
    const status = (s: number): typeof fetch =>
      (async () => new Response('', { status: s })) as unknown as typeof fetch
    await expect(fetchVideoBytes('https://x/v.mp4', status(503)))
      .rejects.toMatchObject({ retryable: true })
    await expect(fetchVideoBytes('https://x/v.mp4', status(404)))
      .rejects.toMatchObject({ retryable: false })
  })

  it('وعطلُ شبكةٍ يُعاد', async () => {
    const dead = (async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    await expect(fetchVideoBytes('https://x/v.mp4', dead))
      .rejects.toMatchObject({ retryable: true })
  })
})

describe('السجلّ', () => {
  /**
   * **الجيلُ الأوّل هو المختار لا الأحدث.**
   *
   * و`hh1.1` أجودُ — **و`hh1` وحده موسومٌ «Zero data retention»**.
   * ومحتوانا من مستنداتِ Drive الخاصّة، فالفرقُ ليس تفصيلا. واختبارٌ
   * يثبّته يمنع ترقيةً تبدو تحسينا وهي تنازلٌ عن خصوصيّة.
   */
  it('نموذجُ الفيديو الافتراضيّ هو hh1 لا hh1.1', () => {
    expect(VIDEO_MODELS.fromImage).toBe('alibaba/hh1-i2v')
    expect(VIDEO_MODELS.fromImage).not.toContain('1.1')
  })

  it('ولا اسمَ نموذجٍ فارغ', () => {
    for (const name of [...Object.values(IMAGE_MODELS), ...Object.values(VIDEO_MODELS)]) {
      expect(name.length).toBeGreaterThan(4)
    }
  })
})
