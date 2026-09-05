import { describe, expect, it } from 'vitest'
import { IMPLEMENTED, isConfigured, PROVIDERS, ROUTES, routeStatuses } from './registry'
import { MODEL } from '../analyze/claude'

describe('السجلّ مرجعٌ واحد', () => {
  it('نموذج التحليل يُقرأ من السجلّ لا من ثابتٍ مكرّر', () => {
    expect(MODEL).toBe(ROUTES.analyze.model)
  })

  it('كلّ مهمّة موجّهة إلى مزوّدٍ معروف', () => {
    for (const route of Object.values(ROUTES)) {
      expect(Object.keys(PROVIDERS)).toContain(route.provider)
    }
  })

  it('لكلّ توجيه سببٌ مكتوب — لا نموذجَ بلا تعليل', () => {
    for (const route of Object.values(ROUTES)) {
      expect(route.why.length).toBeGreaterThan(10)
    }
  })

  it('لا مفتاح ولا قيمة سرٍّ في السجلّ — أسماء فقط', () => {
    const text = JSON.stringify({ PROVIDERS, ROUTES })
    expect(text).not.toMatch(/sk-ant/)
    expect(text).not.toMatch(/AIza/)
  })

  it('المهامّ النصّية على opus-5 — الخفض قرار المالك لا النظام', () => {
    expect(ROUTES.analyze.model).toBe('claude-opus-5')
    expect(ROUTES.draft.model).toBe('claude-opus-5')
  })
})

describe('isConfigured', () => {
  it('يقرأ الوجود لا القيمة', () => {
    expect(isConfigured({ ANTHROPIC_API_KEY: 'x' }, 'anthropic')).toBe(true)
    expect(isConfigured({ ANTHROPIC_API_KEY: '' }, 'anthropic')).toBe(false)
    expect(isConfigured({}, 'anthropic')).toBe(false)
  })

  it('يفرّق بين المزوّدين — سرُّ أحدهما لا يضبط الآخر', () => {
    const env = { ANTHROPIC_API_KEY: 'x' }
    expect(isConfigured(env, 'anthropic')).toBe(true)
    expect(isConfigured(env, 'gemini')).toBe(false)
  })
})

describe('routeStatuses', () => {
  it('المبنيّ والمضبوط جاهز', () => {
    const statuses = routeStatuses({ ANTHROPIC_API_KEY: 'x' })
    const analyze = statuses.find((s) => s.task === 'analyze')!
    expect(analyze.implemented).toBe(true)
    expect(analyze.ready).toBe(true)
  })

  it('المبنيّ بلا سرّ ليس جاهزا — يُقال بدل أن يُكتشف عند أوّل نداء', () => {
    const analyze = routeStatuses({}).find((s) => s.task === 'analyze')!
    expect(analyze.implemented).toBe(true)
    expect(analyze.ready).toBe(false)
  })

  it('ما لم يُبنَ ليس جاهزا ولو ضُبط سرّه — تصريحٌ بالنيّة لا وعدٌ بالعمل', () => {
    const statuses = routeStatuses({ ANTHROPIC_API_KEY: 'x', GEMINI_API_KEY: 'y' })
    const image = statuses.find((s) => s.task === 'image')!
    expect(IMPLEMENTED.has('image')).toBe(false)
    expect(image.ready).toBe(false)
  })

  it('يغطّي كلّ مهمّة في السجلّ بلا نقص', () => {
    expect(routeStatuses({}).map((s) => s.task).sort()).toEqual(Object.keys(ROUTES).sort())
  })
})
