import { describe, expect, it } from 'vitest'
import { listModels } from './models'
import { catalogGroups, isThinking } from './modelCatalog'
import { catalogOptions } from '../../routes/ui/sections/providers'

/** ‏فهرسُ DeepSeek كما يردّ: `{ id, object, owned_by }` لا غير — بلا اسمٍ ولا صنفٍ ولا سعر. */
const DEEPSEEK = {
  object: 'list',
  data: [
    { id: 'deepseek-reasoner', object: 'model', owned_by: 'deepseek' },
    { id: 'deepseek-chat', object: 'model', owned_by: 'deepseek' },
  ],
}

function net(payload: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
}

const Q = { name: 'deepseek', kind: 'openai_compat' as const, baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-x', builtin: false }

describe('«deepseek-chat لا يظهر» — العلّة مستنسَخة', () => {
  it('فهرسٌ بلا architecture يُصنَّف نصًّا من معرّفه لا فارغًا', async () => {
    const list = await listModels(Q, net(DEEPSEEK))
    expect(list.models.find((m) => m.id === 'deepseek-chat')?.task).toBe('text')
  })

  it('نصُّ الخيار يحمل المعرّف نفسَه — لا الاسمَ المقروء وحده', async () => {
    const list = await listModels(Q, net(DEEPSEEK))
    const html = catalogOptions(catalogGroups(list.models, { provider: 'deepseek', task: 'plan' }), '')
    const chat = /<option value="deepseek-chat"[^>]*>([^<]*)<\/option>/.exec(html)
    expect(chat?.[1]).toContain('deepseek-chat')
  })
})

describe('مجموعاتُ الفهرس', () => {
  it('الموصى به أوّلًا، وما يفكّر معلَّمٌ', async () => {
    const list = await listModels(Q, net(DEEPSEEK))
    const groups = catalogGroups(list.models, { provider: 'deepseek', task: 'plan' })
    expect(groups[0]?.label).toBe('موصى به لهذه المهمّة')
    expect(groups[0]?.items[0]?.id).toBe('deepseek-chat')
    const reasoner = groups.flatMap((g) => g.items).find((i) => i.id === 'deepseek-reasoner')
    expect(reasoner?.thinking).toBe(true)
    expect(reasoner?.text).toContain('يفكّر')
  })

  it('السعرُ حين يعطيه الفهرس يظهر في الخيار', () => {
    const groups = catalogGroups([{ id: 'x/m', label: 'M', task: 'text', priceIn: 0.5, priceOut: 1.5 }], { provider: 'openrouter', task: 'draft' })
    expect(groups[0]?.items[0]?.text).toContain('$0.5 / $1.5')
  })

  it('المحفوظُ خارج الفهرس يبقى مختارًا، والكتابةُ اليدويّة باقية', () => {
    const html = catalogOptions(catalogGroups([{ id: 'a', label: 'a', task: 'text', priceIn: null, priceOut: null }], { provider: 'p', task: 'draft' }), 'gone-model')
    expect(html).toContain('<option value="gone-model" selected>')
    expect(html).toContain('__manual__')
  })

  it('علامةُ التفكير', () => {
    expect(isThinking('deepseek-reasoner')).toBe(true)
    expect(isThinking('o3-mini')).toBe(true)
    expect(isThinking('deepseek-chat')).toBe(false)
    expect(isThinking('gemini-2.5-flash')).toBe(false)
  })
})
