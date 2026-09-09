import { describe, expect, it } from 'vitest'
import { classifyTask, compatCatalogUrl, listModels } from './models'

const ACC = 'c6ea7ba30984d494a1a78efea6ddc9a0'
const CF_V1 = `https://api.cloudflare.com/client/v4/accounts/${ACC}/ai/v1`

let seen: { url: string; headers: Headers }[] = []

function net(status: number, payload: unknown, contentType = 'application/json'): typeof fetch {
  seen = []
  /*
   * **ويقبل الشكلين** (D-110): كان النداءُ يمرّر `Request` واحدا، وصار
   * يمرّ بالحارس فيصل `(url, init)`. **وما يُفحَص لم يتبدّل** — العنوانُ
   * والترويسات — فيُقرآن من أيّهما جاء.
   */
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as Request).url
    const headers = new Headers(init?.headers ?? (input as Request).headers)
    seen.push({ url, headers })
    return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': contentType },
    })
  }) as unknown as typeof fetch
}

const COMPAT = {
  name: 'deepseek',
  kind: 'openai_compat' as const,
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-deep',
  builtin: false,
}

describe('عنوانُ الفهرس — موضعٌ واحد يقرأه الفاحصُ والقائمة', () => {
  it('لهجةُ OpenAI: models على العنوان', () => {
    expect(compatCatalogUrl('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/v1/models')
  })

  it('وشرطةٌ زائدةٌ لا تُضاعَف', () => {
    expect(compatCatalogUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1/models')
  })

  it('و**Cloudflare تُصرَف إلى models/search** — وهذه هي العلّةُ المُصلَحة', () => {
    expect(compatCatalogUrl(CF_V1)).toContain('/ai/models/search')
  })
})

describe('Cloudflare — الفهرسُ يُقرأ من result', () => {
  const PAYLOAD = {
    success: true,
    result: [
      {
        name: '@cf/black-forest-labs/flux-1-schnell',
        description: 'نموذجُ صورٍ سريع',
        task: { name: 'Text-to-Image' },
      },
      { name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', task: { name: 'Text Generation' } },
    ],
  }

  it('ينادي models/search لا v1/models', async () => {
    await listModels({ ...COMPAT, name: 'cloudflare', baseUrl: CF_V1 }, net(200, PAYLOAD))
    expect(seen[0]!.url).toContain('/ai/models/search')
    expect(seen[0]!.url).not.toContain('/ai/v1/')
  })

  it('والرمزُ في الترويسة لا في العنوان', async () => {
    await listModels({ ...COMPAT, name: 'cloudflare', baseUrl: CF_V1 }, net(200, PAYLOAD))
    expect(seen[0]!.headers.get('Authorization')).toBe('Bearer sk-deep')
    expect(seen[0]!.url).not.toContain('sk-deep')
  })

  it('ويُصنَّف مخرَجُ الصورةِ صورةً ومخرَجُ النصِّ نصّا', async () => {
    const out = await listModels({ ...COMPAT, name: 'cloudflare', baseUrl: CF_V1 }, net(200, PAYLOAD))
    expect(out.ok).toBe(true)
    const flux = out.models.find((m) => m.id.includes('flux'))
    expect(flux?.task).toBe('image')
    expect(out.models.find((m) => m.id.includes('llama'))?.task).toBe('text')
  })
})

describe('لهجةُ OpenAI — والسعرُ يُقرأ حيث يُعطى', () => {
  it('يقرأ المعرّفات من data', async () => {
    const out = await listModels(COMPAT, net(200, { data: [{ id: 'deepseek-chat' }] }))
    expect(out.ok).toBe(true)
    expect(out.models[0]!.id).toBe('deepseek-chat')
  })

  it('و**سعرُ الرمز يُحوَّل إلى سعرِ المليون** — وهو ما تخزّنه القاعدة', async () => {
    const out = await listModels(
      COMPAT,
      net(200, {
        data: [{ id: 'openai/gpt-4o', pricing: { prompt: '0.0000025', completion: '0.00001' } }],
      }),
    )
    expect(out.models[0]!.priceIn).toBeCloseTo(2.5, 6)
    expect(out.models[0]!.priceOut).toBeCloseTo(10, 6)
  })

  it('ومَن لا يعطي سعرا يبقى سعرُه فارغا — لا صفرا يُظنّ حقيقة', async () => {
    const out = await listModels(COMPAT, net(200, { data: [{ id: 'deepseek-chat' }] }))
    expect(out.models[0]!.priceIn).toBeNull()
    expect(out.models[0]!.priceOut).toBeNull()
  })

  it('وسعرٌ ليس عددا يُترَك ولا يُقبَل NaN', async () => {
    const out = await listModels(
      COMPAT,
      net(200, { data: [{ id: 'x', pricing: { prompt: 'مجّانا', completion: -1 } }] }),
    )
    expect(out.models[0]!.priceIn).toBeNull()
    expect(out.models[0]!.priceOut).toBeNull()
  })
})

describe('Gemini — سابقةُ models/ تُنزَع', () => {
  const GEM = { ...COMPAT, name: 'gemini', builtin: true, baseUrl: null }

  it('يُنادى عنوانُ Google بمفتاحه في ترويسته', async () => {
    await listModels(GEM, net(200, { models: [{ name: 'models/gemini-2.5-flash' }] }))
    expect(seen[0]!.url).toContain('generativelanguage.googleapis.com')
    expect(seen[0]!.headers.get('x-goog-api-key')).toBe('sk-deep')
  })

  it('والمعرّفُ يُكتب بلا سابقة — فما يُحفَظ هو ما يُنادى به', async () => {
    const out = await listModels(GEM, net(200, { models: [{ name: 'models/gemini-2.5-flash' }] }))
    expect(out.models[0]!.id).toBe('gemini-2.5-flash')
  })
})

describe('Anthropic — لهجتُه ترويسةٌ أخرى', () => {
  it('x-api-key و anthropic-version لا Bearer', async () => {
    await listModels(
      { ...COMPAT, name: 'anthropic', kind: 'anthropic', builtin: true },
      net(200, { data: [{ id: 'claude-opus-4', display_name: 'Opus' }] }),
    )
    expect(seen[0]!.headers.get('x-api-key')).toBe('sk-deep')
    expect(seen[0]!.headers.get('anthropic-version')).toBe('2023-06-01')
    expect(seen[0]!.headers.get('Authorization')).toBeNull()
  })
})

describe('والفشلُ يُقال بسببه — ولا يُرمى', () => {
  it('٤٠١ تعني المفتاح لا الشكل', async () => {
    const out = await listModels(COMPAT, net(401, {}))
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('المفتاح مرفوض')
  })

  it('٤٠٤ تعني أنّ الفهرسَ غيرُ مخدوم — لا أنّ المفتاح فاسد', async () => {
    const out = await listModels(COMPAT, net(404, {}))
    expect(out.detail).toContain('فهرسَ نماذج')
  })

  it('وجوابٌ ليس JSON يُقال ولا يُبتلَع', async () => {
    const out = await listModels(COMPAT, net(200, '<html>', 'text/html'))
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('JSON')
  })

  it('و**٢٠٠ بقائمةٍ فارغة ليست نجاحا يُشهَد به**', async () => {
    const out = await listModels(COMPAT, net(200, { data: [] }))
    expect(out.ok).toBe(false)
    expect(out.models).toHaveLength(0)
  })

  it('ولا مفتاحَ يعني لا نداء', async () => {
    const out = await listModels({ ...COMPAT, apiKey: '  ' }, net(200, { data: [{ id: 'x' }] }))
    expect(out.ok).toBe(false)
    expect(seen).toHaveLength(0)
  })

  it('ولا عنوانَ لمزوّدٍ بلهجة OpenAI يعني لا نداء', async () => {
    const out = await listModels({ ...COMPAT, baseUrl: null }, net(200, { data: [{ id: 'x' }] }))
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('لا عنوان')
  })

  it('وعطلُ الشبكة يُعاد سببا لا استثناء', async () => {
    const fail = (async () => {
      throw new Error('تعذّر')
    }) as unknown as typeof fetch
    const out = await listModels(COMPAT, fail)
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('تعذّر')
  })
})

describe('تصنيفُ المهمّة — والاتّجاهُ يُقرأ لا وجودُ الكلمة', () => {
  it('«image-to-text» مخرَجُه نصّ لا صورة', () => {
    expect(classifyTask('Image-to-Text')).toBe('text')
  })

  it('و«text-to-image» صورة', () => {
    expect(classifyTask('Text-to-Image')).toBe('image')
  })

  it('والتضمينُ صنفٌ ثالث', () => {
    expect(classifyTask('Text Embeddings')).toBe('embedding')
  })

  it('وما لا يُعرَف يبقى بلا حكم', () => {
    expect(classifyTask(undefined)).toBeNull()
    expect(classifyTask('')).toBeNull()
  })
})
