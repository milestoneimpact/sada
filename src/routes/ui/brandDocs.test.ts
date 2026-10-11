/**
 * وثائقُ الهويّة تقول ما تفعله الشيفرة (مراجعة D-196).
 *
 * وجدت المراجعةُ في وثائق D-196 أرقامًا مقيسةً على قاعدةٍ قديمة، ووصفًا للصورة المنشورة غيرَ ما تُخرجه
 * الشيفرة، ونسبةً إلى قرارٍ لم يقِسها، وحجّةً عن اللوحة تكذّبها اللوحة. **وما يُكتب بيدٍ يشيخ صامتًا** —
 * وهي علّةُ `owner.test` نفسُها مع MANUAL-TASKS. فكلُّ ما صُحّح هنا يُقرأ من مصدره ويُقارَن: الرقمُ من
 * الفحص الذي يطبعه، والوصفُ من الملفّ الذي يرسمه، والنسبةُ من القسم الذي قاسها.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OWNER_TASKS } from '../../lib/owner'
import { echo } from './echo'
import { MARK, THEME } from './tokens'

const ROOT = new URL('../../../', import.meta.url)
const read = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8')
/** علامةُ الاتّجاه قبل الأرقام (U+200F) لا تُقرأ — تُمحى قبل المطابقة. */
const plain = (s: string): string => s.replace(/‏/g, '')
/** ما بين عنوانين — من أوّل سطرٍ يطابق `from` إلى أوّل سطرٍ يطابق `to` بعده (أو النهاية). */
function section(text: string, from: RegExp, to?: RegExp): string {
  const start = text.search(from)
  if (start < 0) return ''
  const rest = text.slice(start + 1)
  const end = to === undefined ? -1 : rest.search(to)
  return text.slice(start, end < 0 ? undefined : start + 1 + end)
}

const BRAND = plain(read('docs/BRAND.md'))
const DECISIONS = plain(read('docs/DECISIONS.md'))
const PLAN = plain(read('docs/DESIGN-PLAN.md'))
const TASKS = plain(read('docs/MANUAL-TASKS.md'))
const PREV = section(DECISIONS, /^## D-194 /m, /^## D-196 /m)
const D196 = section(DECISIONS, /^## D-196 /m, /^## D-197 /m)
const M25 = section(TASKS, /^## M-25 /m, /^<a name="m-26">/m)
const M26 = section(TASKS, /^## M-26 /m, /^<a name="m-27">/m)
const TOKENS_HEAD = read('src/routes/ui/tokens.ts').split('const BOARD')[0] ?? ''

/** خرجُ `npm run contrast` نفسُه — الرقمُ الحاكم (`docs/BRAND.md` يقول ذلك في رأسه). */
const CONTRAST = execFileSync(process.execPath, ['scripts/validate_contrast.js'], { cwd: ROOT, encoding: 'utf8' })

describe('وثائقُ D-196 تقول ما تفعله الشيفرة (مراجعة D-196)', () => {
  it('أرقامُ D-196 على قاعدتها: تبدأ حيث انتهى ما قبلها (D-194 · D-195)، ورأسُ BRAND يقول الرقمَين نفسَيهما', () => {
    const before = [...PREV.matchAll(/الاختباراتُ (\d+) ← (\d+)/g)].at(-1)?.[2]
    const mine = /الاختباراتُ (\d+) ← (\d+)/.exec(D196)
    expect(before).toBeDefined()
    expect(mine?.[1]).toBe(before)
    const head = BRAND.split('\n').slice(0, 6).join('\n')
    expect(head).toContain(`${mine?.[2]} اختبارًا`)
    const checks = /✓ (\d+) فحصًا/.exec(CONTRAST)?.[1]
    expect(head).toContain(`(${checks} فحصًا تجتاز)`)
  })

  it('رأسُ خطّة التصميم يقول إنّها حُدّثت في D-196، وخلاصتُها لا تقول إنّ النحاسَ لونُ العلامة اليوم', () => {
    const head = PLAN.split('\n').find((l) => l.startsWith('**التاريخ:**')) ?? ''
    expect(head).toContain('D-196')
    expect(head).toContain('docs/BRAND.md')
    const summary = section(PLAN, /^## الخلاصة في دقيقة/m, /^---$/m)
    const copper = summary.split('\n').filter((l) => /النحاس لونُ العلامة|«الحبر والنحاس»|والنحاس لون/.test(l))
    expect(copper.length).toBeGreaterThan(0)
    for (const line of copper) expect(line).toContain('D-196')
    expect(summary).not.toMatch(/والنحاس لونُ العلامة،/)
  })

  it('M-26 يطلب الاسمَ والقفلين ملفّاتٍ، ونجاحُه يعدّها كلَّها ويفحص أنّ الحروفَ مسارات', () => {
    const item9 = section(M26, /^> 9\. /m, /^>\s*$/m)
    const files = [...item9.matchAll(/`([\w-]+\.svg)`/g)].map((m) => m[1])
    expect(files).toEqual(expect.arrayContaining(['wordmark.svg', 'lockup-horizontal.svg', 'lockup-stacked.svg', 'master.svg']))
    const success = section(M26, /^\*\*٤ · ما يعني النجاح\.\*\*/m, /^\*\*٥ /m)
    expect(success).toContain(`${files.length} ملفَّ SVG`)
    expect(success).toContain('<text')
  })

  it('حجّةُ النعناع تطابق اللوحة: لا «إلّا ضوءًا على العمق» — اللوحةُ تضعه على الفاتح داخل تدرّج', () => {
    for (const [name, text] of [['tokens.ts', TOKENS_HEAD], ['D-196', D196], ['BRAND', BRAND]] as const) {
      expect(text, name).not.toMatch(/لا تضعه إلّا ضوءًا/)
      expect(plain(text), name).toContain('لا تضعه مصمتًا على فاتح')
    }
  })

  it('الظلالُ في خطّة التصميم بقيمها في الرموز، وD-196 يذكر ما تغيّر منها ومن تحذير الليل', () => {
    for (const k of ['--sh-1', '--sh-2', '--sh-3'] as const) expect(PLAN, k).toContain(THEME.light[k])
    const unchanged = D196.split('\n- ').find((b) => b.startsWith('**ولم يتغيّر**')) ?? ''
    expect(unchanged).not.toMatch(/ونصفُ القطر والظلالُ الثلاثة/)
    expect(unchanged).toContain('`rgba(16,24,40)` ← `rgba(11,40,42)`')
    expect(unchanged).toContain(`\`#f08a3c\` ← \`${THEME.dark['--warn']}\``)
  })

  it('M-25 يصف الصورتين كما تُرسَمان: الإنفوجرافيكُ كحليٌّ بلا Cairo، والشريحةُ زمرّدٌ بـ Cairo', () => {
    const info = read('src/lib/image/infographic.ts')
    expect(info).toContain('background:#0c121c')
    expect(info).not.toMatch(/Cairo/)
    const item1 = section(M25, /^\*\*١ · ما هي\.\*\*/m, /^\*\*٢ /m)
    expect(item1).toContain('#0c121c')
    expect(item1).toMatch(/Beiruti/)
    const row = TASKS.split('\n').find((l) => l.startsWith('| **M-25**')) ?? ''
    const ifLeft = OWNER_TASKS.find((t) => t.code === 'M-25')?.ifLeft ?? ''
    for (const [name, text] of [['الجدول', row], ['owner.ts', ifLeft], ['BRAND §11', BRAND.split('\n').find((l) => l.includes('[**M-25**]')) ?? '']] as const) {
      expect(text, name).toContain('الإنفوجرافيك')
      expect(text, name).toContain('كحليًّا')
      expect(text, name).not.toMatch(/الصورُ? ?المنشورةُ? تبقى زمرّديّةً/)
    }
  })

  it('‏7.4٪ منسوبةٌ إلى خطّة التصميم التي قاستها، لا إلى D-185', () => {
    expect(PLAN).toContain('مسافة الكلمة 4.36px بدل 1.98px، والسطر أعرض 7.4%')
    for (const [name, text] of [['D-196', D196], ['BRAND', BRAND]] as const) {
      expect(text, name).not.toMatch(/قيس في D-185/)
      expect(text, name).toContain('4.36px بدل 1.98px')
    }
  })

  it('خيطا الصورة المنشورة كما في العيّنتين: النقشُ العميقُ يرسم خيطَه، فالخيطُ تحت الفوقيّة ليس وحده', () => {
    expect(echo({ width: 1200, height: 628, tone: 'deep' })).toContain(`stroke="${THEME.dark['--au']}"`)
    const item1 = section(M25, /^\*\*١ · ما هي\.\*\*/m, /^\*\*٢ /m)
    expect(item1).not.toMatch(/خيطُ ذهبٍ واحد/)
    expect(item1).toContain('الخيطان')
    const thread = BRAND.split('\n').find((l) => l.startsWith('| الخيط |')) ?? ''
    expect(thread).toContain('خيطُ النقش')
  })

  it('القاعدة ٧ بسببٍ مقيس، والقاعدة ١٧ تذكر كلَّ زوجٍ مطبوعٍ دون ‏5 عند عمى الأحمر أو الأخضر', () => {
    const rule7 = BRAND.split('\n').find((l) => l.startsWith('7. ')) ?? ''
    expect(rule7).not.toMatch(/4\.67:1، يمرّ مؤشّرًا لا نصًّا\)/)
    expect(rule7).toContain('Lc 62.9 دون 75')
    const rule17 = BRAND.split('\n').find((l) => l.startsWith('17. ')) ?? ''
    // ‏الأزواجُ المطبوعةُ بلا حدٍّ («· p · d · t  الاسم») في النهاريّ والداكن — والطباعةُ قيمُ النهار
    for (const mode of ['النهاريّ', 'الداكن']) {
      const block = section(CONTRAST, new RegExp(`^── ${mode} ──`, 'm'), /^── /m)
      for (const [, p = '', d = '', , label = ''] of block.matchAll(/^\s+· ([\d.]+) · ([\d.]+) · ([\d.]+)\s+(.+)$/gm)) {
        for (const v of [p, d].filter((x) => Number(x) < 5)) expect(rule17, `${mode}: ${label} ${v}`).toContain(v)
      }
    }
    // ‏والمحدودُ ثلاثةُ أزواج الحال، لا «جيّد» و«خطر» وحدهما
    expect(CONTRAST.match(/نقاطُ الرافدة/g)?.length).toBe(9)
  })

  it('شرحُ «.glyph» بلون العلامة اليوم ونسبتِه المحسوبة، وميزانيّةُ الذهب باسمها', () => {
    const styles = read('src/routes/ui/styles.ts')
    const lum = (hex: string): number => {
      const v = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!
    }
    const ratio = (lum(MARK['--mark-bg']) + 0.05) / (lum(THEME.dark['--bg']) + 0.05)
    const arabic = ratio.toFixed(2).replace('.', '٫').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!)
    const comment = styles.slice(0, styles.indexOf('.glyph{display:grid')).split('/*').at(-1) ?? ''
    expect(comment).toContain(`${arabic}:١`)
    expect(comment).not.toMatch(/حبرٌ ونحاسٌ ثابتان في الوضعين \(D-144\) — ولا/)
    expect(styles).toContain('ميزانيّةُ الذهب')
    expect(styles).not.toContain('ميزانيّةُ النحاس')
  })
})
