/** المصغَّرات (D-335): تُصنع مرّةً وتُحفظ، والسقفُ والعطلُ والنوعُ تعود إلى الأصل. */
import { describe, expect, it } from 'vitest'
import { THUMB_CAP, thumbFor, thumbKey, thumbWidth, type Shrinker } from './thumb'

function setup(opts: { fail?: boolean } = {}) {
  const objects = new Map<string, ArrayBuffer>([['gen/a', new Uint8Array(1000).buffer]])
  const kv = new Map<string, string>()
  let calls = 0
  const images: Shrinker = {
    input: () => ({ transform: (t) => ({ output: async () => {
      calls += 1
      if (opts.fail === true) throw new Error('9422')
      return { response: () => new Response(new Uint8Array(t.width / 10)) }
    } }) }),
  }
  return {
    objects, kv, calls: () => calls,
    deps: {
      bucket: {
        async get(key: string) { const b = objects.get(key); return b === undefined ? null : { body: b, size: b.byteLength } },
        async put(key: string, value: ArrayBuffer) { objects.set(key, value) },
      },
      kv: { async get(k: string) { return kv.get(k) ?? null }, async put(k: string, v: string) { kv.set(k, v) } },
      images,
      now: () => new Date('2026-11-13T00:00:00Z'),
    },
  }
}

describe('المصغَّرات (D-335)', () => {
  it('المقاسُ من القائمة المغلقة وحدَها', () => {
    expect(thumbWidth('160')).toBe(160)
    expect(thumbWidth('800')).toBe(800)
    for (const bad of [undefined, '', '161', '8000', 'abc', '-160']) expect(thumbWidth(bad)).toBeNull()
  })

  it('تُصنع مرّةً واحدةً وتُحفظ في R2، والثانيةُ من المحفوظ بلا نداءٍ ولا عدّ', async () => {
    const s = setup()
    const first = await thumbFor(s.deps, 'gen/a', 'image/png', 160)
    expect(first?.size).toBe(16)
    expect(s.objects.has(thumbKey('gen/a', 160))).toBe(true)
    expect(s.kv.get('thumbs:2026-11')).toBe('1')
    const again = await thumbFor(s.deps, 'gen/a', 'image/png', 160)
    expect(again?.size).toBe(16)
    expect(s.calls()).toBe(1)
    expect(s.kv.get('thumbs:2026-11')).toBe('1')
  })

  it('عند السقف لا نداء، وبلا ربطٍ لا نداء، وما لا يُصغَّر يعود أصلًا — والمحفوظُ يُسلَّم ولو غاب الربط', async () => {
    const capped = setup()
    capped.kv.set('thumbs:2026-11', String(THUMB_CAP))
    expect(await thumbFor(capped.deps, 'gen/a', 'image/png', 160)).toBeNull()
    expect(capped.calls()).toBe(0)

    const s = setup()
    expect(await thumbFor({ ...s.deps, images: undefined }, 'gen/a', 'image/png', 800)).toBeNull()
    for (const mime of ['image/gif', 'image/svg+xml', 'video/mp4']) expect(await thumbFor(s.deps, 'gen/a', mime, 160)).toBeNull()
    expect(await thumbFor(s.deps, 'gen/missing', 'image/png', 160)).toBeNull()
    await thumbFor(s.deps, 'gen/a', 'image/jpeg', 800)
    expect((await thumbFor({ ...s.deps, images: undefined }, 'gen/a', 'image/jpeg', 800))?.size).toBe(80)
  })

  it('خطأُ الخدمة يعود إلى الأصل، والمحاولةُ تُعدّ ولا شيءَ يُحفظ', async () => {
    const s = setup({ fail: true })
    expect(await thumbFor(s.deps, 'gen/a', 'image/png', 160)).toBeNull()
    expect(s.kv.get('thumbs:2026-11')).toBe('1')
    expect(s.objects.has(thumbKey('gen/a', 160))).toBe(false)
  })
})
