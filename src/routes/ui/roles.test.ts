/**
 * **لكلّ لونٍ دورٌ واحد — يُحرَس لا يُكتب** (خطّة التصميم 3.2 · D-325).
 *
 * القاعدةُ مكتوبةٌ في رأس `tokens.ts` وفي خطّة التصميم («التركوازيّ يعني يُضغط»، و«ألوانُ المنصّات لشعارها وحدَه»)،
 * ولم يحرسها شيء: قاس تقييمُ النضج ‏55 تصريحًا بـ`var(--brand)` في أحدَ عشرَ ملفًّا — مِلءُ المقياس وحافّةُ المؤشّر وحلقةُ اليوم
 * وحدودُ المختار — ونهارًا `--brand` هو `--link` حرفًا، فصار التركوازُ يُقرأ «يُضغط» حيث لا يُضغط. ونقاطُ شريط الأسبوع لونُ
 * المنصّة وحدَه، وX وTikTok أسودان. فيُسأل المصدرُ هنا: أين يقع كلُّ لون، وماذا يحمل معه.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { STYLE } from './styles'
import { sheet } from '../../test/css'
import { homeTop } from './sections/home'
import { viewChannels } from '../../lib/channels'
import type { HomeFacts } from '../../lib/home'

const css = sheet(STYLE)
const uses = (re: RegExp): { sel: string; prop: string; value: string }[] =>
  css.decls().filter((d) => !d.prop.startsWith('--') && re.test(d.value))
    .flatMap((d) => d.selectors.map((sel) => ({ sel, prop: d.prop, value: d.value })))

describe('لكلّ لونٍ دورٌ واحد (D-325)', () => {
  it('«--brand» يملأ الزرَّ الأوّليّ وحدَه: «.btn-primary» والزرَّ العائم ورابطَ التخطّي (وهما زرّان أوّليّان)', () => {
    const PRIMARY = /^(?:\.btn-primary|details\.fab>summary|\.skip)(?![\w-])/
    const off = uses(/var\(--brand(?:-hover|-press)?\)/).filter((u) => !PRIMARY.test(u.sel))
    expect(off.map((u) => `${u.sel}{${u.prop}:${u.value}}`)).toEqual([])
    // ‏والزرُّ نفسُه ما زال بها — لا يُحذف الدورُ مع ما خرج منه
    expect(css.rule('.btn-primary')).toMatchObject({ background: 'var(--brand)' })
  })

  it('وما يُبرز ولا يُضغط «--accent»: المقياسُ وحافّةُ «مجدولة» وحلقةُ اليوم وحدُّ المختار', () => {
    expect(css.rule('.bar i').background).toBe('var(--accent)')
    expect(css.rule('.hstats [data-tone=sched] a')['border-inline-start-color']).toBe('var(--accent)')
    expect(css.rule('.wk li[data-today]')['box-shadow']).toContain('var(--accent)')
    expect(css.rule('.wz-opt:has(input:checked)')['border-color']).toBe('var(--accent)')
  })

  it('ورابطٌ يُمرَّر عليه يبقى بحبر الرابط لا بحبر الزرّ', () => {
    expect(css.rule('nav.back a:hover', '@media(hover:hover)').color).toBe('var(--link)')
    expect(css.rule('.ch-name a:hover', '@media(hover:hover)').color).toBe('var(--link)')
  })

  /*
   * ‏(مراجعة D-325) **والورقةُ ليست كلَّ ما يلوّن**: الحارسان أعلاه يقرآن `STYLE` وحدَها، وحرارةُ الجدول المحوريّ تُكتب
   * ‏سِمةَ `style` في الوسم (`color-mix(in srgb,var(--brand) …)`) — فلبست خلايا البيانات تركوازَ «يُضغط» بجوار رؤوس صفوفٍ هي
   * ‏روابطُ حقًّا، ومرّ الحارس. فيُقرأ المصدرُ كلُّه: لا `var(--brand` ولا `var(--pf-` في `src/routes` خارج الورقة والرموز.
   */
  it('ولا «var(--brand» ولا «var(--pf-» في وسمٍ يُكتب خارج الورقة (سِمةُ style في الوسم لا يراها حارسُ الورقة)', () => {
    const ROUTES = join(__dirname, '..')
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
      const p = join(d, n)
      return statSync(p).isDirectory() ? walk(p) : n.endsWith('.ts') && !n.endsWith('.test.ts') ? [p] : []
    })
    const SHEET = /(?:^|\/)ui\/(?:styles\/|tokens\.ts$)/
    const off = walk(ROUTES).filter((f) => !SHEET.test(relative(ROUTES, f)))
      .flatMap((f) => readFileSync(f, 'utf8').split('\n').flatMap((line, i) =>
        /var\(--(?:brand|pf-)/.test(line) ? [`${relative(ROUTES, f)}:${i + 1}`] : []))
    expect(off).toEqual([])
  })

  it('«--pf-*» في قاعدة مربّع شعارٍ وحدها — لا نقطةٌ ولا حدٌّ ولا نصٌّ بلون منصّة', () => {
    const LOGO = /\.(?:pf-logo|pc-logo|rv-pf|wk-pf)(?![\w-])/
    const off = uses(/var\(--pf-[a-z]+\)/).filter((u) => !LOGO.test(u.sel))
    expect(off.map((u) => `${u.sel}{${u.prop}:${u.value}}`)).toEqual([])
  })

  it('ومربّعُ المنصّة في شريط الأسبوع يحمل شعارَها نفسَه، واسمُها في اسم اليوم', () => {
    const f: HomeFacts = {
      channels: viewChannels([], () => true), counts: { perPlatform: {}, publishedWeek: 0 }, paused: false,
      sources: { total: 2, analyzed: 2 }, withoutImage: 0, withImage: 0, openSuggestions: 0,
      firsts: { waiting: null, unscheduled: null, withoutImage: null }, pulses: [], blocker: null, zone: null,
      scheduled: [{ platform: 'x', at: '2026-10-04 14:00:00' }, { platform: 'tiktok', at: '2026-10-04 15:00:00' }],
    }
    const wk = homeTop(f, new Date('2026-10-04T12:00:00Z'))
    const squares = [...wk.matchAll(/<span class="wk-pf" data-pf="([a-z]+)"[^>]*>(.*?)<\/span>/g)]
    expect(squares.map((m) => m[1])).toEqual(['x', 'tiktok'])
    for (const m of squares) expect(m[2], m[1]).toMatch(/^<svg /)
    expect(wk).not.toContain('class="wk-dot"')
    expect(wk).toContain('2 منشور: X · TikTok')
  })
})
