/**
 * الأيقونات (D-103) — **والمواصفةُ تُفرَض بالبناء، وهذا يُثبت أنّها فُرضت.**
 *
 * `icon()` تلبس الشكلَ المواصفةَ، **فأيقونةٌ تخالف لا تُكتب أصلا**.
 * وهذا الاختبارُ يقيس الناتج: لو بُدّلت `SPEC` غدا، أو كُتب وسمٌ بيدٍ في
 * هذا الملفّ، سقط هنا.
 *
 * **وحارسُ `audit_tokens` يكمله**: ذاك يمنع أيقونةً تُرسَم في ملفٍّ آخر،
 * وهذا يحرس ما في المصدر نفسِه.
 */
import { describe, expect, it } from 'vitest'
import { ICON } from './icons'

const direction = (svg: string): 'mirrors' | 'fixed' => (svg.includes('data-dir="mirrors"') ? 'mirrors' : 'fixed')

const ALL = Object.entries(ICON)

describe('مواصفة الأيقونات', () => {
  it('ثلاثون أيقونةً فأكثر، ولا واحدة فارغة', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(30)
    for (const [name, svg] of ALL) {
      expect(svg, name).toMatch(/<svg[^>]*>.+<\/svg>/)
    }
  })

  it.each([
    ['شبكة ‏٢٤', 'viewBox="0 0 24 24"'],
    ['**ثخانة واحدة**', 'stroke-width="1.8"'],
    ['ولون يُورَث', 'stroke="currentColor"'],
    ['ونهايات مستديرة', 'stroke-linecap="round"'],
    ['ومفاصل مستديرة', 'stroke-linejoin="round"'],
    ['**ومخفيّة عن قارئ الشاشة**', 'aria-hidden="true"'],
  ])('%s في كلّها', (_name, part) => {
    for (const [name, svg] of ALL) expect(svg, name).toContain(part)
  })

  /**
   * **ولا تعبئةَ في أيقونة** — والفرقُ ليس ذوقا.
   *
   * أيقونةٌ ممتلئةٌ بين تسعٍ مرسومةٍ بالخطّ تُقرأ **حالةً مختارة** لا
   * شكلا مختلفا. والتعبئةُ محجوزةٌ لشعارات المنصّات في `logos.ts`.
   */
  it('**ولا تعبئة** — الوزن البصريّ يُقرأ حالةً لا شكلا', () => {
    for (const [name, svg] of ALL) expect(svg, name).toContain('fill="none"')
  })

  /**
   * **وثخانةٌ ثانيةٌ لا تمرّ.**
   *
   * قِيست قبل التوحيد فوُجدت ثلاثٌ: ‏١٫٨ في تسعٍ، و‏٢ في اثنتين، و‏١٫٩ في
   * واحدة. **ولا أحدَ يقصد ‏١٫٩** — هي أثرُ نسخٍ عن أقربِ ما وُجد.
   */
  /**
   * **ولكلّ أيقونةٍ اتّجاهٌ معلَن** (D-307): ما يدلّ على جهةٍ ينعكس من اليسار، وما يدلّ على شيءٍ يثبت.
   * أيقونةٌ جديدةٌ بلا قرارٍ هنا تسقط: «لم أفكّر» ليس اتّجاهًا.
   */
  it('ما يدلّ على جهةٍ ينعكس، وما يدلّ على شيءٍ يثبت — ولا أيقونةَ بلا قرار', () => {
    const MIRRORS = ['external', 'back', 'go', 'send', 'tasks', 'posts'] as const
    const FIXED = [
      'overview', 'sources', 'channels', 'providers', 'settings', 'report', 'plan', 'guide', 'add', 'chevron',
      'search', 'account', 'bell', 'more', 'like', 'heart', 'comment', 'repost', 'share', 'bookmark', 'views', 'globe', 'play', 'close',
    ] as const
    expect([...MIRRORS, ...FIXED].sort()).toEqual(Object.keys(ICON).sort())
    for (const k of MIRRORS) expect(direction(ICON[k]), k).toBe('mirrors')
    for (const k of FIXED) expect(direction(ICON[k]), k).toBe('fixed')
    expect(ICON.back).toContain('data-dir="mirrors"')
    expect(ICON.play).not.toContain('data-dir')
  })

  /**
   * **والرسمُ نفسُه يُقاس لا السِّمة** (D-325). كان الاختبارُ أعلاه يقرأ ما أعلنته الأيقونة، ومرّ معه سهمُ الخروج والإرسال
   * مرسومين بجهة Lucide اللاتينيّة (رأسُ السهم أعلى اليمين) وهما معلَنان «مرسومان للصفحة العربيّة» (D-307)، وقائمةُ «ما عليك»
   * علاماتُها يسارَ أسطرها، وأسطرُ «المنشورات» محاذاةً يسارًا. والقاعدةُ (`01-base.ts`) تقلب «mirrors» حين يُقرأ من اليسار
   * وحده، **فالرسمُ هو الصفحةُ العربيّة**، وما رُسم لاتينيًّا أخطأ في الاتّجاهين. فهنا يُقرأ مسارُ كلّ أيقونةٍ تنعكس ويُحكم
   * على هندستها: لكلٍّ قاعدةٌ مكتوبة، وأيقونةٌ تنعكس بلا قاعدةٍ هنا تسقط.
   */
  describe('ما ينعكس مرسومٌ للصفحة العربيّة — هندسةً لا إعلانًا (D-325)', () => {
    type Pt = readonly [number, number]
    /** نقاطُ كلّ مسارٍ فرعيّ (أطرافُ المقاطع) — ويكفي هنا M وL وH وV وA وC وZ بصيغتيها. */
    const subpaths = (svg: string): Pt[][] => {
      const out: Pt[][] = []
      for (const [, d] of svg.matchAll(/<path d="([^"]+)"/g)) {
        const tokens = [...(d ?? "").matchAll(/[MmLlHhVvAaCcZz]|-?\d*\.?\d+/g)].map((m) => m[0])
        let x = 0
        let y = 0
        let cmd = ''
        let cur: Pt[] = []
        const take = (): number => Number(tokens.shift())
        while (tokens.length > 0) {
          if (/[A-Za-z]/.test(tokens[0] ?? '')) cmd = tokens.shift() ?? ''
          const rel = cmd === cmd.toLowerCase()
          const C = cmd.toUpperCase()
          if (C === 'Z') { cmd = ''; continue }
          if (C === 'M') { if (cur.length > 0) out.push(cur); cur = [] }
          if (C === 'H') { const v = take(); x = rel ? x + v : v }
          else if (C === 'V') { const v = take(); y = rel ? y + v : v }
          else {
            if (C === 'A') for (let i = 0; i < 5; i += 1) take()
            if (C === 'C') for (let i = 0; i < 4; i += 1) take()
            const nx = take()
            const ny = take()
            x = rel ? x + nx : nx
            y = rel ? y + ny : ny
          }
          cur.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100])
          // ‏وبعد «M» تتابعُ الأزواج «L» (المواصفة)
          if (C === 'M') cmd = rel ? 'l' : 'L'
        }
        if (cur.length > 0) out.push(cur)
      }
      for (const [, cx, cy] of svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)) out.push([[Number(cx), Number(cy)]])
      return out
    }
    /**
     * رأسُ السهم: حيث يلتقي الساقُ والرأس — نقطةٌ في مسارين فرعيّين، **وأبعدُها عن مركز الشبكة** (ساقُ الإرسال يلقى
     * جناحَه في موضعين: الرأسِ وعقدةِ الذيل في الوسط).
     */
    const tip = (svg: string): Pt => {
      const seen = new Map<string, number>()
      for (const sp of subpaths(svg)) for (const k of new Set(sp.map((p) => p.join(',')))) seen.set(k, (seen.get(k) ?? 0) + 1)
      const shared = [...seen].filter(([, n]) => n >= 2).map(([k]) => k.split(',').map(Number) as unknown as Pt)
      expect(shared.length, svg).toBeGreaterThan(0)
      return shared.sort((a, b) => Math.hypot(b[0] - 12, b[1] - 12) - Math.hypot(a[0] - 12, a[1] - 12))[0] as Pt
    }
    const flat = (sp: Pt[]): boolean => sp.length >= 2 && sp.every((p) => p[1] === sp[0]?.[1])
    const xs = (sp: Pt[]): number[] => sp.map((p) => p[0])

    /** لكلّ أيقونةٍ تنعكس حكمُها في الصفحة العربيّة — **أوّلُ السطر يمين، وآخرُه يسار**. */
    const RULES: Readonly<Record<string, (svg: string) => void>> = {
      // ‏العودةُ إلى أوّل السطر (يمين)، والذهابُ إلى آخره (يسار)
      back: (svg) => expect(tip(svg)[0]).toBeGreaterThan(12),
      go: (svg) => expect(tip(svg)[0]).toBeLessThan(12),
      // ‏والخروجُ والإرسالُ إلى آخر السطر وأعلى: أعلى اليسار
      external: (svg) => { const [x, y] = tip(svg); expect(x).toBeLessThan(12); expect(y).toBeLessThan(12) },
      send: (svg) => { const [x, y] = tip(svg); expect(x).toBeLessThan(12); expect(y).toBeLessThan(12) },
      // ‏والقائمةُ علاماتُها في أوّل السطر (يمين) وأسطرُها بعدها
      tasks: (svg) => {
        const all = subpaths(svg)
        const lines = all.filter(flat)
        const marks = all.filter((sp) => !flat(sp))
        expect(lines.length).toBeGreaterThan(0)
        expect(marks.length).toBeGreaterThan(0)
        expect(Math.min(...marks.flatMap(xs))).toBeGreaterThan(Math.max(...lines.flatMap(xs)))
      },
      // ‏وأسطرُ النصّ محاذاةً لأوّل السطر: أطرافُها اليمنى سواء واليسرى تتفاوت
      posts: (svg) => {
        const lines = subpaths(svg).filter((sp) => flat(sp) && sp.length === 2)
        expect(lines.length).toBeGreaterThanOrEqual(2)
        expect(new Set(lines.map((sp) => Math.max(...xs(sp)))).size).toBe(1)
        expect(new Set(lines.map((sp) => Math.min(...xs(sp)))).size).toBeGreaterThan(1)
      },
    }

    it('لكلّ أيقونةٍ تنعكس قاعدةٌ هنا، ولا قاعدةَ لأيقونةٍ تثبت', () => {
      const mirrors = Object.entries(ICON).filter(([, svg]) => direction(svg) === 'mirrors').map(([k]) => k).sort()
      expect(Object.keys(RULES).sort()).toEqual(mirrors)
    })

    it.each(Object.keys(RULES))('%s مرسومةٌ لجهتها في الصفحة العربيّة', (name) => {
      RULES[name]?.(ICON[name as keyof typeof ICON])
    })

    it('والقاعدةُ تُسقط الرسمَ اللاتينيّ: سهمُ Lucide للخروج ورسمُ قائمتها يُردّان', () => {
      const lucideExternal = '<svg><path d="M14 4h6v6"/><path d="M20 4l-9 9"/></svg>'
      expect(() => RULES.external?.(lucideExternal)).toThrow()
      const lucideTasks = '<svg><path d="M9 5h9M9 12h9"/><path d="m3.5 5 1.3 1.3L7 4"/></svg>'
      expect(() => RULES.tasks?.(lucideTasks)).toThrow()
      expect(() => RULES.posts?.('<svg><path d="M8 9h8M8 12.5h5"/></svg>')).toThrow()
    })
  })

  it('ولا ثخانة ثانيةً في المجموعة', () => {
    const widths = new Set(
      ALL.flatMap(([, svg]) => [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => m[1])),
    )
    expect([...widths]).toEqual(['1.8'])
  })
})
