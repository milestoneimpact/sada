/**
 * قراءةُ الصورة — **وصفٌ يُنتِج نصّا، لا حكمٌ يُنتِج قرارا** (D-124).
 */
import { describe, expect, it } from 'vitest'
import { CompatError } from '../ai/openaiCompat'
import { describeImage, MIN_DESCRIPTION } from './vision'

const DESC = 'عرضٌ من أربع شرائح، عنوانُه «أثرُ البرامج»، وفيه جدولٌ بثلاثة أعمدة وأرقامٌ ربعيّة.'

function net(body: unknown, status = 200): { impl: typeof fetch; bodies: string[] } {
  const bodies: string[] = []
  const impl = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''))
    return new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { impl, bodies }
}

const ok = {
  choices: [{ message: { content: DESC }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1200, completion_tokens: 60 },
  model: 'deepseek-vision',
}

const deps = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'k',
  model: 'v',
}

describe('الوصف', () => {
  it('يرسل الصورةَ ويعيد نصّها واستهلاكَها', async () => {
    const { impl, bodies } = net(ok)
    const out = await describeImage({ ...deps, fetchImpl: impl }, 'data:image/png;base64,AA', 'عرض.png')

    expect(out.text).toBe(DESC)
    expect(out.inputTokens).toBe(1200)
    expect(out.outputTokens).toBe(60)
    expect(out.model).toBe('deepseek-vision')

    const sent = JSON.parse(bodies[0] ?? '{}') as {
      messages: { role: string; content: unknown }[]
    }
    expect(sent.messages[1]?.content).toEqual([
      { type: 'text', text: 'اسمُ الملفّ: عرض.png\n\nصِف هذه الصورة.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
    ])
  })

  /**
   * **والوصفُ يُطلَب نصّا لا حكما.**
   *
   * فلو سُئل «أيستحقّ النشر؟» لصار الحكمُ عند نموذجِ رؤيةٍ رخيصٍ اختاره
   * المالكُ للقراءة — **والحكمُ عند نموذج التحليل** (D-058).
   */
  it('ولا يطلب حكما على الجدوى', async () => {
    const { impl, bodies } = net(ok)
    await describeImage({ ...deps, fetchImpl: impl }, 'data:image/png;base64,AA', 'a.png')
    const sent = JSON.parse(bodies[0] ?? '{}') as { messages: { content: string }[] }
    const system = sent.messages[0]?.content ?? ''
    expect(system).toContain('الوصفُ وحدَه')
    expect(system).toContain('ولا تحكم')
  })
})

describe('ما يُردّ', () => {
  it('بلا مفتاحٍ يُردّ قبل أن يُنادى شيء', async () => {
    const { impl, bodies } = net(ok)
    await expect(
      describeImage({ ...deps, apiKey: '  ', fetchImpl: impl }, 'data:x', 'a.png'),
    ).rejects.toThrow(/لا مفتاح لمزوّد الرؤية/)
    expect(bodies).toHaveLength(0)
  })

  /**
   * **ولا يُمرَّر فراغٌ إلى التحليل.**
   *
   * نصٌّ من كلمتين يجعل التحليلَ يحكم على الفراغ **وينفق ثمنَ حكمه**،
   * ثمّ يُكتب فهمٌ يصف لا شيء.
   */
  it('وردٌّ قصيرٌ جدّا يُعَدّ فشلا ويُعاد', async () => {
    const short = 'صورة.'
    expect(short.length).toBeLessThan(MIN_DESCRIPTION)
    const { impl } = net({
      choices: [{ message: { content: short }, finish_reason: 'stop' }],
      usage: {}, model: 'v',
    })
    const err = await describeImage({ ...deps, fetchImpl: impl }, 'data:x', 'a.png')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CompatError)
    expect((err as CompatError).message).toMatch(/لم تُقرأ الصورة/)
    expect((err as CompatError).retryable).toBe(true)
  })

  it('وعطلُ المزوّد يمرّ كما هو بصنفه', async () => {
    const { impl } = net({ error: 'no' }, 401)
    const err = await describeImage({ ...deps, fetchImpl: impl }, 'data:x', 'a.png')
      .catch((e: unknown) => e)
    expect((err as CompatError).status).toBe(401)
    expect((err as CompatError).retryable).toBe(false)
  })
})
