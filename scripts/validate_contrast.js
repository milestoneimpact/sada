#!/usr/bin/env node
/**
 * مدقّقُ التباين — يُشغَّل ولا يُقاس بالعين.
 *
 * وسببُ وجوده أنّ ذهب الهويّة `#d4af37` يقرأ على الداكن ولا يقرأ على
 * الأبيض: نسبتُه هناك ١٫٩:١، أي نصفُ ما تشترطه WCAG. فالثيم النهاريّ
 * يحتاج ذهبا أغمق — **وهذا ما لا تكشفه لقطةُ شاشة**: النصّ يبدو ظاهرا
 * لعينٍ سليمة في ضوءِ غرفة، ويختفي في الشمس أو على شاشةٍ رخيصة.
 *
 * يقرأ الأزواج من `src/routes/ui/tokens.ts` نفسه لا من قائمةٍ منسوخة،
 * فقيمةٌ تتبدّل هناك تُفحص هنا بلا أن يتذكّر أحد.
 */
import { readFileSync } from 'node:fs'

const SOURCE = new URL('../src/routes/ui/tokens.ts', import.meta.url)

/** يستخرج قيَم الرموز من كتلةٍ بعينها في الملفّ. */
function readTokens(css, selector) {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`لم تُوجد الكتلة: ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const block = css.slice(open + 1, close)
  const tokens = {}
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    tokens[match[1]] = match[2]
  }
  return tokens
}

function channel(value) {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex) {
  let value = hex.slice(1)
  if (value.length === 3) value = [...value].map((c) => c + c).join('')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * ما يُفحص، ولمَ هذا الحدّ.
 *
 * `4.5` لنصّ المتن، و `3` لما هو ١٨٫٦٦ بكسلٍ فأكبر أو عريض — وهو ما
 * تسمح به WCAG AA للنصّ الكبير. ولا يُفحص ما ليس نصّا: حدودُ البطاقات
 * وخطوطُ الفصل زينةٌ لا معلومة.
 */
const PAIRS = [
  ['ink', 'surface', 4.5, 'نصّ المتن على البطاقة'],
  ['ink', 'bg', 4.5, 'نصّ المتن على الأرض'],
  ['ink-2', 'surface', 4.5, 'النصّ الثانوي على البطاقة'],
  ['ink-2', 'bg', 4.5, 'النصّ الثانوي على الأرض'],
  ['ink-3', 'surface', 4.5, 'النصّ الخافت على البطاقة'],
  ['ink-3', 'bg', 4.5, 'النصّ الخافت على الأرض'],
  ['ink-3', 'surface-2', 4.5, 'النصّ الخافت على السطح الثاني'],
  ['ink-3', 'surface-3', 4.5, 'النصّ الخافت على السطح الثالث'],
  ['brand', 'surface', 4.5, 'لونُ الهويّة نصّا على البطاقة'],
  ['brand', 'bg', 4.5, 'لونُ الهويّة نصّا على الأرض'],
  ['on-brand', 'brand', 4.5, 'نصّ الزرّ الأساس على لون الهويّة'],
  ['ok', 'surface', 4.5, 'حالةُ «جيّد» على البطاقة'],
  ['warn', 'surface', 4.5, 'حالةُ «تحذير» على البطاقة'],
  ['bad', 'surface', 4.5, 'حالةُ «خطر» على البطاقة'],
  ['ok', 'bg', 4.5, 'حالةُ «جيّد» على الأرض'],
  ['warn', 'bg', 4.5, 'حالةُ «تحذير» على الأرض'],
  ['bad', 'bg', 4.5, 'حالةُ «خطر» على الأرض'],
]

const css = readFileSync(SOURCE, 'utf8')
const THEMES = [
  ['النهاريّ', readTokens(css, '/* THEME:light */\n:root')],
  ['الداكن', readTokens(css, '/* THEME:dark */\n[data-theme="dark"]')],
]

let failures = 0
for (const [name, tokens] of THEMES) {
  console.log(`\n── ${name} ──`)
  for (const [fg, bg, min, label] of PAIRS) {
    const a = tokens[fg]
    const b = tokens[bg]
    if (a === undefined || b === undefined) {
      console.log(`  ✕ رمزٌ مفقود: --${fg} أو --${bg}`)
      failures += 1
      continue
    }
    const value = ratio(a, b)
    const pass = value >= min
    if (!pass) failures += 1
    console.log(
      `  ${pass ? '✓' : '✕'} ${value.toFixed(2)}:1 (≥${min})  ${label}  ${a} / ${b}`,
    )
  }
}

if (failures > 0) {
  console.error(`\n✕ ${failures} زوجا دون الحدّ. لا يُدفع ثيمٌ لا يُقرأ.`)
  process.exit(1)
}
console.log('\n✓ كلّ الأزواج تجتاز WCAG AA في الثيمين.')
