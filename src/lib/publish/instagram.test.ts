/**
 * سائقُ Instagram — **ويُختبَر بردودٍ مصنوعةٍ لا بشبكة**.
 */
import { describe, expect, it } from 'vitest'
import { PublishError } from './platforms'
import { POLL_TRIES, publishInstagram } from './instagram'

const noSleep = async (): Promise<void> => {}

/** ردٌّ مصنوع. */
function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

/** يردّ ما رُتّب بالترتيب، ويسجّل ما نُودي. */
function fakeFetch(queue: Response[]): typeof fetch & { calls: string[] } {
  const calls: string[] = []
  const impl = (async (url: string | URL | Request) => {
    calls.push(String(url))
    const next = queue.shift()
    if (next === undefined) throw new Error(`نداء زائد: ${String(url)}`)
    return next
  }) as typeof fetch & { calls: string[] }
  impl.calls = calls
  return impl
}

describe('الصورة', () => {
  it('حاوية ثمّ نشر — ولا استطلاع', async () => {
    const f = fakeFetch([reply({ id: 'c1' }), reply({ id: 'p9' })])
    const out = await publishInstagram(
      'tok', '17841', { kind: 'image', url: 'https://x/m/t' }, 'نصّ', f, noSleep,
    )
    expect(out.platformPostId).toBe('p9')
    // **وصورةٌ لا تُستطلَع**: دورةُ انتظارٍ لجاهزٍ تُنفق زمنَ Worker بلا سبب
    expect(out.polls).toBe(0)
    expect(f.calls).toHaveLength(2)
    expect(f.calls[0]).toContain('/17841/media')
    expect(f.calls[1]).toContain('/17841/media_publish')
  })
})

describe('المقطع', () => {
  it('يُستطلَع حتّى FINISHED ثمّ يُنشَر', async () => {
    const f = fakeFetch([
      reply({ id: 'c2' }),
      reply({ status_code: 'IN_PROGRESS' }),
      reply({ status_code: 'FINISHED' }),
      reply({ id: 'p10' }),
    ])
    const out = await publishInstagram(
      'tok', '17841', { kind: 'video', url: 'https://x/m/t' }, 'نصّ', f, noSleep,
    )
    expect(out.platformPostId).toBe('p10')
    expect(out.polls).toBe(1)
  })

  /** **و`REELS` لا `VIDEO`**: النوعُ القديمُ أُوقف، وطلبُه يُردّ. */
  it('ويُرسَل REELS', async () => {
    const bodies: string[] = []
    const impl = (async (_u: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''))
      return bodies.length === 1 ? reply({ id: 'c3' })
        : bodies.length === 2 ? reply({ status_code: 'FINISHED' })
          : reply({ id: 'p11' })
    }) as typeof fetch
    await publishInstagram(
      'tok', '1', { kind: 'video', url: 'https://x/m/t' }, 'نصّ', impl, noSleep,
    )
    expect(bodies[0]).toContain('media_type=REELS')
    expect(bodies[0]).toContain('video_url=')
  })

  /**
   * **والخطأُ يُقرأ من الحالة لا من رمز HTTP.**
   *
   * استطلاعُ حاويةٍ فشل ترميزُها يردّ ‏٢٠٠ وفيه `ERROR` — **فمن فحص
   * `ok` وحدَه انتظر ستَّ دوراتٍ ثمّ نشر حاويةً ميّتة**.
   */
  it('وERROR في ردّ ٢٠٠ يُوقف ولا يُنشَر', async () => {
    const f = fakeFetch([
      reply({ id: 'c4' }),
      reply({ status_code: 'ERROR', status: 'التنسيق غير مدعوم' }),
    ])
    await expect(publishInstagram(
      'tok', '1', { kind: 'video', url: 'https://x/m/t' }, 'نصّ', f, noSleep,
    )).rejects.toThrow(/فشل ترميز المقطع/)
    // **ولا نداءَ نشرٍ وقع**: حاويةٌ ميّتةٌ لا تُنشَر
    expect(f.calls).toHaveLength(2)
  })

  /** وسقفٌ لا حلقةٌ مفتوحة — **وWorker له سقفُ زمن**. */
  it('ولا يستطلع أكثر من سقفه', async () => {
    const f = fakeFetch([
      reply({ id: 'c5' }),
      ...Array.from({ length: POLL_TRIES }, () => reply({ status_code: 'IN_PROGRESS' })),
      reply({ id: 'p12' }),
    ])
    const out = await publishInstagram(
      'tok', '1', { kind: 'video', url: 'https://x/m/t' }, 'نصّ', f, noSleep,
    )
    expect(out.polls).toBe(POLL_TRIES)
    expect(out.platformPostId).toBe('p12')
  })
})

describe('ما يُردّ صريحا', () => {
  /** **ولا منشورَ نصّيٌّ فيها** — ورسالةُ المنصّة لا تقول للمالك ما يفعل. */
  it('بلا وسيط يُردّ قبل أن يُنادى شيء', async () => {
    const f = fakeFetch([])
    await expect(publishInstagram(
      'tok', '1', { kind: 'image', url: '' }, 'نصّ', f, noSleep,
    )).rejects.toThrow(/لا تقبل منشورا نصّيّا/)
    expect(f.calls).toHaveLength(0)
  })

  /** **ورسالةُ Meta تُنقَل كما هي**: تقول للمالك ما يفعل. */
  it('وحساب غير احترافيّ يُنقَل نصّ عطله', async () => {
    const f = fakeFetch([
      reply({ error: { message: 'The user is not an Instagram Professional account' } }, 400),
    ])
    await expect(publishInstagram(
      'tok', '1', { kind: 'image', url: 'https://x/m/t' }, 'نصّ', f, noSleep,
    )).rejects.toThrow(/Instagram Professional account/)
  })

  it('و٤٠٠ لا تُعاد و٥٠٠ تُعاد', async () => {
    for (const [status, retryable] of [[400, false], [500, true], [429, true]] as const) {
      const f = fakeFetch([reply({ error: { message: 'x' } }, status)])
      const err = await publishInstagram(
        'tok', '1', { kind: 'image', url: 'https://x/m/t' }, 'نصّ', f, noSleep,
      ).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(PublishError)
      expect((err as PublishError).retryable, String(status)).toBe(retryable)
    }
  })

  /**
   * **ولا يُدَّعى نشرٌ لم يُؤكَّد.**
   *
   * وادّعاءُ النجاح يمنع إعادةَ المحاولة، وادّعاءُ الفشل قد يُكرّر
   * منشورا — فيُقال غيرُ مؤكَّدٍ **ولا يُعاد**.
   */
  it('وردّ ٢٠٠ بلا معرّف لا يُعَدّ نجاحا ولا يُعاد', async () => {
    const f = fakeFetch([reply({ id: 'c6' }), reply({ ok: true })])
    const err = await publishInstagram(
      'tok', '1', { kind: 'image', url: 'https://x/m/t' }, 'نصّ', f, noSleep,
    ).catch((e: unknown) => e)
    expect((err as PublishError).message).toMatch(/بلا معرّف يُؤكّده/)
    expect((err as PublishError).retryable).toBe(false)
  })

  it('وحاوية بلا معرّف تُعاد', async () => {
    const f = fakeFetch([reply({ ok: true })])
    const err = await publishInstagram(
      'tok', '1', { kind: 'image', url: 'https://x/m/t' }, 'نصّ', f, noSleep,
    ).catch((e: unknown) => e)
    expect((err as PublishError).retryable).toBe(true)
  })
})
