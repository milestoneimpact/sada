/**
 * سائقُ صور Cloudflare — **والعقدُ مقروءٌ من وثائقها لا من الذاكرة**.
 */
import { describe, expect, it } from 'vitest'
import { CF_IMAGE_STEPS, CF_PROMPT_MAX, generateImageCf } from './cloudflare'
import { ImageError } from './gemini'

const PIXEL = 'AAECAw=='   // أربعُ بايتات — يكفي للتحقّق من الفكّ

function binding(reply: unknown, calls: { model: string; input: unknown }[] = []) {
  return {
    async run(model: string, input: unknown) {
      calls.push({ model, input })
      if (reply instanceof Error) throw reply
      return reply
    },
  }
}

describe('ما يُرسَل — كما في وثيقة النموذج', () => {
  it('يرسل الوصفَ والخطواتِ الأربع', async () => {
    const calls: { model: string; input: unknown }[] = []
    await generateImageCf({
      accountId: 'acc', apiToken: 'tok', model: '@cf/black-forest-labs/flux-1-schnell',
      prompt: 'مشهدٌ هادئ', binding: binding({ image: PIXEL }, calls),
    })
    expect(calls[0]!.model).toBe('@cf/black-forest-labs/flux-1-schnell')
    expect(calls[0]!.input).toEqual({ prompt: 'مشهدٌ هادئ', steps: CF_IMAGE_STEPS })
  })

  /** **والقصُّ عندنا لا عندهم**: طلبٌ فوق الحدّ يُردّ بخطأٍ لا يذكر الطول. */
  it('ويقصّ الوصفَ عند الحدّ المقيس', async () => {
    const calls: { model: string; input: unknown }[] = []
    await generateImageCf({
      accountId: 'a', apiToken: 't', model: 'm',
      prompt: 'ن'.repeat(CF_PROMPT_MAX + 500), binding: binding({ image: PIXEL }, calls),
    })
    expect((calls[0]!.input as { prompt: string }).prompt).toHaveLength(CF_PROMPT_MAX)
  })
})

describe('وما يُقرأ من الجواب', () => {
  it('يفكّ base64 إلى بايتات، والنوعُ jpeg', async () => {
    const out = await generateImageCf({
      accountId: 'a', apiToken: 't', model: 'm', prompt: 'p',
      binding: binding({ image: PIXEL }),
    })
    expect([...out.bytes]).toEqual([0, 1, 2, 3])
    expect(out.mime).toBe('image/jpeg')
  })

  /** وبعضُ النماذج تعيد البايتات مباشرةً — ويُقبَل الوجهان. */
  it('ويقبل البايتاتِ حين تعود خاما', async () => {
    const raw = new Uint8Array([9, 8, 7]).buffer
    const out = await generateImageCf({
      accountId: 'a', apiToken: 't', model: 'm', prompt: 'p', binding: binding(raw),
    })
    expect([...out.bytes]).toEqual([9, 8, 7])
  })
})

describe('وما يُردّ ولا يُخترَع', () => {
  it('جوابٌ بلا حقل image يُردّ ولا يُعدّ صورةً فارغة', async () => {
    await expect(
      generateImageCf({
        accountId: 'a', apiToken: 't', model: 'm', prompt: 'p', binding: binding({ ok: true }),
      }),
    ).rejects.toBeInstanceOf(ImageError)
  })

  it('وحسابٌ أو رمزٌ ناقصٌ يُقال ولا يُنادى', async () => {
    await expect(
      generateImageCf({ accountId: '', apiToken: 't', model: 'm', prompt: 'p' }),
    ).rejects.toThrow(/Cloudflare/)
  })

  it('ووصفٌ فارغٌ لا يُرسَل أصلا', async () => {
    await expect(
      generateImageCf({ accountId: 'a', apiToken: 't', model: 'm', prompt: '   ' }),
    ).rejects.toBeInstanceOf(ImageError)
  })
})
