import { describe, expect, it } from 'vitest'
import { modelName } from './modelName'

describe('modelName (D-203)', () => {
  it('المزوّدُ ودرجتُه بالعربيّة، والإصدارُ بين قوسين', () => {
    expect(modelName('claude-opus-5')).toBe('Claude · الأقوى (Opus 5)')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Claude · الأسرع (Haiku 4.5)')
    expect(modelName('gemini-2.5-flash')).toBe('Gemini · السريع (2.5 Flash)')
    expect(modelName('gemini-2.5-flash-lite')).toBe('Gemini · الأخفّ (2.5 Flash Lite)')
    expect(modelName('gemini-2.5-flash-image')).toBe('Gemini · للصور (2.5 Flash Image)')
    expect(modelName('gpt-5-mini')).toBe('GPT · السريع (5 Mini)')
    expect(modelName('deepseek-reasoner')).toBe('DeepSeek · للاستدلال (Reasoner)')
  })

  it('ما لا يُعرف يبقى بمعرّفه، والفارغُ فارغ', () => {
    expect(modelName('alibaba/hh1-i2v')).toBe('alibaba/hh1-i2v')
    expect(modelName('')).toBe('')
  })
})
