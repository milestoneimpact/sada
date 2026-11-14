import { describe, expect, it } from 'vitest'
import { recommend, type RecProvider } from './recommend'

const ok = (name: string, lastOk: boolean | null = true): RecProvider => ({ name, enabled: true, configured: true, lastOk })

describe('recommend (D-350)', () => {
  it('النموذجُ الذي يفكّر في الخطّة والفهم يُستبدل بالأنسب', () => {
    const changes = recommend([ok('deepseek'), ok('anthropic', false)], [
      { task: 'analyze', provider: 'deepseek', model: 'deepseek-v4-pro' },
      { task: 'plan', provider: 'deepseek', model: 'deepseek-v4-pro' },
      { task: 'draft', provider: 'deepseek', model: 'deepseek-v4-pro' },
    ])
    // ‏والكتابةُ إلى DeepSeek لأنّ Anthropic ساقط — الأنسبُ الصالحُ لا الأنسبُ مطلقًا
    expect(changes.map((c) => `${c.task}:${c.to.model}`)).toEqual(['analyze:deepseek-chat', 'plan:deepseek-chat', 'draft:deepseek-chat'])
  })

  it('مزوّدٌ ساقط يُنقل عنه إلى أوّل صالح', () => {
    const changes = recommend([ok('deepseek'), ok('anthropic', false), ok('gemini')], [
      { task: 'draft', provider: 'anthropic', model: 'claude-opus-5' },
      { task: 'analyze', provider: 'anthropic', model: 'claude-opus-5' },
    ])
    expect(changes).toEqual([
      expect.objectContaining({ task: 'analyze', to: { provider: 'deepseek', model: 'deepseek-chat' } }),
      expect.objectContaining({ task: 'draft', to: { provider: 'deepseek', model: 'deepseek-chat' } }),
    ])
  })

  it('على القائمة وأدنى من الأوّل الصالح: يُرفع', () => {
    const changes = recommend([ok('deepseek'), ok('gemini')], [{ task: 'plan', provider: 'gemini', model: 'gemini-2.5-flash' }])
    expect(changes[0]?.to).toEqual({ provider: 'deepseek', model: 'deepseek-chat' })
  })

  it('ما هو عليه الأنسبُ لا يتغيّر، والمعطَّلُ وما بلا مفتاح لا يُختاران', () => {
    expect(recommend([ok('deepseek')], [{ task: 'plan', provider: 'deepseek', model: 'deepseek-chat' }])).toEqual([])
    const off = recommend([{ ...ok('deepseek'), enabled: false }, { ...ok('gemini'), configured: false }, ok('anthropic')],
      [{ task: 'plan', provider: 'deepseek', model: 'deepseek-chat' }])
    expect(off[0]?.to.provider).toBe('anthropic')
  })
})
